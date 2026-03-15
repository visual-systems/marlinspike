/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { Canvas } from "../components/canvas.tsx";
import { validateWorkspace } from "../../graph/validate_workspace.ts";
import {
  LABEL_REQUIRED_CONSTRAINT,
  MAX_GROUP_SIZE_CONSTRAINT,
} from "../../graph/builtin_constraints.ts";
import {
  defaultConstraintsPanel,
  defaultState,
  makeNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";

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
  ws.tabs[0].panels[0].selected = { type: "node", id: fromId };
  return <StoryWrapper initial={ws} />;
}

export function BidirectionalEdges() {
  const ws = defaultState();
  const fromId = "spike://acme/backend/auth-service";
  const toId = "spike://acme/backend/frontend";
  ws.edges = [
    { id: "edge-1", fromId, toId, label: "calls", data: {}, version: 1 },
    { id: "edge-2", fromId: toId, toId: fromId, label: "responds", data: {}, version: 1 },
  ];
  ws.canvasExpandedNodes = ["spike://acme/backend"];
  return <StoryWrapper initial={ws} />;
}

export function EdgeConfigurations() {
  const ws = defaultState();
  // Six isolated nodes: pairs for each edge configuration
  ws.treeNodes = [
    makeNode("a1", "sender", "leaf", []),
    makeNode("b1", "receiver", "leaf", []),
    makeNode("a2", "ping", "leaf", []),
    makeNode("b2", "pong", "leaf", []),
    makeNode("a3", "writer", "leaf", []),
    makeNode("b3", "store", "leaf", []),
  ];
  ws.edges = [
    // Single directed edge: a1 -> b1
    { id: "e1", fromId: "a1", toId: "b1", label: "a→b", data: {}, version: 1 },
    // Bidirectional pair: a2 <-> b2
    { id: "e2", fromId: "a2", toId: "b2", label: "ping", data: {}, version: 1 },
    { id: "e3", fromId: "b2", toId: "a2", label: "pong", data: {}, version: 1 },
    // Two parallel same-direction edges: a3 =>> b3
    { id: "e4", fromId: "a3", toId: "b3", label: "write", data: {}, version: 1 },
    { id: "e5", fromId: "a3", toId: "b3", label: "flush", data: {}, version: 1 },
  ];
  ws.canvasExpandedNodes = [];
  return <StoryWrapper initial={ws} />;
}

export function EdgeAddition() {
  const ws = defaultState();
  ws.canvasExpandedNodes = [];
  ws.edges = [];
  return <StoryWrapper initial={ws} />;
}

export function ExpandedEdges() {
  // group-a must be a child (not root-level) to get a rendered bounding-box rect.
  // Root-level expanded nodes float freely without a box.
  const ws = defaultState();
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("group-a", "frontend", "composite", [
        makeNode("ui", "UI", "leaf", []),
        makeNode("data", "Data", "leaf", []),
      ]),
      makeNode("svc", "auth-service", "leaf", []),
    ]),
  ];
  ws.edges = [
    { id: "e1", fromId: "group-a", toId: "svc", label: "calls", data: {}, version: 1 },
    { id: "e2", fromId: "svc", toId: "group-a", label: "responds", data: {}, version: 1 },
    { id: "e3", fromId: "group-a", toId: "svc", label: "events", data: {}, version: 1 },
  ];
  ws.canvasExpandedNodes = ["root", "group-a"];
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

/** Node pre-selected with a failing constraint attached — tests clicking the constraint
 *  label in the canvas inspector to navigate to the constraint inspector. */
export function ConstraintInspection() {
  const ws = defaultState();
  ws.treeNodes = [
    makeNode("node-a", "auth-service", "leaf", []),
    makeNode("node-b", "", "leaf", []),
  ];
  ws.constraints = [{ ...LABEL_REQUIRED_CONSTRAINT }];
  ws.constraintApplications = [
    { id: "app-1", constraintId: LABEL_REQUIRED_CONSTRAINT.id, entityId: "node-a", version: 1 },
    { id: "app-2", constraintId: LABEL_REQUIRED_CONSTRAINT.id, entityId: "node-b", version: 1 },
  ];
  // Pre-select node-a so the entity inspector is already open
  ws.canvasSelected = { type: "node", id: "node-a" };
  // Add a constraints panel so navigating to the constraint inspector has somewhere to land
  ws.tabs[0].panels.push(defaultConstraintsPanel());

  const [state, setState] = useState<WorkspaceState>(ws);
  const update: Updater = (fn) => setState((prev) => fn(prev));
  const diagnostics = validateWorkspace(state, state.constraintApplications);

  return (
    <div style="display:flex; gap:8px;">
      <div style="position:relative; width:700px; height:600px; border:1px solid #2a2a4a;">
        <Canvas ws={state} update={update} diagnostics={diagnostics} />
      </div>
      <div style="font-size:11px; color:#555; max-width:180px; line-height:1.5;">
        <strong style="color:#666;">Steps:</strong>
        <ol style="padding-left:14px; margin:6px 0;">
          <li>
            Click <em>auth-service</em> node to open entity inspector
          </li>
          <li>
            Click the <em>Label Required</em> constraint label in the inspector
          </li>
          <li>
            Canvas inspector should close; constraints panel (right) should open the constraint
          </li>
        </ol>
      </div>
    </div>
  );
}

export function Diagnostics() {
  // node-no-label: leaf node with empty label — violates LABEL_REQUIRED → error badge
  // node-big-group: composite node with 6 children — violates MAX_GROUP_SIZE → warning badge
  const ws = defaultState();
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("node-no-label", "", "leaf", []),
      makeNode("node-big-group", "big-group", "composite", [
        makeNode("c1", "child-1", "leaf", []),
        makeNode("c2", "child-2", "leaf", []),
        makeNode("c3", "child-3", "leaf", []),
        makeNode("c4", "child-4", "leaf", []),
        makeNode("c5", "child-5", "leaf", []),
        makeNode("c6", "child-6", "leaf", []),
      ]),
    ]),
  ];
  ws.constraints = [LABEL_REQUIRED_CONSTRAINT, MAX_GROUP_SIZE_CONSTRAINT];
  ws.constraintApplications = [
    {
      id: "app-1",
      constraintId: LABEL_REQUIRED_CONSTRAINT.id,
      entityId: "node-no-label",
      version: 1,
    },
    {
      id: "app-2",
      constraintId: MAX_GROUP_SIZE_CONSTRAINT.id,
      entityId: "node-big-group",
      version: 1,
    },
  ];
  ws.canvasExpandedNodes = ["root", "node-big-group"];

  const [state, setState] = useState<WorkspaceState>(ws);
  const update: Updater = (fn) => setState((prev) => fn(prev));
  const diagnostics = validateWorkspace(state, state.constraintApplications);

  return (
    <div style="position:relative; width:900px; height:600px; border:1px solid #2a2a4a;">
      <Canvas ws={state} update={update} diagnostics={diagnostics} />
    </div>
  );
}
