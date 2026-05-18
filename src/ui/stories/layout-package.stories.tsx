/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  boundingBox,
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
} from "@marlinspike/layout";
import type { CanvasEdge, CanvasNode, CanvasScene } from "@marlinspike/canvas";
import { marlinTheme, renderScene, renderWith, svgRenderer } from "@marlinspike/canvas";

export const meta = { title: "Package: @marlinspike-layout" };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SECTION = "margin-bottom:32px;";
const HEADING = "font-size:16px; font-weight:bold; margin-bottom:4px; color:#c0c0e0;";
const DESCRIPTION =
  "font-size:12px; color:#888; margin-bottom:12px; line-height:1.6; max-width:720px;";
const CALLOUT =
  "background:#1a1a30; border-left:3px solid #5a5a8a; padding:8px 12px; font-size:11px; color:#a0a0c0; margin-bottom:12px; line-height:1.5;";
const BTN =
  "background:#2a2a4a; color:#e0e0e0; border:1px solid #3a3a5a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:12px;";
const TAG =
  "display:inline-block; background:#2a2a4a; color:#9090c0; padding:1px 6px; border-radius:3px; font-size:10px; font-family:monospace; margin-right:4px;";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALGORITHMS: Record<string, () => LayoutAlgorithm> = {
  JANK: () => createJANK(DEFAULT_JANK_CONFIG),
  SDF: () => createSDF(DEFAULT_SDF_CONFIG),
  FIELD: () => createFIELD(DEFAULT_FIELD_CONFIG),
  TOPOGRID: () => createTOPOGRID(DEFAULT_TOPOGRID_CONFIG),
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
  return renderWith(svgRenderer(), root);
}

// ---------------------------------------------------------------------------
// Story: Layout + Canvas composition
// ---------------------------------------------------------------------------

export function Composition() {
  const [algoId, setAlgoId] = useState<string>("SDF");
  const [ticks, setTicks] = useState(0);
  const [nodes, setNodes] = useState<ForceNode[]>([]);
  const [settled, setSettled] = useState(false);
  const algoRef = useRef<LayoutAlgorithm | null>(null);
  const rafRef = useRef<number | null>(null);

  const edges: ForceEdge[] = [
    { a: "A", b: "B" },
    { a: "A", b: "C" },
    { a: "B", b: "D" },
    { a: "C", b: "D" },
    { a: "D", b: "E" },
  ];
  const ids = ["A", "B", "C", "D", "E"];

  // Initialize algorithm
  useEffect(() => {
    const algo = ALGORITHMS[algoId]();
    algoRef.current = algo;
    let initNodes = algo.initNodes(ids, edges, 52, 52, new Map());

    // Assign charge for FIELD algorithm
    if (algoId === "FIELD") {
      const charges = topoCharge(ids, edges);
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
        const result = algo.tick(nodes, edges, t);
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

  const scene = toCanvasScene(nodes, edges);
  const svgContent = nodes.length > 0 ? renderSvg(scene) : "";

  // Compute viewBox from bounding box
  const bb = nodes.length > 0 ? boundingBox(nodes, 40) : { minX: -200, minY: -200, w: 400, h: 400 };
  const mv = maxVelocity(nodes);

  return (
    <div style="padding:24px; color:#e0e0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Layout + Canvas Composition</div>
        <div style={DESCRIPTION}>
          This demo composes <code>@marlinspike/layout</code> (force simulation) with{" "}
          <code>@marlinspike/canvas</code>{" "}
          (rendering). Layout computes positions, canvas renders the scene. No shared dependency —
          just structural compatibility.
        </div>
        <div style={CALLOUT}>
          <strong>Pattern:</strong> ForceNode[] → CanvasScene → renderScene() → SVG
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
