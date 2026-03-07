# Frontend First Step

**Branch:** lyndon/frontend-first-step
**Date:** 2026-03-07

## Context
Marlinspike needs a UI layer (Phase 1 of the roadmap). This is the scaffold-only first step: a minimal TSX-based frontend in `src/ui/` using Deno-native dependencies. Hono's built-in JSX support (`@hono/hono/jsx`) enables server-side rendering of TSX components without a bundler or npm toolchain.

## Goal
Serve a blank canvas shell as a full HTML page from the Hono server, written in TSX. Establish the `src/ui/` directory as the home for all frontend code.

## Approach
- [x] Add JSX compiler options to `deno.json` (`jsx: react-jsx`, `jsxImportSource: @hono/hono/jsx`)
- [x] Update check task to include `src/**/*.tsx`
- [x] Create `src/ui/App.tsx` — minimal TSX shell (full-page HTML, blank `#canvas` div)
- [x] Create `src/ui/handler.tsx` — wraps `<App />` render, keeping JSX out of `mod.ts`
- [x] Update `mod.ts` — `GET /` serves HTML via `handleRoot`; health check moved to `GET /health`
- [x] Verify check, lint, fmt, smoke all pass
- [x] Verify routes return expected content

## Open Questions

## Verification
- [x] `NO_COLOR=1 deno task check` passes with no type errors (including tsx)
- [x] `NO_COLOR=1 deno task lint` passes
- [x] `NO_COLOR=1 deno task fmt` passes
- [x] `NO_COLOR=1 deno task smoke` starts and shuts down cleanly
- [x] `GET /` returns HTML page with `<div id="canvas">`
- [x] `GET /health` returns `{"name":"marlinspike","status":"ok"}`
