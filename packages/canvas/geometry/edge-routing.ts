/**
 * Angular edge routing — constrained-angle path fitting.
 *
 * Routes edges along a set of allowed travel angles (thetas), producing
 * clean geometric paths. Different theta sets give different aesthetics:
 * - [0, pi/2]         → manhattan (horizontal/vertical only)
 * - [0, pi/4, pi/2]   → transit/metro map (adds 45-degree diagonals)
 * - [0, pi/6, pi/3, pi/2] → hex-grid style
 *
 * The greedy algorithm decomposes the displacement vector into two allowed
 * directions and routes a two-segment path with optional rounded corners.
 */

import type { Point } from "./surface.ts";

/** Result of an edge routing computation. */
export interface EdgeRoutingResult {
  /** SVG path `d` attribute string. */
  d: string;
  /** Unit vector: direction of travel arriving at dst. Used for arrowhead orientation. */
  endDirection: Point;
}

/** Manhattan routing: horizontal and vertical segments only. */
export const MANHATTAN_ANGLES = [0, Math.PI / 2];

/** Transit/metro map routing: horizontal, vertical, and 45-degree diagonals. */
export const TRANSIT_ANGLES = [0, Math.PI / 4, Math.PI / 2];

/**
 * Expand theta half-angles into full unit-vector directions.
 * Each theta produces two directions: theta and theta + pi.
 */
function expandDirections(thetas: number[]): Point[] {
  const dirs: Point[] = [];
  for (const t of thetas) {
    dirs.push({ x: Math.cos(t), y: Math.sin(t) });
    dirs.push({ x: Math.cos(t + Math.PI), y: Math.sin(t + Math.PI) });
  }
  return dirs;
}

/**
 * Route a path from src to dst using only allowed angles.
 *
 * Decomposes the displacement into two segments along allowed directions,
 * with optional rounded corners at the bend.
 */
export function angularRoute(
  src: Point,
  dst: Point,
  thetas: number[],
  cornerRadius: number,
): EdgeRoutingResult {
  const vx = dst.x - src.x;
  const vy = dst.y - src.y;
  const dist = Math.sqrt(vx * vx + vy * vy);

  if (dist < 0.001) {
    return { d: `M${src.x},${src.y} L${dst.x},${dst.y}`, endDirection: { x: 1, y: 0 } };
  }

  const dirs = expandDirections(thetas);

  // Check if any direction is nearly collinear with displacement → straight line
  for (const d of dirs) {
    const cross = Math.abs(d.x * vy - d.y * vx);
    const dot = d.x * vx + d.y * vy;
    if (cross < 0.5 && dot > 0) {
      return {
        d: `M${src.x},${src.y} L${dst.x},${dst.y}`,
        endDirection: { x: vx / dist, y: vy / dist },
      };
    }
  }

  // Search all direction pairs for shortest valid two-segment decomposition.
  // v = a*d1 + b*d2 where a > 0 and b > 0. Minimize total path length (a + b)
  // to avoid backtracking — longer paths mean one segment overshoots while the
  // other compensates by going backwards.
  let best: { a: number; b: number; d1: Point; d2: Point } | null = null;
  let bestLen = Infinity;

  for (const d1 of dirs) {
    for (const d2 of dirs) {
      // Skip same/opposite/parallel directions
      const dotD = d1.x * d2.x + d1.y * d2.y;
      if (Math.abs(dotD) > 0.999) continue;

      const det = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(det) < 0.001) continue;

      const a = (vx * d2.y - vy * d2.x) / det;
      const b = (vy * d1.x - vx * d1.y) / det;

      if (a > 0.001 && b > 0.001) {
        const pathLen = a + b;
        if (pathLen < bestLen) {
          bestLen = pathLen;
          best = { a, b, d1, d2 };
        }
      }
    }
  }

  if (!best) {
    // Fallback: straight line
    return {
      d: `M${src.x},${src.y} L${dst.x},${dst.y}`,
      endDirection: { x: vx / dist, y: vy / dist },
    };
  }

  const { a, b, d1, d2 } = best;

  // Bend point (where segments meet)
  const mx = src.x + d1.x * a;
  const my = src.y + d1.y * a;

  // Compute tangent length for the inscribed arc.
  // For a circular arc of radius R at a bend with turn angle θ,
  // the tangent length (how far back from the bend to start the arc) is R * tan(θ/2).
  // The turn angle is the angle between d1 and d2.
  const dotD = d1.x * d2.x + d1.y * d2.y;
  const turnAngle = Math.acos(Math.min(1, Math.max(-1, dotD)));
  const halfTurn = turnAngle / 2;
  const tangentLen = halfTurn > 0.01 ? cornerRadius * Math.tan(halfTurn) : cornerRadius;

  // Clamp so tangent doesn't exceed half of either segment
  const maxTangent = Math.min(a / 2, b / 2);
  const tl = Math.min(tangentLen, maxTangent);

  if (tl <= 0 || cornerRadius <= 0) {
    return {
      d: `M${src.x},${src.y} L${mx},${my} L${dst.x},${dst.y}`,
      endDirection: d2,
    };
  }

  // Rounded corner: shorten both segments by tangent length, insert arc
  const p1x = mx - d1.x * tl;
  const p1y = my - d1.y * tl;
  const p2x = mx + d2.x * tl;
  const p2y = my + d2.y * tl;

  // Sweep from cross product of d1 x d2
  const crossZ = d1.x * d2.y - d1.y * d2.x;
  const sweep = crossZ > 0 ? 1 : 0;

  return {
    d: `M${src.x},${src.y} L${p1x},${p1y} A${cornerRadius},${cornerRadius} 0 0,${sweep} ${p2x},${p2y} L${dst.x},${dst.y}`,
    endDirection: d2,
  };
}

/**
 * Create a reusable edge router for a given angle set and corner radius.
 *
 * Returns a function compatible with `CanvasTheme.edgeRouter`.
 * The returned function ignores the edge parameter — routing depends
 * only on geometry, not edge state.
 */
export function angularRouter(
  thetas: number[],
  cornerRadius = 0,
): (src: Point, dst: Point) => EdgeRoutingResult {
  return (src, dst) => angularRoute(src, dst, thetas, cornerRadius);
}
