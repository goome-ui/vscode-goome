import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface HoverEntry {
  sig: string;
  note: string;
  url: string;
}

export interface HoverMap {
  version: string;
  docs: string;
  functions: Record<string, HoverEntry>;
}

export function loadHoverMap(extensionPath: string): HoverMap {
  const file = path.join(extensionPath, "media", "hover.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as HoverMap;
}

export function hoverText(map: HoverMap, name: string): vscode.MarkdownString | undefined {
  const fn = map.functions[name];
  if (!fn) return undefined;
  const md = new vscode.MarkdownString();
  md.appendCodeblock(fn.sig, "c");
  if (fn.note) md.appendMarkdown("\n" + fn.note.replace(/[\\`*_{}[\]<>#|]/g, "\\$&") + "\n\n");
  md.appendMarkdown("[goome docs](" + fn.url + ")");
  return md;
}

export class GoomeHover implements vscode.HoverProvider {
  constructor(private map: HoverMap) {}

  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const range = doc.getWordRangeAtPosition(pos, /goome_\w+/);
    if (!range) return undefined;
    const md = hoverText(this.map, doc.getText(range));
    return md ? new vscode.Hover(md, range) : undefined;
  }
}
