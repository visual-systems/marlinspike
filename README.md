# Marlinspike

*AKA "spike"*

<img width="455" height="281" alt="image" src="https://github.com/user-attachments/assets/7ecf15e2-264b-481d-a7c0-17e136833168" />


Visual Systems Implementation - IDE and Language Interfaces.

Marlinspike sits in a gap between three worlds that currently don't talk to each other — formal PL theory (interaction nets, arrows, Reo), practical visual programming (Node-RED, Flyde, Rete.js), and the emerging AI-native tooling wave (MCP, agentic IDEs). Each world has done its part in isolation. The synthesis is the novel contribution.

See [`DESIGN.md`](DESIGN.md) for a detailed overview of the architecture, goals, and roadmap.

## Development

Marlinspike is implemented in [Deno](https://deno.com). Install Deno v2 before getting started.

| Task | Command |
|---|---|
| Dev server (watch mode) | `deno task dev` |
| Run tests | `deno task test` |
| Format | `deno task fmt` |
| Lint | `deno task lint` |
| Type check | `deno task check` |
| Smoke test (server starts and exits) | `deno task smoke` |

The dev server starts an HTTP server on port 8000. Tests cover the base graph JSON Schema validation.

For editor support, install the [Deno VSCode extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) — the repository includes `.vscode/settings.json` to enable it automatically.
