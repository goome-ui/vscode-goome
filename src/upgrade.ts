import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { findRunner } from "./newProject";
import { runBuild, Spawn } from "./webCore";
import { interpretUpgrade, upgradeArgs, UpgradeOutcome } from "./upgradeCore";

export function projectDir(): string | undefined {
  const file = vscode.window.activeTextEditor?.document.uri;
  if (file && file.scheme === "file") {
    const folder = vscode.workspace.getWorkspaceFolder(file);
    if (folder) return folder.uri.fsPath;
    return path.dirname(file.fsPath);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export class Upgrader {
  constructor(private storage: vscode.Uri, private spawn: Spawn, private log: () => vscode.OutputChannel) {}

  private async run(args: string[], dir: string, check: boolean): Promise<UpgradeOutcome> {
    const runner = await findRunner(this.storage);
    const log = this.log();
    log.appendLine("$ " + [runner.cmd, ...runner.pre, ...args].join(" "));
    const result = await runBuild(this.spawn, runner, args, dir, (l) => log.appendLine(l));
    return interpretUpgrade(result.code, result.stdout, result.stderr, check);
  }

  private async updateCli(): Promise<boolean> {
    const runner = await findRunner(this.storage);
    const log = this.log();
    log.appendLine("$ " + [runner.cmd, ...runner.pre, "update"].join(" "));
    const result = await runBuild(this.spawn, runner, ["update"], process.cwd(), (l) => log.appendLine(l));
    if (result.code === 0) return true;
    const last = (result.stderr || result.stdout).trim().split(/\r?\n/).pop() || "goome update failed";
    vscode.window.showErrorMessage("goome: " + last);
    return false;
  }

  async upgrade(dirArg?: string): Promise<UpgradeOutcome | undefined> {
    const dir = dirArg || projectDir();
    if (!dir) throw new Error("open your project folder first");
    if (!fs.existsSync(dir)) throw new Error(dir + " doesnt exist");
    const log = this.log();
    log.clear();
    log.show(true);
    let out = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "checking for a newer goome..." }, () => this.run(upgradeArgs(dir, true), dir, true));
    if (out.kind === "oldCli") {
      const pick = await vscode.window.showWarningMessage("goome: " + out.message, "Update CLI");
      if (pick !== "Update CLI") return out;
      const done = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "updating the goome cli..." }, () => this.updateCli());
      if (!done) return out;
      out = await this.run(upgradeArgs(dir, true), dir, true);
    }
    if (out.kind === "available") {
      const pick = await vscode.window.showInformationMessage("goome: " + out.message, "Update");
      if (pick !== "Update") return out;
      out = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "updating goome..." }, () => this.run(upgradeArgs(dir, false), dir, false));
    }
    if (out.kind === "applied") {
      const next = out.next;
      const buttons = next ? ["Run " + next] : [];
      const pick = await vscode.window.showInformationMessage("goome: " + out.message, ...buttons);
      if (next && pick === buttons[0]) {
        const term = vscode.window.createTerminal({ name: "goome", cwd: dir });
        term.show();
        term.sendText(next);
      }
    } else if (out.kind === "error" || out.kind === "oldCli") {
      vscode.window.showErrorMessage("goome: " + out.message);
    } else if (out.kind === "notProject") {
      vscode.window.showWarningMessage("goome: " + out.message);
    } else if (out.kind === "upToDate") {
      vscode.window.showInformationMessage("goome: " + out.message);
    }
    return out;
  }
}
