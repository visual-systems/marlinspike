/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { Canvas } from "../components/canvas.tsx";
import {
  defaultState,
  isRef,
  makeNode,
  makeRefNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";

export const meta = { title: "References" };

// Shorthand for leaf and composite nodes
const leaf = (id: string, label?: string) => makeNode(id, label ?? id, "leaf", []);
const group = (id: string, label: string, children: ReturnType<typeof makeNode>[]) =>
  makeNode(id, label, "composite", children);
const ref = (id: string, label: string, target: string) => makeRefNode(id, label, target);

function StoryWrapper({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  return (
    <div style="position:relative; width:900px; height:600px; border:1px solid #2a2a4a;">
      <Canvas ws={ws} update={update} />
    </div>
  );
}

/** Regular composite vs reference node vs leaf — visual comparison. */
export function ReferenceVsRegular() {
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("square", "square", "composite", [
        makeNode("x", "x", "leaf", []),
        makeNode("mul", "multiply", "leaf", []),
      ]),
      makeRefNode("use-square", "use-square", "square"),
      makeNode("main", "main", "leaf", []),
    ]),
  ];
  ws.edges = [
    { id: "e1", fromId: "use-square", toId: "main", label: "calls", data: {}, version: 1 },
  ];
  ws.canvasExpandedNodes = ["root"];
  return <StoryWrapper initial={ws} />;
}

/** One target node with three distinct references. */
export function MultipleReferences() {
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = [
    makeNode("root", "system", "composite", [
      makeNode("auth", "auth-service", "composite", [
        makeNode("validate", "validate", "leaf", []),
        makeNode("issue-token", "issue-token", "leaf", []),
      ]),
      makeRefNode("ref-auth-1", "gateway-auth", "auth"),
      makeRefNode("ref-auth-2", "billing-auth", "auth"),
      makeRefNode("ref-auth-3", "admin-auth", "auth"),
    ]),
  ];
  ws.edges = [];
  ws.canvasExpandedNodes = ["root"];
  return <StoryWrapper initial={ws} />;
}

/** Tree panel view with reference nodes showing visual indicator. */
export function ReferenceInTree() {
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("square", "square", "composite", [
        makeNode("x", "x", "leaf", []),
        makeNode("mul", "multiply", "leaf", []),
      ]),
      makeRefNode("use-sq-1", "use-square", "square"),
      makeRefNode("use-sq-2", "calc-square", "square"),
      makeNode("utils", "utils", "composite", [
        makeRefNode("ref-sq", "sq", "square"),
        makeNode("helper", "helper", "leaf", []),
      ]),
    ]),
  ];
  ws.canvasExpandedNodes = ["root", "utils"];
  return <StoryWrapper initial={ws} />;
}

/** Side-by-side visual treatment options for reference nodes. */
export function VisualTreatments() {
  const ws = defaultState();
  ws.focusId = null;
  // Each ref node represents a different visual treatment to explore:
  // dashed stroke, tinted fill, badge/icon overlay, double-stroke
  ws.treeNodes = [
    makeNode("target", "square", "composite", [
      makeNode("t-x", "x", "leaf", []),
      makeNode("t-mul", "multiply", "leaf", []),
    ]),
    makeRefNode("ref-dashed", "dashed-stroke", "square"),
    makeRefNode("ref-tinted", "tinted-fill", "square"),
    makeRefNode("ref-badge", "badge-overlay", "square"),
    makeRefNode("ref-double", "double-stroke", "square"),
  ];
  ws.canvasExpandedNodes = [];
  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5;">
        <strong style="color:#666;">Visual treatment exploration:</strong>{" "}
        Each reference node below represents the same target (<em>square</em>). Future rendering
        will distinguish them visually. Options to explore: dashed stroke, tinted fill, badge/icon
        overlay, double-stroke.
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}

