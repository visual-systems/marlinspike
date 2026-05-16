/**
 * Arc geometry — tangent vectors, midpoints, obstacle offsets, and arc clipping.
 *
 * These pure functions compute the geometry of circular arcs used for curved edges.
 */

import type { Point } from "./surface.ts";

/**
 * Unit vector of the path's direction of travel at its endpoint (dst).
 * For straight paths: chord direction. For arcs: circle tangent at dst.
 */
export function pathEndTangent(
  src: Point,
  dst: Point,
  needsArc: boolean,
  _r: number,
  sweep: number,
  arcC?: Point,
): Point {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return { x: 1, y: 0 };
  if (!needsArc) return { x: dx / d, y: dy / d };
  const cx = arcC?.x ?? (src.x + dst.x) / 2;
  const cy = arcC?.y ?? (src.y + dst.y) / 2;
  const rvx = dst.x - cx, rvy = dst.y - cy;
  const tx = sweep === 1 ? -rvy : rvy;
  const ty = sweep === 1 ? rvx : -rvx;
  const tl = Math.sqrt(tx * tx + ty * ty);
  return tl < 0.001 ? { x: dx / d, y: dy / d } : { x: tx / tl, y: ty / tl };
}

/**
 * Geometric midpoint of a circular arc given the arc circle center.
 * For short arcs (< 180°), uses bisector direction from arcC.
 */
export function arcMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  _sweep: number,
  arcC?: Point,
): Point {
  if (!arcC) return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const vsx = x1 - arcC.x, vsy = y1 - arcC.y;
  const vdx = x2 - arcC.x, vdy = y2 - arcC.y;
  const bx = vsx + vdx, by = vsy + vdy;
  const bl = Math.sqrt(bx * bx + by * by);
  if (bl < 0.001) return { x: arcC.x, y: arcC.y + r };
  return { x: arcC.x + r * bx / bl, y: arcC.y + r * by / bl };
}

/**
 * Signed perpendicular offset for obstacle-avoiding arc edges.
 * Returns 0 if no obstruction; non-zero values curve the edge to avoid nodes.
 *
 * @param pa - Edge source position
 * @param pb - Edge destination position
 * @param obstacles - Nodes to avoid (positions with id)
 * @param edgeNodeIds - [fromId, toId] to exclude from obstacle checks
 * @param clearance - Minimum clearance distance in pixels
 * @param lineSdfDistFn - Distance function from point to line segment
 */
export function edgeArcOffset(
  pa: Point,
  pb: Point,
  obstacles: { id: string; x: number; y: number }[],
  edgeNodeIds: [string, string],
  clearance: number,
  lineSdfDistFn: (px: number, py: number, ax: number, ay: number, bx: number, by: number) => number,
): number {
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return 0;

  let bestDist = clearance;
  let bestSign = 0;
  let bestSagitta = 0;

  for (const n of obstacles) {
    if (n.id === edgeNodeIds[0] || n.id === edgeNodeIds[1]) continue;
    const d = lineSdfDistFn(n.x, n.y, pa.x, pa.y, pb.x, pb.y);
    if (d >= clearance || d >= bestDist) continue;
    const cross = (n.x - pa.x) * dy - (n.y - pa.y) * dx;
    bestDist = d;
    bestSign = cross > 0 ? -1 : 1;
    bestSagitta = clearance - d;
  }

  if (bestSagitta < 1) return 0;
  const D = dist / 2;
  if (bestSagitta >= D) return bestSign * D * 0.5;
  const h = (D * D - bestSagitta * bestSagitta) / (2 * bestSagitta);
  return bestSign * h;
}

/**
 * Point where a circular arc (center arcC, radius r) exits a circle
 * (radius clipR, centered at nodeCenter).
 *
 * nodeCenter must lie on the arc circle. Selects the intersection
 * closer to otherCenter.
 */
