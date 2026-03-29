/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import type { JSX } from "@hono/hono/jsx/dom/jsx-runtime";
import { Canvas } from "../components/canvas.tsx";
import {
  defaultState,
  makeNode,
  type TreeNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";
import type { Edge } from "../workspace.ts";

/**
 * Candidate Spike-Clojure syntax examples.
 *
 * Each story pairs a Spike-Clojure string literal with an interactive canvas
 * showing the corresponding graph, plus the formal Graph type as JSON.
 *
 * Spike-Clojure is a Clojure subset: valid Spike-Clojure is valid Clojure.
 * Core forms:
 *   def  — structural container (named value, not callable)
 *   defn — callable node (has ports, can be invoked)
 *   fn   — anonymous sub-subgraph
 *
 * #Subgraph and #Call are optional explicit annotations (retained for
 * disambiguation and user-defined variant extensibility).
 */

export const meta = { title: "Spike-Clojure Syntax Candidates" };

// ---------------------------------------------------------------------------
// Canvas helper
// ---------------------------------------------------------------------------

function StoryCanvas({
  treeNodes,
  edges = [],
  expandedNodes = [],
  focusId = null,
}: {
  treeNodes: TreeNode[];
  edges?: Edge[];
  expandedNodes?: string[];
  focusId?: string | null;
}) {
  const initial: WorkspaceState = {
    ...defaultState(),
    treeNodes,
    edges,
    canvasExpandedNodes: expandedNodes,
    focusId,
  };
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));
  return (
    <div style="position:relative; width:100%; height:320px; border:1px solid #30363d; border-radius:6px; overflow:hidden;">
      <Canvas ws={ws} update={update} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function Code({ src }: { src: string }) {
  return (
    <pre style="background:#0d1117; color:#e6edf3; padding:12px; border-radius:6px;
             font-size:13px; line-height:1.6; margin:0; white-space:pre-wrap; overflow-x:auto;">
      {src.trim()}
    </pre>
  );
}

function Json({ data }: { data: unknown }) {
  return (
    <pre style="background:#161b22; color:#adbac7; padding:12px; border-radius:6px;
             font-size:11px; line-height:1.5; margin:0; white-space:pre-wrap; overflow-x:auto; height:320px; overflow-y:auto;">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function Note({ children }: { children: unknown }) {
  return (
    <div style="background:#1c2128; border-left:3px solid #388bfd; color:#adbac7;
             padding:8px 12px; border-radius:0 6px 6px 0; font-size:12px; line-height:1.5; margin-top:8px;">
      {children}
    </div>
  );
}

function Story({
  title,
  lisp,
  graph,
  canvas,
  notes,
}: {
  title: string;
  lisp: string;
  graph: unknown;
  canvas: JSX.Element;
  notes?: string;
}) {
  return (
    <div style="background:#0d1117; border:1px solid #30363d; border-radius:8px; margin:16px; overflow:hidden;">
      <div style="padding:10px 16px; background:#161b22; border-bottom:1px solid #30363d;
               color:#e6edf3; font-size:13px; font-weight:600;">
        {title}
      </div>
      <div style="padding:16px;">
        <Code src={lisp} />
        {notes && <Note>{notes}</Note>}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:0 16px 16px;">
        <div>
          <div style="font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">
            Canvas
          </div>
          {canvas}
        </div>
        <div>
          <div style="font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">
            Graph (formal types)
          </div>
          <Json data={graph} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Subgraph semantics — leaf-only
// ---------------------------------------------------------------------------

export function SubgraphLeafOnly() {
  const lisp = `
; def — structural container (named value, not callable)
; A, B, C are leaf nodes present in my-graph; no call order expressed.
(def my-graph [A B C])`;

  return (
    <Story
      title="def — leaf-only structural container"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("my-graph", "my-graph", "composite", [
              makeNode("A", "A", "leaf", []),
              makeNode("B", "B", "leaf", []),
              makeNode("C", "C", "leaf", []),
            ]),
          ]}
          focusId="my-graph"
        />
      }
      graph={{
        uri: "spike://local/my-graph",
        nodes: {
          A: { id: "A", kind: "node", label: "A", subgraph: null },
          B: { id: "B", kind: "node", label: "B", subgraph: null },
          C: { id: "C", kind: "node", label: "C", subgraph: null },
        },
        edges: {},
      }}
      notes="def is a named value (a graph), not a function. Each symbol in the vector is a leaf node. No call order is expressed — this is a structural listing, not a pipeline."
    />
  );
}

// ---------------------------------------------------------------------------
// 2. Subgraph semantics — nested containment
// ---------------------------------------------------------------------------

export function SubgraphNested() {
  const lispSeparate = `
; Separate top-level definitions — C has its own identity
(def C [D])
(def A [B C])`;

  const lispInline = `
; Inline named definition — shorthand for the above
; (def C [D]) inside the vector defines and names C in one form.
; Both forms produce the same graph; inline is more compact.
(def A [B (def C [D])])`;

  return (
    <div>
      <Story
        title="def — nested containment (separate definitions)"
        lisp={lispSeparate}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("A", "A", "composite", [
                makeNode("B", "B", "leaf", []),
                makeNode("C", "C", "composite", [
                  makeNode("D", "D", "leaf", []),
                ]),
              ]),
            ]}
            expandedNodes={["C"]}
            focusId="A"
          />
        }
        graph={{
          uri: "spike://local/A",
          nodes: {
            B: { id: "B", kind: "node", label: "B", subgraph: null },
            C: { id: "C", kind: "node", label: "C", subgraph: "spike://local/A/C" },
          },
          subgraphs: {
            "spike://local/A/C": {
              uri: "spike://local/A/C",
              nodes: { D: { id: "D", kind: "node", label: "D", subgraph: null } },
            },
          },
        }}
        notes="Separate top-level definitions: C is defined first and referenced by name inside A. Cleaner when the sub-container has its own identity or is shared."
      />
      <Story
        title="def — nested containment (inline named definition)"
        lisp={lispInline}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("A", "A", "composite", [
                makeNode("B", "B", "leaf", []),
                makeNode("C", "C", "composite", [
                  makeNode("D", "D", "leaf", []),
                ]),
              ]),
            ]}
            expandedNodes={["C"]}
            focusId="A"
          />
        }
        graph={{
          uri: "spike://local/A",
          nodes: {
            B: { id: "B", kind: "node", label: "B", subgraph: null },
            C: { id: "C", kind: "node", label: "C", subgraph: "spike://local/A/C" },
          },
          subgraphs: {
            "spike://local/A/C": {
              uri: "spike://local/A/C",
              nodes: { D: { id: "D", kind: "node", label: "D", subgraph: null } },
            },
          },
        }}
        notes="Inline named definition: (def C [D]) inside the vector defines and names C in one form — shorthand for the separate-definition style. Both produce the same graph. Inline is compact; separate is cleaner when sub-containers are shared or deeply nested."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Call semantics — simple chain
