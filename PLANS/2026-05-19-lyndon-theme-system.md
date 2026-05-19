# Theme system

**Branch:** lyndon/theme-system
**Date:** 2026-05-19
**Branch Preview:** <!-- replace me -->

## Context

Shape knowledge is scattered across the codebase: `CanvasNode.shape: "circle" | "rect"` is a
rigid enum with 12+ dispatch points across rendering, edge clipping, surface geometry, and the
IDE adapter. The theme system only resolves style (colors/stroke) — shape is determined before
the theme sees the node. This makes it impossible to swap visual styles or introduce new shapes
without touching multiple files.

**Continues from:** [`PLANS/2026-05-18-lyndon-extract-layout.md`](2026-05-18-lyndon-extract-layout.md)
— Phase 8 (design decisions D1–D9) was designed during the layout extraction but deferred as
out of scope for that branch. This branch implements Phase 8.

## Goal

Replace the shape enum with an opaque `NodeGeometry` type, make the theme responsible for
resolving geometry (not just style), introduce visual roles, and create the CLASSIC theme that
reproduces current visual behavior exactly.

### Not in scope (deferred from extract-layout Phase 8)

- **ForceNode shape representation (D9)** — layout package unchanged. Future: extensible
  tagged-record approach (see Haskell Diagrams, Inigo Quilez references in extract-layout plan).
- **New shape types** (diamond, hexagon, etc.) — the infrastructure enables them but we don't
  add any yet.
- **Constructive SDF geometry** — union, intersection, subtraction combinators. Deferred.
- **WebGL rendering target** — natural follow-on from SDF-based shapes. Deferred.
- **Extension concept** — bundles of themes + primitives + layout hints. Deferred.

## Approach

### Phase A — `NodeGeometry` type and implementations

- [x] A.1 Create `packages/canvas/geometry/node-geometry.ts`:
  - `NodeGeometry` interface with methods:
    - `renderBody(w, h, style) → RenderPrimitive[]` — produce shape primitives relative to
      node center
    - `surfacePoint(cx, cy, w, h, tx, ty, gap) → Point` — boundary point toward target
    - `arcClip(arcC, r, center, w, h, gap, sweep, other) → Point` — arc-circle clipping
    - `sdf(w, h) → (px, py) → number` — signed distance field for this geometry (D1: SDF
      is the only external query mechanism for the opaque shape)
    - `portPositions(ports, w, h, labelH) → CanvasPort[]` — shape-specific port placement
    - `strokeDash(dashed: boolean) → string | undefined` — shape-specific dash pattern
  - `CIRCLE_GEOMETRY: NodeGeometry` singleton — wraps current circle logic from renderNode
    (line 34-45), surfacePoint (line 30-32), arcClipPoint
  - `RECT_GEOMETRY: NodeGeometry` singleton — wraps current rect logic from renderNode
    (line 19-33), surfacePoint (line 35-41), arcClipRect
  - `resolveGeometry(node) → NodeGeometry` — bridge function: `geometry ?? shape fallback`
- [x] A.2 Create `packages/canvas/geometry/node-geometry_test.ts` — verify implementations
  match existing inline behavior exactly (same inputs → same outputs)
- [x] A.3 Export from `packages/canvas/mod.ts`
- [x] A.4 `deno check` passes

#### Key files:
- New: `packages/canvas/geometry/node-geometry.ts`
- New: `packages/canvas/geometry/node-geometry_test.ts`
- Modify: `packages/canvas/mod.ts`

### Phase B — Rewire canvas dispatch points to use `NodeGeometry`

- [x] B.1 Add `geometry?: NodeGeometry` to `CanvasNode` (alongside existing `shape`)
- [x] B.2 Rewire `renderNode` (render/node.ts:19-46) — replace if/else with
  `resolveGeometry(node).renderBody(...)`. Style still comes from `theme.node(node)`.
- [x] B.3 Rewire `surfacePoint` (geometry/surface.ts:30-41) — replace shape dispatch with
  `resolveGeometry(from).surfacePoint(...)`
- [x] B.4 Rewire `computeEdgePath` (render/edge.ts:86-98) — replace 4 shape checks with
  `resolveGeometry(pa).arcClip(...)` and `resolveGeometry(pb).arcClip(...)`
- [x] B.5 Tests pass without updating helpers — resolveGeometry falls back to shape field.
  573 tests green.
- [x] B.6 All tests pass, visual output byte-identical

#### Key files:
- Modify: `packages/canvas/scene/types.ts` — add `geometry?` field
- Modify: `packages/canvas/render/node.ts` — replace shape dispatch
- Modify: `packages/canvas/geometry/surface.ts` — replace shape dispatch
- Modify: `packages/canvas/render/edge.ts` — replace 4 shape dispatches
- Modify: `packages/canvas/render/scene_test.ts` — update test helpers
- Modify: `packages/canvas/geometry/surface_test.ts` — update test helpers

