# Extract Layout

**Branch:** lyndon/extract-layout
**Date:** 2026-05-18
**Branch Preview:** <!-- replace me -->

## Context

Layout algorithms live in `src/ui/lib/` (force.ts, sdf-force.ts, topo-charge.ts, topo-grid.ts,
port-layout.ts) and `src/ui/lib/algorithms/` (JANK, SDF, TOPOGRID, FIELD, PORT). These are pure
geometry/physics with no DOM dependency, but they're tangled into the IDE source tree.

Extracting to `packages/layout/` follows the same pattern as `@marlinspike/graph` and
`@marlinspike/canvas`: a standalone package with clean interfaces that enables:
- Custom algorithm implementations via the `LayoutAlgorithm` interface
- Composition with `@marlinspike/canvas` for layout-capable canvas demos
- Property-based testing to catch layout glitches without manual visual testing
- Future judgment system integration (topology analysis → algorithm/config selection)

## Goal

Create `@marlinspike/layout` package containing all layout algorithms, force simulation primitives,
topological analysis, and port layout. IDE orchestration (hierarchy traversal, level management,
port pinning) stays in `canvas.tsx`.

### Design principles

- **SDF as base metric** — geometry-aware distance functions underpin force computation. Layout
  imports SDF math from `@marlinspike/canvas` (structural typing: `ForceNode` satisfies `SdfShape`)
- **Extensible interfaces** — `LayoutAlgorithm` and config types are the extension points. Built-in
  algorithms are reference implementations; consumers can implement their own
- **No canvas dependency in public API** — layout uses canvas SDF internally but doesn't re-export it.
  Consumers who need raw SDF import from canvas directly
- **Judgment-ready** — config objects are composable (`{ ...DEFAULT_FIELD_CONFIG, ...overrides }`),
  `topoCharge` is already a topology→metadata function. Future judgment functions follow the same
  pattern without interface changes

### What's NOT in scope

- IDE orchestration (buildLevel, syncLayout, stepLayout, pinPortNodes) — stays in canvas.tsx
- Layout glitch fixes — deferred to a follow-up pass after extraction
- Judgment system integration — future work, but interfaces designed to accommodate it

## Approach

### Phase 1 — Package skeleton and types

- [x] 1.1 Create `packages/layout/deno.json` (`@marlinspike/layout`, version 0.1.0)
- [x] 1.2 Create `packages/layout/types.ts` — move `ForceNode`, `BBox` from force.ts; move
  `LayoutAlgorithm`, `AlgorithmId` from algorithms/types.ts; add `ForceEdge` named type
- [x] 1.3 Update root `deno.json`: add `packages/layout` to workspace, add import map entry,
  add `packages/layout/mod.ts` to check/ci tasks
- [x] 1.4 Create minimal `packages/layout/mod.ts` exporting types only
- [x] 1.5 `deno check` passes

### Phase 2 — Move pure utility modules

- [x] 2.1 Move `force.ts` → `packages/layout/force.ts` (import types from `./types.ts`,
  export `ForceConfig`, `DEFAULT_FORCE_CONFIG`, `tickLevel`, `maxVelocity`, `boundingBox`,
  `centerNodes`, `initPositions`)
- [x] 2.2 Move `topo-charge.ts` → `packages/layout/topo-charge.ts`
- [x] 2.3 Move `topo-grid.ts` → `packages/layout/topo-grid.ts` (import `ForceNode` from `./types.ts`)
- [x] 2.4 Move tests: `force.test.ts`, `topo-charge_test.ts`, `topo-grid_test.ts`
- [x] 2.5 `deno test packages/layout/` passes

### Phase 3 — Move SDF force module

- [x] 3.1 Move `sdf-force.ts` → `packages/layout/sdf-force.ts` — remove the re-export aliasing
  layer. Import `sdfOf`, `surfaceToSurface`, `sdfGradient`, `lineSdfDist`, `isCircleShape`
  directly from `@marlinspike/canvas`. `ForceNode` structurally satisfies `SdfShape` so no casts
  needed. Export `SdfPhysicsConfig`, `tickSdfLevel`, `applyAnchorForces`, `connectedComponents`,
  `lineSdfGrad`, `lineClosestPoint`
- [x] 3.2 Write `packages/layout/sdf-force_test.ts` — basic unit tests for SDF force computation
- [x] 3.3 Tests pass

### Phase 4 — Move port layout

- [x] 4.1 Move `port-layout.ts` → `packages/layout/port-layout.ts`. Import `Port`, `TreeNode`,
  `isRef` from `@marlinspike/graph`; import `CanvasPort`, `circlePortPositions`,
  `rectPortPositions` from `@marlinspike/canvas`
