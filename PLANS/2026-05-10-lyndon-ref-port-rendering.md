# Ref Port Rendering

**Branch:** lyndon/ref-port-rendering **Date:** 2026-05-10 **Branch Preview:** <!-- replace me -->

## Context

Ref nodes reference functions but currently render as featureless circles — you can't see how data
flows into and out of the referenced function. In port-based visual languages (Max/MSP, Unreal
Blueprints, Houdini), function nodes show their input/output ports and edges connect to specific
ports, making dataflow visible at a glance.

## Goal

1. Collapsed ref nodes show the target function's input/output ports (resolved at render time).
2. Edges connect to specific port positions on collapsed nodes, not the generic node boundary.
3. Port-aware routing applies to all collapsed nodes with ports (not just refs), but refs are the
   primary beneficiary since they gain ports from their target.

## Approach

### Step 1: Add `resolveNodePorts` helper (`port-layout.ts`)

- [x] Add `resolveNodePorts(node, treeNodes)` — returns own ports, or target's ports for refs
- [x] Add unit tests in `port-layout_test.ts` (7 tests)

### Step 2: Render resolved ports on collapsed nodes (`canvas.tsx`)

- [x] Build `effectivePortsMap` in `renderLevel` using `resolveNodePorts`
- [x] Use resolved ports for collapsed node port rendering (replaces `node.ports` check)

### Step 3: Port-aware edge routing (`canvas.tsx`)

- [x] Pre-compute `nodePortPositions` map from `effectivePortsMap`
- [x] Add `resolveEdgePorts(edge)` — maps each edge to source/destination port names
  - Source port: `edge.data.outputPort` or label match against output ports
  - Dest port: position of source label in `data.argOrder` → maps to input port index
- [x] Add `portSurfacePoint(node, portPositions, portName, gap)` — returns port boundary position
- [x] Use port positions for straight edges (arc edges keep boundary clipping for now)

### Step 4: Stories (`reference.stories.tsx`)

- [x] **RefWithPorts** — ref node with resolved ports visible
- [x] **RefPortEdgeRouting** — edges connecting to specific port positions

### Step 5: Plan and docs

- [x] Update plan file
- [ ] Update entity-references plan (close ports-on-refs open question)
- [ ] Update DESIGN.md if needed

## Key files

| File                                   | Change                                       |
| -------------------------------------- | -------------------------------------------- |
| `src/ui/lib/port-layout.ts`            | `resolveNodePorts` helper                    |
| `src/ui/lib/port-layout_test.ts`       | 7 unit tests for port resolution             |
| `src/ui/components/canvas.tsx`         | Effective ports map, port-aware edge routing |
| `src/ui/stories/reference.stories.tsx` | RefWithPorts + RefPortEdgeRouting stories    |

## Open Questions

- **Arc edge routing to ports** — Deferred. Arc clipping math is designed for boundary intersection,
  not specific points. Port-aware arc routing needs a different approach.
- **Port count display limits** — Many ports on a small circle (r=26) may crowd. Probably fine for
  typical function arities (2-4 ports).

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (403 tests, 0 failures)
- [ ] Stories render at `/stories` — ref nodes show target's ports
- [ ] Edges visibly connect to port positions (not generic boundary)
- [ ] Existing non-ref rendering unchanged
