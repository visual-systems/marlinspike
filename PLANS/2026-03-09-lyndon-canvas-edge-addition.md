# Add canvas edge addition mode

**Branch:** lyndon/canvas-edge-addition
**Date:** 2026-03-09

## Context

Currently edges can only be created via the node inspector's edge panel (a dropdown picker). There is no way to draw an edge directly on the canvas. This makes the canvas feel like a read-only viewer rather than an editor.

## Goal

Add an "Add Edge" toggle mode to the canvas toolbar. When active:
- Clicking a first node marks it as the edge source (highlighted)
- A ghost dashed line follows the cursor from the source node
- Clicking a second node creates the edge and exits draw state
- Clicking the canvas background or pressing Escape cancels and deselects
- The new edge is immediately visible and selectable

## Approach

All changes are confined to `src/ui/components/canvas.tsx` and `src/ui/components/inspector.tsx`.

### Mode system

```typescript
type CanvasMode = "select" | "add-edge";
```

Forward-compatible union — future modes extend it.

### Checklist

- [x] Add `CanvasMode = "select" | "add-edge"` type
- [x] Add `mode` state to `Canvas`
- [x] Add `edgeDraw` state; set on source node click in add-edge mode
- [x] Add `mouseCanvas` state; update via `onMouseMove` on `<svg>`
- [x] Add "Add Edge" toggle button to `CanvasTopBar`
- [x] Escape resets to `"select"`, clears `edgeDraw`, and deselects
- [x] Background click in `add-edge` mode returns to select mode and deselects
- [x] Background click in `select` mode deselects (tracked via `PanState.hasMoved`)
- [x] Clicking a selected edge toggles it off
- [x] Ghost line clipped to node surface boundary (not center)
- [x] Ghost line uses world-space coordinates for nested nodes (`worldOffset`)
- [x] `onEdgeNodeClick` implemented with source/second/self-click logic
- [x] `addEdge` creates edge via `update`
- [x] Ghost dashed line rendered inside world `<g>` transform
- [x] Source node highlighted with `#5070c0` stroke
- [x] Add `Canvas/EdgeAddition` story

### Arc edge geometry (multi-edge bundles)

- [x] Arc sweep cross-product sign fixed for screen-space (Y-down) coordinates
- [x] `pathEndTangent` accepts actual `arcC`; correct screen-space CW tangent formula
- [x] `arcMidpoint` uses real `arcC` bisector for label placement
- [x] `arcClipPoint` for circle nodes: arc-circle boundary intersection
- [x] `arcClipRect` for expanded-group rect nodes: arc-rect boundary intersection
  - Source: travel forward (arcSweep) from node center to find exit point
  - Destination: travel backward (1 - arcSweep) from node center to find entry point
- [x] `EdgeRenderData` carries `arcC` through to both render passes

### EdgeInspector fixes

- [x] Edge ID shown as click-to-copy field (`CopyField`)
- [x] `useEffect` populates label input and data textarea on mount (Hono DOM doesn't support `defaultValue`)
- [x] `key={edge.id}` forces remount when switching between edges

### Stories added

- [x] `Canvas/EdgeAddition` — interactive edge drawing test
- [x] `Canvas/ExpandedEdges` — arc geometry between expanded group and leaf node

## Open Questions

None.

## Verification

- [x] `NO_COLOR=1 deno task fmt && deno task lint && deno task check && deno task test` all pass
- [x] "Add Edge" button appears in canvas toolbar; toggles active state visually
- [x] Clicking a node in `add-edge` mode highlights it as source; ghost dashed line follows mouse
- [x] Clicking a second node creates an edge; canvas updates immediately
- [x] Background click in add-edge mode returns to select and deselects
- [x] Background click in select mode deselects (no accidental deselect on pan)
- [x] Pressing Escape returns to select mode and deselects
- [x] Self-edge (clicking source node again) cancels source selection
- [x] Normal drag-to-move and pan still work in `select` mode
- [x] Node double-click to expand/collapse still works in `select` mode
- [x] Arc bundles (bidirectional + parallel) curve correctly with distinct boundary exit points
- [x] Arrowheads align with arc tangent at destination
- [x] Labels sit on arc visual midpoint
- [x] Expanded-group nodes clip arcs correctly at rect boundary
- [x] Edge label populates correctly in inspector when clicking an edge with a label
