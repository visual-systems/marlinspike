/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import { type BBox, boundingBox, centerNodes, type ForceNode, maxVelocity } from "../lib/force.ts";
import {
  type AlgorithmId,
  createJANK,
  createSDF,
  createTOPOGRID,
  DEFAULT_JANK_CONFIG,
  DEFAULT_SDF_CONFIG,
  DEFAULT_TOPOGRID_CONFIG,
  type LayoutAlgorithm,
} from "../lib/algorithms/index.ts";
import {
  connectedComponents,
  isCircleNode,
  lineClosestPoint,
  lineSdfDist,
} from "../lib/sdf-force.ts";

export const meta = { title: "Layout" };

// ---------------------------------------------------------------------------
// Rendering constants (not tunable via JSON — structural layout params)
// ---------------------------------------------------------------------------

const GROUP_PADDING = 32;
const LABEL_H = 22;

// ---------------------------------------------------------------------------
// Config — flat object covering params for all algorithms
// ---------------------------------------------------------------------------

interface LayoutConfig {
  /** Circle radius (shared) */
  leafR: number;
  // JANK params
  spread: number;
  settleV: number;
  repulsion: number;
  maxForce: number;
  springK: number;
  springL: number;
  damping: number;
  // TOPOGRID params
  hSpacing: number;
  vSpacing: number;
  // SDF params
  sdfRepulsionStrength: number;
  sdfRestGap: number;
  sdfMaxRepulsionDist: number;
  sdfGradientEps: number;
  sdfSpringK: number;
  sdfSpringRestLength: number;
  sdfEdgeClearance: number;
  sdfEdgeRepulsionK: number;
  sdfComponentRepulsionK: number;
  sdfDamping: number;
  sdfMaxVelocity: number;
  sdfCircleThreshold: number;
  sdfSettleV: number;
  sdfMaxTicks: number;
  /** Show component bounding circles as a debug overlay (SDF only) */
  sdfShowComponents: boolean;
  /** Draw each node's SDF shape (circle or rect) as a translucent overlay (SDF only) */
  sdfShowSdfs: boolean;
}

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  leafR: 26,
  spread: DEFAULT_JANK_CONFIG.spread,
  settleV: DEFAULT_JANK_CONFIG.settleV,
  repulsion: DEFAULT_JANK_CONFIG.repulsion,
  maxForce: DEFAULT_JANK_CONFIG.maxForce,
  springK: DEFAULT_JANK_CONFIG.springK,
  springL: DEFAULT_JANK_CONFIG.springL,
  damping: DEFAULT_JANK_CONFIG.damping,
  hSpacing: DEFAULT_TOPOGRID_CONFIG.hSpacing,
  vSpacing: DEFAULT_TOPOGRID_CONFIG.vSpacing,
  sdfRepulsionStrength: DEFAULT_SDF_CONFIG.repulsionStrength,
  sdfRestGap: DEFAULT_SDF_CONFIG.restGap,
  sdfMaxRepulsionDist: DEFAULT_SDF_CONFIG.maxRepulsionDist,
  sdfGradientEps: DEFAULT_SDF_CONFIG.sdfGradientEps,
  sdfSpringK: DEFAULT_SDF_CONFIG.springK,
  sdfSpringRestLength: DEFAULT_SDF_CONFIG.springRestLength,
  sdfEdgeClearance: DEFAULT_SDF_CONFIG.edgeClearance,
  sdfEdgeRepulsionK: DEFAULT_SDF_CONFIG.edgeRepulsionK,
  sdfComponentRepulsionK: DEFAULT_SDF_CONFIG.componentRepulsionK,
  sdfDamping: DEFAULT_SDF_CONFIG.damping,
  sdfMaxVelocity: DEFAULT_SDF_CONFIG.maxVelocity,
  sdfCircleThreshold: DEFAULT_SDF_CONFIG.circleThreshold,
  sdfSettleV: DEFAULT_SDF_CONFIG.settleV,
  sdfMaxTicks: DEFAULT_SDF_CONFIG.maxTicks,
  sdfShowComponents: false,
  sdfShowSdfs: false,
};

