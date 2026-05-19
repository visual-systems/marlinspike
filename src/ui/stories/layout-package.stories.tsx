/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  type AlgorithmId,
  type BBox,
  boundingBox,
  centerNodes,
  connectedComponents,
  createFIELD,
  createJANK,
  createPORT,
  createSDF,
  createTOPOGRID,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_JANK_CONFIG,
  DEFAULT_PORT_CONFIG,
  DEFAULT_SDF_CONFIG,
  DEFAULT_TOPOGRID_CONFIG,
  type ForceEdge,
  type ForceNode,
  type LayoutAlgorithm,
  lineClosestPoint,
  maxVelocity,
  rectPortPositions,
  topoCharge,
  topoGridLayout,
} from "@marlinspike/layout";
import type { CanvasEdge, CanvasNode, CanvasScene } from "@marlinspike/canvas";
import {
  CIRCLE_GEOMETRY,
  hitTest,
  isCircleShape,
  lineSdfDist,
  marlinTheme,
  renderScene,
  renderWith,
  svgRenderer,
} from "@marlinspike/canvas";
import type { Port } from "../workspace.ts";

export const meta = { title: "Package: @marlinspike-layout" };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SECTION = "margin-bottom:32px;";
const HEADING = "font-size:16px; font-weight:bold; margin-bottom:4px; color:#c0c0e0;";
const SUBHEADING = "font-size:13px; font-weight:600; margin-bottom:6px; color:#a0a0d0;";
const DESCRIPTION =
  "font-size:12px; color:#888; margin-bottom:12px; line-height:1.6; max-width:720px;";
const CALLOUT =
  "background:#1a1a30; border-left:3px solid #5a5a8a; padding:8px 12px; font-size:11px; color:#a0a0c0; margin-bottom:12px; line-height:1.5;";
const BTN =
  "background:#2a2a4a; color:#e0e0e0; border:1px solid #3a3a5a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:12px;";
const TAG =
  "display:inline-block; background:#2a2a4a; color:#9090c0; padding:1px 6px; border-radius:3px; font-size:10px; font-family:monospace; margin-right:4px;";
const PRE =
  "background:#0f0f22; padding:12px; border-radius:4px; font-size:12px; line-height:1.5; overflow:auto; max-height:500px; white-space:pre-wrap; font-family:monospace;";
const COLUMNS = "display:flex; gap:16px;";
const COL = "flex:1;";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALGORITHMS: Record<string, { create: () => LayoutAlgorithm; desc: string }> = {
  JANK: {
    create: () => createJANK(DEFAULT_JANK_CONFIG),
    desc: "Coulomb repulsion + Hooke springs",
  },
  SDF: {
    create: () => createSDF(DEFAULT_SDF_CONFIG),
    desc: "SDF-based repulsion + edge clearance",
  },
  FIELD: {
    create: () => createFIELD(DEFAULT_FIELD_CONFIG),
    desc: "SDF + directional flow field (charge-based)",
  },
  TOPOGRID: {
    create: () => createTOPOGRID(DEFAULT_TOPOGRID_CONFIG),
    desc: "Deterministic topological grid",
  },
};

/** Convert force nodes to a CanvasScene for rendering via @marlinspike/canvas. */
function toCanvasScene(nodes: ForceNode[], edges: ForceEdge[]): CanvasScene {
  const canvasNodes: CanvasNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    geometry: CIRCLE_GEOMETRY,
    label: n.id,
  }));
  const canvasEdges: CanvasEdge[] = edges.map((e, i) => ({
    id: `e${i}`,
    fromId: e.a,
    toId: e.b,
  }));
  return { nodes: canvasNodes, edges: canvasEdges };
}

/** Render a canvas scene to SVG string. */
function renderSvg(scene: CanvasScene): string {
  const root = renderScene(scene, marlinTheme);
  const [svg] = renderWith(svgRenderer, root);
  return svg;
}

/** Run an algorithm to settlement, returning final nodes and tick count. */
function runToSettlement(
  algo: LayoutAlgorithm,
  ids: string[],
  edges: ForceEdge[],
  maxTicks = 1000,
): { nodes: ForceNode[]; ticks: number } {
  let nodes = algo.initNodes(ids, edges, 52, 52, new Map());
  for (let t = 0; t < maxTicks; t++) {
    const result = algo.tick(nodes, edges, t);
    nodes = result.nodes;
    if (result.settled) return { nodes, ticks: t + 1 };
  }
  return { nodes, ticks: maxTicks };
}

