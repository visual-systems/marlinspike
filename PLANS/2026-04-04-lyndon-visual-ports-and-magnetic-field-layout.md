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
  - Port candidates filtered by topological position: input ports = initial nodes (no incoming sibling edges), output ports = terminal nodes (no outgoing sibling edges)
  - Uses `PropLabel` and existing styling conventions

- [x] **A5 — Port stories** (`src/ui/stories/port.stories.tsx`):
  - Circle port rendering: single input, single output, mixed I/O, inout, many ports
  - Rect port rendering: inputs+outputs, many ports on expanded node
  - Inspector stories: composite with existing ports, composite with add-port candidates

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
  - Add to algorithm selector dropdown in layout stories (with full config + topoCharge wiring)

- [x] **B5 — Propagate charge through the layout pipeline**:
  - In `buildLevel()` / `syncLayout()` (canvas.tsx): compute `topoCharge` for the level's edges, attach `charge` to each `ForceNode`
  - This happens at level build time, not per-tick (charges are static for a given graph topology)

- [ ] **B6 — Tuning and verification**:
  - Chain A→B→C settles left-to-right
  - Diamond/fan patterns produce readable LTR flow
  - Disconnected components don't drift apart (inter-component forces still active from SDF base)
  - Pinned nodes are respected
  - Adjust `fieldStrength` default

### Phase C — Port anchor springs and edge bending

Port-nodes (child nodes that correspond to a declared port on their parent composite)
should be physically attracted toward their port's boundary position. This makes the
port-node relationship visible in the layout and naturally reinforces LTR flow. The
feature is algorithm-agnostic — it applies to any force-based algorithm (SDF, FIELD),
not just FIELD.

**Design:**
- Each port on a composite's boundary has a known position (from `rectPortPositions`)
- The child node matching that port gets a spring pulling it toward the anchor
- The spring ramps up over time: `anchorStrength * min(1, ticks / rampTicks)`
  - Early ticks: topology forces dominate, graph finds its structural shape
  - Later ticks: port-nodes migrate toward their boundary positions
- Complements FIELD charge: charge gives global LTR flow to all nodes, anchors give
  precise positioning to port-nodes specifically

**Implementation:**

- [ ] **C1 — Extend ForceNode with anchor target** (`src/ui/lib/force.ts`):
  - Add optional `anchor?: { x: number; y: number }` field to `ForceNode`
  - Represents the target position (port boundary point) relative to the level origin
  - Existing algorithms ignore it (backward compatible)

