# SDF Layout

**Branch:** lyndon/sdf-layout
**Date:** 2026-03-09

## Context

JANK uses point-mass Coulomb repulsion (center-to-center). This ignores node geometry and causes disconnected nodes to drift indefinitely. SDF layout replaces Coulomb with geometry-aware signed-distance field repulsion — circle SDF for leaf nodes, rectangle SDF for expanded composites — and adds a weak global centroid well to keep disconnected nodes from drifting.

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
- [ ] Update `README.md` — mark SDF TODO done

## Open Questions

- Centroid well strength (centroidK ≈ 0.002) — may need tuning via the story playground
- Per-connected-component centroid (future) — not in scope now, global well sufficient

## Verification

- [x] "SDF" appears in layout dropdown in canvas and stories
- [ ] "No edges (5 nodes)" dataset: nodes cluster, don't drift (key test — verify via story)
- [ ] No overlap at rest on Triangle/Ring/Star/Grid datasets
- [ ] Expanded bounding boxes don't overlap (Two Groups / Mixed datasets)
- [x] `deno task check` and `deno task lint` pass
- [x] JANK and TOPOGRID behaviour unchanged
