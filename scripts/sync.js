const fs = require("fs");
const path = require("path");
const api = require("./api");

const root = path.join(__dirname, "..");
const BUILDER_FILES = ["model.js", "codegen.js", "elements.js", "app.js", "stage.js", "vars.js", "style.css", "elements.css"];
const DOCS_URL = "https://goome.wtf/docs/";

function find(envName, names) {
  const tries = [];
  if (process.env[envName]) tries.push(path.resolve(process.env[envName]));
  for (const n of names) tries.push(path.join(root, "..", n), path.join(root, "deps", n));
  return tries.find((p) => fs.existsSync(p)) || null;
}

function parseHeader(text) {
  const out = {};
  const re = /^([A-Za-z_][\w\s\*]*?[\s\*])(goome_\w+)\s*\(([^;]*)\)\s*;\s*(?:\/\/\s*(.*))?$/;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#") || line.startsWith("//") || line.startsWith("typedef")) continue;
    const m = re.exec(line);
    if (!m) continue;
    const sig = (m[1].trim() + " " + m[2] + "(" + m[3].trim() + ");").replace(/\*\s+goome_/, "*goome_");
    out[m[2]] = { sig, note: (m[4] || "").trim() };
  }
  return out;
}

function docPages(docs) {
  const pages = {};
  if (!docs) return pages;
  const dir = path.join(docs, "pages");
  if (!fs.existsSync(dir)) return pages;
  for (const f of fs.readdirSync(dir).filter((f) => /^api-.*\.md$/.test(f)).sort()) {
    const slug = f.replace(/\.md$/, "");
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/)) {
      const m = /^#{2,4}\s+(goome_\w+)\s*$/.exec(line);
      if (m && !pages[m[1]]) pages[m[1]] = slug + "/#" + m[1];
    }
  }
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("api-") && f !== "index.md").sort()) {
    const slug = f.replace(/\.md$/, "");
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of text.matchAll(/\b(goome_\w+)\s*\(/g)) if (!pages[m[1]]) pages[m[1]] = slug + "/";
  }
  return pages;
}

function writeApi(functions) {
  const file = path.join(root, "media", "api.json");
  const langs = api.build(root, functions);
  const have = Object.keys(langs);
  if (!have.length) {
    if (fs.existsSync(file)) console.log("no bindings found, keeping media/api.json");
    else console.log("no bindings found, no api.json made");
    return;
  }
  let old = {};
  try {
    old = JSON.parse(fs.readFileSync(file, "utf8")).langs;
  } catch {}
  fs.writeFileSync(file, JSON.stringify({ langs: Object.assign(old, langs) }) + "\n");
  console.log("api names for " + have.map((l) => l + " " + langs[l].length).join(", "));
}

function main() {
  const docs = find("GOOME_DOCS", ["goome-docs", "docs"]);
  const cgoome = find("GOOME_C", ["c-goome"]);
  const media = path.join(root, "media");
  const outBuilder = path.join(media, "builder");
  const hoverFile = path.join(media, "hover.json");

  const website = find("GOOME_WEBSITE", ["website", "website-source"]);
  const builder = [docs && path.join(docs, "builder"), website && path.join(website, "src", "builder")].find((d) => d && fs.existsSync(path.join(d, "model.js")));
  if (builder) {
    fs.mkdirSync(outBuilder, { recursive: true });
    for (const f of BUILDER_FILES) fs.copyFileSync(path.join(builder, f), path.join(outBuilder, f));
    console.log("copied the builder from " + builder);
  } else if (BUILDER_FILES.every((f) => fs.existsSync(path.join(outBuilder, f)))) {
    console.log("no goome-docs found, keeping the builder copy thats already in media/builder");
  } else {
    console.error("cant find the builder. put website next to this folder (or in deps/) or set GOOME_WEBSITE");
    process.exit(1);
  }

  const header = cgoome && path.join(cgoome, "include", "goome.h");
  if (header && fs.existsSync(header)) {
    const fns = parseHeader(fs.readFileSync(header, "utf8"));
    const pages = docPages(docs);
    const version = (/#define GOOME_VERSION "([^"]+)"/.exec(fs.readFileSync(header, "utf8")) || [])[1] || "";
    for (const name of Object.keys(fns)) fns[name].url = DOCS_URL + (pages[name] || "");
    fs.writeFileSync(hoverFile, JSON.stringify({ version, docs: DOCS_URL, functions: fns }, null, 1) + "\n");
    console.log("hover docs for " + Object.keys(fns).length + " functions from " + header);
    writeApi(fns);
  } else if (fs.existsSync(hoverFile)) {
    console.log("no c-goome found, keeping media/hover.json");
  } else {
    console.error("cant find c-goome/include/goome.h. put c-goome next to this folder or set GOOME_C");
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { parseHeader, docPages };
