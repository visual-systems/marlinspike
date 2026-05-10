# Ref Port Rendering

**Branch:** lyndon/ref-port-rendering **Date:** 2026-05-10 **Branch Preview:** <!-- replace me -->

## Context

Ref nodes reference functions but currently render as featureless circles — you can't see how data
flows into and out of the referenced function. In port-based visual languages (Max/MSP, Unreal
Blueprints, Houdini), function nodes show their input/output ports and edges connect to specific
ports, making dataflow visible at a glance.

## Goal

1. Collapsed ref nodes show the target function's input/output ports (resolved at render time).
2. ~~Edges connect to specific port positions on collapsed nodes.~~ — Deferred: the force layout
   doesn't account for port positions, so routing edges to fixed port locations creates worse visual
   results (crossing, wrong-direction edges) than boundary routing on complex graphs.

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

## Key files

| File                                   | Change                                          |
| -------------------------------------- | ----------------------------------------------- |
| `src/ui/lib/port-layout.ts`            | `resolveNodePorts` helper                       |
| `src/ui/lib/port-layout_test.ts`       | 7 unit tests for port resolution                |
| `src/ui/components/canvas.tsx`         | Effective ports map for resolved port rendering |
| `src/ui/stories/reference.stories.tsx` | RefWithPorts + RefPortEdgeRouting stories       |

## Open Questions

- **Port-aware edge routing** — Needs a port-aware layout algorithm. The current force layout
  doesn't position nodes to minimise port-edge crossings. A left-to-right topogrid or Sugiyama-style
  layout would make port routing viable.
- **Port count display limits** — Many ports on a small circle (r=26) may crowd. Probably fine for
  typical function arities (2-4 ports), but 7+ ports on cubic-roots functions look busy.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (403 tests, 0 failures)
- [ ] Stories render at `/stories` — ref nodes show target's ports
- [ ] Existing non-ref rendering unchanged
