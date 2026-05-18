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

- [ ] 1.1 Create `packages/layout/deno.json` (`@marlinspike/layout`, version 0.1.0)
- [ ] 1.2 Create `packages/layout/types.ts` — move `ForceNode`, `BBox` from force.ts; move
  `LayoutAlgorithm`, `AlgorithmId` from algorithms/types.ts; add `ForceEdge` named type
- [ ] 1.3 Update root `deno.json`: add `packages/layout` to workspace, add import map entry,
  add `packages/layout/mod.ts` to check/ci tasks
- [ ] 1.4 Create minimal `packages/layout/mod.ts` exporting types only
- [ ] 1.5 `deno check` passes

### Phase 2 — Move pure utility modules

- [ ] 2.1 Move `force.ts` → `packages/layout/force.ts` (import types from `./types.ts`,
  export `ForceConfig`, `DEFAULT_FORCE_CONFIG`, `tickLevel`, `maxVelocity`, `boundingBox`,
  `centerNodes`, `initPositions`)
- [ ] 2.2 Move `topo-charge.ts` → `packages/layout/topo-charge.ts`
- [ ] 2.3 Move `topo-grid.ts` → `packages/layout/topo-grid.ts` (import `ForceNode` from `./types.ts`)
- [ ] 2.4 Move tests: `force.test.ts`, `topo-charge_test.ts`, `topo-grid_test.ts`
- [ ] 2.5 `deno test packages/layout/` passes

### Phase 3 — Move SDF force module

- [ ] 3.1 Move `sdf-force.ts` → `packages/layout/sdf-force.ts` — remove the re-export aliasing
  layer. Import `sdfOf`, `surfaceToSurface`, `sdfGradient`, `lineSdfDist`, `isCircleShape`
  directly from `@marlinspike/canvas`. `ForceNode` structurally satisfies `SdfShape` so no casts
  needed. Export `SdfPhysicsConfig`, `tickSdfLevel`, `applyAnchorForces`, `connectedComponents`,
  `lineSdfGrad`, `lineClosestPoint`
- [ ] 3.2 Write `packages/layout/sdf-force_test.ts` — basic unit tests for SDF force computation
- [ ] 3.3 Tests pass

### Phase 4 — Move port layout

- [ ] 4.1 Move `port-layout.ts` → `packages/layout/port-layout.ts`. Import `Port`, `TreeNode`,
  `isRef` from `@marlinspike/graph`; import `CanvasPort`, `circlePortPositions`,
  `rectPortPositions` from `@marlinspike/canvas`
- [ ] 4.2 Move `port-layout_test.ts` — update imports
- [ ] 4.3 Tests pass

### Phase 5 — Move algorithm implementations

- [ ] 5.1 Move all five algorithm files to `packages/layout/algorithms/` — update relative imports
- [ ] 5.2 Complete `mod.ts` with all exports (algorithm factories, config types, utilities)
- [ ] 5.3 `deno check packages/layout/mod.ts` passes

### Phase 6 — Rewire IDE imports

- [ ] 6.1 Update `canvas.tsx` to import from `@marlinspike/layout` instead of `../lib/`
- [ ] 6.2 Update `canvas-adapter.ts` — import `ForceNode`, `PortPosition` etc. from
  `@marlinspike/layout`
- [ ] 6.3 Update any other IDE files importing from old locations
- [ ] 6.4 Delete old files: `src/ui/lib/force.ts`, `sdf-force.ts`, `topo-charge.ts`,
  `topo-grid.ts`, `port-layout.ts`, `src/ui/lib/algorithms/` directory
- [ ] 6.5 `NO_COLOR=1 deno task ci` passes — all tests green

### Phase 7 — Property-based tests

- [ ] 7.1 Create `packages/layout/properties_test.ts` with testable layout invariants:
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

- [ ] `NO_COLOR=1 deno task ci` — all existing tests pass
- [ ] New property tests pass for all 5 algorithms
- [ ] No files in `src/ui/lib/` import layout code (all via `@marlinspike/layout`)
- [ ] `src/ui/lib/algorithms/` directory deleted
- [ ] Visual check: all 5 algorithms work in IDE (switch between them)
- [ ] Visual check: port layout correct (inputs left, outputs right)
- [ ] Visual check: expanded containers layout children correctly
