# Deno Scaffold

**Branch:** lyndon/deno-scaffold
**Date:** 2026-03-07

## Context

Marlinspike has no source code yet — only design docs and GitHub Actions tooling. This branch establishes a Deno-based project foundation so that real implementation work can begin on subsequent branches.

## Goal

A working Deno single-package project with:
- Standard dev tasks wired up
- Editor config for the Deno LSP
- A first real code stub (base graph TypeScript types + JSON Schema)
- An HTTP entrypoint (`Deno.serve`)
- CI that checks formatting, linting, and tests

## Approach

- [x] Create `deno.json` with tasks (`dev`, `start`, `fmt`, `lint`, `test`, `check`) and compiler/fmt/lint options
- [x] Create `mod.ts` — minimal `Deno.serve()` on port 8000 as a placeholder entrypoint
- [x] Create `src/graph/types.ts` — TypeScript types for the base graph format (DESIGN.md §4.3): `Graph`, `Node`, `Edge`, `PortNode`, `NodeKind`, `Direction`, `EdgeEndpoint`, `NodeImplementation`
- [x] Create `src/graph/schema.json` — JSON Schema Draft 2020-12 for the base graph format
- [x] Create `src/graph/schema_test.ts` — `Deno.test` cases validating example graphs against the schema
- [x] Create `.vscode/settings.json` — enable Deno LSP, lint, formatter
- [x] Create `.vscode/extensions.json` — recommend `denoland.vscode-deno`
- [x] Create `.github/workflows/ci.yml` — fmt check, lint, test on push/PR

## Open Questions

None.

## Verification

- [x] `deno fmt --check` passes with no errors
- [x] `deno lint` passes with no errors
- [x] `deno test` runs and passes schema validation tests (4/4)
- [x] `deno task dev` starts the server and responds on localhost:8000
- [ ] VSCode opens with Deno LSP active (no red squiggles on imports)
- [ ] CI workflow appears in GitHub Actions on push
