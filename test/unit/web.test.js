const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const src = require("./sources");
const web = require("../../out/webCore.js");

const pkg = JSON.parse(fs.readFileSync(path.join(src.root, "package.json"), "utf8"));
const runner = { cmd: "python3", pre: ["goome.py"], how: "goome.py" };

function fake(script) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.emit("close", null);
    };
    calls.push({ cmd, args, opts, child });
    setImmediate(() => script(child));
    return child;
  };
  return { spawn, calls };
}

test("build args put the file, out folder and goome folder in", () => {
  assert.deepStrictEqual(web.buildArgs("/a/main.c", "/a/web", ""), ["build", "--web", "/a/main.c", "--out", "/a/web"]);
  assert.deepStrictEqual(web.buildArgs("/a/main.c", "/a/web", "/src/c-goome"), ["build", "--web", "/a/main.c", "--out", "/a/web", "--goome", "/src/c-goome"]);
  assert.strictEqual(web.outFolder(path.join("a", "src", "main.c")), path.join("a", "src", "web"));
});

test("serve asks for any free port on localhost only", () => {
  assert.deepStrictEqual(web.serveArgs("/a/web"), ["serve", "/a/web", "--port", "0", "--bind", "127.0.0.1"]);
});

test("errors start at the first goome: line and keep the install hints", () => {
  const err = "warning: noise\ngoome: clang cant target wasm32\n  sudo apt install clang lld\n  brew install llvm lld\n\n";
  const lines = web.errorLines(err);
  assert.deepStrictEqual(lines, ["goome: clang cant target wasm32", "  sudo apt install clang lld", "  brew install llvm lld"]);
  assert.strictEqual(web.headline(lines, 1), "clang cant target wasm32");
  assert.deepStrictEqual(web.errorLines("boom\nlast words\n"), ["last words"]);
  assert.strictEqual(web.headline([], 3), "the build failed (exit 3)");
});

test("only c-goome problems offer the setting", () => {
  assert.ok(web.needsGoomeFolder(["goome: no c-goome found, pass --goome DIR"]));
  assert.ok(!web.needsGoomeFolder(["goome: overlays cant run in the browser"]));
});

test("serve url is read from the cli line", () => {
  assert.strictEqual(web.parseServeUrl("serving /a/web at http://localhost:43817/  (ctrl+c to stop)\n"), "http://localhost:43817/");
  assert.strictEqual(web.parseServeUrl("serving /a/web at http://loc"), undefined);
});

test("runBuild passes the args through and collects the output", async () => {
  const { spawn, calls } = fake((c) => {
    c.stdout.emit("data", "compiling\ndone\n");
    c.emit("close", 0);
  });
  const lines = [];
  const r = await web.runBuild(spawn, runner, ["build", "--web", "m.c"], "/a", (l) => lines.push(l));
  assert.strictEqual(r.code, 0);
  assert.deepStrictEqual(lines, ["compiling", "done"]);
  assert.strictEqual(calls[0].cmd, "python3");
  assert.deepStrictEqual(calls[0].args, ["goome.py", "build", "--web", "m.c"]);
  assert.strictEqual(calls[0].opts.cwd, "/a");
});

test("runBuild hands back stderr and the exit code on failure", async () => {
  const { spawn } = fake((c) => {
    c.stderr.emit("data", "goome: overlays cant run in the browser\n");
    c.emit("close", 1);
  });
  const r = await web.runBuild(spawn, runner, [], "/a", () => {});
  assert.strictEqual(r.code, 1);
  assert.strictEqual(web.headline(web.errorLines(r.stderr), r.code), "overlays cant run in the browser");
});

test("runBuild rejects when the runner wont start", async () => {
  const { spawn } = fake((c) => c.emit("error", new Error("spawn nope ENOENT")));
  await assert.rejects(web.runBuild(spawn, runner, [], "/a", () => {}), /ENOENT/);
});

test("startServer resolves with the url and can be stopped", async () => {
  const { spawn, calls } = fake((c) => c.stdout.emit("data", "serving /a/web at http://localhost:5050/  (ctrl+c to stop)\n"));
  const s = await web.startServer(spawn, runner, "/a/web", () => {});
  assert.strictEqual(s.url, "http://localhost:5050/");
  assert.deepStrictEqual(calls[0].args, ["goome.py", "serve", "/a/web", "--port", "0", "--bind", "127.0.0.1"]);
  s.child.kill();
  assert.ok(calls[0].child.killed);
});

test("startServer fails with the cli message when it dies early", async () => {
  const { spawn } = fake((c) => {
    c.stderr.emit("data", "goome: no index.html in /a/web, build it first with goome build --web\n");
    c.emit("close", 1);
  });
  await assert.rejects(web.startServer(spawn, runner, "/a/web", () => {}), /no index\.html/);
});

test("package.json has the web commands, setting and menus", () => {
  const cmds = pkg.contributes.commands.map((c) => c.command);
  assert.ok(cmds.includes("goome.buildWeb") && cmds.includes("goome.stopWebServer"));
  assert.strictEqual(pkg.contributes.configuration.properties["goome.web.goomePath"].type, "string");
  for (const menu of ["editor/title", "editor/context", "explorer/context"]) {
    const m = pkg.contributes.menus[menu].find((x) => x.command === "goome.buildWeb");
    assert.ok(m && m.when === "resourceExtname == .c", menu);
  }
});
