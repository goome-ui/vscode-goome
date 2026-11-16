const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = require("./sources");
const { parseHeader } = require("../../scripts/sync.js");

const map = JSON.parse(fs.readFileSync(path.join(src.root, "media", "hover.json"), "utf8"));

test("hover map has every goome function with a signature and a docs link", () => {
  const names = Object.keys(map.functions);
  assert.ok(names.length > 150, "only " + names.length + " functions");
  for (const n of names) {
    const f = map.functions[n];
    assert.match(n, /^goome_\w+$/);
    assert.ok(f.sig.includes(n + "("), n + " sig " + f.sig);
    assert.ok(f.sig.endsWith(");"), n + " sig " + f.sig);
    assert.ok(f.url.startsWith("https://goome-ui.github.io/docs/"), n + " url " + f.url);
    assert.strictEqual(typeof f.note, "string");
  }
  for (const n of ["goome_open", "goome_open_app", "goome_poll", "goome_pace", "goome_ui_new", "goome_ui_window", "goome_ui_button", "goome_ui_custom", "goome_ui_theme_preset", "goome_frame"]) assert.ok(map.functions[n], n);
  assert.match(map.functions.goome_ui_custom.note, /DRAG_X/);
  assert.match(map.functions.goome_ui_button.url, /api-ui\/#goome_ui_button$/);
});

test("hover map matches goome.h when its next to this repo", (t) => {
  const h = src.cHeader();
  if (!h) return t.skip("no c-goome next to this repo");
  const fresh = parseHeader(h);
  assert.deepStrictEqual(Object.keys(fresh).sort(), Object.keys(map.functions).sort());
  for (const n of Object.keys(fresh)) assert.strictEqual(fresh[n].note, map.functions[n].note, n);
});

test("header parser reads the one line notes", () => {
  const got = parseHeader([
    "int goome_ui_button(goome_ui *u, const char *label);",
    "goome *goome_open_app(const char *title, int w, int h, int *err); // a normal resizable window, centered",
    "typedef struct goome goome;",
    "// int goome_fake(void);",
    "#define GOOME_VERSION \"0.4.0\"",
  ].join("\n"));
  assert.deepStrictEqual(Object.keys(got), ["goome_ui_button", "goome_open_app"]);
  assert.strictEqual(got.goome_open_app.note, "a normal resizable window, centered");
  assert.strictEqual(got.goome_open_app.sig, "goome *goome_open_app(const char *title, int w, int h, int *err);");
  assert.strictEqual(got.goome_ui_button.note, "");
});

test("the bundled builder codegen turns the demo project into code", () => {
  const dir = path.join(src.root, "media", "builder");
  const GM = require(path.join(dir, "model.js"));
  const X = require(path.join(dir, "codegen.js"));
  const demo = JSON.parse(fs.readFileSync(path.join(src.root, "test", "fixtures", "demo.goome.json"), "utf8"));
  const want = { c: "goome_ui_window(", cs: "ui.Window(", py: "ui.window(", java: "ui.window(", gd: "ui.window(" };
  for (const [lang, bit] of Object.entries(want)) {
    const r = X.generate(GM.normProject(demo), lang);
    assert.ok(r.code.includes(bit), lang + " code has no " + bit);
    assert.ok(r.code.includes("demo window"), lang);
  }
});

test("copy code only offers languages the builder can write", () => {
  const cg = require("../../out/codegen.js");
  const langs = cg.codeLangs(src.root);
  const X = require(path.join(src.root, "media", "builder", "codegen.js"));
  assert.deepStrictEqual(Object.keys(langs).sort(), ["c", "cs", "gd", "go", "java", "lua", "node", "py", "rust", "zig"]);
  for (const id of ["rust", "node", "go", "zig", "lua"]) assert.ok(X.langs[id], id);
  assert.deepStrictEqual([langs.rust, langs.node, langs.go, langs.zig, langs.lua], ["Rust", "Node", "Go", "Zig", "Lua"]);
});
