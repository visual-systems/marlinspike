# Marlinspike — IDE Design Document

> **Status:** Draft v0.2  
> **Purpose:** Starting point for implementation. To be iterated on as a Claude Code project.

---

## 1. Vision

Marlinspike is a general-purpose **dataflow graph IDE** — a tool for authoring, validating, collaborating on, and targeting graphs to downstream runtimes.

The graph is the source of truth. All other representations (code, config, API schemas, deployment manifests) are derived from it. The IDE does not execute graphs directly — it is a structured editing and validation environment. Execution is always delegated to pluggable runtimes.

The system is designed to be **domain-agnostic at the core** and **domain-specific at the edges**. The same IDE can author:

- Low-level algorithm graphs (synchronous, typed data flow)
- Audio/media processing pipelines
- Distributed cloud service orchestration (K8s-style)
- Actor-based streaming architectures
- ETL pipelines across heterogeneous data sources

Domain specialisation is achieved through **property schemas** and **constraint plugins** layered on top of the base graph format — not by building separate tools.

---

## 2. Guiding Principles

- **Graph as source of truth.** The serialised graph is what you save, version, and hand to a runtime. All views derive from it.
- **Rose-tree structure.** The graph is a hierarchy of nested subgraphs. Every node is either a leaf or contains a subgraph. The whole system is navigable as a tree.
- **Sibling-only communication.** Nodes communicate only with their siblings via typed port nodes. Cross-level communication is not permitted directly — it must be mediated by port nodes at the appropriate level.
- **CRDT-first collaboration.** The graph store is conflict-free by default. Constraints are a layer above, not a precondition for merging.
- **LSP-style extensibility.** Constraint logic, validation, completions, and diagnostics live in plugins over a well-defined protocol. The IDE core has no domain knowledge.
- **Addressable subgraphs.** Every subgraph has a URI. Subgraphs can be referenced, shared, and composed across projects and teams.
- **Persona-aware views.** The IDE supports multiple viewing personas — architectural overview, focused development, review — without changing the underlying graph.
- **Pragmatic first, formal later.** Ship a working system. Formalise semantics incrementally as real use cases demand it.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                            │
│                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │  Tree View   │  │         Hybrid Canvas                │ │
│  │  (left panel)│  │  Force layout │ Subgraph nav         │ │
│  │  Rose-tree   │  │  Diagnostic overlay │ Persona filter │ │
│  │  navigation  │  │                                      │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
│         Live validation │ Diagnostics │ Palette              │
└──────────────┬──────────────────────────────────────────────┘
               │ graph change events / diagnostic requests
┌──────────────▼──────────────────────────────────────────────┐
│                   Graph Protocol Layer                      │
│   Change events │ Diagnostics │ Completions │ Hover         │
│                 (analogous to LSP)                          │
└────────┬─────────────────────────┬──────────────────────────┘
         │                         │
┌────────▼────────┐   ┌────────────▼──────────────────────────┐
│   Graph Store   │   │       Constraint Plugin Host          │
│  CRDT (JSON)    │   │  Property schema validators           │
│  Automerge/Yjs  │   │  Cross-node constraint checks         │
│  URI-addressed  │   │  Compile-time hooks                   │
│  subgraphs      │   │  External SDK validators              │
└────────┬────────┘   └───────────────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────┐
│                    Runtime Targets                          │
│   K8s manifests │ Audio DSP │ Actor systems │ ETL           │
│   Simulation │ Test harness │ Mock environment              │
│        (consume validated, annotated graphs)                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 Graph as Rose-Tree

The fundamental structure is a **rose-tree of subgraphs**. Every node in a graph is either:

- A **leaf node** — no subgraph; represents an atomic operation or external dependency
- A **composite node** — contains a subgraph, which is itself a full graph with its own nodes, edges, and port nodes

There is no fixed depth limit. A system graph may contain service graphs, which contain module graphs, which contain algorithm graphs, and so on. Navigation up and down this tree is a first-class UI operation.

A subgraph is referenced by URI, not embedded inline. This allows subgraphs to be shared across parent graphs and versioned independently.

```
system/
  └── service-a          (composite — subgraph URI: spike://org/repo/service-a)
        └── module-x     (composite — subgraph URI: spike://org/repo/service-a/module-x)
              └── fn-1   (leaf)
              └── fn-2   (leaf)
        └── module-y     (composite)
  └── service-b          (composite)
```

### 4.2 Sibling Communication and Port Nodes

**Only sibling nodes may communicate directly.** A node communicates with the outside world exclusively through **port nodes** — special nodes at the boundary of its parent subgraph.

Port nodes are first-class nodes in the graph, typed with a schema. They appear both:
- Inside the subgraph (as the source/sink of internal edges)
- On the exterior of the composite node (as the ports visible to siblings)

This enforces strict encapsulation: no cross-level wiring is possible without an explicit port node at each level.

