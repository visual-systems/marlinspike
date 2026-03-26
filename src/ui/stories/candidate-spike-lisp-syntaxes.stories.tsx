/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */

/**
 * Candidate Spike-Lisp syntax examples.
 *
 * Each story pairs a Spike-Lisp string literal with the graph structure it
 * should represent. The goal is to settle the syntax design with concrete
 * examples before committing to a parser implementation.
 *
 * Two semantic variants are explored:
 *   #Subgraph — direct correspondence between sexp structure and containment
 *   #Call     — invocation / dataflow chain (nesting = call order)
 */

export const meta = { title: "Spike-Lisp Syntax Candidates" };

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function Row({ children }: { children: unknown }) {
  return (
    <div style="display:flex; gap:24px; align-items:flex-start; padding:16px; font-family:monospace;">
      {children}
    </div>
  );
}

function Col({
  label,
  children,
}: {
  label: string;
  children: unknown;
}) {
  return (
    <div style="flex:1; min-width:0;">
      <div style="font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">
        {label}
      </div>
      {children}
    </div>
  );
}

function Code({ src }: { src: string }) {
  return (
    <pre style="background:#0d1117; color:#e6edf3; padding:12px; border-radius:6px;
             font-size:13px; line-height:1.6; margin:0; white-space:pre-wrap; overflow-x:auto;">
      {src.trim()}
    </pre>
  );
}

function Graph({ data }: { data: unknown }) {
  return (
    <pre style="background:#161b22; color:#adbac7; padding:12px; border-radius:6px;
             font-size:12px; line-height:1.6; margin:0; white-space:pre-wrap; overflow-x:auto;">
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
  notes,
}: {
  title: string;
  lisp: string;
  graph: unknown;
  notes?: string;
}) {
  return (
    <div style="background:#0d1117; border:1px solid #30363d; border-radius:8px;
             margin:16px; overflow:hidden;">
      <div style="padding:10px 16px; background:#161b22; border-bottom:1px solid #30363d;
               color:#e6edf3; font-size:13px; font-weight:600;">
        {title}
      </div>
      <Row>
        <Col label="Spike-Lisp">
          <Code src={lisp} />
          {notes && <Note>{notes}</Note>}
        </Col>
        <Col label="Graph (formal types)">
          <Graph data={graph} />
        </Col>
      </Row>
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
  C)
`;

  const graph = {
    uri: "spike://local/my-graph",
    nodes: {
      A: { id: "A", kind: "node", label: "A", subgraph: null, properties: {} },
      B: { id: "B", kind: "node", label: "B", subgraph: null, properties: {} },
      C: { id: "C", kind: "node", label: "C", subgraph: null, properties: {} },
    },
    edges: {},
  };

  return (
    <Story
      title="Subgraph — leaf-only"
      lisp={lisp}
      graph={graph}
      notes="Each symbol is a leaf node (no children). The head of the list names the graph."
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
  (C D))
`;

  const graph = {
    uri: "spike://local/A",
    nodes: {
      B: { id: "B", kind: "node", label: "B", subgraph: null, properties: {} },
      C: {
        id: "C",
        kind: "node",
        label: "C",
        subgraph: "spike://local/A/C",
        properties: {},
      },
    },
    edges: {},
    subgraphs: {
      "spike://local/A/C": {
        uri: "spike://local/A/C",
        nodes: {
          D: {
            id: "D",
            kind: "node",
            label: "D",
            subgraph: null,
            properties: {},
          },
        },
        edges: {},
      },
    },
  };

  return (
    <Story
      title="Subgraph — nested containment"
      lisp={lisp}
      graph={graph}
      notes="(C D) means C is a composite node whose subgraph contains D. The URI for C's subgraph is derived from the parent path."
    />
  );
}

// ---------------------------------------------------------------------------
// 3. Call semantics — simple chain
// ---------------------------------------------------------------------------

export function CallChain() {
  const lisp = `
; A -> B -> C
#Call (A (B C))
`;

  const graph = {
    uri: "spike://local/call-example",
    nodes: {
      A: { id: "A", kind: "node", label: "A", subgraph: null, properties: {} },
      B: { id: "B", kind: "node", label: "B", subgraph: null, properties: {} },
      C: { id: "C", kind: "node", label: "C", subgraph: null, properties: {} },
    },
    edges: {
      "e-A-B": {
        id: "e-A-B",
        from: { node: "A", port: "out" },
        to: { node: "B", port: "in" },
        properties: {},
      },
      "e-B-C": {
        id: "e-B-C",
        from: { node: "B", port: "out" },
        to: { node: "C", port: "in" },
        properties: {},
      },
    },
  };

  return (
    <Story
      title="Call — simple chain A → B → C"
      lisp={lisp}
      graph={graph}
      notes="Nesting implies invocation order. (A (B C)) reads: A calls B, B calls C. Edges are implicit from structure."
    />
  );
}

// ---------------------------------------------------------------------------
// 4. Call semantics — branching (fan-out)
// ---------------------------------------------------------------------------

export function CallFanOut() {
  const lisp = `
; A -> B, A -> C
#Call (A B C)
`;

  const graph = {
    uri: "spike://local/fan-out",
    nodes: {
      A: { id: "A", kind: "node", label: "A", subgraph: null, properties: {} },
      B: { id: "B", kind: "node", label: "B", subgraph: null, properties: {} },
      C: { id: "C", kind: "node", label: "C", subgraph: null, properties: {} },
    },
    edges: {
      "e-A-B": {
        id: "e-A-B",
        from: { node: "A", port: "out" },
        to: { node: "B", port: "in" },
        properties: {},
      },
      "e-A-C": {
        id: "e-A-C",
        from: { node: "A", port: "out" },
        to: { node: "C", port: "in" },
        properties: {},
      },
    },
  };

  return (
    <Story
      title="Call — fan-out A → B, A → C"
      lisp={lisp}
      graph={graph}
      notes="When siblings follow the head without nesting, the head calls all of them (fan-out). (A B C) = A calls both B and C."
    />
  );
}

