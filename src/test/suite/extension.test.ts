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
    for (const c of ["goome.newProject", "goome.openPreview", "goome.copyCode", "goome.openBuilder", "goome.searchDocs", "goome.openDocs", "goome.openFile", "goome.insertSnippet", "goome.refreshSidebar"]) assert.ok(all.includes(c), c);
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

  it("gives .goome.json and .goome-theme.json their own languages", async () => {
    const a = await vscode.workspace.openTextDocument(path.join(fixtures, "demo.goome.json"));
    const b = await vscode.workspace.openTextDocument(path.join(fixtures, "midnight.goome-theme.json"));
    assert.strictEqual(a.languageId, "goome");
    assert.strictEqual(b.languageId, "goome-theme");
  });

  it("shows the goome side bar with all four groups", async () => {
    await vscode.commands.executeCommand("workbench.view.extension.goome");
    await vscode.commands.executeCommand("goome.sidebar.focus");
    await api.sidebar.ready;
    const tree = api.sidebar.tree;
    const top = tree.getChildren();
    assert.deepStrictEqual(top.map((n: any) => n.label), ["Quick actions", "Builder files", "Templates", "Snippets"]);
    const files = await until("builder files", () => {
      const f = tree.getChildren(tree.getChildren()[1]);
      return f.length >= 2 ? f : undefined;
    });
    assert.deepStrictEqual(files.map((n: any) => n.label).sort(), ["demo.goome.json", "midnight.goome-theme.json"]);
    const item = tree.getTreeItem(files.find((n: any) => n.label === "demo.goome.json"));
    assert.strictEqual(item.command.command, "goome.openFile");
    assert.strictEqual(item.resourceUri.fsPath, path.join(fixtures, "demo.goome.json"));
    const hud = tree.getChildren(tree.getChildren(top[2])[2]).find((n: any) => n.label === "hud");
    const hudItem = tree.getTreeItem(hud);
    assert.strictEqual(hudItem.command.command, "goome.newProject");
    assert.deepStrictEqual(hudItem.command.arguments, [{ lang: "python", template: "hud" }]);
    await vscode.commands.executeCommand("workbench.view.explorer");
    await vscode.commands.executeCommand("goome.files.focus");
    assert.deepStrictEqual(api.sidebar.explorer.getChildren().map((n: any) => n.label).sort(), ["demo.goome.json", "midnight.goome-theme.json"]);
  });

  it("picks up new builder files while running", async () => {
    const extra = path.join(fixtures, "zz-new.goome.json");
    try {
      fs.writeFileSync(extra, JSON.stringify({ format: "goome-project", root: [] }));
      await until("the new file in the side bar", () => (api.sidebar.explorer.files.includes(extra) ? true : undefined), 20000);
    } finally {
      fs.rmSync(extra, { force: true });
    }
    await until("the file to go away", () => (api.sidebar.explorer.files.includes(extra) ? undefined : true), 20000);
  });

  it("inserts a snippet from the cheat sheet into the editor", async () => {
    const doc = await vscode.workspace.openTextDocument({ language: "python", content: "" });
    await vscode.window.showTextDocument(doc);
    await until("snippets to follow python", () => (api.sidebar.tree.lang === "python" ? true : undefined), 5000);
    const snips = api.sidebar.tree.getChildren(api.sidebar.tree.getChildren()[3]);
    assert.ok(snips.length > 40, "only " + snips.length + " snippets");
    const button = snips.find((n: any) => n.label === "goome-button");
    const item = api.sidebar.tree.getTreeItem(button);
    assert.deepStrictEqual(item.command.arguments, ["python", "goome-button"]);
    await vscode.commands.executeCommand(item.command.command, ...item.command.arguments);
    assert.ok(doc.getText().includes("ui.button("), doc.getText());
    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
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

  it("opens the preview when a builder file is clicked", async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    const uri = vscode.Uri.file(path.join(fixtures, "demo.goome.json"));
    api.preview.renders.delete(uri.toString());
    await vscode.commands.executeCommand("goome.openFile", uri);
    const info = await until("the preview from the side bar", () => api.preview.renders.get(uri.toString()), 60000);
    assert.strictEqual(info.error, "");
    const theme = vscode.Uri.file(path.join(fixtures, "midnight.goome-theme.json"));
    await vscode.commands.executeCommand("goome.openFile", theme);
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, theme.fsPath);
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