#### Multiple Port Nodes per Interface

A composite node may have multiple port nodes, each representing a distinct interface. This supports API-style use cases where different calling conventions, protocols, or type signatures must be kept separate rather than collapsed into a single polymorphic port:

```
┌─────────────────────────────┐
│       service-a             │
│                             │
│  [HTTP port]  [gRPC port]   │  ← distinct port nodes on exterior
│  [metrics]    [health]      │
└─────────────────────────────┘
```

Port nodes carry typed schemas. An HTTP port node and a gRPC port node are different schema types — they are not variants of a single generic port. This ensures that edges can only be drawn between compatible port types, giving the constraint system something meaningful to check.

#### Port Node Schema Fields

```jsonc
{
  "id": "<port-node-id>",
  "kind": "port",
  "portSchema": "io.http.request-response",   // registered schema type
  "direction": "in" | "out" | "inout",
  "label": "HTTP API",
  "properties": {}    // extended by portSchema
}
```

### 4.3 Base Graph Format

```jsonc
{
  "$schema": "https://marlinspike.io/schema/graph/v1",
  "id": "uuid",
  "uri": "spike://org/repo/path/to/subgraph",
  "meta": {
    "name": "My Graph",
    "created": "ISO8601",
    "modified": "ISO8601"
  },
  "nodes": {
    "<node-id>": {
      "id": "<node-id>",
      "kind": "node" | "port",
      "label": "My Node",
      "subgraph": "<uri>" | null,             // null = leaf node
      "implementations": {                    // alternative impls (see §4.4)
        "<impl-id>": {
          "label": "Test mock",
          "subgraph": "<uri>",
          "tags": ["test", "mock"]
        }
      },
      "properties": {}
    }
  },
  "edges": {
    "<edge-id>": {
      "id": "<edge-id>",
      "from": { "node": "<node-id>", "port": "<port-node-id>" },
      "to":   { "node": "<node-id>", "port": "<port-node-id>" },
      "properties": {}
    }
  },
  "properties": {},
  "activeSchemas": ["io.k8s.deployment", "spike.dataflow.typed"],
  "activeImplementation": "<impl-id>" | null  // graph-level default
}
```

### 4.4 Alternative Implementations

A composite node may have multiple **alternative implementations** — different subgraphs that satisfy the same port interface. Implementations are selected:

- **Globally** — a graph-level `activeImplementation` field sets the default for all nodes carrying that tag
- **Locally** — a node-level override that takes precedence over the global default

This enables:

| Use case | Implementation tag |
|---|---|
| Production execution | `production` |
| Local simulation | `simulation` |
| Unit testing | `mock` |
| Performance benchmarking | `optimised` |
| Staged rollout (A/B) | `canary` |

Implementations must satisfy the same port interface as the default subgraph. The constraint system validates this. Selecting an implementation does not change the structural graph — only which subgraph URI is resolved at compile/run time.

### 4.5 Subgraph URIs and Addressability

Every subgraph has a URI of the form:

```
spike://<authority>/<repo>/<path>[@<version>]
```

Examples:
```
spike://acme/backend/auth-service
spike://acme/backend/auth-service/token-validator@v2.1.0
spike://community/stdlib/map-reduce
```

URIs are the unit of sharing, versioning, and referencing. A composite node's `subgraph` field is always a URI — subgraphs are never embedded inline. This means:

- A subgraph can be referenced by multiple parent nodes (library reuse)
- Subgraph URIs can be shared and opened directly in the IDE
- Version pinning is explicit
- The CRDT operates per-URI — each subgraph is a separate CRDT document

---

## 5. Constraint System

The constraint system is modelled closely on the **Language Server Protocol (LSP)**. The IDE is the client; constraint plugins are servers. The IDE has no domain knowledge — it only knows how to route events and display responses.

### 5.1 Protocol

```
IDE  ──graph/didChange──────────────────▶  Constraint Plugin
IDE  ◀─graph/publishDiagnostics──────────  Constraint Plugin
IDE  ──graph/completion──────────────────▶  Constraint Plugin
IDE  ◀─graph/completionResponse──────────  Constraint Plugin
IDE  ──graph/hover───────────────────────▶  Constraint Plugin
IDE  ◀─graph/hoverResponse──────────────  Constraint Plugin
IDE  ──graph/compile─────────────────────▶  Constraint Plugin
IDE  ◀─graph/compileResponse────────────  Constraint Plugin
```

Diagnostics carry a severity (error, warning, info), a location (node id, edge id, port node id, or graph-level), and a message. The UI renders them inline on the canvas and in the tree view.

### 5.2 Constraint Evaluation Stages

