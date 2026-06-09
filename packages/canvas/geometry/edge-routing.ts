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
 * When scene context is available, it avoids routing through node bounding
 * boxes and prevents co-linear overlap with previously routed edges.
 */

import type { Point } from "./surface.ts";
import type { EdgeRoutingContext } from "../style/types.ts";

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

// ---------------------------------------------------------------------------
// Obstacle detection
// ---------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Test whether a line segment (p1→p2) intersects an axis-aligned bounding box.
 * Uses parametric clipping (Liang-Barsky style).
 */
export function segmentIntersectsBox(
  p1: Point,
  p2: Point,
  box: Box,
  margin = 2,
): boolean {
  const x0 = box.x - box.w / 2 - margin;
  const x1 = box.x + box.w / 2 + margin;
  const y0 = box.y - box.h / 2 - margin;
  const y1 = box.y + box.h / 2 + margin;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  let tmin = 0;
  let tmax = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-10) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > tmax) return false;
      if (t > tmin) tmin = t;
    } else {
      if (t < tmin) return false;
      if (t < tmax) tmax = t;
    }
    return true;
  };

  return clip(-dx, p1.x - x0) &&
    clip(dx, x1 - p1.x) &&
    clip(-dy, p1.y - y0) &&
    clip(dy, y1 - p1.y);
}

/**
 * Check if a point is near a box (used to skip src/dst node obstacles).
 * Margin must cover the surface-point offset (up to 15px from node surface)
 * so that source/destination nodes are correctly excluded from obstacles.
 */
function pointNearBox(p: Point, box: Box, margin = 20): boolean {
  return Math.abs(p.x - box.x) < box.w / 2 + margin &&
    Math.abs(p.y - box.y) < box.h / 2 + margin;
}

/**
 * Get obstacles that are NOT the source/destination nodes.
 * Filters out boxes containing the src or dst endpoints.
 */
function relevantObstacles(
  src: Point,
  dst: Point,
  obstacles: ReadonlyArray<Box>,
): Box[] {
  return obstacles.filter((b) => !pointNearBox(src, b) && !pointNearBox(dst, b));
}

