# Changelog

## Unreleased

- new Update goome button, bumps goome in your project to the newest version. it is in the side bar and the command palette (goome: Update goome), asks before it changes anything and before it runs the restore command

## 0.5.5

- the docs buttons, hover links and quick docs point at goome.wtf now, the old github.io links were broken
- Build for Web tells you it only works for C apps when you run it on another language, and says why
- new window flag GOOME_WINDOW_NO_CONSOLE
- the hover and quick docs link no longer sends a few functions to a page that doesnt exist
- the web build note in the readme and settings is right now, c-goome 0.5.5 has it

## 0.5.2

- Rust, Node (JavaScript and TypeScript), Go, Zig, Lua and Godot (GDScript) get the goome snippets, with the same prefixes as C, C#, Python and Java
- completion and hover for goome methods and constants in those languages, read out of the bindings at build time
- goome: New Project has all ten languages in the picker and the side bar, with the four templates each
- Copy code has Godot, Rust, Node, Go, Zig and Lua buttons, so all ten languages
- the readme has a table of what works in which language, Build for Web is C only for now
- goome: Build for Web builds a C app with goome build --web and opens it in the browser with goome serve
- goome: Stop Web Server, and a Build for Web button in the editor title, right click menu and side bar
- goome.web.goomePath setting for the c-goome checkout to build with

## 0.5.1

- the readme says its on the marketplace now instead of coming soon, with the vsix for VSCodium and other forks
- marketplace badge
