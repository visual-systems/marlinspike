# Extract Canvas

**Branch:** lyndon/extract-canvas
**Date:** 2026-05-16
**Branch Preview:** <!-- replace me -->

## Context

`src/ui/components/canvas.tsx` is 2623 lines mixing geometry, rendering, layout management, and IDE interaction into one monolithic component. The geometry helpers (surface clipping, arc math, SDF primitives) and SVG rendering logic are pure functions that have no inherent dependency on Marlinspike's workspace model. Extracting them into a standalone `@marlinspike/canvas` package makes the rendering layer reusable for any project that needs visual graph drawing — visual-programming tools, node editors, dataflow UIs, etc.

This follows the same extraction pattern established with `@marlinspike/graph`.

## Goal

A standalone `packages/canvas/` Deno workspace package (`@marlinspike/canvas`) that:

1. **Draws graph elements on SVG** — nodes (circle/rect), edges (straight/arc with arrowheads), ports
2. **Provides full geometry** — SDF shapes, surface clipping, arc math — so consumers can build geometry-aware layout on top
3. **Has pluggable style interfaces** — `NodeStyleResolver`, `EdgeStyleResolver`, `PortStyleResolver`, `CanvasTheme` — with Marlinspike dark theme as the default implementation
4. **Works with immutable state** — scene described as a plain data structure (`CanvasScene`), rendering is a pure function of scene → SVG
5. **Zero runtime dependencies** — works in browser, server, test contexts
6. **Includes a "Figma lite" demo** — package story where users manually place/drag nodes and draw edges

### What's NOT in scope

- **Layout algorithms** (force simulation, JANK, SDF-force, TOPOGRID, FIELD, PORT) — these stay in `src/ui/lib/` for now; they are layout, not drawing
- **Layout state management** (`syncLayout`, `stepLayout`, `buildLevel`, `pinPortNodes`) — IDE-specific orchestration
- **Interaction logic** (selection, focus, expand/collapse, inspector) — IDE-specific
- **Port resolution** (`resolveNodePorts`) — depends on `@marlinspike/graph` tree semantics; stays in `src/ui/lib/port-layout.ts`

## Approach

### Phase A — Foundation: types + geometry (no existing file changes)

- [ ] A1. Create `packages/canvas/` with `deno.json` (`@marlinspike/canvas`, version 0.1.0)
- [ ] A2. Define scene graph types in `packages/canvas/scene/types.ts`:
  - `CanvasNode { id, x, y, w, h, shape: "circle"|"rect", label, ports?: CanvasPort[], selected?, highlighted?, dashed?, data? }`
  - `CanvasEdge { id, fromId, toId, label?, selected?, highlighted? }`
  - `CanvasPort { name, direction: "in"|"out"|"inout", type?, x, y, nx, ny }` (positions relative to node center)
  - `CanvasScene { nodes: CanvasNode[], edges: CanvasEdge[] }`
- [ ] A3. Define style interfaces in `packages/canvas/style/types.ts`:
  - `NodeStyle { fill, stroke, strokeWidth, labelFill, labelFont, radius?, opacity? }`
  - `EdgeStyle { stroke, strokeWidth, arrowSize, labelFill, labelFont }`
  - `PortStyle { fill, stroke, radius }`
  - `NodeStyleResolver(node: CanvasNode): NodeStyle`
  - `EdgeStyleResolver(edge: CanvasEdge): EdgeStyle`
  - `PortStyleResolver(port: CanvasPort, node: CanvasNode): PortStyle`
  - `CanvasTheme { node: NodeStyleResolver, edge: EdgeStyleResolver, port: PortStyleResolver, background: string }`
- [ ] A4. Extract geometry helpers into `packages/canvas/geometry/`:
  - `surface.ts` — `surfacePoint(from, to, gap)` (from canvas.tsx:156-183)
  - `arc.ts` — `pathEndTangent`, `arcMidpoint`, `edgeArcOffset`, `arcClipPoint`, `arcClipRect` (from canvas.tsx:99-347)
  - `sdf.ts` — `sdfOf`, `surfaceToSurface`, `sdfGradient`, `lineSdfDist` (from sdf-force.ts, geometry primitives only — not force simulation)
  - `ports.ts` — `PortPosition`, `circlePortPositions`, `rectPortPositions` (from port-layout.ts, without `resolveNodePorts` which depends on @marlinspike/graph)
