const fs = require("fs");
const path = require("path");

const LANGS = ["rust", "node", "go", "zig", "lua", "godot"];
const REPOS = { rust: "rust-goome", node: "node-goome", go: "go-goome", zig: "zig-goome", lua: "lua-goome", godot: "godot-goome" };

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function fn(n, o, s) {
  return { n, o, s, k: "fn" };
}

function prop(n, o, s) {
  return { n, o, s, k: "prop" };
}

function constant(n, o, s) {
  return { n, o, s: s || n, k: "const" };
}

function rust(dir) {
  const out = [];
  const src = path.join(dir, "goome", "src");
  if (!fs.existsSync(src)) return out;
  for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".rs")).sort()) {
    const text = read(path.join(src, f));
    if (f === "consts.rs") {
      for (const m of text.matchAll(/^pub const (\w+): (\w+)/gm)) out.push(constant(m[1], "goome", m[1] + ": " + m[2]));
      continue;
    }
    let owner = "goome";
    let skip = false;
    for (const raw of text.split(/\r?\n/)) {
      let m = /^(?:pub )?(?:trait|struct) (\w+)/.exec(raw);
      if (m) {
        owner = m[1];
        skip = false;
      }
      m = /^impl(?:<[^>]*>)?\s+(?:(\w+)(?:<[^>]*>)?\s+for\s+)?(\w+)/.exec(raw);
      if (m) {
        owner = m[2];
        skip = !!m[1] && !["Draw"].includes(m[1]);
        if (m[1] === "Draw") owner = "Draw";
      }
      if (/^\S/.test(raw) && !/^impl|^pub (trait|struct)|^[}\]\)]/.test(raw)) {
        owner = "goome";
        skip = false;
      }
      m = /^( {0,4})(pub )?fn (\w+)(<[^>]*>)?\((.*?)\)(?:\s*->\s*(.+?))?\s*(?:\{|;|where.*)?$/.exec(raw);
      if (!m) continue;
      const inTrait = m[1].length === 4 && !m[2];
      const topLevel = m[1].length === 0;
      if (skip) continue;
      if (!m[2] && !inTrait) continue;
      if (inTrait && owner !== "Draw") continue;
      if (topLevel && !m[2]) continue;
      const args = m[5].trim();
      const ret = m[6] ? " -> " + m[6].replace(/\s*\{$/, "").trim() : "";
      out.push(fn(m[3], topLevel ? "goome" : owner, "fn " + m[3] + (m[4] || "") + "(" + args + ")" + ret));
    }
  }
  return out;
}

function node(dir) {
  const out = [];
  const text = read(path.join(dir, "index.d.ts"));
  const consts = read(path.join(dir, "lib", "consts.d.ts"));
  for (const m of consts.matchAll(/^export declare const (\w+): (\w+)/gm)) out.push(constant(m[1], "goome", m[1] + ": " + m[2]));
  let owner = "";
  for (const raw of text.split(/\r?\n/)) {
    let m = /^export declare (?:abstract )?class (\w+)/.exec(raw) || /^export interface (\w+)/.exec(raw);
    if (m) {
      owner = /^export interface/.test(raw) ? "" : m[1];
      continue;
    }
    if (/^}/.test(raw)) {
      owner = "";
      continue;
    }
    m = /^export declare function (\w+)(<[^>]*>)?\((.*)\):\s*(.+?);$/.exec(raw);
    if (m) {
      out.push(fn(m[1], "goome", "function " + m[1] + (m[2] || "") + "(" + m[3] + "): " + m[4]));
      continue;
    }
    m = /^export declare const (\w+): (.+?);$/.exec(raw);
    if (m && !consts.includes("const " + m[1] + ":")) {
      out.push(constant(m[1], "goome", m[1] + ": " + m[2]));
      continue;
    }
    if (!owner) continue;
    m = /^  (static )?(?:readonly )?(\w+)(\??)(<[^>]*>)?\((.*)\):\s*(.+?);$/.exec(raw);
    if (m) {
      out.push(fn(m[2], owner, (m[1] || "") + m[2] + (m[3] || "") + (m[4] || "") + "(" + m[5] + "): " + m[6]));
      continue;
    }
    m = /^  (static )?(readonly )?(\w+)(\??): (.+?);$/.exec(raw);
    if (m && !/^(constructor)$/.test(m[3])) {
      out.push(prop(m[3], owner, (m[1] || "") + (m[2] || "") + m[3] + m[4] + ": " + m[5]));
      continue;
    }
    m = /^  constructor\((.*)\);$/.exec(raw);
    if (m) out.push(fn("constructor", owner, "new " + owner + "(" + m[1] + ")"));
  }
  return out;
}

