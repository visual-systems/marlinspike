/**
 * Surface clipping — compute the point on a node's boundary in a given direction.
 *
 * Used for edge endpoint placement: edges start/end at the node surface, not center.
 * Delegates to the node's NodeGeometry for shape-specific clipping.
 */

import type { CanvasNode } from "../scene/types.ts";
import { resolveGeometry } from "./node-geometry.ts";

/** Point in 2D space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Returns the point on `from`'s boundary in the direction of `to`,
 * offset outward by `gap` pixels.
 *
 * Delegates to the node's NodeGeometry for shape-specific boundary computation.
 */
export function surfacePoint(from: CanvasNode<unknown>, to: CanvasNode<unknown>, gap = 0): Point {
  const geo = resolveGeometry(from);
  return geo.surfacePoint(from.x, from.y, from.w, from.h, to.x, to.y, gap);
}
