import * as fs from "fs";
import * as path from "path";

export interface ApiEntry {
  n: string;
  o: string;
  s: string;
  k: "fn" | "const" | "prop";
  c?: string;
}

export interface ApiMap {
  langs: Record<string, ApiEntry[]>;
}

export interface ApiLang {
  id: string;
  label: string;
  fence: string;
  editors: string[];
}

export const API_LANGS: ApiLang[] = [
  { id: "rust", label: "Rust", fence: "rust", editors: ["rust"] },
  { id: "node", label: "Node", fence: "typescript", editors: ["javascript", "javascriptreact", "typescript", "typescriptreact"] },
  { id: "go", label: "Go", fence: "go", editors: ["go"] },
  { id: "zig", label: "Zig", fence: "zig", editors: ["zig"] },
  { id: "lua", label: "Lua", fence: "lua", editors: ["lua"] },
  { id: "godot", label: "Godot", fence: "gdscript", editors: ["gdscript"] },
];

export function apiLang(languageId: string): ApiLang | undefined {
  return API_LANGS.find((l) => l.editors.includes(languageId));
}

export function loadApiMap(extensionPath: string): ApiMap {
  try {
    return JSON.parse(fs.readFileSync(path.join(extensionPath, "media", "api.json"), "utf8")) as ApiMap;
  } catch {
    return { langs: {} };
  }
}

const GROUPS: [RegExp, RegExp][] = [
  [/^(ui|u)$/i, /^(ui|uiframe|scope|goomeui)$/i],
  [/^(c|cv|canvas|frame|draw)$/i, /^(canvas|draw|frame|uicanvas|ownedcanvas)$/i],
  [/^(g|gm|goome_?obj)$/i, /^(g|goome)$/i],
  [/^(app|a)$/i, /^(app|appframe)$/i],
  [/^(theme|th|t)$/i, /^(theme|config|style)$/i],
  [/^(cfg|config)$/i, /^(config|uiconfig)$/i],
  [/^(bmp|bitmap|img|image)$/i, /^(bitmap|image)$/i],
  [/^(font|f)$/i, /^font$/i],
  [/^(win|window|state)$/i, /^(window|windowstate)$/i],
  [/^(ev|event|e)$/i, /^event$/i],
  [/^(view|goomeview)$/i, /^goomeview$/i],
  [/^(pace|pacer)$/i, /^pacer$/i],
];

export function ownerMatches(receiver: string, owner: string): boolean {
  if (receiver.toLowerCase() === owner.toLowerCase()) return true;
  return GROUPS.some(([r, o]) => r.test(receiver) && o.test(owner));
}

export interface Access {
  receiver: string;
  member: string;
}

const MODULES = /^(goome|goomeui|goomeview)$/i;

export function entriesFor(map: ApiMap, lang: string, a: Access): ApiEntry[] {
  const list = map.langs[lang] || [];
  const module = MODULES.test(a.receiver);
  return list.filter((e) => e.n === a.member && (e.o === "goome" ? module || ownerMatches(a.receiver, e.o) : ownerMatches(a.receiver, e.o)));
}

export function completionsFor(map: ApiMap, lang: string, receiver: string): ApiEntry[] {
  const list = map.langs[lang] || [];
  const module = MODULES.test(receiver);
  return list.filter((e) => (e.o === "goome" ? module : ownerMatches(receiver, e.o) || (module && e.o === "GoomeUI" && e.k === "const")));
}

export function accessAt(line: string, col: number): Access | undefined {
  const word = /[A-Za-z_]\w*/g;
  for (let m = word.exec(line); m; m = word.exec(line)) {
    if (col < m.index || col > m.index + m[0].length) continue;
    const before = line.slice(0, m.index);
    const dot = /([A-Za-z_]\w*)\s*(?:\.|::|:)\s*$/.exec(before);
    return { receiver: dot ? dot[1] : "", member: m[0] };
  }
  return undefined;
}

export function receiverBefore(line: string, col: number): string | undefined {
  const m = /([A-Za-z_]\w*)\s*(?:\.|::|:)\s*\w*$/.exec(line.slice(0, col));
  return m ? m[1] : undefined;
}

export function mentionsGoome(text: string): boolean {
  return /goome/i.test(text);
}

export interface Docs {
  functions: Record<string, { sig: string; note: string; url: string }>;
  docs: string;
}

function escape(text: string): string {
  return text.replace(/[\\`*_{}[\]<>#|]/g, "\\$&");
}

export function hoverMarkdown(entries: ApiEntry[], docs: Docs, lang: ApiLang): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.o + e.s)) continue;
    seen.add(e.o + e.s);
    const c = e.c ? docs.functions[e.c] : undefined;
    let md = "```" + lang.fence + "\n" + e.s + "\n```\n";
    md += "*" + escape(e.o === "goome" ? "goome" : e.o) + "*\n\n";
    if (c && c.note) md += escape(c.note) + "\n\n";
    if (c && lang.id === "lua") md += "wraps the C function\n```c\n" + c.sig + "\n```\n";
    md += "[goome docs](" + (c ? c.url : docs.docs) + ")";
    parts.push(md);
  }
  return parts.join("\n\n---\n\n");
}
