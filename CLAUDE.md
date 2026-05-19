# Marlinspike — Claude Context

## Project Overview

See DESIGN.md for a detailed project overview.

## Repository Structure
<!-- Map of the key directories and what lives in each. -->

## Development Commands

This is a Deno project. Always prefix deno commands with `NO_COLOR=1` to suppress ANSI escape codes in output.

| Task | Command |
|---|---|
| Dev server (watch) | `NO_COLOR=1 deno task dev` |
| **All CI checks** | `NO_COLOR=1 deno task ci` |
| Run tests | `NO_COLOR=1 deno task test` |
| Format check | `NO_COLOR=1 deno task fmt` |
| Lint | `NO_COLOR=1 deno task lint` |
| Type check | `NO_COLOR=1 deno task check` |

## Conventions

### Package READMEs

Every package under `packages/` must have a `README.md`. See the "Package READMEs" section in
DESIGN.md for the required content structure. When creating or extracting a new package, include a
README that covers: what it does, relationship to Marlinspike, standalone usage with examples, API
summary, design rationale, deferred concepts from the plan, and links to stories.

### Branch Planning

If currently in a git branch, and there is a matching plan in PLANS, then assume that we are following a "documented-plan" based workflow.

If not clear about weather to be performing actions, check if the more planning needs to be done.

Always run `NO_COLOR=1 deno task ci` before committing and pushing. Fix any failures before proceeding.

See the `/branch` command for more information.

## Architecture Notes

See DESIGN.md for most informal architecture information. Formal architecture should be documented in source code files.

## Known Tooling Issues

- The `ExitPlanMode` tool's `plan` parameter appears to be pre-populated from the previous session's plan file rather than the current one. When using `/branch`, always overwrite `/Users/lyndon/.claude/plans/wondrous-drifting-zephyr.md` with the new plan content before calling `ExitPlanMode`, so the displayed plan is correct.

## Current Focus

If not in a planning branch (see `branch` command), then assume we're doing housekeeping - things like high-level docs, claude administration, tidying up, etc. If it seems like more substantial work then check if we should `branch`.