/** Check if any segment of a polyline hits an obstacle. */
function pathHitsObstacle(points: Point[], obstacles: Box[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const obs of obstacles) {
      if (segmentIntersectsBox(points[i], points[i + 1], obs)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Co-linearity detection
// ---------------------------------------------------------------------------

/**
 * Check if a segment is approximately co-linear with any previously routed
 * segment — meaning parallel, close, and overlapping in the travel direction.
 * Returns a perpendicular offset amount if co-linear (0 if not).
 */
function colinearOffset(
  p1: Point,
  p2: Point,
  routedPaths: ReadonlyArray<{ src: Point; dst: Point; d: string }>,
  threshold = 8,
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return 0;

  // Unit direction and perpendicular
  const ux = dx / len;
  const uy = dy / len;

  let offsetCount = 0;

  for (const rp of routedPaths) {
    // Simple check: compare the straight-line segment of each routed path
    const rdx = rp.dst.x - rp.src.x;
    const rdy = rp.dst.y - rp.src.y;
    const rlen = Math.sqrt(rdx * rdx + rdy * rdy);
    if (rlen < 1) continue;

    const rux = rdx / rlen;
    const ruy = rdy / rlen;

    // Are they parallel? (dot product of unit vectors ≈ ±1)
    const dot = Math.abs(ux * rux + uy * ruy);
    if (dot < 0.95) continue;

    // Perpendicular distance from p1 to the routed path line
    const perpDist = Math.abs((rp.src.x - p1.x) * (-uy) + (rp.src.y - p1.y) * ux);
    if (perpDist < threshold) {
      // Check for overlap along the travel direction
      const proj1 = (p1.x - rp.src.x) * rux + (p1.y - rp.src.y) * ruy;
      const proj2 = (p2.x - rp.src.x) * rux + (p2.y - rp.src.y) * ruy;
      const projMin = Math.min(proj1, proj2);
      const projMax = Math.max(proj1, proj2);
      // Overlap if projections intersect [0, rlen]
      if (projMax > 0 && projMin < rlen) {
        offsetCount++;
      }
    }
  }

  return offsetCount > 0 ? threshold * offsetCount : 0;
}

// ---------------------------------------------------------------------------
// Two-segment path builder (extracted for reuse)
// ---------------------------------------------------------------------------

interface TwoSegPath {
  a: number;
  b: number;
  d1: Point;
  d2: Point;
}

/** Find the shortest two-segment decomposition along allowed directions. */
function findTwoSegPath(
  vx: number,
  vy: number,
  dirs: Point[],
): TwoSegPath | null {
  let best: TwoSegPath | null = null;
  let bestLen = Infinity;

  for (const d1 of dirs) {
    for (const d2 of dirs) {
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

  return best;
}

// ---------------------------------------------------------------------------
// Three-segment detour builder
// ---------------------------------------------------------------------------

/**
 * Try to find a 3-segment path that avoids all obstacles.
 * Strategy: for each blocking obstacle, try detouring around it by going
 * perpendicular first, then parallel, then back to the destination angle.
 */
/**
 * Compute step distances to try for detour paths around obstacles.
 * Includes distances that would clear each blocking obstacle's bounding box
 * along the given direction, plus fixed fractions of the forward projection.
 */
function detourSteps(
  src: Point,
  dir: Point,
  obstacles: Box[],
  forwardDot: number,
): number[] {
  const steps: number[] = [];

  // Fixed fractions of the forward projection
  for (const frac of [0.3, 0.5, 0.7]) {
    const s = forwardDot * frac;
    if (s > 5) steps.push(s);
  }

  // Distances to clear each obstacle's bounding box along this direction
  for (const obs of obstacles) {
    // Project the obstacle extents onto the direction
    const hw = obs.w / 2 + 10; // margin to clear the box
    const hh = obs.h / 2 + 10;
    const cx = obs.x - src.x;
    const cy = obs.y - src.y;
    const proj = cx * dir.x + cy * dir.y;

    // Clear-before and clear-after distances
    const extentProj = Math.abs(hw * dir.x) + Math.abs(hh * dir.y);
    const before = proj - extentProj;
    const after = proj + extentProj;
    if (before > 5) steps.push(before);
    if (after > 5) steps.push(after);
  }

  return steps.sort((a, b) => a - b);
}

function findDetourPath(
  src: Point,
  dst: Point,
  dirs: Point[],
  obstacles: Box[],
  cornerRadius: number,
  maxLen: number,
): EdgeRoutingResult | null {
  const vx = dst.x - src.x;
  const vy = dst.y - src.y;

  // For each allowed direction as the initial segment:
  // try going in that direction, then routing the remainder as a 2-seg path
  let bestResult: EdgeRoutingResult | null = null;
  let bestLen = maxLen;

  for (const d1 of dirs) {
    const dot = d1.x * vx + d1.y * vy;

    // Allow perpendicular directions (dot ≈ 0) as well as forward ones
    // Only skip directions going strongly backward
    if (dot < -5) continue;

    const steps = detourSteps(src, d1, obstacles, Math.max(dot, 0));

    for (const step of steps) {
      const wp: Point = { x: src.x + d1.x * step, y: src.y + d1.y * step };

      // Find 2-seg path from waypoint to dst
      const rvx = dst.x - wp.x;
      const rvy = dst.y - wp.y;
      const remaining = findTwoSegPath(rvx, rvy, dirs);
      if (!remaining) continue;

      const midPt: Point = {
        x: wp.x + remaining.d1.x * remaining.a,
        y: wp.y + remaining.d1.y * remaining.a,
      };

      const points = [src, wp, midPt, dst];
      if (pathHitsObstacle(points, obstacles)) continue;

      const totalLen = step + remaining.a + remaining.b;
      if (totalLen < bestLen) {
        bestLen = totalLen;
        bestResult = buildMultiSegPath(
          [src, wp, midPt, dst],
          [d1, remaining.d1, remaining.d2],
          cornerRadius,
        );
      }
    }
  }

  return bestResult;
}

/** Build an SVG path with rounded corners for a multi-point polyline. */
function buildMultiSegPath(
  points: Point[],
  _segDirs: Point[],
  cornerRadius: number,
): EdgeRoutingResult {
  if (points.length < 2) {
    return {
      d: `M${points[0].x},${points[0].y}`,
      endDirection: { x: 1, y: 0 },
    };
  }

  const lastDir = {
    x: points[points.length - 1].x - points[points.length - 2].x,
    y: points[points.length - 1].y - points[points.length - 2].y,
  };
  const lastLen = Math.sqrt(lastDir.x * lastDir.x + lastDir.y * lastDir.y);
  const endDirection = lastLen > 0
    ? { x: lastDir.x / lastLen, y: lastDir.y / lastLen }
    : { x: 1, y: 0 };

  if (cornerRadius <= 0 || points.length < 3) {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${points[i].x},${points[i].y}`;
    }
    return { d, endDirection };
  }

  // Build path with arcs at each interior vertex
  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Direction vectors
    const d1x = curr.x - prev.x, d1y = curr.y - prev.y;
    const d2x = next.x - curr.x, d2y = next.y - curr.y;
    const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
    if (len1 < 0.001 || len2 < 0.001) {
      d += ` L${curr.x},${curr.y}`;
      continue;
    }

    const u1x = d1x / len1, u1y = d1y / len1;
    const u2x = d2x / len2, u2y = d2y / len2;

    const dotD = u1x * u2x + u1y * u2y;
    const turnAngle = Math.acos(Math.min(1, Math.max(-1, dotD)));
    const halfTurn = turnAngle / 2;
    const tangentLen = halfTurn > 0.01 ? cornerRadius * Math.tan(halfTurn) : cornerRadius;
    const tl = Math.min(tangentLen, len1 / 2, len2 / 2);

    if (tl <= 0) {
      d += ` L${curr.x},${curr.y}`;
      continue;
    }

    const p1x = curr.x - u1x * tl;
    const p1y = curr.y - u1y * tl;
    const p2x = curr.x + u2x * tl;
    const p2y = curr.y + u2y * tl;

    const crossZ = u1x * u2y - u1y * u2x;
    const sweep = crossZ > 0 ? 1 : 0;

    d += ` L${p1x},${p1y} A${cornerRadius},${cornerRadius} 0 0,${sweep} ${p2x},${p2y}`;
  }

  d += ` L${points[points.length - 1].x},${points[points.length - 1].y}`;

  return { d, endDirection };
}

// ---------------------------------------------------------------------------
// Main routing function
// ---------------------------------------------------------------------------

/**
 * Route a path from src to dst using only allowed angles.
 *
 * Decomposes the displacement into two segments along allowed directions,
 * with optional rounded corners at the bend. When context is provided,
 * avoids routing through obstacle bounding boxes and prevents co-linear
 * overlap with previously routed edges.
 */
export function angularRoute(
  src: Point,
  dst: Point,
  thetas: number[],
  cornerRadius: number,
  ctx?: EdgeRoutingContext,
): EdgeRoutingResult {
  const vx = dst.x - src.x;
  const vy = dst.y - src.y;
  const dist = Math.sqrt(vx * vx + vy * vy);

  if (dist < 0.001) {
    return {
      d: `M${src.x},${src.y} L${dst.x},${dst.y}`,
      endDirection: { x: 1, y: 0 },
    };
  }

  const dirs = expandDirections(thetas);

  // Check if any direction is nearly collinear with displacement → straight line
  for (const d of dirs) {
    const cross = Math.abs(d.x * vy - d.y * vx);
    const dot = d.x * vx + d.y * vy;
    if (cross < 0.5 && dot > 0) {
      // Even for straight lines, check co-linearity and offset if needed
      if (ctx) {
        const offset = colinearOffset(src, dst, ctx.routedPaths);
        if (offset > 0) {
          // Find perpendicular to the travel direction
          const ux = vx / dist, uy = vy / dist;
          const px = -uy, py = ux;
          const mid: Point = {
            x: (src.x + dst.x) / 2 + px * offset,
            y: (src.y + dst.y) / 2 + py * offset,
          };
          return buildMultiSegPath([src, mid, dst], [], cornerRadius);
        }
      }
      return {
        d: `M${src.x},${src.y} L${dst.x},${dst.y}`,
        endDirection: { x: vx / dist, y: vy / dist },
      };
    }
  }

  // Find the best two-segment path
  const best = findTwoSegPath(vx, vy, dirs);

  if (!best) {
    return {
      d: `M${src.x},${src.y} L${dst.x},${dst.y}`,
      endDirection: { x: vx / dist, y: vy / dist },
    };
  }

  const { a, b, d1, d2 } = best;

  // Bend point (where segments meet)
  const mx = src.x + d1.x * a;
  const my = src.y + d1.y * a;

  // Check for obstacle intersection and try detours
  if (ctx) {
    const obs = relevantObstacles(src, dst, ctx.obstacles);
    if (obs.length > 0) {
      const pathPoints = [src, { x: mx, y: my }, dst];
      if (pathHitsObstacle(pathPoints, obs)) {
        // Cap detour length to 1.5x the direct 2-seg path — prefer clipping
        // an obstacle over routing wildly off-course.
        const maxDetour = (a + b) * 1.5;
        const detour = findDetourPath(src, dst, dirs, obs, cornerRadius, maxDetour);
        if (detour) return detour;
      }
    }
  }

  // Check co-linearity for each segment
  if (ctx && ctx.routedPaths.length > 0) {
    const mid: Point = { x: mx, y: my };
    const offset1 = colinearOffset(src, mid, ctx.routedPaths);
    const offset2 = colinearOffset(mid, dst, ctx.routedPaths);

    if (offset1 > 0 || offset2 > 0) {
      // Apply perpendicular nudge to the bend point
      // Use the perpendicular of the first segment for the offset direction
      const seg1Len = Math.sqrt(
        (mid.x - src.x) ** 2 + (mid.y - src.y) ** 2,
      );
      if (seg1Len > 1) {
        const ux = (mid.x - src.x) / seg1Len;
        const uy = (mid.y - src.y) / seg1Len;
        const px = -uy, py = ux;
        const nudge = Math.max(offset1, offset2);
        const nudgedMid: Point = {
          x: mx + px * nudge,
          y: my + py * nudge,
        };
        return buildMultiSegPath([src, nudgedMid, dst], [d1, d2], cornerRadius);
      }
    }
  }

  // Standard two-segment path with optional rounded corner
  const dotD = d1.x * d2.x + d1.y * d2.y;
  const turnAngle = Math.acos(Math.min(1, Math.max(-1, dotD)));
  const halfTurn = turnAngle / 2;
  const tangentLen = halfTurn > 0.01 ? cornerRadius * Math.tan(halfTurn) : cornerRadius;

  const maxTangent = Math.min(a / 2, b / 2);
  const tl = Math.min(tangentLen, maxTangent);

  if (tl <= 0 || cornerRadius <= 0) {
    return {
      d: `M${src.x},${src.y} L${mx},${my} L${dst.x},${dst.y}`,
      endDirection: d2,
    };
  }

  const p1x = mx - d1.x * tl;
  const p1y = my - d1.y * tl;
  const p2x = mx + d2.x * tl;
  const p2y = my + d2.y * tl;

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
 * When scene context is provided, uses it for obstacle avoidance
 * and co-linearity prevention.
 */
export function angularRouter(
  thetas: number[],
  cornerRadius = 0,
): (
  src: Point,
  dst: Point,
  edge: import("../scene/types.ts").CanvasEdge,
  ctx?: EdgeRoutingContext,
) => EdgeRoutingResult {
  return (src, dst, _edge, ctx) => angularRoute(src, dst, thetas, cornerRadius, ctx);
}
