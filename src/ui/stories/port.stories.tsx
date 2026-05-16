/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { NodePorts } from "../components/port-rendering.tsx";
import { makeNode, type Port } from "@marlinspike/graph";
import { circlePortPositions, rectPortPositions } from "../lib/port-layout.ts";
import { NodeInspector } from "../components/inspector.tsx";
import { defaultState, type Updater, type WorkspaceState } from "../workspace.ts";

export const meta = { title: "Ports" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BG = "#10102a";
const GRID = "#1a1a3a";

/** Simple SVG canvas with centered origin. */
function SvgStage(
  { width, height, children }: {
    width: number;
    height: number;
    children: unknown;
  },
) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
      style={`background: ${BG}; border: 1px solid #2a2a4a; border-radius: 6px;`}
    >
      {/* axis lines */}
      <line x1={-width / 2} y1={0} x2={width / 2} y2={0} stroke={GRID} stroke-width={0.5} />
      <line x1={0} y1={-height / 2} x2={0} y2={height / 2} stroke={GRID} stroke-width={0.5} />
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Circle node port positions
// ---------------------------------------------------------------------------

const CIRCLE_R = 30;

export function CircleSingleInput() {
  const ports: Port[] = [{ name: "request", direction: "in", type: "http.Request" }];
  const positions = circlePortPositions(ports, CIRCLE_R);
  return (
    <SvgStage width={200} height={200}>
      <circle cx={0} cy={0} r={CIRCLE_R} fill="#1e1e3a" stroke="#3a3a6a" stroke-width={1.5} />
      <text x={0} y={4} fill="#808080" font-size={10} text-anchor="middle">node</text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

export function CircleSingleOutput() {
  const ports: Port[] = [{ name: "response", direction: "out", type: "http.Response" }];
  const positions = circlePortPositions(ports, CIRCLE_R);
  return (
    <SvgStage width={200} height={200}>
      <circle cx={0} cy={0} r={CIRCLE_R} fill="#1e1e3a" stroke="#3a3a6a" stroke-width={1.5} />
      <text x={0} y={4} fill="#808080" font-size={10} text-anchor="middle">node</text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

export function CircleInputsAndOutputs() {
  const ports: Port[] = [
    { name: "a", direction: "in", type: "float" },
    { name: "b", direction: "in", type: "float" },
    { name: "c", direction: "in" },
    { name: "sum", direction: "out", type: "float" },
    { name: "product", direction: "out", type: "float" },
  ];
  const positions = circlePortPositions(ports, CIRCLE_R);
  return (
    <SvgStage width={300} height={200}>
      <circle cx={0} cy={0} r={CIRCLE_R} fill="#1e1e3a" stroke="#3a3a6a" stroke-width={1.5} />
      <text x={0} y={4} fill="#808080" font-size={10} text-anchor="middle">calc</text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

export function CircleInout() {
  const ports: Port[] = [
    { name: "data", direction: "inout", type: "stream" },
    { name: "result", direction: "out" },
  ];
  const positions = circlePortPositions(ports, CIRCLE_R);
  return (
    <SvgStage width={250} height={200}>
      <circle cx={0} cy={0} r={CIRCLE_R} fill="#1e1e3a" stroke="#3a3a6a" stroke-width={1.5} />
      <text x={0} y={4} fill="#808080" font-size={10} text-anchor="middle">pipe</text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

export function CircleManyPorts() {
  const ports: Port[] = [
    { name: "in-1", direction: "in" },
    { name: "in-2", direction: "in" },
    { name: "in-3", direction: "in" },
    { name: "in-4", direction: "in" },
    { name: "out-1", direction: "out" },
    { name: "out-2", direction: "out" },
    { name: "out-3", direction: "out" },
  ];
  const positions = circlePortPositions(ports, CIRCLE_R);
  return (
    <SvgStage width={300} height={200}>
      <circle cx={0} cy={0} r={CIRCLE_R} fill="#1e1e3a" stroke="#3a3a6a" stroke-width={1.5} />
      <text x={0} y={4} fill="#808080" font-size={10} text-anchor="middle">hub</text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

// ---------------------------------------------------------------------------
// Rectangle (expanded) node port positions
// ---------------------------------------------------------------------------

const RECT_HW = 80;
const RECT_HH = 60;
const LABEL_H = 22;

export function RectInputsAndOutputs() {
  const ports: Port[] = [
    { name: "request", direction: "in", type: "http.Request" },
    { name: "config", direction: "in", type: "Config" },
    { name: "response", direction: "out", type: "http.Response" },
    { name: "error", direction: "out", type: "Error" },
  ];
  const positions = rectPortPositions(ports, RECT_HW, RECT_HH, LABEL_H);
  return (
    <SvgStage width={350} height={250}>
      <rect
        x={-RECT_HW}
        y={-RECT_HH}
        width={RECT_HW * 2}
        height={RECT_HH * 2}
        rx={4}
        fill="#1e1e3a"
        stroke="#3a3a6a"
        stroke-width={1.5}
      />
      {/* label strip */}
      <rect x={-RECT_HW} y={-RECT_HH} width={RECT_HW * 2} height={LABEL_H} rx={4} fill="#252545" />
      <text x={0} y={-RECT_HH + 15} fill="#a0a0c0" font-size={11} text-anchor="middle">
        auth-service
      </text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

export function RectManyPorts() {
  const ports: Port[] = [
    { name: "a", direction: "in" },
    { name: "b", direction: "in" },
    { name: "c", direction: "in" },
    { name: "d", direction: "in" },
    { name: "e", direction: "in" },
    { name: "x", direction: "out" },
    { name: "y", direction: "out" },
  ];
  const positions = rectPortPositions(ports, RECT_HW, RECT_HH, LABEL_H);
  return (
    <SvgStage width={350} height={250}>
      <rect
        x={-RECT_HW}
        y={-RECT_HH}
        width={RECT_HW * 2}
        height={RECT_HH * 2}
        rx={4}
        fill="#1e1e3a"
        stroke="#3a3a6a"
        stroke-width={1.5}
      />
      <rect x={-RECT_HW} y={-RECT_HH} width={RECT_HW * 2} height={LABEL_H} rx={4} fill="#252545" />
      <text x={0} y={-RECT_HH + 15} fill="#a0a0c0" font-size={11} text-anchor="middle">
        processor
      </text>
      <NodePorts ports={positions} showLabels />
    </SvgStage>
  );
}

// ---------------------------------------------------------------------------
// Inspector: port sections
// ---------------------------------------------------------------------------

export function InspectorWithPorts() {
  const child1 = makeNode("c1", "validate", "leaf", []);
  const child2 = makeNode("c2", "enrich", "leaf", []);
  const child3 = makeNode("c3", "respond", "leaf", []);
  const node = makeNode("parent", "auth-service", "composite", [child1, child2, child3]);
  node.ports = [
    { name: "validate", direction: "in", type: "http.Request" },
    { name: "respond", direction: "out", type: "http.Response" },
  ];

  const ws0 = defaultState();
  ws0.treeNodes = [node];
  ws0.edges = [
    { id: "e1", fromId: "c1", toId: "c2", label: "calls", data: {}, version: 1 },
    { id: "e2", fromId: "c2", toId: "c3", label: "calls", data: {}, version: 1 },
  ];
  ws0.panels[0].selected = { type: "node", id: node.id };

  const [ws, setWs] = useState<WorkspaceState>(ws0);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  const currentNode = ws.treeNodes[0];

  return (
    <div style="width:280px; height:600px; border:1px solid #2a2a4a; overflow:hidden;">
      <NodeInspector
        node={currentNode}
        panel={ws.panels[0]}
        ws={ws}
        update={update}
      />
    </div>
  );
}

export function InspectorAddPorts() {
  const child1 = makeNode("c1", "parse", "leaf", []);
  const child2 = makeNode("c2", "transform", "leaf", []);
  const child3 = makeNode("c3", "emit", "leaf", []);
  const child4 = makeNode("c4", "log", "leaf", []);
  const node = makeNode("parent", "pipeline", "composite", [child1, child2, child3, child4]);
  // No ports yet — user can add them

  const ws0 = defaultState();
  ws0.treeNodes = [node];
  ws0.edges = [
    { id: "e1", fromId: "c1", toId: "c2", label: "", data: {}, version: 1 },
    { id: "e2", fromId: "c2", toId: "c3", label: "", data: {}, version: 1 },
    { id: "e3", fromId: "c2", toId: "c4", label: "", data: {}, version: 1 },
  ];
  ws0.panels[0].selected = { type: "node", id: node.id };

  const [ws, setWs] = useState<WorkspaceState>(ws0);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  const currentNode = ws.treeNodes[0];

  return (
    <div>
      <div style="font-size:11px; color:#606080; margin-bottom:8px;">
        Candidates: "parse" (initial node) for input, "emit" and "log" (terminal nodes) for output
      </div>
      <div style="width:280px; height:600px; border:1px solid #2a2a4a; overflow:hidden;">
        <NodeInspector
          node={currentNode}
          panel={ws.panels[0]}
          ws={ws}
          update={update}
        />
      </div>
    </div>
  );
}
