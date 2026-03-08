# Initial UI Elements

**Branch:** lyndon/initial-ui-elements
**Date:** 2026-03-08

## Context
The SSR shell (`src/ui/App.tsx`) served a blank dark page. This branch adds the first interactive UI layer: workspace tabs, a tiling panel system, a tree view panel, and a node/edge inspector — all using vanilla TypeScript DOM (no client framework) to stay bundler-free.

Client TypeScript is served by a Hono route that bundles the source files on-request using `@deno/emit` (JSR). This avoids a separate build step while keeping the code in typed TypeScript.

## Goal
Add workspace tabs, a tiling panel layout, a tree view panel, and an inspector. State persisted in `localStorage`. No separate build step, no client framework.

## Approach

### Foundation
- [x] Add `"@deno/emit": "jsr:@deno/emit"` to `deno.json` imports
- [x] Add `--allow-read --allow-env` to dev/start/smoke tasks (required by `@deno/emit`)
- [x] Update check task to explicitly list server-side files (excludes client files which use DOM lib)
- [x] Add `GET /client.js` route in `mod.ts` — switched from `transpile` to `bundle` to support multi-file client imports
- [x] Replace blank canvas in `src/ui/App.tsx` with IDE shell: `#workspace-bar` + `#workspace-controls` + `#workspace-area` + script tag

### Client UI (`src/ui/client.ts` + `src/ui/components/`)
- [x] Workspace tab bar: activate, add, close, click-to-rename active tab
- [x] Workspace controls bar below tabs: "+ Tree View" button, workflow dropdown
- [x] Tree view panel with expand/collapse per-node, collapse-all/expand-all controls, closeable
- [x] Hardcoded sample graph (acme/backend → auth-service → [token-validator, ingress], frontend)
- [x] Node hover actions: rename (✎), add subnode (+), copy URI (⎘), delete (×)
- [x] Inspector drawer — docked at bottom of tree panel, 50/50 split with draggable divider
  - Hidden until a node or edge is selected; closeable with ×
  - Node inspector: editable label, actions row (+ Subnode, Copy URI, Copy Graph, Delete) near title, version + hash, parent/children nav links, ID, URI, Edges In/Out, editable data JSON
  - Edge inspector: from → to nav links (clicking inspects that node), label input, data JSON, save/delete
  - Selecting an edge replaces the inspector view (does not nest inside node inspector)
- [x] Persona dropdown (workspace bar left) and workflow dropdown (controls bar left) — flat custom dropdowns, constant `DROPDOWN_WIDTH = 140px` so first tab and first "+ Tree View" align
- [x] Connected graphs checklist button (controls bar right) — "N graphs ▾" opens flat checklist; `localStorage` entry required/non-deselectable
- [x] Edges: `Edge` type with `fromId`, `toId`, `label`, `data`, `version`; multiple edges allowed between same nodes
  - Edges In / Edges Out sections in node inspector — clicking an edge row navigates to edge inspector
  - Sibling picker uses flat dropdown; selecting immediately creates the edge (no separate + button)
- [x] Tree view highlights (not selects) both nodes connected by the selected edge
- [x] `localStorage` state persistence with migration on load

### Component library (`src/ui/components/`)
- [x] Split client helpers into `src/ui/components/` — `.ts` not `.tsx` (no JSX; these are functions returning `HTMLElement`)
  - `dom.ts` — `el()` helper, `Attrs` type
  - `widgets.ts` — `iconBtn()`, `smallBtn()`, `propLabel()`
  - `dropdown.ts` — `renderDropdown()`, `DropdownItem`, `DROPDOWN_WIDTH`; supports `"fill"` width mode
  - `index.ts` — re-exports all

## Architecture decisions
- **No client framework** — vanilla TypeScript DOM manipulation
- **`@deno/emit` bundle** — `GET /client.js` bundles `src/ui/client.ts` + imports on-request; no separate build step
- **Component library in `.ts`** — client components are functions returning `HTMLElement`, not JSX; `.tsx` would be misleading
- **Panel-local selection** — each tree panel tracks its own `selectedNodeId`, `selectedEdgeId`, `expandedNodes`, `inspectorSplit`
- **Inspector dispatch** — `renderInspector(panel)` shows edge inspector when `selectedEdgeId` is set, otherwise node inspector; edge inspector × returns to node view without closing inspector
- **State in localStorage** — JSON-serialised; migrations applied on load

## Open Questions

## Verification
- [x] `NO_COLOR=1 deno task check` — no type errors (excludes client-side files)
- [x] `NO_COLOR=1 deno task lint` — clean
- [x] `NO_COLOR=1 deno task fmt` — clean
- [x] `NO_COLOR=1 deno task smoke` — starts and shuts down cleanly
- [x] `curl http://localhost:8000/client.js` — returns bundled JavaScript (includes components)
- [x] Opening `http://localhost:8000` in a browser shows workspace tab bar + tree view panel with expandable nodes
