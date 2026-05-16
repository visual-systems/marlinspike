/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import type { CanvasEdge, CanvasNode, CanvasPort, CanvasScene } from "@marlinspike/canvas";
import {
  circlePortPositions,
  marlinTheme,
  renderScene,
  renderWith,
  surfacePoint,
  svgRenderer,
} from "@marlinspike/canvas";

export const meta = { title: "Package: @marlinspike-canvas" };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PRE =
  "background:#0f0f22; padding:12px; border-radius:4px; font-size:12px; line-height:1.5; overflow:auto; max-height:500px; white-space:pre-wrap; font-family:monospace;";

const SECTION = "margin-bottom:32px;";

const HEADING = "font-size:16px; font-weight:bold; margin-bottom:4px; color:#c0c0e0;";

const SUBHEADING = "font-size:13px; font-weight:600; margin-bottom:6px; color:#a0a0d0;";

const DESCRIPTION =
  "font-size:12px; color:#888; margin-bottom:12px; line-height:1.6; max-width:720px;";

const CALLOUT =
  "background:#1a1a30; border-left:3px solid #5a5a8a; padding:8px 12px; font-size:11px; color:#a0a0c0; margin-bottom:12px; line-height:1.5;";

const TAG =
  "display:inline-block; background:#2a2a4a; color:#9090c0; padding:1px 6px; border-radius:3px; font-size:10px; font-family:monospace; margin-right:4px;";

const BTN =
  "background:#2a2a4a; color:#e0e0e0; border:1px solid #3a3a5a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:12px;";

// ---------------------------------------------------------------------------
// SVG canvas renderer — renders a RenderGroup into innerHTML
// ---------------------------------------------------------------------------

