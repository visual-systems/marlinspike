# Canvas Interaction

**Branch:** lyndon/canvas-interaction
**Date:** 2026-05-17
**Branch Preview:** <!-- replace me -->

## Context

Follows from **D4** in the `extract-canvas` plan (`PLANS/2026-05-16-lyndon-extract-canvas.md`):

> D4. _(deferred)_ Update `canvas.tsx` renderLevel to use canvas package's render data functions — requires hierarchical scene support

`@marlinspike/canvas` currently renders flat scenes — all nodes at one level with no hierarchy. The IDE's `renderLevel` function (650 lines, canvas.tsx:1972-2622) handles recursive rendering of expanded composite nodes, interaction modes (select, add-node, add-edge), drag, selection, expand/collapse, and hover highlighting. This is all tightly coupled to the workspace model and can't be reused.

Adding hierarchical scene support and a hooks-based interaction model to the canvas package would:
1. Remove ~650 lines from `src/ui/components/canvas.tsx` (the entire `renderLevel` function)
2. Make the package genuinely useful as a standalone interactive graph editor (Figma-like nested frames)
3. Enable headless interaction testing without DOM

## Goal

Extend `@marlinspike/canvas` with:

1. **Hierarchical scenes** — `CanvasNode.children` + `CanvasNode.edges` for recursive container rendering
2. **Interaction hints** — metadata on primitives declaring what gestures each element responds to
3. **Hit-testing** — spatial query: point → deepest interactive primitive (walks nested groups)
4. **CanvasInteraction hooks** — consumer-provided callbacks for drag, click, double-click, hover
5. **PointerHandler** — optional state machine that manages drag threshold, hover tracking, dispatches hooks
6. **Updated Figma-lite demo** — uses the interaction model instead of manual DOM event wiring

### What's NOT in scope

- **IDE mode logic** (select/add-node/add-edge state machine) — consumer concern
- **Layout algorithms** — separate extraction planned
- **Actual DOM/browser dependency in core** — PointerHandler accepts abstract points, not MouseEvents
- **Full D4 refactor of canvas.tsx** — that's a follow-up once this ships; this branch builds the capability

## Approach

### Phase 1 — Hierarchical scene types (no rendering changes)

- [x] 1.1 Extend `CanvasNode` in `packages/canvas/scene/types.ts`:
  - `children?: CanvasNode[]` — nested nodes within this container
  - `expanded?: boolean` — if true and has children, render as container
  - `edges?: CanvasEdge[]` — edges among children at this level
- [x] 1.2 Add `ContainerStyle` to `packages/canvas/style/types.ts`:
  - `ContainerStyle { fill, stroke, strokeWidth, labelFill, labelFont, labelSize, cornerRadius, strokeDash?, opacity? }`
  - `ContainerStyleResolver = (node: CanvasNode) => ContainerStyle`
  - Add optional `container?: ContainerStyleResolver` to `CanvasTheme`
- [x] 1.3 Add container style to `packages/canvas/style/marlin-theme.ts` (default dark theme values matching current expanded-group look)
- [x] 1.4 Update barrel exports in `mod.ts`

### Phase 2 — Hierarchical rendering

- [x] 2.1 Extract `renderLevel(nodes, edges, theme): RenderPrimitive[]` helper in `packages/canvas/render/scene.ts`:
  - Current `renderScene` body becomes `renderLevel` call wrapped in root group
  - Handles nodes + edges at one level (same logic as today)
- [x] 2.2 Create `packages/canvas/render/container.ts`:
  - `renderContainer(node: CanvasNode, theme): RenderGroup`
  - Renders: background rect (full w/h, themed), label text (top-left corner), then recursively calls `renderLevel(node.children, node.edges, theme)` for internal content
  - The group gets `transform: translate(x, y)` and `id: node.id`
- [x] 2.3 Update `renderNode` to branch: if `node.expanded && node.children?.length`, delegate to `renderContainer`; otherwise render as leaf (existing behavior)
- [x] 2.4 Tests: hierarchical scene with 2-level nesting → assert primitive tree structure (container rect + children inside nested group)

### Phase 3 — Interaction types + hit-testing

- [x] 3.1 Create `packages/canvas/interaction/types.ts`:
  ```typescript
  InteractionHint { id, draggable?, clickable?, doubleClickable?, hoverable?, cursor? }
  CanvasInteraction { onDragStart?, onDragMove?, onDragEnd?, onClick?, onDoubleClick?, onHoverEnter?, onHoverLeave? }
  ```
- [x] 3.2 Add `interaction?: InteractionHint` field to `RenderGroup` in `primitives.ts`
  - Also add typed `tx?: number; ty?: number` to `RenderGroup` for hit-test offset computation (avoids parsing transform strings)
- [x] 3.3 Create `packages/canvas/interaction/hit-test.ts`:
  - `hitTest(root: RenderGroup, point: Point): InteractionHint | null`
  - Walks tree depth-first in reverse child order (topmost visual element = last child)
  - Accumulates tx/ty offsets through nested groups
  - Shape tests: circle (distance < r), rect (bounds), path (lineSdfDist with tolerance)
  - Returns deepest interactive primitive's hint, or null
