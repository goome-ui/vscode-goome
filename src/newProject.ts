import * as cp from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import * as vscode from "vscode";
import { LANGS, TEMPLATES } from "./sidebar";

export const CLI_URL = "https://github.com/goome-ui/goome-cli/releases/latest/download/goome.py";

export interface NewProjectArgs {
  lang?: string;
  template?: string;
  folder?: string;
  name?: string;
  open?: boolean;
  extra?: string[];
}

export interface Runner {
  cmd: string;
  pre: string[];
  how: string;
}

export function validName(name: string): string | undefined {
  if (!/[A-Za-z0-9]/.test(name)) return "use letters and numbers";
  if (/[\\/:*?"<>|]/.test(name)) return "no slashes or other path stuff in the name";
  return undefined;
}

export function whichOnPath(cmd: string): string | undefined {
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        if (fs.statSync(full).isFile()) {
          if (process.platform !== "win32") fs.accessSync(full, fs.constants.X_OK);
          return full;
        }
      } catch {}
    }
  }
  return undefined;
}

function works(cmd: string, args: string[]): boolean {
  try {
    const r = cp.spawnSync(cmd, args, { timeout: 15000, windowsHide: true, encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

export function findPython(setting: string): Runner | undefined {
  const tries: [string, string[]][] = [];
  if (setting) tries.push([setting, []]);
  if (process.platform === "win32") tries.push(["py", ["-3"]], ["python", []], ["python3", []]);
  else tries.push(["python3", []], ["python", []]);
  for (const [cmd, pre] of tries) {
    if (works(cmd, [...pre, "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)"])) return { cmd, pre, how: cmd };
  }
  return undefined;
}

export function download(url: string, dest: string, hops = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "vscode-goome" }, timeout: 30000 }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (hops > 5) return reject(new Error("too many redirects"));
        return resolve(download(new URL(res.headers.location, url).toString(), dest, hops + 1));
      }
      if (code !== 200) {
        res.resume();
        return reject(new Error("github said " + code + " for " + url));
      }
      const part = dest + ".part";
      const out = fs.createWriteStream(part);
      res.pipe(out);
      out.on("finish", () => {
        out.close(() => {
          try {
            const head = fs.readFileSync(part, "utf8").slice(0, 200);
            if (!head.startsWith("#!") && !head.includes("import")) throw new Error("that download doesnt look like goome.py");
            fs.renameSync(part, dest);
            resolve();
          } catch (e) {
            fs.rmSync(part, { force: true });
            reject(e);
          }
        });
      });
      out.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("github took too long")));
    req.on("error", reject);
  });
}

export async function cliScript(storage: vscode.Uri): Promise<string> {
  const dir = storage.fsPath;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "goome.py");
  let fresh = false;
  try {
    fresh = Date.now() - fs.statSync(file).mtimeMs < 24 * 3600 * 1000;
  } catch {}
  if (fresh) return file;
  try {
    await download(CLI_URL, file);
  } catch (e) {
    if (!fs.existsSync(file)) throw e;
  }
  return file;
}

export async function findRunner(storage: vscode.Uri): Promise<Runner> {
  const cfg = vscode.workspace.getConfiguration("goome");
  const cli = (cfg.get<string>("cli") || "").trim();
  const py = (cfg.get<string>("python") || "").trim();
  if (cli) {
    if (cli.endsWith(".py")) {
      const p = findPython(py);
      if (!p) throw new Error("goome.cli is a .py file but theres no Python 3.8+ here");
      return { cmd: p.cmd, pre: [...p.pre, cli], how: cli };
    }
    return { cmd: cli, pre: [], how: cli };
  }
  const onPath = whichOnPath("goome");
  if (onPath && works(onPath, ["--version"])) return { cmd: onPath, pre: [], how: onPath };
  const p = findPython(py);
  if (!p) throw new Error("goome needs Python 3.8 or newer to make projects, and i couldnt find it. install it or set goome.python");
  const script = await cliScript(storage);
  return { cmd: p.cmd, pre: [...p.pre, script], how: script };
}

export function runCli(r: Runner, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(r.cmd, [...r.pre, ...args], { cwd, timeout: 180000, windowsHide: true, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      if (err) {
        const why = (stderr || stdout || err.message).trim().split(/\r?\n/).pop() || err.message;
        reject(new Error(why));
      } else resolve(stdout);
    });
  });
}

async function ask(args: NewProjectArgs): Promise<Required<Omit<NewProjectArgs, "extra">> | undefined> {
  let lang = args.lang;
  if (!lang) {
    const pick = await vscode.window.showQuickPick(LANGS.map((l) => ({ label: l.label, detail: l.detail, id: l.id })), { title: "goome: New Project", placeHolder: "which language?" });
    if (!pick) return undefined;
    lang = pick.id;
  }
  let template = args.template;
  if (!template) {
    const pick = await vscode.window.showQuickPick(TEMPLATES.map((t) => ({ label: t.label, detail: t.detail, id: t.id })), { title: "goome: New Project", placeHolder: "which template?" });
    if (!pick) return undefined;
    template = pick.id;
  }
  let folder = args.folder;
  if (!folder) {
    const ws = vscode.workspace.workspaceFolders;
    const got = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Make it in here", title: "where should the project go?", defaultUri: ws && ws.length ? ws[0].uri : undefined });
    if (!got || !got.length) return undefined;
    folder = got[0].fsPath;
  }
  let name = args.name;
  if (!name) {
    const parent = folder;
    name = await vscode.window.showInputBox({
      title: "goome: New Project",
      prompt: "name it",
      value: "my-goome-app",
      validateInput: (v) => {
        const bad = validName(v.trim());
        if (bad) return bad;
        const dest = path.join(parent, v.trim());
        if (fs.existsSync(dest) && (!fs.statSync(dest).isDirectory() || fs.readdirSync(dest).length)) return v.trim() + " already exists in there and isnt empty";
        return undefined;
      },
    });
    if (!name) return undefined;
  }
  name = name.trim();
  const bad = validName(name);
  if (bad) throw new Error(bad);
  return { lang, template, folder, name, open: args.open !== false };
}

export async function newProject(storage: vscode.Uri, args: NewProjectArgs = {}): Promise<string | undefined> {
  const a = await ask(args);
  if (!a) return undefined;
  const dest = path.join(a.folder, a.name);
  const out = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "making " + a.name + "..." }, async () => {
    const r = await findRunner(storage);
    return runCli(r, ["new", a.name, "--lang", a.lang, "--template", a.template, "--dir", dest, ...(args.extra || [])], a.folder);
  });
  if (!fs.existsSync(dest)) throw new Error("goome-cli finished but " + dest + " isnt there: " + out.trim());
  if (a.open) {
    const uri = vscode.Uri.file(dest);
    let newWindow = false;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) {
      const pick = await vscode.window.showInformationMessage("made " + a.name + ", open it?", "Open", "Open in New Window");
      if (!pick) return dest;
      newWindow = pick === "Open in New Window";
    }
    await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: newWindow });
  }
  return dest;
}
