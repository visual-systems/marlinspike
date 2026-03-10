# Marlinspike

*AKA "spike"*

<img width="455" height="281" alt="image" src="https://github.com/user-attachments/assets/7ecf15e2-264b-481d-a7c0-17e136833168" />


Visual Systems Implementation - IDE and Language Interfaces.

Marlinspike sits in a gap between three worlds that currently don't talk to each other — formal PL theory (interaction nets, arrows, Reo), practical visual programming (Node-RED, Flyde, Rete.js), and the emerging AI-native tooling wave (MCP, agentic IDEs). Each world has done its part in isolation. The synthesis is the novel contribution.

See [`DESIGN.md`](DESIGN.md) for a detailed overview of the architecture, goals, and roadmap.

## Development

Marlinspike is implemented in [Deno](https://deno.com). Install Deno v2 before getting started.

Start a development server with automatic change reloading with `deno task dev`. Visit http://localhost:8000/ for the main app, and http://localhost:8000/stories for UI story explorer.

Run tasks with `deno task`:

```
> deno task
Available tasks:
- dev
    deno run --watch --allow-net --allow-read --allow-env mod.tsx
- start
    deno run --allow-net --allow-read --allow-env mod.tsx
- smoke
    deno run --allow-net --allow-read --allow-env mod.tsx --timeout 3000
- fmt
    deno fmt
- lint
    deno lint --fix
- test
    deno test --allow-read
- check
    deno check mod.tsx src/graph/**/*.ts src/ui/App.tsx src/ui/StoriesShell.tsx src/ui/workspace.ts
- check-ui
    deno check --config deno.client.json src/ui/client.tsx src/ui/stories/main.tsx
```

For editor support, install the [Deno VSCode extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) — the repository includes `.vscode/settings.json` to enable it automatically.