### Phase C — Extend `CanvasTheme` with geometry resolution

- [x] C.1 Add optional `resolveNode` to `CanvasTheme<S>`:
  `resolveNode?: (node: CanvasNode<S>) => { geometry: NodeGeometry; style: NodeStyle }`
  When present, takes precedence over the separate `node` resolver.
- [x] C.2 Add optional `constants` to `CanvasTheme<S>`:
  `constants?: { groupPadding: number; labelH: number; leafRadius: number }`
- [x] C.3 Update `renderNode` — if `theme.resolveNode` exists, use it for both geometry and
  style; otherwise fall back to `theme.node(node)` + `resolveGeometry(node)`
- [x] C.4 `marlinTheme` unchanged — continues using `node` resolver. Works via fallback.
- [x] C.5 Tests pass (102 canvas tests)

#### Key files:
- Modify: `packages/canvas/style/types.ts` — add `resolveNode?`, `constants?`
- Modify: `packages/canvas/render/node.ts` — theme.resolveNode support
- Modify: `packages/canvas/mod.ts` — export new types if any

### Phase D — Style property schema

Define the shared vocabulary for style properties used by both themes and per-element
overrides. Same data format in both contexts — themes define defaults per role, elements
override specific properties.

- [x] D.1 Define `NodeStyleProps` in `packages/canvas/style/types.ts` — the declarative
  property bag shared by themes and element overrides:
  ```
  interface NodeStyleProps {
    geometry?: "circle" | "rect";    // resolved to NodeGeometry by theme
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    labelFill?: string;
    labelFont?: string;
    labelSize?: number;
    opacity?: number;
    groupPadding?: number;           // container extent rule
    labelH?: number;                 // container label strip height
  }
  ```
  All fields optional — overrides merge sparsely over theme defaults.
- [x] D.2 Export from `packages/canvas/mod.ts`
- [x] D.3 Tests pass

#### Key files:
- Modify: `packages/canvas/style/types.ts` — add `NodeStyleProps`
- Modify: `packages/canvas/mod.ts`

### Phase E — Visual roles and CLASSIC theme

Roles and the CLASSIC theme live in `src/` (application code, not a package). The canvas
package provides the generic mechanism; roles are marlinspike-specific semantics.

- [ ] E.1 Add `role` field to `MarlinNodeState` in `src/ui/lib/canvas-adapter.ts`:
  `role: "leaf" | "container" | "collapsed-subgraph" | "ref" | "leaf-rect"`
  Derived from: `kind`, expansion state, constraint overrides.
- [ ] E.2 Add `styleOverrides?: NodeStyleProps` to `MarlinNodeState` — per-element style
  overrides from constraints, merged over theme defaults during resolution.
- [ ] E.3 Create `src/ui/lib/classic-theme.ts` — the CLASSIC theme implementing
  `CanvasTheme<MarlinNodeState>` with `resolveNode` that:
  1. Maps role to default `NodeStyleProps` (the theme definition)
  2. Merges `node.state.styleOverrides` over the defaults (sparse merge)
  3. Resolves `geometry` string to `NodeGeometry` (CIRCLE/RECT)
  4. Returns `{ geometry, style }`
  Also includes `resolveEdgeStyle`, `resolvePortStyle`, `resolveDecorations`,
  and `constants: { groupPadding: 32, labelH: 22, leafRadius: 26 }`.
- [ ] E.4 Role computation in `emitLevel()` — replace shape determination
  (canvas-adapter.ts:241-243) with role derivation:
  ```
  isExpanded → "container"
  isRef → "ref"
  isComposite && hasChildren → "collapsed-subgraph"
  else → "leaf"
  ```
  Set `geometry` on CanvasNode based on role + overrides.
- [ ] E.5 Replace `marlinIdeTheme` in canvas-adapter.ts with import of CLASSIC theme
- [ ] E.6 Update `canvas.tsx` — read `GROUP_PADDING` and `LABEL_H` from
  `theme.constants` instead of hardcoded constants
- [ ] E.7 Tests pass, visual behavior identical

#### Key files:
- New: `src/ui/lib/classic-theme.ts`
- Modify: `src/ui/lib/canvas-adapter.ts` — add role + styleOverrides to state, remove
  style resolvers, use CLASSIC theme
- Modify: `src/ui/components/canvas.tsx` — theme constants for GROUP_PADDING/LABEL_H

### Phase F — Migrate constraints to style overrides

Eliminate `data.rendering.shape`. Constraints use the same `NodeStyleProps` format as
themes, applied as a top-level `style` field on the `Constraint` type.