- [x] 3.4 Tests: hit-test with nested groups, overlapping elements, transform offsets

### Phase 4 — Interaction tagging in render functions

- [x] 4.1 `renderNode` → output group gets `interaction: { id: node.id, draggable: true, clickable: true, doubleClickable: true, hoverable: true }`
- [x] 4.2 `renderContainer` → container background group gets same interaction hint
- [x] 4.3 `renderEdge` → edge group gets `interaction: { id: edge.id, clickable: true, hoverable: true }`
- [x] 4.4 All render functions populate `tx`/`ty` on their output groups (from node.x/node.y)
- [x] 4.5 Tests: verify render output contains expected interaction hints (covered by hit-test tests which depend on correct tagging)

### Phase 5 — PointerHandler

- [x] 5.1 Create `packages/canvas/interaction/pointer.ts`:
  ```typescript
  PointerHandlerConfig { getRoot(): RenderGroup, hooks: CanvasInteraction, dragThreshold?: number }
  PointerHandler { onPointerDown(pos), onPointerMove(pos), onPointerUp(pos) }
  ```
  - State machine: idle → potential-drag → dragging (threshold-based)
  - Click = pointerdown + pointerup without exceeding threshold
  - Double-click = two clicks within 300ms
  - Hover = pointerMove when idle, dispatches enter/leave on target change
- [x] 5.2 Tests: simulate pointer sequences, verify hook dispatch (all headless, no DOM)

### Phase 6 — Integration + demo

- [x] 6.1 Update `mod.ts` exports: interaction types, hitTest, PointerHandler, renderContainer, ContainerStyle
- [x] 6.2 _(adjusted)_ Figma-lite story kept as-is (its manual DOM wiring still works). New "Hierarchical" story added demonstrating hitTest + expand/collapse via interaction model.
- [x] 6.3 Add a new story: "Hierarchical" — nested containers that can be expanded/collapsed via double-click
- [x] 6.4 Full CI pass — 539 tests

#### Key files to modify:
- `packages/canvas/scene/types.ts` — extend CanvasNode
- `packages/canvas/style/types.ts` — add ContainerStyle
- `packages/canvas/style/marlin-theme.ts` — add container theme
- `packages/canvas/render/primitives.ts` — add interaction + tx/ty to RenderGroup
- `packages/canvas/render/scene.ts` — extract renderLevel
- `packages/canvas/render/node.ts` — branch on expanded
- `packages/canvas/render/edge.ts` — add interaction hint
- `packages/canvas/render/svg.ts` — handle new fields (cursor from interaction hint)
- `packages/canvas/mod.ts` — new exports
- `src/ui/stories/canvas-package.stories.tsx` — updated Figma-lite + new Hierarchical story

#### New files:
- `packages/canvas/render/container.ts`
- `packages/canvas/interaction/types.ts`
- `packages/canvas/interaction/hit-test.ts`
- `packages/canvas/interaction/pointer.ts`
- `packages/canvas/interaction/hit-test_test.ts`
- `packages/canvas/interaction/pointer_test.ts`
- `packages/canvas/render/container_test.ts`

## Open Questions

1. **Path hit-testing for arcs**: `lineSdfDist` works for straight edges. For arc paths, we need point-to-arc-distance. Should we add an `arcSdfDist` utility to geometry, or approximate arcs as polylines for hit-testing? **Recommendation**: Add `arcSdfDist(point, center, radius, startAngle, endAngle)` to geometry/arc.ts — it's a simple distance-to-circle-segment calculation.

2. **Double-click timing**: PointerHandler needs a timeout to distinguish single-click from double-click. Should `onClick` fire immediately (and `onDoubleClick` fires additionally), or should `onClick` be delayed to wait for potential second click? **Recommendation**: Fire onClick immediately, fire onDoubleClick additionally — matches DOM behavior and avoids click delay.

3. **Hit-test performance**: For large scenes (1000+ nodes), linear walk may be slow. Is spatial indexing (quadtree) needed? **Recommendation**: No — start simple. The IDE rarely renders more than ~100 nodes at one level. Optimize later if profiling shows need.

4. **RenderGroup tx/ty vs transform string**: Adding typed `tx`/`ty` creates mild redundancy with the `transform` string. **Recommendation**: Keep both — `transform` is what renderers use for output, `tx`/`ty` is what hit-testing uses for spatial math. Render functions populate both consistently.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (lint, fmt, type-check, all tests) — 539 tests
- [x] Canvas package tests pass independently: `NO_COLOR=1 deno test packages/canvas/` — 78 tests
- [x] Existing flat scene rendering unchanged (backward compatible)
- [x] Hierarchical scene renders correctly: container with children inside
- [x] Hit-test returns correct element for nested scenes
- [x] PointerHandler dispatches correct hooks for drag, click, double-click, hover sequences
- [x] _(adjusted)_ Figma-lite story kept as-is; Hierarchical story demonstrates hitTest-based interaction
- [x] New "Hierarchical" story demonstrates expand/collapse via double-click
