<p align="center">
  <img src="media/icon.png" alt="goome" width="150">
</p>

<h1 align="center">🧩 vscode-goome 🧩</h1>

<p align="center">
<b>goome in VS Code. Snippets, a new project command, a live preview for your .goome.json and docs when you hover.</b>
</p>

<p align="center">
  <img src="media/badge-vscode.png" alt="VS Code 1.90+" height="20">
  <a href="https://marketplace.visualstudio.com/items?itemName=goome-ui.vscode-goome"><img src="media/badge-marketplace.png" alt="VS Code Marketplace" height="20"></a>
  <img src="https://img.shields.io/badge/C%20%C2%B7%20C%23%20%C2%B7%20Python%20%C2%B7%20Java-1b1d22?style=flat-square&labelColor=6fdc5f" alt="C, C#, Python, Java">
  <img src="https://img.shields.io/badge/license-GPL--3.0-1b1d22?style=flat-square" alt="GPL-3.0">
</p>

<p align="center">
  Type <code>goome</code> in a C, C#, Python or Java file and you get the usual goome stuff, already using the real names and argument orders. Open a <code>.goome.json</code> from the UI builder and you can see it, and copy the code out of it, without leaving the editor.<br> <br>
  Do you like this project? If so, please let me know!
  <a href="https://sevvy-wevvy.com/discord">Discord</a>
</p>

<p align="center">
  <a href="https://goome-ui.github.io/docs/">Docs</a> &nbsp;·&nbsp;
  <a href="https://github.com/goome-ui/c-goome">goome</a> &nbsp;·&nbsp;
  <a href="https://goome-ui.github.io/docs/builder/">UI builder</a> &nbsp;·&nbsp;
  <a href="https://github.com/goome-ui/goome-cli">goome-cli</a>
</p>

<details>
<summary align="center"><b>⬇️ Easy Install ⬇️</b></summary>

<br>

<p align="center">
Its on the <a href="https://marketplace.visualstudio.com/items?itemName=goome-ui.vscode-goome">VS Code Marketplace</a>. Search <b>goome</b> in Extensions and hit Install, or from a terminal:
</p>

```sh
code --install-extension goome-ui.vscode-goome
```

<p align="center">
On VSCodium and the other forks it is on <a href="https://open-vsx.org/extension/goome-ui/vscode-goome">Open VSX</a>, or grab <code>vscode-goome-x.y.z.vsix</code> from the <a href="https://github.com/goome-ui/vscode-goome/releases/latest">latest release</a>, open Extensions, click the <b>...</b> at the top and pick <b>Install from VSIX...</b>
</p>
</details>

<details>
<summary align="center"><b>🚀 How To Use 🚀</b></summary>

<br>

<p align="center">
<b>Side bar</b> - click the goome icon in the activity bar. It has the quick actions, every <code>.goome.json</code> and <code>.goome-theme.json</code> in your workspace (click one to preview it), the templates for each language (click one and New Project starts with it picked) and a snippet cheat sheet that drops the snippet into your open file. The same file list also sits in the Explorer under your files<br>
<b>Snippets</b> - type <code>goome</code> and pick one. <code>goome-overlay</code> and <code>goome-app</code> are a whole program, <code>goome-loop</code> is the poll and pace loop, and theres one for every common widget, plus <code>goome-style</code>, <code>goome-custom</code>, <code>goome-offscreen</code>, <code>goome-hotkey</code>, <code>goome-theme-preset</code>, <code>goome-theme-make</code>, <code>goome-anim</code>, <code>goome-anim-color</code>, <code>goome-ease</code>, <code>goome-text-input</code>, <code>goome-a11y</code>, <code>goome-font-fallback</code> and <code>goome-text-dir</code>. Same names in all four languages<br>
<b>goome: New Project</b> - pick a language, a template, a folder and a name. It runs <a href="https://github.com/goome-ui/goome-cli">goome-cli</a> and opens what it made. If <code>goome</code> isnt on your PATH it downloads goome.py from the latest goome-cli release and runs that with Python, so you dont have to install anything besides Python<br>
<b>Preview</b> - open a <code>.goome.json</code> and hit the preview button at the top right (or <b>goome: Open Preview</b>). It draws the project with the UI builders own code and updates while you type. Its read only, <b>Open in the UI builder</b> takes you to the real thing<br>
<b>Copy code</b> - the C, C#, Python and Java buttons in the preview (or <b>goome: Copy Code From This Project</b>) put the builders generated code on your clipboard<br>
<b>Hover</b> - hover any <code>goome_*</code> function in C and you get its signature, the note from goome.h and a link to the docs<br>
<b>Schemas</b> - <code>.goome.json</code> and <code>.goome-theme.json</code> get checked while you edit them, so typos in widget types, theme fields and colors show up right away<br> <br>
Settings: <code>goome.cli</code> points at your own <code>goome</code> or <code>goome.py</code>, <code>goome.python</code> picks the Python it runs with.
</p>
</details>

<details>
<summary align="center"><b>🔨 Building It 🔨</b></summary>

<br>

<p align="center">
It wants <a href="https://github.com/goome-ui/docs">goome-ui/docs</a> and <a href="https://github.com/goome-ui/c-goome">c-goome</a> next to this folder (or <code>GOOME_DOCS</code> and <code>GOOME_C</code> set). The build copies the builder out of docs and makes the hover list out of goome.h.
</p>

```sh
npm ci
npm run compile
npm run unit
npm test
npx @vscode/vsce package
```

<p align="center">
<code>npm test</code> opens a real VS Code. On linux run it under <code>xvfb-run -a</code> so it doesnt pop up on your desktop.
</p>
</details>

<details>
<summary align="center"><b>🛠 Pull Requests 🛠</b></summary>

<br>

<p align="center">
Want to help with vscode-goome? Make A pull request to <b>dev</b>!<br>
Pull request allow for anyone to request a change to this code. In turn meaning that <b>YOU</b> can contribute to this project.<br> <br>
As long as it works, and doesnt vary off too far from the main idea its very likely it get accepted!<br>
Read <a href="CONTRIBUTING.md">CONTRIBUTING.md</a> before you send one.
</p>
</details>

<details>
<summary align="center"><b>⚖️ License ⚖️</b></summary>

<br>

<p align="center">
vscode-goome is under the <a href="LICENSE">GPL-3.0</a>.<br> <br>
<sub>
• You can use it, change it and share it<br>
• If you share something made with it, you have to share your source too, under the same license<br>
• Keep the credits
</sub><br> <br>
In short: play fair, keep it open, and give credit where it's due.
</p>
</details>

<details>
<summary align="center"><b>🩷 Donate 🩷</b></summary>

<br>

<p align="center">
<a href="https://sevvy-wevvy.com/kofi">Ko-fi</a> (Preferred)<br>
<a href="https://sevvy-wevvy.com/patreon">Patreon</a><br>
<a href="https://sevvy-wevvy.com/throne">Throne</a>
</p>
</details>