function makeAlgorithm(id: AlgorithmId, cfg: LayoutConfig): LayoutAlgorithm {
  if (id === "TOPOGRID") return createTOPOGRID({ hSpacing: cfg.hSpacing, vSpacing: cfg.vSpacing });
  if (id === "SDF") {
    return createSDF({
      repulsionStrength: cfg.sdfRepulsionStrength,
      restGap: cfg.sdfRestGap,
      maxRepulsionDist: cfg.sdfMaxRepulsionDist,
      sdfGradientEps: cfg.sdfGradientEps,
      springK: cfg.sdfSpringK,
      springRestLength: cfg.sdfSpringRestLength,
      edgeClearance: cfg.sdfEdgeClearance,
      edgeRepulsionK: cfg.sdfEdgeRepulsionK,
      componentRepulsionK: cfg.sdfComponentRepulsionK,
      damping: cfg.sdfDamping,
      maxVelocity: cfg.sdfMaxVelocity,
      circleThreshold: cfg.sdfCircleThreshold,
      spread: cfg.spread,
      settleV: cfg.sdfSettleV,
      maxTicks: Infinity, // story runs until user pauses
    });
  }
  return createJANK({
    spread: cfg.spread,
    settleV: cfg.settleV,
    maxTicks: Infinity, // story runs until user pauses
    repulsion: cfg.repulsion,
    maxForce: cfg.maxForce,
    springK: cfg.springK,
    springL: cfg.springL,
    damping: cfg.damping,
  });
}

// ---------------------------------------------------------------------------
// Dataset types — NodeDef supports optional children for subgraph datasets
// ---------------------------------------------------------------------------

interface NodeDef {
  id: string;
  label: string;
  /** Child nodes — makes this a composite (expanded group) */
  children?: NodeDef[];
  /** Edges connecting children within this composite */
  edges?: { id: string; a: string; b: string }[];
}

interface Dataset {
  name: string;
  nodes: NodeDef[];
  edges: { id: string; a: string; b: string }[];
}

// ---------------------------------------------------------------------------
// Sample datasets
// ---------------------------------------------------------------------------

