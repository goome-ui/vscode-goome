const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = require("./sources");
const api = require("../../scripts/api.js");

const FILES = { c: "c.json", cs: "csharp.json", py: "python.json", java: "java.json", rust: "rust.json", node: "node.json", go: "go.json", zig: "zig.json", lua: "lua.json", godot: "godot.json" };
const GODOT_SKIPS = ["goome-offscreen"];
const MUST = ["goome-overlay", "goome-app", "goome-loop", "goome-window", "goome-label", "goome-heading", "goome-button", "goome-checkbox", "goome-toggle", "goome-radio",
  "goome-slider", "goome-slider-int", "goome-input", "goome-combo", "goome-selectable", "goome-tabs", "goome-collapsing", "goome-tree", "goome-progress", "goome-color",
  "goome-tooltip", "goome-separator", "goome-same-line", "goome-row", "goome-scroll", "goome-split", "goome-menubar", "goome-popup", "goome-modal", "goome-toast",
  "goome-text-edit", "goome-table", "goome-style", "goome-custom", "goome-offscreen", "goome-hotkey", "goome-theme-preset", "goome-theme-make"];

const load = (k) => JSON.parse(fs.readFileSync(path.join(src.root, "snippets", FILES[k]), "utf8"));
const all = Object.fromEntries(Object.keys(FILES).map((k) => [k, load(k)]));
const texts = (k) => Object.values(all[k]).map((s) => [s.prefix, src.expand(s.body)]);

test("every snippet file is valid and uses goome prefixes", () => {
  for (const [k, snips] of Object.entries(all)) {
    const seen = new Set();
    for (const [name, s] of Object.entries(snips)) {
      assert.ok(typeof s.prefix === "string" && s.prefix.startsWith("goome"), k + " " + name + " prefix");
      assert.ok(!seen.has(s.prefix), k + " has " + s.prefix + " twice");
      seen.add(s.prefix);
      assert.ok(Array.isArray(s.body) && s.body.length && s.body.every((l) => typeof l === "string"), k + " " + name + " body");
      assert.ok(typeof s.description === "string" && s.description.length, k + " " + name + " description");
      const opens = s.body.join("\n").split("${").length - 1;
      const closes = (s.body.join("\n").match(/\$\{\d+(:[^${}]*|\|[^|}]*\|)\}/g) || []).length;
      assert.ok(opens >= closes, k + " " + name + " placeholders");
    }
  }
});

test("every language has the common patterns", () => {
  for (const [k, snips] of Object.entries(all)) {
    const have = new Set(Object.values(snips).map((s) => s.prefix));
    for (const p of MUST) if (k !== "godot" || !GODOT_SKIPS.includes(p)) assert.ok(have.has(p), k + " is missing " + p);
  }
  assert.ok(new Set(Object.values(all.godot).map((s) => s.prefix)).has("goome-view"));
  const c = new Set(Object.values(all.c).map((s) => s.prefix));
  for (const k of Object.keys(FILES).filter((k) => k !== "c")) for (const p of Object.values(all[k]).map((s) => s.prefix)) if (p !== "goome-style-push" && !(k === "godot" && ["goome-view"].includes(p))) assert.ok(c.has(p), p + " in " + k + " but not in c");
});

