# Examples Folder

**Branch:** lyndon/examples-folder
**Date:** 2026-04-19
**Branch Preview:** <!-- replace me -->

## Context

The project has a rich vision document (DESIGN.md) but no concrete illustrations of how Marlinspike
would be used in practice. The "Notions Not Yet Explored" section (§15) mentions example projects
but they're abstract one-liners. Concrete examples — even aspirational ones that don't run yet —
make the vision tangible for contributors, potential users, and for re-evaluating design decisions
as implementation progresses.

## Goal

Create an `examples/` directory with three example stubs that illustrate different facets of
Marlinspike's vision. Each example has a README and Spike-Clojure source files that sketch the
graph structure. These are aspirational — they envision future capabilities rather than working
demos. Update DESIGN.md to describe the examples convention and reference the folder.

## Approach

- [x] Create `examples/` directory structure with three examples
- [x] Write `examples/README.md` describing the convention (aspirational, revisit cadence, etc.)
- [x] `examples/github-actions/` — GitHub Action designer
- [x] `examples/scientific-calculator/` — Calculation graph explorer
- [x] `examples/clojure-project/` — Graph ↔ Clojure project isomorphism
- [x] Update DESIGN.md to describe and reference the examples folder
- [x] `deno task ci` passes

## Open Questions

- ~~What Spike-Clojure forms are appropriate for each example?~~ Resolved: use valid syntax where
  possible, with comments explaining features that go beyond the current parser.
- ~~How detailed should the source files be vs. the READMEs?~~ Resolved: READMEs carry the vision;
  source files are concise sketches with comments for unimplemented features.
- **How to synchronise source files with a live graph?** Three candidate approaches documented in
  DESIGN.md §13.6:
  - **A. CLI → MCP** — one-shot `marlinspike push` that parses `.clj` files and pushes via MCP
    `graph_write`. Lightest weight; needs MCP server (Phase 9) first.
  - **B. File watcher ↔ graph sync** — bidirectional sync between a directory of `.clj` files and
    a live graph. Needs conflict resolution and file-to-subgraph mapping conventions.
  - **C. Headless sync node** — `marlinspike serve` as a headless process that mediates between
    file state, local graph, and remote peers. Full collaboration story with files as a participant.
  - A → B → C is a natural progression. Starting point depends on which workflow is most
    immediately useful.

## Verification

- [x] `examples/` directory exists with three subdirectories
- [x] Each example has a README and at least one `.clj` source file
- [x] DESIGN.md references the examples folder
- [x] `deno task ci` passes
