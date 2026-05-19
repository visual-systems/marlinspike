/**
 * @marlinspike/canvas — Target-agnostic graph canvas rendering
 *
 * A standalone library for drawing graph elements (nodes, edges, ports)
 * with pluggable visual themes and render-target abstraction.
 *
 * - Scene graph types describe positioned nodes and edges
 * - Geometry helpers handle surface clipping, arc math, SDF primitives
 * - Style interfaces allow pluggable visual themes
 * - Render primitives are target-agnostic (SVG, Canvas2D, WebGL)
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Scene graph types
// ---------------------------------------------------------------------------

export type { CanvasEdge, CanvasNode, CanvasPort, CanvasScene } from "./scene/types.ts";

// ---------------------------------------------------------------------------
// Style interfaces
// ---------------------------------------------------------------------------

export type {
  CanvasTheme,
  EdgeStyle,
  EdgeStyleResolver,
  NodeDecorationsResolver,
  NodeStyle,
  NodeStyleResolver,
  PortStyle,
  PortStyleResolver,
} from "./style/types.ts";

// ---------------------------------------------------------------------------
// Geometry — surface clipping
// ---------------------------------------------------------------------------

export { surfacePoint } from "./geometry/surface.ts";
export type { Point } from "./geometry/surface.ts";

// ---------------------------------------------------------------------------
// Geometry — arc math
// ---------------------------------------------------------------------------

export {
  arcClipPoint,
  arcClipRect,
  arcMidpoint,
  edgeArcOffset,
  pathEndTangent,
} from "./geometry/arc.ts";

// ---------------------------------------------------------------------------
// Geometry — SDF primitives
// ---------------------------------------------------------------------------

export type { SdfShape } from "./geometry/sdf.ts";
export {
  isCircleShape,
  lineSdfDist,
  sdfGradient,
  sdfOf,
  supportExtent,
  surfaceToSurface,
} from "./geometry/sdf.ts";

// ---------------------------------------------------------------------------
// Geometry — node geometry (opaque shape abstraction)
// ---------------------------------------------------------------------------

export type { BodyStyle, NodeGeometry } from "./geometry/node-geometry.ts";
export {
  CIRCLE_GEOMETRY,
  RECT_GEOMETRY,
  resolveGeometry,
} from "./geometry/node-geometry.ts";

// ---------------------------------------------------------------------------
// Geometry — port positions
// ---------------------------------------------------------------------------

export type { PortDescriptor } from "./geometry/ports.ts";
export { circlePortPositions, rectPortPositions } from "./geometry/ports.ts";

// ---------------------------------------------------------------------------
// Render primitives
// ---------------------------------------------------------------------------

export type {
  RenderCircle,
  RenderGroup,
  RenderPath,
  RenderPolygon,
  RenderPrimitive,
  RenderRect,
  RenderText,
} from "./render/primitives.ts";

// ---------------------------------------------------------------------------
// Renderer interface
// ---------------------------------------------------------------------------

export type { Renderer } from "./render/renderer.ts";
export { renderWith } from "./render/renderer.ts";

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------

export { renderNode } from "./render/node.ts";
export { computeEdgePath, groupEdges, renderEdge } from "./render/edge.ts";
export type { EdgeRenderData } from "./render/edge.ts";
export { renderScene } from "./render/scene.ts";

// ---------------------------------------------------------------------------
// SVG renderer (reference implementation)
// ---------------------------------------------------------------------------

export { svgRenderer } from "./render/svg.ts";

// ---------------------------------------------------------------------------
// Default theme
// ---------------------------------------------------------------------------

export { marlinTheme } from "./style/marlin-theme.ts";

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

export type { CanvasInteraction, InteractionHint } from "./interaction/types.ts";
export { hitTest } from "./interaction/hit-test.ts";
export { PointerHandler } from "./interaction/pointer.ts";
export type { PointerHandlerConfig } from "./interaction/pointer.ts";
