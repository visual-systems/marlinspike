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

### Phase 8 — Theme system redesign (opaque shapes + visual roles)

**Not in scope for this branch** — future work. Documented here because the extract-layout work
surfaces the shape boundary question clearly.

#### Problem

Shape knowledge is currently scattered: constraints carry `data.rendering.shape: "rect"`,
canvas-adapter hardcodes expanded→rect / else→circle, and containers are special-cased with
`GROUP_PADDING`, `LABEL_H`, etc. The shape enum (`"circle" | "rect"`) is too rigid for a
flexible styling system.

#### Design decisions

**D1 — Opaque shape type.** After construction, a shape is a single opaque type whose only
active query mechanism is its SDF: `(px, py) => number`. Primitive constructors (circle, rect,
rounded-rect, etc.) produce this opaque type. No package outside canvas needs to know *what* a
shape is — only how to measure distance to it. Serialization is not needed at the shape level
(graphs are serialized via codecs at the graph layer; shapes are reconstructed on load).

**D2 — Canvas internal shape knowledge.** Canvas may retain internal knowledge of shape
properties for rendering performance (e.g. drawing borders on SVG requires knowing whether to
emit `<rect>` vs `<circle>`). This is an implementation detail hidden behind the opaque type —
external consumers (layout, IDE) never see it.

**D3 — Theme resolves geometry too.** The theme is the single resolution point for both shape
and style: `(context, semantics) → geometry + visual properties`. A theme could map if-statements
to diamonds, make everything oval, etc. The information flow is `context, semantics → geometry
construction` — generic enough to be a judgment in the future.

**D4 — Dynamic dispatch, pre-canvas resolution.** Role→primitive resolution happens dynamically
(no pre-computation). Once resolved, the result flows into canvas domain as concrete geometry +
style. `CanvasNode` is NOT role-aware — by the time canvas sees it, the role has been resolved.
Canvas just renders what it's given. No performance optimization needed yet; keep the design as
dynamic as clean architecture allows.

**D5 — Style schema as data (initial).** Theme definitions (including extent rules, padding,
colors) start as declarative data — a schema that the theme resolver interprets. This enables:
- Styles defined as JSON (or similar structured format)
- Constraint overrides use the same schema (merged at a different layer)
- Future: style definitions loadable from external files

**Limitation:** Declarative data works for static properties but breaks down for computed
attributes (e.g. border thickness proportional to node degree, color derived from topology
charge). Functions can't be represented or type-checked in JSON schemas, and threading computed
values through a declarative schema gets awkward. The initial implementation should use
declarative data for the simple cases, but the design must accommodate an evolution path toward
themes-as-code — where theme resolution can involve arbitrary computation, not just data
lookup. This may converge with the judgment system (D3 notes theme resolution resembles a
judgment).

**D6 — Constraint overrides at top level.** Constraints can override primitive construction
using the same schema vocabulary as theme definitions. Override properties live at the top level
of the constraint object (not nested in `data`). This replaces the current
`data.rendering.shape` pattern. Existing builtin constraints (`WORKSPACE_CONSTRAINT`,
`PROFILE_CONSTRAINT`) migrate from `{ data: { rendering: { shape: "rect" } } }` to
top-level style overrides.

**D7 — "Theme" is the name.** The swappable style system is called a "theme". CLASSIC is the
first theme instance (the current visual style). `CanvasTheme` is already the mechanism — themes
just formalize the semantic input so the resolver has a clean role to work with.

**D8 — Edges are distinct from nodes.** Node shapes are 2D regions with SDFs; edges are 1D
paths (lines/curves). They share the theme pipeline (`context → geometry`) but the geometry
type is fundamentally different. No need to force-unify.

