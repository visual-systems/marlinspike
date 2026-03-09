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

### SVG marker-end color on selection (resolved)

Arrowhead color proved difficult to update dynamically. Several approaches failed:

- **`context-stroke`** — `fill="context-stroke"` on the marker path rendered black in-browser (Chromium/WebKit do not support it reliably outside inline SVG).
- **`currentColor`** — setting `color={stroke}` on the path element and `fill="currentColor"` on the marker rendered white; SVG `currentColor` inheritance does not flow into `<marker>` content from a referencing element's computed style.
- **Two named markers + conditional `marker-end`** — `marker-end={isSelected ? "url(#arrow-sel)" : "url(#arrow)"}` set the correct initial color but never updated on re-render; Hono JSX's VDOM diffing does not reliably apply `marker-end` attribute changes to existing DOM nodes.
- **CSS custom properties on a `<g class>`** — `.edge { --ec: #2a2a50 } .edge-sel { --ec: #5070c0 }` with `fill="var(--ec)"` inside the marker also failed; CSS custom properties do not cascade into SVG `<marker>` shadow content.

**Resolution:** abandon `<marker>` entirely. Render a `<polygon fill={stroke}>` directly in the scene per-edge. Explicit `fill` attribute updates work correctly through Hono JSX's VDOM diffing. A `pathEndTangent()` helper was added to align the polygon with the arc tangent at the endpoint rather than the chord direction.

## Verification

- [x] `NO_COLOR=1 deno task fmt && deno task lint && deno task check && deno task test` all pass
- [x] Canvas stories: edges show arrowheads at destination end
- [x] Arrowheads correctly directed (point to destination, not source)
- [x] Selected edges: arrowhead changes to selected color (#5070c0)
- [x] Lines start and end at node surface (no line inside circles or group rects)
- [x] Canvas/BidirectionalEdges story: two arcs visibly separate
- [x] Edge labels still appear at midpoint
