import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const ID = "goome-ui.vscode-goome";
const root = path.resolve(__dirname, "..", "..", "..");
const fixtures = path.join(root, "test", "fixtures");
const work = process.env.GOOME_TEST_WORK || path.join(root, ".vscode-test", "work");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, fn: () => T | undefined | Promise<T | undefined>, ms = 30000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error("waited too long for " + what);
}

function hoverText(h: vscode.Hover[]): string {
  return h.flatMap((x) => x.contents).map((c) => (typeof c === "string" ? c : "value" in c ? c.value : "")).join("\n");
}

describe("goome extension", () => {
  let api: any;

  before(async () => {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const ext = vscode.extensions.getExtension(ID);
    assert.ok(ext, "extension isnt loaded");
    api = await ext!.activate();
  });

  after(async () => {
    await vscode.workspace.getConfiguration("goome").update("cli", undefined, vscode.ConfigurationTarget.Global);
  });

  it("registers its commands", async () => {
    const all = await vscode.commands.getCommands(true);
    for (const c of ["goome.newProject", "goome.openPreview", "goome.copyCode"]) assert.ok(all.includes(c), c);
  });

  it("shows the goome.h note and a docs link on hover in C", async () => {
    const doc = await vscode.workspace.openTextDocument({ language: "c", content: "void f(goome_ui *u) {\n    goome_ui_custom(u, \"x\", 0, 0, 0, 0);\n    goome_nope();\n}\n" });
    const h = (await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(1, 10))) || [];
    const text = hoverText(h);
    assert.match(text, /int goome_ui_custom\(goome_ui \*u, const char \*id/);
    assert.match(text, /DRAG\\?_X or DRAG\\?_Y alone locks that axis/);
    assert.match(text, /https:\/\/goome-ui\.github\.io\/docs\//);
    const none = (await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(2, 8))) || [];
    assert.ok(!/goome docs/.test(hoverText(none)), "goome_nope got a goome hover");
  });

  for (const [lang, want] of [["c", "goome_ui_button"], ["csharp", "ui.Button"], ["python", "ui.button"], ["java", "ui.button"]]) {
    it("offers the goome snippets in " + lang, async () => {
      const doc = await vscode.workspace.openTextDocument({ language: lang, content: "goome-but" });
      const list = await until("completions in " + lang, async () => {
        const l = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, new vscode.Position(0, 9));
        return l && l.items.some((i) => i.kind === vscode.CompletionItemKind.Snippet && (typeof i.label === "string" ? i.label : i.label.label) === "goome-button") ? l : undefined;
      }, 20000);
      const item = list.items.find((i) => (typeof i.label === "string" ? i.label : i.label.label) === "goome-button")!;
      const body = item.insertText instanceof vscode.SnippetString ? item.insertText.value : String(item.insertText);
      assert.ok(body.includes(want), lang + " snippet body: " + body);
    });
  }

  it("treats .goome.json and .goome-theme.json as json", async () => {
    const a = await vscode.workspace.openTextDocument(path.join(fixtures, "demo.goome.json"));
    const b = await vscode.workspace.openTextDocument(path.join(fixtures, "midnight.goome-theme.json"));
    assert.strictEqual(a.languageId, "json");
    assert.strictEqual(b.languageId, "json");
  });

  it("checks .goome.json files against the schema", async () => {
    const bad = path.join(work, "bad.goome.json");
    fs.writeFileSync(bad, JSON.stringify({ format: "goome-project", mode: "sideways", root: [{ type: "not_a_widget" }] }, null, 2));
    const good = path.join(fixtures, "demo.goome.json");
    const badDoc = await vscode.workspace.openTextDocument(bad);
    await vscode.window.showTextDocument(badDoc);
    const diags = await until("schema warnings", () => {
      const d = vscode.languages.getDiagnostics(badDoc.uri);
      return d.length >= 2 ? d : undefined;
    }, 60000);
    const msgs = diags.map((d) => d.message).join(" | ");
    assert.match(msgs, /overlay|app/, msgs);
    const goodDoc = await vscode.workspace.openTextDocument(good);
    await vscode.window.showTextDocument(goodDoc);
    await sleep(3000);
    assert.deepStrictEqual(vscode.languages.getDiagnostics(goodDoc.uri).map((d) => d.message), []);
    const theme = path.join(work, "bad.goome-theme.json");
    fs.writeFileSync(theme, JSON.stringify({ format: "goome-theme", theme: { base: "purple", accent: "green" } }));
    const themeDoc = await vscode.workspace.openTextDocument(theme);
    await vscode.window.showTextDocument(themeDoc);
    await until("theme schema warnings", () => (vscode.languages.getDiagnostics(themeDoc.uri).length >= 2 ? true : undefined), 60000);
  });

  it("renders the project in the preview with the builder code", async () => {
    const uri = vscode.Uri.file(path.join(fixtures, "demo.goome.json"));
    await vscode.commands.executeCommand("vscode.openWith", uri, "goome.preview");
    const info = await until("the preview to render", () => api.preview.renders.get(uri.toString()), 60000);
    assert.strictEqual(info.error, "");
    assert.ok(info.nodes >= 10, "only " + info.nodes + " widgets got drawn");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("copies code from the project with the builder codegen", async () => {
    const uri = vscode.Uri.file(path.join(fixtures, "demo.goome.json"));
    const want: Record<string, string> = { c: "goome_ui_window(", cs: "ui.Window(", py: "ui.window(", java: "ui.window(" };
    for (const lang of Object.keys(want)) {
      const code = await vscode.commands.executeCommand<string>("goome.copyCode", uri, lang);
      assert.ok(code && code.includes(want[lang]), lang + ": " + String(code).slice(0, 200));
      assert.strictEqual(await vscode.env.clipboard.readText(), code);
    }
  });

  it("makes a new project with a local goome.py", async function () {
    const cli = process.env.GOOME_CLI || path.join(root, "..", "goome-cli", "goome.py");
    if (!fs.existsSync(cli)) return this.skip();
    await vscode.workspace.getConfiguration("goome").update("cli", cli, vscode.ConfigurationTarget.Global);
    const dest = await vscode.commands.executeCommand<string>("goome.newProject", { lang: "c", template: "hud", folder: work, name: "e2e hud", open: false });
    assert.strictEqual(dest, path.join(work, "e2e hud"));
    assert.ok(fs.existsSync(path.join(dest, "main.c")), "no main.c in " + dest);
    assert.ok(fs.readFileSync(path.join(dest, "README.md"), "utf8").includes("E2e Hud"));
  });

  it("downloads goome.py from the latest release when goome isnt on PATH", async () => {
    await vscode.workspace.getConfiguration("goome").update("cli", undefined, vscode.ConfigurationTarget.Global);
    const keep = process.env.PATH;
    process.env.PATH = (keep || "").split(path.delimiter).filter((d) => !["goome", "goome.exe", "goome.cmd"].some((f) => fs.existsSync(path.join(d, f)))).join(path.delimiter);
    try {
      const dest = await vscode.commands.executeCommand<string>("goome.newProject", { lang: "python", template: "overlay", folder: work, name: "e2e overlay", open: false });
      assert.ok(dest, "newProject gave nothing back");
      assert.ok(fs.existsSync(path.join(dest, "main.py")), "no main.py in " + dest);
      const script = path.join(api.storage.fsPath, "goome.py");
      assert.ok(fs.existsSync(script), "goome.py wasnt saved to " + script);
      assert.match(fs.readFileSync(script, "utf8"), /__version__ = "/);
    } finally {
      process.env.PATH = keep;
    }
  });
});
