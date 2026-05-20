# Marlinspike

*AKA "spike"*

<img width="1303" height="720" alt="image" src="https://github.com/user-attachments/assets/c6e6d192-1844-4b8f-893a-f0ebec94228d" />

Visual Systems Implementation - IDE and Language Interfaces.

Marlinspike sits in a gap between three worlds that currently don't talk to each other — formal PL theory (interaction nets, arrows, Reo), practical visual programming (Node-RED, Flyde, Rete.js), and the emerging AI-native tooling wave (MCP, agentic IDEs). Each world has done its part in isolation. The synthesis is the novel contribution.

See [`DESIGN.md`](DESIGN.md) for a detailed overview of the architecture, goals, and roadmap.

## Live Demo

**[marlinspike.sordina.deno.net](https://marlinspike.sordina.deno.net)** — main app
**[marlinspike.sordina.deno.net/stories](https://marlinspike.sordina.deno.net/stories)** — UI story explorer with example graphs

## Development

Marlinspike is implemented in [Deno](https://deno.com). Install Deno v2 before getting started.

Start a development server with automatic change reloading with `deno task dev`. Visit http://localhost:8000/ for the main app, and http://localhost:8000/stories for UI story explorer.

List available tasks with `deno task`:

For editor support, install the [Deno VSCode extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) — the repository includes `.vscode/settings.json` to enable it automatically.
