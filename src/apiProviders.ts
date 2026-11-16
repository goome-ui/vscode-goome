import * as vscode from "vscode";
import { accessAt, ApiLang, ApiMap, completionsFor, Docs, entriesFor, hoverMarkdown, mentionsGoome, receiverBefore } from "./api";

export class GoomeApiHover implements vscode.HoverProvider {
  constructor(private map: ApiMap, private docs: Docs, private lang: ApiLang) {}

  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    if (!mentionsGoome(doc.getText())) return undefined;
    const range = doc.getWordRangeAtPosition(pos, /[A-Za-z_]\w*/);
    if (!range) return undefined;
    const a = accessAt(doc.lineAt(pos.line).text, pos.character);
    if (!a || !a.receiver) return undefined;
    const found = entriesFor(this.map, this.lang.id, a);
    if (!found.length) return undefined;
    const md = new vscode.MarkdownString(hoverMarkdown(found, this.docs, this.lang));
    return new vscode.Hover(md, range);
  }
}

export class GoomeApiCompletion implements vscode.CompletionItemProvider {
  constructor(private map: ApiMap, private docs: Docs, private lang: ApiLang) {}

  provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem[] | undefined {
    if (!mentionsGoome(doc.getText())) return undefined;
    const receiver = receiverBefore(doc.lineAt(pos.line).text, pos.character);
    if (!receiver) return undefined;
    return completionsFor(this.map, this.lang.id, receiver).map((e) => {
      const item = new vscode.CompletionItem({ label: e.n, description: e.o === "goome" ? "goome" : e.o }, e.k === "const" ? vscode.CompletionItemKind.Constant : e.k === "prop" ? vscode.CompletionItemKind.Property : vscode.CompletionItemKind.Method);
      item.detail = e.s;
      item.documentation = new vscode.MarkdownString(hoverMarkdown([e], this.docs, this.lang));
      item.sortText = "0" + e.n;
      return item;
    });
  }
}
