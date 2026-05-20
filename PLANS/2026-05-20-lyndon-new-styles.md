# New styles

**Branch:** lyndon/new-styles
**Date:** 2026-05-20
**Branch Preview:** <!-- replace me -->

## Context

The canvas package currently ships a single bundled theme (`marlinTheme`) — a dark palette
designed for the Marlinspike IDE. For the package to be compelling as a standalone library,
it needs a collection of visually distinct themes that demonstrate range and serve different
use cases. Inspiration from `packages/canvas/themes-inspo/`:

- **ContainerFlow** — dark background, teal/cyan strokes, amber highlights, rectangular
  nodes, technical/infrastructure feel
- **ShenzhenIO** — retro circuit-board aesthetic, dark blue-green background, thick teal
  routing lines, golden-yellow component fills
- **Agent** — dark background, circular nodes, thin gray edges, clean minimal aesthetic
- **Melbourne Rail** — light background, bold saturated line colours, circle station dots,
  transit-map diagrammatic style

## Goal

Add 4 new `CanvasTheme` implementations to the canvas package, each exported and
usable standalone. Create a theme gallery story for visual comparison.

## Approach

### Phase 0 — Angular edge routing

Currently `computeEdgePath` is hardcoded to straight lines / arcs. Themes have no control
over edge path shape. To support manhattan, transit-map, and other constrained routing
styles, we add a general-purpose angular router.

**Core idea:** an edge router takes a set of allowed angles (thetas) and greedily fits
the path by choosing the best angle for each segment. Different theta sets produce
different aesthetics:
- `[0, π/2]` → manhattan (horizontal/vertical only)
- `[0, π/4, π/2]` → transit/metro map (adds 45° diagonals)
- `[0, π/6, π/3, π/2]` → hex-grid style

**Greedy algorithm:** from source, pick the theta direction that makes the most progress
toward the destination. Walk that direction until switching to another theta gets closer.
Add rounded corners (quarter-circle arcs) at each bend.

- [x] 0.1 Add optional `edgeRouter` callback to `CanvasTheme`:
  ```typescript
  edgeRouter?: (src: Point, dst: Point, edge: CanvasEdge) => string; // SVG path d
  ```
  When present, `renderScene` uses the theme's router instead of the default straight/arc
  logic for the path `d` string. When absent, existing behaviour unchanged.
- [x] 0.2 Implement `angularRoute(src, dst, thetas, cornerRadius)` in
  `packages/canvas/geometry/edge-routing.ts`:
  - `thetas: number[]` — allowed travel directions (and their negatives)
  - `cornerRadius: number` — arc radius at bends (0 = sharp corners)
  - Returns SVG path `d` string
  - Greedy segment selection: for each segment, pick the theta whose unit vector has
    the largest dot product with the remaining displacement vector. Walk until the
    perpendicular component to the *next best* theta is zero (i.e. we're aligned for
    a clean switch), then bend.
- [x] 0.3 Export convenience presets:
  ```typescript
  export const MANHATTAN_ANGLES = [0, Math.PI / 2];
  export const TRANSIT_ANGLES = [0, Math.PI / 4, Math.PI / 2];
  ```
- [x] 0.4 Export a factory for themes:
  ```typescript
  export function angularRouter(thetas: number[], cornerRadius?: number):
    (src: Point, dst: Point) => string;
  ```

### Phase 1 — Theme implementations

Each theme is a new file in `packages/canvas/style/` exporting a `CanvasTheme<unknown>`.
Like `marlinTheme`, they use only universal `CanvasNode` fields (`selected`, `highlighted`,
`dashed`) — no consumer-specific state.

- [x] 1.1 **`containerFlowTheme`** — `packages/canvas/style/container-flow-theme.ts`
  - Dark navy background (`#0a1628`)
  - Rectangular default geometry via `resolveNode` (all nodes rect)
  - Teal strokes (`#2a8a8a`), darker fills (`#0d1f2d`), amber highlight (`#d4a030`)
  - Selected: bright teal stroke. Highlighted: amber.
  - Edge style: teal with arrow endpoints, `angularRouter(MANHATTAN_ANGLES, 0)` (sharp bends)
  - Ports: cyan (in) / amber (out)

