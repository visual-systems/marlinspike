/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  boundingBox,
  centerNodes,
  createFIELD,
  createJANK,
  createSDF,
  createTOPOGRID,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_JANK_CONFIG,
  DEFAULT_SDF_CONFIG,
  DEFAULT_TOPOGRID_CONFIG,
  type ForceEdge,
  type ForceNode,
  type LayoutAlgorithm,
  maxVelocity,
  topoCharge,
  topoGridLayout,
} from "@marlinspike/layout";
import type { CanvasEdge, CanvasNode, CanvasScene } from "@marlinspike/canvas";
import { hitTest, marlinTheme, renderScene, renderWith, svgRenderer } from "@marlinspike/canvas";

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
    shape: n.shape ?? "circle",
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
    { id: "C", x: 280, y: 400, vx: 0, vy: 0, pinned: false, w: 80, h: 60, shape: "rect" },
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
    { id: "n1", x: 150, y: 200, w: 52, h: 52, shape: "circle", label: "A" },
    { id: "n2", x: 300, y: 120, w: 52, h: 52, shape: "circle", label: "B" },
    { id: "n3", x: 300, y: 280, w: 52, h: 52, shape: "circle", label: "C" },
    { id: "n4", x: 450, y: 200, w: 52, h: 52, shape: "circle", label: "D" },
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
      const result = a.tick(forceNodesRef.current, forceEdges, tick++);
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
        { id, x, y, w: 52, h: 52, shape: "circle" as const, label: `N${flNodeCounter}` },
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