// ---------------------------------------------------------------------------

export function CallChain() {
  const lisp = `
; A → B → C: sequential call chain expressed as a defn body
; Each let binding passes the output of one node to the next.
(defn pipeline [input]
  (let [a (A input)
        b (B a)]
    (C b)))`;

  return (
    <Story
      title="defn — chain A → B → C"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("A", "A", "leaf", []),
            makeNode("B", "B", "leaf", []),
            makeNode("C", "C", "leaf", []),
          ]}
          edges={[
            { id: "e-AB", fromId: "A", toId: "B", label: "", data: {}, version: 1 },
            { id: "e-BC", fromId: "B", toId: "C", label: "", data: {}, version: 1 },
          ]}
        />
      }
      graph={{
        nodes: { A: {}, B: {}, C: {} },
        edges: {
          "e-AB": { from: { node: "A", port: "out" }, to: { node: "B", port: "in" } },
          "e-BC": { from: { node: "B", port: "out" }, to: { node: "C", port: "in" } },
        },
      }}
      notes="defn body: let bindings chain outputs to inputs — the topology falls out of the data flow. No separate edge declarations needed. Valid Clojure top to bottom."
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Call semantics — fan-out
// ---------------------------------------------------------------------------

export function CallFanOut() {
  const lisp = `
; A fans out to B and C — both receive A's output
(defn pipeline [input]
  (let [a (A input)
        b (B a)
        c (C a)]
    {:b b :c c}))`;

  return (
    <Story
      title="defn — fan-out A → B, A → C"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("A", "A", "leaf", []),
            makeNode("B", "B", "leaf", []),
            makeNode("C", "C", "leaf", []),
          ]}
          edges={[
            { id: "e-AB", fromId: "A", toId: "B", label: "", data: {}, version: 1 },
            { id: "e-AC", fromId: "A", toId: "C", label: "", data: {}, version: 1 },
          ]}
        />
      }
      graph={{
        nodes: { A: {}, B: {}, C: {} },
        edges: {
          "e-AB": { from: { node: "A", port: "out" }, to: { node: "B", port: "in" } },
          "e-AC": { from: { node: "A", port: "out" }, to: { node: "C", port: "in" } },
        },
      }}
      notes="Fan-out: binding a to A's output then using it in both B and C naturally expresses parallel branches. The map return collects both outputs."
    />
  );
}

