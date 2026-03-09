// ---------------------------------------------------------------------------
// SDF force simulation — geometry-aware layout using signed-distance fields
// ---------------------------------------------------------------------------
//
// Replaces point-mass Coulomb repulsion (JANK) with SDF-based forces:
//   - Circle SDF for square/collapsed nodes (leaves render as circles)
//   - Rectangle SDF for expanded composite bounding boxes
//   - Line SDF for edge-clearance repulsion
//   - Virtual bounding circles for inter-component cohesion
//
// ---------------------------------------------------------------------------

import type { ForceNode } from "./force.ts";

// ---------------------------------------------------------------------------
// Config — physics parameters for tickSdfLevel
// ---------------------------------------------------------------------------

export interface SdfPhysicsConfig {
  // Node-node repulsion
  /** Force magnitude at full overlap (nodes coincident) */
  repulsionStrength: number;
  /** Surface-to-surface gap (px) at which repulsion becomes zero */
  restGap: number;
  /** Distance beyond restGap at which repulsion reaches zero */
  maxRepulsionDist: number;
  /** Finite-difference epsilon for SDF gradient calculation */
  sdfGradientEps: number;
  // Edge springs
  /** Hooke spring constant */
  springK: number;
  /** Spring natural rest length in surface-to-surface px (not center-to-center) */
  springRestLength: number;
  // Line SDF (node-from-edge clearance)
  /** Minimum clearance distance from node surface to non-incident edges (px) */
  edgeClearance: number;
  /** Repulsion strength for node-from-edge forces (0 = disabled) */
  edgeRepulsionK: number;
  // Inter-component cohesion
  /** Repulsion strength for virtual bounding circle inter-component forces */
  componentRepulsionK: number;
  // Integration
  /** Velocity damping factor per tick (0–1) */
  damping: number;
  /** Per-tick velocity cap (px/tick) */
  maxVelocity: number;
  // Shape detection
  /** Aspect ratio tolerance below which a node is treated as a circle */
  circleThreshold: number;
}

// ---------------------------------------------------------------------------
// Shape detection
// ---------------------------------------------------------------------------

export function isCircleNode(node: ForceNode, threshold: number): boolean {
  const mx = Math.max(node.w, node.h);
  if (mx === 0) return true;
  return Math.abs(node.w - node.h) / mx < threshold;
}

// ---------------------------------------------------------------------------
// SDF primitives
// ---------------------------------------------------------------------------

/** Returns the SDF function for a node based on its shape. */
export function sdfOf(
  node: ForceNode,
  threshold: number,
): (px: number, py: number) => number {
  if (isCircleNode(node, threshold)) {
    const r = node.w / 2;
    const { x: cx, y: cy } = node;
    return (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      return Math.sqrt(dx * dx + dy * dy) - r;
    };
  } else {
    const hw = node.w / 2;
    const hh = node.h / 2;
    const { x: cx, y: cy } = node;
    return (px, py) => {
      const qx = Math.abs(px - cx) - hw;
      const qy = Math.abs(py - cy) - hh;
      return (
        Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
        Math.min(Math.max(qx, qy), 0)
      );
    };
  }
}

/**
 * Maximum extent of a node's shape in direction (nx, ny).
 * Circle → radius. Rectangle → L1-projected half-extents.
 */
function supportExtent(
  node: ForceNode,
  nx: number,
  ny: number,
  threshold: number,
): number {
  if (isCircleNode(node, threshold)) return node.w / 2;
  return Math.abs(nx) * node.w / 2 + Math.abs(ny) * node.h / 2;
}

/**
 * Directional surface-to-surface distance between two nodes.
 *
 * Measures the gap (or overlap) along the center-to-center direction using
 * each node's support function. Negative when nodes overlap, zero when
 * surfaces touch, positive when separated.
 *
 * The "probe-centre" formula (sdfOf(a)(b.centre) + sdfOf(b)(a.centre)) / 2
 * returns positive values even when box edges cross but centres are still
 * outside each other — causing repulsion to never trigger and the spring to
 * pull overlapping groups even closer. This formula is correct in all cases.
 */
