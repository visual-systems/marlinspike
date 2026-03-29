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

- [x] **1. Create `src/code/spike-clojure.ts`**
  - `graphToSpike` and `spikeToGraph` implemented; stable symbol-name IDs; edges as `;` comments.

- [x] **2. Canvas — pinch-to-zoom / two-finger pan**
  - Non-passive `touchstart`/`touchmove`/`touchend` listeners; single-touch pan, two-touch pinch+pan.
  - Wheel handler: `ctrlKey` → zoom at cursor; no `ctrlKey` → inverted two-finger pan.
  - Cursor hidden while panning, restored via debounced timer.

- [x] **3. Code View panel (`src/ui/components/code-panel.tsx`)**
  - Separate side-by-side panel (not a canvas overlay — that design was dropped).
  - DIY tokeniser + transparent-textarea overlay for Spike-Clojure syntax highlighting.
  - Editable; Cmd/Ctrl+Enter applies code to graph. Mirror-on-canvas button.
  - Syntax highlighting also applied to `Spike-Clojure Syntax Candidates` stories.

- [x] **4. Inspector data → JSON code panel**
  - `⊞` button in node/edge inspector opens a code panel pinned to the entity's `data` field.
  - Live bidirectional sync via `entityDrafts` in `WorkspaceState` — no save needed to see edits.
  - Title shows `Data: parent / child` path; language locked to JSON; Cmd+Enter saves.

- [ ] **5. Canvas — fit-to-screen button**
  - Not yet done. Compute bbox of current layout, scale + translate to fill ~80% of SVG viewport.

- [ ] **6. Story for Code View panel**
  - Not yet done. Add a story to show the code panel with sample workspace content.

## Critical Files

| File | Change |
|---|---|
| `src/code/spike-clojure.ts` | New — graphToSpike / spikeToGraph semantic layer |
| `src/ui/components/canvas.tsx` | Pinch-to-zoom, two-finger pan, cursor hiding; fit-to-screen pending |
| `src/ui/components/code-panel.tsx` | New — Spike-Clojure / JSON code editor panel |
| `src/ui/components/inspector.tsx` | ⊞ button opens JSON code panel; bidirectional draft sync |
| `src/ui/lib/spike-tokenise.ts` | New — shared tokeniser for Spike-Clojure and JSON highlighting |
| `src/ui/workspace.ts` | Added `entityDrafts`, `codeEntityId/Kind` to Panel, `PANEL_TYPES` updated |
| `src/ui/stories/candidate-spike-lisp-syntaxes.stories.tsx` | Code blocks use tokeniser for syntax highlighting |

## Deferred / Future Work

- [ ] **Multi-word node labels** — `New Node` can't be a bare symbol in Clojure. Options: kebab-case convention (`new-node`), quoted strings (`"New Node"`), or auto-slugging on serialise with a display label stored separately. Need to decide on UX and update `graphToSpike`/`spikeToGraph` accordingly.

- [x] **Syntax highlighting** — implemented as Option A (DIY tokeniser + overlay); see research below.

- [ ] **Edge representation** — edges are currently emitted as `;` line comments. Need an idiomatic Clojure approach: `defn` argument lists and `let` bindings are the natural forms; map out exactly how dataflow edges translate to call-graph notation (see `docs/spike-clojure.md` §Callable nodes).

- [ ] **Bidirectional ID tracking** — symbols currently correspond to labels, not graph IDs (e.g. `spike://acme/backend`). Options to explore:
  - Convention: IDs are created / assigned when "mirroring to canvas" for the first time (author without IDs, IDs materialise on mirror).
  - Metadata annotations: `^{:id "spike://acme/backend"}` on the symbol (EDN reader metadata).
  - Decide what happens to existing IDs when the user renames a symbol in the code view.

- [ ] **Data block expansion** — nodes have an opaque `data: Record<string, unknown>` field; the code view should be able to represent and round-trip this (possibly as a trailing map literal in the `def` form).

- [ ] **Schema-based data block UI** — once the constraint/schema system can describe `data` fields, the inspector should render a typed form rather than raw JSON. Depends on the constraint plugin protocol.

- [ ] **Graph overlays** — allow the same entity to be defined multiple times across separate overlay documents, with features unioned at load time (inspired by inductive datatypes). Primary use case: attaching IDs and metadata to code-view symbols in a separate overlay, keeping main `def` forms clean and human-readable. Needs design work on the overlay merge semantics and how overlays are addressed (URI? local file?).

- [x] **Rename "AI interface" → "Code Interface" in DESIGN.md** — done.

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

- [x] `NO_COLOR=1 deno task ci` passes (format, lint, type-check, tests)
- [x] Touch pinch gesture zooms the canvas on a touch device / DevTools touch emulation
- [x] Two-finger scroll pans the canvas; cursor hidden while panning
- [x] Code view panel opens from `+ Code View` button; Spike-Clojure syntax highlighting works
- [x] Inspector `⊞` button opens a JSON code panel synced bidirectionally with the data textarea
- [x] `graphToSpike` round-trips through `spikeToGraph` (manual verified)
- [ ] "Fit" button centers and scales the graph (not yet implemented)
- [ ] Code View panel story added to storybook