/** A reference whose target doesn't exist — broken reference. */
export function BrokenReference() {
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("valid-target", "auth-service", "leaf", []),
      makeRefNode("good-ref", "use-auth", "valid-target"),
      makeRefNode("broken-ref", "use-payments", "nonexistent-node"),
      makeRefNode("remote-ref", "remote-svc", "spike://a1b2c3d4-5678-90ab-cdef-1234567890ab"),
    ]),
  ];
  ws.canvasExpandedNodes = ["root"];

  // Check which refs are broken for the description
  const allIds = new Set<string>();
  function collectIds(nodes: WorkspaceState["treeNodes"]) {
    for (const n of nodes) {
      allIds.add(n.id);
      collectIds(n.children);
    }
  }
  collectIds(ws.treeNodes);

  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5;">
        <strong style="color:#666;">Broken reference exploration:</strong>
        <ul style="padding-left:14px; margin:4px 0;">
          <li>
            <em>use-auth</em> — valid local ref (target exists)
          </li>
          <li>
            <em>use-payments</em> — broken ref (target doesn't exist)
          </li>
          <li>
            <em>remote-svc</em> — remote ref (spike:// URI, unresolvable locally)
          </li>
        </ul>
        Future rendering should show broken/remote refs with distinct visual treatment (red border,
        warning icon, dimmed).
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}

/** Inspector view for editing a reference node's target. */
export function ReferenceEditing() {
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = [
    makeNode("root", "platform", "composite", [
      makeNode("square", "square", "composite", [
        makeNode("x", "x", "leaf", []),
      ]),
      makeNode("cube", "cube", "composite", [
        makeNode("y", "y", "leaf", []),
      ]),
      makeRefNode("my-ref", "use-square", "square"),
    ]),
  ];
  ws.canvasExpandedNodes = ["root"];
  // Pre-select the ref node so the inspector opens
  ws.canvasSelected = { type: "node", id: "my-ref" };

  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5; max-width:900px;">
        <strong style="color:#666;">Reference editing exploration:</strong> The ref node
        <em>use-square</em> is pre-selected. Future inspector should show:
        <ul style="padding-left:14px; margin:4px 0;">
          <li>Drop-down picker for local nodes (square, cube)</li>
          <li>Text field for remote spike:// URI</li>
          <li>
            Current target: <code style="color:#9090c0;">square</code> (isRef:{" "}
            {String(isRef(ws.treeNodes[0].children[2]))})
          </li>
        </ul>
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}

/** Cubic roots solver — shared math primitives referenced across pipeline steps. */
export function CubicRoots() {
  const ws = defaultState();
  ws.focusId = null;

  // Shared math primitives — defined once
  const primitives = group("math", "math", [
    leaf("divide"),
    leaf("multiply"),
    leaf("square"),
    leaf("add"),
    leaf("subtract"),
    leaf("negate"),
    leaf("sqrt"),
    leaf("cbrt"),
  ]);

  // Step 1 — normalise: uses divide (3x)
  const normalise = group("normalise", "normalise", [
    leaf("norm-a", "a"),
    leaf("norm-b", "b"),
    leaf("norm-c", "c"),
    leaf("norm-d", "d"),
    ref("norm-div-1", "divide", "divide"),
    ref("norm-div-2", "divide", "divide"),
    ref("norm-div-3", "divide", "divide"),
  ]);

  // Step 2 — depressed-coefficients: uses square, multiply, subtract, divide, add
  const depressed = group("depressed", "depressed-coefficients", [
    ref("dep-square", "square", "square"),
    ref("dep-mul-1", "multiply", "multiply"),
    ref("dep-mul-2", "multiply", "multiply"),
    ref("dep-sub", "subtract", "subtract"),
    ref("dep-div-1", "divide", "divide"),
    ref("dep-div-2", "divide", "divide"),
    ref("dep-add", "add", "add"),
  ]);

  // Step 3 — cardano-terms: uses square, multiply, divide, add, subtract, negate, sqrt, cbrt
  const cardano = group("cardano", "cardano-terms", [
    ref("card-sq", "square", "square"),
    ref("card-mul", "multiply", "multiply"),
    ref("card-div-1", "divide", "divide"),
    ref("card-div-2", "divide", "divide"),
    ref("card-add", "add", "add"),
    ref("card-sub", "subtract", "subtract"),
    ref("card-neg", "negate", "negate"),
    ref("card-sqrt", "sqrt", "sqrt"),
    ref("card-cbrt-1", "cbrt", "cbrt"),
    ref("card-cbrt-2", "cbrt", "cbrt"),
  ]);

  // Step 4 — back-substitute: uses divide, add, subtract, negate
  const backSub = group("back-sub", "back-substitute", [
    ref("bs-div", "divide", "divide"),
    ref("bs-add", "add", "add"),
    ref("bs-sub-1", "subtract", "subtract"),
    ref("bs-sub-2", "subtract", "subtract"),
    ref("bs-sub-3", "subtract", "subtract"),
    ref("bs-neg", "negate", "negate"),
  ]);

  // Top-level pipeline
  const cubicRoots = group("cubic-roots", "cubic-roots", [
    ref("cr-norm", "normalise", "normalise"),
    ref("cr-dep", "depressed-coefficients", "depressed"),
    ref("cr-card", "cardano-terms", "cardano"),
    ref("cr-back", "back-substitute", "back-sub"),
  ]);

  ws.treeNodes = [primitives, normalise, depressed, cardano, backSub, cubicRoots];

  // Pipeline edges within cubic-roots
  ws.edges = [
    { id: "e-cr-1", fromId: "cr-norm", toId: "cr-dep", label: "", data: {}, version: 1 },
    { id: "e-cr-2", fromId: "cr-dep", toId: "cr-card", label: "", data: {}, version: 1 },
    { id: "e-cr-3", fromId: "cr-card", toId: "cr-back", label: "", data: {}, version: 1 },
    { id: "e-cr-4", fromId: "cr-norm", toId: "cr-back", label: "b-norm", data: {}, version: 1 },
  ];

  ws.canvasExpandedNodes = ["cubic-roots"];

  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5; max-width:900px;">
        <strong style="color:#666;">Cubic roots solver:</strong>{" "}
        Math primitives (divide, square, multiply, etc.) are defined once in <em>math</em>{" "}
        and referenced throughout the pipeline steps. Expand <em>cubic-roots</em>{" "}
        to see the pipeline flow; expand any step to see its ref nodes. Each dashed node is a
        reference to a shared primitive.
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}
