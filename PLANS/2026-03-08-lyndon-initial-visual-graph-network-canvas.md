# Initial visual graph network canvas

**Branch:** lyndon/initial-visual-graph-network-canvas
**Date:** 2026-03-08

## Context

DESIGN.md §6 specifies a **Hybrid Canvas** as the primary authoring surface — a force-layout spatial view of the rose-tree where subgraphs can be expanded in place (showing children inside a bounding box) or collapsed to a single node. Currently the workspace only has a tree panel. This work adds the initial canvas as a persistent background layer behind all other panels, so the spatial graph view exists and can be iterated on.

## Goal

A working canvas that:
- Is always visible as the background of the workspace area — not an optional panel but a persistent view behind tree-panel overlays
- Shows multiple levels of the tree simultaneously — composite nodes can be expanded (showing children inside a bounding box) or collapsed (shown as a single node)
- Runs a force simulation (repulsion + spring) using `requestAnimationFrame`, with a pluggable layout algorithm interface
- Supports click-to-select, drag to move nodes, pan and zoom
- Has a "mirror tree view" action on tree panels that collapses/expands canvas nodes to match the tree panel's `expandedNodes` state
- Has a bottom-right inspector overlay showing properties of the selected node/edge (reusing existing inspector components)
- Has a top-right toolbar bar for canvas-wide controls (layout selector, breadcrumb)
- Has Storybook stories for isolated development

## Approach

- [x] **Extend `WorkspaceState` in `workspace.ts`** — add `canvasExpandedNodes: string[]`, `canvasNodePositions`, `canvasSelectedNodeId`, `canvasSelectedEdgeId`, `canvasAlgorithm: AlgorithmId`; update `defaultState()` and `loadState`
- [x] **Create `src/ui/lib/force.ts`** — pure force simulation: `ForceNode`, `tickLevel`, `boundingBox`, `initPositions`, `maxVelocity`
- [x] **Create `src/ui/lib/topo-grid.ts`** — deterministic topological grid layout via Kahn's algorithm; assigns layers by longest-path from roots; each row centred on x=0
- [x] **Create `src/ui/lib/algorithms/` directory** — pluggable layout algorithm abstraction:
  - `types.ts` — `LayoutAlgorithm` interface (`id`, `name`, `preservesPositions`, `initNodes`, `tick`) and `AlgorithmId = "JANK" | "TOPOGRID"`
  - `JANK.ts` — iterative force-directed; `JankConfig`, `DEFAULT_JANK_CONFIG`, `createJANK`
  - `TOPOGRID.ts` — deterministic topo-grid; `TopogridConfig`, `DEFAULT_TOPOGRID_CONFIG`, `createTOPOGRID`
  - `index.ts` — barrel re-export
- [x] **Create `src/ui/components/canvas.tsx`** — `Canvas` component:
  - Props: `ws: WorkspaceState, update: Updater`
  - Multi-level `LayoutMap = Map<string, LevelState>` with bottom-up recursive simulation
  - Post-order traversal for ticking; child bboxes propagate up to parent body sizes
  - RAF loop with settlement caching (`settled: boolean` per level); ancestor invalidation on drag
  - `makeCanvasAlgorithm(id)` — constructs `LayoutAlgorithm` from persisted `AlgorithmId`
  - Pan (mouse drag on background) and wheel zoom
  - Click-to-select nodes and edges; drag to move + pin
  - `CanvasTopBar` — top-right overlay with layout selector pill + breadcrumb pill
  - Bottom-right inspector overlay reusing `NodeInspector` / `EdgeInspector`
- [x] **Rework `WorkspaceArea` in `client.tsx`** — `Canvas` as `position:absolute; inset:0` background; tree panels as floating overlays on top
- [x] **Add "mirror tree view" icon button to `TreePanel`** in `tree-panel.tsx`
- [x] **Create `src/ui/stories/layout.stories.tsx`** — `Layout` story group:
  - Configurable sidebar: algorithm selector (JANK / TOPOGRID), dataset picker, tunable parameters
  - 9 datasets: 6 flat (Star, Ring, Chain, Mesh, Disconnected, Dense) + 3 subgraph (Two Groups, Mixed, Deep nest)
  - Recursive SVG rendering mirroring canvas logic; pause/resume; velocity and tick stats
  - JANK runs with `maxTicks: Infinity` in the story (user pauses manually)

## Key Technical Details

**Algorithm abstraction** (`src/ui/lib/algorithms/`):
- `preservesPositions: true` (JANK) — `buildLevel` keeps existing node positions across layout syncs
- `preservesPositions: false` (TOPOGRID) — positions always fully recomputed from topology
- Story uses `makeAlgorithm(id, cfg)` with `maxTicks: Infinity`; canvas uses `makeCanvasAlgorithm(id)` with `DEFAULT_JANK_CONFIG` (`maxTicks: 600`)

**Layout model** (bottom-up recursive with settlement caching):
1. Post-order traversal — deepest expanded nodes ticked first
2. Child bbox propagates up as parent body `w`/`h` before parent is ticked
3. Ancestor levels invalidated on drag/expansion changes
4. Root level ticked last each frame

**JSX pragma**: all client/story files use `/** @jsxImportSource @hono/hono/jsx/dom */`.

## Open Questions

None blocking.

## Verification

- [x] `NO_COLOR=1 deno task check` — no type errors
- [x] `NO_COLOR=1 deno task lint` — clean
- [x] `NO_COLOR=1 deno task fmt` — clean
- [x] `NO_COLOR=1 deno task smoke` — server starts and stops cleanly
- [x] Browser `/` — canvas visible behind tree panel, default nodes rendered as circles
- [x] Nodes animate and settle via force simulation
- [x] Double-clicking a collapsed composite node expands it; a group box appears with children inside
- [x] Double-clicking an expanded group collapses it back to a single node
- [x] Clicking a node selects it; bottom-right inspector appears with node details
- [x] Switching layout algorithm (JANK ↔ TOPOGRID) via top-right toolbar restarts and re-settles layout
- [x] "Mirror tree view" button on tree panel syncs canvas expansion to match tree panel's expanded nodes
- [x] Dragging a node moves it and pins it (stays put after simulation settles)
- [x] Browser `/stories` → Layout story → datasets and algorithm selector work
