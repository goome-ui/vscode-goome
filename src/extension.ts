import * as vscode from "vscode";
import { CODE_LANGS } from "./codegen";
import { GoomeHover, loadHoverMap } from "./hover";
import { newProject, NewProjectArgs } from "./newProject";
import { GoomePreview } from "./preview";

function sayError(e: unknown) {
  vscode.window.showErrorMessage("goome: " + (e instanceof Error ? e.message : String(e)));
}

function goomeJson(uri?: vscode.Uri): vscode.Uri | undefined {
  const u = uri || vscode.window.activeTextEditor?.document.uri;
  return u && u.path.endsWith(".goome.json") ? u : undefined;
}

export function activate(ctx: vscode.ExtensionContext) {
  const preview = new GoomePreview(ctx);
  const hover = new GoomeHover(loadHoverMap(ctx.extensionPath));

  ctx.subscriptions.push(
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
  );

  return { preview, hover };
}

export function deactivate() {}
