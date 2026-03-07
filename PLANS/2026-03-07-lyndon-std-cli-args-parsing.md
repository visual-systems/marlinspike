# Std CLI Args Parsing

**Branch:** lyndon/std-cli-args-parsing
**Date:** 2026-03-07

## Context
`mod.ts` previously parsed `--timeout` by manually calling `Deno.args.indexOf` and indexing the next element. This is fragile — it doesn't handle `--timeout=3000` style, doesn't validate types, and scales poorly with more flags. `@std/cli` from the Deno standard library provides `parseArgs` (minimist-style), which handles all of this cleanly.

## Goal
Replace the manual `indexOf`-based arg parsing in `mod.ts` with `parseArgs` from `@std/cli`, and add an optional `--port` argument.

## Approach
<!-- High level checklist for the steps in the implementation plan details below -->
- [x] Add `"@std/cli": "jsr:@std/cli"` to `deno.json` imports
- [x] Rewrite arg parsing in `mod.ts` using `parseArgs`
- [x] Add optional `--port` argument (defaults to 8000)
- [x] Verify `deno task check`, `deno task lint`, `deno task fmt` all pass
- [x] Verify `deno task smoke` still works

## Open Questions

## Verification
- [x] `NO_COLOR=1 deno task check` passes with no type errors
- [x] `NO_COLOR=1 deno task lint` passes
- [x] `NO_COLOR=1 deno task fmt` passes
- [x] `NO_COLOR=1 deno task smoke` starts and shuts down cleanly
