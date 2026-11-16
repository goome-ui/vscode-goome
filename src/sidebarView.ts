import * as vscode from "vscode";
import { builderFileNodes, FILE_GLOB, Node, readSnippets, rootNodes, Snippet, snippetLang } from "./sidebar";

export class GoomeTree implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  files: string[] = [];
  lang = "c";
  private snippets = new Map<string, Snippet[]>();

  constructor(private extensionPath: string, private filesOnly = false) {}

  snippetsFor(lang: string): Snippet[] {
    let list = this.snippets.get(lang);
    if (!list) {
      list = readSnippets(this.extensionPath, lang);
      this.snippets.set(lang, list);
    }
    return list;
  }

  setFiles(files: string[]) {
    this.files = files;
    this.changed.fire(undefined);
  }

  setLanguage(languageId?: string) {
    const lang = snippetLang(languageId);
    if (lang === this.lang) return;
    this.lang = lang;
    if (!this.filesOnly) this.changed.fire(undefined);
  }

  roots(): string[] {
    return (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);
  }

  getChildren(node?: Node): Node[] {
    if (node) return node.children || [];
    if (this.filesOnly) return builderFileNodes(this.files, this.roots());
    return rootNodes(this.files, this.roots(), this.snippetsFor(this.lang), this.lang);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const C = vscode.TreeItemCollapsibleState;
    const state = node.children === undefined ? C.None : !node.children.length ? C.None : node.open ? C.Expanded : C.Collapsed;
    const item = new vscode.TreeItem(node.label, state);
    item.id = node.id;
    item.description = node.description;
    item.tooltip = node.tooltip;
    if (node.file) {
      const uri = vscode.Uri.file(node.file);
      item.resourceUri = uri;
      item.contextValue = "goomeFile";
      item.command = { command: "goome.openFile", title: "Open", arguments: [uri] };
    } else {
      if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
      if (node.command) item.command = { command: node.command, title: node.label, arguments: node.args || [] };
    }
    return item;
  }
}

export class GoomeSidebar implements vscode.Disposable {
  readonly tree: GoomeTree;
  readonly explorer: GoomeTree;
  private subs: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;
  ready: Promise<void>;

  constructor(extensionPath: string) {
    this.tree = new GoomeTree(extensionPath);
    this.explorer = new GoomeTree(extensionPath, true);
    const watcher = vscode.workspace.createFileSystemWatcher(FILE_GLOB);
    const soon = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 300);
    };
    this.subs.push(
      vscode.window.registerTreeDataProvider("goome.sidebar", this.tree),
      vscode.window.registerTreeDataProvider("goome.files", this.explorer),
      watcher,
      watcher.onDidCreate(soon),
      watcher.onDidDelete(soon),
      vscode.workspace.onDidChangeWorkspaceFolders(soon),
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e) this.tree.setLanguage(e.document.languageId);
      }),
    );
    this.tree.setLanguage(vscode.window.activeTextEditor?.document.languageId);
    this.ready = this.refresh();
  }

  async refresh(): Promise<void> {
    const found = await vscode.workspace.findFiles(FILE_GLOB, "**/{node_modules,.git,out,build,bin,obj}/**", 2000);
    const files = found.map((u) => u.fsPath);
    this.tree.setFiles(files);
    this.explorer.setFiles(files);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    for (const s of this.subs) s.dispose();
  }
}