/** Render settled nodes into an SVG viewBox string. */
function SvgLayout(
  { nodes, edges, width, height }: {
    nodes: ForceNode[];
    edges: ForceEdge[];
    width: number;
    height: number;
  },
) {
  if (nodes.length === 0) return <div />;
  const scene = toCanvasScene(nodes, edges);
  const svgContent = renderSvg(scene);
  const bb = boundingBox(nodes, 40);
  return (
    <svg
      viewBox={`${bb.minX} ${bb.minY} ${bb.w} ${bb.h}`}
      width={width}
      height={height}
      style="background:#0d0d1e; border-radius:4px; border:1px solid #2a2a4a;"
    >
      <g dangerouslySetInnerHTML={{ __html: svgContent }} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Graph fixtures
// ---------------------------------------------------------------------------

const DIAMOND_IDS = ["A", "B", "C", "D", "E"];
const DIAMOND_EDGES: ForceEdge[] = [
  { a: "A", b: "B" },
  { a: "A", b: "C" },
  { a: "B", b: "D" },
  { a: "C", b: "D" },
  { a: "D", b: "E" },
];

const PIPELINE_IDS = ["Source", "Parse", "Validate", "Transform", "Load", "Sink"];
const PIPELINE_EDGES: ForceEdge[] = [
  { a: "Source", b: "Parse" },
  { a: "Parse", b: "Validate" },
  { a: "Validate", b: "Transform" },
  { a: "Transform", b: "Load" },
  { a: "Load", b: "Sink" },
];

// ---------------------------------------------------------------------------
// Story: Algorithm Comparison
// ---------------------------------------------------------------------------

export function AlgorithmComparison() {
  const results = Object.entries(ALGORITHMS).map(([id, { create, desc }]) => {
    const algo = create();
    let nodes = algo.initNodes(DIAMOND_IDS, DIAMOND_EDGES, 52, 52, new Map());

    // FIELD needs charge metadata
    if (id === "FIELD") {
      const charges = topoCharge(DIAMOND_IDS, DIAMOND_EDGES);
      nodes = nodes.map((n) => ({ ...n, charge: charges.get(n.id) }));
    }

    const { nodes: settled, ticks } = runToSettlement(algo, DIAMOND_IDS, DIAMOND_EDGES);
    // Use charged init for FIELD
    const finalNodes = id === "FIELD"
      ? (() => {
        const a = create();
        let ns = a.initNodes(DIAMOND_IDS, DIAMOND_EDGES, 52, 52, new Map());
        const charges = topoCharge(DIAMOND_IDS, DIAMOND_EDGES);
        ns = ns.map((n) => ({ ...n, charge: charges.get(n.id) }));
        for (let t = 0; t < 1000; t++) {
          const r = a.tick(ns, DIAMOND_EDGES, t);
          ns = r.nodes;
          if (r.settled) break;
        }
        return ns;
      })()
      : settled;

    return { id, desc, nodes: finalNodes, ticks };
  });

  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Algorithm Comparison</div>
        <div style={DESCRIPTION}>
          Same graph (A→B→D, A→C→D, D→E diamond), four algorithms. Each runs to settlement
          independently. The layout package ships four built-in algorithms; consumers can implement
          their own via the <span style={TAG}>LayoutAlgorithm</span> interface.
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        {results.map(({ id, desc, nodes, ticks }) => (
          <div key={id}>
            <div style={SUBHEADING}>
              {id} <span style="font-weight:normal; color:#666;">— {ticks} ticks</span>
            </div>
            <div style="font-size:11px; color:#666; margin-bottom:8px;">{desc}</div>
            <SvgLayout nodes={nodes} edges={DIAMOND_EDGES} width={360} height={280} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Topology Analysis
// ---------------------------------------------------------------------------

export function TopologyAnalysis() {
  const [graphId, setGraphId] = useState<"diamond" | "pipeline">("diamond");
  const graphs = {
    diamond: { ids: DIAMOND_IDS, edges: DIAMOND_EDGES },
    pipeline: { ids: PIPELINE_IDS, edges: PIPELINE_EDGES },
  };
  const { ids, edges } = graphs[graphId];
  const charges = topoCharge(ids, edges);

  // Run TOPOGRID for positions
  const gridNodes = topoGridLayout(ids, edges, 52, 52, 160, 130);

  // Color from charge: -1 = blue (source), +1 = orange (sink), 0 = neutral
  function chargeColor(c: number): string {
    if (c < 0) {
      const t = -c;
      return `rgb(${Math.round(100 + 50 * (1 - t))}, ${Math.round(130 + 50 * (1 - t))}, ${
        Math.round(200 + 55 * t)
      })`;
    }
    const t = c;
    return `rgb(${Math.round(200 + 55 * t)}, ${Math.round(150 + 50 * (1 - t))}, ${
      Math.round(100 + 50 * (1 - t))
    })`;
  }

  const bb = boundingBox(gridNodes, 60);

  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Topology Analysis — topoCharge</div>
        <div style={DESCRIPTION}>
          <span style={TAG}>topoCharge(ids, edges)</span>{" "}
          computes a topological charge in [-1, +1] for each node using Tarjan SCC condensation and
          longest-path ranking. Sources get negative charge (blue), sinks get positive (orange). The
          FIELD algorithm uses this to create directional flow — sources push right, sinks pull
          left.
        </div>
        <div style={CALLOUT}>
          <strong>How it works:</strong>{" "}
          1. Find strongly connected components (Tarjan). 2. Condense cycles into single nodes. 3.
          Compute longest-path layers in the DAG. 4. Normalize to [-1, +1].
        </div>
      </div>

      <div style="margin-bottom:16px; display:flex; gap:8px;">
        {(["diamond", "pipeline"] as const).map((g) => (
          <button
            type="button"
            key={g}
            style={`${BTN}; ${g === graphId ? "background:#3a3a6a; border-color:#5a5aaa;" : ""}`}
            onClick={() => setGraphId(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div style={COLUMNS}>
        <div style={COL}>
          <div style={SUBHEADING}>Graph with charge coloring</div>
          <svg
            viewBox={`${bb.minX} ${bb.minY} ${bb.w} ${bb.h}`}
            width={400}
            height={300}
            style="background:#0d0d1e; border-radius:4px; border:1px solid #2a2a4a;"
          >
            {/* Edges */}
            {edges.map((e, i) => {
              const from = gridNodes.find((n) => n.id === e.a)!;
              const to = gridNodes.find((n) => n.id === e.b)!;
              return (
                <line
                  key={`e${i}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#3a3a5a"
                  stroke-width={1.5}
                />
              );
            })}
            {/* Nodes */}
            {gridNodes.map((n) => {
              const c = charges.get(n.id) ?? 0;
              return (
                <g key={n.id}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={26}
                    fill="#111125"
                    stroke={chargeColor(c)}
                    stroke-width={2}
                  />
                  <text
                    x={n.x}
                    y={n.y - 4}
                    text-anchor="middle"
                    fill={chargeColor(c)}
                    font-size="10"
                    font-weight="bold"
                  >
                    {n.id}
                  </text>
                  <text x={n.x} y={n.y + 10} text-anchor="middle" fill="#666" font-size="9">
                    {c.toFixed(2)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div style={COL}>
          <div style={SUBHEADING}>Charge values</div>
          <pre style={PRE}>
            {ids.map((id) => {
              const c = charges.get(id) ?? 0;
              const bar = c < 0 ? "◀".repeat(Math.round(-c * 5)) : "▶".repeat(Math.round(c * 5));
              const label = c < 0 ? "source" : c > 0 ? "sink" : "neutral";
              return `${id.padEnd(12)} ${c.toFixed(3).padStart(7)}  ${bar}  (${label})`;
            }).join("\n")}
          </pre>

          <div style={SUBHEADING}>Edge list</div>
          <pre style={PRE}>{edges.map((e) => `${e.a} → ${e.b}`).join("\n")}</pre>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Layout Interface
// ---------------------------------------------------------------------------

export function LayoutInterface() {
  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>The LayoutAlgorithm Interface</div>
        <div style={DESCRIPTION}>
          All layout algorithms — built-in and custom — implement this interface. The consumer
          provides node IDs + edges; the algorithm handles positioning and settlement. This is the
          extension point for custom layout strategies.
        </div>

        <div style={COLUMNS}>
          <div style={COL}>
            <div style={SUBHEADING}>LayoutAlgorithm</div>
            <pre style={PRE}>{`interface LayoutAlgorithm {
  id: string;
  name: string;

  // true = tick() refines existing positions
  // false = initNodes() computes final positions
  preservesPositions: boolean;

  // Create initial ForceNode[] from IDs + edges
  initNodes(
    ids: string[],
    edges: ForceEdge[],
    leafW: number,
    leafH: number,
    defaults: Map<string, { x: number; y: number }>,
  ): ForceNode[];

  // Run one simulation step
  tick(
    nodes: ForceNode[],
    edges: ForceEdge[],
    ticks: number,
  ): { nodes: ForceNode[]; settled: boolean };
}`}</pre>
          </div>

          <div style={COL}>
            <div style={SUBHEADING}>ForceNode</div>
            <pre style={PRE}>{`interface ForceNode {
  id: string;
  x: number;             // position
  y: number;
  vx: number;            // velocity (iterative algos)
  vy: number;
  pinned: boolean;        // immovable?
  w: number;              // body width (for SDF)
  h: number;              // body height (for SDF)
  shape?: "circle" | "rect";
  charge?: number;        // topological charge [-1, +1]
  anchor?: { x: number; y: number };  // port pinning
}`}</pre>

            <div style={SUBHEADING}>ForceEdge</div>
            <pre style={PRE}>{`interface ForceEdge {
  a: string;   // source node ID
  b: string;   // target node ID
}`}</pre>
          </div>
        </div>

        <div style={CALLOUT}>
          <strong>SDF as geometry interface:</strong>{" "}
          Layout algorithms use SDF (signed distance field) functions from{" "}
          <span style={TAG}>@marlinspike/canvas</span> for geometry-aware force computation.{" "}
          <span style={TAG}>ForceNode</span> structurally satisfies{" "}
          <span style={TAG}>SdfShape</span>{" "}
          — no casts or adapters needed. This means algorithms work correctly with any node shape
          without knowing rendering details.
        </div>
      </div>

      <div style={SECTION}>
        <div style={HEADING}>Built-in Algorithms</div>
        <div style={DESCRIPTION}>
          Each algorithm is created via a factory function with a config object. Configs are plain
          objects — composable via spread for overrides.
        </div>

        <pre style={PRE}>{`// Iterative: Coulomb + springs (simplest)
const jank = createJANK(DEFAULT_JANK_CONFIG);
const jank2 = createJANK({ ...DEFAULT_JANK_CONFIG, repulsion: 2000 });

// Iterative: SDF-based repulsion + edge clearance
const sdf = createSDF(DEFAULT_SDF_CONFIG);

// Iterative: SDF + directional flow field
const field = createFIELD(DEFAULT_FIELD_CONFIG);

// Deterministic: topological grid (1-2 ticks)
const topo = createTOPOGRID(DEFAULT_TOPOGRID_CONFIG);

// Iterative: FIELD + LTR init + port-node pinning
const port = createPORT(DEFAULT_PORT_CONFIG);`}</pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Settlement Dynamics
// ---------------------------------------------------------------------------

export function SettlementDynamics() {
  const [algoId, setAlgoId] = useState<string>("SDF");

  // Run algorithm, recording velocity at each tick
  const algo = ALGORITHMS[algoId].create();
  let nodes = algo.initNodes(DIAMOND_IDS, DIAMOND_EDGES, 52, 52, new Map());
  if (algoId === "FIELD") {
    const charges = topoCharge(DIAMOND_IDS, DIAMOND_EDGES);
    nodes = nodes.map((n) => ({ ...n, charge: charges.get(n.id) }));
  }

  const velocities: number[] = [];
  let settled = false;
  const maxTicks = algoId === "TOPOGRID" ? 5 : 500;
  for (let t = 0; t < maxTicks && !settled; t++) {
    const result = algo.tick(nodes, DIAMOND_EDGES, t);
    nodes = result.nodes;
    velocities.push(maxVelocity(nodes));
    if (result.settled) settled = true;
  }

  // Scale for chart
  const maxV = Math.max(...velocities, 1);
  const chartW = 600;
  const chartH = 200;
  const barW = Math.max(1, Math.min(4, chartW / velocities.length));

  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Settlement Dynamics</div>
        <div style={DESCRIPTION}>
          Iterative algorithms reduce node velocity each tick until falling below the settle
          threshold. This chart shows <span style={TAG}>maxVelocity(nodes)</span>{" "}
          over time. TOPOGRID is deterministic — it computes positions in 1-2 ticks with no
          iterative settling.
        </div>
      </div>

      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center;">
        {Object.keys(ALGORITHMS).map((id) => (
          <button
            type="button"
            key={id}
            style={`${BTN}; ${id === algoId ? "background:#3a3a6a; border-color:#5a5aaa;" : ""}`}
            onClick={() => setAlgoId(id)}
          >
            {id}
          </button>
        ))}
        <span style="margin-left:16px; font-size:11px; color:#666;">
          <span style={TAG}>ticks: {velocities.length}</span>
          <span style={TAG}>{settled ? "settled" : "max ticks"}</span>
        </span>
      </div>

      <svg
        width={chartW + 60}
        height={chartH + 40}
        style="background:#0d0d1e; border-radius:4px; border:1px solid #2a2a4a;"
      >
        {/* Y axis label */}
        <text x={8} y={20} fill="#666" font-size="9">maxV</text>
        <text x={8} y={chartH + 16} fill="#666" font-size="9">0</text>
        {/* X axis */}
        <line x1={50} y1={chartH + 10} x2={chartW + 50} y2={chartH + 10} stroke="#2a2a4a" />
        <text x={chartW / 2 + 50} y={chartH + 30} fill="#666" font-size="9" text-anchor="middle">
          ticks
        </text>
        {/* Bars */}
        {velocities.map((v, i) => {
          const h = (v / maxV) * chartH;
          const x = 50 + i * (chartW / velocities.length);
          return (
            <rect
              key={i}
              x={x}
              y={chartH + 10 - h}
              width={barW}
              height={h}
              fill="#5a5aaa"
              opacity={0.8}
            />
          );
        })}
      </svg>

      <div style={CALLOUT}>
        <strong>Convergence shape:</strong> {algoId === "TOPOGRID"
          ? "TOPOGRID computes positions analytically — velocity drops to 0 immediately."
          : algoId === "JANK"
          ? "JANK uses damping to decay velocity. Convergence is steady but can oscillate with high repulsion."
          : algoId === "SDF"
          ? "SDF converges smoothly — SDF-based forces avoid the singularities that cause JANK oscillation."
          : "FIELD adds directional flow on top of SDF, which can cause initial velocity spikes before settling."}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Center and BoundingBox
// ---------------------------------------------------------------------------

export function Utilities() {
  // Show centerNodes in action
  const offCenter: ForceNode[] = [
    { id: "A", x: 200, y: 300, vx: 0, vy: 0, pinned: false, w: 52, h: 52 },
    { id: "B", x: 350, y: 250, vx: 0, vy: 0, pinned: false, w: 52, h: 52 },
    { id: "C", x: 280, y: 400, vx: 0, vy: 0, pinned: false, w: 80, h: 60 },
  ];
  const centered = centerNodes(offCenter);
  const edges: ForceEdge[] = [{ a: "A", b: "B" }, { a: "B", b: "C" }];

  const bbOff = boundingBox(offCenter, 20);
  const bbCen = boundingBox(centered, 20);

  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Utility Functions</div>
        <div style={DESCRIPTION}>
          Pure utility functions for working with layout results. These compose with any algorithm —
          they operate on <span style={TAG}>ForceNode[]</span>{" "}
          regardless of how positions were computed.
        </div>
      </div>

      <div style={COLUMNS}>
        <div style={COL}>
          <div style={SUBHEADING}>Before centerNodes()</div>
          <div style="font-size:11px; color:#666; margin-bottom:8px;">
            Centroid at ({((bbOff.minX + bbOff.maxX) / 2).toFixed(0)},{" "}
            {((bbOff.minY + bbOff.maxY) / 2).toFixed(0)})
          </div>
          <SvgLayout nodes={offCenter} edges={edges} width={280} height={220} />
        </div>
        <div style={COL}>
          <div style={SUBHEADING}>After centerNodes()</div>
          <div style="font-size:11px; color:#666; margin-bottom:8px;">
            Centroid at ({((bbCen.minX + bbCen.maxX) / 2).toFixed(0)},{" "}
            {((bbCen.minY + bbCen.maxY) / 2).toFixed(0)})
          </div>
          <SvgLayout nodes={centered} edges={edges} width={280} height={220} />
        </div>
      </div>

      <div style="margin-top:16px;">
        <div style={SUBHEADING}>boundingBox(nodes, padding)</div>
        <pre style={PRE}>{`const bb = boundingBox(nodes, 20);
// ${JSON.stringify(bbCen)}

// Anchored nodes (port pins) are excluded from the bounding box
// so viewport framing focuses on the main graph content.`}</pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Composition (animated)
// ---------------------------------------------------------------------------

export function Composition() {
  const [algoId, setAlgoId] = useState<string>("SDF");
  const [ticks, setTicks] = useState(0);
  const [nodes, setNodes] = useState<ForceNode[]>([]);
  const [settled, setSettled] = useState(false);
  const algoRef = useRef<LayoutAlgorithm | null>(null);
  const rafRef = useRef<number | null>(null);

  // Initialize algorithm
  useEffect(() => {
    const algo = ALGORITHMS[algoId].create();
    algoRef.current = algo;
    let initNodes = algo.initNodes(DIAMOND_IDS, DIAMOND_EDGES, 52, 52, new Map());

    // Assign charge for FIELD algorithm
    if (algoId === "FIELD") {
      const charges = topoCharge(DIAMOND_IDS, DIAMOND_EDGES);
      initNodes = initNodes.map((n) => ({ ...n, charge: charges.get(n.id) }));
    }

    setNodes(initNodes);
    setTicks(0);
    setSettled(false);
  }, [algoId]);

  // Animation loop
  useEffect(() => {
    if (settled || !algoRef.current || nodes.length === 0) return;

    const step = () => {
      const algo = algoRef.current!;
      setTicks((t) => {
        const result = algo.tick(nodes, DIAMOND_EDGES, t);
        setNodes(result.nodes);
        if (result.settled) setSettled(true);
        return t + 1;
      });
      if (!settled) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes, settled]);

  const scene = toCanvasScene(nodes, DIAMOND_EDGES);
  const svgContent = nodes.length > 0 ? renderSvg(scene) : "";

  // Compute viewBox from bounding box
  const bb = nodes.length > 0 ? boundingBox(nodes, 40) : { minX: -200, minY: -200, w: 400, h: 400 };
  const mv = maxVelocity(nodes);

  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Layout + Canvas Composition</div>
        <div style={DESCRIPTION}>
          This demo composes <span style={TAG}>@marlinspike/layout</span> (force simulation) with
          {" "}
          <span style={TAG}>@marlinspike/canvas</span>{" "}
          (rendering). Layout computes positions, canvas renders the scene. No shared dependency —
          just structural compatibility.
        </div>
        <div style={CALLOUT}>
          <strong>Pattern:</strong>{" "}
          ForceNode[] → CanvasScene → renderScene() → SVG. Switch algorithms to see animated
          settling in real time.
        </div>
      </div>

      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center;">
        {Object.keys(ALGORITHMS).map((id) => (
          <button
            type="button"
            key={id}
            style={`${BTN}; ${id === algoId ? "background:#3a3a6a; border-color:#5a5aaa;" : ""}`}
            onClick={() => setAlgoId(id)}
          >
            {id}
          </button>
        ))}
        <span style="margin-left:16px; font-size:11px; color:#666;">
          <span style={TAG}>ticks: {ticks}</span>
          <span style={TAG}>v: {mv.toFixed(2)}</span>
          <span style={TAG}>{settled ? "settled" : "running"}</span>
        </span>
      </div>

      <svg
        viewBox={`${bb.minX} ${bb.minY} ${bb.w} ${bb.h}`}
        width={Math.min(bb.w, 800)}
        height={Math.min(bb.h, 600)}
        style="background:#0d0d1e; border-radius:8px; border:1px solid #2a2a4a;"
      >
        <g dangerouslySetInnerHTML={{ __html: svgContent }} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Figma Lite with Layout
// ---------------------------------------------------------------------------

let flNodeCounter = 0;
let flEdgeCounter = 0;

export function FigmaLiteWithLayout() {
  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: "n1", x: 150, y: 200, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "A" },
    { id: "n2", x: 300, y: 120, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "B" },
    { id: "n3", x: 300, y: 280, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "C" },
    { id: "n4", x: 450, y: 200, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "D" },
  ]);
  const [edges, setEdges] = useState<CanvasEdge[]>([
    { id: "e1", fromId: "n1", toId: "n2" },
    { id: "e2", fromId: "n1", toId: "n3" },
    { id: "e3", fromId: "n2", toId: "n4" },
    { id: "e4", fromId: "n3", toId: "n4" },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "add-node" | "add-edge">("select");
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [algoId, setAlgoId] = useState<string>("SDF");
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [dragState, setDragState] = useState<
    {
      id: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    } | null
  >(null);
  const algoRef = useRef<LayoutAlgorithm | null>(null);
  const forceNodesRef = useRef<ForceNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  const W = 700;
  const H = 450;

  // Convert CanvasEdge[] to ForceEdge[]
  const forceEdges: ForceEdge[] = edges.map((e) => ({ a: e.fromId, b: e.toId }));

  // Run auto-layout
  function runLayout() {
    const ids = nodes.map((n) => n.id);
    const algo = ALGORITHMS[algoId].create();
    algoRef.current = algo;

    // Seed initial positions from current canvas positions
    const defaults = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    let forceNodes = algo.initNodes(ids, forceEdges, 52, 52, defaults);

    // Assign charge for FIELD
    if (algoId === "FIELD") {
      const charges = topoCharge(ids, forceEdges);
      forceNodes = forceNodes.map((n) => ({ ...n, charge: charges.get(n.id) }));
    }

    forceNodesRef.current = forceNodes;
    setLayoutRunning(true);

    // Animate the layout
    let tick = 0;
    const step = () => {
      const a = algoRef.current!;
      const result = a.tick(forceNodesRef.current!, forceEdges, tick++);
      forceNodesRef.current = result.nodes;

      // Sync ForceNode positions back to CanvasNodes
      const posMap = new Map(result.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
      setNodes((prev) =>
        prev.map((n) => {
          const pos = posMap.get(n.id);
          return pos ? { ...n, x: pos.x, y: pos.y } : n;
        })
      );

      if (result.settled || tick > 500) {
        setLayoutRunning(false);
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  // Stop layout on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Build scene
  const scene: CanvasScene = {
    nodes: nodes.map((n) => ({
      ...n,
      selected: n.id === selectedId,
      highlighted: n.id === edgeFrom,
    })),
    edges,
  };

  const group = renderScene(scene, marlinTheme);
  const [svgContent] = renderWith(svgRenderer, group);

  function handleClick(e: MouseEvent) {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "add-node") {
      const id = `n${++flNodeCounter}`;
      setNodes((prev) => [
        ...prev,
        { id, x, y, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: `N${flNodeCounter}` },
      ]);
      setSelectedId(id);
      return;
    }

    if (mode === "add-edge") {
      const hit = hitTest(group, { x, y });
      if (!hit) return;
      if (!edgeFrom) {
        setEdgeFrom(hit.id);
      } else if (hit.id !== edgeFrom) {
        setEdges((prev) => [
          ...prev,
          { id: `e${++flEdgeCounter}`, fromId: edgeFrom!, toId: hit.id },
        ]);
        setEdgeFrom(null);
      }
      return;
    }

    // Select mode
    const hit = hitTest(group, { x, y });
    setSelectedId(hit?.id ?? null);
  }

  function handleMouseDown(e: MouseEvent) {
    if (mode !== "select" || layoutRunning) return;
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const hit = hitTest(group, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (hit) {
      const node = nodes.find((n) => n.id === hit.id);
      if (node) {
        setDragState({
          id: node.id,
          startX: e.clientX,
          startY: e.clientY,
          origX: node.x,
          origY: node.y,
        });
        setSelectedId(node.id);
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === dragState.id ? { ...n, x: dragState.origX + dx, y: dragState.origY + dy } : n
      )
    );
  }

  function handleMouseUp() {
    setDragState(null);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setLayoutRunning(false);
      setNodes((prev) => prev.filter((n) => n.id !== selectedId));
      setEdges((prev) =>
        prev.filter((edge) => edge.fromId !== selectedId && edge.toId !== selectedId)
      );
      setSelectedId(null);
    }
  }

  return (
    <div
      style="padding:24px; color:#e0e0e0; font-family:sans-serif;"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div style={SECTION}>
        <div style={HEADING}>Figma Lite with Layout</div>
        <div style={DESCRIPTION}>
          The canvas package's FigmaLite demo with auto-layout added. Build a graph manually (add
          nodes, draw edges), then hit <strong>Layout</strong>{" "}
          to arrange it automatically. This shows how easy it is to add{" "}
          <span style={TAG}>@marlinspike/layout</span>{" "}
          to an existing canvas-based app — just convert your nodes to ForceNode[], run the
          algorithm, and write positions back.
        </div>
        <div style={CALLOUT}>
          <strong>Integration:</strong>{" "}
          ~30 lines of glue code. Convert CanvasNode[] → ForceNode IDs + ForceEdge[]. Run
          algorithm.tick() in a rAF loop. Copy x,y back to CanvasNodes. Done.
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; align-items:center;">
        <button
          type="button"
          style={mode === "select" ? BTN + " background:#3a3a6a;" : BTN}
          onClick={() => {
            setMode("select");
            setEdgeFrom(null);
          }}
        >
          Select
        </button>
        <button
          type="button"
          style={mode === "add-node" ? BTN + " background:#3a3a6a;" : BTN}
          onClick={() => {
            setMode("add-node");
            setEdgeFrom(null);
          }}
        >
          Add Node
        </button>
        <button
          type="button"
          style={mode === "add-edge" ? BTN + " background:#3a3a6a;" : BTN}
          onClick={() => {
            setMode("add-edge");
            setEdgeFrom(null);
          }}
        >
          Draw Edge
        </button>

        <span style="width:1px; height:20px; background:#3a3a5a; margin:0 4px;" />

        {Object.keys(ALGORITHMS).map((id) => (
          <button
            type="button"
            key={id}
            style={`${BTN}; font-size:10px; ${
              id === algoId ? "background:#3a3a6a; border-color:#5a5aaa;" : ""
            }`}
            onClick={() => setAlgoId(id)}
          >
            {id}
          </button>
        ))}
        <button
          type="button"
          style={`${BTN}; background:#2a4a3a; border-color:#3a6a4a;`}
          onClick={() => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            runLayout();
          }}
        >
          {layoutRunning ? "Restart Layout" : "Layout"}
        </button>

        <span style="font-size:11px; color:#666; margin-left:8px;">
          {layoutRunning
            ? "laying out..."
            : mode === "add-node"
            ? "Click canvas to place a node"
            : mode === "add-edge"
            ? edgeFrom ? "Click target node" : "Click source node"
            : "Click to select, drag to move, Backspace to delete"}
        </span>
      </div>

      <div
        ref={svgRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={`cursor:${mode === "add-node" || mode === "add-edge" ? "crosshair" : "default"};`}
        dangerouslySetInnerHTML={{
          __html:
            `<svg width="${W}" height="${H}" style="background:${marlinTheme.background}; border-radius:4px; outline:1px solid #1e1e44;">${svgContent}</svg>`,
        }}
      />

      <div style="margin-top:12px;">
        <div style={SUBHEADING}>
          {nodes.length} nodes, {edges.length} edges
        </div>
        <div style={CALLOUT}>
          <strong>How it works:</strong> The canvas manages nodes as{" "}
          <span style={TAG}>CanvasNode[]</span>{" "}
          with x,y positions. When you click Layout, the integration code extracts IDs and edges,
          creates a{" "}
          <span style={TAG}>LayoutAlgorithm</span>, runs tick() in a requestAnimationFrame loop, and
          writes the computed positions back to the CanvasNodes. The canvas re-renders each frame
          through <span style={TAG}>renderScene()</span>{" "}
          as usual — layout is just another position source.
        </div>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Rendering constants (not tunable via JSON — structural layout params)
// ---------------------------------------------------------------------------

const GROUP_PADDING = 32;
const LABEL_H = 22;

// ---------------------------------------------------------------------------
// Config — per-algorithm discriminated union, each matching its algorithm's
// own parameter names. The `id` field doubles as the algorithm selector.
// ---------------------------------------------------------------------------

interface JankAlgConfig {
  id: "JANK";
  leafR: number;
  spread: number;
  settleV: number;
  repulsion: number;
  maxForce: number;
  springK: number;
  springL: number;
  damping: number;
}

interface TopogridAlgConfig {
  id: "TOPOGRID";
  leafR: number;
  hSpacing: number;
  vSpacing: number;
}

interface SdfAlgConfig {
  id: "SDF";
  leafR: number;
  repulsionStrength: number;
  restGap: number;
  maxRepulsionDist: number;
  sdfGradientEps: number;
  springK: number;
  springRestLength: number;
  edgeClearance: number;
  edgeRepulsionK: number;
  componentRepulsionK: number;
  damping: number;
  maxVelocity: number;
  circleThreshold: number;
  spread: number;
  settleV: number;
  anchorK: number;
  anchorRampTicks: number;
  /** Show component bounding circles as a debug overlay */
  showComponents: boolean;
  /** Draw each node's SDF shape as a translucent overlay */
  showSdfs: boolean;
}

interface FieldAlgConfig {
  id: "FIELD";
  leafR: number;
  repulsionStrength: number;
  restGap: number;
  maxRepulsionDist: number;
  sdfGradientEps: number;
  springK: number;
  springRestLength: number;
  edgeClearance: number;
  edgeRepulsionK: number;
  componentRepulsionK: number;
  damping: number;
  maxVelocity: number;
  circleThreshold: number;
  spread: number;
  settleV: number;
  fieldStrength: number;
  fieldDirection: [number, number];
  anchorK: number;
  anchorRampTicks: number;
  showComponents: boolean;
  showSdfs: boolean;
}

interface PortAlgConfig {
  id: "PORT";
  leafR: number;
  repulsionStrength: number;
  restGap: number;
  maxRepulsionDist: number;
  sdfGradientEps: number;
  springK: number;
  springRestLength: number;
  edgeClearance: number;
  edgeRepulsionK: number;
  componentRepulsionK: number;
  damping: number;
  maxVelocity: number;
  circleThreshold: number;
  spread: number;
  settleV: number;
  fieldStrength: number;
  fieldDirection: [number, number];
  anchorK: number;
  anchorRampTicks: number;
  ltrHSpacing: number;
  ltrVSpacing: number;
  showComponents: boolean;
  showSdfs: boolean;
}

type AlgorithmConfig =
  | JankAlgConfig
  | TopogridAlgConfig
  | SdfAlgConfig
  | FieldAlgConfig
  | PortAlgConfig;

const DEFAULT_JANK_STORY: JankAlgConfig = {
  id: "JANK",
  leafR: 26,
  spread: DEFAULT_JANK_CONFIG.spread,
  settleV: DEFAULT_JANK_CONFIG.settleV,
  repulsion: DEFAULT_JANK_CONFIG.repulsion,
  maxForce: DEFAULT_JANK_CONFIG.maxForce,
  springK: DEFAULT_JANK_CONFIG.springK,
  springL: DEFAULT_JANK_CONFIG.springL,
  damping: DEFAULT_JANK_CONFIG.damping,
};

const DEFAULT_TOPOGRID_STORY: TopogridAlgConfig = {
  id: "TOPOGRID",
  leafR: 26,
  hSpacing: DEFAULT_TOPOGRID_CONFIG.hSpacing,
  vSpacing: DEFAULT_TOPOGRID_CONFIG.vSpacing,
};

const DEFAULT_SDF_STORY: SdfAlgConfig = {
  id: "SDF",
  leafR: 26,
  repulsionStrength: DEFAULT_SDF_CONFIG.repulsionStrength,
  restGap: DEFAULT_SDF_CONFIG.restGap,
  maxRepulsionDist: DEFAULT_SDF_CONFIG.maxRepulsionDist,
  sdfGradientEps: DEFAULT_SDF_CONFIG.sdfGradientEps,
  springK: DEFAULT_SDF_CONFIG.springK,
  springRestLength: DEFAULT_SDF_CONFIG.springRestLength,
  edgeClearance: DEFAULT_SDF_CONFIG.edgeClearance,
  edgeRepulsionK: DEFAULT_SDF_CONFIG.edgeRepulsionK,
  componentRepulsionK: DEFAULT_SDF_CONFIG.componentRepulsionK,
  damping: DEFAULT_SDF_CONFIG.damping,
  maxVelocity: DEFAULT_SDF_CONFIG.maxVelocity,
  circleThreshold: DEFAULT_SDF_CONFIG.circleThreshold,
  spread: DEFAULT_SDF_CONFIG.spread,
  settleV: DEFAULT_SDF_CONFIG.settleV,
  anchorK: DEFAULT_SDF_CONFIG.anchorK,
  anchorRampTicks: DEFAULT_SDF_CONFIG.anchorRampTicks,
  showComponents: false,
  showSdfs: false,
};

const DEFAULT_FIELD_STORY: FieldAlgConfig = {
  id: "FIELD",
  leafR: 26,
  repulsionStrength: DEFAULT_FIELD_CONFIG.repulsionStrength,
  restGap: DEFAULT_FIELD_CONFIG.restGap,
  maxRepulsionDist: DEFAULT_FIELD_CONFIG.maxRepulsionDist,
  sdfGradientEps: DEFAULT_FIELD_CONFIG.sdfGradientEps,
  springK: DEFAULT_FIELD_CONFIG.springK,
  springRestLength: DEFAULT_FIELD_CONFIG.springRestLength,
  edgeClearance: DEFAULT_FIELD_CONFIG.edgeClearance,
  edgeRepulsionK: DEFAULT_FIELD_CONFIG.edgeRepulsionK,
  componentRepulsionK: DEFAULT_FIELD_CONFIG.componentRepulsionK,
  damping: DEFAULT_FIELD_CONFIG.damping,
  maxVelocity: DEFAULT_FIELD_CONFIG.maxVelocity,
  circleThreshold: DEFAULT_FIELD_CONFIG.circleThreshold,
  spread: DEFAULT_FIELD_CONFIG.spread,
  settleV: DEFAULT_FIELD_CONFIG.settleV,
  fieldStrength: DEFAULT_FIELD_CONFIG.fieldStrength,
  fieldDirection: DEFAULT_FIELD_CONFIG.fieldDirection,
  anchorK: DEFAULT_FIELD_CONFIG.anchorK,
  anchorRampTicks: DEFAULT_FIELD_CONFIG.anchorRampTicks,
  showComponents: false,
  showSdfs: false,
};

const DEFAULT_PORT_STORY: PortAlgConfig = {
  id: "PORT",
  leafR: 26,
  repulsionStrength: DEFAULT_PORT_CONFIG.repulsionStrength,
  restGap: DEFAULT_PORT_CONFIG.restGap,
  maxRepulsionDist: DEFAULT_PORT_CONFIG.maxRepulsionDist,
  sdfGradientEps: DEFAULT_PORT_CONFIG.sdfGradientEps,
  springK: DEFAULT_PORT_CONFIG.springK,
  springRestLength: DEFAULT_PORT_CONFIG.springRestLength,
  edgeClearance: DEFAULT_PORT_CONFIG.edgeClearance,
  edgeRepulsionK: DEFAULT_PORT_CONFIG.edgeRepulsionK,
  componentRepulsionK: DEFAULT_PORT_CONFIG.componentRepulsionK,
  damping: DEFAULT_PORT_CONFIG.damping,
  maxVelocity: DEFAULT_PORT_CONFIG.maxVelocity,
  circleThreshold: DEFAULT_PORT_CONFIG.circleThreshold,
  spread: DEFAULT_PORT_CONFIG.spread,
  settleV: DEFAULT_PORT_CONFIG.settleV,
  fieldStrength: DEFAULT_PORT_CONFIG.fieldStrength,
  fieldDirection: DEFAULT_PORT_CONFIG.fieldDirection,
  anchorK: DEFAULT_PORT_CONFIG.anchorK,
  anchorRampTicks: DEFAULT_PORT_CONFIG.anchorRampTicks,
  ltrHSpacing: DEFAULT_PORT_CONFIG.ltrHSpacing,
  ltrVSpacing: DEFAULT_PORT_CONFIG.ltrVSpacing,
  showComponents: false,
  showSdfs: false,
};

function defaultAlgConfig(id: AlgorithmId): AlgorithmConfig {
  if (id === "JANK") return DEFAULT_JANK_STORY;
  if (id === "TOPOGRID") return DEFAULT_TOPOGRID_STORY;
  if (id === "FIELD") return DEFAULT_FIELD_STORY;
  if (id === "PORT") return DEFAULT_PORT_STORY;
  return DEFAULT_SDF_STORY;
}

function makeAlgorithm(cfg: AlgorithmConfig): LayoutAlgorithm {
  if (cfg.id === "TOPOGRID") {
    return createTOPOGRID({ hSpacing: cfg.hSpacing, vSpacing: cfg.vSpacing });
  }
  if (cfg.id === "PORT") {
    const {
      id: _id,
      leafR: _r,
      showComponents: _sc,
      showSdfs: _ss,
      ...portParams
    } = cfg;
    return createPORT({ ...portParams, maxTicks: Infinity });
  }
  if (cfg.id === "FIELD") {
    const {
      id: _id,
      leafR: _r,
      showComponents: _sc,
      showSdfs: _ss,
      ...fieldParams
    } = cfg;
    return createFIELD({ ...fieldParams, maxTicks: Infinity });
  }
  if (cfg.id === "SDF") {
    const { id: _id, leafR: _r, showComponents: _sc, showSdfs: _ss, ...sdfParams } = cfg;
    return createSDF({ ...sdfParams, maxTicks: Infinity });
  }
  const { id: _id, leafR: _r, ...jankParams } = cfg;
  return createJANK({ ...jankParams, maxTicks: Infinity });
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
  /** Declared ports — enables anchor springs for matching children */
  ports?: Port[];
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
  // --- Port / anchor datasets ---
  {
    name: "Quadratic roots (ports)",
    nodes: [
      {
        id: "qr",
        label: "quadratic-roots",
        ports: [
          { name: "a", direction: "in", type: "float" },
          { name: "b", direction: "in", type: "float" },
          { name: "c", direction: "in", type: "float" },
          { name: "x1", direction: "out", type: "float" },
          { name: "x2", direction: "out", type: "float" },
        ],
        children: [
          { id: "pa", label: "a" },
          { id: "pb", label: "b" },
          { id: "pc", label: "c" },
          { id: "neg", label: "negate" },
          { id: "sq", label: "square" },
          { id: "mul", label: "multiply" },
          { id: "sub", label: "subtract" },
          { id: "sqrt", label: "sqrt" },
          { id: "add1", label: "add" },
          { id: "sub2", label: "subtract" },
          { id: "div1", label: "divide" },
          { id: "div2", label: "divide" },
          { id: "px1", label: "x1" },
          { id: "px2", label: "x2" },
        ],
        edges: [
          { id: "e1", a: "pb", b: "neg" },
          { id: "e2", a: "pb", b: "sq" },
          { id: "e3", a: "pa", b: "mul" },
          { id: "e4", a: "pc", b: "mul" },
          { id: "e5", a: "sq", b: "sub" },
          { id: "e6", a: "mul", b: "sub" },
          { id: "e7", a: "sub", b: "sqrt" },
          { id: "e8", a: "neg", b: "add1" },
          { id: "e9", a: "sqrt", b: "add1" },
          { id: "e10", a: "neg", b: "sub2" },
          { id: "e11", a: "sqrt", b: "sub2" },
          { id: "e12", a: "add1", b: "div1" },
          { id: "e13", a: "pa", b: "div1" },
          { id: "e14", a: "sub2", b: "div2" },
          { id: "e15", a: "pa", b: "div2" },
          { id: "e16", a: "div1", b: "px1" },
          { id: "e17", a: "div2", b: "px2" },
        ],
      },
    ],
    edges: [],
  },
  {
    name: "Pipeline (ports)",
    nodes: [
      {
        id: "pipe",
        label: "pipeline",
        ports: [
          { name: "input", direction: "in" },
          { name: "output", direction: "out" },
        ],
        children: [
          { id: "inp", label: "input" },
          { id: "va", label: "validate" },
          { id: "tr", label: "transform" },
          { id: "out", label: "output" },
        ],
        edges: [
          { id: "e1", a: "inp", b: "va" },
          { id: "e2", a: "va", b: "tr" },
          { id: "e3", a: "tr", b: "out" },
        ],
      },
    ],
    edges: [],
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
  cfg: AlgorithmConfig,
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
    const rawNodes = algorithm.initNodes(ids, levelEdges, d, d, new Map());
    // Attach topological charge for FIELD algorithm
    const charges = topoCharge(ids, levelEdges);
    const forceNodes = rawNodes.map((fn) => ({ ...fn, charge: charges.get(fn.id) }));
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
  cfg: AlgorithmConfig,
  algorithm: LayoutAlgorithm,
): SimState {
  const next = new Map(prev);
  const d = cfg.leafR * 2;

  // Tick deepest levels first so parent sizes are updated before parent ticks
  for (const composite of postOrderComposites(dataset.nodes)) {
    const level = next.get(composite.id);
    if (!level) continue;

    // Pin port-nodes at their boundary positions
    let nodesForTick = level.nodes;
    if (composite.ports?.length) {
      const parentId = findParentLevel(dataset.nodes, composite.id) ?? "";
      const parentLevel = next.get(parentId);
      const parentFn = parentLevel?.nodes.find((fn) => fn.id === composite.id);
      if (parentFn) {
        const halfW = parentFn.w / 2;
        const halfH = parentFn.h / 2;
        const portPositions = rectPortPositions(composite.ports, halfW, halfH, LABEL_H);
        const childByLabel = new Map((composite.children ?? []).map((c) => [c.label, c.id]));
        const pinMap = new Map<string, { x: number; y: number }>();
        for (const pp of portPositions) {
          const childId = childByLabel.get(pp.portName);
          if (childId) pinMap.set(childId, { x: pp.x, y: pp.y + LABEL_H / 2 });
        }
        if (pinMap.size > 0) {
          nodesForTick = level.nodes.map((fn) => {
            const pin = pinMap.get(fn.id);
            if (!pin) return fn;
            return { ...fn, x: pin.x, y: pin.y, vx: 0, vy: 0, pinned: true, anchor: pin };
          });
        }
      }
    }

    const edges = composite.edges ?? [];
    const { nodes: ticked } = algorithm.tick(nodesForTick, edges, level.ticks);
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
  cfg: AlgorithmConfig,
  invScale: number,
) {
  const level = sim.get(parentId);
  if (!level) return null;
  const posMap = new Map(level.nodes.map((n) => [n.id, n]));
  const r = cfg.leafR;

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
            {/* Port dots on composite boundary */}
            {n.ports?.length
              ? (() => {
                const halfW = pos.w / 2;
                const halfH = pos.h / 2;
                const pps = rectPortPositions(n.ports!, halfW, halfH, LABEL_H);
                return pps.map((pp) => (
                  <circle
                    key={pp.portName}
                    cx={pp.x}
                    cy={pp.y}
                    r={4 * invScale}
                    fill={pp.direction === "in"
                      ? "#5080d0"
                      : pp.direction === "out"
                      ? "#d08050"
                      : "#50d080"}
                    stroke="none"
                  />
                ));
              })()
              : null}
            {renderLevel(n.id, n.children!, n.edges ?? [], sim, cfg, invScale)}
          </g>
        );
      })}
      {/* Edges (on top of group boxes) — bent when SDF is active */}
      {edges.map((e) => {
        const a = posMap.get(e.a);
        const b = posMap.get(e.b);
        if (!a || !b) return null;
        if (
          (cfg.id === "SDF" || cfg.id === "FIELD" || cfg.id === "PORT") && cfg.edgeClearance > 0
        ) {
          const pts = bentEdgePoints(
            a.x,
            a.y,
            b.x,
            b.y,
            level.nodes,
            [e.a, e.b],
            cfg.edgeClearance,
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
      {(cfg.id === "SDF" || cfg.id === "FIELD" || cfg.id === "PORT") && cfg.showComponents &&
        parentId === "" && (() => {
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
      {(cfg.id === "SDF" || cfg.id === "FIELD" || cfg.id === "PORT") && cfg.showSdfs && (() => {
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
          if (isCircleShape(fn, cfg.circleThreshold)) {
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
  const [algCfg, setAlgCfg] = useState<AlgorithmConfig>(DEFAULT_SDF_STORY);
  const [configText, setConfigText] = useState(
    () => JSON.stringify(DEFAULT_SDF_STORY, null, 2),
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [sim, setSim] = useState<SimState>(() =>
    initSim(DATASETS[0], DEFAULT_SDF_STORY, makeAlgorithm(DEFAULT_SDF_STORY))
  );
  const [paused, setPaused] = useState(false);

  // Stable refs read by the RAF loop (avoids stale closures)
  const datasetIdxRef = useRef(datasetIdx);
  datasetIdxRef.current = datasetIdx;
  const algCfgRef = useRef(algCfg);
  algCfgRef.current = algCfg;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // RAF simulation loop — runs for the lifetime of the component
  useEffect(() => {
    let rafId = 0;
    function frame() {
      if (!pausedRef.current) {
        setSim((prev) => {
          const cfg = algCfgRef.current!;
          const ds = DATASETS[datasetIdxRef.current!];
          return tickSim(prev, ds, cfg, makeAlgorithm(cfg));
        });
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function applyAndRestart() {
    try {
      const parsed = JSON.parse(configText) as Partial<AlgorithmConfig>;
      const merged = {
        ...defaultAlgConfig(algCfgRef.current!.id),
        ...parsed,
        id: algCfgRef.current!.id,
      } as AlgorithmConfig;
      setAlgCfg(merged);
      setConfigError(null);
      setSim(initSim(DATASETS[datasetIdxRef.current!], merged, makeAlgorithm(merged)));
    } catch (e) {
      setConfigError(String(e));
    }
  }

  function restart() {
    setSim(initSim(DATASETS[datasetIdx], algCfg, makeAlgorithm(algCfg)));
  }

  function handleDatasetChange(idx: number) {
    setDatasetIdx(idx);
    setSim(initSim(DATASETS[idx], algCfg, makeAlgorithm(algCfg)));
  }

  function handleAlgorithmChange(id: AlgorithmId) {
    const newCfg = defaultAlgConfig(id);
    setAlgCfg(newCfg);
    setConfigText(JSON.stringify(newCfg, null, 2));
    setConfigError(null);
    setSim(initSim(DATASETS[datasetIdx], newCfg, makeAlgorithm(newCfg)));
  }

  const dataset = DATASETS[datasetIdx];

  // Stats: aggregate across all levels
  let totalMv = 0;
  for (const [, level] of sim) {
    totalMv = Math.max(totalMv, maxVelocity(level.nodes));
  }
  const rootTicks = sim.get("")?.ticks ?? 0;
  const settled = totalMv < ("settleV" in algCfg ? algCfg.settleV : 0);

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
            <option value="JANK" selected={algCfg.id === "JANK"}>JANK</option>
            <option value="TOPOGRID" selected={algCfg.id === "TOPOGRID"}>TOPOGRID</option>
            <option value="SDF" selected={algCfg.id === "SDF"}>SDF</option>
            <option value="FIELD" selected={algCfg.id === "FIELD"}>FIELD</option>
            <option value="PORT" selected={algCfg.id === "PORT"}>PORT</option>
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
                setConfigText(JSON.stringify(algCfg, null, 2));
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
          {renderLevel("", dataset.nodes, dataset.edges, sim, algCfg, 1 / scale)}
        </g>
      </svg>
    </div>
  );
}