- [ ] A5. Export barrel: `packages/canvas/mod.ts`
- [ ] A6. Wire into workspace `deno.json` imports

#### Key files:
- `src/ui/components/canvas.tsx:99-347` — geometry helpers to extract
- `src/ui/lib/sdf-force.ts:52-180` — SDF primitives to extract
- `src/ui/lib/port-layout.ts:14-160` — port geometry to extract (minus `resolveNodePorts`)

### Phase B — Default theme + render primitives (target-agnostic)

The render layer is **abstracted from any rendering target**. Instead of producing SVG-specific output, it produces a list of **render primitives** — abstract drawing commands that any backend can consume.

- [ ] B1. Define render primitives in `packages/canvas/render/primitives.ts`:
  - `RenderCircle { kind: "circle", cx, cy, r, fill, stroke, strokeWidth, opacity?, dashed?, cursor? }`
  - `RenderRect { kind: "rect", x, y, w, h, rx?, fill, stroke, strokeWidth, opacity?, dashed?, cursor? }`
  - `RenderPath { kind: "path", d: string, stroke, strokeWidth, fill, cursor? }`
  - `RenderPolygon { kind: "polygon", points: [x,y][], fill, stroke? }`
  - `RenderText { kind: "text", x, y, text, fill, fontSize, fontFamily, anchor?, strokeOutline? }`
  - `RenderGroup { kind: "group", transform?, children: RenderPrimitive[], cursor?, id? }`
  - `RenderPrimitive = RenderCircle | RenderRect | RenderPath | RenderPolygon | RenderText | RenderGroup`
- [ ] B2. Define `Renderer<T>` interface in `packages/canvas/render/renderer.ts`:
  - `Renderer<T> { circle(p: RenderCircle): T, rect(p: RenderRect): T, path(p: RenderPath): T, polygon(p: RenderPolygon): T, text(p: RenderText): T, group(p: RenderGroup, children: T[]): T }`
  - This allows SVG, Canvas2D, WebGL, or test backends to interpret the same primitive tree
- [ ] B3. Create `packages/canvas/style/marlin-theme.ts` — default dark theme implementing `CanvasTheme`, encoding current Marlinspike visual style (colors from canvas.tsx renderLevel)
- [ ] B4. Create `packages/canvas/render/edge.ts`:
  - `renderEdge(scene, edge, theme): RenderPrimitive[]` — computes arc/straight path, clipping, arrowhead as primitives
  - Handles: multi-edge grouping (arc offset), obstacle avoidance, label placement
- [ ] B5. Create `packages/canvas/render/node.ts`:
  - `renderNode(node, theme): RenderPrimitive[]` — produces circle or rect + label as primitives
  - Handles: circle vs rect, selected/highlighted/dashed states, label positioning
- [ ] B6. Create `packages/canvas/render/port.ts`:
  - `renderPort(port, node, theme): RenderPrimitive` — produces port dot as primitive
- [ ] B7. Create `packages/canvas/render/scene.ts`:
  - `renderScene(scene, theme): RenderGroup` — pure function producing a primitive tree for a flat scene
  - Main entry point. Returns a `RenderGroup` containing all nodes, edges, ports
  - Edge rendering uses two-pass ordering (paths first, labels on top)
- [ ] B8. Create `packages/canvas/render/svg.ts` — reference SVG `Renderer<string>` implementation:
  - Walks the primitive tree and produces SVG markup strings
  - Can also be used as a template for Canvas2D/WebGL implementations

#### Design decisions

- **Target-agnostic**: The render layer produces abstract primitives, not SVG. Different backends (SVG, Canvas2D, WebGL) implement the `Renderer<T>` interface.
- **Headless testing**: Tests inspect the primitive tree directly — no DOM needed. e.g. "renderScene with 3 nodes produces 3 circle primitives with correct positions."
- **Composable**: Each `renderNode`/`renderEdge`/`renderPort` is independently callable, so consumers can render subsets or mix with custom primitives.

