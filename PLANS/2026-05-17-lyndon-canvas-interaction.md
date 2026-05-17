# Canvas Interaction

**Branch:** lyndon/canvas-interaction
**Date:** 2026-05-17
**Branch Preview:** <!-- replace me -->

## Context

Follows from **D4** in the `extract-canvas` plan (`PLANS/2026-05-16-lyndon-extract-canvas.md`):

> D4. _(deferred)_ Update `canvas.tsx` renderLevel to use canvas package's render data functions — requires hierarchical scene support

The IDE's `renderLevel` function (650 lines) handled recursive rendering of expanded
composites, interaction modes, drag, selection, expand/collapse, and hover highlighting.
This work extended `@marlinspike/canvas` with interaction primitives and migrated the IDE
to use the package's rendering pipeline and adapter pattern.

## Goal

Extend `@marlinspike/canvas` with:

1. **Flat scene rendering** — the package renders positioned elements with z-ordering; no hierarchy concepts
2. **Interaction hints** — metadata on primitives declaring what gestures each element responds to
3. **Hit-testing** — spatial query: point → deepest interactive primitive
4. **CanvasInteraction hooks** — consumer-provided callbacks for drag, click, double-click, hover
5. **PointerHandler** — optional state machine that manages drag threshold, hover tracking, dispatches hooks
6. **Edge style extensibility** — strokeDash, opacity, endCap for dashed/dotted/non-interactive edges
7. **Canvas adapter** — IDE-side adapter that flattens hierarchy into world-space elements for the flat renderer

### Design principle

The canvas package is a **flat, z-ordered element renderer**. Hierarchy is always domain-specific —
the consumer (canvas-adapter) owns flattening trees into world-space positioned elements.
Container backgrounds are just large rect nodes placed behind their children in the array.

### What's NOT in scope

- **IDE mode logic** (select/add-node/add-edge state machine) — consumer concern
- **Layout algorithms** — separate extraction planned
- **Hierarchy in the package** — consumer flattens hierarchy before passing to the package
- **Actual DOM/browser dependency in core** — PointerHandler accepts abstract points, not MouseEvents

## Approach

### Phase 1 — Interaction types + hit-testing

- [x] 1.1 Create `packages/canvas/interaction/types.ts`: InteractionHint, CanvasInteraction
- [x] 1.2 Add `interaction?: InteractionHint` and `tx?/ty?` to `RenderGroup` in `primitives.ts`
- [x] 1.3 Create `packages/canvas/interaction/hit-test.ts`: hitTest(root, point) → InteractionHint | null
- [x] 1.4 Tests: hit-test with overlapping elements, transform offsets, z-order

### Phase 2 — Interaction tagging in render functions

- [x] 2.1 `renderNode` → group gets interaction hint (draggable, clickable, doubleClickable, hoverable)
- [x] 2.2 `renderEdge` → group gets interaction hint (clickable, hoverable)
- [x] 2.3 All render functions populate `tx`/`ty` on output groups

### Phase 3 — PointerHandler

- [x] 3.1 Create `packages/canvas/interaction/pointer.ts`: PointerHandler state machine
- [x] 3.2 Tests: simulate pointer sequences, verify hook dispatch (all headless, no DOM)

### Phase 4 — Edge style extensibility

- [x] 4.1 Add `strokeDash`, `opacity` to `RenderPath`; update `svgRenderer.path()`
- [x] 4.2 Add `strokeDash`, `opacity`, `endCap` to `EdgeStyle`
- [x] 4.3 Add `interactive`, `kind` to `CanvasEdge`
- [x] 4.4 Update `renderEdge`: dash, opacity, endCap ("arrow"/"dot"/"none"), non-interactive
- [x] 4.5 Add `dstGap` parameter to `computeEdgePath`
- [x] 4.6 Tests: 8 new edge style tests

### Phase 5 — Generic types (CanvasNode\<S\>)

