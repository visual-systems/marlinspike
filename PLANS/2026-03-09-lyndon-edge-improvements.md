# Edge improvements

**Branch:** lyndon/edge-improvements
**Date:** 2026-03-09

## Context

Edges were rendered as simple center-to-center `<line>` elements with no arrowheads and no indication of direction. The README TODO called for "Draw arrows on edge ends". Additionally, bidirectional edges between the same pair of nodes would overlap completely.

## Goal

- [x] Arrowheads at the destination end of each edge
- [x] Lines route from node surface to node surface (not center to center)
- [x] Elliptical arc bending for bidirectional edge pairs

## Approach

- [x] Add `surfacePoint(from, to)` helper in `canvas.tsx` — clips line endpoint to node boundary (circle or AABB)
- [x] Add SVG `<defs>` with `#arrow` and `#arrow-sel` marker elements inside the `<svg>` root
- [x] Replace `<line>` with `<path>` using surface-clipped endpoints and `marker-end`
- [x] Detect bidirectional pairs at render time; use SVG arc (`A`) with opposite sweep flags to separate them
- [x] Split each edge into a wide transparent hit-area path and a narrower visible path (pointer-events:none on visible)
- [x] Add `Canvas/BidirectionalEdges` story

## Open Questions

None — complete.

## Verification

- [x] `NO_COLOR=1 deno task fmt && deno task lint && deno task check && deno task test` all pass
- [ ] Canvas stories: edges show arrowheads at destination end
- [ ] Arrowheads correctly directed (point to destination, not source)
- [ ] Selected edges: arrowhead changes to selected color (#5070c0)
- [ ] Lines start and end at node surface (no line inside circles or group rects)
- [ ] Canvas/BidirectionalEdges story: two arcs visibly separate
- [ ] Edge labels still appear at midpoint
