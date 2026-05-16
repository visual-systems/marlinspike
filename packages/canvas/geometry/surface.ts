/**
 * Surface clipping — compute the point on a node's boundary in a given direction.
 *
 * Used for edge endpoint placement: edges start/end at the node surface, not center.
 */

import type { CanvasNode } from "../scene/types.ts";

/** Point in 2D space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Returns the point on `from`'s boundary in the direction of `to`,
 * offset outward by `gap` pixels.
 *
 * For circle nodes: clips at the circle radius.
 * For rect nodes: clips at the AABB boundary via ray intersection.
 */
export function surfacePoint(from: CanvasNode, to: CanvasNode, gap = 0): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return { x: from.x, y: from.y };
  const ux = dx / dist;
  const uy = dy / dist;

  if (from.shape === "circle") {
    const r = Math.min(from.w, from.h) / 2;
    return { x: from.x + ux * (r + gap), y: from.y + uy * (r + gap) };
  }

  // Rectangle: ray-AABB clip
  const halfW = from.w / 2;
  const halfH = from.h / 2;
  const tx = Math.abs(ux) > 0.001 ? halfW / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 0.001 ? halfH / Math.abs(uy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: from.x + ux * (t + gap), y: from.y + uy * (t + gap) };
}
