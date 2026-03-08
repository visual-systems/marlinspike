/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { TreePanel } from "../components/tree-panel.tsx";
import { defaultState, makeNode, type Updater, type WorkspaceState } from "../workspace.ts";

export const meta = { title: "Tree Panel" };

function StoryWrapper({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));
  const tab = ws.tabs[0];
  const panel = tab.panels[0];

  return (
    <div style="display:inline-flex; background:#14142a; border:1px solid #2a2a4a; height:500px;">
      <TreePanel panel={panel} tab={tab} ws={ws} update={update} />
    </div>
  );
}

export function Default() {
  return <StoryWrapper initial={defaultState()} />;
}

export function WithNodeSelected() {
  const ws = defaultState();
  const nodeId = "spike://acme/backend/auth-service";
  ws.tabs[0].panels[0].selectedNodeId = nodeId;
  ws.tabs[0].panels[0].expandedNodes = ["spike://acme/backend"];
  return <StoryWrapper initial={ws} />;
}

export function WithEdgeSelected() {
  const ws = defaultState();
  const fromId = "spike://acme/backend/auth-service";
  const toId = "spike://acme/backend/frontend";
  const edgeId = "edge-1";
  ws.edges = [{ id: edgeId, fromId, toId, label: "depends on", data: {}, version: 1 }];
  ws.tabs[0].panels[0].selectedEdgeId = edgeId;
  ws.tabs[0].panels[0].expandedNodes = ["spike://acme/backend"];
  return <StoryWrapper initial={ws} />;
}

export function DeepTree() {
  const ws = defaultState();
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("a", "services", "composite", [
        makeNode("a1", "auth", "composite", [
          makeNode("a1a", "token-validator", "leaf", []),
          makeNode("a1b", "session-store", "leaf", []),
        ]),
        makeNode("a2", "billing", "composite", [
          makeNode("a2a", "invoices", "leaf", []),
          makeNode("a2b", "payments", "leaf", []),
        ]),
      ]),
      makeNode("b", "infra", "composite", [
        makeNode("b1", "networking", "leaf", []),
        makeNode("b2", "storage", "leaf", []),
      ]),
    ]),
  ];
  ws.tabs[0].panels[0].expandedNodes = ["root", "a", "a1", "a2", "b"];
  return <StoryWrapper initial={ws} />;
}