| Stage | Trigger | Mechanism | Examples |
|---|---|---|---|
| **Live** | Every graph change | JSON Schema validation | Required fields, port type mismatches |
| **Server-side** | On demand / on save | Constraint plugin protocol | Cross-node invariants, impl interface compatibility |
| **Compile-time** | On targeting a runtime | Plugin compile hook | K8s resource limits, audio buffer sizes, mock coverage |

### 5.3 Constraint Authoring

Constraint plugins can be:

- **Bundled** — shipped with a property schema package
- **External** — a running process connected over stdio or HTTP (same pattern as LSP)
- **Inline** — a small script defined in the graph's properties for project-local rules
- **Delegated** — a remote service (e.g. an API validating against an OpenAPI spec)

---

## 6. UI Architecture

### 6.1 Tree View (Left Panel)

The left panel shows the full rose-tree of the system as a collapsible tree. Each entry is a node; composite nodes are expandable. Selecting a node in the tree:

- Navigates the canvas to that node's parent subgraph, with the node highlighted
- Double-clicking enters the node's subgraph on the canvas

Collapsing a node in the tree view collapses it on the canvas too — the two views are synchronised. The tree view is the primary orientation tool for large systems where the canvas alone is disorienting.

Presence indicators (collaborator avatars) appear on the tree view entries for subgraphs that other users are currently viewing or editing.

### 6.2 Canvas Model

The canvas is a **hybrid canvas** — spatially flexible but structurally aware. It understands:

- Nodes and their port nodes
- Edges as first-class routed connections between port nodes
- Subgraph containment (composite nodes can be entered)
- Active property schemas (affecting palette and editable fields)
- Diagnostic overlays (errors/warnings on the relevant node/edge/port)
- The current persona filter (affecting what is visible and at what detail)

The canvas always shows **one level of the rose-tree at a time** — the siblings within the currently focused subgraph. Port nodes appear on the boundary of their parent composite node.

### 6.3 Force Layout

Layout uses a **bottom-up force simulation**:

- Leaf nodes stabilise first within their parent subgraph
- Once leaves stabilise, the parent composite node's size is determined by its contents
- Parent-level forces then act only between siblings at that level
- This repeats up the tree

Crucially, **forces only act between siblings** — matching the communication model exactly. Nodes at different levels of the tree do not exert forces on each other.

The user can lock node positions after stabilisation and resume force simulation at any time. Layout mode (auto / locked / partial) is stored per subgraph.

### 6.4 Persona Views

Different users need different views of the same graph. Personas are named, shareable filters that control:

- **Depth limit** — how many levels of subgraph to expand automatically
- **Schema filter** — show only nodes/edges annotated with specific schemas
- **Property filter** — show/hide specific property fields in node panels
- **Implementation filter** — which implementation tag is active in this view
- **Focus scope** — restrict the view to a specific subgraph URI subtree

Example personas:

| Persona | Depth | Schema filter | Use case |
|---|---|---|---|
| Architect | 2 | None | High-level system review |
| Developer | Unlimited | `spike.dataflow.typed` | Working on a specific module |
| Ops | 3 | `io.k8s` | Reviewing deployment topology |
| Reviewer | 1 | None | PR review — top-level structure only |

Personas are stored in the graph (shared) or user preferences (personal) with different scopes. A URI can be shared with a persona: `spike://acme/backend/auth-service?persona=ops`.

### 6.5 Subgraph Navigation

- **Enter** — double-click a composite node to enter its subgraph; canvas transitions in, breadcrumbs update
- **Exit** — breadcrumb or keyboard shortcut to go up one level
- **Jump** — click any node in the tree view to jump directly to it
- **Share** — copy the URI of the currently focused subgraph, optionally with active persona appended

### 6.6 Collaboration

Collaboration is real-time, CRDT-backed, per-subgraph-URI. Multiple users edit simultaneously. Presence (who is in which subgraph) is shown in both the tree view and the canvas. Merge diagnostics from concurrent edits appear inline as constraint diagnostics — non-blocking.

---

## 7. Alternative Implementations in Practice

**In the canvas**, a composite node with multiple implementations shows a small indicator. Clicking it opens an implementation switcher showing available implementations and their tags.

**In the tree view**, the active implementation for each node is shown as a badge.

**At compile time**, the target runtime receives a fully resolved graph where all composite nodes have had their URIs substituted with the selected implementation's URI. The structural graph (node identities, port connections) remains unchanged.

**For testing**, selecting the `mock` implementation globally replaces all external dependencies with mock subgraphs while leaving the internal structure intact. This is the primary testing story — not a separate test configuration, but an implementation selection on the same graph.

---

## 8. View Modes and Topology Constraints

### 8.1 Two Orthogonal Axes

View mode and topology constraints are **fully decoupled**:

- **View mode** — how a subgraph is rendered. A persona-level setting. Independent of what topology constraints are active.
- **Topology schemas** — what structural and operational properties a subgraph is declared to satisfy. Validated by constraint plugins. Multiple schemas may be active simultaneously on the same subgraph.

