/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
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
 * Candidate Spike-Lisp syntax examples.
 *
 * Each story pairs a Spike-Lisp string literal with an interactive canvas
 * showing the corresponding graph, plus the formal Graph type as JSON.
 *
 * Two semantic variants are explored:
 *   #Subgraph — direct correspondence between sexp structure and containment
 *   #Call     — invocation / dataflow chain (nesting = call order)
 */

export const meta = { title: "Spike-Lisp Syntax Candidates" };

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
#Subgraph (my-graph
  A
  B
  C)`;

  return (
    <Story
      title="Subgraph — leaf-only"
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
      notes="Each symbol is a leaf node. The head of the list names the graph."
    />
  );
}

// ---------------------------------------------------------------------------
// 2. Subgraph semantics — nested containment
// ---------------------------------------------------------------------------

export function SubgraphNested() {
  const lisp = `
; {label: A, children: [B, {label: C, children: [D]}]}
#Subgraph (A
  B
  (C D))`;

  return (
    <Story
      title="Subgraph — nested containment"
      lisp={lisp}
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
          C: {
            id: "C",
            kind: "node",
            label: "C",
            subgraph: "spike://local/A/C",
          },
        },
        subgraphs: {
          "spike://local/A/C": {
            uri: "spike://local/A/C",
            nodes: { D: { id: "D", kind: "node", label: "D", subgraph: null } },
          },
        },
      }}
      notes="(C D) = C is a composite whose subgraph contains D. URI for C's subgraph is derived from the parent path."
    />
  );
}

// ---------------------------------------------------------------------------
// 3. Call semantics — simple chain
// ---------------------------------------------------------------------------

export function CallChain() {
  const lisp = `
; A -> B -> C
#Call (A (B C))`;

  return (
    <Story
      title="Call — chain A → B → C"
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
      notes="Nesting implies invocation order. (A (B C)) = A calls B, B calls C. Edges are implicit from structure."
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Call semantics — fan-out
// ---------------------------------------------------------------------------

export function CallFanOut() {
  const lisp = `
; A -> B, A -> C
#Call (A B C)`;

  return (
    <Story
      title="Call — fan-out A → B, A → C"
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
      notes="Siblings after the head receive calls from it. (A B C) = A calls both B and C."
    />
  );
}

// ---------------------------------------------------------------------------
// 5. Call semantics — fan-in
// ---------------------------------------------------------------------------

export function CallFanIn() {
  const lisp = `
; A -> C, B -> C  (pure fan-in, no common source)
;
; Candidate: parenthesised source set
#Call ((A B) C)
;
; Tension: the nesting model is caller-first.
; Fan-in has no natural single "head" — this needs
; an explicit grouping syntax to name the callers.`;

  return (
    <Story
      title="Call — fan-in A → C, B → C"
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
      notes="Pure fan-in is awkward in the caller-first nesting model. (A B) as a source set is a candidate — but it's syntactically ambiguous with a nested subgraph containing A and B."
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Call semantics — diamond (fan-out + fan-in)
// ---------------------------------------------------------------------------

export function CallDiamond() {
  const lisp = `
; A -> B, A -> C, B -> D, C -> D
;
; Candidate A — implicit: D appears twice, deduplicated by label identity.
; Problem: fragile if two distinct nodes share a label.
#Call (A (B D) (C D))

; Candidate B — explicit let binding: d is a named reference to node D.
; Both branches share the same binding. No implicit deduplication needed.
#Call (let [d D]
  (A (B d) (C d)))

; Candidate C — explicit :id on each occurrence.
; Verbose but unambiguous even when labels collide.
#Call (A (B (D :id "node-d")) (C (D :id "node-d")))`;

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
      title="Call — diamond A → B → D ← C ← A (node identity candidates)"
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
      notes="All three candidates produce the same graph. Candidate A (implicit) is concise but fragile — two distinct nodes with label 'D' would incorrectly merge. Candidate B (let) is the Lisp-idiomatic resolution and also addresses pure fan-in and named-wire semantics. Candidate C (explicit :id) is unambiguous but verbose."
    />
  );
}

// ---------------------------------------------------------------------------
// 7. Mixed semantics in one document
// ---------------------------------------------------------------------------

export function MixedSemantics() {
  const lisp = `
; A service graph (structural) containing a processing pipeline (call chain)
#Subgraph (auth-service
  ingress
  (#Call processor (validate (enrich respond)))
  egress)`;

  return (
    <Story
      title="Mixed — #Subgraph containing a #Call subgraph"
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
      notes="Semantic tags are scoped to their form and can be mixed. A #Subgraph node's subgraph can use #Call semantics by tagging the inner form."
    />
  );
}

// ---------------------------------------------------------------------------
// 8. Port nodes and schemas
// ---------------------------------------------------------------------------

export function PortNodes() {
  const lisp = `
#Subgraph (auth-service
  :schemas [spike.topology.pipeline io.http]

  (node ingress
    :port (in  :id p-in  :schema io.http.request)
    :port (out :id p-out :schema spike.dataflow.bytes))

  (node validator
    :port (in  :id p-in  :schema spike.dataflow.bytes)
    :port (out :id p-ok  :schema spike.dataflow.token)
    :port (out :id p-err :schema spike.dataflow.error))

  (edge :from [ingress p-out] :to [validator p-in]))`;

  return (
    <Story
      title="Port nodes and schemas"
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
      notes="Port nodes declared inline as :port keyword args. Reconstructed as separate kind:'port' nodes in the formal Graph type. Note: the canvas doesn't model ports yet."
    />
  );
}

// ---------------------------------------------------------------------------
// 9. URI reference vs. inlined subgraph
// ---------------------------------------------------------------------------

export function SubgraphInliningVsUri() {
  const inlined = `
; Inlined — full structure visible
#Subgraph (auth-service
  (processor
    validate
    enrich
    respond))`;

  const byUri = `
; URI reference — processor is opaque here
#Subgraph (auth-service
  (processor :subgraph "spike://acme/backend/processor"))`;

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
        notes="Default serialisation when the subgraph is available in the workspace."
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
        notes="Used when the subgraph URI refers to an external / shared library node not available locally."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Properties via EDN maps
// ---------------------------------------------------------------------------

export function PropertiesMap() {
  const lisp = `
#Subgraph (my-graph
  (node worker
    :props {:retry-limit 3
            :timeout-ms  5000
            :tags        ["critical" "async"]}))`;

  return (
    <Story
      title="Properties as EDN map"
      lisp={lisp}
      canvas={
        <StoryCanvas
          treeNodes={[
            makeNode("my-graph", "my-graph", "composite", [
              makeNode("worker", "worker", "leaf", []),
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
      notes=":props takes an EDN map. Keyword keys have their colon stripped. Values can be any base-lisp scalar or collection."
    />
  );
}

// ---------------------------------------------------------------------------
// 11. Alternative implementations
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
