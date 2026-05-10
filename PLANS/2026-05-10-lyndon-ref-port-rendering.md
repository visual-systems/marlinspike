# Ref Port Rendering

**Branch:** lyndon/ref-port-rendering **Date:** 2026-05-10 **Branch Preview:** <!-- replace me -->

## Context

Ref nodes reference functions but currently render as featureless circles — you can't see how data
flows into and out of the referenced function. In port-based visual languages (Max/MSP, Unreal
Blueprints, Houdini), function nodes show their input/output ports and edges connect to specific
ports, making dataflow visible at a glance.

## Goal

1. Collapsed ref nodes show the target function's input/output ports (resolved at render time).
2. Port-aware layout algorithm (PORT) that positions nodes for left-to-right dataflow, making
   port-aware edge routing viable.
3. Edges connect to specific port positions on collapsed nodes (gated on PORT algorithm).

## Approach

### Step 1: Add `resolveNodePorts` helper (`port-layout.ts`)

- [x] Add `resolveNodePorts(node, treeNodes)` — returns own ports, or target's ports for refs
- [x] Add unit tests in `port-layout_test.ts` (7 tests)

### Step 2: Render resolved ports on collapsed nodes (`canvas.tsx`)

- [x] Build `effectivePortsMap` in `renderLevel` using `resolveNodePorts`
- [x] Use resolved ports for collapsed node port rendering (replaces `node.ports` check)

### Step 3: Port-aware edge routing (`canvas.tsx`) — REVERTED

Port-aware edge routing was implemented and tested but reverted after visual testing on complex
graphs (cubic-roots). The force layout places nodes without regard to port positions, so routing
edges to fixed port locations creates crossing and wrong-direction edges. This needs a port-aware
layout algorithm (e.g. left-to-right topogrid) to work well.

### Step 4: Stories (`reference.stories.tsx`)

- [x] **RefWithPorts** — ref node with resolved ports visible
- [x] **RefPortEdgeRouting** — edges connecting to specific port positions

### Step 5: Plan and docs

- [x] Update plan file
- [x] Update entity-references plan (close ports-on-refs open question)
- [x] Update DESIGN.md

### Step 6: LTR topogrid functions (`topo-grid.ts`)

Add left-to-right variants of the existing top-to-bottom topogrid. Same `buildLayerAssignment`,
but layers map to x-axis (columns) and within-layer ordering maps to y-axis.

- [x] Add `topoGridLayoutLTR` (uniform size, for initNodes)
- [x] Add `topoGridLayoutSizedLTR` (per-node sizes, for tick convergence)
- [x] Add tests in `topo-grid_test.ts` (6 tests)

### Step 7: Create PORT algorithm (`algorithms/PORT.ts`)

New layout algorithm: LTR topogrid init + FIELD-style tick (SDF + directional field + anchor forces).

- `preservesPositions: false` — deterministic LTR init on each syncLayout
- `initNodes` → `topoGridLayoutLTR`
- `tick` → `tickSdfLevel` + directional field force + `applyAnchorForces` (same as FIELD)
- Config extends `FieldConfig` with LTR spacing params

- [x] Create `PORT.ts` with `createPORT` factory and `DEFAULT_PORT_CONFIG`

### Step 8: Register PORT

- [x] Add `"PORT"` to `AlgorithmId` in `types.ts`
- [x] Export from `index.ts`
- [x] Add PORT case to algorithm instantiation in `canvas.tsx`

### Step 9: Ref pseudo-edges in `stepLayout` (`canvas.tsx`)

Inject transient pseudo-edges for ref→target relationships so disconnected ref subgraphs are
pulled together by the layout. Gated on `algorithm.id === "PORT"`.

- [x] Add ref pseudo-edge injection in `stepLayout` (child + root level ticks)

### Step 10: Restore port-aware edge routing (gated on PORT)

Restore reverted edge routing code (`portSurfacePoint`, `resolveEdgePorts`, `nodePortPositions`),
gated on `algorithm.id === "PORT"`. Non-PORT algorithms fall back to boundary routing.

- [x] Restore port-aware edge routing, gated on PORT algorithm

### Step 11: Tests and verification

- [x] Unit tests for LTR topogrid (6 tests)
- [x] Update plan file as work progresses

### Diversion: Fix broken stories

Canvas and tree-panel stories were rendering empty — broken since the workspace/profile tree
refactor (`3ddafa0`). `defaultState()` creates a workspace root with no children, and
`getFocusedRootNodes` returns `focusNode.children` → `[]`. Stories that referenced hardcoded
`"spike://acme/..."` IDs or set `ws.treeNodes` directly without clearing `focusId` got nothing.

- [x] Add `storyState(children)` helper to `workspace.ts` — places nodes inside workspace root
- [x] Return `FocusedWorkspaceState` (narrowed type: `focusId: string`) — eliminates `!` assertions
- [x] Throws eagerly if workspace root missing — catches bugs at story construction, not render
- [x] Add warning in `getFocusedRootNodes` when `focusId` points to missing node
- [x] Fix all canvas.stories.tsx and tree-panel.stories.tsx to use `storyState()`

## Key files

| File                                   | Change                                          |
| -------------------------------------- | ----------------------------------------------- |
| `src/ui/lib/port-layout.ts`            | `resolveNodePorts` helper                       |
| `src/ui/lib/port-layout_test.ts`       | 7 unit tests for port resolution                |
| `src/ui/components/canvas.tsx`         | Effective ports map, PORT instantiation, ref pseudo-edges, port-aware routing |
| `src/ui/stories/reference.stories.tsx` | RefWithPorts + RefPortEdgeRouting stories       |
| `src/ui/lib/topo-grid.ts`             | `topoGridLayoutLTR`, `topoGridLayoutSizedLTR`  |
| `src/ui/lib/algorithms/PORT.ts`       | New PORT algorithm module                       |
| `src/ui/lib/algorithms/types.ts`      | Add `"PORT"` to `AlgorithmId`                   |
| `src/ui/lib/algorithms/index.ts`      | Export PORT                                     |

## Open Questions

- **Config tuning** — LTR defaults (field strength, spring length, anchor ramp) need visual
  tuning once the algorithm runs. Start with FIELD defaults and adjust.
- **Arc edge routing** — Deferred. Only straight edges get port-aware routing.
- **Ref target resolution in stepLayout** — Refs store target label, not ID. Need label→id
  lookup against sibling TreeNodes.
- **Port count display limits** — Many ports on a small circle (r=26) may crowd. Probably fine
  for typical function arities (2-4 ports), but 7+ ports on cubic-roots functions look busy.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (409 tests, 0 failures)
- [ ] Stories render at `/stories` — ref nodes show target's ports
- [ ] PORT algorithm: sources on left, sinks on right
- [ ] Edges connect to port positions on ref nodes (PORT only)
- [ ] Disconnected ref subgraphs pulled together by pseudo-edges
- [ ] Non-PORT algorithms unchanged
- [ ] Existing non-ref rendering unchanged
