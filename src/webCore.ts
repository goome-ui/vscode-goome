import * as cp from "child_process";
import * as path from "path";
import type { Runner } from "./newProject";

export type Spawn = (cmd: string, args: string[], opts: cp.SpawnOptions) => cp.ChildProcess;

export interface BuildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface Server {
  url: string;
  dir: string;
  child: cp.ChildProcess;
}

const EXT_LANG: Record<string, string> = { ".cs": "C#", ".py": "Python", ".java": "Java", ".kt": "Kotlin", ".rs": "Rust", ".go": "Go", ".zig": "Zig", ".lua": "Lua", ".js": "JavaScript", ".mjs": "JavaScript", ".ts": "TypeScript", ".gd": "GDScript" };
const FILE_LANG: [string, string][] = [["project.godot", "Godot"], ["Cargo.toml", "Rust"], ["go.mod", "Go"], ["build.zig", "Zig"], ["pyproject.toml", "Python"], ["requirements.txt", "Python"], ["build.gradle", "Java"], ["build.gradle.kts", "Kotlin"], ["pom.xml", "Java"], ["package.json", "JavaScript"]];

export function languageOfFile(file: string): string | undefined {
  return EXT_LANG[path.extname(file).toLowerCase()];
}

export function languageOfFolder(names: string[]): string | undefined {
  if (names.some((n) => /\.(csproj|sln)$/i.test(n))) return "C#";
  if (names.some((n) => /\.rockspec$/i.test(n))) return "Lua";
  return FILE_LANG.find(([f]) => names.includes(f))?.[1];
}

export function notCMessage(lang: string): string {
  return "building for the web only works for C apps right now, this looks like a " + lang + " project. the web build compiles C, so the same app needs to be written in C to go in the browser. try it live at https://goome.wtf/builder/ or see https://goome.wtf/docs/browser/";
}

export function buildArgs(file: string, out: string, goomePath: string): string[] {
  const args = ["build", "--web", file, "--out", out];
  if (goomePath) args.push("--goome", goomePath);
  return args;
}

export function serveArgs(dir: string): string[] {
  return ["serve", dir, "--port", "0", "--bind", "127.0.0.1"];
}

export function outFolder(file: string): string {
  return path.join(path.dirname(file), "web");
}

export function errorLines(stderr: string, stdout = ""): string[] {
  const lines = (stderr || stdout).split(/\r?\n/).map((l) => l.trimEnd());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const at = lines.findIndex((l) => l.startsWith("goome: "));
  return at >= 0 ? lines.slice(at) : lines.slice(-1);
}

export function headline(lines: string[], code: number | null): string {
  const first = (lines[0] || "").replace(/^goome:\s*/, "").trim();
  return first || "the build failed" + (code === null ? "" : " (exit " + code + ")");
}

export function needsGoomeFolder(lines: string[]): boolean {
  return /c-goome|--goome|checkout|download/i.test(lines.join("\n"));
}

export function parseServeUrl(text: string): string | undefined {
  const m = /\bat (https?:\/\/[^\s/]+:\d+\/)/.exec(text);
  return m ? m[1] : undefined;
}

function launch(spawn: Spawn, r: Runner, args: string[], cwd: string): cp.ChildProcess {
  return spawn(r.cmd, [...r.pre, ...args], { cwd, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
}

export function runBuild(spawn: Spawn, r: Runner, args: string[], cwd: string, onLine: (line: string) => void): Promise<BuildResult> {
  return new Promise((resolve, reject) => {
    const child = launch(spawn, r, args, cwd);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      const s = String(d);
      stdout += s;
      s.split(/\r?\n/).filter(Boolean).forEach(onLine);
    });
    child.stderr?.on("data", (d) => {
      const s = String(d);
      stderr += s;
      s.split(/\r?\n/).filter(Boolean).forEach(onLine);
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export function startServer(spawn: Spawn, r: Runner, dir: string, onLine: (line: string) => void): Promise<Server> {
  return new Promise((resolve, reject) => {
    const child = launch(spawn, r, serveArgs(dir), dir);
    let out = "";
    let err = "";
    let done = false;
    child.stdout?.on("data", (d) => {
      const s = String(d);
      out += s;
      s.split(/\r?\n/).filter(Boolean).forEach(onLine);
      const url = !done && parseServeUrl(out);
      if (url) {
        done = true;
        resolve({ url, dir, child });
      }
    });
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
    child.on("close", (code) => {
      if (!done) {
        done = true;
        reject(new Error(headline(errorLines(err, out), code)));
      }
    });
  });
}
