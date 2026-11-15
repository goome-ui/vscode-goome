import * as crypto from "crypto";
import * as vscode from "vscode";
import { CODE_LANGS, generateCode } from "./codegen";

export const BUILDER_URL = "https://goome-ui.github.io/docs/builder/";
const SCRIPTS = ["model.js", "elements.js", "app.js", "stage.js", "vars.js"];

export interface RenderInfo {
  nodes: number;
  error: string;
}

export class GoomePreview implements vscode.CustomTextEditorProvider {
  static readonly viewType = "goome.preview";
  readonly renders = new Map<string, RenderInfo>();

  constructor(private ctx: vscode.ExtensionContext) {}

  async copyCode(text: string, lang: string): Promise<string> {
    const r = generateCode(this.ctx.extensionPath, text, lang);
    await vscode.env.clipboard.writeText(r.code);
    const warn = r.warnings.length ? ", " + r.warnings.length + " warning" + (r.warnings.length > 1 ? "s" : "") + ": " + r.warnings[0].msg : "";
    vscode.window.showInformationMessage("copied the " + CODE_LANGS[lang] + " code" + warn);
    return r.code;
  }

  html(webview: vscode.Webview): string {
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, "media");
    const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(media, ...p)).toString();
    const nonce = crypto.randomBytes(16).toString("base64");
    const csp = [
      "default-src 'none'",
      "img-src " + webview.cspSource + " data: blob:",
      "style-src " + webview.cspSource + " 'unsafe-inline'",
      "font-src " + webview.cspSource,
      "script-src 'nonce-" + nonce + "'",
    ].join("; ");
    const scripts = SCRIPTS.map((s) => uri("builder", s)).concat(uri("preview.js"));
    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta http-equiv="Content-Security-Policy" content="' + csp + '">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<link rel="stylesheet" href="' + uri("builder", "style.css") + '">',
      '<link rel="stylesheet" href="' + uri("builder", "elements.css") + '">',
      '<link rel="stylesheet" href="' + uri("preview.css") + '">',
      "</head>",
      "<body>",
      '<div class="app gp">',
      '  <header class="top">',
      '    <div class="brand"><i></i><span id="gpName">goome ui</span> <small>preview</small></div>',
      '    <div class="sp"></div>',
      '    <div class="gp-copy" role="group" aria-label="Copy code">',
      "      <span>Copy code</span>",
      Object.keys(CODE_LANGS).map((l) => '      <button class="btn sm" data-copy="' + l + '" title="Copy the ' + CODE_LANGS[l] + ' code">' + CODE_LANGS[l] + "</button>").join("\n"),
      "    </div>",
      '    <button class="btn sm pri" id="gpBuilder" title="' + BUILDER_URL + '">Open in the UI builder</button>',
      "  </header>",
      '  <div class="stage-wrap" id="stageWrap"></div>',
      '  <div class="gp-err" id="gpErr" hidden></div>',
      "</div>",
      '<div hidden><button id="undoBtn"></button><button id="redoBtn"></button></div>',
      scripts.map((s) => '<script nonce="' + nonce + '" src="' + s + '"></script>').join("\n"),
      "</body>",
      "</html>",
    ].join("\n");
  }

  async resolveCustomTextEditor(doc: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const key = doc.uri.toString();
    panel.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, "media")] };
    panel.webview.html = this.html(panel.webview);
    let timer: NodeJS.Timeout | undefined;
    const send = () => {
      const name = doc.uri.path.split("/").pop() || "";
      panel.webview.postMessage({ type: "load", text: doc.getText(), name });
    };
    const sub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== key) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, 200);
    });
    panel.onDidDispose(() => {
      sub.dispose();
      if (timer) clearTimeout(timer);
      this.renders.delete(key);
    });
    panel.webview.onDidReceiveMessage(async (m) => {
      try {
        if (m.type === "ready") send();
        else if (m.type === "rendered") this.renders.set(key, { nodes: +m.nodes || 0, error: String(m.error || "") });
        else if (m.type === "builder") await vscode.env.openExternal(vscode.Uri.parse(BUILDER_URL));
        else if (m.type === "copy") await this.copyCode(doc.getText(), String(m.lang));
      } catch (e) {
        vscode.window.showErrorMessage("goome: " + (e instanceof Error ? e.message : String(e)));
      }
    });
  }
}
