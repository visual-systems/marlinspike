/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { Canvas } from "../components/canvas.tsx";
import { defaultState, makeNode, type Updater, type WorkspaceState } from "../workspace.ts";

export const meta = { title: "Canvas" };

function StoryWrapper({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  return (
    <div style="position:relative; width:900px; height:600px; border:1px solid #2a2a4a;">
      <Canvas ws={ws} update={update} />
    </div>
  );
}

export function Default() {
  const ws = defaultState();
  ws.canvasExpandedNodes = [];
  return <StoryWrapper initial={ws} />;
}

export function WithExpanded() {
  const ws = defaultState();
  ws.canvasExpandedNodes = ["spike://acme/backend"];
  return <StoryWrapper initial={ws} />;
}

export function DeepExpanded() {
  const ws = defaultState();
  ws.canvasExpandedNodes = ["spike://acme/backend", "spike://acme/backend/auth-service"];
  return <StoryWrapper initial={ws} />;
}

export function WithEdgesAndSelection() {
  const ws = defaultState();
  const fromId = "spike://acme/backend/auth-service";
  const toId = "spike://acme/backend/frontend";
  ws.edges = [{ id: "edge-1", fromId, toId, label: "depends on", data: {}, version: 1 }];
  ws.canvasExpandedNodes = ["spike://acme/backend"];
  ws.tabs[0].panels[0].selectedNodeId = fromId;
  return <StoryWrapper initial={ws} />;
}

export function BigGraph() {
  const ws = defaultState();
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("svc-a", "auth", "composite", [
        makeNode("svc-a-1", "token-validator", "leaf", []),
        makeNode("svc-a-2", "session-store", "leaf", []),
        makeNode("svc-a-3", "ingress", "leaf", []),
      ]),
      makeNode("svc-b", "billing", "composite", [
        makeNode("svc-b-1", "invoices", "leaf", []),
        makeNode("svc-b-2", "payments", "leaf", []),
      ]),
      makeNode("svc-c", "gateway", "composite", [
        makeNode("svc-c-1", "router", "leaf", []),
        makeNode("svc-c-2", "rate-limiter", "leaf", []),
      ]),
      makeNode("svc-d", "storage", "leaf", []),
    ]),
  ];
  ws.edges = [
    { id: "e1", fromId: "svc-a", toId: "svc-b", label: "", data: {}, version: 1 },
    { id: "e2", fromId: "svc-c", toId: "svc-a", label: "", data: {}, version: 1 },
    { id: "e3", fromId: "svc-b", toId: "svc-d", label: "", data: {}, version: 1 },
  ];
  ws.canvasExpandedNodes = ["root", "svc-a", "svc-b"];
  return <StoryWrapper initial={ws} />;
}
