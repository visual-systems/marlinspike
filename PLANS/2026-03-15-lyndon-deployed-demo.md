# Deployed Demo

**Branch:** lyndon/deployed-demo
**Date:** 2026-03-15

## Context

Marlinspike has a storybook with realistic example graphs. The goal is to make these publicly accessible via a live demo URL so the project can be shared without requiring a local dev setup. Deno Deploy is the chosen host (free tier, no GitHub integration required — deployed via `deployctl` CLI with a personal access token).

The current `mod.tsx` bundles `client.tsx` and `stories/main.tsx` on each request using `@deno/emit`. This fails on Deno Deploy because the bundler can't access source files at request time in that environment. The fix is to bundle once at server startup and cache the result in memory.

## Goal

A stable public URL (Deno Deploy) serving the Marlinspike storybook, with the startup-time bundle approach so it works correctly in the Deploy environment.

## Approach

- [x] Move `bundle()` calls from per-request handlers to server startup (eager, cached in memory)
- [ ] Verify locally that `deno task dev` still works with the new startup bundling
- [ ] Commit the `mod.tsx` change
- [ ] Deploy via `deployctl` and confirm `/stories` loads correctly with no 502 on `client.js` or `stories.js`

## Open Questions

- Does startup bundling add noticeable cold-start latency on Deno Deploy? (Likely acceptable for a demo.)
- Should the deploy step be documented in a `README` or `CONTRIBUTING` so others can re-deploy?

## Verification

- [ ] `NO_COLOR=1 deno task dev` starts cleanly and `/stories` works locally
- [ ] `NO_COLOR=1 deno task check` passes
- [ ] Deployed URL serves `/stories` without errors
- [ ] `client.js` and `stories.js` return 200 with correct content-type on the deployed URL
