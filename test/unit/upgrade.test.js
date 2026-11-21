const test = require("node:test");
const assert = require("node:assert");
const up = require("../../out/upgradeCore.js");

const check = (extra) => JSON.stringify({ ok: true, lang: "csharp", root: "/w", current: "0.5.5", latest: "0.5.7", update: true, files: ["MyApp.csproj"], next: "dotnet restore", ...extra });

test("args put check, json and dir in", () => {
  assert.deepStrictEqual(up.upgradeArgs("/w", true), ["upgrade", "--check", "--json", "--dir", "/w"]);
  assert.deepStrictEqual(up.upgradeArgs("/w", false), ["upgrade", "--json", "--dir", "/w"]);
});

test("exit 10 is an update that can be applied", () => {
  const r = up.interpretUpgrade(10, check(), "", true);
  assert.strictEqual(r.kind, "available");
  assert.strictEqual(r.message, "goome 0.5.5 -> 0.5.7 (csharp)");
});

test("up to date", () => {
  const r = up.interpretUpgrade(0, check({ update: false, latest: "0.5.5" }), "", true);
  assert.deepStrictEqual(r, { kind: "upToDate", message: "goome is up to date (0.5.5)" });
});

test("applied carries the next command", () => {
  const r = up.interpretUpgrade(0, check({ applied: true }), "", false);
  assert.strictEqual(r.kind, "applied");
  assert.strictEqual(r.next, "dotnet restore");
  assert.strictEqual(up.interpretUpgrade(0, check({ applied: true, next: undefined }), "", false).next, undefined);
});

test("not a goome project", () => {
  const r = up.interpretUpgrade(2, JSON.stringify({ ok: false, error: "no pin" }), "", true);
  assert.deepStrictEqual(r, { kind: "notProject", message: "this doesnt look like a goome project" });
});

test("too old cli", () => {
  const err = "goome: error: argument command: invalid choice: 'upgrade' (choose from 'new', 'build')";
  const r = up.interpretUpgrade(2, "", err, true);
  assert.deepStrictEqual(r, { kind: "oldCli", message: "update the goome cli first" });
});

test("exit 3 and 4 show the error from the json", () => {
  for (const code of [3, 4]) {
    const r = up.interpretUpgrade(code, JSON.stringify({ ok: false, error: "zig is missing" }), "", false);
    assert.deepStrictEqual(r, { kind: "error", message: "zig is missing" });
  }
  const r = up.interpretUpgrade(4, "", "goome: registry down\n", true);
  assert.strictEqual(r.message, "goome: registry down");
});

test("malformed json is an error, not a crash", () => {
  assert.strictEqual(up.interpretUpgrade(0, "{nope", "", true).kind, "error");
  assert.strictEqual(up.interpretUpgrade(10, "", "", true).kind, "error");
  assert.strictEqual(up.interpretUpgrade(null, "[]", "", true).kind, "error");
});
