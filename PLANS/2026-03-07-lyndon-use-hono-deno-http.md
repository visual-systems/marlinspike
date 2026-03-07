# Use Hono Deno HTTP Package

**Branch:** lyndon/use-hono-deno-http
**Date:** 2026-03-07

## Context
<!-- Why is this work being done? What problem does it solve? -->
The current server in `mod.ts` uses the low-level `Deno.serve` API directly. Replacing it with [Hono](https://hono.dev/) provides a proper routing framework, middleware support, and a cleaner API surface — setting the project up for future route additions as the dataflow graph IDE backend grows.

## Goal
<!-- The intended outcome of this work. -->
Replace the raw `Deno.serve` call in `mod.ts` with Hono, maintaining the existing `/` health-check endpoint and the `--timeout` shutdown behaviour.

## Approach
<!-- High level checklist for the steps in the implementation plan details below -->
- [x] Add `hono` to `deno.json` imports
- [x] Rewrite `mod.ts` to use Hono app with equivalent route and startup logging
- [x] Verify `deno task check`, `deno task lint`, `deno task fmt` all pass
- [x] Verify `deno task smoke` (timeout test) still works

## Open Questions
<!-- Anything unresolved before or during implementation. -->
- Which Hono import specifier to use for Deno? (`npm:hono` vs `jsr:@hono/hono`)

## Verification
<!-- How to confirm the work is complete and correct. -->
- [x] `NO_COLOR=1 deno task check` passes with no type errors
- [x] `NO_COLOR=1 deno task lint` passes
- [x] `NO_COLOR=1 deno task fmt` passes
- [x] `NO_COLOR=1 deno task smoke` starts and shuts down cleanly
