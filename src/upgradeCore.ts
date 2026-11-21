export type UpgradeOutcome =
  | { kind: "available"; message: string; current: string; latest: string; lang: string }
  | { kind: "upToDate"; message: string }
  | { kind: "applied"; message: string; next?: string }
  | { kind: "notProject"; message: string }
  | { kind: "oldCli"; message: string }
  | { kind: "error"; message: string };

export function upgradeArgs(dir: string, check: boolean): string[] {
  const args = ["upgrade"];
  if (check) args.push("--check");
  args.push("--json", "--dir", dir);
  return args;
}

function parseJson(stdout: string): Record<string, unknown> | undefined {
  const text = stdout.trim();
  if (!text) return undefined;
  const tries = [text, text.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).pop() || ""];
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {}
  }
  return undefined;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function interpretUpgrade(code: number | null, stdout: string, stderr: string, check: boolean): UpgradeOutcome {
  const json = parseJson(stdout);
  if (!json && /invalid choice/i.test(stderr)) return { kind: "oldCli", message: "update the goome cli first" };
  if (code === 2) return { kind: "notProject", message: "this doesnt look like a goome project" };
  if (code === 3 || code === 4) {
    const why = text(json?.error) || stderr.trim().split(/\r?\n/).pop() || "";
    return { kind: "error", message: why || "goome upgrade failed (exit " + code + ")" };
  }
  if (!json) return { kind: "error", message: "couldnt read what goome upgrade said" + (code === null ? "" : " (exit " + code + ")") };
  if (json.ok === false) return { kind: "error", message: text(json.error) || "goome upgrade failed" };
  const current = text(json.current);
  const latest = text(json.latest);
  const lang = text(json.lang);
  if (check) {
    if (json.update === true || code === 10) {
      return { kind: "available", message: "goome " + current + " -> " + latest + (lang ? " (" + lang + ")" : ""), current, latest, lang };
    }
    if (code !== 0 && code !== null) return { kind: "error", message: "goome upgrade failed (exit " + code + ")" };
    return { kind: "upToDate", message: "goome is up to date (" + current + ")" };
  }
  if (code !== 0) return { kind: "error", message: text(json.error) || "goome upgrade failed (exit " + code + ")" };
  if (json.applied === true) {
    const next = text(json.next) || undefined;
    return { kind: "applied", message: "updated goome to " + latest + (lang ? " (" + lang + ")" : ""), next };
  }
  return { kind: "upToDate", message: "goome is up to date (" + current + ")" };
}
