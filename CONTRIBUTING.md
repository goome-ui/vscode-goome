<h1 align="center">🛠 Contributing to vscode-goome 🛠</h1>

<p align="center">
Small PRs that fix one thing are the easiest for me to check.<br>
Bugs in the preview or the generated code usually live in the builder, those go to <a href="https://github.com/goome-ui/docs">goome-ui/docs</a>. Bugs in goome itself go to <a href="https://github.com/goome-ui/c-goome">c-goome</a>.
</p>

<details>
<summary align="center"><b>📋 The short version 📋</b></summary>

<p align="center">
• One thing per PR<br>
• Open your PR against the <b>dev</b> branch, not main<br>
• Snippets use the real API names and argument orders, the tests check them against the bindings<br>
• If you add a snippet, add it for every language with the same prefix (Godot skips the three that dont make sense there)<br>
• No new runtime dependencies, the extension ships with none<br>
• Dont touch the protected files, a bot closes the PR if you do<br>
• CI has to pass<br>
• AI is fine, but say you used it and know what every line does
</p>
</details>

<details>
<summary align="center"><b>🚫 What gets closed automatically 🚫</b></summary>

<p align="center">
A bot checks every PR and closes it with a comment if it hits any of these.<br> <br>
• PRs that arent against <b>dev</b><br>
• Anything in <code>.github/</code><br>
• <code>package.json</code>, <code>package-lock.json</code> or <code>.vscodeignore</code><br>
• <code>LICENSE</code> or <code>media/icon.png</code><br>
• Files in <code>media/builder/</code>, the build copies those from the docs repo<br> <br>
Need one changed? <a href="https://github.com/goome-ui/vscode-goome/issues">Open an issue</a>.
</p>
</details>

<details>
<summary align="center"><b>🧪 Testing 🧪</b></summary>

```sh
npm ci
npm run compile
npm run unit
xvfb-run -a npm test
```

<p align="center">
Put <code>docs</code>, <code>c-goome</code>, <code>python-goome</code>, <code>csharp-goome</code>, <code>java-goome</code>, <code>rust-goome</code>, <code>node-goome</code>, <code>go-goome</code>, <code>zig-goome</code>, <code>lua-goome</code>, <code>godot-goome</code> and <code>goome-cli</code> next to this folder (or in <code>deps/</code>) and the unit tests check every name the snippets use against the real sources. Without them those tests get skipped.<br>
<code>npm test</code> starts VS Code with the extension loaded and checks the snippets, hover, schemas, preview, copy code and New Project. Leave out <code>xvfb-run</code> on windows and mac.
</p>
</details>

<details>
<summary align="center"><b>💬 Discussions and first issues 💬</b></summary>
<p align="center">
Questions and stuff you made with goome go in <a href="https://github.com/goome-ui/c-goome/discussions">Discussions</a>.<br>
If you want something to work on, the <a href="https://github.com/goome-ui/vscode-goome/labels/good%20first%20issue">good first issue</a> ones are small. Comment on one before you start.
</p>
</details>

<details>
<summary align="center"><b>🛡️ Security 🛡️</b></summary>

<p align="center">
Found a security hole? Dont open a public issue or PR for it, read <a href="https://github.com/goome-ui/.github/blob/main/SECURITY.md">SECURITY.md</a> and tell me privately first.
</p>
</details>

<p align="center">
By sending a PR you agree your code goes out under the same <a href="LICENSE">GPL-3.0 license</a> as the rest of vscode-goome.
</p>
