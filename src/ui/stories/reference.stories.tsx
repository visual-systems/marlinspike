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
import { spikeToGraph } from "../../code/spike-clojure.ts";

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

  const e = (id: string, from: string, to: string, label = "") => ({
    id,
    fromId: from,
    toId: to,
    label,
    data: {},
    version: 1,
  });

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

  // Step 1 — normalise: {:b (divide b a), :c (divide c a), :d (divide d a)}
  const normalise = group("normalise", "normalise", [
    leaf("norm-a", "a"),
    leaf("norm-b", "b"),
    leaf("norm-c", "c"),
    leaf("norm-d", "d"),
    ref("norm-div-b", "b/a", "divide"),
    ref("norm-div-c", "c/a", "divide"),
    ref("norm-div-d", "d/a", "divide"),
  ]);

  // Step 2 — depressed-coefficients: p = c - b²/3, q = d - bc/3 + 2b³/27
  const depressed = group("depressed", "depressed-coefficients", [
    leaf("dep-b", "b"),
    leaf("dep-c", "c"),
    leaf("dep-d", "d"),
    ref("dep-bsq", "b²", "square"),
    ref("dep-bc", "b*c", "multiply"),
    ref("dep-bcu", "b³", "multiply"),
    ref("dep-p-div", "b²/3", "divide"),
    ref("dep-p", "p", "subtract"),
    ref("dep-q-div1", "bc/3", "divide"),
    ref("dep-q-div2", "2b³/27", "divide"),
    ref("dep-q-sub", "d-bc/3", "subtract"),
    ref("dep-q", "q", "add"),
  ]);

  // Step 3 — cardano-terms: u = ∛(-q/2 + √D), v = ∛(-q/2 - √D), D = q²/4 + p³/27
  const cardano = group("cardano", "cardano-terms", [
    leaf("card-p", "p"),
    leaf("card-q", "q"),
    ref("card-qsq", "q²", "square"),
    ref("card-psq", "p²", "square"),
    ref("card-pcu", "p³", "multiply"),
    ref("card-d1", "q²/4", "divide"),
    ref("card-d2", "p³/27", "divide"),
    ref("card-D", "D", "add"),
    ref("card-sqrtD", "√D", "sqrt"),
    ref("card-negq", "-q", "negate"),
    ref("card-nqh", "-q/2", "divide"),
    ref("card-u-sum", "u-inner", "add"),
    ref("card-v-sum", "v-inner", "subtract"),
    ref("card-u", "u", "cbrt"),
    ref("card-v", "v", "cbrt"),
  ]);

  // Step 4 — back-substitute: x = t - b/3
  const backSub = group("back-sub", "back-substitute", [
    leaf("bs-u", "u"),
    leaf("bs-v", "v"),
    leaf("bs-b", "b-norm"),
    ref("bs-shift", "b/3", "divide"),
    ref("bs-uv", "u+v", "add"),
    ref("bs-uvh", "uv/2", "divide"),
    ref("bs-nuvh", "-uv/2", "negate"),
    ref("bs-x1", "x1", "subtract"),
    ref("bs-x2", "x2", "subtract"),
    ref("bs-x3", "x3", "subtract"),
  ]);

  // Top-level pipeline
  const cubicRoots = group("cubic-roots", "cubic-roots", [
    ref("cr-norm", "normalise", "normalise"),
    ref("cr-dep", "depressed-coefficients", "depressed"),
    ref("cr-card", "cardano-terms", "cardano"),
    ref("cr-back", "back-substitute", "back-sub"),
  ]);

  ws.treeNodes = [primitives, normalise, depressed, cardano, backSub, cubicRoots];

  ws.edges = [
    // Pipeline edges within cubic-roots
    e("e-cr-1", "cr-norm", "cr-dep"),
    e("e-cr-2", "cr-dep", "cr-card"),
    e("e-cr-3", "cr-card", "cr-back"),
    e("e-cr-4", "cr-norm", "cr-back", "b-norm"),
    // normalise: a,b,c,d → divide
    e("e-n1", "norm-b", "norm-div-b"),
    e("e-n2", "norm-a", "norm-div-b"),
    e("e-n3", "norm-c", "norm-div-c"),
    e("e-n4", "norm-a", "norm-div-c"),
    e("e-n5", "norm-d", "norm-div-d"),
    e("e-n6", "norm-a", "norm-div-d"),
    // depressed-coefficients
    e("e-d1", "dep-b", "dep-bsq"),
    e("e-d2", "dep-bsq", "dep-bc"),
    e("e-d3", "dep-b", "dep-bc"),
    e("e-d4", "dep-bsq", "dep-bcu"),
    e("e-d5", "dep-bsq", "dep-p-div"),
    e("e-d6", "dep-c", "dep-p"),
    e("e-d7", "dep-p-div", "dep-p"),
    e("e-d8", "dep-bc", "dep-q-div1"),
    e("e-d9", "dep-bcu", "dep-q-div2"),
    e("e-d10", "dep-d", "dep-q-sub"),
    e("e-d11", "dep-q-div1", "dep-q-sub"),
    e("e-d12", "dep-q-sub", "dep-q"),
    e("e-d13", "dep-q-div2", "dep-q"),
    // cardano-terms
    e("e-c1", "card-q", "card-qsq"),
    e("e-c2", "card-p", "card-psq"),
    e("e-c3", "card-psq", "card-pcu"),
    e("e-c4", "card-p", "card-pcu"),
    e("e-c5", "card-qsq", "card-d1"),
    e("e-c6", "card-pcu", "card-d2"),
    e("e-c7", "card-d1", "card-D"),
    e("e-c8", "card-d2", "card-D"),
    e("e-c9", "card-D", "card-sqrtD"),
    e("e-c10", "card-q", "card-negq"),
    e("e-c11", "card-negq", "card-nqh"),
    e("e-c12", "card-nqh", "card-u-sum"),
    e("e-c13", "card-sqrtD", "card-u-sum"),
    e("e-c14", "card-nqh", "card-v-sum"),
    e("e-c15", "card-sqrtD", "card-v-sum"),
    e("e-c16", "card-u-sum", "card-u"),
    e("e-c17", "card-v-sum", "card-v"),
    // back-substitute
    e("e-b1", "bs-b", "bs-shift"),
    e("e-b2", "bs-u", "bs-uv"),
    e("e-b3", "bs-v", "bs-uv"),
    e("e-b4", "bs-uv", "bs-uvh"),
    e("e-b5", "bs-uvh", "bs-nuvh"),
    e("e-b6", "bs-uv", "bs-x1"),
    e("e-b7", "bs-shift", "bs-x1"),
    e("e-b8", "bs-nuvh", "bs-x2"),
    e("e-b9", "bs-shift", "bs-x2"),
    e("e-b10", "bs-nuvh", "bs-x3"),
    e("e-b11", "bs-shift", "bs-x3"),
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

/** Scope-inferred refs — parser automatically marks calls to prior defs as references. */
export function ScopeInferredRefs() {
  const clj = `(def square)
(def negate)

(defn pipeline [x]
  (let [sq (square x)
        neg (negate sq)]
    (add neg 1)))`;
  const { treeNodes, edges } = spikeToGraph(clj);
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = treeNodes;
  ws.edges = edges;
  ws.canvasExpandedNodes = ["pipeline"];

  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5; max-width:900px;">
        <strong style="color:#666;">Scope-inferred refs:</strong> The parser automatically marks
        {" "}
        <em>sq</em> and <em>neg</em> as references to <em>square</em> and <em>negate</em> because
        {" "}
        those names were defined by prior <code>def</code> forms. No explicit ref annotation needed.
        {" "}
        Dashed nodes with purple tint are references; <em>add</em>{" "}
        is not a ref (undefined in scope).
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}

/** Destructuring — {:keys [p q]} bindings parsed and round-tripped. */
export function Destructuring() {
  const clj = `(defn pipeline [input]
  (let [{:keys [p q]} (split input)]
    (combine p q)))`;
  const { treeNodes, edges } = spikeToGraph(clj);
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = treeNodes;
  ws.edges = edges;
  ws.canvasExpandedNodes = ["pipeline"];

  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5; max-width:900px;">
        <strong style="color:#666;">Destructuring:</strong> The <code>{"{:keys [p q]}"}</code>{" "}
        let-binding is parsed into a <em>split</em> node with <code>destructuredKeys</code>{" "}
        data. The downstream <em>combine</em> node references <em>p</em> and <em>q</em> from{" "}
        split's output ports.
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}

/** Import declarations — require preamble adds names to scope for ref inference. */
export function ImportDeclarations() {
  const clj = `(require divide multiply)

(defn pipeline [a b]
  (let [result (divide a b)]
    (multiply result 2.0)))`;
  const { treeNodes, edges } = spikeToGraph(clj);
  const ws = defaultState();
  ws.focusId = null;
  ws.treeNodes = treeNodes;
  ws.edges = edges;
  ws.canvasExpandedNodes = ["pipeline"];

  return (
    <div>
      <div style="font-size:11px; color:#555; margin-bottom:8px; line-height:1.5; max-width:900px;">
        <strong style="color:#666;">Import declarations:</strong> The{" "}
        <code>(require divide multiply)</code> preamble adds names to scope without creating nodes.
        {" "}
        Inside <em>pipeline</em>, calls to <em>divide</em> and <em>multiply</em> are inferred as
        {" "}
        references (dashed/purple). The require form is used for focused code views where the{" "}
        referenced definitions live outside the visible scope.
      </div>
      <StoryWrapper initial={ws} />
    </div>
  );
}