function go(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".go") && !f.endsWith("_test.go")).sort()) {
    const text = read(path.join(dir, f));
    let inConst = false;
    for (const raw of text.split(/\r?\n/)) {
      if (/^const \($/.test(raw)) {
        inConst = true;
        continue;
      }
      if (inConst && /^\)/.test(raw)) {
        inConst = false;
        continue;
      }
      let m;
      if (inConst && (m = /^\t([A-Z]\w*)\b/.exec(raw))) {
        out.push(constant(m[1], "goome"));
        continue;
      }
      if ((m = /^const ([A-Z]\w*)\b/.exec(raw))) {
        out.push(constant(m[1], "goome"));
        continue;
      }
      m = /^func (?:\((\w+) \*?(\w+)\) )?([A-Z]\w*)(\[[^\]]*\])?\((.*?)\)\s*(.*?)\s*\{.*$/.exec(raw);
      if (!m) continue;
      const ret = m[6].replace(/\s*\{.*$/, "").trim();
      out.push(fn(m[3], m[2] || "goome", "func " + (m[2] ? "(" + m[1] + " *" + m[2] + ") " : "") + m[3] + "(" + m[5] + ")" + (ret ? " " + ret : "")));
    }
  }
  return out;
}

function zig(dir) {
  const out = [];
  const text = read(path.join(dir, "src", "goome.zig"));
  let owner = "";
  let kind = "";
  for (const raw of text.split(/\r?\n/)) {
    let m = /^pub const (\w+) = (?:extern |packed )?(struct|enum|union|opaque)\b/.exec(raw);
    if (m && /;\s*$/.test(raw)) continue;
    if (m) {
      owner = m[1];
      kind = m[2];
      continue;
    }
    if (/^};/.test(raw)) {
      owner = "";
      kind = "";
      continue;
    }
    m = /^( {0,4})pub fn (\w+)\((.*)\)\s*(.*?)\s*\{.*$/.exec(raw);
    if (m && (m[1].length === 4) === !!owner) {
      const self = new RegExp("^\\w+: \\*?(?:const )?" + owner + "\\b,?\\s*");
      const args = owner && self.test(m[3]) ? m[3].replace(self, "") : m[3];
      out.push(fn(m[2], owner || "goome", "fn " + m[2] + "(" + args + ") " + m[4]));
      continue;
    }
    if (/^pub const c = @cImport/.test(raw)) out.push(constant("c", "goome", "c: @cImport of goome.h"));
    m = /^    pub const (\w+) = (.+);$/.exec(raw);
    if (m && owner && kind === "struct" && !/struct|enum|union|@/.test(m[2])) out.push(constant(m[1], owner, owner + "." + m[1]));
    m = /^pub const (\w+) = (.+);$/.exec(raw);
    if (m && !/struct|enum|union|@cImport|error\{/.test(m[2]) && /^[a-z]/.test(m[1]) === false) out.push(constant(m[1], "goome", m[1]));
  }
  return out;
}

const LUA_CLASS = { g: "g", cv: "canvas", im: "image", pix: "pixels", bmp: "bitmap", font: "font", ui: "ui", th: "theme", cfg: "config", pacer: "pacer" };

function lua(dir) {
  const out = [];
  const text = read(path.join(dir, "src", "lgoome.c"));
  for (const m of text.matchAll(/static const luaL_Reg (\w+?)_(methods|funcs)\[\] = \{([\s\S]*?)\n\};/g)) {
    const owner = m[2] === "funcs" ? "goome" : LUA_CLASS[m[1]];
    if (!owner) continue;
    for (const e of m[3].matchAll(/\{"(\w+)",\s*\w+\}/g)) {
      if (e[1].startsWith("_")) continue;
      out.push(fn(e[1], owner, (m[2] === "funcs" ? "goome." : owner + ":") + e[1] + "(...)"));
    }
  }
  const embedded = text.slice(text.indexOf("static const char lg_app_lua[]"));
  for (const m of embedded.matchAll(/"function (goome\.|App:)(\w+)\(([^)]*)\)/g)) {
    const isApp = m[1] === "App:";
    const sig = isApp ? "app:" + m[2] + "(" + m[3] + ")" : "goome." + m[2] + "(" + m[3] + ")";
    const at = out.findIndex((x) => x.n === m[2] && x.o === (isApp ? "app" : "goome"));
    if (at >= 0) out.splice(at, 1);
    out.push(fn(m[2], isApp ? "app" : "goome", sig));
  }
  const consts = read(path.join(dir, "src", "consts.h"));
  for (const m of consts.matchAll(/^\{"(\w+)",/gm)) out.push(constant(m[1], "goome", "goome." + m[1]));
  return out;
}

const GD_TYPE = { T_VOID: "void", T_BOOL: "bool", T_INT: "int", T_FLOAT: "float", T_STRING: "String", T_VEC2: "Vector2", T_VEC2I: "Vector2i", T_RECT2: "Rect2", T_RECT2I: "Rect2i", T_COLOR: "Color", T_VEC4: "Vector4", T_XFORM2: "Transform2D", T_DICT: "Dictionary", T_ARRAY: "Array", T_BYTES: "PackedByteArray", T_FLOATS: "PackedFloat32Array", T_DOUBLES: "PackedFloat64Array", T_STRINGS: "PackedStringArray", T_VEC2S: "PackedVector2Array", T_SN: "StringName", T_OBJECT: "Object", T_NIL: "Variant" };
const GD_SHORT = { STR: "T_STRING", INT: "T_INT", FLT: "T_FLOAT", BOOL: "T_BOOL" };

function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "{") depth++;
    if (ch === ")" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function gdArg(a) {
  let m = /^(STR|INT|FLT|BOOL)D?\("(\w+)"(?:,\s*"([^"]*)")?\)$/.exec(a);
  if (m) {
    const t = GD_TYPE[GD_SHORT[m[1]]];
    const withDefault = /^\w+D\(/.test(a);
    return m[2] + ": " + t + (withDefault ? " = " + (m[1] === "STR" ? JSON.stringify(m[3]) : m[3]) : "");
  }
  m = /^ARGD?\("(\w+)",\s*(T_\w+)(?:,\s*"([^"]*)")?\)$/.exec(a);
  if (m) {
    const t = GD_TYPE[m[2]] || "Variant";
    const d = m[3] !== undefined && /,/.test(m[3]) && /^(Rect2|Vector2)/.test(t) ? t + "(" + m[3] + ")" : m[3];
    return m[1] + ": " + t + (/^ARGD/.test(a) ? " = " + d : "");
  }
  m = /^\{"(\w+)",\s*(T_\w+),\s*(NULL|"[^"]*")/.exec(a);
  if (m) return m[1] + ": " + (GD_TYPE[m[2]] || "Variant") + (m[3] === "NULL" ? "" : " = " + m[3].replace(/^"|"$/g, ""));
  return null;
}

function godot(dir) {
  const out = [];
  const src = path.join(dir, "src");
  for (const [file, owner, mac] of [["ui.c", "GoomeUI", "M"], ["view.c", "GoomeView", "VM"]]) {
    const text = read(path.join(src, file));
    const re = new RegExp("^\\s*" + mac + "(0?)\\(\"(\\w+)\",\\s*\\w+,\\s*(T_\\w+)(?:,\\s*(.*))?\\),?\\s*$", "gm");
    for (const m of text.matchAll(re)) {
      const args = splitArgs(m[4] || "").map(gdArg);
      if (args.some((a) => a === null)) continue;
      out.push(fn(m[2], owner, "func " + m[2] + "(" + args.join(", ") + ") -> " + (GD_TYPE[m[3]] || "Variant")));
    }
    const obj = new RegExp("^\\s*" + mac + "O\\(\"(\\w+)\",\\s*\\w+,\\s*\"(\\w+)\"", "gm");
    for (const m of text.matchAll(obj)) out.push(fn(m[1], owner, "func " + m[1] + "() -> " + m[2]));
    for (const m of text.matchAll(/^\s*\{GOOME_\w+,\s*"(\w+)",\s*"(\w+)"\}/gm)) out.push(constant(m[1], owner, owner + "." + m[1]));
  }
  return out;
}

const EXTRACT = { rust, node, go, zig, lua, godot };

function unique(list) {
  const seen = new Set();
  return list.filter((e) => {
    const key = e.k + "|" + e.o + "|" + e.n;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extract(lang, dir) {
  return unique(EXTRACT[lang](dir));
}

function snake(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase();
}

function cName(entry, functions) {
  if (entry.k !== "fn") return undefined;
  const s = snake(entry.n);
  const uiOwner = /^(ui|Ui|UI|GoomeUI|UiFrame|Scope)$/.test(entry.o);
  const tries = uiOwner ? ["goome_ui_" + s, "goome_" + s] : ["goome_" + s, "goome_ui_" + s];
  return tries.find((t) => functions[t]);
}

function findRepo(root, lang) {
  const env = process.env["GOOME_" + lang.toUpperCase()];
  const tries = [env && path.resolve(env), path.join(root, "..", REPOS[lang]), path.join(root, "deps", REPOS[lang])];
  return tries.find((p) => p && fs.existsSync(p)) || null;
}

function build(root, functions) {
  const out = {};
  for (const lang of LANGS) {
    const dir = findRepo(root, lang);
    if (!dir) continue;
    const list = extract(lang, dir);
    for (const e of list) {
      const c = cName(e, functions);
      if (c) e.c = c;
    }
    out[lang] = list;
  }
  return out;
}

module.exports = { LANGS, REPOS, extract, build, findRepo, snake, cName, rust, node, go, zig, lua, godot };