// ---------------------------------------------------------------------------
// 5. Call semantics — fan-in
// ---------------------------------------------------------------------------

export function CallFanIn() {
  const lisp = `
; Pure fan-in: A and B both feed C — C takes two independent inputs.
; Let bindings make it explicit: a and b are computed independently,
; then both passed to C. No implicit relationship between A and B.
(defn pipeline [x y]
  (let [a (A x)
        b (B y)
        c (C a b)]
    c))`;

  return (
    <Story
      title="defn — fan-in A → C, B → C"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("A", "A", "leaf", []),
            makeNode("B", "B", "leaf", []),
            makeNode("C", "C", "leaf", []),
          ]}
          edges={[
            { id: "e-AC", fromId: "A", toId: "C", label: "", data: {}, version: 1 },
            { id: "e-BC", fromId: "B", toId: "C", label: "", data: {}, version: 1 },
          ]}
        />
      }
      graph={{
        nodes: { A: {}, B: {}, C: {} },
        edges: {
          "e-AC": { from: { node: "A", port: "out" }, to: { node: "C", port: "in" } },
          "e-BC": { from: { node: "B", port: "out" }, to: { node: "C", port: "in" } },
        },
      }}
      notes="Fan-in: A and B are computed in separate let bindings — no implied relationship between them. Both results are passed to C as distinct arguments. This is natural Clojure; no special fan-in syntax needed."
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Call semantics — diamond (fan-out + fan-in)
// ---------------------------------------------------------------------------

export function CallDiamond() {
  const lisp = `
; Diamond: A fans out to B and C; both converge at D.
; A -> B, A -> C, B -> D, C -> D
;
; let naturally expresses the diamond — a is reused in both branches,
; b and c are computed in parallel, both flow into d.
(defn pipeline [input]
  (let [a (A input)
        b (B a)
        c (C a)
        d (D b c)]
    d))`;

  const diamondCanvas = (
    <StoryCanvas
      treeNodes={[
        makeNode("A", "A", "leaf", []),
        makeNode("B", "B", "leaf", []),
        makeNode("C", "C", "leaf", []),
        makeNode("D", "D", "leaf", []),
      ]}
      edges={[
        { id: "e-AB", fromId: "A", toId: "B", label: "", data: {}, version: 1 },
        { id: "e-AC", fromId: "A", toId: "C", label: "", data: {}, version: 1 },
        { id: "e-BD", fromId: "B", toId: "D", label: "", data: {}, version: 1 },
        { id: "e-CD", fromId: "C", toId: "D", label: "", data: {}, version: 1 },
      ]}
    />
  );

  return (
    <Story
      title="defn — diamond A → B → D ← C ← A"
      lisp={lisp}
      canvas={diamondCanvas}
      graph={{
        nodes: { A: {}, B: {}, C: {}, D: {} },
        edges: {
          "e-AB": { from: { node: "A", port: "out" }, to: { node: "B", port: "in" } },
          "e-AC": { from: { node: "A", port: "out" }, to: { node: "C", port: "in" } },
          "e-BD": { from: { node: "B", port: "out" }, to: { node: "D", port: "in" } },
          "e-CD": { from: { node: "C", port: "out" }, to: { node: "D", port: "in" } },
        },
      }}
      notes="The diamond emerges naturally from let: binding a once and reusing it in both b and c expresses the fan-out; passing both b and c into d expresses the fan-in. No special graph syntax needed — this is idiomatic Clojure."
    />
  );
}

// ---------------------------------------------------------------------------
// 7. Mixed semantics in one document
// ---------------------------------------------------------------------------

export function MixedSemantics() {
  const lisp = `
; auth-service: structural container (def) holding a callable processor (defn).
; processor's body defines its internal call graph via let.

(defn processor [input]
  (let [v (validate input)
        e (enrich v)]
    (respond e)))

; def — structural container, not callable
(def auth-service [ingress processor egress])`;

  return (
    <Story
      title="Mixed — def structural container with defn call-graph inside"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("auth-service", "auth-service", "composite", [
              makeNode("ingress", "ingress", "leaf", []),
              makeNode("processor", "processor", "composite", [
                makeNode("validate", "validate", "leaf", []),
                makeNode("enrich", "enrich", "leaf", []),
                makeNode("respond", "respond", "leaf", []),
              ]),
              makeNode("egress", "egress", "leaf", []),
            ]),
          ]}
          edges={[
            { id: "e-ve", fromId: "validate", toId: "enrich", label: "", data: {}, version: 1 },
            { id: "e-er", fromId: "enrich", toId: "respond", label: "", data: {}, version: 1 },
          ]}
          expandedNodes={["processor"]}
          focusId="auth-service"
        />
      }
      graph={{
        note:
          "auth-service is a Subgraph with leaf nodes ingress/egress and a composite 'processor' whose subgraph is a Call chain: validate → enrich → respond",
      }}
      notes="def and defn naturally mix: auth-service is a structural listing (def), processor is a callable sub-component (defn) whose body defines its internal topology via let. #Subgraph and #Call are no longer needed — the form type carries the structural/callable distinction."
    />
  );
}