- [x] 4.2 Move `port-layout_test.ts` — update imports
- [x] 4.3 Tests pass

### Phase 5 — Move algorithm implementations

- [x] 5.1 Move all five algorithm files to `packages/layout/algorithms/` — update relative imports
- [x] 5.2 Complete `mod.ts` with all exports (algorithm factories, config types, utilities)
- [x] 5.3 `deno check packages/layout/mod.ts` passes

### Phase 6 — Rewire IDE imports

- [x] 6.1 Update `canvas.tsx` to import from `@marlinspike/layout` instead of `../lib/`
- [x] 6.2 Update `canvas-adapter.ts` — import `ForceNode`, `PortPosition` etc. from
  `@marlinspike/layout`
- [x] 6.3 Update any other IDE files importing from old locations
  - `port-rendering.tsx` — PortPosition import
  - `db/operations.ts` — AlgorithmId import
  - `workspace.ts` — AlgorithmId import
  - `stories/layout.stories.tsx` — all layout imports + `isCircleNode` → `isCircleShape`
  - `stories/port.stories.tsx` — port layout imports
- [x] 6.4 Delete old files: `src/ui/lib/force.ts`, `sdf-force.ts`, `topo-charge.ts`,
  `topo-grid.ts`, `port-layout.ts`, `src/ui/lib/algorithms/` directory
- [x] 6.5 `NO_COLOR=1 deno task ci` passes — all tests green (555 tests)

### Phase 7 — Property-based tests

- [x] 7.1 Create `packages/layout/properties_test.ts` with testable layout invariants:
  - No node overlap after settlement (`surfaceToSurface(a, b) >= -epsilon`)
  - Bounding box contains all non-anchored nodes
  - Center invariant: centroid near (0,0) after `centerNodes()`
  - TOPOGRID determinism: same input → identical output
  - Topological ordering: edge a→b implies layer(a) < layer(b)
  - Charge range: `topoCharge` returns values in [-1, +1]
  - Pinned node immobility: pinned nodes don't move after tick
  - Settlement convergence: algorithms settle within maxTicks for small graphs

#### Key files modified:
- `packages/layout/` — all new files (types, algorithms, tests)
- `deno.json` — workspace + imports + check/ci tasks
- `src/ui/components/canvas.tsx` — import rewiring
- `src/ui/lib/canvas-adapter.ts` — import rewiring

#### Key files deleted:
- `src/ui/lib/force.ts`
- `src/ui/lib/sdf-force.ts`
- `src/ui/lib/topo-charge.ts`
- `src/ui/lib/topo-grid.ts`
- `src/ui/lib/port-layout.ts`
- `src/ui/lib/algorithms/` (entire directory)

## Package Structure

```
packages/layout/
├── deno.json
├── mod.ts                         # Public API
├── types.ts                       # ForceNode, ForceEdge, BBox, LayoutAlgorithm, AlgorithmId
├── force.ts                       # tickLevel, maxVelocity, boundingBox, centerNodes, initPositions
├── sdf-force.ts                   # tickSdfLevel, applyAnchorForces, connectedComponents
├── topo-charge.ts                 # topoCharge (Tarjan SCC + longest-path ranking)
├── topo-grid.ts                   # topoGridLayout, sized, LTR, sizedLTR
├── port-layout.ts                 # PortPosition, resolveNodePorts, port geometry
├── algorithms/
│   ├── JANK.ts                    # Coulomb + springs
│   ├── SDF.ts                     # Geometry-aware SDF forces
│   ├── TOPOGRID.ts                # Deterministic topological grid
│   ├── FIELD.ts                   # SDF + directional flow field
│   └── PORT.ts                    # FIELD + LTR init + port pinning
├── force_test.ts
├── sdf-force_test.ts
├── topo-charge_test.ts
├── topo-grid_test.ts
├── port-layout_test.ts
└── properties_test.ts             # Cross-algorithm property invariants
```

## Dependencies

```
@marlinspike/layout
  ├── @marlinspike/canvas   (SDF geometry: sdfOf, surfaceToSurface, sdfGradient, lineSdfDist)
  └── @marlinspike/graph    (types only: TreeNode, Port, isRef — used by port-layout)
```

One-directional. Canvas and graph never import from layout.

### Phase 8 — Visual roles + SDF primitives (styling system redesign)

**Not in scope for this branch** — future work. Documented here because the extract-layout work
surfaces the shape boundary question clearly.

#### Problem

Shape knowledge is currently scattered: constraints carry `data.rendering.shape: "rect"`,
canvas-adapter hardcodes expanded→rect / else→circle, and containers are special-cased with
`GROUP_PADDING`, `LABEL_H`, etc. The shape enum (`"circle" | "rect"`) is too rigid for a
flexible styling system.

