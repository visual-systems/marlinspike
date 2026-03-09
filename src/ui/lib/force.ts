/// <reference lib="dom" />
// ---------------------------------------------------------------------------
// Force simulation — pure functions, no DOM/JSX dependencies
// ---------------------------------------------------------------------------

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  /** Effective body width for repulsion calculations */
  w: number;
  /** Effective body height for repulsion calculations */
  h: number;
}

// ---------------------------------------------------------------------------
// ForceConfig — tuneable simulation parameters
// ---------------------------------------------------------------------------

export interface ForceConfig {
  /** Coulomb repulsion constant */
  repulsion: number;
  /** Max repulsion force per tick — prevents instability when nodes overlap */
  maxForce: number;
  /** Hooke's spring constant along edges */
  springK: number;
  /** Spring natural resting length (px) */
  springL: number;
  /** Velocity damping factor per tick (0–1) */
  damping: number;
}

export const DEFAULT_FORCE_CONFIG: ForceConfig = {
  repulsion: 20_000,
  maxForce: 25,
  springK: 0.04,
  springL: 160,
  damping: 0.82,
};

// ---------------------------------------------------------------------------
// tickLevel — one simulation step for a flat set of siblings
// ---------------------------------------------------------------------------

export function tickLevel(
  nodes: ForceNode[],
  edges: { a: string; b: string }[],
  config: ForceConfig = DEFAULT_FORCE_CONFIG,
): ForceNode[] {
  const { repulsion, maxForce, springK, springL, damping } = config;
  if (nodes.length === 0) return nodes;

  // Copy into a mutable map
  const map = new Map<string, ForceNode>();
  for (const n of nodes) map.set(n.id, { ...n });

  const ids = nodes.map((n) => n.id);

  // Repulsion between all pairs — inverse-square with force cap
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = map.get(ids[i])!;
      const b = map.get(ids[j])!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = Math.max(dx * dx + dy * dy, 1);
      const dist = Math.sqrt(distSq);
      const force = Math.min(repulsion / distSq, maxForce);
      const nx = dx / dist;
      const ny = dy / dist;
      if (!a.pinned) {
        a.vx -= nx * force;
        a.vy -= ny * force;
      }
      if (!b.pinned) {
        b.vx += nx * force;
        b.vy += ny * force;
      }
    }
  }

  // Spring attraction along edges
  for (const e of edges) {
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const force = springK * (dist - springL);
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

  // Apply damping and update positions
  const result: ForceNode[] = [];
  for (const n of map.values()) {
    if (n.pinned) {
      result.push({ ...n, vx: 0, vy: 0 });
    } else {
      const vx = n.vx * damping;
      const vy = n.vy * damping;
      result.push({ ...n, x: n.x + vx, y: n.y + vy, vx, vy });
    }
  }

  // Preserve original order
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return result;
}

// ---------------------------------------------------------------------------
// maxVelocity — for settlement detection
// ---------------------------------------------------------------------------

export function maxVelocity(nodes: ForceNode[]): number {
  let max = 0;
  for (const n of nodes) {
    const v = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (v > max) max = v;
  }
  return max;
}

// ---------------------------------------------------------------------------
// boundingBox — bounding box of a set of positioned nodes
// Returns the min corner and total dimensions including body size.
// ---------------------------------------------------------------------------

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

export function boundingBox(nodes: ForceNode[], padding: number): BBox {
  if (nodes.length === 0) {
    return { minX: -40, minY: -30, maxX: 40, maxY: 30, w: 80 + padding * 2, h: 60 + padding * 2 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2,
  };
}

// ---------------------------------------------------------------------------
// initPositions — deterministic circular arrangement centred at (0, 0)
// ---------------------------------------------------------------------------

export function initPositions(
  ids: string[],
  spread: number,
  defaults: Map<string, { x: number; y: number; pinned?: boolean }>,
  leafW: number,
  leafH: number,
): ForceNode[] {
  return ids.map((id, i): ForceNode => {
    const d = defaults.get(id);
    if (d) {
      return { id, x: d.x, y: d.y, vx: 0, vy: 0, pinned: d.pinned ?? false, w: leafW, h: leafH };
    }
    const angle = ids.length === 1 ? 0 : (2 * Math.PI * i) / ids.length;
    const r = ids.length === 1 ? 0 : spread;
    return {
      id,
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
      vx: 0,
      vy: 0,
      pinned: false,
      w: leafW,
      h: leafH,
    };
  });
}