- [x] 1.2 **`shenzhenTheme`** — `packages/canvas/style/shenzhen-theme.ts`
  - Dark blue-green background (`#1a2a3a`)
  - Rect geometry for all nodes (circuit-board components)
  - Golden-yellow fills (`#c8a832`), dark teal strokes (`#1a6a5a`)
  - Selected: bright green stroke. Highlighted: gold.
  - Thick edge strokes (2px default), teal colour, `angularRouter(MANHATTAN_ANGLES, 0)`
  - Monospace font for labels
  - Ports: gold (out) / teal (in)

- [x] 1.3 **`transitTheme`** — `packages/canvas/style/transit-theme.ts`
  - Light background (`#f4f0e8`, warm paper)
  - Circle geometry for all nodes (station dots)
  - Small solid fills using line colours, thin dark strokes
  - Colour rotation based on node ID hash (red, blue, green, purple, orange)
  - Selected: thicker stroke + darker fill. Highlighted: black stroke.
  - Bold edge strokes (3px), matching source node colour, endCap: "none"
  - `angularRouter(TRANSIT_ANGLES, 8)` — h/v + 45° diagonals with rounded corners
  - Sans-serif labels, dark text
  - Ports: dark gray

- [x] 1.4 **`agentTheme`** — `packages/canvas/style/agent-theme.ts`
  - Dark background (`#1a1a1a`)
  - Circle geometry (default), clean minimal
  - Very dark fills (`#2a2a2a`), subtle gray strokes (`#444`)
  - Selected: white stroke. Highlighted: blue (`#4488ff`).
  - Thin edge strokes (1px), gray, small arrows (default straight routing)
  - Clean sans-serif labels, light gray text
  - Ports: blue (in) / white (out)

### Phase 2 — Exports

- [x] 2.1 Export all new themes and routing utilities from `packages/canvas/mod.ts`

### Phase 3 — Theme gallery story

- [x] 3.1 Create `src/ui/stories/canvas-themes.stories.tsx`
  - Shared sample graph (5-6 nodes, mixed edges, one selected, one highlighted, one dashed)
  - Render stacked: each theme applied to the same scene with theme name as heading
  - Include `marlinTheme` as first entry for comparison

### Phase 4 — Documentation

- [x] 4.1 Update canvas README "Bundled themes" section to list all themes with one-line descriptions
- [x] 4.2 Document angular routing in README (edge routing section)
- [x] 4.3 Update plan file with progress

## Open Questions

- **Colour rotation in transit theme** — use node ID hash for deterministic colour assignment
  across re-renders, not array index.
- **Edge router complexity** — the greedy angular router doesn't do obstacle avoidance
  (doesn't know about other nodes). Start with the greedy approach; if paths overlap
  nodes badly, consider adding a repulsion pass later.
- **Segment switching heuristic** — the greedy algorithm needs a rule for when to switch
  thetas. Simplest: switch once at the midpoint (two-segment path). Better: switch when
  aligned on the next theta's axis. May need tuning per theta set.
- **Type-safe style parameterisation** — explored in previous conversation (square vs squircle
  params, SDF algebra for composite shapes). Not in scope here — capture in future brainstorm.

## Key files

- `packages/canvas/style/marlin-theme.ts` — reference implementation to follow
- `packages/canvas/style/types.ts` — `CanvasTheme<S>`, `NodeStyle`, `EdgeStyle`, `PortStyle`
- `packages/canvas/render/edge.ts` — `computeEdgePath`, `renderEdge`, `EdgeRenderData`
- `packages/canvas/render/scene.ts` — `renderScene` (where edge router hook integrates)
- `packages/canvas/mod.ts` — exports
- `packages/canvas/scene/types.ts` — `CanvasNode` fields available to themes
- `packages/canvas/geometry/node-geometry.ts` — `CIRCLE_GEOMETRY`, `RECT_GEOMETRY`

## Verification

- [ ] `NO_COLOR=1 deno task ci` — all tests green
- [ ] Each theme renders correctly in the gallery story
- [ ] Visual check: selected/highlighted states visually distinct in each theme
- [ ] Visual check: edges render with correct colours and routing style
- [ ] Visual check: angular routing produces clean paths for manhattan and transit angles
- [ ] Canvas README lists all bundled themes and documents edge routing
