# @marlinspike/canvas

Target-agnostic graph canvas rendering with pluggable themes, opaque geometry, and a headless
interaction model.

## What it does

Turns a `CanvasScene` (positioned nodes + edges) and a `CanvasTheme` into a render-target-agnostic
primitive tree. The package handles:

- **Rendering** — nodes, edges (straight/arc), ports, labels, decorations
- **Geometry** — surface clipping, arc math, SDF primitives, opaque `NodeGeometry` shapes
- **Theming** — `CanvasTheme<S>` with typed consumer state flowing through to style resolvers
- **Interaction** — hit-testing against the primitive tree and a `PointerHandler` state machine for
  click/drag/hover without DOM dependency

Everything is pure functions over plain data. No DOM, no framework, no side effects.

## Relationship to Marlinspike

This is the rendering layer for Marlinspike's graph canvas. The IDE builds a
`CanvasScene<MarlinNodeState>` from workspace state, passes it through `renderScene` with the
CLASSIC theme, and renders the resulting primitive tree via the SVG renderer.

The package is designed for standalone use — the `marlinTheme` bundled default works for simple
graphs, and custom themes can control every visual aspect including geometry resolution.

## Quick start

```typescript
import {
  CIRCLE_GEOMETRY,
  marlinTheme,
  renderScene,
  renderWith,
  svgRenderer,
} from "@marlinspike/canvas";
import type { CanvasScene } from "@marlinspike/canvas";

const scene: CanvasScene = {
  nodes: [
    { id: "a", x: 100, y: 100, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Input" },
    { id: "b", x: 250, y: 100, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Output" },
  ],
  edges: [
    { id: "e1", fromId: "a", toId: "b" },
  ],
};

// Render to SVG
const root = renderScene(scene, marlinTheme);
const [svgContent] = renderWith(svgRenderer, root);
document.body.innerHTML = `<svg width="400" height="200">${svgContent}</svg>`;
```

## Custom themes

A theme controls colors, stroke, labels, and (optionally) geometry resolution:

```typescript
import type { CanvasTheme } from "@marlinspike/canvas";

const lightTheme: CanvasTheme = {
  node: (node) => ({
    fill: node.selected ? "#e8e8ff" : "#ffffff",
    stroke: node.selected ? "#4060b0" : "#cccccc",
    strokeWidth: node.selected ? 2 : 1,
    labelFill: "#333333",
    labelFont: "sans-serif",
    labelSize: 10,
  }),
  edge: (edge) => ({
    stroke: edge.selected ? "#4060b0" : "#999999",
    strokeWidth: 1,
    arrowSize: 8,
    labelFill: "#666",
    labelFont: "sans-serif",
    labelSize: 9,
  }),
  port: (port) => ({
    fill: port.direction === "out" ? "#cc8844" : "#4488cc",
    stroke: "none",
    radius: 3,
  }),
  background: "#f8f8fc",
};

const root = renderScene(scene, lightTheme);
```

## Opaque geometry (NodeGeometry)

Node shapes are **opaque objects** — the package never pattern-matches on shape strings. Each
`NodeGeometry` provides:

- `renderBody(w, h, style)` — shape primitives relative to node center
- `surfacePoint(cx, cy, w, h, tx, ty, gap)` — boundary clipping point toward a target
- `sdf(w, h)` — signed distance field (the only external query mechanism)
- `portPositions(ports, w, h, labelH)` — shape-specific port placement

Built-in singletons: `CIRCLE_GEOMETRY`, `RECT_GEOMETRY`. Custom shapes implement the `NodeGeometry`
interface.

```typescript
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";

// Geometry on nodes
const circleNode = { id: "c", x: 0, y: 0, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "C" };
const rectNode = { id: "r", x: 100, y: 0, w: 80, h: 40, geometry: RECT_GEOMETRY, label: "R" };

// SDF queries (for layout, hit-testing, custom logic)
const circleSdf = CIRCLE_GEOMETRY.sdf(52, 52);
const distance = circleSdf(30, 0); // positive = outside, negative = inside
```

## Theme-controlled geometry

Advanced themes can use `resolveNode` to control _both_ geometry and style:

```typescript
import type { CanvasTheme, ResolvedNode } from "@marlinspike/canvas";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";

const myTheme: CanvasTheme<{ role: string }> = {
  node: (node) => ({/* fallback style */}),
  edge: (edge) => ({/* ... */}),
  port: (port) => ({/* ... */}),
  background: "#0d0d1e",

  // resolveNode takes precedence — returns geometry + style together
  resolveNode: (node) => {
    const isContainer = node.state?.role === "container";
    return {
      geometry: isContainer ? RECT_GEOMETRY : CIRCLE_GEOMETRY,
      style: {
        fill: isContainer ? "#0f0f28" : "#111125",
        stroke: "#252545",
        strokeWidth: 1,
        labelFill: "#777799",
        labelFont: "sans-serif",
        labelSize: 9,
      },
    };
  },
};
```

