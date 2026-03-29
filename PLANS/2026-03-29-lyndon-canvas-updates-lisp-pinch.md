# Canvas Updates Lisp Pinch

**Branch:** lyndon/canvas-updates-lisp-pinch
**Date:** 2026-03-29

## Context

Three complementary additions:
1. **Pinch-to-zoom** — touch gesture support is missing; canvas only handles `WheelEvent` today.
2. **Fit-to-screen** — no way to recenter/fit the graph after exploring.
3. **Code view** — a Spike-Clojure text panel alongside (or toggling with) the canvas, wired to a new bidirectional semantic layer.

The lisp semantic layer goes in a new `src/code/` directory, parallel to `src/ui/` and `src/graph/`, keeping serialisation concerns separate from UI.

## Goal

- Touch (pinch-to-zoom) works on the canvas.
- A "Fit" button centers and scales all nodes to fill the viewport.
- A code-view toggle on the canvas shows the focused subgraph as Spike-Clojure text (read-only for now).
- `src/code/spike-clojure.ts` provides `graphToSpike` and `spikeToGraph` — lightweight but correct scaffolding for the round-trip.

## Approach

- [ ] **1. Create `src/code/spike-clojure.ts`**
  - `graphToSpike(nodes: TreeNode[], edges: Edge[]): string` — serialise to Spike-Clojure `def` forms
  - `spikeToGraph(src: string): { treeNodes: TreeNode[], edges: Edge[] }` — parse using `base_lisp.parse()`, map `def`/`defn` forms to nodes, vectors to children
  - Keep it to `def` and leaf/composite only for now (the minimal scaffold)
  - Export from `src/code/` index or directly from the file

- [ ] **2. Add `canvasView` toggle to `WorkspaceState` in `src/ui/workspace.ts`**
  - `canvasView: "graph" | "code"` — switches canvas between visual and Spike-Clojure text view
  - Persist in `loadState`/`saveState` (default: `"graph"`)

- [ ] **3. Canvas — code view panel (`src/ui/components/canvas.tsx`)**
  - In the Canvas toolbar, add a "Code" toggle button (alongside existing mode/layout controls)
  - When `canvasView === "code"`: render a `<pre>` overlay with `graphToSpike(focusedRootNodes, focusedEdges)` instead of the SVG
  - Keep it read-only; the text updates live as workspace state changes
  - Wire the toggle to `update((s) => ({ ...s, canvasView: … }))`

- [ ] **4. Canvas — fit-to-screen button (`src/ui/components/canvas.tsx`)**
  - Compute bounding box of all positions in the current `layout` map using existing `boundingBox()` from `src/ui/lib/force.ts`
  - Scale + translate so the bbox fills ~80% of the SVG's client rect
  - Add a small "⊡" or "Fit" `SmallBtn` in the toolbar, calling `fitView()`

- [ ] **5. Canvas — pinch-to-zoom (`src/ui/components/canvas.tsx`)**
  - Add `touchstart` / `touchmove` / `touchend` listeners on `containerRef` (non-passive)
  - Track two-touch pinch: store initial distance and `view` snapshot on `touchstart`
  - On `touchmove` with 2 touches: compute new scale relative to initial, pivot around midpoint; also handle single-touch pan
  - Reuse same `setView` state as wheel zoom

- [ ] **6. Add a story for the code view (`src/ui/stories/canvas.stories.tsx`)**
  - `CodeView` story — renders a canvas in `"code"` view so behaviour is visible in the storybook

## Critical Files

| File | Change |
|---|---|
| `src/code/spike-clojure.ts` | New — semantic layer (graphToSpike / spikeToGraph) |
| `src/graph/base_lisp.ts` | Read-only dependency — `parse()` used by spikeToGraph |
| `src/ui/workspace.ts` | Add `canvasView` field to `WorkspaceState`, `defaultState`, `loadState` |
| `src/ui/components/canvas.tsx` | Pinch-to-zoom, fit-to-screen, code-view toggle + panel |
| `src/ui/stories/canvas.stories.tsx` | Add `CodeView` story |

## Open Questions

- Should `spikeToGraph` generate stable IDs (e.g. symbol name → id) or random UUIDs? Symbol name as ID is cleaner for round-trip stability. ← go with symbol name.
- Code view: full overlay, or side-by-side split? Start with toggle (full overlay) — split can come later.

## Verification

- [ ] `NO_COLOR=1 deno task ci` passes (format, lint, type-check, tests)
- [ ] Touch pinch gesture zooms the canvas on a touch device / DevTools touch emulation
- [ ] "Fit" button centers and scales the graph
- [ ] Code view toggle switches between SVG canvas and Spike-Clojure text
- [ ] `graphToSpike` round-trips through `spikeToGraph` for the default workspace nodes (manual check or unit test)