// ---------------------------------------------------------------------------
// 8. Port nodes and schemas
// ---------------------------------------------------------------------------

export function PortNodes() {
  const lisp = `
; Port declarations via defn — in-ports are args, out-ports are {:ports {...}}
(defn ingress
  {:ports {:p-out spike.dataflow.bytes}}
  [^io.http.request p-in]
  ...)

(defn validator
  {:ports {:p-ok spike.dataflow.token :p-err spike.dataflow.error}}
  [^spike.dataflow.bytes p-in]
  ...)

; Structural container groups the nodes
(def auth-service [ingress validator])

; Explicit edge for port-to-port wiring
(edge :from [ingress p-out] :to [validator p-in])`;

  return (
    <Story
      title="Port declarations via defn"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("auth-service", "auth-service", "composite", [
              makeNode("ingress", "ingress", "leaf", []),
              makeNode("validator", "validator", "leaf", []),
            ]),
          ]}
          edges={[
            { id: "e-0", fromId: "ingress", toId: "validator", label: "", data: {}, version: 1 },
          ]}
          focusId="auth-service"
        />
      }
      graph={{
        activeSchemas: ["spike.topology.pipeline", "io.http"],
        nodes: {
          ingress: { id: "ingress", kind: "node", subgraph: null },
          "ingress/p-in": {
            kind: "port",
            portSchema: "io.http.request",
            direction: "in",
          },
          "ingress/p-out": {
            kind: "port",
            portSchema: "spike.dataflow.bytes",
            direction: "out",
          },
          validator: { id: "validator", kind: "node", subgraph: null },
        },
        edges: {
          "e-0": {
            from: { node: "ingress", port: "p-out" },
            to: { node: "validator", port: "p-in" },
          },
        },
      }}
      notes="In-ports are function arguments with ^Type hints; out-ports use {:ports {:name Type}} in the attr-map position — standard Clojure, used for :deprecated, :arglists etc. Explicit (edge ...) forms are still needed for port-to-port wiring. Note: the canvas doesn't model ports yet."
    />
  );
}

// ---------------------------------------------------------------------------
// 9. URI reference vs. inlined subgraph
// ---------------------------------------------------------------------------

export function SubgraphInliningVsUri() {
  const inlined = `
; Inlined — full structure visible as nested def forms
(def processor [validate enrich respond])
(def auth-service [ingress processor egress])`;

  const byUri = `
; URI reference — processor's internals are opaque
; {:subgraph "..."} in the attr-map marks the node as externally defined
(defn processor {:subgraph "spike://acme/backend/processor"} [input] ...)
(def auth-service [ingress processor egress])`;

  return (
    <div>
      <Story
        title="Inlined subgraph (readable for humans and agents)"
        lisp={inlined}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("auth-service", "auth-service", "composite", [
                makeNode("processor", "processor", "composite", [
                  makeNode("validate", "validate", "leaf", []),
                  makeNode("enrich", "enrich", "leaf", []),
                  makeNode("respond", "respond", "leaf", []),
                ]),
              ]),
            ]}
            expandedNodes={["processor"]}
            focusId="auth-service"
          />
        }
        graph={{ note: "processor subgraph inlined — full structure visible." }}
        notes="Nested def forms: processor is defined separately then referenced by name inside auth-service. The full structure is visible and traversable."
      />
      <Story
        title="URI-referenced subgraph (opaque, for library nodes)"
        lisp={byUri}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("auth-service", "auth-service", "composite", [
                makeNode("processor", "processor", "composite", []),
              ]),
            ]}
            focusId="auth-service"
          />
        }
        graph={{
          nodes: {
            processor: {
              subgraph: "spike://acme/backend/processor",
            },
          },
        }}
        notes="URI reference: {:subgraph '...'} in the attr-map marks the node as externally defined. The interface (args, ports) is still declared locally; only the implementation is opaque."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Properties via EDN maps
// ---------------------------------------------------------------------------

