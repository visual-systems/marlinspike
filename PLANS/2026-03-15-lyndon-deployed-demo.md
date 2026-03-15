# Deployed Demo

**Branch:** lyndon/deployed-demo
**Date:** 2026-03-15

## Context

Marlinspike has a storybook with realistic example graphs. The goal is to make these publicly accessible via a live demo URL so the project can be shared without requiring a local dev setup. Deno Deploy is the chosen host (free tier, deployed via `deployctl` CLI with a personal access token — no GitHub integration required).

On-demand bundling via `@deno/emit` fails on Deno Deploy in two ways:
1. Per-request bundling: bundler can't access source files at request time
2. Startup bundling: `@deno/emit` uses `@deno/cache-dir` which calls `Deno.permissions.querySync`, not available in Deploy's sandbox

The fix is to pre-bundle in CI (`deno task build` → `dist/`) and serve the static output. `mod.tsx` reads from `dist/` when present, falling back to `bundle()` for local dev.

## Goal

A stable public URL (Deno Deploy) serving the Marlinspike storybook, deployed via a manual GitHub Actions workflow.

## Approach

- [x] Move `bundle()` calls from per-request handlers to server startup (eager, cached in memory)
- [x] Discover startup bundling also fails on Deploy (`Deno.permissions.querySync`)
- [x] Add `build.ts` + `deno task build` to pre-bundle to `dist/`
- [x] Update `mod.tsx` to read from `dist/` when present, fall back to `bundle()` for local dev
- [x] Add `dist/` to `.gitignore`; add `dist/` to `deploy.include` in `deno.json`
- [x] Add manual GitHub Actions workflow (`.github/workflows/deploy.yml`) — runs build then `deployctl deploy`; uses `DENO_DEPLOY_TOKEN` secret
- [x] Add live demo links to README
- [x] Trigger workflow and confirm `/stories` loads correctly with no 502s

## Open Questions

- Should the deploy step be documented in a `README` or `CONTRIBUTING` for others to re-deploy? (Currently covered by the workflow file itself.)

## Verification

- [x] `NO_COLOR=1 deno task check` passes
- [x] `NO_COLOR=1 deno task smoke` starts cleanly locally
- [x] GitHub Actions deploy workflow completes successfully
- [x] Deployed URL serves `/stories` without errors
- [x] `client.js` and `stories.js` return 200 with correct content-type on the deployed URL
