# JSX and Storybook

**Branch:** lyndon/jsx-and-storybook
**Date:** 2026-03-08

## Context
The client-side UI was vanilla TypeScript DOM manipulation (`client.ts` + `src/ui/components/*.ts`). Migrating to JSX with `hono/jsx/dom` gives a composable component model and enables a Storybook-style story viewer for developing and reviewing components in isolation.

The SSR layer (`App.tsx`, `handler.tsx`) uses Hono JSX — unchanged. Client files use `hono/jsx/dom` (Hono's browser-side DOM renderer) via a per-file pragma, keeping the dependency surface at zero new packages.

**Key finding:** `@deno/emit bundle` requires the `importMap` option to be passed explicitly (it does not auto-discover `deno.json`). Two import map entries were added to `deno.json` for the JSX runtime paths.

## Goal
- Rewrite all client components as JSX `.tsx` functions using `hono/jsx/dom`
- Rewrite `client.ts` → `client.tsx` using `render()` to mount the app
- Set up `src/ui/stories/` with a Storybook-style viewer served at `/stories`

## Approach

### Foundation
- [x] Verify `hono/jsx/dom` pragma works in a bundled client file — requires `importMap` passed to `bundle()` and explicit entries in `deno.json` for `@hono/hono/jsx/dom` and `@hono/hono/jsx/dom/jsx-runtime`
- [x] Update `deno.json` check task to include new SSR `.tsx` server files

### Component migration (`src/ui/components/`)
- [x] Convert `widgets.ts` → `widgets.tsx` — typed JSX components
- [x] Convert `dropdown.ts` → `dropdown.tsx` — JSX `Dropdown` component with `useEffect` for click-outside detection
- [x] Update `index.ts` exports; delete old `.ts` files

### Client rewrite
- [x] Replace `src/ui/client.ts` with `src/ui/client.tsx` using `/** @jsxImportSource @hono/hono/jsx/dom */`
- [x] Keep all existing interfaces unchanged
- [x] Root `<App />` holds `WorkspaceState` in `useState`, syncs to `localStorage` via `useEffect`
- [x] Decomposed into: `<WorkspaceBar />`, `<TabItem />`, `<WorkspaceControls />`, `<ConnectedGraphsBtn />`, `<WorkspaceArea />`, `<TreePanel />`, `<TreeNodeRow />`, `<Inspector />`, `<InspectorShell />`, `<NodeInspector />`, `<EdgeInspector />`, `<EdgesSection />`, `<EdgeRow />`, `<ListEditorModal />`
- [x] Mount with `render(<App />, document.getElementById('app')!)`
- [x] Delete `src/ui/client.ts`

### Stories infrastructure
- [x] `src/ui/StoriesShell.tsx` — SSR HTML shell (loads `/stories.js`)
- [x] `src/ui/stories-handler.tsx` — Hono handler for `/stories`
- [x] `GET /stories` and `GET /stories.js` routes in `mod.ts`
- [x] `src/ui/stories/main.tsx` — story viewer (sidebar + main panel, hash routing `#Group/StoryName`)
- [x] `src/ui/stories/index.ts` — barrel that re-exports all story modules
- [x] Story convention: `*.stories.tsx` exports `meta = { title }` + named story functions

### Story files
- [x] `widgets.stories.tsx` — `IconBtn`, `SmallBtn`, `PropLabel`
- [x] `dropdown.stories.tsx` — fixed width, fill width, with edit row
- [x] `tree-panel.stories.tsx` — tree view with sample graph data

## Architecture decisions
- **`hono/jsx/dom` via per-file pragma** — `/** @jsxImportSource @hono/hono/jsx/dom */` in all client files; SSR files keep global `@hono/hono/jsx`
- **Immutable state updates** — `update(fn: (s: WorkspaceState) => WorkspaceState)` pattern; helper functions `withPanel`, `withNodeMutation`, `updateNodeInTree`, `removeNodeFromTree`
- **Inspector split drag** — uses `useRef` to directly manipulate DOM flex values during drag for 60fps, then updates state on mouseup
- **Tab/node renaming** — local `useState(renaming)` with `useRef` for the input; `useEffect` auto-focuses on enter

## Verification
- [x] `NO_COLOR=1 deno task check` — no type errors
- [x] `NO_COLOR=1 deno task lint` — clean
- [x] `NO_COLOR=1 deno task fmt` — clean
- [x] `NO_COLOR=1 deno task smoke` — starts and shuts down cleanly
- [x] `client.js` bundle — 109 KB, builds cleanly
- [x] `stories.js` bundle — 67 KB, builds cleanly
- [ ] Browser: `http://localhost:8000` — workspace UI renders correctly (same as before)
- [ ] Browser: `http://localhost:8000/stories` — story viewer shows sidebar + component previews
