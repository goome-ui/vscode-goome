import * as vscode from "vscode";
import { CODE_LANGS } from "./codegen";
import { GoomeHover, loadHoverMap } from "./hover";
import { newProject, NewProjectArgs } from "./newProject";
import { GoomePreview } from "./preview";
import { BUILDER_URL, DOCS_URL } from "./sidebar";
import { GoomeSidebar } from "./sidebarView";

function sayError(e: unknown) {
  vscode.window.showErrorMessage("goome: " + (e instanceof Error ? e.message : String(e)));
}

function goomeJson(uri?: vscode.Uri): vscode.Uri | undefined {
  const u = uri || vscode.window.activeTextEditor?.document.uri;
  return u && u.path.endsWith(".goome.json") ? u : undefined;
}

export function activate(ctx: vscode.ExtensionContext) {
  const json = vscode.extensions.getExtension("vscode.json-language-features");
  if (json && !json.isActive) json.activate().then(undefined, () => undefined);
  const preview = new GoomePreview(ctx);
  const map = loadHoverMap(ctx.extensionPath);
  const hover = new GoomeHover(map);
  const sidebar = new GoomeSidebar(ctx.extensionPath);

  ctx.subscriptions.push(
    sidebar,
    vscode.languages.registerHoverProvider([{ language: "c" }, { language: "cpp" }], hover),
    vscode.window.registerCustomEditorProvider(GoomePreview.viewType, preview, { webviewOptions: { retainContextWhenHidden: false } }),
    vscode.commands.registerCommand("goome.newProject", async (args?: NewProjectArgs) => {
      try {
        return await newProject(ctx.globalStorageUri, args || {});
      } catch (e) {
        sayError(e);
        return undefined;
      }
    }),
    vscode.commands.registerCommand("goome.openPreview", async (uri?: vscode.Uri) => {
      const u = goomeJson(uri);
      if (!u) return sayError("open a .goome.json first");
      await vscode.commands.executeCommand("vscode.openWith", u, GoomePreview.viewType, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand("goome.copyCode", async (uri?: vscode.Uri, lang?: string) => {
      try {
        const u = goomeJson(uri);
        if (!u) return sayError("open a .goome.json first");
        if (!lang) {
          const pick = await vscode.window.showQuickPick(Object.keys(CODE_LANGS).map((id) => ({ label: CODE_LANGS[id], id })), { placeHolder: "which language?" });
          if (!pick) return undefined;
          lang = pick.id;
        }
        const doc = await vscode.workspace.openTextDocument(u);
        return await preview.copyCode(doc.getText(), lang);
      } catch (e) {
        sayError(e);
        return undefined;
      }
    }),
    vscode.commands.registerCommand("goome.openBuilder", () => vscode.env.openExternal(vscode.Uri.parse(BUILDER_URL))),
    vscode.commands.registerCommand("goome.openDocs", () => vscode.env.openExternal(vscode.Uri.parse(DOCS_URL))),
    vscode.commands.registerCommand("goome.searchDocs", async () => {
      const ed = vscode.window.activeTextEditor;
      const range = ed && ed.document.getWordRangeAtPosition(ed.selection.active, /goome_\w+/);
      const word = range ? ed!.document.getText(range) : "";
      const items = [{ label: "all the docs", description: "", url: DOCS_URL }].concat(
        Object.keys(map.functions).map((n) => ({ label: n, description: map.functions[n].note, url: map.functions[n].url })),
      );
      const qp = vscode.window.createQuickPick<(typeof items)[number]>();
      qp.title = "goome docs";
      qp.placeholder = "which function?";
      qp.matchOnDescription = true;
      qp.items = items;
      if (word) qp.value = word;
      const pick = await new Promise<(typeof items)[number] | undefined>((resolve) => {
        qp.onDidAccept(() => resolve(qp.selectedItems[0]));
        qp.onDidHide(() => resolve(undefined));
        qp.show();
      });
      qp.dispose();
      if (pick) await vscode.env.openExternal(vscode.Uri.parse(pick.url));
      return pick?.url;
    }),
    vscode.commands.registerCommand("goome.openFile", async (uri?: vscode.Uri) => {
      if (!uri) return;
      if (uri.path.endsWith(".goome.json")) await vscode.commands.executeCommand("vscode.openWith", uri, GoomePreview.viewType);
      else await vscode.window.showTextDocument(uri);
    }),
    vscode.commands.registerCommand("goome.insertSnippet", async (lang: string, prefix: string) => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return sayError("open a file first, then pick the snippet");
      const snip = sidebar.tree.snippetsFor(lang).find((s) => s.prefix === prefix);
      if (!snip) return sayError("no " + prefix + " snippet");
      await vscode.window.showTextDocument(ed.document, ed.viewColumn);
      return ed.insertSnippet(new vscode.SnippetString(snip.body));
    }),
    vscode.commands.registerCommand("goome.refreshSidebar", () => sidebar.refresh()),
  );

  return { preview, hover, sidebar, storage: ctx.globalStorageUri };
}

export function deactivate() {}
