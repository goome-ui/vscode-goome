import * as assert from "assert";
import * as fs from "fs";
import { EventEmitter } from "events";
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
    for (const c of ["goome.newProject", "goome.openPreview", "goome.copyCode", "goome.openBuilder", "goome.searchDocs", "goome.openDocs", "goome.openFile", "goome.insertSnippet", "goome.refreshSidebar", "goome.buildWeb", "goome.stopWebServer"]) assert.ok(all.includes(c), c);
  });

  it("shows the goome.h note and a docs link on hover in C", async () => {
    const doc = await vscode.workspace.openTextDocument({ language: "c", content: "void f(goome_ui *u) {\n    goome_ui_custom(u, \"x\", 0, 0, 0, 0);\n    goome_nope();\n}\n" });
    const h = (await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(1, 10))) || [];
    const text = hoverText(h);
    assert.match(text, /int goome_ui_custom\(goome_ui \*u, const char \*id/);
    assert.match(text, /DRAG\\?_X or DRAG\\?_Y alone locks that axis/);
    assert.match(text, /https:\/\/goome\.wtf\/docs\//);
    const none = (await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(2, 8))) || [];
    assert.ok(!/goome docs/.test(hoverText(none)), "goome_nope got a goome hover");
  });

  for (const [lang, want] of [["c", "goome_ui_button"], ["csharp", "ui.Button"], ["python", "ui.button"], ["java", "ui.button"], ["rust", "ui.button"], ["javascript", "ui.button"], ["go", "ui.Button"], ["zig", "u.button"], ["lua", "ui:button"], ["gdscript", "ui.button"]]) {
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

  const API_CASES: [string, string, string, string][] = [
    ["rust", "use goome::Ui;\nfn f(ui: &mut Ui) {\n    ui.button(\"x\");\n}\n", "button", "fn button(&mut self, label: &str) -> bool"],
    ["javascript", "const goome = require(\"goome\");\nui.button(\"x\");\n", "button", "button(label: string): boolean"],
    ["typescript", "import * as goome from \"goome\";\nui.button(\"x\");\n", "button", "button(label: string): boolean"],
    ["go", "package main\nimport \"github.com/goome-ui/go-goome\"\nfunc f(ui *goome.UI) {\n\tui.Button(\"x\")\n}\n", "Button", "func (u *UI) Button(label string) bool"],
    ["zig", "const goome = @import(\"goome\");\nfn f(u: *goome.Ui) void {\n    _ = u.button(\"x\");\n}\n", "button", "fn button(s: [*:0]const u8) bool"],
    ["lua", "local goome = require(\"goome\")\nui:button(\"x\")\n", "button", "ui:button(...)"],
    ["gdscript", "extends GoomeView\nfunc _goome_frame(ui: GoomeUI):\n\tui.button(\"x\")\n", "button", "func button(label: String) -> bool"],
  ];

  for (const [lang, content, member, sig] of API_CASES) {
    it("hovers goome members in " + lang, async () => {
      const doc = await vscode.workspace.openTextDocument({ language: lang, content });
      const at = doc.positionAt(content.indexOf((lang === "lua" ? ":" : ".") + member) + 2);
      const h = await until("a goome hover in " + lang, async () => {
        const list = (await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, at)) || [];
        return hoverText(list).includes(sig) ? list : undefined;
      }, 20000);
      assert.match(hoverText(h), /https:\/\/goome\.wtf\/docs\//);
    });

    it("completes goome members in " + lang, async () => {
      const line = lang === "lua" ? "ui:" : "ui.";
      const text = content.split("\n").slice(0, -2).join("\n") + "\n" + line;
      const doc = await vscode.workspace.openTextDocument({ language: lang, content: text });
      const end = doc.lineAt(doc.lineCount - 1).range.end;
      const list = await until("goome completions in " + lang, async () => {
        const l = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, end, lang === "lua" ? ":" : ".");
        return l && l.items.some((i) => i.detail === sig) ? l : undefined;
      }, 20000);
      const ours = list.items.filter((i) => typeof i.label !== "string" && ["ui", "Ui", "UI", "GoomeUI"].includes(i.label.description || "")).length;
      assert.ok(ours > 50, "only " + ours + " goome items");
    });
  }

  it("keeps quiet in files that never mention goome", async () => {
    const content = "const ui = makeThing();\nui.button(\"x\");\n";
    const doc = await vscode.workspace.openTextDocument({ language: "javascript", content });
    const h = (await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, new vscode.Position(1, 5))) || [];
    assert.ok(!hoverText(h).includes("goome docs"), hoverText(h));
    const l = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, new vscode.Position(1, 3), ".");
    assert.ok(!l.items.some((i) => i.detail && i.detail.includes("label: string")));
  });

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

  it("has a copy code button for each of the ten languages", () => {
    const html = api.preview.html({ cspSource: "x", asWebviewUri: (u: vscode.Uri) => u } as unknown as vscode.Webview);
    const ids = [...html.matchAll(/data-copy="(\w+)"/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(ids, ["c", "cs", "gd", "go", "java", "lua", "node", "py", "rust", "zig"]);
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
    const want: Record<string, string> = { c: "goome_ui_window(", cs: "ui.Window(", py: "ui.window(", java: "ui.window(", gd: "ui.window(", rust: "ui.window(\"demo window\"", node: "ui.window(\"demo window\"", go: "ui.Window(\"demo window\"", zig: "u.window(\"demo window\"", lua: "ui:window(\"demo window\"" };
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
    assert.strictEqual(vscode.Uri.file(dest).fsPath, vscode.Uri.file(path.join(work, "e2e hud")).fsPath);
    assert.ok(fs.existsSync(path.join(dest, "main.c")), "no main.c in " + dest);
    assert.ok(fs.readFileSync(path.join(dest, "README.md"), "utf8").includes("E2e Hud"));
  });

  const MAIN_FILE: Record<string, string> = { c: "main.c", csharp: "Program.cs", python: "main.py", java: "build.gradle", godot: "game.gd", rust: "src/main.rs", node: "main.js", go: "main.go", zig: "src/main.zig", lua: "main.lua" };

  for (const lang of Object.keys(MAIN_FILE)) {
    it("makes a " + lang + " overlay project from its template", async function () {
      const cli = process.env.GOOME_CLI || path.join(root, "..", "goome-cli", "goome.py");
      if (!fs.existsSync(cli)) return this.skip();
      await vscode.workspace.getConfiguration("goome").update("cli", cli, vscode.ConfigurationTarget.Global);
      const dest = await vscode.commands.executeCommand<string>("goome.newProject", { lang, template: "overlay", folder: work, name: "e2e " + lang, open: false });
      assert.ok(dest, "no project made for " + lang);
      assert.ok(fs.existsSync(path.join(dest, MAIN_FILE[lang])), "no " + MAIN_FILE[lang] + " in " + dest);
    });
  }

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

  function fakeChild(script: (c: any) => void) {
    const c: any = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.exitCode = null;
    c.killed = false;
    c.kill = () => {
      c.killed = true;
      c.emit("close", null);
    };
    setImmediate(() => script(c));
    return c;
  }

  describe("build for web", () => {
    const realSpawn = () => api.web.spawn;
    let keep: any;
    const calls: { cmd: string; args: string[] }[] = [];

    before(async () => {
      keep = realSpawn();
      await vscode.workspace.getConfiguration("goome").update("cli", "fake-goome-cli", vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration("goome").update("web.goomePath", "/src/c-goome", vscode.ConfigurationTarget.Global);
    });

    after(async () => {
      api.web.spawn = keep;
      await vscode.workspace.getConfiguration("goome").update("cli", undefined, vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration("goome").update("web.goomePath", undefined, vscode.ConfigurationTarget.Global);
    });

    it("does not run the cli for a non C file", async () => {
      const before = calls.length;
      api.web.spawn = (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return fakeChild((c) => c.emit("close", 0));
      };
      const file = path.join(work, "csapp", "Program.cs");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "class P {}");
      await assert.rejects(api.web.build(vscode.Uri.file(file)), /only works for C apps right now, this looks like a C# project/);
      assert.strictEqual(calls.length, before);
    });

    it("runs goome build --web on the file with the c-goome setting", async () => {
      api.web.spawn = (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        return fakeChild((c) => {
          c.stdout.emit("data", "built\n");
          c.emit("close", 0);
        });
      };
      const file = path.join(work, "app", "main.c");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "int main(void){return 0;}\n");
      const out = await vscode.commands.executeCommand<string>("goome.buildWeb", vscode.Uri.file(file));
      assert.strictEqual(vscode.Uri.file(out).fsPath, vscode.Uri.file(path.join(work, "app", "web")).fsPath);
      assert.strictEqual(calls[0].cmd, "fake-goome-cli");
      const fsp = (p: string) => vscode.Uri.file(p).fsPath;
      assert.deepStrictEqual(calls[0].args.map((a: string, i: number) => (i === 2 || i === 4 ? fsp(a) : a)), ["build", "--web", fsp(file), "--out", fsp(out), "--goome", "/src/c-goome"]);
    });

    it("gives back nothing when the cli fails", async () => {
      api.web.spawn = () =>
        fakeChild((c) => {
          c.stderr.emit("data", "goome: overlays cant run in the browser\n");
          c.emit("close", 1);
        });
      const file = path.join(work, "app", "main.c");
      const out = await vscode.commands.executeCommand<string>("goome.buildWeb", vscode.Uri.file(file));
      assert.strictEqual(out, undefined);
    });

    it("stops the servers it started", async () => {
      assert.strictEqual(await vscode.commands.executeCommand("goome.stopWebServer"), 0);
      const child = fakeChild(() => undefined);
      api.web.servers.set("/x/web", { url: "http://localhost:1/", dir: "/x/web", child });
      assert.strictEqual(await vscode.commands.executeCommand("goome.stopWebServer"), 1);
      assert.ok(child.killed);
      assert.strictEqual(api.web.servers.size, 0);
    });
  });
});
