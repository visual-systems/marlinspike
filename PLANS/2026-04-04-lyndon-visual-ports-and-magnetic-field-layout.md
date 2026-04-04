# Visual Ports and Magnetic Field Layout

**Branch:** lyndon/visual-ports-and-magnetic-field-layout
**Date:** 2026-04-04

## Context

Nodes can declare input/output ports (`TreeNode.ports: Port[]`) serialized to/from Spike-Clojure, but ports have zero visual presence on the canvas. The force-directed layout (SDF) has no concept of dataflow direction — a chain A→B→C may settle in any orientation.

## Goal

0. **Inspector updates** - Have ports sections in the inspector for graphs - works similar to edges sections, but can select immediate child nodes as ports.
1. **Visual ports** — show input/output port indicators on node boundaries
2. **FIELD algorithm** — a new layout algorithm (alongside SDF, JANK, TOPOGRID) that adds a directional flow field, biasing the graph into left-to-right alignment. "North" points right for now; a future compass widget will let users rotate it.

Edges remain node-to-node (no `fromPort`/`toPort` wiring yet).

## Approach

### Phase A — Visual port rendering

- [x] **A1 — Port geometry module** (`src/ui/lib/port-layout.ts`+ `_test.ts`):
  - `circlePortPositions(ports, radius)` → inputs on left semicircle, outputs on right
  - `rectPortPositions(ports, halfW, halfH, labelH)` → inputs along left edge, outputs along right
  - Returns `PortPosition[]`: `{portName, direction, type?, x, y, nx, ny}` (relative to node center)

- [x] **A2 — Port rendering** (`src/ui/components/port-rendering.tsx`):
  - Small circles (r≈4) at boundary positions, color-coded by direction (in=blue, out=orange, inout=green)
  - Hover: tooltip with port name + type
  - Expanded nodes: always show port name labels beside dots

- [x] **A3 — Canvas integration** in `canvas.tsx`:
  - Collapsed nodes: `circlePortPositions` → `<NodePorts>` after `<circle>`
  - Expanded nodes: `rectPortPositions` → `<NodePorts>` after `<rect>`
  - Nodes without ports: unchanged

- [x] **A4 — Ports in inspector** (`src/ui/components/inspector.tsx`):
  - Add "Ports In" and "Ports Out" sections to `NodeInspector`, between Children and Edges In
  - Each port shown as a row: colored dot + name + type (if present)
  - Read-only display for now (ports are declared via code, not edited in inspector)
  - Uses `PropLabel` and existing styling conventions

### Phase B — FIELD layout algorithm

- [x] **B1 — Topological charge computation** (`src/ui/lib/topo-charge.ts` + `_test.ts`):
  - Given nodes and directed edges, compute a topological sort (or longest-path rank for DAGs with multiple paths)
  - Assign each node a `charge` from `-1` (sources / leftmost) to `+1` (sinks / rightmost), linearly interpolated by rank
  - Handle cycles gracefully (break ties arbitrarily or use SCC condensation)
  - Pure function: `topoCharge(nodeIds: string[], edges: {a: string, b: string}[]): Map<string, number>`

- [x] **B2 — Extend ForceNode with charge** (`src/ui/lib/force.ts`):
  - Add optional `charge?: number` field to `ForceNode` (-1 to +1)
  - Existing algorithms ignore it (backward compatible)

- [x] **B3 — FIELD algorithm** (`src/ui/lib/algorithms/FIELD.ts`):
  - New `LayoutAlgorithm` implementation, extending SDF with a directional field force
  - Uses `tickSdfLevel` for all existing SDF forces (repulsion, springs, edge clearance, components)
  - After the SDF tick, applies an additional **field force**: each node is pushed along the field direction (rightward) proportional to its charge. Charge -1 → pushed left, charge +1 → pushed right.
  - Field direction vector: `(1, 0)` for now (North = right). Future: configurable angle.
  - New config: `fieldStrength` (force magnitude per unit charge), tuned empirically
  - Factory: `createFIELD(config: FieldConfig): LayoutAlgorithm`

- [x] **B4 — Register FIELD in the algorithm system**:
  - Add `"FIELD"` to `AlgorithmId` union in `src/ui/lib/algorithms/types.ts`
  - Export from `src/ui/lib/algorithms/index.ts`
  - Add to `makeCanvasAlgorithm()` in `canvas.tsx`
  - Add to algorithm selector dropdown in layout stories

- [x] **B5 — Propagate charge through the layout pipeline**:
  - In `buildLevel()` / `syncLayout()` (canvas.tsx): compute `topoCharge` for the level's edges, attach `charge` to each `ForceNode`
  - This happens at level build time, not per-tick (charges are static for a given graph topology)

- [ ] **B6 — Tuning and verification**:
  - Chain A→B→C settles left-to-right
  - Diamond/fan patterns produce readable LTR flow
  - Disconnected components don't drift apart (inter-component forces still active from SDF base)
  - Pinned nodes are respected
  - Adjust `fieldStrength` default

### New files
- `src/ui/lib/port-layout.ts` + `src/ui/lib/port-layout_test.ts`
- `src/ui/components/port-rendering.tsx`
- `src/ui/lib/topo-charge.ts` + `src/ui/lib/topo-charge_test.ts`
- `src/ui/lib/algorithms/FIELD.ts`

### Modified files
- `src/ui/components/canvas.tsx` — port rendering (A3), charge propagation (B5), algorithm registration (B4)
- `src/ui/components/inspector.tsx` — port sections in node inspector (A4)
- `src/ui/lib/force.ts` — `ForceNode.charge` field (B2)
- `src/ui/lib/algorithms/types.ts` — `AlgorithmId` union (B4)
- `src/ui/lib/algorithms/index.ts` — export FIELD (B4)

## Open Questions

- Exact `fieldStrength` value — needs empirical tuning
- Should FIELD be the new default, or opt-in alongside SDF? Lean: make it default once stable
- Future: compass widget for rotating the field direction

## Verification

### Unit tests
- [x] `port-layout_test.ts` — correct count, left/right placement, even spacing for circle and rect
- [x] `topo-charge_test.ts` — chain assigns -1..+1, diamond produces correct rank ordering, single node → charge 0, disconnected nodes → all charge 0

### End-to-end checks
- [ ] Nodes with ports show colored dots (input left, output right)
- [ ] Expanded composites show port dots + labels along edges
- [ ] Hovering a port shows name + type
- [ ] Inspector shows "Ports In" and "Ports Out" sections for nodes with ports
- [ ] Nodes without ports render unchanged
- [ ] FIELD algorithm: A→B→C chain settles left-to-right
- [ ] FIELD algorithm: diamond A→B,C→D has clear LTR flow
- [ ] FIELD algorithm: fan-out A→B,C,D spreads targets to the right
- [ ] Pinned layouts are not disturbed
- [ ] SDF/JANK/TOPOGRID algorithms unaffected by new ForceNode fields
- [x] `NO_COLOR=1 deno task ci` passes
