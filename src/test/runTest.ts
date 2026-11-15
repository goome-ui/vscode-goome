import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const work = path.join(root, ".vscode-test");
  try {
    await runTests({
      version: process.env.VSCODE_VERSION || "stable",
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(__dirname, "suite", "index"),
      launchArgs: [path.join(root, "test", "fixtures"), "--disable-extensions", "--disable-gpu", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--user-data-dir", path.join(work, "user")],
      extensionTestsEnv: { GOOME_TEST_WORK: path.join(work, "work") },
    });
  } catch (e) {
    console.error("tests failed: " + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }
}

main();
