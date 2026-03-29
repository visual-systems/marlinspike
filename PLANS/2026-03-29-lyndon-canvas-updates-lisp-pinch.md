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

- [ ] **Syntax highlighting** — see research below.

- [ ] **Edge representation** — edges are currently emitted as `;` line comments. Need an idiomatic Clojure approach: `defn` argument lists and `let` bindings are the natural forms; map out exactly how dataflow edges translate to call-graph notation (see `docs/spike-clojure.md` §Callable nodes).

- [ ] **Bidirectional ID tracking** — symbols currently correspond to labels, not graph IDs (e.g. `spike://acme/backend`). Options to explore:
  - Convention: IDs are created / assigned when "mirroring to canvas" for the first time (author without IDs, IDs materialise on mirror).
  - Metadata annotations: `^{:id "spike://acme/backend"}` on the symbol (EDN reader metadata).
  - Decide what happens to existing IDs when the user renames a symbol in the code view.

- [ ] **Data block expansion** — nodes have an opaque `data: Record<string, unknown>` field; the code view should be able to represent and round-trip this (possibly as a trailing map literal in the `def` form).

- [ ] **Schema-based data block UI** — once the constraint/schema system can describe `data` fields, the inspector should render a typed form rather than raw JSON. Depends on the constraint plugin protocol.

- [ ] **Graph overlays** — allow the same entity to be defined multiple times across separate overlay documents, with features unioned at load time (inspired by inductive datatypes). Primary use case: attaching IDs and metadata to code-view symbols in a separate overlay, keeping main `def` forms clean and human-readable. Needs design work on the overlay merge semantics and how overlays are addressed (URI? local file?).

- [ ] **Rename "AI interface" → "Code Interface" in DESIGN.md** — the MCP/Spike-Lisp API is a general programmatic interface useful for tooling, scripting, and AI agents alike; the current name over-constrains how people think about it.

## Syntax Highlighting Research

The core challenge: `@deno/emit` can bundle HTTPS ESM URLs (e.g. `esm.sh`) but **cannot** handle `npm:` specifiers. CodeMirror 6 was already tried and failed because its full package set doesn't survive the bundler.

### The overlay / backdrop technique

All of the library options below target `<pre><code>` blocks, not editable `<textarea>` elements. To get a highlighted editor you need the *overlay trick*: a `<div>` is positioned directly behind a transparent `<textarea>`, the text is tokenised into `<span>` elements inside the div, and scroll position is mirrored via a `scroll` event listener. Known pitfalls:

- Scroll drift — both `scrollTop` and `scrollLeft` must be synced on every `input` and `scroll` event.
- Final-newline gap — `<pre>` collapses a trailing empty line; must append a dummy `\u00A0` to avoid cursor drift.
- Firefox adds padding inside textareas that doesn't exist in the backdrop.
- iOS adds 3 px of non-removable left/right padding.

Refs: [CSS-Tricks](https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/), [DEV overlay article](https://dev.to/helgesverre/syntax-highlighting-a-plain-textarea-with-a-transparent-overlay-1fck), [Coder's Block deep-dive](https://codersblock.com/blog/highlight-text-inside-a-textarea/)

---

### Option A — DIY tokeniser + overlay (recommended)

We already wrote a complete Spike-Clojure `StreamParser` (line comments, strings, keywords, brackets, numbers, special forms) while attempting the CodeMirror integration. Adapting it to emit `<span class="tok-keyword">…</span>` HTML rather than CodeMirror tokens is straightforward. Pair with the overlay technique above.

- **Bundle impact:** zero — no new dependency.
- **Clojure support:** exact, hand-tuned for Spike-Clojure's actual token set.
- **`@deno/emit` compatibility:** N/A — pure TS.
- **Downside:** we own the tokeniser; edge cases (multiline strings, nested maps) need manual handling.

---

### Option B — highlight.js via `esm.sh`

highlight.js v11 ships a CJS build; `esm.sh` converts it to ESM automatically. Has a built-in Clojure grammar. Core + Clojure grammar ≈ 30–40 kB gzipped.

```ts
import hljs from "https://esm.sh/highlight.js/lib/core";
import clojure from "https://esm.sh/highlight.js/lib/languages/clojure";
hljs.registerLanguage("clojure", clojure);
const result = hljs.highlight(code, { language: "clojure" });
// result.value is the HTML string with <span class="hljs-*"> tags
```

- **`@deno/emit` compatibility:** likely — esm.sh can convert CJS highlight.js, but not yet validated in this project's bundler. Worth a quick spike.
- **Downside:** Clojure ≠ Spike-Clojure; the grammar won't know about Spike-specific forms. Still good enough for basic colouring.
- **Overlay still needed** for the textarea editor.

Ref: [highlightjs.org](https://highlightjs.org/), [SUPPORTED_LANGUAGES](https://github.com/highlightjs/highlight.js/blob/main/SUPPORTED_LANGUAGES.md)

---

### Option C — lezer-clojure (standalone, no full CodeMirror)

`lezer-clojure` is the Lezer grammar used internally by CodeMirror's Clojure mode. It can be used with just `@lezer/common` and `@lezer/highlight` — no `EditorView` or `EditorState` needed.

```ts
import { parser } from "https://esm.sh/lezer-clojure";
import { highlightCode, classHighlighter } from "https://esm.sh/@lezer/highlight";
```

Walk the parse tree, emit spans. ~60–80 kB gzipped total for the three packages.

- **`@deno/emit` compatibility:** uncertain — `lezer-clojure` hasn't been published recently (last release ~3 years ago) and its esm.sh bundle needs testing.
- **Clojure support:** high quality (the same parser CodeMirror uses).
- **Overlay still needed.**

Ref: [lezer-clojure npm](https://www.npmjs.com/package/lezer-clojure), [Better Clojure highlighting post](https://blog.michielborkent.nl/better-clojure-highlighting.html)

---

### Option D — starry-night (`@wooorm/starry-night`)

Pure ESM, uses TextMate grammars, ships a WASM binary. GitHub-quality output. Total for core + WASM ≈ 185 kB gzipped; adding the common language set (35 languages incl. Clojure) adds ~250 kB more.

- **`@deno/emit` compatibility:** probably works via esm.sh (pure ESM), but the WASM binary fetch is a runtime concern.
- **Size:** heaviest of the options listed here.
- **Overlay still needed.**

Ref: [wooorm/starry-night](https://github.com/wooorm/starry-night)

---

### Recommendation

**Start with Option A (DIY).** The tokeniser is already written; adapting it to emit HTML spans and wiring the overlay is ~50 lines of code with no bundler risk. If richer highlighting (rainbow parens, semantic tokens) becomes desirable later, Option C (lezer-clojure) is the natural upgrade path.

## Open Questions

- Should `spikeToGraph` generate stable IDs (e.g. symbol name → id) or random UUIDs? Symbol name as ID is cleaner for round-trip stability. ← go with symbol name.
- Code view: full overlay, or side-by-side split? Start with toggle (full overlay) — split can come later.

## Verification

- [ ] `NO_COLOR=1 deno task ci` passes (format, lint, type-check, tests)
- [ ] Touch pinch gesture zooms the canvas on a touch device / DevTools touch emulation
- [ ] "Fit" button centers and scales the graph
- [ ] Code view toggle switches between SVG canvas and Spike-Clojure text
- [ ] `graphToSpike` round-trips through `spikeToGraph` for the default workspace nodes (manual check or unit test)