This means an actor subgraph can be viewed in pipeline mode (useful for tracing message flow) even though its topology schema permits cycles and dynamic dispatch. The view is a lens; the schema is a contract.

### 8.2 Call Graph vs. Pipeline — One Representation, Two Views

The underlying data model is always the same: a directed graph of identity-bearing nodes with typed port nodes. Both major paradigms map onto this without structural distinction:

- **Call graph style** — nodes are prominent, named, addressable. Edges are wires between named ports. Node identity is primary.
- **Pipeline style** — flow is primary. Nodes are transformations between stages. Source nodes have only outputs; sink nodes have only inputs. A pure source is just a call-graph node with no input ports; a pure sink has no output ports.

**Pipeline mode is a view over the same identity-preserving node graph**, not a separate representation. Switching between views is lossless. The one restriction that makes this true: pipeline-mode edits must always produce valid call-graph nodes:

- Inserting a transformation inline on an edge creates a new node with a generated identity
- Fusing two adjacent nodes is **not** permitted in pipeline mode — it destroys call-graph identity. The equivalent is explicitly collapsing them into a named composite subgraph (the existing subgraph mechanism)

### 8.3 Topology Schemas

Topology schemas are optional, composable declarations of structural and operational intent. They are not mutually exclusive — a subgraph may carry multiple topology schemas simultaneously. Where schemas are compatible, this is straightforward. Where they are in tension or outright incompatible, the constraint system surfaces **informative diagnostics** explaining the conflict. Resolution is always the author's decision — the system informs, it does not block.

#### `spike.topology.pipeline`

The strictest dataflow topology. Enforces that the subgraph can be expressed as a linear composition of transformations.

- **Permits:** directed acyclic graphs, typed port contracts (input type → output type)
- **Forbids:** cycles, dynamic dispatch, nodes with no clear directional sense
- **Port semantics:** each node's output type is the next node's input type — matched statically
- **Edit restrictions in pipeline view:** no fusing; inline insertion always creates a named node
- **Analogues:** Unix pipes, Haskell `Category`/basic `Arrow`, Elixir `Stream`, Spark pipelines

#### `spike.topology.arrow`

A richer dataflow topology inspired by Haskell's `Arrow` hierarchy — `Arrow`, `ArrowChoice`, `ArrowLoop`, `ArrowApply`. Strictly more expressive than `spike.topology.pipeline`.

- **Permits:** everything `pipeline` permits, plus:
  - **Choice** (`ArrowChoice`) — conditional branching on the type of input; a node may route to one of several outputs depending on the value. Edges carry `Left`/`Right` (or tagged union) type annotations.
  - **Looping** (`ArrowLoop`) — feedback edges carrying a "loop wire" — an internal state that feeds back into the same node. Represented as a special `loop` edge type, visually distinct (curved back-arrow). Does not violate acyclicity in the dataflow sense because the loop wire carries state, not a new activation.
  - **First/second** — parallel composition of arrows, where one branch passes through unchanged. Represented as parallel edge lanes.
- **Forbids:** fully dynamic dispatch (targets must be statically known at the edge level, even if the value routed is dynamic)
- **Port semantics:** ports may carry tagged union types; loop ports carry state type annotations
- **Edit restrictions in pipeline view:** same as `pipeline`, plus loop edges rendered as back-arrows and choice edges rendered as branching lanes
- **Analogues:** Haskell `Arrow`/`ArrowChoice`/`ArrowLoop`, FRP signal graphs, certain reactive stream libraries

#### `spike.topology.actor`

Message-passing topology. Structurally and operationally distinct from dataflow topologies — shares visual metaphor but not semantics.

- **Permits:** cycles (an actor may send to itself or upstream), dynamic dispatch (a `dynamic` edge type whose target is a named dispatch group resolved at runtime), fan-out and fan-in, fire-and-forget message patterns
- **Forbids:** synchronous return edges (which would imply a response obligation incompatible with fire-and-forget)
- **Port semantics:** ports carry message schema types. No matched input→output contract per node. An actor receives messages and may emit zero or more messages to any reachable target.
- **Dynamic edges:** rendered as dashed arrows to a named dispatch group node rather than a concrete target node. The dispatch group declares the set of possible runtime targets.
- **Edit restrictions in pipeline view:** no fusing; inline insertion valid; cycles permitted (rendered as back-arrows in pipeline view)
- **Analogues:** Erlang/OTP, Akka (classic), Orleans, actor model generally

#### Compatibility Between Topology Schemas

Schemas form a loose hierarchy of expressiveness, but this does not mean they are mutually exclusive. A subgraph may satisfy multiple schemas simultaneously — for example, a subgraph that is both `pipeline`-valid and `arrow`-valid (since `pipeline` is a subset of `arrow`). The constraint system validates each active schema independently and reports:

