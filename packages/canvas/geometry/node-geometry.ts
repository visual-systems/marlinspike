/**
 * Opaque node geometry — the shape abstraction for canvas nodes.
 *
 * After construction, a NodeGeometry is queried only through its methods:
 * SDF, rendering, surface clipping, arc clipping, and port positioning.
 * External consumers never inspect what shape it "is" — only how it behaves.
 *
 * Canvas may use internal shape knowledge for rendering performance (D2),
 * but that is hidden behind the interface.
 */

import type { CanvasPort } from "../scene/types.ts";
import type { RenderPrimitive } from "../render/primitives.ts";
import type { PortDescriptor } from "./ports.ts";
import type { Point } from "./surface.ts";
import { arcClipPoint, arcClipRect } from "./arc.ts";
import { circlePortPositions, rectPortPositions } from "./ports.ts";

// ---------------------------------------------------------------------------
// Body style — minimal visual properties needed to render a shape body.
// ---------------------------------------------------------------------------

/** Visual properties for rendering a shape body (fill, stroke, dash). */
export interface BodyStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDash?: string;
}

// ---------------------------------------------------------------------------
// NodeGeometry interface
// ---------------------------------------------------------------------------

/** Opaque geometry for a canvas node shape. */
export interface NodeGeometry {
  /**
   * Produce render primitives for the shape body, relative to node center (0, 0).
   * Does NOT include label, ports, or decorations — only the shape itself.
   */
  renderBody(w: number, h: number, style: BodyStyle): RenderPrimitive[];

  /**
   * Point on the shape boundary in the direction from (cx, cy) toward (tx, ty),
   * offset outward by `gap` pixels.
   */
  surfacePoint(
    cx: number,
    cy: number,
    w: number,
    h: number,
    tx: number,
    ty: number,
    gap: number,
  ): Point;

  /**
   * Arc-circle clipping: where a circular arc exits this shape's boundary.
   * Used for curved edge endpoint placement.
   */
  arcClip(
    arcC: Point,
    r: number,
    center: Point,
    w: number,
    h: number,
    gap: number,
    sweep: number,
    other: Point,
  ): Point;

  /**
   * Signed distance field for this geometry, centered at (0, 0) with given dimensions.
   * Negative inside, zero on surface, positive outside.
   */
  sdf(w: number, h: number): (px: number, py: number) => number;

  /**
   * Compute port positions for this geometry.
   * Positions are relative to node center (0, 0).
   */
  portPositions(
    ports: readonly PortDescriptor[],
    w: number,
    h: number,
    labelH: number,
  ): CanvasPort[];

  /**
   * Stroke dash pattern for this geometry when the node is dashed.
   * Returns undefined when not dashed.
   */
  strokeDash(dashed: boolean): string | undefined;
}

// ---------------------------------------------------------------------------
// CIRCLE_GEOMETRY
// ---------------------------------------------------------------------------

/** Circle geometry singleton. Stateless — dimensions come from the node at call time. */
export const CIRCLE_GEOMETRY: NodeGeometry = {
  renderBody(w, h, style) {
    const r = Math.min(w, h) / 2;
    return [{
      kind: "circle" as const,
      cx: 0,
      cy: 0,
      r,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDash: style.strokeDash,
    }];
  },

  surfacePoint(cx, cy, w, h, tx, ty, gap) {
    const dx = tx - cx;
    const dy = ty - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return { x: cx, y: cy };
    const ux = dx / dist;
    const uy = dy / dist;
    const r = Math.min(w, h) / 2;
    return { x: cx + ux * (r + gap), y: cy + uy * (r + gap) };
  },

  arcClip(arcC, r, center, w, h, gap, _sweep, other) {
    const clipR = Math.min(w, h) / 2 + gap;
    return arcClipPoint(arcC, r, center, clipR, other);
  },

  sdf(w, h) {
    const r = Math.min(w, h) / 2;
    return (px, py) => Math.sqrt(px * px + py * py) - r;
  },

  portPositions(ports, w, h, _labelH) {
    const r = Math.min(w, h) / 2;
    return circlePortPositions(ports, r);
  },

  strokeDash(dashed) {
    return dashed ? "3,2" : undefined;
  },
};

// ---------------------------------------------------------------------------
// RECT_GEOMETRY
// ---------------------------------------------------------------------------

/** Rectangle geometry singleton. Stateless — dimensions come from the node at call time. */
export const RECT_GEOMETRY: NodeGeometry = {
  renderBody(w, h, style) {
    const halfW = w / 2;
    const halfH = h / 2;
    return [{
      kind: "rect" as const,
      x: -halfW,
      y: -halfH,
      w,
      h,
      rx: w > 60 ? 8 : 4,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDash: style.strokeDash,
    }];
  },

  surfacePoint(cx, cy, w, h, tx, ty, gap) {
    const dx = tx - cx;
    const dy = ty - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return { x: cx, y: cy };
    const ux = dx / dist;
    const uy = dy / dist;
    const halfW = w / 2;
    const halfH = h / 2;
    const ttx = Math.abs(ux) > 0.001 ? halfW / Math.abs(ux) : Infinity;
    const tty = Math.abs(uy) > 0.001 ? halfH / Math.abs(uy) : Infinity;
    const t = Math.min(ttx, tty);
    return { x: cx + ux * (t + gap), y: cy + uy * (t + gap) };
  },

  arcClip(arcC, r, center, w, h, gap, sweep, other) {
    return arcClipRect(arcC, r, center, w / 2, h / 2, gap, sweep, other);
  },

  sdf(w, h) {
    const hw = w / 2;
    const hh = h / 2;
    return (px, py) => {
      const qx = Math.abs(px) - hw;
      const qy = Math.abs(py) - hh;
      return (
        Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
        Math.min(Math.max(qx, qy), 0)
      );
    };
  },

  portPositions(ports, w, h, labelH) {
    return rectPortPositions(ports, w / 2, h / 2, labelH);
  },

  strokeDash(dashed) {
    return dashed ? "6,3" : undefined;
  },
};

// ---------------------------------------------------------------------------
// resolveGeometry — bridge function for migration
// ---------------------------------------------------------------------------

/**
 * Resolve the NodeGeometry for a node, with fallback from geometry → shape → circle.
 * This is the single choke-point for the old/new bridge during migration.
 */
export function resolveGeometry(
  node: { shape?: "circle" | "rect"; geometry?: NodeGeometry },
): NodeGeometry {
  if (node.geometry) return node.geometry;
  if (node.shape === "rect") return RECT_GEOMETRY;
  return CIRCLE_GEOMETRY;
}
