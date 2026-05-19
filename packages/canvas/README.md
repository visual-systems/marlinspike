# @marlinspike/canvas

Target-agnostic graph canvas rendering with opaque geometry, per-element styling, optional themes,
and a headless interaction model.

## What it does

Turns a `CanvasScene` (positioned nodes + edges) into a render-target-agnostic primitive tree. The
package handles:

- **Rendering** — nodes, edges (straight/arc), ports, labels, decorations
- **Geometry** — opaque `NodeGeometry` shapes, surface clipping, arc math, SDF primitives
- **Styling** — per-element style properties, with optional theme-based resolution
- **Interaction** — hit-testing against the primitive tree and a `PointerHandler` state machine for
  click/drag/hover without DOM dependency

Everything is pure functions over plain data. No DOM, no framework, no side effects.

## How rendering works

Each node and edge carries its own visual properties directly. The renderer resolves the final
appearance for each element using a layered precedence:

**Node geometry** (what shape to draw):

1. `node.geometry` — set directly on the node → used as-is
2. `theme.resolveNode(node).geometry` — if the theme defines `resolveNode` → overrides node geometry
3. Fallback: `CIRCLE_GEOMETRY`

**Node style** (colors, stroke, labels):

1. `theme.resolveNode(node).style` or `theme.node(node)` — theme computes base style
2. `node.style` — per-element overrides merged on top (`{ ...themeStyle, ...node.style }`)
3. Fallback: `marlinTheme` defaults (dark palette)

**Edge style** (colors, stroke, arrows):

1. `theme.edge(edge)` — theme computes base style
2. `edge.style` — per-element overrides merged on top
3. Fallback: `marlinTheme` defaults

The theme parameter itself is optional — `renderScene(scene)` works without one. This means you can
drive the canvas entirely through per-element properties, entirely through a theme, or mix both.

## Quick start — direct usage

The simplest way to use canvas is to set geometry and style directly on each element:

```typescript
import {
  CIRCLE_GEOMETRY,
  RECT_GEOMETRY,
  renderScene,
  renderWith,
  svgRenderer,
} from "@marlinspike/canvas";

const scene = {
  nodes: [
    {
      id: "a",
      x: 100,
      y: 100,
      w: 52,
      h: 52,
      geometry: CIRCLE_GEOMETRY,
      label: "Source",
      style: { fill: "#2a4a2a", stroke: "#4a8a4a", labelFill: "#88cc88" },
    },
    {
      id: "b",
      x: 250,
      y: 100,
      w: 80,
      h: 40,
      geometry: RECT_GEOMETRY,
      label: "Sink",
      style: { fill: "#4a2a2a", stroke: "#8a4a4a", labelFill: "#cc8888" },
    },
  ],
  edges: [
    { id: "e1", fromId: "a", toId: "b", style: { stroke: "#888", strokeWidth: 2 } },
  ],
};

// No theme needed — geometry and style are on the elements
const root = renderScene(scene);
const [svgContent] = renderWith(svgRenderer, root);
document.body.innerHTML = `<svg width="400" height="200">${svgContent}</svg>`;
```

Per-element styles are `Partial` — only specify the properties you want to override. Unspecified
properties fall through to the theme defaults.

## Opaque geometry (NodeGeometry)

Node shapes are **opaque objects** — the package never pattern-matches on shape strings. Each
`NodeGeometry` provides:

- `renderBody(w, h, style)` — shape primitives relative to node center
- `surfacePoint(cx, cy, w, h, tx, ty, gap)` — boundary clipping point toward a target
- `sdf(w, h)` — signed distance field (the only external query mechanism)
- `portPositions(ports, w, h, labelH)` — shape-specific port placement

Built-in singletons: `CIRCLE_GEOMETRY`, `RECT_GEOMETRY`. Custom shapes implement the `NodeGeometry`
interface — any geometry can be set directly on a node without theme involvement.

```typescript
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";

// Geometry is set directly on nodes — no theme needed
const circleNode = { id: "c", x: 0, y: 0, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "C" };
const rectNode = { id: "r", x: 100, y: 0, w: 80, h: 40, geometry: RECT_GEOMETRY, label: "R" };

// SDF queries (for layout, hit-testing, custom logic)
const circleSdf = CIRCLE_GEOMETRY.sdf(52, 52);
const distance = circleSdf(30, 0); // positive = outside, negative = inside
```

## Themes

Themes are an optional abstraction layer for when you want consistent styling across many elements
without repeating properties. A theme provides resolver callbacks that compute style (and optionally
geometry) from element state:

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

Per-element `style` overrides still apply on top of theme-resolved styles, so you can use a theme
for defaults and override individual elements.

### Theme-controlled geometry

Advanced themes can use `resolveNode` to control _both_ geometry and style based on consumer state.
This is how Marlinspike's CLASSIC theme maps semantic roles to visual shapes:

```typescript
import type { CanvasTheme, ResolvedNode } from "@marlinspike/canvas";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";

const myTheme: CanvasTheme<{ role: string }> = {
  node: (node) => ({
    /* fallback style */
  }),
  edge: (edge) => ({
    /* ... */
  }),
  port: (port) => ({
    /* ... */
  }),
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

## Relationship to Marlinspike

This is the rendering layer for Marlinspike's graph canvas. The IDE builds a
`CanvasScene<MarlinNodeState>` from workspace state, passes it through `renderScene` with the
CLASSIC theme, and renders the resulting primitive tree via the SVG renderer. The CLASSIC theme uses
`resolveNode` to map Marlinspike's semantic roles (leaf, container, port, reference) to geometry and
style — but this is application-level logic, not something the canvas package requires.

When no theme is provided, `renderScene` falls back to `marlinTheme` — a simple dark palette that
uses Marlinspike's visual conventions (`selected`/`highlighted`/`dashed` flags). For standalone
projects, use per-element `geometry` and `style` directly, or pass your own theme.

## Headless interaction

Hit-testing and pointer handling work without a DOM:

```typescript
import { hitTest, PointerHandler, renderScene } from "@marlinspike/canvas";

const root = renderScene(scene);

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

`marlinTheme` — a simple dark theme suitable for demos and tests. Used as default when no theme is
passed to `renderScene`.

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
of scene (+ optional theme). No mutation, no retained state, no object graphs.

**Direct by default, themes as abstraction.** Geometry and style can be set directly on each
element. Themes are an optional layer that computes these properties from element state — useful for
consistent styling across many elements, but not required. Per-element properties always take
precedence over theme-resolved values.

**Opaque geometry via SDF.** Node shapes are opaque `NodeGeometry` objects queried through signed
distance fields. This makes the package extensible to arbitrary shapes (rounded rectangles,
hexagons, constructive geometry) without modifying core rendering or clipping logic.

**Generic consumer state.** `CanvasNode<S>` carries a typed `state?: S` field that flows through to
theme resolvers. The package never inspects this state. Simple consumers use `S = unknown`; complex
consumers (like the IDE) define their own state type for full-fidelity visual control via themes.

## Dependencies

None. Zero runtime dependencies.

## License

Part of the [Marlinspike](https://github.com/visual-systems/marlinspike) project.
