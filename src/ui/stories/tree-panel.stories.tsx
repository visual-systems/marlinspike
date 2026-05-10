/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { TreePanel } from "../components/tree-panel.tsx";
import { makeNode, storyState, type Updater, type WorkspaceState } from "../workspace.ts";

export const meta = { title: "Tree Panel" };

function StoryWrapper({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));
  const panel = ws.panels[0];

  return (
    <div style="display:inline-flex; background:#14142a; border:1px solid #2a2a4a; height:500px;">
      <TreePanel panel={panel} ws={ws} update={update} />
    </div>
  );
}

export function Default() {
  const ws = storyState([
    makeNode("backend", "backend", "composite", [
      makeNode("auth", "auth-service", "leaf", []),
      makeNode("frontend", "frontend", "leaf", []),
    ]),
    makeNode("infra", "infra", "leaf", []),
  ]);
  return <StoryWrapper initial={ws} />;
}

export function WithNodeSelected() {
  const ws = storyState([
    makeNode("backend", "backend", "composite", [
      makeNode("auth", "auth-service", "leaf", []),
      makeNode("frontend", "frontend", "leaf", []),
    ]),
  ]);
  ws.panels[0].selected = { type: "node", id: "auth" };
  ws.panels[0].expandedNodes = ["backend"];
  return <StoryWrapper initial={ws} />;
}

export function WithEdgeSelected() {
  const ws = storyState([
    makeNode("backend", "backend", "composite", [
      makeNode("auth", "auth-service", "leaf", []),
      makeNode("frontend", "frontend", "leaf", []),
    ]),
  ]);
  ws.edges = [{
    id: "edge-1",
    fromId: "auth",
    toId: "frontend",
    label: "depends on",
    data: {},
    version: 1,
  }];
  ws.panels[0].selected = { type: "edge", id: "edge-1" };
  ws.panels[0].expandedNodes = ["backend"];
  return <StoryWrapper initial={ws} />;
}

export function DeepTree() {
  const ws = storyState([
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
  ]);
  ws.panels[0].expandedNodes = ["root", "a", "a1", "a2", "b"];
  return <StoryWrapper initial={ws} />;
}
