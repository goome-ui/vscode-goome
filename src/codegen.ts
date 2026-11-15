import * as path from "path";

export const CODE_LANGS: Record<string, string> = { c: "C", cs: "C#", py: "Python", java: "Java" };

export interface GenResult {
  code: string;
  warnings: { id: string; msg: string }[];
}

type Generator = { generate(project: unknown, lang: string): GenResult };

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

export function generateCode(extensionPath: string, text: string, lang: string): GenResult {
  if (!CODE_LANGS[lang]) throw new Error("goome cant make " + lang + " code");
  const { gm, x } = load(extensionPath);
  const obj = JSON.parse(text);
  return x.generate(gm.normProject(obj), lang);
}
