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

- **Constraint schema migration (D6)** — constraints keep `data.rendering.shape` for now; the
  adapter interprets them. Full migration to top-level style overrides deferred.
- **ForceNode shape representation (D9)** — layout package unchanged. Future: extensible
  tagged-record approach (see Haskell Diagrams, Inigo Quilez references in extract-layout plan).
- **New shape types** (diamond, hexagon, etc.) — the infrastructure enables them but we don't
  add any yet.
- **Style schema as JSON (D5)** — deferred until themes-as-code evolution path is clearer.
- **Constructive SDF geometry** — union, intersection, subtraction combinators. Deferred.
- **WebGL rendering target** — natural follow-on from SDF-based shapes. Deferred.
- **Extension concept** — bundles of themes + primitives + layout hints. Deferred.

## Approach

### Phase A — `NodeGeometry` type and implementations

- [ ] A.1 Create `packages/canvas/geometry/node-geometry.ts`:
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
- [ ] A.2 Create `packages/canvas/geometry/node-geometry_test.ts` — verify implementations
  match existing inline behavior exactly (same inputs → same outputs)
- [ ] A.3 Export from `packages/canvas/mod.ts`
- [ ] A.4 `deno check` passes

#### Key files:
- New: `packages/canvas/geometry/node-geometry.ts`
- New: `packages/canvas/geometry/node-geometry_test.ts`
- Modify: `packages/canvas/mod.ts`

### Phase B — Rewire canvas dispatch points to use `NodeGeometry`

- [ ] B.1 Add `geometry?: NodeGeometry` to `CanvasNode` (alongside existing `shape`)
- [ ] B.2 Rewire `renderNode` (render/node.ts:19-46) — replace if/else with
  `resolveGeometry(node).renderBody(...)`. Style still comes from `theme.node(node)`.
- [ ] B.3 Rewire `surfacePoint` (geometry/surface.ts:30-41) — replace shape dispatch with
  `resolveGeometry(from).surfacePoint(...)`
- [ ] B.4 Rewire `computeEdgePath` (render/edge.ts:86-98) — replace 4 shape checks with
  `resolveGeometry(pa).arcClip(...)` and `resolveGeometry(pb).arcClip(...)`
- [ ] B.5 Update tests — scene_test.ts helpers (`circleNode`, `rectNode`) gain `geometry`
  field alongside `shape`. surface_test.ts likewise.
- [ ] B.6 All tests pass, visual output byte-identical

#### Key files:
- Modify: `packages/canvas/scene/types.ts` — add `geometry?` field
- Modify: `packages/canvas/render/node.ts` — replace shape dispatch
- Modify: `packages/canvas/geometry/surface.ts` — replace shape dispatch
- Modify: `packages/canvas/render/edge.ts` — replace 4 shape dispatches
- Modify: `packages/canvas/render/scene_test.ts` — update test helpers
- Modify: `packages/canvas/geometry/surface_test.ts` — update test helpers

### Phase C — Extend `CanvasTheme` with geometry resolution

- [ ] C.1 Add optional `resolveNode` to `CanvasTheme<S>`:
  `resolveNode?: (node: CanvasNode<S>) => { geometry: NodeGeometry; style: NodeStyle }`
  When present, takes precedence over the separate `node` resolver.
- [ ] C.2 Add optional `constants` to `CanvasTheme<S>`:
  `constants?: { groupPadding: number; labelH: number; leafRadius: number }`
- [ ] C.3 Update `renderNode` — if `theme.resolveNode` exists, use it for both geometry and
  style; otherwise fall back to `theme.node(node)` + `resolveGeometry(node)`
- [ ] C.4 Update `marlinTheme` (the simple canvas-package theme) — no change needed, it
  continues to use the `node` resolver. Nodes must carry `geometry` or `shape`.
- [ ] C.5 Tests pass

#### Key files:
- Modify: `packages/canvas/style/types.ts` — add `resolveNode?`, `constants?`
- Modify: `packages/canvas/render/node.ts` — theme.resolveNode support
- Modify: `packages/canvas/mod.ts` — export new types if any

### Phase D — Visual roles and CLASSIC theme

Roles and the CLASSIC theme live in `src/` (application code, not a package). The canvas
package provides the generic mechanism; roles are marlinspike-specific semantics.

- [ ] D.1 Add `role` field to `MarlinNodeState` in `src/ui/lib/canvas-adapter.ts`:
  `role: "leaf" | "container" | "collapsed-subgraph" | "ref" | "leaf-rect"`
  Derived from: `kind`, expansion state, constraint overrides.
- [ ] D.2 Create `src/ui/lib/classic-theme.ts` — the CLASSIC theme implementing
  `CanvasTheme<MarlinNodeState>` with `resolveNode` that maps roles to geometry + style.
  Moves the style logic from canvas-adapter.ts's `resolveNodeStyle` (lines 401-471) into
  the theme. Also includes `resolveEdgeStyle`, `resolvePortStyle`, `resolveDecorations`,
  and `constants: { groupPadding: 32, labelH: 22, leafRadius: 26 }`.
- [ ] D.3 Role computation in `emitLevel()` — replace shape determination
  (canvas-adapter.ts:241-243) with role derivation:
  ```
  isExpanded → "container"
  isRef → "ref"
  isComposite && hasChildren → "collapsed-subgraph"
  pos.shape === "rect" → "leaf-rect"
  else → "leaf"
  ```
  Set `geometry` on CanvasNode based on role (rect geometries for container/leaf-rect,
  circle for everything else).
- [ ] D.4 Replace `marlinIdeTheme` in canvas-adapter.ts with import of CLASSIC theme from
  `classic-theme.ts`
- [ ] D.5 Update `canvas.tsx` — read `GROUP_PADDING` and `LABEL_H` from
  `theme.constants` instead of hardcoded constants
- [ ] D.6 Tests pass, visual behavior identical

#### Key files:
- New: `src/ui/lib/classic-theme.ts`
- Modify: `src/ui/lib/canvas-adapter.ts` — add role to state, remove style resolvers,
  use CLASSIC theme
- Modify: `src/ui/components/canvas.tsx` — theme constants for GROUP_PADDING/LABEL_H

### Phase E — Remove deprecated `shape` field

- [ ] E.1 Make `shape` optional on `CanvasNode` with deprecation comment
- [ ] E.2 Remove all remaining `shape` assignments in canvas-adapter.ts — nodes only carry
  `geometry`
- [ ] E.3 Update `resolveGeometry` fallback — warn/error if neither geometry nor shape present
- [ ] E.4 Update all test helpers to use `geometry` only
- [ ] E.5 Update layout-package stories and canvas-package stories if they construct
  CanvasNodes with `shape`
- [ ] E.6 `NO_COLOR=1 deno task ci` — all tests green
- [ ] E.7 Consider: keep `shape` as truly optional for simple/external consumers who don't
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
      → D (roles + CLASSIC theme + rewire IDE)
        → E (remove shape field)
```

Each phase is independently committable. A–C are purely within `packages/canvas/`.
D is the integration step. E is cleanup.

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
- **Scope** — full (A–E). All 5 phases in this branch.

## Verification

- [ ] `NO_COLOR=1 deno task ci` — all tests green
- [ ] New unit tests for NodeGeometry implementations
- [ ] CLASSIC theme produces identical styles to current marlinIdeTheme
- [ ] Visual check: all 5 layout algorithms work
- [ ] Visual check: port layout correct
- [ ] Visual check: expanded containers render correctly
- [ ] Visual check: edge clipping identical for circle and rect nodes
- [ ] `marlinTheme` (simple canvas-package theme) still works for package stories
