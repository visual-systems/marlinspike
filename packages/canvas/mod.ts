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
// Geometry — port positions
// ---------------------------------------------------------------------------

export type { PortDescriptor } from "./geometry/ports.ts";
export { circlePortPositions, rectPortPositions } from "./geometry/ports.ts";