// ---------------------------------------------------------------------------
// 5. Mixed semantics in one document
// ---------------------------------------------------------------------------

export function MixedSemantics() {
  const lisp = `
; A service graph (structural) that contains a processing pipeline (call chain)
#Subgraph (auth-service
  ingress
  (#Call processor (validate (enrich respond)))
  egress)
`;

  return (
    <Story
      title="Mixed — #Subgraph containing a #Call subgraph"
      lisp={lisp}
      graph={{
        note:
          "auth-service is a Subgraph with leaf nodes ingress and egress, and a composite node 'processor' whose subgraph is a Call chain: validate → enrich → respond",
      }}
      notes="Semantic tags can be mixed within a document. A #Subgraph node can reference a #Call subgraph inline. The tag scopes to its immediate form."
    />
  );
}

// ---------------------------------------------------------------------------
// 6. Port nodes and schemas
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

  (edge :from [ingress p-out] :to [validator p-in]))
`;

  const graph = {
    uri: "spike://local/auth-service",
    activeSchemas: ["spike.topology.pipeline", "io.http"],
    nodes: {
      ingress: {
        id: "ingress",
        kind: "node",
        label: "ingress",
        subgraph: null,
        properties: {},
      },
      "ingress/p-in": {
        id: "ingress/p-in",
        kind: "port",
        label: "p-in",
        portSchema: "io.http.request",
        direction: "in",
        properties: {},
      },
      "ingress/p-out": {
        id: "ingress/p-out",
        kind: "port",
        label: "p-out",
        portSchema: "spike.dataflow.bytes",
        direction: "out",
        properties: {},
      },
    },
    edges: {
      "e-0": {
        id: "e-0",
        from: { node: "ingress", port: "p-out" },
        to: { node: "validator", port: "p-in" },
        properties: {},
      },
    },
  };

  return (
    <Story
      title="Port nodes and schemas"
      lisp={lisp}
      graph={graph}
      notes="Port nodes are declared inline as :port keyword args on their parent node. They are reconstructed as separate nodes in the formal Graph type."
    />
  );
}

// ---------------------------------------------------------------------------
// 7. URI reference vs. inlined subgraph
// ---------------------------------------------------------------------------

export function SubgraphInliningVsUri() {
  const inlined = `
; Inlined — full structure visible
#Subgraph (auth-service
  (processor
    validate
    enrich
    respond))
`;

  const byUri = `
; URI reference — processor is opaque here
#Subgraph (auth-service
  (processor :subgraph "spike://acme/backend/auth-service/processor"))
`;

  return (
    <div>
      <Story
        title="Inlined subgraph (more readable for humans and agents)"
        lisp={inlined}
        graph={{
          note: "processor node has its subgraph inlined. Full structure is visible at this level.",
        }}
        notes="Default for serialisation when the subgraph is available in the workspace."
      />
      <Story
        title="URI-referenced subgraph (opaque, for library nodes)"
        lisp={byUri}
        graph={{
          note:
            "processor.subgraph = 'spike://acme/backend/auth-service/processor'. The subgraph is not expanded here.",
        }}
        notes="Used when the subgraph URI refers to an external / shared library node not available locally."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Properties via EDN maps
// ---------------------------------------------------------------------------

export function PropertiesMap() {
  const lisp = `
#Subgraph (my-graph
  (node worker
    :props {:retry-limit 3, :timeout-ms 5000, :tags ["critical" "async"]}))
`;

  return (
    <Story
      title="Properties as EDN map"
      lisp={lisp}
      graph={{
        nodes: {
          worker: {
            id: "worker",
            kind: "node",
            label: "worker",
            subgraph: null,
            properties: {
              "retry-limit": 3,
              "timeout-ms": 5000,
              tags: ["critical", "async"],
            },
          },
        },
      }}
      notes=":props takes an EDN map. Keys are keywords (the colon is stripped). Values can be any base-lisp scalar or collection."
    />
  );
}

// ---------------------------------------------------------------------------
// 9. Alternative implementations
// ---------------------------------------------------------------------------

export function AlternativeImplementations() {
  const lisp = `
#Subgraph (billing-service
  :active-impl :production

  (node payment-processor
    :impl {:production "spike://acme/billing/stripe-processor"
           :mock       "spike://acme/billing/mock-processor"
           :canary     "spike://acme/billing/v2-processor"}))
`;

  return (
    <Story
      title="Alternative implementations"
      lisp={lisp}
      graph={{
        activeImplementation: "production",
        nodes: {
          "payment-processor": {
            id: "payment-processor",
            kind: "node",
            label: "payment-processor",
            subgraph: null,
            implementations: {
              production: {
                label: "production",
                subgraph: "spike://acme/billing/stripe-processor",
                tags: ["production"],
              },
              mock: {
                label: "mock",
                subgraph: "spike://acme/billing/mock-processor",
                tags: ["mock"],
              },
              canary: {
                label: "canary",
                subgraph: "spike://acme/billing/v2-processor",
                tags: ["canary"],
              },
            },
            properties: {},
          },
        },
      }}
      notes=":impl takes an EDN map of tag → URI. :active-impl on the graph sets the default implementation."
    />
  );
}