### Phase C — Tests (all headless, no DOM required)

- [ ] C1. Geometry tests: surface clipping, arc math, SDF primitives, port positions
- [ ] C2. Style tests: theme resolver returns expected values for different node states
- [ ] C3. Render primitive tests: `renderNode` produces correct primitive types/positions, `renderEdge` produces path+arrowhead primitives, multi-edge arc grouping
- [ ] C4. Scene render tests: `renderScene` with known scene → assert primitive tree structure (counts, positions, styles)
- [ ] C5. SVG renderer tests: primitives → SVG string output contains expected elements
- [ ] C6. Renderer interface test: trivial `Renderer<string[]>` that collects primitive kinds, verifying the interface contract

### Phase D — Wire up consumers

- [ ] D1. Refactor `canvas.tsx` geometry helpers to import from `@marlinspike/canvas`
- [ ] D2. Refactor `port-layout.ts` to import port geometry from `@marlinspike/canvas` (keep `resolveNodePorts` locally)
- [ ] D3. Refactor `sdf-force.ts` to import SDF primitives from `@marlinspike/canvas` (keep force simulation locally)
- [ ] D4. Update `canvas.tsx` renderLevel to use canvas package's render data functions where applicable
- [ ] D5. Full CI pass (`deno task ci`)

### Phase E — Figma-lite demo + CI

- [ ] E1. Create `src/ui/stories/canvas-package.stories.tsx` with stories:
  - **Scene Types** — show CanvasScene data structure, explain each type
  - **Geometry** — interactive visualization of surfacePoint, arc clipping, SDF fields
  - **Styles** — render same scene with different themes side-by-side
  - **Figma Lite** — interactive canvas: click to place nodes, drag to move, draw edges between nodes, delete with backspace. Demonstrates the full programmatic API.
- [ ] E2. Update `.github/workflows/ci.yml` to type-check and test the canvas package
- [ ] E3. Update DESIGN.md modular architecture section

## Open Questions

1. **Hierarchical rendering**: `renderLevel` in canvas.tsx is recursive (composites contain children rendered at offset). Should the canvas package support hierarchical scenes (nested `CanvasNode.children`) or only flat scenes? **Recommendation**: Start flat — the Figma-lite demo only needs flat. Hierarchical support can be added later. The IDE adapter handles the recursive world-position mapping.

2. **Render backends shipped**: The package ships a reference SVG `Renderer<string>` implementation. Canvas2D and WebGL renderers are out of scope for v0.1 but the `Renderer<T>` interface makes them straightforward to add. The demo story uses a thin Hono JSX DOM wrapper that consumes SVG string output — this wrapper lives in the story, not the package.

3. **SDF scope**: How much of `sdf-force.ts` is geometry vs. layout? **Recommendation**: Extract `sdfOf`, `surfaceToSurface`, `sdfGradient`, `lineSdfDist` (pure geometry queries). Leave `tickSdfLevel` and all force application code in `src/ui/lib/`.

4. **IDE overlay controls**: The canvas package renders only the graph content layer (nodes, edges, ports) as a primitive group. It does NOT manage chrome like layout dropdowns, breadcrumbs, panels, or toolbars — those remain in the IDE's own HTML layer, overlaid on top of the canvas viewport. The package's output slots into whatever container the consumer provides (an `<svg>`, a `<canvas>`, a WebGL viewport). This is the same layering canvas.tsx uses today: the `<svg>` contains the graph, and HTML `<div>` overlays sit on top via CSS positioning.

## Verification

- [ ] `NO_COLOR=1 deno task ci` passes (lint, fmt, type-check, all tests)
- [ ] Canvas package tests pass independently: `NO_COLOR=1 deno test packages/canvas/`
- [ ] Existing canvas functionality unchanged — IDE renders identically
- [ ] Figma-lite story works: place nodes, drag, draw edges, delete
- [ ] `import { ... } from "@marlinspike/canvas"` works from any Deno project
