# Marlinspike

*AKA "spike"*

<img width="455" height="281" alt="image" src="https://github.com/user-attachments/assets/7ecf15e2-264b-481d-a7c0-17e136833168" />


Visual Systems Implementation - IDE and Language Interfaces.

Marlinspike sits in a gap between three worlds that currently don't talk to each other — formal PL theory (interaction nets, arrows, Reo), practical visual programming (Node-RED, Flyde, Rete.js), and the emerging AI-native tooling wave (MCP, agentic IDEs). Each world has done its part in isolation. The synthesis is the novel contribution.

There are many facets to this system, and it is explained
in much greater detail in `DESIGN.md`, however here is a high-level overview:

* Graphs, with nodes, edges, subgraphs, properties
* A database of graphs - referencable by URI
* A JSON based serial format for graphs amenable to CRDT style workflows
* A UI for editing graphs - Convenient force-layout based graph editing UI
* Focus on what you currently care about - level of abstraction, property-sets, etc. - wear a persona hat
* Workflows, similar to "language-modes" in other IDEs
* Constraint systems - Impose topologies, property schemas, either defined or delegated
* Composable - Overlay compatible graphs or work to make them compatible - Reuse concepts directly via reference, or inheritence
* Collaborative - Delegate implementation work, or even design work to others - Marlinspike will help you make it coherent

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

## Issues and Ad-Hoc TODO Items

These are various random TODO items not formalised in DESIGN.md.

* [x] Fix broken stories
* [x] Make story items interactive
* [ ] Figure out how to save the IDE state (Maybe as a graph?)
* [x] Split out more components
* [ ] Explore making some components available as packages
* [ ] Limit the size of source files
* [ ] Figure out how to move hard-coded constraints into extensible constraint system
* [ ] Figure out how to encode graph ownership concerns in constraints
* [ ] Figure out overlaying graphs and constraints
* [ ] How is deletion possible in CRDT framework?
* [ ] User-scriptable layout
* [x] Edges should be splines, not line segments
* [x] Draw arrows on edge ends
* [ ] Add a toast element to show things like "copied X"
* [ ] Disconnected siblings are spaced too far apart
* [ ] General refactoring patterns such as enums instead of flags
* [ ] Seems like the sibling subgraph rendering isn't using my approach of virtual edges
* [ ] Can possibly move the edge creation mode constraints to generalised constraint framework (pending)
* [ ] Edges are generally too long - create a story to experiment with this until I find a parameter set I like
* [ ] In a top-to bottom layout the edge overlaps the subgraph below - still having issues with padding offset
* [ ] More than two edges between nodes doesn't distinguish with the ellipses
* [ ] Show edge ID/URI in inspector
* [ ] More indication that a node is an unexpanded subgraph
