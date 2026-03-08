# Eliminate JSX shims + extract UI components

**Branch:** lyndon/eliminate-jsx-shims
**Date:** 2026-03-08

## Context

After the JSX migration (`lyndon/jsx-and-storybook`), two thin shim files were introduced solely to allow JSX syntax in the Hono route handlers (`handler.tsx`, `stories-handler.tsx`). These are now eliminated by renaming `mod.ts` → `mod.tsx`.

Additionally, `client.tsx` (~1656 lines) contains all UI components inline. The higher-level components (`TreePanel`, `TreeNodeRow`, `Inspector`, `InspectorShell`, `NodeInspector`, `EdgeInspector`, `EdgesSection`, `EdgeRow`) should be split into reusable component files so they can be developed and reviewed in the story viewer independently.

## Goal

1. ~~Remove JSX shims; consolidate entry point in `mod.tsx`~~ ✅ Done
2. Extract tree and inspector components into their own files under `src/ui/components/`
3. Add stories for `TreePanel` (with real component) and `Inspector`

## Approach

### Part 1 — Shim elimination (done)
- [x] Rename `mod.ts` → `mod.tsx`, inline route lambdas, delete `handler.tsx` + `stories-handler.tsx`
- [x] Update `deno.json` references

### Part 2 — Shared types + utilities
- [x] Create `src/ui/workspace.ts` — extract shared types (`Panel`, `Tab`, `WorkspaceState`, `TreeNode`, `Edge`, `ConnectedGraph`, `Updater`, `ListEditorConfig`) and all utility functions (`findNode`, `findParentOf`, `findSiblings`, `getEdgesIn`, `getEdgesOut`, `collectSubtreeIds`, `withPanel`, `withNodeMutation`, `updateNodeInTree`, `removeNodeFromTree`, etc.) from `client.tsx`
- [x] Update `client.tsx` to import types and utils from `workspace.ts`

### Part 3 — Component extraction
- [x] Create `src/ui/components/tree-panel.tsx` — extract `TreePanel` (lines 766–892) and `TreeNodeRow` (lines 898–1109); import types/utils from `workspace.ts`, UI primitives from `index.ts`
- [x] Create `src/ui/components/inspector.tsx` — extract `Inspector`, `InspectorShell`, `NodeInspector`, `EdgeInspector`, `EdgesSection`, `EdgeRow` (lines 1115–1649); same imports
- [x] Update `src/ui/components/index.ts` to export `TreePanel` and the inspector components
- [x] Update `client.tsx` to import `TreePanel`, `Inspector` from `components/index.ts`

### Part 4 — Stories
- [x] Replace `src/ui/stories/tree-panel.stories.tsx` — use the real `TreePanel` component with a `useState`-based `WorkspaceState` wrapper; stories: `Default` (basic tree), `WithNodeSelected` (inspector open), `WithEdgeSelected` (edge inspector open)
- [x] Create `src/ui/stories/inspector.stories.tsx` — stories for `NodeInspector` and `EdgeInspector` in isolation with sample state; `export const meta = { title: "Inspector" }`
- [x] Update `src/ui/stories/index.ts` to export the inspector stories module

## Key Technical Notes

- All types + state-update utilities live in `src/ui/workspace.ts` — components import from there, not from `client.tsx`
- Components receive `WorkspaceState` + `Updater` as props; stories wrap with `useState<WorkspaceState>` and pass `setState`-based updater
- The `Updater` type: `(fn: (s: WorkspaceState) => WorkspaceState) => void` — stories create this as `(fn) => setState(fn(state))`

## Verification

- [x] `NO_COLOR=1 deno task check` — no type errors
- [x] `NO_COLOR=1 deno task lint` — clean
- [x] `NO_COLOR=1 deno task fmt` — clean
- [x] `NO_COLOR=1 deno task smoke` — server starts and shuts down cleanly
- [x] `NO_COLOR=1 deno task check` — still clean after component extraction
- [x] `NO_COLOR=1 deno task lint` — still clean
- [x] Browser: `/stories` — Tree Panel stories show real interactive tree; Inspector stories show node and edge inspectors