export function PropertiesMap() {
  const lisp = `
; Node properties via defn attr-map — same position as :deprecated, :doc etc.
(defn worker
  {:retry-limit 3
   :timeout-ms  5000
   :tags        ["critical" "async"]}
  [input]
  ...)

(def my-graph [worker])`;

  return (
    <Story
      title="Node properties via defn attr-map"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("my-graph", "my-graph", "composite", [
              {
                ...makeNode("worker", "worker", "leaf", []),
                data: { "retry-limit": 3, "timeout-ms": 5000, tags: ["critical", "async"] },
              },
            ]),
          ]}
          focusId="my-graph"
        />
      }
      graph={{
        nodes: {
          worker: {
            properties: {
              "retry-limit": 3,
              "timeout-ms": 5000,
              tags: ["critical", "async"],
            },
          },
        },
      }}
      notes="Node properties go in the attr-map (between name and param list) — the same position Clojure uses for :deprecated, :arglists, :doc etc. Values can be any scalar or collection. The def container groups nodes without imposing a call order."
    />
  );
}

// ---------------------------------------------------------------------------
// 11. Port syntax via defn
// ---------------------------------------------------------------------------

export function PortSyntax() {
  const lisp = `
; Single output — ^Type before the name (standard Clojure type hint)
(defn ^string transform [^bytes input] ...)

; Multiple outputs — {:ports {...}} attr-map between name and params
(defn validator
  {:ports {:p-ok token :p-err error}}
  [^bytes p-in]
  ...)

; Calling single-output: just call it
(transform input)

; Calling multi-output: Clojure destructuring picks the port
(let [{:keys [p-ok]}  (validator p-in)]
  (consumer p-ok))

; Structural container — def with vector of node references
(def pipeline [transform validator])`;

  return (
    <Story
      title="Port syntax — defnode (function-style interface definition)"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("pipeline", "pipeline", "composite", [
              makeNode("transform", "transform", "leaf", []),
              makeNode("validator", "validator", "leaf", []),
            ]),
          ]}
          edges={[
            { id: "e-tv", fromId: "transform", toId: "validator", label: "", data: {}, version: 1 },
          ]}
          focusId="pipeline"
        />
      }
      graph={{
        nodes: {
          transform: {
            kind: "node",
            ports: {
              "input": { direction: "in", portSchema: "bytes" },
              "out": { direction: "out", portSchema: "string" },
            },
          },
          validator: {
            kind: "node",
            ports: {
              "p-in": { direction: "in", portSchema: "bytes" },
              "p-ok": { direction: "out", portSchema: "token" },
              "p-err": { direction: "out", portSchema: "error" },
            },
          },
        },
      }}
      notes="Single output: ^Type hint before name — standard Clojure. Multiple outputs: {:ports {...}} attr-map — valid Clojure attr-map position. Port selection uses Clojure destructuring {:keys [port-name]}, not a graph-specific :from keyword. Structural containers use def — not callable, not defn. All valid Clojure with no extensions."
    />
  );
}

// ---------------------------------------------------------------------------
// 12. Quadratic roots — full algorithm as a subgraph
// ---------------------------------------------------------------------------