- [x] 5.1 Add generic `S` parameter to `CanvasNode<S>`, `CanvasScene<S>`, `CanvasTheme<S>`, all resolvers
- [x] 5.2 Add typed `state?: S` field replacing untyped `data` bag
- [x] 5.3 Create `MarlinNodeState` interface in adapter with IDE-specific visual flags
- [x] 5.4 Theme resolvers access `node.state!` directly — zero casting

### Phase 6 — Canvas adapter + IDE migration

- [x] 6.1 Create `src/ui/lib/canvas-adapter.ts` with `buildCanvasScene`, `marlinIdeTheme`
- [x] 6.2 Migrate canvas.tsx to use `buildCanvasScene` + `renderScene` + `svgRenderer`
- [x] 6.3 Eliminate `buildNodeMetaMap` — direct scene node lookup
- [x] 6.4 Ref edges rendered through normal pipeline (adapter emits as regular edges with `kind`)
- [x] 6.5 Ghost edge converted from SVG string to `RenderPrimitive`

### Phase 7 — Flatten package (remove hierarchy)

- [x] 7.1 Rewrite adapter to emit flat world-space scenes (container backgrounds = rect nodes)
- [x] 7.2 Update canvas.tsx for flat scenes (`findSceneNode` flat lookup, `isContainerBackground`)
- [x] 7.3 Remove `children`, `expanded`, `edges` from `CanvasNode`
- [x] 7.4 Remove `OverlayEdge`, `overlayEdges` from scene types
- [x] 7.5 Remove `ContainerStyle`, `ContainerStyleResolver`, `container` from theme
- [x] 7.6 Delete `renderContainer`, `renderLevel`, `renderOverlayEdges`
- [x] 7.7 Simplify `renderScene` — direct node/edge iteration, no recursion
- [x] 7.8 Update stories: Hierarchical story uses flat consumer-side expand/collapse
- [x] 7.9 Update tests: flat hit-test equivalents, remove overlay/container tests
- [x] 7.10 CI: 540 tests pass

#### Key files modified:
- `packages/canvas/scene/types.ts` — flat CanvasNode (no children/expanded/edges)
- `packages/canvas/style/types.ts` — no ContainerStyle
- `packages/canvas/render/scene.ts` — flat renderScene
- `packages/canvas/render/node.ts` — always renders as leaf
- `packages/canvas/render/edge.ts` — extensible edge styles
- `packages/canvas/render/primitives.ts` — interaction hints, strokeDash/opacity on path
- `packages/canvas/render/svg.ts` — new attribute support
- `packages/canvas/interaction/` — types, hit-test, pointer handler
- `packages/canvas/mod.ts` — clean exports
- `src/ui/lib/canvas-adapter.ts` — flat scene builder, IDE theme
- `src/ui/components/canvas.tsx` — uses adapter pipeline
- `src/ui/stories/canvas-package.stories.tsx` — flat Hierarchical story

#### Deleted files:
- `packages/canvas/render/container.ts`
- `packages/canvas/render/container_test.ts`

## Open Questions

1. **Path hit-testing for arcs**: Currently uses `lineSdfDist` for straight edges. Arc paths would need `arcSdfDist`. Not yet needed — revisit if arc edge hit-testing becomes important.

2. **Hit-test performance**: Linear walk for large scenes (1000+ nodes). Not a problem in practice — the IDE rarely renders >100 nodes at one level. Spatial indexing can be added later if profiling shows need.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes — 540 tests
- [x] Flat scene rendering works correctly
- [x] Hit-test returns correct element with z-order (later in array = on top)
- [x] PointerHandler dispatches correct hooks for drag, click, double-click, hover
- [x] Edge extensibility: dash, dot endCap, non-interactive edges all render correctly
- [x] Hierarchical story demonstrates consumer-side expand/collapse with flat scenes
- [ ] Visual check: expanded containers render correctly (background + children + ports)
- [ ] Visual check: ref edges render (dashed + dot)
- [ ] Visual check: ghost edge works during edge-draw
