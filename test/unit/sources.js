const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");

function find(envName, names) {
  const tries = [];
  if (process.env[envName]) tries.push(path.resolve(process.env[envName]));
  for (const n of names) tries.push(path.join(root, "..", n), path.join(root, "deps", n));
  return tries.find((p) => fs.existsSync(p)) || null;
}

function readTree(dir, ext) {
  let out = "";
  if (!dir || !fs.existsSync(dir)) return "";
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["bin", "obj", "build", "node_modules", ".git", "__pycache__", "tests", "test"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out += readTree(p, ext);
    else if (e.name.endsWith(ext)) out += fs.readFileSync(p, "utf8") + "\n";
  }
  return out;
}

function expand(body) {
  const text = Array.isArray(body) ? body.join("\n") : body;
  const choices = [...text.matchAll(/\$\{\d+\|([^|}]*)\|\}/g)].map((m) => m[1].split(","));
  const n = Math.max(1, ...choices.map((c) => c.length));
  const out = [];
  for (let i = 0; i < n; i++) {
    const defs = {};
    let k = 0;
    let t = text.replace(/\$\{(\d+)\|([^|}]*)\|\}/g, (_, num, opts) => {
      const o = opts.split(",");
      const v = o[i % o.length];
      defs[num] = v;
      k++;
      return v;
    });
    let prev;
    do {
      prev = t;
      t = t.replace(/\$\{(\d+):([^${}]*)\}/g, (_, num, def) => ((defs[num] = def), def));
    } while (t !== prev);
    t = t.replace(/\$\{(\d+)\}|\$(\d+)/g, (_, a, b) => defs[a || b] || "");
    out.push(t);
  }
  return out;
}

module.exports = {
  root,
  find,
  readTree,
  expand,
  cHeader: () => {
    const d = find("GOOME_C", ["c-goome"]);
    const p = d && path.join(d, "include", "goome.h");
    return p && fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  },
  python: () => readTree(find("GOOME_PY", ["python-goome"]) && path.join(find("GOOME_PY", ["python-goome"]), "goome"), ".py"),
  csharp: () => readTree(find("GOOME_CS", ["csharp-goome"]) && path.join(find("GOOME_CS", ["csharp-goome"]), "src"), ".cs"),
  java: () => readTree(find("GOOME_JAVA", ["java-goome"]) && path.join(find("GOOME_JAVA", ["java-goome"]), "goome", "src", "main"), ".java"),
};
