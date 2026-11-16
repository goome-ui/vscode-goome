import * as path from "path";

export const CODE_LANGS: Record<string, string> = { c: "C", cs: "C#", py: "Python", java: "Java", gd: "Godot" };

const EXTRA_LANGS: Record<string, string> = { rust: "Rust", node: "Node", go: "Go", zig: "Zig", lua: "Lua" };

export interface GenResult {
  code: string;
  warnings: { id: string; msg: string }[];
}

type Generator = { generate(project: unknown, lang: string): GenResult; langs?: Record<string, { label?: string }> };

let cached: { gm: { normProject(o: unknown): unknown }; x: Generator } | null = null;

function load(extensionPath: string) {
  if (!cached) {
    const dir = path.join(extensionPath, "media", "builder");
    const gm = require(path.join(dir, "model.js"));
    const x = require(path.join(dir, "codegen.js"));
    cached = { gm, x };
  }
  return cached;
}

export function codeLangs(extensionPath: string): Record<string, string> {
  const out = { ...CODE_LANGS };
  const reg = load(extensionPath).x.langs || {};
  for (const id of Object.keys(EXTRA_LANGS)) if (reg[id]) out[id] = reg[id].label || EXTRA_LANGS[id];
  return out;
}

export function generateCode(extensionPath: string, text: string, lang: string): GenResult {
  if (!codeLangs(extensionPath)[lang]) throw new Error("goome cant make " + lang + " code");
  const { gm, x } = load(extensionPath);
  const obj = JSON.parse(text);
  return x.generate(gm.normProject(obj), lang);
}
