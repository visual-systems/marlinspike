# Focus Experiments

**Branch:** lyndon/focus-experiments
**Date:** 2026-03-15

## Context

The canvas currently shows all nodes from the root of the rose-tree, with inline expand/collapse to enter composite nodes. DESIGN.md §6.2 describes a model where the canvas represents "being inside" a focused subgraph — the focus node is never shown as a box; its children are the top-level items. This branch experiments with that focus model, allowing users to set a "focus" context that scopes all views (canvas + tree panels) to a subtree.

Double-click to drill down was rejected as too accident-prone. Instead, a dedicated **focus dropdown** (in the WorkspaceControls bar) is the primary navigation control.

## Goal

- Add a `focusId` state: which node's children are the "root" of all views
- A focus dropdown that shows ancestors above and the path-to-selection below, for both up and down navigation
- Canvas and tree panels show only the focused subtree; the focus node itself is never rendered as a container
- Inline expand/collapse still works within the focused subtree

## Approach

- [x] **1. State** — Add `focusId: string | null` to `WorkspaceState` in `workspace.ts`
  - Default: `null` (root level — no change from current behavior)
  - Persist in localStorage (add to `loadState` and `defaultState`)
  - No new helpers needed; existing `findNode`, `findPath`, `findParentOf` are sufficient

- [x] **2. Focus dropdown component** — New `FocusDropdown` in `client.tsx`, placed in `WorkspaceControls` next to the workflow dropdown
  - **Selected value label**: label of focused node, or "(root)" if null
  - **Ancestors group** (above divider): path from root to focus, excluding focus — clicking sets `focusId` to that node's ID (or null for root sentinel)
  - **Current focus row** (between dividers): focused node label, dimmed/non-interactive, prefixed with `▶`
  - **Path-to-selection group** (below divider): composite nodes on the path from focus down to the selected canvas node — clicking sets `focusId` to that node's ID; omitted entirely if nothing is selected or the selected node is a direct child with no intermediate composites
  - Use existing dropdown styling patterns; custom grouped render (not the existing `Dropdown` component)

### Dropdown

Story: focus = `auth-service`, selected node = `token-validator`

```
WorkspaceControls: [ Workflow ▾ ] [ auth-service ▾ ] [ + Tree View ] …

Dropdown open:
┌───────────────────────────────┐
│  (root)          ← ancestor  │  → sets focusId = null
│  acme/backend    ← ancestor  │  → sets focusId = "spike://acme/backend"
│ ─────────────────────────── │
│ ▶ auth-service   ← focus    │  (non-interactive, current level)
│ ─────────────────────────── │
│    token-validator ← in sel │  → sets focusId = "spike://…/token-validator"
│                              │    (only shown if token-validator is composite)
└───────────────────────────────┘
```

- [x] **3. Canvas — scope to focus subtree** — In `Canvas` (`canvas.tsx`):
  - Compute `focusedRootNodes`: `focusId == null ? ws.treeNodes : findNode(ws.treeNodes, focusId)?.children ?? []`
  - Replace `ws.treeNodes` with `focusedRootNodes` in `syncLayout`, `renderLevel`, and `CanvasTopBar`'s `findPath` call
  - Filter `ws.edges` to only those where both endpoints are descendants of the focused subtree (use `collectSubtreeIds`)
  - `canvasExpandedNodes` still works as-is for inline expansion

- [x] **4. Tree panel — scope to focus subtree** — In `TreePanel` (`tree-panel.tsx`):
  - Same `focusedRootNodes` derivation; replace `ws.treeNodes` on the render (line ~120) and in `expandAll` (line ~61)

- [x] **5. Clean up stale expanded nodes on focus change** — When setting `focusId`, filter `canvasExpandedNodes` to only IDs within the new focus subtree

## Open Questions

- Should the focus dropdown also appear in tree panel headers? Probably out of scope for initial experiment — workspace-level focus in the controls bar is sufficient.

## Verification

- [x] With no focus set: canvas and tree panels behave identically to before
- [x] Set focus to "auth-service": canvas shows token-validator and ingress as root nodes; auth-service box is absent; tree panel root is token-validator + ingress
- [x] Focus dropdown shows correct ancestors above and path-to-selection below when a node is selected
- [x] Clicking an ancestor in dropdown navigates up correctly
- [x] Clicking a node in the "path to selection" section drills down to that node
- [x] Inline expand/collapse still works within focused subtree
- [x] Edges outside the focus subtree are not rendered
- [x] `NO_COLOR=1 deno task check` passes
- [x] `NO_COLOR=1 deno task test` passes (26/26)