test("placeholders expand to plain code", () => {
  for (const k of Object.keys(FILES)) for (const [p, list] of texts(k)) for (const t of list) assert.ok(!/\$\{|\$\d/.test(t.replace(/\$\{?0\}?/g, "")), k + " " + p + " left a placeholder: " + t);
});

test("c snippets only call functions that are in goome.h", () => {
  const hover = JSON.parse(fs.readFileSync(path.join(src.root, "media", "hover.json"), "utf8")).functions;
  const header = src.cHeader();
  for (const [p, list] of texts("c")) for (const t of list) {
    for (const m of t.matchAll(/\b(goome_\w+)\s*\(/g)) assert.ok(hover[m[1]], p + " calls " + m[1] + " which isnt in goome.h");
    if (header) for (const m of t.matchAll(/\b(GOOME_[A-Z0-9_]+)\b/g)) if (m[1] !== "GOOME_IMPLEMENTATION") assert.ok(new RegExp("\\b" + m[1] + "\\b").test(header), p + " uses " + m[1]);
  }
});

function names(t, receivers) {
  const out = [];
  const re = new RegExp("\\b(?:" + receivers.join("|") + ")\\.([A-Za-z_]\\w*)(\\s*\\()?", "g");
  for (const m of t.matchAll(re)) out.push([m[1], !!m[2]]);
  for (const m of t.matchAll(/\)\??\.([A-Za-z_]\w*)(\s*\()?/g)) out.push([m[1], !!m[2]]);
  return out;
}

test("python snippets use real python-goome names", (t) => {
  const code = src.python();
  if (!code) return t.skip("no python-goome next to this repo");
  for (const [p, list] of texts("py")) for (const text of list) for (const [n, call] of names(text, ["ui", "g", "goome", "c", "it", "ev", "panes", "pace", "t", "theme"])) {
    if (["value", "shown", "column", "row", "next", "sort"].includes(n) && /\b(t|panes)\./.test(text)) continue;
    const ok = call ? new RegExp("(def|class) " + n + "\\b|^" + n + " = ", "m").test(code) : new RegExp("\\b" + n + "\\b").test(code);
    assert.ok(ok, p + " uses ." + n + " which isnt in python-goome");
  }
});

test("c# snippets use real GoomeSharp names", (t) => {
  const code = src.csharp();
  if (!code) return t.skip("no csharp-goome next to this repo");
  for (const [p, list] of texts("cs")) for (const text of list) for (const [n] of names(text, ["ui", "g", "c", "it", "ev", "pace", "Goome", "Event", "Theme", "Style", "Preset", "WindowFlags", "ItemFlags", "EventType", "EditFlags", "TableFlags", "Ease", "Role", "Font", "TextDirection"])) {
    if (["Message", "ToString", "Error", "WriteLine"].includes(n)) continue;
    assert.ok(new RegExp("(public[^\\n]*\\b" + n + "\\b|^\\s*" + n + "\\b\\s*(=|,|$))", "m").test(code), p + " uses ." + n + " which isnt in GoomeSharp");
  }
});

test("java snippets use real java-goome names", (t) => {
  const code = src.java();
  if (!code) return t.skip("no java-goome next to this repo");
  for (const [p, list] of texts("java")) for (const text of list) for (const [n] of names(text, ["ui", "g", "c", "it", "ev", "e", "pace", "sort", "Goome", "Ui", "Theme", "ItemFlag", "Style", "Font", "A11yNode"])) {
    if (["getMessage", "println", "err", "put", "get"].includes(n)) continue;
    assert.ok(new RegExp("(public[^\\n]*\\b" + n + "\\b|^\\s*" + n + "\\b\\s*[(,;=]|\\b" + n + "\\(\\d+\\)|\\b(boolean|double|int|String) " + n + "\\s*[,)]|\\b" + n + " = -?\\d)", "m").test(code), p + " uses ." + n + " which isnt in java-goome");
  }
});

const RECEIVERS = ["ui", "u", "g", "c", "cv", "goome", "GoomeUI", "pace", "app", "win", "Options", "Goome", "WindowState"];
const BINDING_SOURCES = {
  rust: (d) => src.readTree(path.join(d, "goome", "src"), ".rs"),
  node: (d) => fs.readFileSync(path.join(d, "index.d.ts"), "utf8") + src.readTree(path.join(d, "lib"), ".ts"),
  go: (d) => src.readTree(d, ".go"),
  zig: (d) => src.readTree(path.join(d, "src"), ".zig"),
  lua: (d) => src.readTree(path.join(d, "src"), ".c") + src.readTree(path.join(d, "src"), ".h"),
  godot: (d) => src.readTree(path.join(d, "src"), ".c"),
};

for (const lang of Object.keys(BINDING_SOURCES)) {
  test(lang + " snippets only use names the " + lang + " binding really has", (t) => {
    const dir = api.findRepo(src.root, lang);
    if (!dir) return t.skip("no " + lang + "-goome next to this repo");
    const list = api.extract(lang, dir);
    const known = new Set(list.flatMap((e) => [e.n, e.o]));
    const code = BINDING_SOURCES[lang](dir);
    const re = new RegExp("\\b(?:" + RECEIVERS.join("|") + ")(?:\\.|::|:)([A-Za-z_]\\w*)", "g");
    for (const [p, snips] of texts(lang)) for (const text of snips) for (const m of text.matchAll(re)) {
      const n = m[1];
      const ok = known.has(n) || (/^[A-Z]/.test(n) && new RegExp("\\b" + n + "\\b").test(code));
      assert.ok(ok, p + " uses " + n + " which isnt in " + lang + "-goome");
    }
  });
}

test("snippets for the new languages have no comments and no leftover placeholders", () => {
  for (const k of ["rust", "node", "go", "zig", "lua", "godot"]) for (const [p, list] of texts(k)) for (const t of list) {
    for (const line of t.split("\n")) {
      const trimmed = line.trim();
      assert.ok(!(trimmed.startsWith("//") || trimmed.startsWith("--") || trimmed.startsWith("#") || trimmed.startsWith("/*")), k + " " + p + " has a comment: " + trimmed);
    }
  }
});
