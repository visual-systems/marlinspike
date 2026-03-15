/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { EdgeInspector, NodeInspector } from "../components/inspector.tsx";
import {
  defaultState,
  makeNode,
  type Panel,
  type Tab,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";

export const meta = { title: "Inspector" };

function makeStory(initial: WorkspaceState) {
  const tab = initial.tabs[0];
  const panel = initial.tabs[0].panels[0];
  return { tab, panel, initial };
}

// ---------------------------------------------------------------------------
// NodeInspector stories
// ---------------------------------------------------------------------------

export function NodeLeaf() {
  const ws0 = defaultState();
  const { tab, initial } = makeStory(ws0);
  const panel = initial.tabs[0].panels[0];
  const node = makeNode(
    "node-1",
    "token-validator",
    "leaf",
    [],
    "spike://acme/auth/token-validator",
  );

  const [ws, setWs] = useState<WorkspaceState>({ ...initial, treeNodes: [node] });
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  return (
    <div style="width:280px; height:500px; border:1px solid #2a2a4a; overflow:hidden;">
      <NodeInspector node={node} panel={panel} tab={tab} ws={ws} update={update} />
    </div>
  );
}

export function NodeComposite() {
  const child1 = makeNode("child-1", "ingress", "leaf", []);
  const child2 = makeNode("child-2", "session-store", "leaf", []);
  const node = makeNode("parent-1", "auth-service", "composite", [child1, child2]);

  const ws0 = defaultState();
  ws0.treeNodes = [node];
  ws0.tabs[0].panels[0].selected = { type: "node", id: node.id };

  const { tab, panel, initial } = makeStory(ws0);
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  const currentNode = ws.treeNodes[0];

  return (
    <div style="width:280px; height:500px; border:1px solid #2a2a4a; overflow:hidden;">
      <NodeInspector node={currentNode} panel={panel} tab={tab} ws={ws} update={update} />
    </div>
  );
}

export function NodeWithEdges() {
  const sibling = makeNode("sibling-1", "frontend", "leaf", []);
  const node = makeNode("node-1", "auth-service", "leaf", []);
  const parent = makeNode("root-1", "acme/backend", "composite", [node, sibling]);

  const ws0 = defaultState();
  ws0.treeNodes = [parent];
  ws0.edges = [
    { id: "e1", fromId: node.id, toId: sibling.id, label: "calls", data: {}, version: 1 },
  ];
  ws0.tabs[0].panels[0].selected = { type: "node", id: node.id };
  ws0.tabs[0].panels[0].expandedNodes = [parent.id];

  const { tab, initial } = makeStory(ws0);
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  // Find current node from current ws (it may be updated)
  const currentParent = ws.treeNodes[0];
  const currentNode = currentParent.children[0];

  return (
    <div style="width:280px; height:500px; border:1px solid #2a2a4a; overflow:hidden;">
      <NodeInspector
        node={currentNode}
        panel={ws.tabs[0].panels[0]}
        tab={tab}
        ws={ws}
        update={update}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EdgeInspector stories
// ---------------------------------------------------------------------------

function makeEdgeStory() {
  const node1 = makeNode("n1", "auth-service", "leaf", []);
  const node2 = makeNode("n2", "frontend", "leaf", []);
  const parent = makeNode("root", "acme/backend", "composite", [node1, node2]);

  const edge = { id: "e1", fromId: node1.id, toId: node2.id, label: "calls", data: {}, version: 1 };

  const ws0 = defaultState();
  ws0.treeNodes = [parent];
  ws0.edges = [edge];
  ws0.tabs[0].panels[0].selected = { type: "edge", id: edge.id };

  return { ws0, edge };
}

export function EdgeBasic() {
  const { ws0, edge } = makeEdgeStory();
  const tab: Tab = ws0.tabs[0];
  const panel: Panel = ws0.tabs[0].panels[0];

  const [ws, setWs] = useState<WorkspaceState>(ws0);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  const currentEdge = ws.edges.find((e) => e.id === edge.id) ?? edge;

  return (
    <div style="width:280px; height:400px; border:1px solid #2a2a4a; overflow:hidden;">
      <EdgeInspector edge={currentEdge} panel={panel} tab={tab} ws={ws} update={update} />
    </div>
  );
}

export function EdgeUnlabelled() {
  const node1 = makeNode("n1", "billing", "leaf", []);
  const node2 = makeNode("n2", "payments", "leaf", []);
  const parent = makeNode("root", "services", "composite", [node1, node2]);

  const edge = { id: "e1", fromId: node1.id, toId: node2.id, label: "", data: {}, version: 1 };

  const ws0 = defaultState();
  ws0.treeNodes = [parent];
  ws0.edges = [edge];
  ws0.tabs[0].panels[0].selected = { type: "edge", id: edge.id };

  const tab: Tab = ws0.tabs[0];
  const panel: Panel = ws0.tabs[0].panels[0];

  const [ws, setWs] = useState<WorkspaceState>(ws0);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  const currentEdge = ws.edges.find((e) => e.id === edge.id) ?? edge;

  return (
    <div style="width:280px; height:400px; border:1px solid #2a2a4a; overflow:hidden;">
      <EdgeInspector edge={currentEdge} panel={panel} tab={tab} ws={ws} update={update} />
    </div>
  );
}