- [ ] F.1 Add optional `style?: NodeStyleProps` to `Constraint` interface in
  `src/ui/workspace.ts` (top-level, not nested in `data`)
- [ ] F.2 Migrate `WORKSPACE_CONSTRAINT`: remove `data: { rendering: { shape: "rect" } }`,
  add `style: { geometry: "rect" }` at top level
- [ ] F.3 Migrate `PROFILE_CONSTRAINT`: same pattern
- [ ] F.4 Update `canvas.tsx` constraint processing (lines 894-900): read from
  `constraint.style` instead of `constraint.data.rendering.shape`. Build
  `styleOverridesMap: Map<string, NodeStyleProps>` instead of `shapeMap`. Pass through
  to adapter where it becomes `MarlinNodeState.styleOverrides`.
- [ ] F.5 Remove the old `shapeMap` code path entirely
- [ ] F.6 Update DESIGN.md reference to `data.rendering.shape`
- [ ] F.7 Tests pass, constraint-driven rect nodes still render correctly

#### Key files:
- Modify: `src/ui/workspace.ts` — add `style?` to Constraint
- Modify: `src/graph/builtin_constraints.ts` — migrate WORKSPACE + PROFILE constraints
- Modify: `src/ui/components/canvas.tsx` — new constraint→style processing
- Modify: `src/ui/lib/canvas-adapter.ts` — receive styleOverrides from canvas.tsx
- Modify: `DESIGN.md` — update constraint docs

### Phase G — Remove deprecated `shape` field

- [ ] G.1 Make `shape` optional on `CanvasNode` with deprecation comment
- [ ] G.2 Remove all remaining `shape` assignments in canvas-adapter.ts — nodes only carry
  `geometry`
- [ ] G.3 Update `resolveGeometry` fallback — warn/error if neither geometry nor shape present
- [ ] G.4 Update all test helpers to use `geometry` only
- [ ] G.5 Update layout-package stories and canvas-package stories if they construct
  CanvasNodes with `shape`
- [ ] G.6 `NO_COLOR=1 deno task ci` — all tests green
- [ ] G.7 Consider: keep `shape` as truly optional for simple/external consumers who don't
  care about the theme system? Or remove entirely? Decision at implementation time based on
  how many external touch points exist.

#### Key files:
- Modify: `packages/canvas/scene/types.ts` — shape optional or removed
- Modify: `packages/canvas/geometry/node-geometry.ts` — update resolveGeometry
- Modify: `packages/canvas/render/scene_test.ts` — geometry-only helpers
- Modify: various story files

### Dependency graph

```
A (NodeGeometry type)
  → B (rewire canvas dispatch)
    → C (extend CanvasTheme)
      → D (style property schema)
        → E (roles + CLASSIC theme + rewire IDE)
          → F (migrate constraints to style overrides)
            → G (remove shape field)
```

Each phase is independently committable. A–D are within `packages/canvas/`.
E–F are the integration steps. G is cleanup.

## Open Questions

1. **`decorations` resolver** — the current `resolveDecorations` in canvas-adapter.ts reads
   `node.state.isContainerBackground`, `node.state.childrenCount`, etc. This is deeply tied
   to MarlinNodeState. Should it move to the CLASSIC theme or stay in the adapter?
   Lean: move to CLASSIC theme (it's visual, not structural).

2. **`isContainerBackground` pattern** — expanded containers currently emit TWO CanvasNodes:
   a background rect and an invisible overlay. With the role system, should we instead have
   a single "container" role that renders both? Or keep the two-node pattern?
   Lean: keep two-node pattern for now — it works and the refactor scope is already large.

### Resolved

- **SDF on NodeGeometry** — YES, include `sdf(w, h)` now. It's the core of D1.
- **Port positioning on NodeGeometry** — YES, `portPositions(ports, w, h, labelH)` as a
  method. Centralizes shape-specific dispatch.
- **Scope** — full (A–G). All 7 phases in this branch.
- **Style schema** — YES, implement now as `NodeStyleProps`. Same property format for theme
  definitions and per-element overrides. Sparse merge: element overrides ← theme defaults.
- **Constraint migration** — YES, eliminate `data.rendering.shape`. Move to top-level
  `style: NodeStyleProps` on `Constraint`. Same vocabulary as themes.

## Verification

- [ ] `NO_COLOR=1 deno task ci` — all tests green
- [ ] New unit tests for NodeGeometry implementations
- [ ] CLASSIC theme produces identical styles to current marlinIdeTheme
- [ ] Visual check: all 5 layout algorithms work
- [ ] Visual check: port layout correct
- [ ] Visual check: expanded containers render correctly
- [ ] Visual check: edge clipping identical for circle and rect nodes
- [ ] `marlinTheme` (simple canvas-package theme) still works for package stories
