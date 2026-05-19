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
import { createSDF, DEFAULT_SDF_CONFIG } from "@marlinspike/layout";

const algo = createSDF(DEFAULT_SDF_CONFIG);
const ids = ["A", "B", "C"];
const edges = [{ a: "A", b: "B" }, { a: "B", b: "C" }];

let nodes = algo.initNodes(ids, edges, 52, 52, new Map());
for (let t = 0; t < 500; t++) {
  const result = algo.tick(nodes, edges, t);
  nodes = result.nodes;
  if (result.settled) break;
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

## Adding layout to an existing canvas app

The most common integration pattern: you already have a canvas with manually positioned nodes and
want to add an "auto-layout" button. The glue code is minimal — extract IDs and edges, run the
algorithm, copy positions back.

```ts
import { createSDF, DEFAULT_SDF_CONFIG, type ForceEdge } from "@marlinspike/layout";
import type { CanvasNode } from "@marlinspike/canvas";

// Your existing canvas state
let canvasNodes: CanvasNode[] = [/* ... */];
let canvasEdges: { id: string; fromId: string; toId: string }[] = [/* ... */];

// 1. Extract IDs and edges for the layout engine
const ids = canvasNodes.map((n) => n.id);
const forceEdges: ForceEdge[] = canvasEdges.map((e) => ({ a: e.fromId, b: e.toId }));

// 2. Create algorithm and initialize (seeds from current positions)
const algo = createSDF(DEFAULT_SDF_CONFIG);
const defaults = new Map(canvasNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
let forceNodes = algo.initNodes(ids, forceEdges, 52, 52, defaults);

// 3. Run in a rAF loop (or run synchronously for instant layout)
function step(tick: number) {
  const result = algo.tick(forceNodes, forceEdges, tick);
  forceNodes = result.nodes;

  // 4. Write positions back to canvas nodes
  const posMap = new Map(result.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  canvasNodes = canvasNodes.map((n) => {
    const pos = posMap.get(n.id);
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });

  // 5. Re-render your canvas (your existing render path)
  renderMyCanvas(canvasNodes, canvasEdges);

  if (!result.settled) requestAnimationFrame(() => step(tick + 1));
}
step(0);
```

See the [Figma Lite with Layout](https://marlinspike.sordina.deno.net/stories) story for a complete
interactive example — it's the canvas package's FigmaLite demo with ~30 lines of layout integration
added.

## Composing with @marlinspike/canvas

The layout package computes positions; the canvas package renders them. No shared dependency — just
structural compatibility (`ForceNode` has `{x, y, w, h}` and the bridge code maps `ForceNode.shape`
to `CanvasNode.geometry`).

```ts
import { createSDF, DEFAULT_SDF_CONFIG } from "@marlinspike/layout";
import {
  CIRCLE_GEOMETRY,
  marlinTheme,
  RECT_GEOMETRY,
  renderScene,
  renderWith,
  svgRenderer,
} from "@marlinspike/canvas";

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
    geometry: n.shape === "rect" ? RECT_GEOMETRY : CIRCLE_GEOMETRY,
    label: n.id,
  })),
  edges: edges.map((e, i) => ({ id: `e${i}`, fromId: e.a, toId: e.b })),
};

// 3. Render
const root = renderScene(scene, marlinTheme);
const [svg] = renderWith(svgRenderer, root);
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
- [Package: @marlinspike-layout](https://marlinspike.sordina.deno.net/stories) — algorithm
  comparison, topology analysis, settlement dynamics, and canvas composition
- [Figma Lite with Layout](https://marlinspike.sordina.deno.net/stories) — adding auto-layout to an
  interactive canvas app

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