const DATASETS: Dataset[] = [
  {
    name: "Triangle (3 nodes)",
    nodes: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
    ],
    edges: [
      { id: "ab", a: "a", b: "b" },
      { id: "bc", a: "b", b: "c" },
      { id: "ac", a: "a", b: "c" },
    ],
  },
  {
    name: "Ring (6 nodes)",
    nodes: ["A", "B", "C", "D", "E", "F"].map((label, i) => ({
      id: String(i),
      label,
    })),
    edges: [
      { id: "01", a: "0", b: "1" },
      { id: "12", a: "1", b: "2" },
      { id: "23", a: "2", b: "3" },
      { id: "34", a: "3", b: "4" },
      { id: "45", a: "4", b: "5" },
      { id: "50", a: "5", b: "0" },
    ],
  },
  {
    name: "Star (7 nodes)",
    nodes: [
      { id: "c", label: "Hub" },
      ...(["A", "B", "C", "D", "E", "F"].map((label, i) => ({
        id: String(i),
        label,
      }))),
    ],
    edges: [0, 1, 2, 3, 4, 5].map((i) => ({
      id: `c${i}`,
      a: "c",
      b: String(i),
    })),
  },
  {
    name: "Grid (9 nodes)",
    nodes: Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      label: String(i),
    })),
    edges: [
      // rows
      { id: "01", a: "0", b: "1" },
      { id: "12", a: "1", b: "2" },
      { id: "34", a: "3", b: "4" },
      { id: "45", a: "4", b: "5" },
      { id: "67", a: "6", b: "7" },
      { id: "78", a: "7", b: "8" },
      // cols
      { id: "03", a: "0", b: "3" },
      { id: "36", a: "3", b: "6" },
      { id: "14", a: "1", b: "4" },
      { id: "47", a: "4", b: "7" },
      { id: "25", a: "2", b: "5" },
      { id: "58", a: "5", b: "8" },
    ],
  },
  {
    name: "No edges (5 nodes)",
    nodes: Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      label: `N${i}`,
    })),
    edges: [],
  },
  {
    name: "Dense (10 nodes, 15 edges)",
    nodes: Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      label: `N${i}`,
    })),
    edges: [
      { id: "e0", a: "0", b: "1" },
      { id: "e1", a: "0", b: "2" },
      { id: "e2", a: "0", b: "5" },
      { id: "e3", a: "1", b: "3" },
      { id: "e4", a: "1", b: "4" },
      { id: "e5", a: "2", b: "6" },
      { id: "e6", a: "2", b: "7" },
      { id: "e7", a: "3", b: "8" },
      { id: "e8", a: "4", b: "9" },
      { id: "e9", a: "5", b: "6" },
      { id: "e10", a: "6", b: "9" },
      { id: "e11", a: "7", b: "8" },
      { id: "e12", a: "8", b: "9" },
      { id: "e13", a: "3", b: "5" },
      { id: "e14", a: "4", b: "7" },
    ],
  },
  // --- Subgraph datasets ---
  {
    name: "Two Groups",
    nodes: [
      {
        id: "ga",
        label: "Group A",
        children: [
          { id: "ga1", label: "P" },
          { id: "ga2", label: "Q" },
          { id: "ga3", label: "R" },
        ],
        edges: [
          { id: "pq", a: "ga1", b: "ga2" },
          { id: "qr", a: "ga2", b: "ga3" },
        ],
      },
      {
        id: "gb",
        label: "Group B",
        children: [
          { id: "gb1", label: "X" },
          { id: "gb2", label: "Y" },
          { id: "gb3", label: "Z" },
          { id: "gb4", label: "W" },
        ],
        edges: [
          { id: "xy", a: "gb1", b: "gb2" },
          { id: "yz", a: "gb2", b: "gb3" },
          { id: "zw", a: "gb3", b: "gb4" },
          { id: "wx", a: "gb4", b: "gb1" },
        ],
      },
    ],
    edges: [{ id: "ab", a: "ga", b: "gb" }],
  },
  {
    name: "Mixed (groups + leaves)",
    nodes: [
      { id: "l1", label: "Leaf 1" },
      { id: "l2", label: "Leaf 2" },
      { id: "l3", label: "Leaf 3" },
      {
        id: "mod",
        label: "Module",
        children: [
          { id: "m1", label: "A" },
          { id: "m2", label: "B" },
          { id: "m3", label: "C" },
          { id: "m4", label: "D" },
        ],
        edges: [
          { id: "m12", a: "m1", b: "m2" },
          { id: "m23", a: "m2", b: "m3" },
          { id: "m34", a: "m3", b: "m4" },
          { id: "m41", a: "m4", b: "m1" },
          { id: "m13", a: "m1", b: "m3" },
        ],
      },
      {
        id: "svc",
        label: "Service",
        children: [
          { id: "s1", label: "In" },
          { id: "s2", label: "Out" },
        ],
        edges: [{ id: "s12", a: "s1", b: "s2" }],
      },
    ],
    edges: [
      { id: "l1mod", a: "l1", b: "mod" },
      { id: "modsvc", a: "mod", b: "svc" },
      { id: "svcl2", a: "svc", b: "l2" },
      { id: "l3svc", a: "l3", b: "svc" },
    ],
  },
  {
    name: "Deep nest (3 levels)",
    nodes: [
      {
        id: "outer",
        label: "Outer",
        children: [
          {
            id: "inner",
            label: "Inner",
            children: [
              { id: "d1", label: "D1" },
              { id: "d2", label: "D2" },
              { id: "d3", label: "D3" },
              { id: "d4", label: "D4" },
            ],
            edges: [
              { id: "d12", a: "d1", b: "d2" },
              { id: "d23", a: "d2", b: "d3" },
              { id: "d34", a: "d3", b: "d4" },
              { id: "d41", a: "d4", b: "d1" },
            ],
          },
          { id: "sib1", label: "Sibling 1" },
          { id: "sib2", label: "Sibling 2" },
        ],
        edges: [
          { id: "is1", a: "inner", b: "sib1" },
          { id: "is2", a: "inner", b: "sib2" },
          { id: "s12", a: "sib1", b: "sib2" },
        ],
      },
      { id: "solo", label: "Solo" },
      { id: "peer", label: "Peer" },
    ],
    edges: [
      { id: "op", a: "outer", b: "peer" },
      { id: "ps", a: "peer", b: "solo" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Multi-level simulation state
// ---------------------------------------------------------------------------

interface LevelState {
  nodes: ForceNode[];
  ticks: number;
  bbox: BBox | null;
}

/** parentId → LevelState. Root level keyed by "". */
type SimState = Map<string, LevelState>;

/** Return all composite NodeDefs in post-order (deepest first). */
function postOrderComposites(nodes: NodeDef[]): NodeDef[] {
  const result: NodeDef[] = [];
  for (const n of nodes) {
    if (n.children?.length) {
      result.push(...postOrderComposites(n.children));
      result.push(n);
    }
  }
  return result;
}

/** Find the parent level key for a composite node id. Returns null if root-level. */
function findParentLevel(nodes: NodeDef[], targetId: string): string | null {
  for (const n of nodes) {
    if (n.children) {
      for (const c of n.children) {
        if (c.id === targetId) return n.id;
      }
      const found = findParentLevel(n.children, targetId);
      if (found !== null) return found;
    }
  }
  return null;
}

function initSim(
  dataset: Dataset,
  cfg: LayoutConfig,
  algorithm: LayoutAlgorithm,
): SimState {
  const map = new Map<string, LevelState>();
  const d = cfg.leafR * 2;

  function initLevel(
    parentId: string,
    nodes: NodeDef[],
    levelEdges: { a: string; b: string }[],
  ): void {
    const ids = nodes.map((n) => n.id);
    const forceNodes = algorithm.initNodes(ids, levelEdges, d, d, new Map());
    map.set(parentId, { nodes: forceNodes, ticks: 0, bbox: null });
    for (const node of nodes) {
      if (node.children?.length) {
        initLevel(node.id, node.children, node.edges ?? []);
      }
    }
  }

  initLevel("", dataset.nodes, dataset.edges);
  return map;
}

function tickSim(
  prev: SimState,
  dataset: Dataset,
  cfg: LayoutConfig,
  algorithm: LayoutAlgorithm,
): SimState {
  const next = new Map(prev);
  const d = cfg.leafR * 2;

  // Tick deepest levels first so parent sizes are updated before parent ticks
  for (const composite of postOrderComposites(dataset.nodes)) {
    const level = next.get(composite.id);
    if (!level) continue;

    const edges = composite.edges ?? [];
    const { nodes: ticked } = algorithm.tick(level.nodes, edges, level.ticks);
    const centered = centerNodes(ticked);
    const bb = boundingBox(centered, GROUP_PADDING);
    next.set(composite.id, { nodes: centered, ticks: level.ticks + 1, bbox: bb });

    // Propagate updated size up to parent level
    const parentId = findParentLevel(dataset.nodes, composite.id) ?? "";
    const parentLevel = next.get(parentId);
    if (parentLevel) {
      const gw = Math.max(bb.w, d * 2 + GROUP_PADDING);
      const gh = Math.max(bb.h + LABEL_H, d * 2 + GROUP_PADDING);
      next.set(parentId, {
        ...parentLevel,
        nodes: parentLevel.nodes.map((fn) => fn.id === composite.id ? { ...fn, w: gw, h: gh } : fn),
      });
    }
  }

  // Tick root
  const rootLevel = next.get("")!;
  const { nodes: rootTicked } = algorithm.tick(rootLevel.nodes, dataset.edges, rootLevel.ticks);
  const rootBb = boundingBox(rootTicked, GROUP_PADDING);
  next.set("", { nodes: rootTicked, ticks: rootLevel.ticks + 1, bbox: rootBb });

  return next;
}

// ---------------------------------------------------------------------------
// Recursive SVG rendering
// ---------------------------------------------------------------------------

/**
 * Compute bent edge path points for an edge (a→b) avoiding non-incident nodes.
 * Returns [ax, ay, bx, by] for a straight line, or [ax, ay, mx, my, bx, by]
 * when a node obstructs the edge within clearance.
 */
function bentEdgePoints(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  levelNodes: Array<{ id: string; x: number; y: number }>,
  edgeNodeIds: [string, string],
  clearance: number,
): number[] {
  let bestDist = clearance;
  let bestT = 0.5;
  let bestGx = 0;
  let bestGy = 0;
  let bestBendMag = 0;

  for (const n of levelNodes) {
    if (n.id === edgeNodeIds[0] || n.id === edgeNodeIds[1]) continue;
    const d = lineSdfDist(n.x, n.y, ax, ay, bx, by);
    if (d >= clearance || d >= bestDist) continue;
    const { t, cx, cy } = lineClosestPoint(n.x, n.y, ax, ay, bx, by);
    // Perpendicular direction away from n, at the closest point on segment
    const ex = cx - n.x;
    const ey = cy - n.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    if (len < 1e-9) continue;
    bestDist = d;
    bestT = t;
    bestGx = ex / len;
    bestGy = ey / len;
    bestBendMag = clearance - d;
  }

  if (bestBendMag === 0) return [ax, ay, bx, by];

  // Bend point at parameter bestT along the segment, displaced perpendicularly
  const bendX = ax + bestT * (bx - ax) + bestGx * bestBendMag;
  const bendY = ay + bestT * (by - ay) + bestGy * bestBendMag;
  return [ax, ay, bendX, bendY, bx, by];
}

function renderLevel(
  parentId: string,
  nodes: NodeDef[],
  edges: { id: string; a: string; b: string }[],
  sim: SimState,
  cfg: LayoutConfig,
  algorithmId: AlgorithmId,
  invScale: number,
) {
  const level = sim.get(parentId);
  if (!level) return null;
  const posMap = new Map(level.nodes.map((n) => [n.id, n]));
  const r = cfg.leafR;
  const useSdf = algorithmId === "SDF";

  return (
    <>
      {/* Composite group boxes + their children (behind edges and circles) */}
      {nodes.filter((n) => n.children?.length).map((n) => {
        const pos = posMap.get(n.id);
        if (!pos) return null;
        const childLevel = sim.get(n.id);
        const bb = childLevel?.bbox;
        if (!bb) return null;
        return (
          <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`}>
            <rect
              x={bb.minX}
              y={bb.minY - LABEL_H}
              width={bb.w}
              height={bb.h + LABEL_H}
              fill="#08081a"
              stroke="#303060"
              stroke-width={invScale}
              rx={4}
            />
            <text
              x={bb.minX + 6}
              y={bb.minY - 6}
              fill="#4a4a6a"
              font-size={9}
              style="user-select:none; pointer-events:none;"
            >
              {n.label}
            </text>
            {renderLevel(
              n.id,
              n.children!,
              n.edges ?? [],
              sim,
              cfg,
              algorithmId,
              invScale,
            )}
          </g>
        );
      })}
      {/* Edges (on top of group boxes) — bent when SDF is active */}
      {edges.map((e) => {
        const a = posMap.get(e.a);
        const b = posMap.get(e.b);
        if (!a || !b) return null;
        if (useSdf && cfg.sdfEdgeClearance > 0) {
          const pts = bentEdgePoints(
            a.x,
            a.y,
            b.x,
            b.y,
            level.nodes,
            [e.a, e.b],
            cfg.sdfEdgeClearance,
          );
          const pointsStr = pts.reduce(
            (acc, v, i) => acc + (i % 2 === 0 ? (i === 0 ? "" : " ") + v : "," + v),
            "",
          );
          return (
            <polyline
              key={e.id}
              points={pointsStr}
              fill="none"
              stroke="#2a2a50"
              stroke-width={invScale}
            />
          );
        }
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#2a2a50"
            stroke-width={invScale}
          />
        );
      })}
      {/* SDF debug: component bounding circles */}
      {useSdf && cfg.sdfShowComponents && parentId === "" && (() => {
        const ids = level.nodes.map((n) => n.id);
        const edgesAB = edges.map((e) => ({ a: e.a, b: e.b }));
        const comps = connectedComponents(ids, edgesAB);
        return comps.map((comp, i) => {
          if (comp.length === 1) {
            const n = posMap.get(comp[0]);
            if (!n) return null;
            const cr = Math.sqrt(n.w * n.w + n.h * n.h) / 2;
            return (
              <circle
                key={`comp-${i}`}
                cx={n.x}
                cy={n.y}
                r={cr}
                fill="none"
                stroke="#3a5a3a"
                stroke-width={invScale}
                stroke-dasharray={`${4 * invScale},${4 * invScale}`}
                opacity={0.5}
              />
            );
          }
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const id of comp) {
            const n = posMap.get(id);
            if (!n) continue;
            minX = Math.min(minX, n.x - n.w / 2);
            minY = Math.min(minY, n.y - n.h / 2);
            maxX = Math.max(maxX, n.x + n.w / 2);
            maxY = Math.max(maxY, n.y + n.h / 2);
          }
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const cr = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2;
          return (
            <circle
              key={`comp-${i}`}
              cx={cx}
              cy={cy}
              r={cr}
              fill="none"
              stroke="#3a5a3a"
              stroke-width={invScale}
              stroke-dasharray={`${4 * invScale},${4 * invScale}`}
              opacity={0.5}
            />
          );
        });
      })()}
      {/* SDF debug: draw each node's SDF shape (zero-level set) as a translucent overlay */}
      {useSdf && cfg.sdfShowSdfs && (() => {
        const palette = [
          "#ff5555",
          "#55ff55",
          "#5599ff",
          "#ffff44",
          "#ff55ff",
          "#55ffff",
          "#ff9944",
          "#aa55ff",
          "#ff4499",
          "#44ffaa",
        ];
        return level.nodes.map((fn, i) => {
          const color = palette[i % palette.length];
          if (isCircleNode(fn, cfg.sdfCircleThreshold)) {
            return (
              <circle
                key={`sdf-${fn.id}`}
                cx={fn.x}
                cy={fn.y}
                r={fn.w / 2}
                fill={color}
                opacity={0.18}
                stroke={color}
                stroke-width={invScale * 1.5}
                stroke-opacity={0.6}
              />
            );
          }
          return (
            <rect
              key={`sdf-${fn.id}`}
              x={fn.x - fn.w / 2}
              y={fn.y - fn.h / 2}
              width={fn.w}
              height={fn.h}
              fill={color}
              opacity={0.18}
              stroke={color}
              stroke-width={invScale * 1.5}
              stroke-opacity={0.6}
            />
          );
        });
      })()}
      {/* Leaf nodes and composites without a bbox yet */}
      {nodes.map((n) => {
        const pos = posMap.get(n.id);
        if (!pos) return null;
        // Composites with a computed bbox are rendered as group rects above
        if (n.children?.length && sim.get(n.id)?.bbox) return null;
        return (
          <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`}>
            <circle
              cx={0}
              cy={0}
              r={r}
              fill="#141430"
              stroke="#303060"
              stroke-width={1}
            />
            <text
              x={0}
              y={3}
              text-anchor="middle"
              fill="#777799"
              font-size={10}
              style="user-select:none; pointer-events:none;"
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Configurator story
// ---------------------------------------------------------------------------

export function Configurator() {
  const [datasetIdx, setDatasetIdx] = useState(0);
  const [algorithmId, setAlgorithmId] = useState<AlgorithmId>("JANK");
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  const [configText, setConfigText] = useState(
    () => JSON.stringify(DEFAULT_LAYOUT_CONFIG, null, 2),
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [sim, setSim] = useState<SimState>(() =>
    initSim(DATASETS[0], DEFAULT_LAYOUT_CONFIG, makeAlgorithm("JANK", DEFAULT_LAYOUT_CONFIG))
  );
  const [paused, setPaused] = useState(false);

  // Stable refs read by the RAF loop (avoids stale closures)
  const datasetIdxRef = useRef(datasetIdx);
  datasetIdxRef.current = datasetIdx;
  const configRef = useRef(config);
  configRef.current = config;
  const algorithmIdRef = useRef(algorithmId);
  algorithmIdRef.current = algorithmId;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // RAF simulation loop — runs for the lifetime of the component
  useEffect(() => {
    let rafId = 0;
    function frame() {
      if (!pausedRef.current) {
        setSim((prev) => {
          const cfg = configRef.current!;
          const ds = DATASETS[datasetIdxRef.current!];
          const alg = makeAlgorithm(algorithmIdRef.current!, cfg);
          return tickSim(prev, ds, cfg, alg);
        });
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function applyAndRestart() {
    try {
      const parsed = JSON.parse(configText) as Partial<LayoutConfig>;
      const merged: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, ...parsed };
      setConfig(merged);
      setConfigError(null);
      setSim(
        initSim(
          DATASETS[datasetIdxRef.current!],
          merged,
          makeAlgorithm(algorithmIdRef.current!, merged),
        ),
      );
    } catch (e) {
      setConfigError(String(e));
    }
  }

  function restart() {
    setSim(initSim(DATASETS[datasetIdx], config, makeAlgorithm(algorithmId, config)));
  }

  function handleDatasetChange(idx: number) {
    setDatasetIdx(idx);
    setSim(initSim(DATASETS[idx], config, makeAlgorithm(algorithmId, config)));
  }

  function handleAlgorithmChange(id: AlgorithmId) {
    setAlgorithmId(id);
    setSim(initSim(DATASETS[datasetIdx], config, makeAlgorithm(id, config)));
  }

  const dataset = DATASETS[datasetIdx];

  // Stats: aggregate across all levels
  let totalMv = 0;
  for (const [, level] of sim) {
    totalMv = Math.max(totalMv, maxVelocity(level.nodes));
  }
  const rootTicks = sim.get("")?.ticks ?? 0;
  const settled = totalMv < config.settleV;

  // Auto-fit the SVG viewport — use root bbox if available
  const SVG_W = 600;
  const SVG_H = 600;
  const PAD = 60;
  const rootLevel = sim.get("");
  const rootBb = rootLevel?.bbox;
  let minX: number, minY: number, maxX: number, maxY: number;
  if (rootBb && rootLevel!.nodes.length > 0) {
    ({ minX, minY, maxX, maxY } = rootBb);
  } else if (rootLevel && rootLevel.nodes.length > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const n of rootLevel.nodes) {
      minX = Math.min(minX, n.x - n.w / 2);
      minY = Math.min(minY, n.y - n.h / 2);
      maxX = Math.max(maxX, n.x + n.w / 2);
      maxY = Math.max(maxY, n.y + n.h / 2);
    }
  } else {
    minX = -100;
    minY = -100;
    maxX = 100;
    maxY = 100;
  }
  const rw = Math.max(maxX - minX, 1);
  const rh = Math.max(maxY - minY, 1);
  const scale = Math.min((SVG_W - PAD * 2) / rw, (SVG_H - PAD * 2) / rh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const tx = SVG_W / 2 - cx * scale;
  const ty = SVG_H / 2 - cy * scale;

  return (
    <div style="display:flex; height:100vh; background:#0d0d1e; color:#e0e0e0; font-family:sans-serif; font-size:13px;">
      {/* ── Controls sidebar ── */}
      <div style="width:320px; flex-shrink:0; border-right:1px solid #2a2a4a; display:flex; flex-direction:column; overflow:hidden;">
        {/* Header */}
        <div style="padding:10px 14px; border-bottom:1px solid #2a2a4a; font-weight:600; font-size:14px; color:#c0c0e0;">
          Layout
        </div>

        {/* Dataset selector */}
        <div style="padding:10px 14px; border-bottom:1px solid #2a2a4a; display:flex; flex-direction:column; gap:6px;">
          <label style="font-size:10px; color:#555; text-transform:uppercase; letter-spacing:0.06em;">
            Dataset
          </label>
          <select
            style="background:#12122a; border:1px solid #2a2a4a; color:#c0c0e0; padding:4px 6px; border-radius:3px; font-size:12px;"
            onChange={(e: Event) =>
              handleDatasetChange(Number((e.target as HTMLSelectElement).value))}
          >
            {DATASETS.map((ds, i) => (
              <option key={i} value={i} selected={i === datasetIdx}>
                {ds.name}
              </option>
            ))}
          </select>
        </div>

        {/* Algorithm selector */}
        <div style="padding:10px 14px; border-bottom:1px solid #2a2a4a; display:flex; flex-direction:column; gap:6px;">
          <label style="font-size:10px; color:#555; text-transform:uppercase; letter-spacing:0.06em;">
            Algorithm
          </label>
          <select
            style="background:#12122a; border:1px solid #2a2a4a; color:#c0c0e0; padding:4px 6px; border-radius:3px; font-size:12px;"
            onChange={(e: Event) =>
              handleAlgorithmChange((e.target as HTMLSelectElement).value as AlgorithmId)}
          >
            <option value="JANK" selected={algorithmId === "JANK"}>JANK</option>
            <option value="TOPOGRID" selected={algorithmId === "TOPOGRID"}>TOPOGRID</option>
            <option value="SDF" selected={algorithmId === "SDF"}>SDF</option>
          </select>
        </div>

        {/* Config editor */}
        <div style="flex:1; overflow-y:auto; padding:10px 14px; display:flex; flex-direction:column; gap:8px;">
          <label style="font-size:10px; color:#555; text-transform:uppercase; letter-spacing:0.06em;">
            Parameters (JSON)
          </label>
          <textarea
            style="background:#0a0a18; border:1px solid #2a2a4a; color:#9090b0; font-size:11px; font-family:monospace; padding:6px; border-radius:3px; resize:vertical; min-height:260px; width:100%; box-sizing:border-box;"
            onInput={(e: Event) => setConfigText((e.target as HTMLTextAreaElement).value)}
          >
            {configText}
          </textarea>
          {configError && (
            <div style="font-size:11px; color:#c05050; font-family:monospace; word-break:break-all; background:#1a0a0a; padding:6px; border-radius:3px;">
              {configError}
            </div>
          )}
          <div style="display:flex; gap:6px;">
            <button
              type="button"
              style="flex:1; background:#1a2a4a; border:1px solid #3a4a6a; color:#a0b4e0; font-size:12px; cursor:pointer; padding:5px; border-radius:3px;"
              onClick={applyAndRestart}
            >
              Apply & Restart
            </button>
            <button
              type="button"
              style="background:none; border:1px solid #2a2a4a; color:#555; font-size:12px; cursor:pointer; padding:5px 8px; border-radius:3px;"
              title="Restore textarea to current applied config"
              onClick={() => {
                setConfigText(JSON.stringify(config, null, 2));
                setConfigError(null);
              }}
            >
              Revert
            </button>
          </div>
          <div style="display:flex; gap:6px;">
            <button
              type="button"
              style="flex:1; background:none; border:1px solid #2a2a4a; color:#555; font-size:12px; cursor:pointer; padding:5px; border-radius:3px;"
              onClick={restart}
            >
              Restart sim
            </button>
            <button
              type="button"
              style={`flex:1; background:none; border:1px solid #2a2a4a; color:${
                paused ? "#a0b4e0" : "#555"
              }; font-size:12px; cursor:pointer; padding:5px; border-radius:3px;`}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style="padding:10px 14px; border-top:1px solid #2a2a4a; font-family:monospace; font-size:11px; display:flex; flex-direction:column; gap:3px;">
          <div style="color:#444;">Ticks: {rootTicks}</div>
          <div style="color:#444;">
            Max velocity: {totalMv.toFixed(4)}
          </div>
          <div style={`color:${settled ? "#507050" : "#505070"}`}>
            {settled ? "● Settled" : "● Simulating…"}
          </div>
        </div>
      </div>

      {/* ── SVG canvas ── */}
      <svg
        style="flex:1; display:block; background:#0d0d1e;"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      >
        <g transform={`translate(${tx}, ${ty}) scale(${scale})`}>
          {renderLevel("", dataset.nodes, dataset.edges, sim, config, algorithmId, 1 / scale)}
        </g>
      </svg>
    </div>
  );
}
