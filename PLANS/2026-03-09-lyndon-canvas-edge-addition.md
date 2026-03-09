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
- Clicking the canvas background or pressing Escape cancels
- The new edge is immediately visible and selectable

## Approach

All changes are confined to `src/ui/components/canvas.tsx`. No workspace.ts changes needed — `edges: Edge[]` already exists in `WorkspaceState`.

### Mode system

Introduce an extensible canvas mode type in `canvas.tsx`:

```typescript
type CanvasMode = "select" | "add-edge";
```

Replace any boolean mode flags with `const [mode, setMode] = useState<CanvasMode>("select")`.
This is forward-compatible: future modes (e.g. `"add-node"`, `"delete"`) just extend the union.

### Checklist

- [ ] Add `CanvasMode = "select" | "add-edge"` type
- [ ] Add `mode` state (`useState<CanvasMode>("select")`) to `Canvas`
- [ ] Add `edgeDraw: { fromId: string; x: number; y: number } | null` state — set when source node is picked in `add-edge` mode
- [ ] Add `mouseCanvas: { x: number; y: number } | null` state for ghost line — updated via `onMouseMove` on `<svg>`
- [ ] Add "Add Edge" toggle button to `CanvasTopBar` (pass `mode` + `onSetMode` as props); highlight button when `mode === "add-edge"`
- [ ] Wire Escape key (`onKeyDown` on container div, `tabIndex={0}`) to reset `mode` to `"select"` and clear `edgeDraw`
- [ ] Clicking the SVG background while in `add-edge` mode clears `edgeDraw` (but stays in `add-edge` mode, consistent with other drawing tools)
- [ ] In `renderLevel`, add `mode: CanvasMode`, `edgeDrawFromId: string | null`, and `onEdgeNodeClick: (id: string, wx: number, wy: number) => void` params
- [ ] In node `onMouseDown` handlers: when `mode === "add-edge"`, call `onEdgeNodeClick(node.id, pos.x, pos.y)` and `e.stopPropagation()` instead of `startDrag`
- [ ] In `Canvas`, implement `onEdgeNodeClick`:
  - If `edgeDraw` is null: set `edgeDraw = { fromId: id, x, y }`
  - If `edgeDraw` is set and `id !== edgeDraw.fromId`: call `addEdge(edgeDraw.fromId, id)`, clear `edgeDraw`
  - If `id === edgeDraw.fromId` (self-click): clear `edgeDraw` (cancel source selection)
- [ ] `addEdge` helper: `update(s => ({ ...s, edges: [...s.edges, { id: crypto.randomUUID(), fromId, toId, label: "", data: {}, version: 1 }] }))`
- [ ] Render ghost line when `mode === "add-edge" && edgeDraw && mouseCanvas`: dashed `<line>` from source to mouse, stroke `#5070c0`, strokeDasharray `"6 4"`, pointer-events none — rendered inside the world `<g>` transform
- [ ] Pass `edgeDrawFromId` into `renderLevel`; highlight matched node's circle stroke as `#5070c0` regardless of selection state
- [ ] Add a `Canvas/EdgeAddition` story (nodes, no edges, for manual interactive testing)

### Mouse tracking

Add `onMouseMove` handler to `<svg>`:
```typescript
const rect = svgRef.current!.getBoundingClientRect();
const wx = (e.clientX - rect.left - view.tx) / view.scale;
const wy = (e.clientY - rect.top - view.ty) / view.scale;
setMouseCanvas({ x: wx, y: wy });
```

### World position note

`pos.x, pos.y` from `renderLevel` are in the level's local coordinate space. For root-level nodes this equals world coords. For nested expanded groups the position is offset by the parent group's transform — for MVP the ghost line originates from the node's local-space coords (acceptable approximation; exact accumulation is a future improvement).

## Open Questions

None.

## Verification

- [ ] `NO_COLOR=1 deno task fmt && deno task lint && deno task check && deno task test` all pass
- [ ] "Add Edge" button appears in canvas toolbar; toggles active state visually
- [ ] Clicking a node in `add-edge` mode highlights it as source; ghost dashed line follows mouse
- [ ] Clicking a second node creates an edge; canvas updates immediately
- [ ] Clicking background cancels draw state (clears source, stays in add-edge mode)
- [ ] Pressing Escape returns to select mode
- [ ] Self-edge (clicking source node again) cancels source selection
- [ ] Normal drag-to-move and pan still work in `select` mode
- [ ] Node double-click to expand/collapse still works in `select` mode