export function QuadraticRoots() {
  const lispInterface = `
; High-level interface — discriminant feeds real-roots
(defn ^float discriminant [^float a ^float b ^float c] ...)

(defn real-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  ...)

; a=1, b=-5, c=6  →  x1=3.0, x2=2.0
; def — a named example run, not a reusable callable
(def example
  (let [a    1.0
        b   -5.0
        c    6.0
        {:keys [x1 x2]} (real-roots a b c)]
    {:x1 x1 :x2 x2}))`;

  const lispExpanded = `
; ── Primitives — all single-output ───────────────────────────────────────────
(defn ^float negate   [^float x]           ...)
(defn ^float sqrt     [^float x]           ...)
(defn ^float square   [^float x]           ...)
(defn ^float add      [^float x ^float y]  ...)
(defn ^float subtract [^float x ^float y]  ...)
(defn ^float multiply [^float x ^float y]  ...)
(defn ^float divide   [^float x ^float y]  ...)

; ── defn with body — valid Clojure, body IS the subgraph ─────────────────────
; Swap body for :subgraph "spike://math/quadratic-roots" to make it opaque.
(defn quadratic-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  (let [neg-b  (negate b)
        disc   (subtract (square b) (multiply 4.0 (multiply a c)))
        sqrt-d (sqrt disc)
        two-a  (multiply 2.0 a)]
    {:x1 (divide (add      neg-b sqrt-d) two-a)
     :x2 (divide (subtract neg-b sqrt-d) two-a)}))`;

  // Nodes inside the quadratic-roots subgraph
  const innerNodes = [
    makeNode("a", "a", "leaf", []),
    makeNode("b", "b", "leaf", []),
    makeNode("c", "c", "leaf", []),
    makeNode("negate-b", "negate  (−b)", "leaf", []),
    makeNode("square-b", "square  (b²)", "leaf", []),
    makeNode("mul-ac", "multiply  (a·c)", "leaf", []),
    makeNode("mul-4ac", "multiply  (4·ac)", "leaf", []),
    makeNode("sub-disc", "subtract  (disc)", "leaf", []),
    makeNode("sqrt-disc", "sqrt  (√disc)", "leaf", []),
    makeNode("mul-2a", "multiply  (2a)", "leaf", []),
    makeNode("add-plus", "add  (−b+√d)", "leaf", []),
    makeNode("sub-minus", "subtract  (−b−√d)", "leaf", []),
    makeNode("div-x1", "divide  (x₁)", "leaf", []),
    makeNode("div-x2", "divide  (x₂)", "leaf", []),
  ];

  const expandedEdges = [
    { id: "e-b-neg", fromId: "b", toId: "negate-b", label: "", data: {}, version: 1 as const },
    { id: "e-b-sq", fromId: "b", toId: "square-b", label: "", data: {}, version: 1 as const },
    { id: "e-a-mac", fromId: "a", toId: "mul-ac", label: "", data: {}, version: 1 as const },
    { id: "e-c-mac", fromId: "c", toId: "mul-ac", label: "", data: {}, version: 1 as const },
    {
      id: "e-mac-m4",
      fromId: "mul-ac",
      toId: "mul-4ac",
      label: "ac",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-sq-disc",
      fromId: "square-b",
      toId: "sub-disc",
      label: "b²",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-m4-disc",
      fromId: "mul-4ac",
      toId: "sub-disc",
      label: "4ac",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-disc-sqrt",
      fromId: "sub-disc",
      toId: "sqrt-disc",
      label: "disc",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-neg-add",
      fromId: "negate-b",
      toId: "add-plus",
      label: "−b",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-neg-sub",
      fromId: "negate-b",
      toId: "sub-minus",
      label: "−b",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-sqrt-add",
      fromId: "sqrt-disc",
      toId: "add-plus",
      label: "√d",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-sqrt-sub",
      fromId: "sqrt-disc",
      toId: "sub-minus",
      label: "√d",
      data: {},
      version: 1 as const,
    },
    { id: "e-a-2a", fromId: "a", toId: "mul-2a", label: "", data: {}, version: 1 as const },
    {
      id: "e-add-x1",
      fromId: "add-plus",
      toId: "div-x1",
      label: "+",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-sub-x2",
      fromId: "sub-minus",
      toId: "div-x2",
      label: "−",
      data: {},
      version: 1 as const,
    },
    { id: "e-2a-x1", fromId: "mul-2a", toId: "div-x1", label: "2a", data: {}, version: 1 as const },
    { id: "e-2a-x2", fromId: "mul-2a", toId: "div-x2", label: "2a", data: {}, version: 1 as const },
  ];

  return (
    <div>
      <Story
        title="Quadratic roots — interface (minimal explicit ports)"
        lisp={lispInterface}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("discriminant", "discriminant", "leaf", []),
              makeNode("real-roots", "real-roots", "leaf", []),
            ]}
            edges={[
              {
                id: "e-dr",
                fromId: "discriminant",
                toId: "real-roots",
                label: "disc",
                data: {},
                version: 1,
              },
            ]}
          />
        }
        graph={{
          nodes: {
            discriminant: {
              ports: {
                a: { direction: "in" },
                b: { direction: "in" },
                c: { direction: "in" },
                out: { direction: "out", portSchema: "float" },
              },
            },
            "real-roots": {
              ports: {
                a: { direction: "in" },
                b: { direction: "in" },
                c: { direction: "in" },
                x1: { direction: "out", portSchema: "float" },
                x2: { direction: "out", portSchema: "float" },
              },
            },
          },
        }}
        notes="At the interface level discriminant is opaque — one output, no #PORTS. real-roots has two named output ports. Both nodes can be inlined as subgraphs or referenced by URI."
      />
      <Story
        title="quadratic-roots — full algorithm as a defnode with body"
        lisp={lispExpanded}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("quadratic-roots", "quadratic-roots", "composite", innerNodes),
            ]}
            edges={expandedEdges}
            focusId="quadratic-roots"
          />
        }
        graph={{
          uri: "spike://math/quadratic-roots",
          nodes: Object.fromEntries(innerNodes.map((n) => [n.id, { id: n.id, label: n.label }])),
          edges: Object.fromEntries(
            expandedEdges.map((e) => [
              e.id,
              {
                from: { node: e.fromId, port: "out" },
                to: { node: e.toId, port: "in" },
                label: e.label,
              },
            ]),
          ),
          outputs: { x1: { node: "div-x1", port: "out" }, x2: { node: "div-x2", port: "out" } },
        }}
        notes={"defn with body: valid Clojure top to bottom. {:ports {:x1 float :x2 float}} is the attr-map position in defn — standard Clojure, used for :deprecated, :arglists etc. " +
          "The body is a plain let returning a map — no #PORTS or #Call needed. " +
          "Each let binding is a distinct node; the ± split after sqrt-disc produces x₁ and x₂ as the two output ports."}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 13. Port syntax — OIDC flow examples
