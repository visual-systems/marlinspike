# Deno Deploy

**Branch:** lyndon/deno-deploy
**Date:** 2026-04-19
**Branch Preview:** 

## Context

The `deployctl` CLI approach has been deprecated. The project has moved to Deno Deploy's native
GitHub integration, which deploys automatically on push — no GitHub Action needed. The old
`deploy.yml` workflow has been deleted. The new production URL is
`https://marlinspike.sordina.deno.net`.

## Goal

Update all references and docs to reflect the new deployment setup. Ensure `dist/` bundles are
fresh and committed so Deno Deploy can serve them.

## Approach

- [x] Update README URLs (`marlinspike.deno.dev` → `marlinspike.sordina.deno.net`)
- [x] Rewrite DESIGN.md section 6.8 to reflect native Deno Deploy integration
- [x] Add `dist/` to `.gitignore` — Deno Deploy runs the build command automatically
- [x] `deno task ci` passes

## Open Questions

- `@deno/emit` is imported unconditionally in `mod.tsx` even though it's only used in dev mode.
  Consider making the import dynamic or removing the dev fallback — deferred to future work.

## Verification

- [x] `dist/` is gitignored (Deno Deploy builds automatically)
- [x] README URLs point to `marlinspike.sordina.deno.net`
- [x] DESIGN.md section 6.8 reflects current deployment approach
- [x] `deno task ci` passes — 358 tests green
- [ ] After merge + push to main, verify `https://marlinspike.sordina.deno.net` serves the app
- [ ] Verify `/health` endpoint responds