#### Architecture: SDF as the universal geometry contract

```
semantic model  →  visual role  →  primitive definition (carries SDF)  →  layout + rendering
(TreeNode)         (swappable)     (the universal interface)
```

- **Canvas package** = flexible primitives and rendering. No semantic knowledge.
- **Visual role** = mapping from semantic concepts to primitive instances. Swappable like a
  stylesheet — changing the role mapping changes the entire visual language, and layout still
  works because it only talks to SDFs.
- **Primitive definition** = geometry (SDF function) + visual properties (stroke, fill, etc.) +
  extent rules (for containers). The SDF is what connects layout to rendering.
- **Layout** only needs the SDF. It never knows what things look like.
- **Rendering** only needs the primitive's visual properties. It never knows where things are.

#### Container geometry via SDF

Containers are not special — they're primitives whose geometry is computed from children extent:

1. Children settle (siblings laid out via SDF forces — self-contained per level)
2. Parent's **extent rule** (part of role definition) maps children bbox → parent `(w, h)`
3. Parent's SDF is computed from `(w, h)` — works for any shape parameterized by width/height
   (rectangles, rounded rects, ellipses, stadiums, etc.)
4. Parent enters layout with ITS siblings using its new computed geometry

This is hierarchical and parallel per level. Each level only needs sibling context. Parent
geometry adjustment is a between-level data flow, not part of any level's layout process.
Settlement is per-level with upward invalidation — a child resize ripples up only as far as it
affects sibling layout.

**Open question (deferred):** More complex container geometry beyond `(w, h)` parameterization.
There may be an SDF algorithm for containing arbitrary collections of shapes with arbitrary
simple hulls, but this is not needed for the initial implementation.

#### Extension concept (deferred)

Visual role mappings fit into a broader "extension" concept: a package that bundles role
mappings + primitive definitions + possibly layout hints. Different extensions could provide
entirely different visual languages for the same semantic model (e.g. "blueprint", "circuit
diagram", "hand-drawn"). Defer until the role system is proven.

#### Constraint system evolution

Constraints currently force a shape enum (`data.rendering.shape: "rect"`). In the new world,
constraints would set a *role* or role override, not a shape. The role mapping resolves to a
primitive. This is more flexible and separates the "what is it" decision from the "what does it
look like" decision.

#### Checklist

- [ ] 8.1 Promote SDF from shape-enum dispatch to primitive-carried geometry. Primitives carry
      their own SDF function rather than dispatching through `sdfOf("circle" | "rect")`.
- [ ] 8.2 Define visual role type and role→primitive mapping type in `@marlinspike/canvas`
- [ ] 8.3 Add role computation function in IDE (`TreeNode` + expansion state → visual role)
- [ ] 8.4 Replace canvas-adapter shape hardcoding with role→primitive resolution via theme
- [ ] 8.5 Container primitives: extent rule (children bbox → parent w,h) + SDF from computed
      dimensions. Replaces hardcoded GROUP_PADDING / LABEL_H.
- [ ] 8.6 Constraints set roles, not shapes
- [ ] 8.7 Style-sheet swappability: verify that swapping role mappings works with all layout
      algorithms (any style + any layout = correct, because SDF is the universal interface)
- [ ] 8.8 Judgment-ready: future judgments can assign roles (e.g. `"hub"`) without knowing
      geometry — role mapping resolves them

## Open Questions

1. **`ForceEdge` named type** — currently all code uses anonymous `{ a: string; b: string }`.
   Introducing `ForceEdge` is backward-compatible (structural typing) but gives a hook for future
   edge metadata (weight, kind). Worth adding now or defer?

2. **`lineSdfGrad` and `lineClosestPoint`** — these live in sdf-force.ts but are general geometry.
   Should they move to `@marlinspike/canvas/geometry/sdf.ts` instead? Currently only used by
   sdf-force and canvas-adapter (edge bending).

3. **Port layout dependency on `@marlinspike/graph`** — `resolveNodePorts` needs `TreeNode` and
   `isRef`. This is the only reason layout depends on graph. Alternative: leave port-layout in IDE,
   export only the geometry. But port layout is core layout functionality.

## Verification

- [x] `NO_COLOR=1 deno task ci` — all existing tests pass (555 tests)
- [x] New property tests pass for all 5 algorithms (15 property tests)
- [x] No files in `src/ui/lib/` import layout code (all via `@marlinspike/layout`)
- [x] `src/ui/lib/algorithms/` directory deleted
- [ ] Visual check: all 5 algorithms work in IDE (switch between them)
- [ ] Visual check: port layout correct (inputs left, outputs right)
- [ ] Visual check: expanded containers layout children correctly
