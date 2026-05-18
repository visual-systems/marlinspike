# @marlinspike/layout

Extensible layout algorithms for graph visualisation. Pure geometry and physics — no DOM, no
rendering, no framework dependencies.

## Algorithms

| Algorithm    | Type          | Description                                   |
| ------------ | ------------- | --------------------------------------------- |
| **JANK**     | Iterative     | Coulomb repulsion + Hooke springs             |
| **SDF**      | Iterative     | Geometry-aware SDF repulsion + edge clearance |
| **TOPOGRID** | Deterministic | Topological grid (longest-path layers)        |
| **FIELD**    | Iterative     | SDF + directional flow field (charge-based)   |
| **PORT**     | Iterative     | FIELD + LTR init + port-node pinning          |

## Quick start

```ts
import { createSDF, DEFAULT_SDF_CONFIG, type ForceNode } from "@marlinspike/layout";

const algo = createSDF(DEFAULT_SDF_CONFIG);
const ids = ["A", "B", "C"];
const edges = [{ a: "A", b: "B" }, { a: "B", b: "C" }];

let nodes = algo.initNodes(ids, edges, 52, 52, new Map());
for (let t = 0; !result.settled; t++) {
  const result = algo.tick(nodes, edges, t);
  nodes = result.nodes;
}
// nodes now have settled x, y positions
```

## Custom algorithms

Implement the `LayoutAlgorithm` interface:

```ts
import type { LayoutAlgorithm, ForceNode, ForceEdge } from "@marlinspike/layout";

const myAlgorithm: LayoutAlgorithm = {
  id: "MY_ALGO",
  name: "My Algorithm",
  preservesPositions: true,
  initNodes(ids, edges, leafW, leafH, defaults) { ... },
  tick(nodes, edges, ticks) { ... },
};
```

## Composing with @marlinspike/canvas

The layout package computes positions; the canvas package renders them. No shared dependency — just
structural compatibility (`ForceNode` has `{x, y, w, h, shape}` which satisfies canvas's
`CanvasNode`).

```ts
import { createSDF, DEFAULT_SDF_CONFIG } from "@marlinspike/layout";
import { marlinTheme, renderScene, renderWith, svgRenderer } from "@marlinspike/canvas";

// 1. Run layout
const algo = createSDF(DEFAULT_SDF_CONFIG);
let nodes = algo.initNodes(ids, edges, 52, 52, new Map());
// ... run until settled ...

// 2. Convert to canvas scene
const scene = {
  nodes: nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    shape: n.shape ?? "circle",
    label: n.id,
  })),
  edges: edges.map((e, i) => ({ id: `e${i}`, fromId: e.a, toId: e.b })),
};

// 3. Render
const root = renderScene(scene, marlinTheme);
const svg = renderWith(svgRenderer(), root);
```

## SDF as geometry interface

Layout algorithms use SDF (signed distance field) functions from `@marlinspike/canvas` for
geometry-aware force computation. This means layout algorithms work correctly with any node shape —
circles, rectangles, or future custom shapes — without needing to know the rendering details. The
SDF interface provides:

- `sdfOf(shape)` — distance function for any shape
- `surfaceToSurface(a, b)` — gap between node surfaces
- `sdfGradient(sdf, x, y)` — repulsion direction
- `lineSdfDist(point, lineStart, lineEnd)` — edge clearance

## Live demos

See the layout algorithms in action at the Marlinspike stories:

- [Layout stories](https://marlinspike.sordina.deno.net/stories) — all algorithms with interactive
  controls
- [Package: @marlinspike-layout](https://marlinspike.sordina.deno.net/stories) — layout + canvas
  composition demo

## Exports

### Types

`ForceNode`, `ForceEdge`, `BBox`, `LayoutAlgorithm`, `AlgorithmId`

### Algorithm factories

`createJANK`, `createSDF`, `createTOPOGRID`, `createFIELD`, `createPORT`

### Utilities

`tickLevel`, `tickSdfLevel`, `applyAnchorForces`, `boundingBox`, `centerNodes`, `initPositions`,
`maxVelocity`, `topoCharge`, `topoGridLayout`, `topoGridLayoutLTR`, `connectedComponents`,
`lineSdfGrad`, `lineClosestPoint`

### Port layout

`circlePortPositions`, `rectPortPositions`, `resolveNodePorts`, `PortPosition`