// ---------------------------------------------------------------------------

export function PortSyntaxExamples() {
  const catalogueLisp = `
; ── Interface catalogue ──────────────────────────────────────────────────────
; Pure interface definitions — no topology, no wiring. Valid Clojure.
; Single output: ^Type before name. Multiple outputs: {:ports {...}} attr-map.

(defn parse-auth-request
  {:ports {:params oidc.AuthParams :error http.BadRequest}}
  [^http.Request req]
  ...)

(defn validate-client
  {:ports {:client oidc.Client :error http.Unauthorized}}
  [^oidc.ClientId client-id]
  ...)

(defn authenticate-user
  {:ports {:session oidc.Session :denied http.Unauthorized}}
  [^oidc.AuthParams params]
  ...)

(defn ^oidc.AuthCode issue-auth-code [^oidc.Session session ^oidc.Client client] ...)

(defn exchange-code
  {:ports {:tokens oidc.TokenSet :error http.BadRequest}}
  [^oidc.AuthCode code]
  ...)

(defn ^http.Response build-response [^oidc.TokenSet tokens] ...)`;

  const catalogueGraph = {
    nodes: {
      "parse-auth-request": {
        ports: {
          req: { direction: "in", portSchema: "http.Request" },
          params: { direction: "out", portSchema: "oidc.AuthParams" },
          error: { direction: "out", portSchema: "http.BadRequest" },
        },
      },
      "validate-client": {
        ports: {
          "client-id": { direction: "in", portSchema: "oidc.ClientId" },
          client: { direction: "out", portSchema: "oidc.Client" },
          error: { direction: "out", portSchema: "http.Unauthorized" },
        },
      },
      "authenticate-user": {
        ports: {
          params: { direction: "in", portSchema: "oidc.AuthParams" },
          session: { direction: "out", portSchema: "oidc.Session" },
          denied: { direction: "out", portSchema: "http.Unauthorized" },
        },
      },
      "issue-auth-code": {
        ports: {
          session: { direction: "in", portSchema: "oidc.Session" },
          client: { direction: "in", portSchema: "oidc.Client" },
          out: { direction: "out", portSchema: "oidc.AuthCode" },
        },
      },
      "exchange-code": {
        ports: {
          code: { direction: "in", portSchema: "oidc.AuthCode" },
          tokens: { direction: "out", portSchema: "oidc.TokenSet" },
          error: { direction: "out", portSchema: "http.BadRequest" },
        },
      },
      "build-response": {
        ports: {
          tokens: { direction: "in", portSchema: "oidc.TokenSet" },
          out: { direction: "out", portSchema: "http.Response" },
        },
      },
    },
  };

  const topologyLisp = `
; ── OIDC authorisation flow — defn with let + Clojure destructuring ───────────
; Destructuring {:keys [...]} selects named output ports — no graph-specific syntax.
; validate-client and authenticate-user run independently on parsed params
; then converge at issue-auth-code (diamond fan-in via let bindings).

(defn oidc-flow [^http.Request http-request]
  (let [parsed            (parse-auth-request http-request)
        {:keys [client]}  (validate-client parsed)
        {:keys [session]} (authenticate-user parsed)
        code              (issue-auth-code session client)
        {:keys [tokens]}  (exchange-code code)]
    (build-response tokens)))`;

  const topologyNodes = [
    makeNode("parse-auth-request", "parse-auth-request", "leaf", []),
    makeNode("validate-client", "validate-client", "leaf", []),
    makeNode("authenticate-user", "authenticate-user", "leaf", []),
    makeNode("issue-auth-code", "issue-auth-code", "leaf", []),
    makeNode("exchange-code", "exchange-code", "leaf", []),
    makeNode("build-response", "build-response", "leaf", []),
  ];

  const topologyEdges = [
    {
      id: "e-pv",
      fromId: "parse-auth-request",
      toId: "validate-client",
      label: "params",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-pa",
      fromId: "parse-auth-request",
      toId: "authenticate-user",
      label: "params",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-vi",
      fromId: "validate-client",
      toId: "issue-auth-code",
      label: "client",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-ai",
      fromId: "authenticate-user",
      toId: "issue-auth-code",
      label: "session",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-ie",
      fromId: "issue-auth-code",
      toId: "exchange-code",
      label: "",
      data: {},
      version: 1 as const,
    },
    {
      id: "e-eb",
      fromId: "exchange-code",
      toId: "build-response",
      label: "tokens",
      data: {},
      version: 1 as const,
    },
  ];

  const topologyGraph = {
    nodes: {
      "parse-auth-request": {},
      "validate-client": {},
      "authenticate-user": {},
      "issue-auth-code": {},
      "exchange-code": {},
      "build-response": {},
    },
    edges: {
      "e-pv": {
        from: { node: "parse-auth-request", port: "params" },
        to: { node: "validate-client", port: "client-id" },
      },
      "e-pa": {
        from: { node: "parse-auth-request", port: "params" },
        to: { node: "authenticate-user", port: "params" },
      },
      "e-vi": {
        from: { node: "validate-client", port: "client" },
        to: { node: "issue-auth-code", port: "client" },
      },
      "e-ai": {
        from: { node: "authenticate-user", port: "session" },
        to: { node: "issue-auth-code", port: "session" },
      },
      "e-ie": {
        from: { node: "issue-auth-code", port: "out" },
        to: { node: "exchange-code", port: "code" },
      },
      "e-eb": {
        from: { node: "exchange-code", port: "tokens" },
        to: { node: "build-response", port: "tokens" },
      },
    },
  };

  const structuralLisp = `
; ── Structural container — def with vector of node references ────────────────
; Same node interfaces, no call order expressed.
; def is not callable — it is a named value (a graph), not a function.
; Bare symbol references — no invocation, just presence.

(def oidc-provider
  [parse-auth-request
   validate-client
   authenticate-user
   issue-auth-code
   exchange-code
   build-response])`;

  return (
    <div>
      <Story
        title="OIDC — Interface catalogue (defn declarations)"
        lisp={catalogueLisp}
        canvas={
          <StoryCanvas
            treeNodes={topologyNodes}
          />
        }
        graph={catalogueGraph}
        notes="Pure interface declarations — no topology, no wiring. Single output: ^Type before name. Multiple outputs: {:ports {...}} attr-map. Valid Clojure."
      />
      <Story
        title="OIDC — Call topology (defn + let + Clojure destructuring)"
        lisp={topologyLisp}
        canvas={
          <StoryCanvas
            treeNodes={topologyNodes}
            edges={topologyEdges}
          />
        }
        graph={topologyGraph}
        notes="defn body: let bindings reference each other — the topology falls out of the data flow. {:keys [port-name]} destructuring selects a named output port — standard Clojure, no graph-specific syntax. Diamond via let: parse-auth-request fans out; validate-client and authenticate-user converge at issue-auth-code."
      />
      <Story
        title="OIDC — Structural container (def, same node interfaces)"
        lisp={structuralLisp}
        canvas={
          <StoryCanvas
            treeNodes={[
              makeNode("oidc-provider", "oidc-provider", "composite", topologyNodes),
            ]}
            focusId="oidc-provider"
          />
        }
        graph={{
          uri: "spike://local/oidc-provider",
          nodes: Object.fromEntries(
            topologyNodes.map((n) => [n.id, { id: n.id, kind: "node" }]),
          ),
        }}
        notes="def — a named value, not a function. The vector lists which nodes are present; bare symbol references imply no invocation or call order. The same defn interfaces work here unchanged — def vs defn is the only difference between structural and callable."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 13. Alternative implementations
// ---------------------------------------------------------------------------

export function AlternativeImplementations() {
  const lisp = `
#Subgraph (billing-service
  :active-impl :production

  (node payment-processor
    :impl {:production "spike://acme/billing/stripe-processor"
           :mock       "spike://acme/billing/mock-processor"
           :canary     "spike://acme/billing/v2-processor"}))`;

  return (
    <Story
      title="Alternative implementations"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("billing-service", "billing-service", "composite", [
              makeNode("payment-processor", "payment-processor", "leaf", []),
            ]),
          ]}
          focusId="billing-service"
        />
      }
      graph={{
        activeImplementation: "production",
        nodes: {
          "payment-processor": {
            implementations: {
              production: { subgraph: "spike://acme/billing/stripe-processor" },
              mock: { subgraph: "spike://acme/billing/mock-processor" },
              canary: { subgraph: "spike://acme/billing/v2-processor" },
            },
          },
        },
      }}
      notes=":impl takes an EDN map of tag → URI. :active-impl on the graph sets the default."
    />
  );
}
