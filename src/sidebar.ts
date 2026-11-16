import * as fs from "fs";
import * as path from "path";

export const DOCS_URL = "https://goome-ui.github.io/docs/";
export const BUILDER_URL = "https://goome-ui.github.io/docs/builder/";
export const FILE_GLOB = "**/*.{goome.json,goome-theme.json}";

export interface Choice {
  id: string;
  label: string;
  detail: string;
  icon?: string;
}

export const LANGS: Choice[] = [
  { id: "c", label: "C", detail: "one goome.h, builds with any C compiler" },
  { id: "csharp", label: "C#", detail: ".NET 8 or newer" },
  { id: "python", label: "Python", detail: "Python 3.8 or newer" },
  { id: "java", label: "Java", detail: "Java 22 or newer, Gradle" },
  { id: "godot", label: "Godot", detail: "Godot 4.4 or newer, GDScript" },
];

export const TEMPLATES: Choice[] = [
  { id: "app", label: "app", detail: "a normal window, with a toggle that turns it into an overlay", icon: "window" },
  { id: "overlay", label: "overlay", detail: "a see-through overlay, only the window takes clicks", icon: "layers" },
  { id: "mod-menu", label: "mod-menu", detail: "a menu over the game that a hotkey opens and closes", icon: "list-flat" },
  { id: "hud", label: "hud", detail: "a little info panel in the corner, clicks go through it", icon: "dashboard" },
];

export const SNIPPET_LANGS: Record<string, { file: string; label: string }> = {
  c: { file: "c.json", label: "C" },
  csharp: { file: "csharp.json", label: "C#" },
  python: { file: "python.json", label: "Python" },
  java: { file: "java.json", label: "Java" },
};

export interface Node {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: string;
  file?: string;
  command?: string;
  args?: unknown[];
  children?: Node[];
  open?: boolean;
}

export interface Snippet {
  prefix: string;
  description: string;
  body: string;
}

export function snippetLang(languageId?: string): string {
  if (languageId === "cpp") return "c";
  return languageId && SNIPPET_LANGS[languageId] ? languageId : "c";
}

export function readSnippets(extensionPath: string, lang: string): Snippet[] {
  const info = SNIPPET_LANGS[lang];
  if (!info) return [];
  const raw = JSON.parse(fs.readFileSync(path.join(extensionPath, "snippets", info.file), "utf8")) as Record<string, { prefix: string; description: string; body: string | string[] }>;
  return Object.values(raw).map((s) => ({ prefix: s.prefix, description: s.description, body: Array.isArray(s.body) ? s.body.join("\n") : s.body }));
}

export function quickActions(): Node[] {
  return [
    { id: "quick/new", label: "New Project", icon: "new-folder", command: "goome.newProject", tooltip: "Make a goome project with goome-cli" },
    { id: "quick/web", label: "Build for Web", icon: "globe", command: "goome.buildWeb", tooltip: "Compile a C app to webassembly and run it in the browser" },
    { id: "quick/builder", label: "Open UI builder", icon: "layout", command: "goome.openBuilder", tooltip: BUILDER_URL },
    { id: "quick/search", label: "Search docs", icon: "search", command: "goome.searchDocs", tooltip: "Find a goome function and open its docs" },
    { id: "quick/docs", label: "Open docs", icon: "book", command: "goome.openDocs", tooltip: DOCS_URL },
  ];
}

export function templateNodes(): Node[] {
  return LANGS.map((l) => ({
    id: "templates/" + l.id,
    label: l.label,
    description: l.detail,
    icon: "code",
    children: TEMPLATES.map((t) => ({
      id: "templates/" + l.id + "/" + t.id,
      label: t.label,
      description: l.label,
      tooltip: t.detail,
      icon: t.icon,
      command: "goome.newProject",
      args: [{ lang: l.id, template: t.id }],
    })),
  }));
}

function relDir(file: string, roots: string[]): string {
  const root = roots.filter((r) => file === r || file.startsWith(r.endsWith(path.sep) ? r : r + path.sep)).sort((a, b) => b.length - a.length)[0];
  const dir = path.dirname(root ? path.relative(root, file) : file);
  return dir === "." ? "" : dir.split(path.sep).join("/");
}

export function builderFileNodes(files: string[], roots: string[]): Node[] {
  const seen = new Set<string>();
  return files
    .filter((f) => /\.goome(-theme)?\.json$/.test(f) && !seen.has(f) && seen.add(f))
    .map((f) => ({ f, dir: relDir(f, roots), name: path.basename(f) }))
    .sort((a, b) => (a.dir + "/" + a.name).localeCompare(b.dir + "/" + b.name))
    .map(({ f, dir, name }) => ({
      id: "files/" + f,
      label: name,
      description: dir,
      tooltip: f,
      file: f,
      command: "goome.openFile",
    }));
}

export function snippetNodes(snippets: Snippet[], lang: string): Node[] {
  return snippets.map((s) => ({
    id: "snippets/" + lang + "/" + s.prefix,
    label: s.prefix,
    description: s.description,
    tooltip: s.body,
    icon: "symbol-snippet",
    command: "goome.insertSnippet",
    args: [lang, s.prefix],
  }));
}

const emptyFiles: Node = { id: "files/none", label: "none yet, make one in the UI builder", icon: "info", command: "goome.openBuilder", tooltip: BUILDER_URL };

export function rootNodes(files: string[], roots: string[], snippets: Snippet[], lang: string): Node[] {
  const builder = builderFileNodes(files, roots);
  return [
    { id: "quick", label: "Quick actions", icon: "zap", open: true, children: quickActions() },
    { id: "files", label: "Builder files", icon: "files", open: true, description: String(builder.length), children: builder.length ? builder : [emptyFiles] },
    { id: "templates", label: "Templates", icon: "rocket", open: true, children: templateNodes() },
    { id: "snippets", label: "Snippets", icon: "symbol-snippet", description: SNIPPET_LANGS[lang].label, open: false, children: snippetNodes(snippets, lang) },
  ];
}
