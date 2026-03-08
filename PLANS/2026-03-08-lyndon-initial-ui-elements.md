# Initial UI Elements

**Branch:** lyndon/initial-ui-elements
**Date:** 2026-03-08

## Context
The SSR shell (`src/ui/App.tsx`) served a blank dark page. This branch adds the first interactive UI layer: workspace tabs, a tiling panel system, and a tree view panel — all using vanilla TypeScript DOM (no client framework) to stay bundler-free.

Client TypeScript is served by a Hono route that transpiles the source file on-request using `@deno/emit` (JSR). This avoids any build step while keeping the code in typed TypeScript.

## Goal
Add workspace tabs, a tiling panel layout, and a tree view panel. State persisted in `localStorage`. No bundler, no client framework.

## Approach
- [x] Add `"@deno/emit": "jsr:@deno/emit"` to `deno.json` imports
- [x] Add `--allow-read --allow-env` to dev/start/smoke tasks (required by `@deno/emit`)
- [x] Update check task to explicitly list server-side files (excludes `client.ts` which uses DOM lib)
- [x] Add `GET /client.js` route in `mod.ts` using `@deno/emit` transpile
- [x] Replace blank canvas in `src/ui/App.tsx` with IDE shell: `#workspace-bar` + `#workspace-area` + script tag
- [x] Create `src/ui/client.ts` — vanilla TS DOM client with:
  - `WorkspaceState` / `Tab` / `TreeNode` interfaces
  - localStorage persistence (`marlinspike.workspace`)
  - Workspace tab bar: activate, add, close, double-click rename
  - Tree view panel with expand/collapse per-node, collapse-all/expand-all controls
  - Hardcoded sample graph (acme/backend → auth-service → [token-validator, ingress], frontend)
  - Empty canvas panel placeholder

## Architecture decisions
- **No client framework** — vanilla TypeScript DOM manipulation
- **No bundler** — `GET /client.js` transpiles `src/ui/client.ts` on-request via `@deno/emit`
- **Single client file** — all client logic in `src/ui/client.ts`; can split later
- **State in localStorage** — simple JSON-serialised state object

## Open Questions

## Verification
- [x] `NO_COLOR=1 deno task check` — no type errors (excludes client.ts DOM lib conflicts)
- [x] `NO_COLOR=1 deno task lint` — clean
- [x] `NO_COLOR=1 deno task fmt` — clean
- [x] `NO_COLOR=1 deno task smoke` — starts and shuts down cleanly
- [x] `curl http://localhost:8000/client.js` — returns transpiled JavaScript
- [x] Opening `http://localhost:8000` in a browser shows workspace tab bar + tree view panel with expandable nodes
