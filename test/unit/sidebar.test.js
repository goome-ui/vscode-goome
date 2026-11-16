const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = require("./sources");
const sb = require("../../out/sidebar.js");

const pkg = JSON.parse(fs.readFileSync(path.join(src.root, "package.json"), "utf8"));

test("root has the four groups in order", () => {
  const nodes = sb.rootNodes([], [], [], "c");
  assert.deepStrictEqual(nodes.map((n) => n.label), ["Quick actions", "Builder files", "Templates", "Snippets"]);
  assert.strictEqual(nodes[1].description, "0");
  assert.deepStrictEqual(nodes[1].children.map((n) => n.command), ["goome.openBuilder"]);
  assert.strictEqual(nodes[3].description, "C");
  assert.strictEqual(nodes[3].open, false);
});

test("quick actions point at real commands", () => {
  const cmds = new Set(pkg.contributes.commands.map((c) => c.command));
  const q = sb.quickActions();
  assert.deepStrictEqual(q.map((n) => n.label), ["New Project", "Build for Web", "Open UI builder", "Search docs", "Open docs"]);
  for (const n of q) assert.ok(cmds.has(n.command), n.command + " isnt in package.json");
});

test("templates cover every language and template and preselect them", () => {
  const langs = sb.templateNodes();
  assert.deepStrictEqual(langs.map((l) => l.label), ["C", "C#", "Python", "Java", "Godot"]);
  for (const l of langs) {
    assert.deepStrictEqual(l.children.map((t) => t.label), ["app", "overlay", "mod-menu", "hud"]);
    for (const t of l.children) {
      assert.strictEqual(t.command, "goome.newProject");
      assert.deepStrictEqual(t.args, [{ lang: l.id.split("/")[1], template: t.label }]);
    }
  }
  const ids = langs.flatMap((l) => [l.id, ...l.children.map((t) => t.id)]);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("builder files are filtered, deduped, sorted and labelled by folder", () => {
  const root = path.join(path.sep, "w");
  const other = path.join(path.sep, "x");
  const files = [
    path.join(root, "ui", "b.goome.json"),
    path.join(root, "a.goome-theme.json"),
    path.join(root, "ui", "b.goome.json"),
    path.join(root, "notes.json"),
    path.join(other, "deep", "z", "c.goome.json"),
  ];
  const nodes = sb.builderFileNodes(files, [root, other]);
  assert.deepStrictEqual(nodes.map((n) => n.label), ["a.goome-theme.json", "c.goome.json", "b.goome.json"]);
  assert.deepStrictEqual(nodes.map((n) => n.description), ["", "deep/z", "ui"]);
  for (const n of nodes) {
    assert.strictEqual(n.command, "goome.openFile");
    assert.ok(path.isAbsolute(n.file));
  }
  assert.strictEqual(sb.rootNodes(files, [root, other], [], "c")[1].description, "3");
});

test("snippet language follows the editor and falls back to c", () => {
  assert.strictEqual(sb.snippetLang("cpp"), "c");
  assert.strictEqual(sb.snippetLang("csharp"), "csharp");
  assert.strictEqual(sb.snippetLang("python"), "python");
  assert.strictEqual(sb.snippetLang("java"), "java");
  assert.strictEqual(sb.snippetLang("markdown"), "c");
  assert.strictEqual(sb.snippetLang(undefined), "c");
});

test("snippet cheat sheet lists every prefix with an insert command", () => {
  for (const lang of Object.keys(sb.SNIPPET_LANGS)) {
    const raw = JSON.parse(fs.readFileSync(path.join(src.root, "snippets", sb.SNIPPET_LANGS[lang].file), "utf8"));
    const snips = sb.readSnippets(src.root, lang);
    assert.strictEqual(snips.length, Object.keys(raw).length);
    const nodes = sb.snippetNodes(snips, lang);
    assert.deepStrictEqual(nodes.map((n) => n.label), Object.values(raw).map((s) => s.prefix));
    for (const n of nodes) {
      assert.strictEqual(n.command, "goome.insertSnippet");
      assert.deepStrictEqual(n.args, [lang, n.label]);
      assert.ok(n.description.length > 0);
    }
    assert.ok(snips.every((s) => typeof s.body === "string" && s.body.length > 0));
  }
  assert.deepStrictEqual(sb.readSnippets(src.root, "rust"), []);
});

test("package.json wires the side bar, explorer view and file icons", () => {
  const c = pkg.contributes;
  assert.deepStrictEqual(c.viewsContainers.activitybar.map((v) => v.id), ["goome"]);
  assert.deepStrictEqual(c.views.goome.map((v) => v.id), ["goome.sidebar"]);
  assert.deepStrictEqual(c.views.explorer.map((v) => v.id), ["goome.files"]);
  const icons = [c.viewsContainers.activitybar[0].icon];
  for (const l of c.languages) icons.push(l.icon.light, l.icon.dark);
  for (const i of icons) assert.ok(fs.existsSync(path.join(src.root, i)), i);
  assert.deepStrictEqual(c.languages.map((l) => l.extensions[0]), [".goome.json", ".goome-theme.json"]);
  assert.deepStrictEqual(c.jsonLanguageParticipants.map((p) => p.languageId), c.languages.map((l) => l.id));
  const bar = fs.readFileSync(path.join(src.root, c.viewsContainers.activitybar[0].icon), "utf8");
  assert.match(bar, /viewBox="0 0 24 24"/);
  assert.ok(!/#[0-9a-f]{3,6}/i.test(bar), "activity bar icon should only use currentColor");
});