export function surfaceToSurface(
  a: ForceNode,
  b: ForceNode,
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

// ---------------------------------------------------------------------------
// Line SDF — for edge-clearance forces and edge routing
// ---------------------------------------------------------------------------

/**
 * Distance from point (px, py) to the line segment (ax, ay)–(bx, by).
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

/**
 * Normalised direction pushing (px, py) away from line segment (ax, ay)–(bx, by).
 * Returns the outward normal from the nearest point on the segment.
 */
export function lineSdfGrad(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    const ex = px - ax;
    const ey = py - ay;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-9) return [0, 1];
    return [ex / len, ey / len];
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  const len = Math.sqrt(ex * ex + ey * ey);
  if (len < 1e-9) {
    // Point is on the segment — use perpendicular to segment direction
    const segLen = Math.sqrt(lenSq);
    return [-dy / segLen, dx / segLen];
  }
  return [ex / len, ey / len];
}

/**
 * Compute the point on segment (ax, ay)–(bx, by) closest to (px, py),
 * used for bent edge rendering. Returns the parameter t ∈ [0, 1] and
 * the closest point coordinates.
 */
export function lineClosestPoint(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { t: number; cx: number; cy: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { t: 0, cx: ax, cy: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { t, cx: ax + t * dx, cy: ay + t * dy };
}

// ---------------------------------------------------------------------------
// Connected components — BFS over edge list
// ---------------------------------------------------------------------------

export function connectedComponents(
  ids: string[],
  edges: { a: string; b: string }[],
): string[][] {
  const idSet = new Set(ids);
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (idSet.has(e.a) && idSet.has(e.b)) {
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const queue: string[] = [id];
    visited.add(id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      for (const neighbour of adj.get(curr) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    components.push(component);
  }
  return components;
}

// ---------------------------------------------------------------------------
// tickSdfLevel — one two-phase simulation step
// ---------------------------------------------------------------------------

export function tickSdfLevel(
  nodes: ForceNode[],
  edges: { a: string; b: string }[],
  config: SdfPhysicsConfig,
): ForceNode[] {
  if (nodes.length === 0) return nodes;

  const {
    repulsionStrength,
    restGap,
    maxRepulsionDist,
    sdfGradientEps,
    springK,
    springRestLength,
    edgeClearance,
    edgeRepulsionK,
    componentRepulsionK,
    damping,
    maxVelocity: maxV,
    circleThreshold,
  } = config;

  // Mutable working copy
  const map = new Map<string, ForceNode>();
  for (const n of nodes) map.set(n.id, { ...n });
  const ids = nodes.map((n) => n.id);

  // ── Phase 1: intra-level forces ──────────────────────────────────────────

  // Node-node SDF repulsion (all pairs)
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = map.get(ids[i])!;
      const b = map.get(ids[j])!;
      const s = surfaceToSurface(a, b, circleThreshold);
      if (s >= restGap + maxRepulsionDist) continue;
      const t = 1 - Math.max(s - restGap, 0) / maxRepulsionDist;
      const mag = repulsionStrength * t * t;
      // Gradient of a's SDF at b's centre → direction b should move to escape a
      const [gx, gy] = sdfGradient(
        sdfOf(a, circleThreshold),
        b.x,
        b.y,
        sdfGradientEps,
      );
      if (!a.pinned) {
        a.vx -= gx * mag;
        a.vy -= gy * mag;
      }
      if (!b.pinned) {
        b.vx += gx * mag;
        b.vy += gy * mag;
      }
    }
  }

  // Edge springs — surface-to-surface Hooke, center-to-center direction
  for (const e of edges) {
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (!a || !b) continue;
    const s = surfaceToSurface(a, b, circleThreshold);
    const force = springK * (s - springRestLength);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const nx = dx / dist;
    const ny = dy / dist;
    if (!a.pinned) {
      a.vx += nx * force;
      a.vy += ny * force;
    }
    if (!b.pinned) {
      b.vx -= nx * force;
      b.vy -= ny * force;
    }
  }

  // Line SDF — push nodes away from non-incident edges
  if (edgeRepulsionK > 0) {
    for (const e of edges) {
      const ea = map.get(e.a);
      const eb = map.get(e.b);
      if (!ea || !eb) continue;
      for (const id of ids) {
        if (id === e.a || id === e.b) continue;
        const n = map.get(id)!;
        const d = lineSdfDist(n.x, n.y, ea.x, ea.y, eb.x, eb.y);
        if (d >= edgeClearance) continue;
        const t = 1 - d / edgeClearance;
        const mag = edgeRepulsionK * t;
        const [gx, gy] = lineSdfGrad(n.x, n.y, ea.x, ea.y, eb.x, eb.y);
        if (!n.pinned) {
          n.vx += gx * mag;
          n.vy += gy * mag;
        }
      }
    }
  }

  // ── Phase 2: inter-component forces (virtual bounding circles) ───────────

  if (componentRepulsionK > 0) {
    const components = connectedComponents(ids, edges);

    if (components.length > 1) {
      interface VComp {
        cx: number;
        cy: number;
        r: number;
        ids: string[];
      }

      const virtuals: VComp[] = components.map((comp) => {
        if (comp.length === 1) {
          const n = map.get(comp[0])!;
          const r = Math.sqrt(n.w * n.w + n.h * n.h) / 2;
          return { cx: n.x, cy: n.y, r, ids: comp };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of comp) {
          const n = map.get(id)!;
          minX = Math.min(minX, n.x - n.w / 2);
          minY = Math.min(minY, n.y - n.h / 2);
          maxX = Math.max(maxX, n.x + n.w / 2);
          maxY = Math.max(maxY, n.y + n.h / 2);
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        // Circumscribed circle radius
        const r = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2;
        return { cx, cy, r, ids: comp };
      });

      for (let i = 0; i < virtuals.length; i++) {
        for (let j = i + 1; j < virtuals.length; j++) {
          const va = virtuals[i];
          const vb = virtuals[j];
          const dx = vb.cx - va.cx;
          const dy = vb.cy - va.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const s2s = dist - va.r - vb.r;
          if (s2s >= restGap + maxRepulsionDist) continue;
          const t = 1 - Math.max(s2s - restGap, 0) / maxRepulsionDist;
          const mag = componentRepulsionK * t * t;
          const nx = dist > 1e-9 ? dx / dist : 1;
          const ny = dist > 1e-9 ? dy / dist : 0;
          // Distribute force equally across all real nodes in each component
          const forcePerA = mag / va.ids.length;
          const forcePerB = mag / vb.ids.length;
          for (const id of va.ids) {
            const n = map.get(id)!;
            if (!n.pinned) {
              n.vx -= nx * forcePerA;
              n.vy -= ny * forcePerA;
            }
          }
          for (const id of vb.ids) {
            const n = map.get(id)!;
            if (!n.pinned) {
              n.vx += nx * forcePerB;
              n.vy += ny * forcePerB;
            }
          }
        }
      }
    }
  }

  // ── Integration ──────────────────────────────────────────────────────────

  const result: ForceNode[] = [];
  for (const n of map.values()) {
    if (n.pinned) {
      result.push({ ...n, vx: 0, vy: 0 });
    } else {
      const vx = Math.max(-maxV, Math.min(maxV, n.vx * damping));
      const vy = Math.max(-maxV, Math.min(maxV, n.vy * damping));
      result.push({ ...n, x: n.x + vx, y: n.y + vy, vx, vy });
    }
  }

  // Preserve original node order
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return result;
}