**D9 — ForceNode shape representation (deferred).** Currently `ForceNode.shape?: "circle" |
"rect"`. In the opaque-shape world, this should evolve to carry the opaque shape (or its SDF).
For now, canvas can maintain the enum internally. Future: an extensible tagged-record approach
rather than a `shape` key, allowing richer shape descriptions. References for future design:
[Haskell Diagrams](https://diagrams.github.io/doc/quickstart.html) (flexible diagram algebra),
[Inigo Quilez SDF](https://iquilezles.org/articles/distfunctions2d/) (SDF primitives + combinators).

#### Architecture: SDF as the universal geometry contract

```
semantic model  →  visual role  →  theme resolution  →  opaque shape + style  →  layout + rendering
(TreeNode)         (derived)       (context → geom)     (SDF is the contract)
```

- **Canvas package** = opaque shape type, SDF geometry, primitive constructors, rendering.
  Knows nothing about roles or marlinspike semantics. May use internal shape knowledge for
  render optimization (D2).
- **Theme** = mapping from `(role, context)` → `(shape, style)`. Declarative schema (D5).
  Swappable — CLASSIC is the first instance (D7). Lives in `src/` (app-specific).
- **Layout** only needs the SDF. Never knows what things look like.
- **Rendering** only needs the shape's visual properties + internal type. Never knows where
  things are.

#### Container geometry via SDF

Containers are not special — they're primitives whose geometry is computed from children extent:

1. Children settle (siblings laid out via SDF forces — self-contained per level)
2. Parent's **extent rule** (part of theme definition, D5) maps children bbox → parent `(w, h)`.
   Padding, label height, etc. are style properties in the theme schema, not hardcoded constants.
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

#### Where it lives

- **`@marlinspike/canvas`** — provides the generic mechanism: opaque shape type, primitive
  constructors, `CanvasTheme` interface, SDF geometry, renderers. Knows nothing about roles or
  marlinspike semantics.
- **`src/`** — defines the concrete role types (`"leaf" | "container" | ...`), the role
  computation function (`TreeNode` + expansion state → role), the theme definitions (CLASSIC),
  and the constraint→style-override merging. Application code, not a package.

#### Roles are derived, not prescribed

Visual roles are computed from structure — no prescription needed:

- **leaf** — `kind === "leaf"`
- **container** — `kind === "composite"` and expanded
- **collapsed-subgraph** — `kind === "composite"` and not expanded
- **ref** — `type === "ref"`

Role computation is a pure function of `TreeNode` + expansion state. Constraints don't override
roles (that would mean making a node *look like* something it structurally isn't). Instead,
constraints override style properties within a role using the same schema vocabulary as theme
definitions (D6). The role is a structural fact, not a styling choice.

#### Constructive SDF geometry (deferred)

The canvas geometry currently only has primitives (circle, rect). A natural extension is
**constructive geometry** — combinators for building complex shapes from simple ones:

- **Union** — `min(sdf_a, sdf_b)` — merge two shapes
- **Intersection** — `max(sdf_a, sdf_b)` — keep only overlap
- **Subtraction** — `max(sdf_a, -sdf_b)` — cut one shape from another
- **Smooth variants** — `smin`, `smax` — blend transitions between shapes

Reference: [Inigo Quilez — 2D distance functions](https://iquilezles.org/articles/distfunctions2d/)

This fits the architecture naturally: constructed SDFs are still SDFs, so layout and rendering
consume them identically. A shape built from `union(circle, rect)` has the same interface as a
primitive circle — the SDF contract is the composability mechanism.

**WebGL rendering target**: SDF constructive geometry is extremely performant in a GL context.
SDFs evaluate per-pixel on the GPU, so arbitrarily complex shapes (unions, intersections, smooth
blends) render at the same cost as simple primitives. If constructive SDF geometry is implemented,
a WebGL renderer for `@marlinspike/canvas` becomes a natural next step — the SDF functions
translate directly to GLSL fragment shaders. This would enable:

- Hardware-accelerated rendering of complex node shapes
- Smooth zoom with resolution-independent geometry
- Large graph rendering (thousands of nodes) without DOM bottlenecks
- Animated shape transitions via SDF interpolation

The current SVG renderer would remain as a lightweight/server-side option.

#### Extension concept (deferred)

Theme definitions fit into a broader "extension" concept: a bundle of themes + primitive
definitions + possibly layout hints. Different extensions could provide entirely different
visual languages for the same semantic model. Defer until the theme system is proven.

#### Checklist

- [ ] 8.1 Define opaque shape type in canvas — single type, SDF as only external query (D1).
      Primitive constructors (circle, rect, rounded-rect) produce this type. Canvas retains
      internal type knowledge for rendering (D2).
- [ ] 8.2 Extend `CanvasTheme` to resolve geometry (not just style). Theme maps
      `(role, context)` → `(shape, style)` (D3).
- [ ] 8.3 Define style schema as declarative data (D5). Theme definitions interpretable from
      structured format (JSON or similar). Includes extent rules (padding, label height) for
      containers.
- [ ] 8.4 Define visual role type and role computation function in `src/` — pure function of
      `TreeNode` + expansion state → role.
- [ ] 8.5 Create CLASSIC theme definition in `src/` — first instance of the theme schema (D7).
      Reproduces current visual behavior.
- [ ] 8.6 Replace canvas-adapter shape hardcoding with theme-based resolution (D4). Dynamic
      dispatch, CanvasNode receives resolved geometry (not role-aware).
- [ ] 8.7 Container extent rules in theme schema (D5). Replaces hardcoded GROUP_PADDING /
      LABEL_H with style properties.
- [ ] 8.8 Migrate constraints to top-level style overrides using theme schema vocabulary (D6).
      Migrate `WORKSPACE_CONSTRAINT` and `PROFILE_CONSTRAINT` from `data.rendering.shape`.
- [ ] 8.9 Theme swappability: verify that swapping themes works with all layout algorithms
      (any theme + any layout = correct, because SDF is the universal interface).
- [ ] 8.10 Judgment-ready: future judgments can produce roles or style overrides without
      knowing geometry — theme resolution handles it (D3).

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
- [x] Visual check: all 5 algorithms work in IDE (switch between them)
- [x] Visual check: port layout correct (inputs left, outputs right)
- [x] Visual check: expanded containers layout children correctly