- **Compatible** — all active schemas are satisfied, no conflicts
- **Redundant** — one schema is a strict subset of another that is also active (informational, not an error)
- **Tensioned** — schemas are both satisfiable in principle but the current graph satisfies one and not another (diagnostic with explanation)
- **Incompatible** — schemas have mutually exclusive requirements (e.g. `pipeline` forbids cycles; `actor` permits them — if a cycle is present, `pipeline` is violated). Surfaced as a clear diagnostic: *"This subgraph satisfies `spike.topology.actor` but not `spike.topology.pipeline` because it contains a cycle at node X."*

The author decides how to respond — remove the unsatisfied schema, restructure the graph, or leave both active with the diagnostic as a known tension.

```jsonc
// Example: a subgraph declared to satisfy both arrow and actor schemas
// The constraint system will validate both and report any tensions
{
  "uri": "spike://acme/backend/event-processor",
  "activeSchemas": [
    "spike.topology.arrow",    // author intends ArrowChoice routing
    "spike.topology.actor"     // author intends fire-and-forget messaging
  ]
  // If the graph contains dynamic dispatch edges, spike.topology.arrow
  // will emit a diagnostic: "dynamic edges are not permitted in arrow topology"
  // The author can then decide: remove spike.topology.arrow, or restructure
}
```

### 8.4 View Mode in Personas

View mode is a persona-level setting. A developer might view an actor subgraph in pipeline mode to trace message flow; an architect might prefer force mode to see the full topology. Any view mode can be applied to any subgraph regardless of its topology schemas — the view is always a lens, never a constraint.

```jsonc
{
  "persona": "developer",
  "viewMode": "pipeline",   // "force" | "call-graph" | "pipeline"
  "depthLimit": null,
  "schemaFilter": ["spike.topology.actor"]
}
```

### 8.5 Layout per View Mode

| View mode | Layout algorithm | Edge style | Node emphasis |
|---|---|---|---|
| `force` | Bottom-up d3-force (sibling-scoped) | Thin routed wires | Equal |
| `call-graph` | Force or manual | Labelled port connectors | High — nodes prominent |
| `pipeline` | Sugiyama / layered, left-to-right | Thick directional arrows; back-arrows for loops/cycles; dashed for dynamic dispatch | Low — flow prominent |

In pipeline view, edge types introduced by topology schemas are rendered distinctly:

| Edge type | Rendering |
|---|---|
| Standard dataflow | Solid thick arrow |
| `ArrowChoice` branch | Forking lanes with `L`/`R` labels or tag labels |
| `ArrowLoop` feedback | Curved solid back-arrow |
| Actor dynamic dispatch | Dashed arrow to dispatch group node |
| Actor cycle | Curved dashed back-arrow |

---

## 9. Frontend Authoring

### 8.1 Concept

A graph's top-level port nodes define its external interface — inputs it accepts and outputs it produces. This interface is already schema-typed. A frontend is therefore just a **rendering of that interface** — auto-generated from the port schemas, with no additional authoring required for basic cases.

This means the same system used to design a distributed backend can also produce its UI. The graph is a full-stack artifact.

### 8.2 Form Generation

For simple cases, tools like **react-jsonschema-form** (rjsf) can generate a working frontend directly from the JSON Schema of the top-level input port nodes. This is the zero-effort path — useful for prototyping, internal tooling, admin interfaces, and data entry workflows.

```
Graph top-level ports
    │
    ├── input ports  → JSON Schema → rjsf form fields
    └── output ports → JSON Schema → result display components
```

The generated form submits to the graph's runtime target (e.g. an HTTP port node), and renders responses from output port schemas. No frontend code needs to be written.

### 8.3 Frontend as a Graph Layer

For richer UIs, the frontend itself can be authored as a graph layer — a subgraph whose nodes are UI components (input, display, layout) and whose edges are data bindings. This subgraph is connected to the top-level port nodes of the backend graph.

This is the same model as the rest of the system: the frontend subgraph is just another composite node, with its own port nodes, alternative implementations (e.g. a `web` impl and a `mobile` impl), and schema constraints (e.g. a `ui.form` schema that validates component compatibility).

### 8.4 Port Schema → UI Component Mapping

Port schemas declare not just data types but UI hints, allowing the form generator to produce appropriate components:

```jsonc
{
  "portSchema": "spike.ui.input",
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "ui:widget": "textarea",
      "ui:placeholder": "Enter search query..."
    },
    "filters": {
      "type": "array",
      "items": { "type": "string", "enum": ["recent", "popular", "nearby"] },
      "ui:widget": "checkboxes"
    }
  }
}
```

These `ui:` hints follow the rjsf convention and are optional — the generator falls back to sensible defaults for plain JSON Schema types.

### 8.5 Frontend Runtime Target

A dedicated frontend runtime target consumes a graph with UI port schemas and emits a deployable frontend artifact:

