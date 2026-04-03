# code-canvas synchronisation

**Branch:** lyndon/code-canvas-synchronisation
**Date:** 2026-04-03

## Context

The code panel and canvas are currently loosely coupled:
- Code panel → canvas only fires on explicit Cmd+Enter, with no indication of current validity
- Canvas selection does not scroll/highlight the code panel
- Code panel does not track the canvas selection

The goal is: cross-highlighting between selections, live validity feedback so the user knows when it's safe to apply, a clear GUI affordance for applying, and a modular structural-editing mode system (paredit as the first mode, extensible to vim etc. later).

## Goal

1. **Live validity status** — as you type, show whether the current text is syntactically valid and/or already applied to the canvas
2. **Explicit apply** — keep Cmd+Enter; add a GUI circle/check button for applying; auto-format to canonical form on apply
3. **Cross-highlighting** — canvas node/edge selection scrolls+highlights the code panel; code cursor highlights node on canvas
4. **Modular editing mode system** — paredit as the first mode; extensible to vim mode etc. later
5. **File split** — logically split code-panel into focused modules

## Approach

### Phase A — Validity status + apply UI

- [x] **A1 — Live validity indicator**: Track tri-state `"valid-applied"` / `"valid-unapplied"` / `"invalid"` from `spikeToGraph` errors (debounced ~150ms). Display coloured status dot in title bar. Reuse `errors` from `spikeToGraph` — same logic as the "stable/mismatch" badge in `code-panel.stories.tsx`.
- [x] **A2 — GUI apply button**: `IconBtn` in title bar (circle/✓ icon). Style reflects validity state: enabled+green when valid-unapplied, grey when valid-applied, disabled when invalid.
- [x] **A3 — Canonical format on apply**: After successful parse, set textarea to `graphToSpike(newNodes, newEdges)`. Also auto-format entity/JSON panels on apply (`JSON.stringify` 2-space indent). Keep Cmd+Enter as keyboard shortcut.

### Phase B — Cross-highlighting

- [x] **B1 — Canvas → code highlight**: `useEffect` on `ws.canvasSelected`. Node selection → regex-search for label in text (prefer `def`/`defn` occurrence), set `textarea.selectionStart/End`, scroll. Set `suppressCanvasSync` ref during programmatic selection.
- [x] **B2 — Code → canvas highlight**: On `mouseup`/`keyup`, get cursor pos, find identifier token via tokeniser, match to node label in `ws.treeNodes`, update `canvasSelected`. Skip when `suppressCanvasSync` is set.

### Phase C — Modular editing mode system

- [x] **C1 — Mode interface** (`src/ui/lib/editor-modes/types.ts`): `EditorMode` with `name: string` and `keyDown(e, ctx): boolean` (true = consumed). `EditorContext` with textarea ref, text, cursor pos, `applyText(newText, newCursor)`.
- [x] **C2 — S-expression utilities** (`src/ui/lib/sexp.ts`): `findFormAt(text, pos)`, `findNextSibling(text, pos)`, `findEnclosingForm(text, pos)` — all returning `{start, end}` char offsets. Unit tests.
- [x] **C3 — Paredit mode** (`src/ui/lib/editor-modes/paredit.ts`): Implements `EditorMode`. Handles:
  - Auto-close `(` → `()`
  - Auto-indent on Enter (newline + enclosing-form column + standard offset)
  - `Ctrl+Shift+Right` — forward slurp
  - `Ctrl+Shift+Left` — forward barf
  - `Ctrl+K` — kill to end of current form
  - `Ctrl+D` — kill current expression
  - `Ctrl+Right` / `Ctrl+Left` — navigate by expression boundary
- [x] **C4 — Mode selector in code panel**: Mode indicator chip in title bar. Default: `"paredit"`. Active mode's `keyDown` delegates from `handleKeyDown`. Structure supports future `"vim"`, `"default"` modes.

### New files

- `src/ui/lib/sexp.ts`
- `src/ui/lib/editor-modes/types.ts`
- `src/ui/lib/editor-modes/paredit.ts`

### Modified files

- `src/ui/components/code-panel.tsx` — main changes (A1–A3, B1–B2, C4)
- `src/ui/stories/code-panel.stories.tsx` — add validity + sync stories

### Phase D — Bug fixes & polish (discovered during implementation)

- [x] **D1 — Canvas not re-rendering after code apply**: Hono JSX DOM does not re-render children when parent props change. Added `ws-updated` event + `useState` nudge in Canvas. Also fixed stale `focusId` / `canvasExpandedNodes` persisted in localStorage crashing Canvas on load and after apply.
- [x] **D2 — Gesture listener leak**: Document-level mousemove/mouseup were re-registered per render, causing stale closures. Replaced with stable `useRef`-based delegation registered once in `useEffect`.
- [x] **D3 — Remove redundant mirror button**: The "mirror on canvas" button duplicated the apply button's function. Removed from code-panel title bar.
- [x] **D4 — Rebind paredit shortcuts**: Original bindings (`Cmd+Shift+]`/`[`, `Alt+Arrow`) were intercepted by browser/OS. Rebound to `Ctrl+Shift+Arrow` (slurp/barf) and `Ctrl+Arrow` (navigate).
- [x] **D5 — Keybinding tooltip on mode chip**: Added `keybindings` property to `EditorMode` interface. Mode chip tooltip shows all shortcuts on hover.

## Open Questions

- Mode selector: dropdown vs. cycle chip? → Resolved: cycle chip
- Validity check: 150ms debounce so we don't parse every keystroke

## Verification

### Unit tests
- [x] `src/ui/lib/sexp_test.ts` — `findFormAt`, `findNextSibling`, `findEnclosingForm` covering edge cases (top-level, nested, cursor at boundary, empty text)
- [x] `src/ui/lib/editor-modes/paredit_test.ts` — slurp/barf/kill/navigate operations via `applyText` mock

### Stories (`src/ui/stories/code-panel.stories.tsx`)
- [x] `ValidityStates` — three instances showing invalid / valid-unapplied / valid-applied status dots
- [x] `CanonicalFormat` — shows before/after canonical normalisation on apply
- [x] `PareditOps` — interactive demo of slurp, barf, kill, navigate
- [x] `ModeSwitcher` — shows the mode chip cycling between modes

### End-to-end checks
- [x] Type invalid code → status dot red, apply button disabled
- [x] Type valid code differing from canvas → status dot amber, apply button enabled
- [x] Apply (button or Cmd+Enter) → code normalised to canonical form, status dot green
- [x] Click a node on canvas → code panel scrolls to and selects that node's label
- [x] Move cursor to a node name → that node highlighted on canvas
- [x] Type `(` → auto-closed as `()`
- [x] Enter inside a form → auto-indented to correct level
- [x] Ctrl+Shift+Right slurps next sibling into current form
- [x] Entity panel apply → auto-formats JSON with 2-space indent
- [x] `NO_COLOR=1 deno task ci` passes
