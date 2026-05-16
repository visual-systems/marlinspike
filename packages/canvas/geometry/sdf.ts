/**
 * SDF (Signed Distance Field) geometry primitives.
 *
 * Pure geometry queries for circle and rectangle shapes.
 * These are used by layout algorithms for geometry-aware force simulation,
 * and by the canvas for edge-clearance and surface distance queries.
 */

/** Minimal positioned shape for SDF computation. */
export interface SdfShape {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Returns true if the shape should be treated as a circle (near-square aspect ratio). */
export function isCircleShape(shape: SdfShape, threshold: number): boolean {
  const mx = Math.max(shape.w, shape.h);
  if (mx === 0) return true;
  return Math.abs(shape.w - shape.h) / mx < threshold;
}

/**
 * Returns a signed distance function for a shape.
 * Negative inside, zero on surface, positive outside.
 */
export function sdfOf(
  shape: SdfShape,
  threshold: number,
): (px: number, py: number) => number {
  if (isCircleShape(shape, threshold)) {
    const r = shape.w / 2;
    const { x: cx, y: cy } = shape;
    return (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      return Math.sqrt(dx * dx + dy * dy) - r;
    };
  }
  const hw = shape.w / 2;
  const hh = shape.h / 2;
  const { x: cx, y: cy } = shape;
  return (px, py) => {
    const qx = Math.abs(px - cx) - hw;
    const qy = Math.abs(py - cy) - hh;
    return (
      Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
      Math.min(Math.max(qx, qy), 0)
    );
  };
}

/**
 * Maximum extent of a shape in direction (nx, ny).
 * Circle → radius. Rectangle → L1-projected half-extents.
 */
export function supportExtent(
  shape: SdfShape,
  nx: number,
  ny: number,
  threshold: number,
): number {
  if (isCircleShape(shape, threshold)) return shape.w / 2;
  return Math.abs(nx) * shape.w / 2 + Math.abs(ny) * shape.h / 2;
}

/**
 * Directional surface-to-surface distance between two shapes.
 * Negative when overlapping, zero when touching, positive when separated.
 */
export function surfaceToSurface(
  a: SdfShape,
  b: SdfShape,
  threshold: number,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-9) {
    return -(supportExtent(a, 1, 0, threshold) + supportExtent(b, 1, 0, threshold));
  }
  const nx = dx / dist;
  const ny = dy / dist;
  return dist - supportExtent(a, nx, ny, threshold) - supportExtent(b, nx, ny, threshold);
}

/**
 * Normalised SDF gradient at (px, py) via central finite differences.
 * Falls back to (1, 0) for degenerate cases.
 */
export function sdfGradient(
  sdfFn: (px: number, py: number) => number,
  px: number,
  py: number,
  eps: number,
): [number, number] {
  const gx = (sdfFn(px + eps, py) - sdfFn(px - eps, py)) / (2 * eps);
  const gy = (sdfFn(px, py + eps) - sdfFn(px, py - eps)) / (2 * eps);
  const len = Math.sqrt(gx * gx + gy * gy);
  if (len < 1e-9) return [1, 0];
  return [gx / len, gy / len];
}

/**
 * Distance from point (px, py) to line segment (ax, ay)–(bx, by).
 * Always non-negative.
 */
export function lineSdfDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
