const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = require("./sources");
const api = require("../../scripts/api.js");
const lib = require("../../out/api.js");

const map = JSON.parse(fs.readFileSync(path.join(src.root, "media", "api.json"), "utf8"));
const docs = JSON.parse(fs.readFileSync(path.join(src.root, "media", "hover.json"), "utf8"));

test("api list has every new language with functions and constants", () => {
  assert.deepStrictEqual(Object.keys(map.langs).sort(), ["go", "godot", "lua", "node", "rust", "zig"]);
  for (const [lang, list] of Object.entries(map.langs)) {
    assert.ok(list.filter((e) => e.k === "fn").length > 150, lang + " has too few functions");
    assert.ok(list.filter((e) => e.k === "const").length > 20, lang + " has too few constants");
    for (const e of list) {
      assert.ok(e.n && e.o && e.s, lang + " " + JSON.stringify(e));
      assert.ok(["fn", "const", "prop"].includes(e.k));
      if (e.c) assert.ok(docs.functions[e.c], lang + " " + e.n + " links " + e.c);
    }
  }
});

test("every language knows its button, slider and window", () => {
  const want = { rust: "fn button(&mut self, label: &str) -> bool", node: "button(label: string): boolean", go: "func (u *UI) Button(label string) bool", zig: "fn button(s: [*:0]const u8) bool", lua: "ui:button(...)", godot: "func button(label: String) -> bool" };
  for (const [lang, sig] of Object.entries(want)) {
    const list = map.langs[lang];
    const names = (n) => list.filter((e) => e.n.toLowerCase() === n);
    assert.ok(names("button").some((e) => e.s === sig), lang + " button " + JSON.stringify(names("button")));
    assert.ok(names("slider").length && names("window").length, lang);
  }
  assert.match(map.langs.godot.find((e) => e.n === "slider").s, /value: float, min: float = 0, max: float = 1, format: String = ""\) -> float$/);
  assert.match(map.langs.lua.find((e) => e.n === "app" && e.o === "goome").s, /^goome\.app\(title, width, height, opts\)$/);
  assert.ok(map.langs.godot.some((e) => e.n === "WIN_MOVE" && e.k === "const"));
  assert.ok(map.langs.node.some((e) => e.n === "WIN_MOVE"));
});

test("api list matches the binding sources when theyre next to this repo", (t) => {
  let checked = 0;
  for (const lang of api.LANGS) {
    const dir = api.findRepo(src.root, lang);
    if (!dir) continue;
    const fresh = api.extract(lang, dir);
    assert.deepStrictEqual(fresh.map((e) => e.k + e.o + e.n).sort(), map.langs[lang].map((e) => e.k + e.o + e.n).sort(), lang);
    checked++;
  }
  if (!checked) t.skip("no bindings next to this repo");
});

test("rust parser reads impls, traits and constants", () => {
  const dir = path.join(src.root, "scratch-rust-test");
  fs.mkdirSync(path.join(dir, "goome", "src"), { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, "goome", "src", "ui.rs"), [
      "pub struct Ui {}",
      "impl Ui {",
      "    pub fn button(&mut self, label: &str) -> bool {",
      "        true",
      "    }",
      "    fn hidden(&self) {}",
      "}",
      "impl Drop for Ui {",
      "    fn drop(&mut self) {}",
      "}",
      "pub trait Draw {",
      "    fn text(&mut self, x: f64, y: f64, s: &str, color: u32);",
      "}",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "goome", "src", "consts.rs"), "pub const WIN_MOVE: i32 = sys::GOOME_WIN_MOVE;\n");
    const got = api.rust(dir).map((e) => e.o + "." + e.n + "=" + e.s);
    assert.deepStrictEqual(got.sort(), ["Draw.text=fn text(&mut self, x: f64, y: f64, s: &str, color: u32)", "Ui.button=fn button(&mut self, label: &str) -> bool", "goome.WIN_MOVE=WIN_MOVE: i32"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hover finds a method by its receiver and ignores unrelated words", () => {
  const at = (line, col) => lib.accessAt(line, col);
  assert.deepStrictEqual(at("  if ui.button(\"hi\") {", 9), { receiver: "ui", member: "button" });
  assert.deepStrictEqual(at("let g = goome::open(opts)", 17), { receiver: "goome", member: "open" });
  assert.deepStrictEqual(at("ui:slider(\"v\", 1)", 5), { receiver: "ui", member: "slider" });
  assert.strictEqual(at("button = 1", 2).receiver, "");
  assert.strictEqual(lib.receiverBefore("  ui.", 5), "ui");
  assert.strictEqual(lib.receiverBefore("  ui.but", 8), "ui");
  assert.strictEqual(lib.receiverBefore("  ui", 4), undefined);
  const found = lib.entriesFor(map, "go", { receiver: "ui", member: "Button" });
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].o, "UI");
  assert.deepStrictEqual(lib.entriesFor(map, "go", { receiver: "wibble", member: "Button" }), []);
  assert.ok(lib.entriesFor(map, "godot", { receiver: "GoomeUI", member: "WIN_MOVE" }).length);
  assert.ok(lib.entriesFor(map, "lua", { receiver: "goome", member: "open" }).length);
});

test("completion lists the receivers own names and nothing from other lists", () => {
  const ui = lib.completionsFor(map, "rust", "ui").map((e) => e.n);
  assert.ok(ui.includes("button") && ui.includes("slider"));
  assert.ok(!ui.includes("open"), "ui. offers open");
  const mod = lib.completionsFor(map, "node", "goome").map((e) => e.n);
  assert.ok(mod.includes("WIN_MOVE") && mod.includes("measure"));
  assert.deepStrictEqual(lib.completionsFor(map, "node", "arr"), []);
  const gd = lib.completionsFor(map, "godot", "GoomeUI").map((e) => e.n);
  assert.ok(gd.includes("WIN_MOVE"));
});

test("hover text has the signature, the goome.h note and a docs link", () => {
  const lang = lib.API_LANGS.find((l) => l.id === "lua");
  const e = lib.entriesFor(map, "lua", { receiver: "ui", member: "slider" });
  const text = lib.hoverMarkdown(e, docs, lang);
  assert.match(text, /```lua\nui:slider\(\.\.\.\)\n```/);
  assert.match(text, /wraps the C function/);
  assert.match(text, /goome_ui_slider/);
  assert.match(text, /\(https:\/\/goome\.wtf\/docs\/[^)]*\)$/);
  assert.strictEqual(lib.apiLang("typescriptreact").id, "node");
  assert.strictEqual(lib.apiLang("gdscript").id, "godot");
  assert.strictEqual(lib.apiLang("python"), undefined);
  assert.ok(lib.mentionsGoome("require('goome')") && !lib.mentionsGoome("require('fs')"));
});