| Target | Output |
|---|---|
| `spike.frontend.rjsf` | React app with auto-generated rjsf forms (prototype) |
| `spike.frontend.web` | Full React component tree from UI subgraph |
| `spike.frontend.mobile` | React Native from UI subgraph with `mobile` impl selected |

The `rjsf` target is the quick-start path. The `web` and `mobile` targets are for production frontends authored as graph layers.

### 8.6 Implications

- **Prototyping becomes trivial** — define your port schemas, select the `rjsf` target, get a working UI immediately
- **Schema-first design** — the port interface is designed once and drives both validation and UI generation
- **Consistency guaranteed** — the frontend and backend share the same schema definitions; they cannot drift
- **Personas apply** — a `developer` persona might expose raw JSON input; an `end-user` persona might show a polished form; both derived from the same port schema

---

## 10. Runtime Targets

A runtime target consumes a **validated, schema-annotated, implementation-resolved graph snapshot** and produces an artifact or side effect.

| Target | Schema | Output |
|---|---|---|
| K8s | `io.k8s` | Helm chart / manifests |
| Audio DSP | `audio.dsp` | WASM audio worklet |
| Actor system | `spike.actors` | Elixir supervision tree |
| ETL | `spike.etl` | Spark / dbt project |
| Simulation | Any | Discrete event simulation |
| Test harness | Any | Test runner with mock impls selected |
| Mock server | `io.http` | Auto-generated mock API |
| Frontend (prototype) | `spike.ui` | React + rjsf form from port schemas |
| Frontend (web) | `spike.ui` | Full React component tree |
| Frontend (mobile) | `spike.ui` | React Native app |

---

## 11. Implementation Roadmap

### Phase 1 — Core (MVP)
- [ ] Base graph JSON schema (nodes, edges, port nodes, open properties, URIs)
- [ ] CRDT graph store per subgraph URI (Automerge)
- [ ] Minimal canvas UI (place nodes, draw edges, enter/exit subgraphs)
- [ ] Tree view panel (rose-tree navigation, sync with canvas)
- [ ] JSON Schema-based live validation
- [ ] Save/load graph from disk

### Phase 2 — Ports and Structure
- [ ] Port node schema and typed edge validation
- [ ] Sibling-only communication enforcement
- [ ] Multiple port nodes per composite node
- [ ] Port interface compatibility checking

### Phase 3 — Extensibility
- [ ] Constraint plugin protocol (Graph Protocol Layer)
- [ ] First constraint plugin (typed dataflow schema)
- [ ] Palette populated from active schemas
- [ ] Diagnostic overlay on canvas and tree view

### Phase 4 — Implementations
- [ ] Alternative implementation system
- [ ] Global and local implementation selection
- [ ] Implementation interface validation
- [ ] Test/mock implementation workflow
- [ ] Frontend prototype target (rjsf from top-level port schemas)

### Phase 5 — Layout and Personas
- [ ] Bottom-up force layout (sibling-scoped forces)
- [ ] Persona definition and storage
- [ ] Persona filter application in canvas and tree view
- [ ] URI sharing with persona query parameter

### Phase 6 — Collaboration
- [ ] Real-time CRDT sync (local network first, then remote)
- [ ] Presence indicators in tree view and canvas
- [ ] Merge diagnostic surfacing

### Phase 7 — Runtimes
- [ ] Runtime target protocol
- [ ] First runtime target (simulation or code-gen)
- [ ] Compile-time constraint evaluation
- [ ] Implementation resolution at compile time

### Phase 8 — Ecosystem
- [ ] Property schema registry / package format
- [ ] Schema dependency declarations
- [ ] Inline constraint scripts
- [ ] External/remote constraint delegation
- [ ] Public subgraph URI registry

### Phase 9 — AI Interface
- [ ] Spike-Lisp serialiser and parser (round-trip with JSON graph format)
- [ ] MCP server with core read/write/validate tools
- [ ] `suggestion` field required in all constraint plugin diagnostics
- [ ] `graph_patch` partial diff support
- [ ] Depth-limited `graph_read` for context window efficiency
- [ ] AI edit workflow integration test (agent edits graph, sees live canvas update)

---

## 12. Technology Candidates

| Layer | Candidate | Notes |
|---|---|---|
| Graph store | Automerge (JS/Rust) | Better Rust interop; per-URI documents |
| UI | TypeScript + React | Already in `marlinspike/ui` |
| Canvas rendering | React Flow or custom SVG | React Flow for speed; custom for full control |
| Tree view | Custom React component | Needs tight sync with canvas |
| Force layout | d3-force | Scoped per subgraph level; composable |
| Constraint plugins | stdio JSON-RPC (LSP-style) | Language-agnostic, proven pattern |
| Base schema | JSON Schema Draft 2020-12 | Widest tooling support |
| Haskell backend | Servant + existing repos | Constraint plugins and runtime targets |
| Serialisation | JSON (base) + MessagePack (wire) | JSON for tooling; MessagePack for performance |
| URI resolution | Custom resolver | Local file, remote HTTP, version registry |
| AI interface | MCP server + Spike-Lisp | See §11 |