export function arcClipPoint(
  arcC: Point,
  r: number,
  nodeCenter: Point,
  clipR: number,
  otherCenter: Point,
): Point {
  const dcx = nodeCenter.x - arcC.x;
  const dcy = nodeCenter.y - arcC.y;
  const a = (r * r + r * r - clipR * clipR) / (2 * r);
  const hh = r * r - a * a;
  if (hh < 0 || r < 0.001) {
    const ddx = otherCenter.x - nodeCenter.x;
    const ddy = otherCenter.y - nodeCenter.y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd < 0.001) return nodeCenter;
    return { x: nodeCenter.x + (ddx / dd) * clipR, y: nodeCenter.y + (ddy / dd) * clipR };
  }
  const h = Math.sqrt(hh);
  const mx = arcC.x + a * dcx / r;
  const my = arcC.y + a * dcy / r;
  const px = -dcy / r;
  const py = dcx / r;
  const p1 = { x: mx + h * px, y: my + h * py };
  const p2 = { x: mx - h * px, y: my - h * py };
  const d1sq = (p1.x - otherCenter.x) ** 2 + (p1.y - otherCenter.y) ** 2;
  const d2sq = (p2.x - otherCenter.x) ** 2 + (p2.y - otherCenter.y) ** 2;
  return d1sq < d2sq ? p1 : p2;
}

/**
 * Point where a circular arc (center arcC, radius r) exits an AABB rectangle
 * (center nodeCenter, half-dims halfW × halfH, expanded by gap).
 *
 * Selects the exit point with the smallest angular distance from nodeCenter
 * in the arc's travel direction.
 */
export function arcClipRect(
  arcC: Point,
  r: number,
  nodeCenter: Point,
  halfW: number,
  halfH: number,
  gap: number,
  initialSweep: number,
  otherCenter: Point,
): Point {
  const left = nodeCenter.x - halfW - gap;
  const right = nodeCenter.x + halfW + gap;
  const top = nodeCenter.y - halfH - gap;
  const bottom = nodeCenter.y + halfH + gap;

  const pts: Point[] = [];
  for (const x of [left, right]) {
    const disc = r * r - (x - arcC.x) ** 2;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const y of [arcC.y + sq, arcC.y - sq]) {
      if (y >= top && y <= bottom) pts.push({ x, y });
    }
  }
  for (const y of [top, bottom]) {
    const disc = r * r - (y - arcC.y) ** 2;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const x of [arcC.x + sq, arcC.x - sq]) {
      if (x >= left && x <= right) pts.push({ x, y });
    }
  }

  if (pts.length === 0) {
    const ddx = otherCenter.x - nodeCenter.x;
    const ddy = otherCenter.y - nodeCenter.y;
    const dd = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dd < 0.001) return nodeCenter;
    const tx = Math.abs(ddx) > 0.001 ? halfW / Math.abs(ddx) : Infinity;
    const ty = Math.abs(ddy) > 0.001 ? halfH / Math.abs(ddy) : Infinity;
    const t = Math.min(tx, ty);
    return {
      x: nodeCenter.x + ddx * t + (ddx / dd) * gap,
      y: nodeCenter.y + ddy * t + (ddy / dd) * gap,
    };
  }

  const aFrom = Math.atan2(nodeCenter.y - arcC.y, nodeCenter.x - arcC.x);
  const cw = initialSweep === 1;
  function cwDist(from: number, to: number): number {
    let d = from - to;
    if (d < 0) d += 2 * Math.PI;
    return d;
  }
  function ccwDist(from: number, to: number): number {
    let d = to - from;
    if (d < 0) d += 2 * Math.PI;
    return d;
  }
  const angDist = cw ? cwDist : ccwDist;

  let best = pts[0];
  let bestDist = angDist(aFrom, Math.atan2(pts[0].y - arcC.y, pts[0].x - arcC.x));
  for (const p of pts.slice(1)) {
    const d = angDist(aFrom, Math.atan2(p.y - arcC.y, p.x - arcC.x));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
