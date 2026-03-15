# Simple Examples 1

**Branch:** lyndon/simple-examples-1
**Date:** 2026-03-15

## Context

Every existing canvas story uses the same 5-node abstract "acme/backend" fixture or smaller synthetic test data. There are no stories that show what the tool looks like with a realistic graph — real labels, real edge relationships, real node data, real constraints applied across a full picture. This makes it hard to evaluate visual quality, layout behaviour, or the constraint system in a context that looks like actual use.

This branch adds a dedicated `examples.stories.tsx` file with a small set of realistic demo graphs. Each story is a complete, self-contained scenario that could plausibly exist in a real project.

## Goal

A new storybook section — **"Examples"** — with 3–4 stories showing realistic graphs. Graphs should have:
- Meaningful node labels and `data` payloads (owner, version, status, etc.)
- Descriptive edge labels (e.g. "HTTP POST", "reads from", "emits events")
- Some constraints applied with live diagnostics
- Pre-expanded groups where interesting

## Approach

- [x] Create `src/ui/stories/examples.stories.tsx`
- [x] Add export to `src/ui/stories/index.ts`
- [x] Story 1 — **Pipeline**: linear producer → transform → consumer (simplest possible graph; shows the core idea)
- [x] Story 2 — **Request Lifecycle**: HTTP request path through a small service mesh (Client → Gateway → Auth → Service → DB); edges labelled with protocol; nodes have owner/version data; one constraint applied
- [x] Story 3 — **Microservice Mesh**: a small cluster of 3–4 services with bidirectional dependencies, some expanded to show internals, mix of passing/failing constraints
- [x] Story 4 — **Data Pipeline**: batch ETL style; Source → Validate → Transform → Load → Report; group nodes contain sub-steps; constraint on unlabelled edges

Each story uses a `StoryWrapper` component (same pattern as canvas.stories.tsx) that holds state, runs `validateWorkspace`, and renders `<Canvas>`.

## Files to create/modify

- `src/ui/stories/examples.stories.tsx` (new)
- `src/ui/stories/index.ts` (add export)

## Open Questions

- How much `node.data` is appropriate? The inspector renders it as a JSON textarea — keep it small but non-empty (2–3 fields per node).
- Should the stories render a constraints panel beside the canvas? Probably not for most — keep focus on the canvas. Could add one to the Microservice Mesh story.

## Verification

- [x] `NO_COLOR=1 deno task fmt && deno task lint && deno task check-ui` all pass
- [ ] All 4 stories appear in the storybook sidebar under "Examples"
- [ ] Each story renders without errors or blank canvas
- [ ] Diagnostics (error/warning badges) are visible in the stories that have constraints