---

## 13. AI Interface

### 13.1 Design Goals

The graph should be easily readable, writable, and navigable by an AI agent without requiring access to the visual canvas. Three properties make this achievable:

- The rose-tree structure maps directly to S-expressions — the graph *is* a nested list
- The URI addressing scheme gives the AI stable references to any subgraph, node, or port
- The constraint system already produces structured, informative diagnostics — these serve as the AI's error feedback loop, closing the edit→validate→fix cycle without human intervention

The interface has two components: a **Spike-Lisp** text format for reading and writing graphs, and an **MCP server** that exposes graph operations as tools an AI agent can call.

### 13.2 Spike-Lisp — A Lisp-Like Graph Notation

Spike-Lisp is a round-trippable text representation of the graph. It is not a programming language — it is a serialisation format optimised for readability and editability by both humans and AI. It compiles to and from the canonical JSON graph format without information loss.

#### Basic Structure

```lisp
; A subgraph is a list headed by its node label
; Properties are keyword arguments
; Edges are declared separately from the tree structure

(graph :uri "spike://acme/backend/auth-service"
       :schemas (spike.topology.pipeline io.http)

  ; Nodes — composite nodes contain their subgraph inline
  (node :id "ingress" :label "HTTP Ingress"
    :port (in  :id "p-in"  :schema io.http.request)
    :port (out :id "p-out" :schema spike.dataflow.bytes))

  (node :id "validator" :label "Token Validator"
    :port (in  :id "p-in"  :schema spike.dataflow.bytes)
    :port (out :id "p-ok"  :schema spike.dataflow.token)
    :port (out :id "p-err" :schema spike.dataflow.error))

  ; Composite node — subgraph inline or by URI reference
  (node :id "processor" :label "Request Processor"
    :subgraph "spike://acme/backend/auth-service/processor"
    :port (in  :id "p-in"  :schema spike.dataflow.token)
    :port (out :id "p-out" :schema io.http.response))

  ; Edges — from/to reference node-id and port-id
  (edge :from ("ingress"   . "p-out")
        :to   ("validator" . "p-in"))

  (edge :from ("validator" . "p-ok")
        :to   ("processor" . "p-in"))
        
  ; Properties on edges
  (edge :from ("validator" . "p-err")
        :to   ("ingress"   . "p-in")   ; feedback — would violate pipeline constraint
        :props (:label "retry")))
```

#### ArrowChoice Branching

```lisp
(node :id "router" :label "Auth Router"
  :port (in  :id "p-in"    :schema spike.dataflow.request)
  :port (out :id "p-left"  :schema spike.dataflow.request :tag :authenticated)
  :port (out :id "p-right" :schema spike.dataflow.request :tag :anonymous))
```

#### ArrowLoop Feedback

```lisp
(node :id "accumulator" :label "State Accumulator"
  :port (in    :id "p-in"    :schema spike.dataflow.event)
  :port (out   :id "p-out"   :schema spike.dataflow.result)
  :port (loop  :id "p-state" :schema spike.dataflow.state))  ; loop wire
```

#### Actor Dynamic Dispatch

```lisp
(node :id "dispatcher" :label "Event Dispatcher"
  :port (in      :id "p-in"  :schema spike.actor.message)
  :port (dynamic :id "p-out" :dispatch-group "handlers"
                 :schema spike.actor.message))  ; target resolved at runtime
```

#### Subgraph Reference (without inlining)

```lisp
; Reference a shared library subgraph by URI
(node :id "map-reduce" :label "Map Reduce"
  :subgraph "spike://community/stdlib/map-reduce@v1.2.0"
  :impl :production          ; implementation selection
  :port (in  :id "p-in"  :schema spike.dataflow.collection)
  :port (out :id "p-out" :schema spike.dataflow.collection))
```

### 13.3 MCP Server Interface

The MCP server exposes the graph as a set of AI-callable tools. It follows the Model Context Protocol conventions — tools have typed inputs and return structured results including diagnostics.

#### Tools

