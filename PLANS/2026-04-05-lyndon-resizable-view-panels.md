# Resizable view panels

**Branch:** lyndon/resizable-view-panels
**Date:** 2026-04-05

## Context

View panels (tree, code, constraints) have fixed pixel widths (300px, 600px, 300px). Users can't adjust panel widths to suit their workflow — e.g. widening the code panel when editing, or narrowing the tree when focused on the canvas.

## Goal

Add drag handles on the right edge of each panel so users can resize them horizontally. Persist widths across tab switches.

## Approach

### 1. Add `width` to Panel interface and width constants

**File:** `src/ui/workspace.ts`

- [x] Add optional `width?: number` to `Panel` interface (backward compatible — omitted means default)
- [x] Add `PANEL_DEFAULT_WIDTH` and `PANEL_MIN_WIDTH` constant maps keyed by `PanelType`
  - tree: 300px default, 200px min
  - constraints: 300px default, 200px min
  - code: 600px default, 300px min

### 2. Use dynamic widths in panel components

**Files:** `src/ui/components/tree-panel.tsx`, `code-panel.tsx`, `constraints-panel.tsx`

- [x] Replace hardcoded `width:XXXpx; min-width:YYYpx` with values from `panel.width ?? PANEL_DEFAULT_WIDTH[panel.type]`
- [x] Remove `border-right:1px solid #2a2a4a` from each panel root div (the resize handle replaces it)
- [x] Import constants from `workspace.ts`

### 3. Add resize handle in panel rendering loop

**File:** `src/ui/client.tsx`

- [x] After each panel component, render a 5px-wide drag handle div with `cursor:col-resize`
- [x] Handle contains a 1px visible line (matching existing `#2a2a4a` border color)
- [x] `onMouseDown`: capture startX and startWidth, add document-level mousemove/mouseup listeners
- [x] `mousemove`: compute new width, clamp to min-width, set directly on panel DOM element
- [x] `mouseup`: persist final width via `update` + `withPanel`, restore cursor
- [x] Set `document.body.style.cursor = "col-resize"` during drag for consistent cursor

### Reference pattern

The existing vertical splitter in `tree-panel.tsx` lines 70-94 uses the exact same mousedown/mousemove/mouseup approach — just for vertical resizing with `clientY`. The horizontal version follows the same structure with `clientX`.

### Files modified
- `src/ui/workspace.ts` — Panel interface + constants
- `src/ui/client.tsx` — Resize handle rendering + drag logic
- `src/ui/components/tree-panel.tsx` — Dynamic width, remove border-right
- `src/ui/components/code-panel.tsx` — Dynamic width, remove border-right
- `src/ui/components/constraints-panel.tsx` — Dynamic width, remove border-right

## Open Questions

- Should there be a max-width? Lean: no, let the user decide.
- Double-click to reset to default width? Nice-to-have, skip for now.

## Verification

- [x] Each panel type can be dragged wider and narrower
- [x] Panels respect min-width (can't drag smaller than 200px/300px)
- [x] Resize cursor shows during drag even when mouse leaves the handle
- [ ] Width persists when switching tabs and back
- [x] Panels without explicit width use type defaults (backward compat)
- [x] `NO_COLOR=1 deno task ci` passes
