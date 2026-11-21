import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { findRunner } from "./newProject";
import { buildArgs, errorLines, headline, languageOfFile, languageOfFolder, notCMessage, needsGoomeFolder, outFolder, runBuild, Server, Spawn, startServer } from "./webCore";

export class WebBuilder implements vscode.Disposable {
  spawn: Spawn = (cmd, args, opts) => cp.spawn(cmd, args, opts);
  servers = new Map<string, Server>();
  private channel?: vscode.OutputChannel;

  constructor(private storage: vscode.Uri) {}

  private log(): vscode.OutputChannel {
    if (!this.channel) this.channel = vscode.window.createOutputChannel("goome");
    return this.channel;
  }

  private async pickFile(uri?: vscode.Uri): Promise<string | undefined> {
    const given = uri || vscode.window.activeTextEditor?.document.uri;
    if (given && given.scheme === "file" && given.path.endsWith(".c")) return given.fsPath;
    const other = given && given.scheme === "file" ? languageOfFile(given.fsPath) : undefined;
    if (other) throw new Error(notCMessage(other));
    const found = await vscode.workspace.findFiles("**/*.c", "**/{node_modules,web,build,.git}/**", 200);
    if (!found.length) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const lang = root ? languageOfFolder(fs.readdirSync(root)) : undefined;
      if (lang) throw new Error(notCMessage(lang));
    }
    if (!found.length) throw new Error("no .c files in this workspace, open the one with your app first");
    const pick = await vscode.window.showQuickPick(
      found.map((f) => ({ label: path.basename(f.fsPath), description: vscode.workspace.asRelativePath(f), file: f.fsPath })),
      { title: "goome: Build for Web", placeHolder: "which file is your app?" },
    );
    return pick?.file;
  }

  async build(uri?: vscode.Uri): Promise<string | undefined> {
    const file = await this.pickFile(uri);
    if (!file) return undefined;
    const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file && d.isDirty);
    if (open) await open.save();
    const out = outFolder(file);
    const goomePath = (vscode.workspace.getConfiguration("goome").get<string>("web.goomePath") || "").trim();
    const log = this.log();
    log.clear();
    log.show(true);
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "building " + path.basename(file) + " for the web..." }, async () => {
      const runner = await findRunner(this.storage);
      const args = buildArgs(file, out, goomePath);
      log.appendLine("$ " + [runner.cmd, ...runner.pre, ...args].join(" "));
      return runBuild(this.spawn, runner, args, path.dirname(file), (l) => log.appendLine(l));
    });
    if (result.code !== 0) {
      const lines = errorLines(result.stderr, result.stdout);
      const buttons = needsGoomeFolder(lines) ? ["Show Output", "Set c-goome Folder"] : ["Show Output"];
      vscode.window.showErrorMessage("goome: " + headline(lines, result.code), ...buttons).then((pick) => {
        if (pick === "Show Output") log.show(true);
        if (pick === "Set c-goome Folder") vscode.commands.executeCommand("workbench.action.openSettings", "goome.web.goomePath");
      });
      return undefined;
    }
    vscode.window.showInformationMessage("built " + path.basename(file) + " for the web in " + vscode.workspace.asRelativePath(out), "Open in browser", "Reveal folder").then((pick) => {
      if (pick === "Open in browser") this.openInBrowser(out).catch((e) => vscode.window.showErrorMessage("goome: " + (e instanceof Error ? e.message : String(e))));
      if (pick === "Reveal folder") vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(path.join(out, "index.html")));
    });
    return out;
  }

  async openInBrowser(dir: string): Promise<string> {
    if (!fs.existsSync(path.join(dir, "index.html"))) throw new Error("no index.html in " + dir + ", build it first");
    let server = this.servers.get(dir);
    if (!server || server.child.exitCode !== null || server.child.killed) {
      const runner = await findRunner(this.storage);
      const log = this.log();
      server = await startServer(this.spawn, runner, dir, (l) => log.appendLine(l));
      const made = server;
      made.child.on("close", () => {
        if (this.servers.get(dir) === made) this.servers.delete(dir);
      });
      this.servers.set(dir, made);
    }
    await vscode.env.openExternal(vscode.Uri.parse(server.url));
    return server.url;
  }

  stop(): number {
    const running = [...this.servers.values()];
    for (const s of running) s.child.kill();
    this.servers.clear();
    return running.length;
  }

  dispose() {
    this.stop();
    this.channel?.dispose();
  }
}