```
graph_read       (uri)                    → Spike-Lisp string of subgraph
graph_write      (uri, lisp)              → {ok} | {errors: Diagnostic[]}
graph_patch      (uri, patch)             → {ok} | {errors: Diagnostic[]}
graph_validate   (uri)                    → Diagnostic[]
graph_list       (uri, depth?)            → tree of URIs and labels
graph_search     (query)                  → matching node URIs
graph_schemas    (uri)                    → active schemas and their status
node_read        (uri, node_id)           → Spike-Lisp of single node
node_write       (uri, node_id, lisp)     → {ok} | {errors: Diagnostic[]}
node_delete      (uri, node_id)           → {ok} | {errors: Diagnostic[]}
edge_read        (uri, edge_id)           → Spike-Lisp of single edge
edge_write       (uri, edge_id, lisp)     → {ok} | {errors: Diagnostic[]}
edge_delete      (uri, edge_id)           → {ok} | {errors: Diagnostic[]}
impl_select      (uri, node_id, impl_id)  → {ok} | {errors: Diagnostic[]}
schema_add       (uri, schema_id)         → Diagnostic[]
schema_remove    (uri, schema_id)         → {ok}
compile          (uri, target)            → {artifacts} | {errors: Diagnostic[]}
```

#### Diagnostic Format

Every tool that modifies the graph returns diagnostics in a structured, AI-readable format:

```jsonc
{
  "severity": "error" | "warning" | "info",
  "code": "spike.topology.pipeline.cycle-detected",
  "message": "Edge from ('validator', 'p-err') to ('ingress', 'p-in') creates a cycle. This subgraph has spike.topology.pipeline active, which requires an acyclic graph.",
  "location": { "node": "validator", "edge": "edge-003" },
  "suggestion": "Remove spike.topology.pipeline from activeSchemas to permit cycles, or remove this edge and handle errors without feedback."
}
```

Diagnostics include a `suggestion` field — a plain-language repair hint the AI can act on directly in a subsequent `graph_patch` call. This closes the edit→validate→fix loop without human intervention.

### 13.4 AI Edit Workflow

A typical AI agent workflow:

```
1. graph_list("spike://acme/backend")
   → get oriented in the tree

2. graph_read("spike://acme/backend/auth-service")
   → read current state as Spike-Lisp

3. graph_write("spike://acme/backend/auth-service", new_lisp)
   → attempt edit; receive diagnostics if invalid

4. (if diagnostics) read suggestion fields, patch accordingly
   → graph_patch(...) to fix specific issues

5. graph_validate("spike://acme/backend/auth-service")
   → confirm clean before finishing
```

The AI never needs to understand the visual canvas — it works entirely in Spike-Lisp and diagnostics. The human sees the result live on the canvas as the AI edits, since the CRDT store is shared.

### 13.5 Context Window Efficiency

Spike-Lisp is designed to be token-efficient for LLMs:

- **Selective reading** — `node_read` and `graph_read` with depth limits mean the AI can fetch only what it needs rather than the entire graph
- **Subgraph URIs as handles** — composite nodes in Spike-Lisp output show `:subgraph "uri"` rather than inlining contents, keeping representations shallow until the AI explicitly descends
- **Patch operations** — `graph_patch` accepts a partial Spike-Lisp diff (only the changed nodes/edges) rather than requiring a full graph rewrite, minimising token cost for small edits
- **Diagnostic locality** — errors reference specific node/edge IDs, so the AI can fetch just the relevant subgraph for repair context

### 13.6 Implications for the Constraint System

The MCP interface makes the constraint system's quality directly observable. A vague diagnostic like *"invalid graph"* is useless to an AI agent; it has no recourse. The `suggestion` field in diagnostics is therefore not optional polish — it is a **first-class requirement** for every constraint plugin that wants to be usable in the AI workflow.

This is a useful design forcing function: if a constraint plugin cannot explain its violations in terms of concrete repair suggestions, it is incomplete. The AI interface raises the bar for constraint plugin quality across the whole system.

---



## 14. Open Questions

1. **Schema composition semantics** — when two property schemas are simultaneously active, how are their constraints composed? Are conflicts declared statically or detected at runtime?

2. **Port interface versioning** — if a subgraph's port interface changes, how are existing edges to that subgraph's URI invalidated or migrated? Semver-style breaking change detection?

3. **Implementation interface equivalence** — what does it mean for two subgraphs to have "the same interface"? Structural port match? Named port match? Schema-defined contract?

4. **Shared mutable subgraphs** — if a subgraph URI is referenced by multiple parent nodes, and one parent's collaborator edits it, what happens to all other parents? Push notification? Opt-in subscription?

5. **Constraint plugin lifecycle** — are plugins started on demand per graph, or long-running processes? How are crashes and slow validators handled?

6. **Persona storage scope** — are personas stored in the graph (shared with collaborators) or in user preferences (personal)? Probably both, with explicit scope declaration.

7. **Force layout with fixed positions** — how does the bottom-up force layout interact with manually positioned nodes? Partial lock? Per-subtree layout mode?

8. **Cross-URI constraint checking** — some constraints may need to span subgraph URIs (e.g. checking that two services use compatible port schemas). How does the constraint plugin host resolve external URIs for validation?

---

*This document is intentionally incomplete. It is a design starting point, not a specification. Decisions should be made incrementally as implementation reveals the real constraints.*