## Headless interaction

Hit-testing and pointer handling work without a DOM:

```typescript
import { hitTest, marlinTheme, PointerHandler, renderScene } from "@marlinspike/canvas";

const root = renderScene(scene, marlinTheme);

// Direct hit-test
const hit = hitTest(root, { x: 100, y: 100 });
// → { id: "a", clickable: true, draggable: true }

// State machine for gestures
const pointer = new PointerHandler({
  getRoot: () => root,
  hooks: {
    onClick: (id, pos) => console.log("clicked", id),
    onDragStart: (id, pos) => console.log("drag start", id),
    onDragMove: (id, pos, delta) => console.log("dragging", id, delta),
    onDragEnd: (id, pos) => console.log("drag end", id),
    onHoverEnter: (id) => console.log("hover", id),
    onHoverLeave: (id) => console.log("unhover", id),
  },
  dragThreshold: 16,
  doubleClickWindow: 300,
});

// Feed abstract pointer events (from DOM, touch, tests, etc.)
pointer.onPointerDown({ x: 100, y: 100 });
pointer.onPointerUp({ x: 100, y: 100 });
```

## Composing with @marlinspike/layout

The layout package computes positions; this package renders them. See the
[@marlinspike/layout README](../layout/README.md) for integration examples.

## API

### Scene types

`CanvasNode<S>`, `CanvasEdge`, `CanvasPort`, `CanvasScene<S>`

### Style types

`CanvasTheme<S>`, `NodeStyle`, `NodeStyleProps`, `EdgeStyle`, `PortStyle`, `ResolvedNode`,
`ThemeConstants`

### Geometry

`NodeGeometry`, `CIRCLE_GEOMETRY`, `RECT_GEOMETRY`, `resolveGeometry`, `surfacePoint`, `sdfOf`,
`sdfGradient`, `isCircleShape`, `surfaceToSurface`, `lineSdfDist`

### Arc math

`arcClipPoint`, `arcClipRect`, `arcMidpoint`, `edgeArcOffset`, `pathEndTangent`

### Rendering

`renderScene`, `renderNode`, `renderEdge`, `computeEdgePath`, `groupEdges`, `renderWith`,
`svgRenderer`

### Interaction

`hitTest`, `PointerHandler`, `InteractionHint`, `CanvasInteraction`

### Bundled theme

`marlinTheme` — a simple dark theme suitable for demos and tests.

## Live demos

- [Canvas package stories](https://marlinspike.sordina.deno.net/stories) — scene types, geometry,
  styles, custom themes, hit-testing, interactive FigmaLite demo
- [Hierarchical rendering](https://marlinspike.sordina.deno.net/stories) — expand/collapse
  containers, z-order, edge clipping

## Design rationale

**Render-target agnostic.** The output is an abstract `RenderPrimitive` tree — not SVG elements. The
`Renderer<T>` interface maps primitives to a concrete target. The bundled `svgRenderer` produces SVG
strings; Canvas2D, WebGL, or test backends implement the same interface.

**Scene as data.** `CanvasScene` is a plain immutable data structure. Rendering is a pure function
of scene + theme. No mutation, no retained state, no object graphs.

**Opaque geometry via SDF.** Node shapes are opaque `NodeGeometry` objects queried through signed
distance fields. This makes the package extensible to arbitrary shapes (rounded rectangles,
hexagons, constructive geometry) without modifying core rendering or clipping logic.

**Generic consumer state.** `CanvasNode<S>` carries a typed `state?: S` field that flows through to
theme resolvers. The package never inspects this state. Simple consumers use `S = unknown` with
`marlinTheme`; complex consumers (like the IDE) define their own state type for full-fidelity visual
control.

**Theme as parameter, not pre-resolved data.** `renderScene(scene, theme)` takes a theme object
rather than requiring styles to be pre-resolved onto scene elements. An alternative design would
have the caller resolve all styles externally and pass pre-styled nodes to canvas — making canvas a
pure renderer with no theme concept. We chose the current approach because it keeps application code
simpler: the caller builds a scene and hands it to canvas with a theme, rather than manually
resolving styles for every node, edge, and port before rendering. The theme is really just a bag of
resolver callbacks — canvas doesn't know about roles, palettes, or theme _concepts_, it just calls
`theme.node(node)` and uses the result. This is a pragmatic trade-off: slightly more coupling at the
type level in exchange for significantly less boilerplate at the call site.

## Dependencies

None. Zero runtime dependencies.

## License

Part of the [Marlinspike](https://github.com/visual-systems/marlinspike) project.
