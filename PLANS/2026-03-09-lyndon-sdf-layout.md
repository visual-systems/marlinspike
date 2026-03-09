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
- [x] Fix `surfaceToSurface` — replace probe-centre formula with directional support formula to correctly detect overlap
- [x] Fix Newton's 3rd law violation in edge clearance forces — distribute reaction to edge endpoints weighted by closest-point parameter `t`
- [x] Add `centerNodes` to `force.ts` — centres child layout at origin so SDF physics body and visual bbox stay in sync
- [x] Apply `centerNodes` in `canvas.tsx` and `layout.stories.tsx` composite ticks
- [x] Make SDF the default layout algorithm (`workspace.ts`)
- [x] Refactor `layout.stories.tsx` config to discriminated union — per-algorithm typed params, no `sdf*` prefixes
- [x] Tune parameters via stories and iterate
- [x] Update `README.md` — mark SDF TODO done
- [x] Fix TOPOGRID subgraph overlap — add `topoGridLayoutSized` (size-aware, surface-to-surface gaps) and make `tick` recompute positions from actual `node.w`/`node.h` until converged

## Open Questions

- springRestLength may need tuning down (40–60) — worth revisiting during parameter tuning
- "Dense" dataset rotates slowly — Newton's 3rd fix committed but not yet verified in story
- Per-connected-component centroid (future) — not in scope now, virtual bounding circles sufficient

## Verification

- [x] "SDF" appears in layout dropdown in canvas and stories
- [x] "No edges (5 nodes)" dataset: nodes cluster, don't drift (key test — verify via story)
- [x] No overlap at rest on Triangle/Ring/Star/Grid datasets
- [x] Expanded bounding boxes don't overlap (Two Groups / Mixed datasets) — fixed by directional S2S formula
- [x] `deno task check`, `deno task lint`, `deno task fmt`, `deno task test` pass
- [x] JANK and TOPOGRID flat-graph behaviour unchanged
- [x] TOPOGRID subgraph: composite bounding boxes no longer overlap
- [x] "Dense" dataset no longer rotates after Newton's 3rd fix
- [x] Switching algorithm in story Configurator loads only that algorithm's parameters in JSON editor