function SvgCanvas(
  { scene, width, height }: { scene: CanvasScene; width: number; height: number },
) {
  const group = renderScene(scene, marlinTheme);
  const [svgContent] = renderWith(svgRenderer, group);
  return (
    <div
      dangerouslySetInnerHTML={{
        __html:
          `<svg width="${width}" height="${height}" style="background:${marlinTheme.background}; border-radius:4px;">${svgContent}</svg>`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Story: SceneTypes
// ---------------------------------------------------------------------------

export function SceneTypes() {
  const scene: CanvasScene = {
    nodes: [
      { id: "a", x: 100, y: 100, w: 52, h: 52, shape: "circle", label: "Input" },
      { id: "b", x: 250, y: 80, w: 52, h: 52, shape: "circle", label: "Process" },
      {
        id: "c",
        x: 400,
        y: 100,
        w: 100,
        h: 60,
        shape: "rect",
        label: "Output",
        selected: true,
      },
      {
        id: "d",
        x: 250,
        y: 200,
        w: 52,
        h: 52,
        shape: "circle",
        label: "Ref",
        dashed: true,
      },
    ],
    edges: [
      { id: "e1", fromId: "a", toId: "b" },
      { id: "e2", fromId: "b", toId: "c", label: "data" },
      { id: "e3", fromId: "d", toId: "b" },
    ],
  };

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>CanvasScene — Scene Graph Types</div>
        <div style={DESCRIPTION}>
          A <span style={TAG}>CanvasScene</span>{" "}
          is a flat collection of positioned nodes and edges. Nodes carry shape, dimensions, and
          optional port positions. Edges reference nodes by ID. The scene is a plain data structure
          — rendering is a pure function of scene + theme.
        </div>

        <div style={SUBHEADING}>Rendered Scene</div>
        <SvgCanvas scene={scene} width={520} height={260} />

        <div style={SUBHEADING}>Scene Data</div>
        <div style={CALLOUT}>
          Circle nodes (Input, Process, Ref), rect node (Output), 3 directed edges. The "Output"
          node is selected (blue stroke), "Ref" is dashed (reference node style).
        </div>
        <pre style={PRE}>{JSON.stringify(scene, null, 2)}</pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Geometry
// ---------------------------------------------------------------------------

export function Geometry() {
  const nodeA: CanvasNode = {
    id: "a",
    x: 120,
    y: 130,
    w: 52,
    h: 52,
    shape: "circle",
    label: "A",
  };
  const nodeB: CanvasNode = {
    id: "b",
    x: 350,
    y: 130,
    w: 100,
    h: 60,
    shape: "rect",
    label: "B",
  };

  const sp = surfacePoint(nodeA, nodeB, 5);
  const sp2 = surfacePoint(nodeB, nodeA, 5);

  // Port positions
  const ports: CanvasPort[] = circlePortPositions(
    [
      { name: "in", direction: "in" },
      { name: "out", direction: "out" },
    ],
    26,
  );

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Geometry Helpers</div>
        <div style={DESCRIPTION}>
          Pure geometry functions for surface clipping, arc math, SDF primitives, and port
          positioning. These are the building blocks for both rendering and layout algorithms.
        </div>

        <div style={SUBHEADING}>Surface Clipping</div>
        <div style={CALLOUT}>
          <span style={TAG}>surfacePoint(from, to, gap)</span>{" "}
          computes where an edge exits a node's boundary. Circle A clips at radius, rect B clips at
          AABB boundary.
        </div>
        <svg width={500} height={260} style="background:#0d0d1e; border-radius:4px;">
          {/* Node A (circle) */}
          <circle cx={nodeA.x} cy={nodeA.y} r={26} fill="#111125" stroke="#252545" />
          <text
            x={nodeA.x}
            y={nodeA.y + 3}
            text-anchor="middle"
            fill="#777799"
            font-size="9"
          >
            A (circle)
          </text>

          {/* Node B (rect) */}
          <rect
            x={nodeB.x - 50}
            y={nodeB.y - 30}
            width={100}
            height={60}
            rx={4}
            fill="#111125"
            stroke="#252545"
          />
          <text
            x={nodeB.x}
            y={nodeB.y + 3}
            text-anchor="middle"
            fill="#777799"
            font-size="9"
          >
            B (rect)
          </text>

          {/* Edge between surface points */}
          <line
            x1={sp.x}
            y1={sp.y}
            x2={sp2.x}
            y2={sp2.y}
            stroke="#5070c0"
            stroke-width={1.5}
          />

          {/* Surface point markers */}
          <circle cx={sp.x} cy={sp.y} r={4} fill="#50c070" />
          <circle cx={sp2.x} cy={sp2.y} r={4} fill="#50c070" />

          {/* Labels */}
          <text x={sp.x} y={sp.y - 8} text-anchor="middle" fill="#50c070" font-size="9">
            surfacePoint(A→B)
          </text>
          <text x={sp2.x} y={sp2.y - 8} text-anchor="middle" fill="#50c070" font-size="9">
            surfacePoint(B→A)
          </text>
        </svg>

        <div style={SUBHEADING}>Port Positions</div>
        <div style={CALLOUT}>
          <span style={TAG}>circlePortPositions(ports, radius)</span>{" "}
          computes positions on the node boundary. Inputs on the left semicircle, outputs on the
          right.
        </div>
        <svg width={200} height={200} style="background:#0d0d1e; border-radius:4px;">
          <g transform="translate(100, 100)">
            <circle cx={0} cy={0} r={40} fill="#111125" stroke="#252545" />
            {ports.map((p) => (
              <g key={p.name}>
                <circle
                  cx={p.x * (40 / 26)}
                  cy={p.y * (40 / 26)}
                  r={5}
                  fill={p.direction === "out" ? "#cc8844" : "#6688cc"}
                />
                <text
                  x={p.x * (40 / 26) + p.nx * 15}
                  y={p.y * (40 / 26) + p.ny * 15 + 3}
                  text-anchor="middle"
                  fill="#888"
                  font-size="9"
                >
                  {p.name}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Styles
// ---------------------------------------------------------------------------

export function Styles() {
  const baseNodes: CanvasNode[] = [
    { id: "n1", x: 80, y: 60, w: 52, h: 52, shape: "circle", label: "Default" },
    { id: "n2", x: 200, y: 60, w: 52, h: 52, shape: "circle", label: "Selected", selected: true },
    {
      id: "n3",
      x: 320,
      y: 60,
      w: 52,
      h: 52,
      shape: "circle",
      label: "Highlighted",
      highlighted: true,
    },
    { id: "n4", x: 440, y: 60, w: 52, h: 52, shape: "circle", label: "Dashed", dashed: true },
  ];
  const scene: CanvasScene = { nodes: baseNodes, edges: [] };

  // Custom theme (light)
  const lightNodes = baseNodes.map((n) => ({ ...n, y: 60 }));
  const lightScene: CanvasScene = { nodes: lightNodes, edges: [] };
  const lightGroup = renderScene(lightScene, {
    node: () => ({
      fill: "#f0f0f5",
      stroke: "#333",
      strokeWidth: 1,
      labelFill: "#222",
      labelFont: "sans-serif",
      labelSize: 9,
    }),
    edge: () => ({
      stroke: "#333",
      strokeWidth: 1,
      arrowSize: 10,
      labelFill: "#555",
      labelFont: "sans-serif",
      labelSize: 10,
    }),
    port: () => ({ fill: "#666", stroke: "none", radius: 3 }),
    background: "#f5f5fa",
  });
  const [lightSvg] = renderWith(svgRenderer, lightGroup);

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Style System</div>
        <div style={DESCRIPTION}>
          The <span style={TAG}>CanvasTheme</span>{" "}
          interface provides pluggable style resolvers. Each resolver receives the element being
          rendered and returns concrete visual properties. The same scene data can be rendered with
          entirely different themes.
        </div>

        <div style={SUBHEADING}>Marlinspike Dark Theme (default)</div>
        <SvgCanvas scene={scene} width={520} height={120} />

        <div style={SUBHEADING}>Custom Light Theme</div>
        <div
          dangerouslySetInnerHTML={{
            __html:
              `<svg width="520" height="120" style="background:#f5f5fa; border-radius:4px;">${lightSvg}</svg>`,
          }}
        />

        <div style={CALLOUT}>
          Same scene data, different <span style={TAG}>CanvasTheme</span>{" "}
          implementation. Themes are just functions — no class hierarchy or registration needed.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: FigmaLite — interactive canvas
// ---------------------------------------------------------------------------

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(): string {
  return `n${++nodeCounter}`;
}

function nextEdgeId(): string {
  return `e${++edgeCounter}`;
}

export function FigmaLite() {
  const [nodes, setNodes] = useState<CanvasNode[]>([
    { id: "n0", x: 200, y: 150, w: 52, h: 52, shape: "circle", label: "Start" },
  ]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "add-node" | "add-edge">("select");
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [dragState, setDragState] = useState<
    {
      id: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    } | null
  >(null);

  const W = 600;
  const H = 400;

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

  function handleSvgClick(e: MouseEvent) {
    const svg = (e.currentTarget as Element).querySelector?.("svg") ??
      (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "add-node") {
      const id = nextNodeId();
      setNodes((prev) => [
        ...prev,
        {
          id,
          x,
          y,
          w: 52,
          h: 52,
          shape: "circle" as const,
          label: `N${nodeCounter}`,
        },
      ]);
      setSelectedId(id);
      return;
    }

    if (mode === "add-edge") {
      // Find clicked node
      const clickedNode = nodes.find((n) => {
        const dx = x - n.x, dy = y - n.y;
        if (n.shape === "circle") return dx * dx + dy * dy <= (n.w / 2) ** 2;
        return Math.abs(dx) <= n.w / 2 && Math.abs(dy) <= n.h / 2;
      });
      if (!clickedNode) return;

      if (!edgeFrom) {
        setEdgeFrom(clickedNode.id);
      } else if (clickedNode.id !== edgeFrom) {
        setEdges((prev) => [
          ...prev,
          { id: nextEdgeId(), fromId: edgeFrom!, toId: clickedNode.id },
        ]);
        setEdgeFrom(null);
      }
      return;
    }

    // Select mode — check if clicked on a node
    const clickedNode = nodes.find((n) => {
      const dx = x - n.x, dy = y - n.y;
      if (n.shape === "circle") return dx * dx + dy * dy <= (n.w / 2) ** 2;
      return Math.abs(dx) <= n.w / 2 && Math.abs(dy) <= n.h / 2;
    });
    setSelectedId(clickedNode?.id ?? null);
  }

  function handleMouseDown(e: MouseEvent) {
    if (mode !== "select") return;
    const svg = (e.currentTarget as Element).querySelector?.("svg") ??
      (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickedNode = nodes.find((n) => {
      const dx = x - n.x, dy = y - n.y;
      if (n.shape === "circle") return dx * dx + dy * dy <= (n.w / 2) ** 2;
      return Math.abs(dx) <= n.w / 2 && Math.abs(dy) <= n.h / 2;
    });
    if (clickedNode) {
      setDragState({
        id: clickedNode.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: clickedNode.x,
        origY: clickedNode.y,
      });
      setSelectedId(clickedNode.id);
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
      setNodes((prev) => prev.filter((n) => n.id !== selectedId));
      setEdges((prev) =>
        prev.filter((edge) => edge.fromId !== selectedId && edge.toId !== selectedId)
      );
      setSelectedId(null);
    }
  }

  return (
    <div
      style="padding:16px; color:#c0c0e0; font-family:sans-serif;"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div style={SECTION}>
        <div style={HEADING}>Figma Lite — Interactive Canvas</div>
        <div style={DESCRIPTION}>
          A minimal interactive canvas built entirely with{" "}
          <span style={TAG}>
            @marlinspike/canvas
          </span>. Demonstrates the programmatic API: scene as immutable data, rendering as a pure
          function, updates via state replacement.
        </div>

        <div style="display:flex; gap:8px; margin-bottom:8px;">
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
          <span style="font-size:11px; color:#666; padding-top:5px; margin-left:8px;">
            {mode === "add-node"
              ? "Click canvas to place a node"
              : mode === "add-edge"
              ? edgeFrom ? "Click target node" : "Click source node"
              : "Click to select, drag to move, Backspace to delete"}
          </span>
        </div>

        <div
          onClick={handleSvgClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={`cursor:${
            mode === "add-node" ? "crosshair" : mode === "add-edge" ? "crosshair" : "default"
          };`}
          dangerouslySetInnerHTML={{
            __html:
              `<svg width="${W}" height="${H}" style="background:${marlinTheme.background}; border-radius:4px; outline:1px solid #1e1e44;">${svgContent}</svg>`,
          }}
        />

        <div style={CALLOUT}>
          <strong>How it works:</strong> The canvas is a pure function of
          <span style={TAG}>CanvasScene</span>{" "}
          data. User interactions update the scene state (immutable replacement), which triggers a
          re-render through
          <span style={TAG}>renderScene(scene, theme)</span> and the
          <span style={TAG}>svgRenderer</span>. No direct DOM mutation.
        </div>

        <div style={SUBHEADING}>Current Scene ({nodes.length} nodes, {edges.length} edges)</div>
        <pre style={PRE + " max-height:200px;"}>
          {JSON.stringify({ nodes, edges }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
