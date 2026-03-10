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
| Run tests | `NO_COLOR=1 deno task test` |
| Format check | `NO_COLOR=1 deno task fmt` |
| Lint | `NO_COLOR=1 deno task lint` |
| Type check | `NO_COLOR=1 deno task check` |

## Conventions
<!-- Coding style, naming conventions, file organisation rules.
     Any patterns that should be followed consistently. -->

### Branch Planning

If currently in a git branch, and there is a matching plan in PLANS, then assume that we are following a "documented-plan" based workflow.

If not clear about weather to be performing actions, check if the more planning needs to be done.

See the `/branch` command for more information.

## Architecture Notes

See DESIGN.md for most informal architecture information. Formal architecture should be documented in source code files.

## Known Tooling Issues

- The `ExitPlanMode` tool's `plan` parameter appears to be pre-populated from the previous session's plan file rather than the current one. When using `/branch`, always overwrite `/Users/lyndon/.claude/plans/wondrous-drifting-zephyr.md` with the new plan content before calling `ExitPlanMode`, so the displayed plan is correct.

## Current Focus

If not in a planning branch (see `branch` command), then assume we're doing housekeeping - things like high-level docs, claude administration, tidying up, etc. If it seems like more substantial work then check if we should `branch`.
