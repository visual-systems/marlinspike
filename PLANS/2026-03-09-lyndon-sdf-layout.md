# SDF Layout

**Branch:** lyndon/sdf-layout
**Date:** 2026-03-09

## Context

JANK uses point-mass Coulomb repulsion (center-to-center). This ignores node geometry and causes disconnected nodes to drift indefinitely. SDF layout replaces Coulomb with geometry-aware signed-distance field repulsion — circle SDF for leaf nodes, rectangle SDF for expanded composites — virtual bounding circles for inter-component cohesion, and line SDF for edge-clearance forces and bent edge routing.

## Goal

A new pluggable `SDF` layout algorithm that:
- Avoids overlap between nodes of different shapes/sizes
- Keeps disconnected nodes clustered near their siblings (centroid cohesion)
- Is visually comparable to or better than JANK for connected graphs

## Approach

- [x] Define what SDF layout means (geometry-aware repulsion + centroid well)
- [x] Design the algorithm (S2S distance, SDF gradient, quadratic falloff, centroid K)
- [x] Create `src/ui/lib/sdf-force.ts` — core math
- [x] Create `src/ui/lib/algorithms/SDF.ts` — LayoutAlgorithm factory
- [x] Update `types.ts`, `index.ts` — register "SDF" as AlgorithmId
- [x] Update `canvas.tsx` — add to dropdown and makeCanvasAlgorithm
- [x] Update `layout.stories.tsx` — add SDF to story selector + config params + bent edge rendering + component overlay debug
- [ ] Tune parameters via stories and iterate
- [x] Update `README.md` — mark SDF TODO done

## Open Questions

- springRestLength may need tuning down (40–60) now that S2S formula is correct — old formula effectively halved it
- Per-connected-component centroid (future) — not in scope now, virtual bounding circles sufficient

## Verification

- [x] "SDF" appears in layout dropdown in canvas and stories
- [ ] "No edges (5 nodes)" dataset: nodes cluster, don't drift (key test — verify via story)
- [ ] No overlap at rest on Triangle/Ring/Star/Grid datasets
- [x] Expanded bounding boxes don't overlap (Two Groups / Mixed datasets) — fixed by directional S2S formula
- [x] `deno task check`, `deno task lint`, `deno task fmt`, `deno task test` pass
- [x] JANK and TOPOGRID behaviour unchanged
