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

## Deferred / Future Work

- [ ] **Multi-word node labels** — `New Node` can't be a bare symbol in Clojure. Options: kebab-case convention (`new-node`), quoted strings (`"New Node"`), or auto-slugging on serialise with a display label stored separately. Need to decide on UX and update `graphToSpike`/`spikeToGraph` accordingly.

- [ ] **Syntax highlighting** — investigate available packages (e.g. CodeMirror 6, Monaco, or a lightweight tokeniser-only lib like `highlight.js` or `Prism`). Want something that can run in the browser without a heavy build step and ideally understands Clojure/EDN syntax.

- [ ] **Edge representation** — edges are currently emitted as `;` line comments. Need an idiomatic Clojure approach: `defn` argument lists and `let` bindings are the natural forms; map out exactly how dataflow edges translate to call-graph notation (see `docs/spike-clojure.md` §Callable nodes).

- [ ] **Bidirectional ID tracking** — symbols currently correspond to labels, not graph IDs (e.g. `spike://acme/backend`). Options to explore:
  - Convention: IDs are created / assigned when "mirroring to canvas" for the first time (author without IDs, IDs materialise on mirror).
  - Metadata annotations: `^{:id "spike://acme/backend"}` on the symbol (EDN reader metadata).
  - Decide what happens to existing IDs when the user renames a symbol in the code view.

- [ ] **Data block expansion** — nodes have an opaque `data: Record<string, unknown>` field; the code view should be able to represent and round-trip this (possibly as a trailing map literal in the `def` form).

- [ ] **Schema-based data block UI** — once the constraint/schema system can describe `data` fields, the inspector should render a typed form rather than raw JSON. Depends on the constraint plugin protocol.

- [ ] **Graph overlays** — allow the same entity to be defined multiple times across separate overlay documents, with features unioned at load time (inspired by inductive datatypes). Primary use case: attaching IDs and metadata to code-view symbols in a separate overlay, keeping main `def` forms clean and human-readable. Needs design work on the overlay merge semantics and how overlays are addressed (URI? local file?).

- [ ] **Rename "AI interface" → "Code Interface" in DESIGN.md** — the MCP/Spike-Lisp API is a general programmatic interface useful for tooling, scripting, and AI agents alike; the current name over-constrains how people think about it.

## Open Questions

- Should `spikeToGraph` generate stable IDs (e.g. symbol name → id) or random UUIDs? Symbol name as ID is cleaner for round-trip stability. ← go with symbol name.
- Code view: full overlay, or side-by-side split? Start with toggle (full overlay) — split can come later.

## Verification

- [ ] `NO_COLOR=1 deno task ci` passes (format, lint, type-check, tests)
- [ ] Touch pinch gesture zooms the canvas on a touch device / DevTools touch emulation
- [ ] "Fit" button centers and scales the graph
- [ ] Code view toggle switches between SVG canvas and Spike-Clojure text
- [ ] `graphToSpike` round-trips through `spikeToGraph` for the default workspace nodes (manual check or unit test)