- [ ] **C2 — Attach anchors in buildLevel** (`src/ui/components/canvas.tsx`):
  - When building a child level for an expanded composite, look up the parent's ports
  - For each port, compute the boundary position via `rectPortPositions` (using the parent's current w/h)
  - Attach `anchor: { x, y }` to the matching child ForceNode
  - Anchors are recomputed on each `buildLevel` / size change (they depend on parent dimensions)

- [ ] **C3 — Port anchor spring force** (`src/ui/lib/sdf-force.ts` or new module):
  - New force: for each node with an `anchor`, apply a spring toward anchor position
  - Strength ramps: `baseAnchorK * min(1, ticks / anchorRampTicks)`
  - Config: `anchorK` (spring constant), `anchorRampTicks` (ramp duration)
  - Applied in `tickSdfLevel` so all SDF-based algorithms (SDF, FIELD) get it for free

- [x] **C4 — Edge bending in canvas renderer**:
  - `edgeBendPoint()` computes quadratic bezier control point when a straight edge passes too close to a non-incident node
  - Edge path uses `Q` (quadratic bezier) when bent, `L` (line) when straight, `A` (arc) for multi-edges
  - Arrowhead tangent calculation updated: for bent edges, tangent is direction from bend control point to destination
  - Edge label midpoint updated: uses bezier midpoint formula `(src + 2*bend + dst) / 4`
  - `bend` field added to `EdgeRenderData` so it flows through both render passes
  - Clearance threshold: `LEAF_R + 20`

- [x] **C5 — Tuning and stories**:
  - Default tuning values set: `anchorK: 0.03`, `anchorRampTicks: 80`, edge bend clearance `LEAF_R + 20`
  - Layout stories already have FIELD with all config knobs (anchorK, anchorRampTicks, fieldStrength)
  - Visual verification deferred to browser testing (end-to-end checks below)

### Bug fixes discovered during verification

- [x] **Port persistence** (`src/ui/workspace.ts`): `parseNode` was missing `ports` field — ports silently dropped on page refresh, corrupting defn forms into empty param lists
- [x] **Map pretty-printing** (`src/code/spike-clojure.ts`): multi-entry map literals (e.g. `{:x1 ... :x2 ...}`) now pretty-print one key-value pair per line instead of a single long line

### New files
- `src/ui/lib/port-layout.ts` + `src/ui/lib/port-layout_test.ts`
- `src/ui/components/port-rendering.tsx`
- `src/ui/lib/topo-charge.ts` + `src/ui/lib/topo-charge_test.ts`
- `src/ui/lib/algorithms/FIELD.ts`
- `src/ui/stories/port.stories.tsx`

### Modified files
- `src/ui/components/canvas.tsx` — port rendering (A3), charge propagation (B5), algorithm registration (B4), anchor attachment (C2), edge bending (C4)
- `src/ui/components/inspector.tsx` — port sections in node inspector (A4)
- `src/ui/lib/force.ts` — `ForceNode.charge` and `ForceNode.anchor` fields (B2, C1)
- `src/ui/lib/sdf-force.ts` — `applyAnchorForces` (C3), exported `lineClosestPoint`/`lineSdfDist` (C4)
- `src/ui/lib/algorithms/types.ts` — `AlgorithmId` union (B4)
- `src/ui/lib/algorithms/index.ts` — export FIELD (B4)
- `src/ui/lib/algorithms/SDF.ts` — anchor config and `applyAnchorForces` in tick (C3)
- `src/ui/lib/algorithms/FIELD.ts` — anchor config and `applyAnchorForces` in tick (C3)
- `src/ui/stories/index.ts` — export port stories
- `src/ui/stories/layout.stories.tsx` — FIELD algorithm in configurator
- `src/ui/workspace.ts` — port persistence fix
- `src/code/spike-clojure.ts` — map pretty-printing
- `src/code/spike-clojure_test.ts` — updated map format expectations

## Open Questions

- Exact `fieldStrength` value — needs empirical tuning
- Should FIELD be the new default, or opt-in alongside SDF? Lean: make it default once stable
- Future: compass widget for rotating the field direction
- Anchor spring vs charge interaction: does anchor make charge redundant for port-nodes, or do they complement well? Lean: both — charge gives direction to non-port nodes, anchors give precision to port nodes
- Should anchor positions update dynamically as the parent resizes during layout, or only on buildLevel? Dynamic is more correct but adds complexity
- Edge bending clearance threshold — may need per-algorithm tuning

## Verification

### Unit tests
- [x] `port-layout_test.ts` — correct count, left/right placement, even spacing for circle and rect
- [x] `topo-charge_test.ts` — chain assigns -1..+1, diamond produces correct rank ordering, single node → charge 0, disconnected nodes → all charge 0

### End-to-end checks
- [x] Nodes with ports show colored dots (input left, output right)
- [x] Expanded composites show port dots + labels along edges
- [x] Hovering a port shows name + type
- [x] Inspector shows "Ports In" and "Ports Out" sections for nodes with ports
- [x] Nodes without ports render unchanged
- [x] FIELD algorithm: A→B→C chain settles left-to-right
- [x] FIELD algorithm: diamond A→B,C→D has clear LTR flow
- [x] FIELD algorithm: fan-out A→B,C,D spreads targets to the right
- [x] Pinned layouts are not disturbed
- [x] SDF/JANK/TOPOGRID algorithms unaffected by new ForceNode fields
- [x] Port-nodes settle near their boundary positions (anchor springs)
- [x] Anchor ramp: early ticks show topology-driven layout, late ticks show port-anchored layout
- [x] Edge bending: edges route around non-incident nodes
- [x] `NO_COLOR=1 deno task ci` passes
