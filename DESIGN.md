# Marlinspike — IDE Design Document

> **Purpose:** Living document for implementation design.

---

## Vision

Marlinspike is a general-purpose **dataflow graph IDE** — a tool for authoring, validating,
collaborating on, and targeting graphs to downstream runtimes.

The graph is the source of truth. All other representations (code, config, API schemas, deployment
manifests) are derived from it. The IDE does not execute graphs directly — it is a structured
editing and validation environment. Execution is always delegated to pluggable runtimes.

The system is designed to be **domain-agnostic at the core** and **domain-specific at the edges**.
The same IDE can author:

- Low-level algorithm graphs (synchronous, typed data flow)
- Audio/media processing pipelines
- Distributed cloud service orchestration (K8s-style)
- Actor-based streaming architectures
- ETL pipelines across heterogeneous data sources

Domain specialisation is achieved through **property schemas** and **constraint plugins** layered on
top of the base graph format — not by building separate tools.

---

## Guiding Principles

- **Graph as source of truth.** The serialised graph is what you save, version, and hand to a
  runtime. All views derive from it.
- **Rose-tree structure.** The graph is a hierarchy of nested subgraphs. Every node is either a leaf
  or contains a subgraph. The whole system is navigable as a tree.
- **Sibling-only communication.** Nodes communicate only with their siblings via typed port nodes.
  Cross-level communication is not permitted directly — it must be mediated by port nodes at the
  appropriate level.
- **CRDT-first collaboration.** The graph store is conflict-free by default. Constraints are a layer
  above, not a precondition for merging.
- **LSP-style extensibility.** Constraint logic, validation, completions, and diagnostics live in
  plugins over a well-defined protocol. The IDE core has no domain knowledge.
- **Addressable subgraphs.** Every subgraph has a URI. Subgraphs can be referenced, shared, and
  composed across projects and teams.
- **Schemas as a modular type system.** The schema system is a runtime-extensible, distributed type
  system. Schemas compose as a commutative monoid — order-independent, additive, with a well-defined
  identity — and apply at any granularity: graph, subgraph, node, edge, port, or even a remote graph
  reference. The IDE is the type-checker client; schema plugins are the type-checker servers.
- **Modal construction.** Schema validation has two modes: _speculative_ (build freely; violations
  are live feedback, not blockers) and _enforced_ (violations are hard stops at designated
  commit/save/transition points). The mode is a per-context setting, not a global switch.
- **Persona-aware views.** The IDE supports multiple viewing personas — architectural overview,
  focused development, review — without changing the underlying graph.
- **Pragmatic first, formal later.** Ship a working system. Formalise semantics incrementally as
  real use cases demand it.

---

## Architecture Overview

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

## Data Model

### Graph as Rose-Tree

The fundamental structure is a **rose-tree of subgraphs**. Every node in a graph is either:

- A **leaf node** — no subgraph; represents an atomic operation or external dependency
- A **composite node** — contains a subgraph, which is itself a full graph with its own nodes,
  edges, and port nodes

There is no fixed depth limit. A system graph may contain service graphs, which contain module
graphs, which contain algorithm graphs, and so on. Navigation up and down this tree is a first-class
UI operation.

A subgraph is referenced by URI, not embedded inline. This allows subgraphs to be shared across
parent graphs and versioned independently.

```
system/
  └── service-a          (composite — subgraph URI: spike://org/repo/service-a)
        └── module-x     (composite — subgraph URI: spike://org/repo/service-a/module-x)
              └── fn-1   (leaf)
              └── fn-2   (leaf)
        └── module-y     (composite)
  └── service-b          (composite)
```

### Sibling Communication and Port Nodes

**Only sibling nodes may communicate directly.** A node communicates with the outside world
exclusively through **port nodes** — special nodes at the boundary of its parent subgraph.

Port nodes are first-class nodes in the graph, typed with a schema. They appear both:

- Inside the subgraph (as the source/sink of internal edges)
- On the exterior of the composite node (as the ports visible to siblings)

This enforces strict encapsulation: no cross-level wiring is possible without an explicit port node
at each level.

#### Multiple Port Nodes per Interface

A composite node may have multiple port nodes, each representing a distinct interface. This supports
API-style use cases where different calling conventions, protocols, or type signatures must be kept
separate rather than collapsed into a single polymorphic port:

```
┌─────────────────────────────┐
│       service-a             │
│                             │
│  [HTTP port]  [gRPC port]   │  ← distinct port nodes on exterior
│  [metrics]    [health]      │
└─────────────────────────────┘
```

Port nodes carry typed schemas. An HTTP port node and a gRPC port node are different schema types —
they are not variants of a single generic port. This ensures that edges can only be drawn between
compatible port types, giving the constraint system something meaningful to check.

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

### Base Graph Format

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
      "implementations": {                    // alternative impls (see Alternative Implementations)
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

### Alternative Implementations

A composite node may have multiple **alternative implementations** — different subgraphs that
satisfy the same port interface. Implementations are selected:

- **Globally** — a graph-level `activeImplementation` field sets the default for all nodes carrying
  that tag
- **Locally** — a node-level override that takes precedence over the global default

This enables:

| Use case                 | Implementation tag |
| ------------------------ | ------------------ |
| Production execution     | `production`       |
| Local simulation         | `simulation`       |
| Unit testing             | `mock`             |
| Performance benchmarking | `optimised`        |
| Staged rollout (A/B)     | `canary`           |

Implementations must satisfy the same port interface as the default subgraph. The constraint system
validates this. Selecting an implementation does not change the structural graph — only which
subgraph URI is resolved at compile/run time.

### Subgraph URIs and Addressability

Every subgraph has a URI of the form:

```
spike://<authority>/<repo>/<path>[@<version>][#<hash>]
```

Examples:

```
spike://acme/backend/auth-service
spike://acme/backend/auth-service/token-validator@v2.1.0
spike://community/stdlib/map-reduce#sha256:a3f8...
spike://acme/backend/auth-service/token-validator@v2.1.0#sha256:c9d1...
```

URIs are the unit of sharing, versioning, and referencing. A composite node's `subgraph` field is
always a URI — subgraphs are never embedded inline. This means:

- A subgraph can be referenced by multiple parent nodes (library reuse)
- Subgraph URIs can be shared and opened directly in the IDE
- Version pinning is explicit
- The CRDT operates per-URI — each subgraph is a separate CRDT document

**Hash fragment** (`#<hash>`) serves two roles depending on context:

- **Content addressing** — a URI with only a hash and no `@version` identifies a graph by its exact
  serialised content digest, independent of any mutable tag. Useful for immutable snapshots, build
  artefacts, and audit trails.
- **Verification** — when both `@version` and `#hash` are present, the hash is a check: the resolver
  fetches the version-tagged graph and verifies its digest matches before returning it. A mismatch
  is a resolution error (tampering or corruption detected).

The hash value is an opaque string with an optional algorithm prefix (e.g. `sha256:<hex>`). The IDE
and resolver treat it as opaque; algorithm selection is a storage/registry concern.

---

## Constraint System

### Schemas as a Modular Type System

The constraint system is best understood as a **modular, networked type system** with the IDE as the
type-checker client and schema plugins as the type-checker servers. The analogy to LSP is
intentional and deep: just as a language server provides completions, diagnostics, and hover
information for a programming language without the editor knowing anything about that language, a
schema plugin provides the same services for a graph schema without the IDE knowing anything about
that domain.

The key difference from a conventional type system: schemas are **composable, runtime-extensible,
and apply at any entity granularity**. There is no fixed schema baked into the IDE. Any combination
of schemas may be active on any entity at any time, including schemas loaded from remote sources or
applied against graphs referenced by URI.

**Constraints are the primary abstraction.** Interactions with the validation system — activating a
schema, reading diagnostics, querying completions — happen at the level of named, versioned
constraints. The underlying mechanism a constraint plugin uses to evaluate those constraints (JSON
Schema, a type-checker, a Prolog solver, a remote API call) is an implementation detail hidden
behind the plugin protocol. JSON Schema is one valid authoring format for writing a constraint
definition, not the interface you work with at runtime. You would deal with JSON Schema directly
only when _authoring or publishing_ a new constraint plugin.

### Schema Composition: Commutative Monoid

The set of active schemas on any entity forms a **commutative monoid**:

| Law               | Meaning                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **Identity**      | The empty schema set ∅ imposes no constraints. A graph with no schemas active is always valid. |
| **Associativity** | (A ⊕ B) ⊕ C = A ⊕ (B ⊕ C) — schemas can be applied in any grouping.                            |
| **Commutativity** | A ⊕ B = B ⊕ A — order of activation never matters.                                             |

**Compatibility** is a separate concern from composition. Two schemas are _compatible_ if their
combined effect is consistent — no entity can simultaneously satisfy and violate the same
constraint. Incompatible schemas can still both be active; the constraint system surfaces the
tension as diagnostics (see Topology Schemas for examples). The author decides whether to
resolve the tension or leave it open.

Schemas are applied to any entity in the graph:

```
graph-level    → applies to the whole subgraph
node           → applies to a specific node (or all nodes of a given kind)
edge           → applies to a specific edge (or all edges with matching properties)
port           → applies to a port node's type contract
remote ref     → applies to a subgraph referenced by URI, validating the interface
                 of the remote graph as seen from the current graph's perspective
```

Remote schema application is particularly powerful: a schema can assert that a remote subgraph URI
exposes a specific port interface, satisfies a topology constraint, or carries certain property
annotations — without reading the remote graph's internals. The constraint plugin resolves the URI
and validates the boundary.

### Modal Validation

Validation operates in two modes, settable per context (per-graph, per-persona, or at the IDE
session level):

| Mode        | Description                                                                                                                                                                                | When to use                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **sketch**  | Violations produce live diagnostic feedback but do not block any operation. The graph may be in a violated state at any time.                                                              | Active authoring, exploratory design, early-stage graphs              |
| **enforce** | Violations are hard stops at designated checkpoints: save, commit, publish, compile, or transition to a downstream target. The graph cannot advance past a checkpoint in a violated state. | Production graphs, shared libraries, CI validation, runtime targeting |

The mode applies to a _schema set_, not globally. A graph may have sketch mode for in-progress
topology schemas and enforce mode for the base format schema simultaneously. This allows "soft
typing" on evolving layers while maintaining hard invariants on stable ones.

Checkpoints where enforce mode blocks are declared by the schema plugin:

```jsonc
{
  "schema": "spike.topology.pipeline",
  "enforcedAt": ["save", "compile"], // blocks at these checkpoints if violated
  "sketchHints": true // even in sketch mode, surface live hints
}
```

#### Relationship to the UI authoring layer

The UI type system (`TreeNode`/`Edge` in the workspace) is intentionally permissive. It can
represent all graph concepts — ports, schemas, implementations, typed edges — but does not
structurally require any of them. Fields are optional rather than absent. A node without ports, an
edge without a schema, a graph without active constraints: all are valid UI states.

This is a deliberate design choice, not a limitation:

- The UI is the **sketching surface**. Structure emerges incrementally as the author fills things
  in.
- The **constraint system provides enforcement**. In sketch mode it surfaces feedback as the graph
  is developed; in enforce mode it blocks advancement past checkpoints.
- The relationship is: **enforce-valid ⊆ sketch-valid ⊆ UI-representable**. A graph that satisfies
  all enforced constraints is always a valid sketch; a valid sketch is always representable in the
  UI. The reverse does not hold.
- There is no separate "formal type" that the UI must be converted into. The UI _is_ the authoring
  model; constraints are what distinguish a finished graph from a work-in-progress.

#### Port representation in `TreeNode`

`TreeNode` carries an optional `ports` field (`Port[]`) with each port's name, direction
(`in`/`out`/`inout`), and optional type identifier. This is a deliberate native-field choice over
the alternative of storing ports inside `data`.

**The tension:** ports could instead live in `data` — keeping `TreeNode` lean and delegating all
port logic to constraint plugins. This is more extensible in principle: port semantics would be
defined by schemas, not hardcoded into the UI type. A future user-defined "ports-like" concept could
slot in without a schema change.

**Why native `ports` now:** port information needs to be accessible at the UI layer for immediate,
schema-free use — rendering port labels, inferring edge compatibility on drag-to-wire, and
serialising to/from Spike-Clojure `^Type` hints. Routing that through `data` + a constraint plugin
would require the UI to know which `data` key is "the ports key", which is just a looser version of
the same coupling. The `ports` field is optional, so nodes without port contracts are not burdened
by it. This keeps simple graphs simple.

**Future extensibility:** the constraint system can extend port semantics by reading `ports` and
applying additional rules (e.g. enforcing compatibility, validating schema types). User-defined
port-like concepts that don't map to `Port` can still live in `data`. If a richer port model is
needed later, `Port` can be extended or a separate mechanism introduced; the optional field causes
no breakage.

### Protocol

The constraint system is modelled closely on the **Language Server Protocol (LSP)**. The IDE is the
client; constraint plugins are servers. The IDE has no domain knowledge — it only knows how to route
events and display responses.

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

Diagnostics carry a severity (error, warning, info), a location (node id, edge id, port node id, or
graph-level), a message, and a `suggestion` field (required for AI workflow compatibility — see
Code Interface). The UI renders them inline on the canvas and in the tree view.

### Constraint Evaluation Stages

| Stage            | Trigger                | Mechanism                                                   | Examples                                                                   |
| ---------------- | ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Live**         | Every graph change     | Active constraint plugins (subscribed to `graph/didChange`) | Required fields, port type mismatches                                      |
| **Server-side**  | On demand / on save    | Constraint plugin protocol                                  | Cross-node invariants, impl interface compatibility, remote ref validation |
| **Compile-time** | On targeting a runtime | Plugin compile hook                                         | K8s resource limits, audio buffer sizes, mock coverage                     |

All three stages use the same constraint plugin protocol (see Protocol). The "live" stage simply has lower
latency requirements and tighter plugin subscription granularity.

### Constraint Authoring

A constraint plugin can evaluate constraints using any mechanism. Common implementation strategies:

| Strategy        | When to use                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| JSON Schema     | Property shape validation — required fields, value ranges, enum membership   |
| Type algebra    | Port interface compatibility — structural subtyping, schema-set intersection |
| Graph traversal | Topology checks — cycle detection, connectivity, reachability                |
| Remote API      | External specification validation — OpenAPI, gRPC IDL, custom registries     |
| Rule engine     | Complex cross-entity invariants — multi-node constraints, ordering rules     |
| Custom logic    | Anything else                                                                |

These are **internal implementation details of a plugin**. The IDE never sees them. All that crosses
the protocol boundary is the named constraint, the entities it applies to, and the resulting
diagnostics.

Constraint plugins can be packaged and deployed as:

- **Bundled** — shipped as part of a schema package; activated when the schema is applied
- **External** — a running process connected over stdio or HTTP
- **Inline** — a small script in the graph's properties for project-local rules
- **Remote** — a network-accessible server; enables shared, organisation-wide constraint evaluation

---

## UI Architecture

### Tree View (Left Panel)

The left panel shows the full rose-tree of the system as a collapsible tree. Each entry is a node;
composite nodes are expandable. Selecting a node in the tree:

- Navigates the canvas to that node's parent subgraph, with the node highlighted
- Double-clicking enters the node's subgraph on the canvas

Collapsing a node in the tree view collapses it on the canvas too — the two views are synchronised.
The tree view is the primary orientation tool for large systems where the canvas alone is
disorienting.

Presence indicators (collaborator avatars) appear on the tree view entries for subgraphs that other
users are currently viewing or editing.

### Canvas Model

The canvas is a **hybrid canvas** — spatially flexible but structurally aware. It understands:

- Nodes and their port nodes
- Edges as first-class routed connections between port nodes
- Subgraph containment (composite nodes can be entered)
- Active property schemas (affecting palette and editable fields)
- Diagnostic overlays (errors/warnings on the relevant node/edge/port)
- The current persona filter (affecting what is visible and at what detail)

The canvas shows the siblings within the currently focused subgraph. Port nodes appear on the
boundary of their parent composite node.

### Force Layout

Layout uses a **bottom-up force simulation**:

- Leaf nodes stabilise first within their parent subgraph
- Once leaves stabilise, the parent composite node's size is determined by its contents
- Parent-level forces then act only between siblings at that level
- This repeats up the tree

Crucially, **forces only act between siblings** — matching the communication model exactly. Nodes at
different levels of the tree do not exert forces on each other.

The user can lock node positions after stabilisation and resume force simulation at any time. Layout
mode (auto / locked / partial) is stored per subgraph.

#### Known issue: layout invalidation on structural changes

When nodes are added to or removed from a level, the layout for that level and all ancestor levels
should be re-run so that siblings respond to the new occupant. The current implementation
(`syncLayout` + `stepLayout` in canvas.tsx) handles this partially — it rebuilds all expanded levels
with `settled: false` when `treeNodes` changes — but in practice siblings do not visibly re-settle
after a node is added.

The underlying problem is that the layout state (`LayoutMap`) is managed imperatively inside a
component, interleaved with rendering, drag handling, and animation frame stepping. Invalidation
logic is spread across `syncLayout`, `stepLayout`, `invalidateAncestors`, and the RAF loop, making
it hard to reason about when and whether a given level will actually re-run.

**Planned refactor:** Extract layout state into a self-contained module (or reducer) with a clean,
explicit API:

```
invalidateLevel(levelId)          — mark a level as needing a re-run
invalidateAncestors(levelId)      — propagate invalidation up the tree
step()                            — advance all unsettled levels by one tick
```

Mutations (add node, remove node, drag) call `invalidateLevel` on the affected level and
`invalidateAncestors` above it. The RAF loop only calls `step`. This separation makes it
straightforward to add correct invalidation for any future structural operation without having to
trace through the combined sync/step logic.

### Persona Views

Different users need different views of the same graph. Personas are named, shareable filters that
control:

- **Depth limit** — how many levels of subgraph to expand automatically
- **Schema filter** — show only nodes/edges annotated with specific schemas
- **Property filter** — show/hide specific property fields in node panels
- **Implementation filter** — which implementation tag is active in this view
- **Focus scope** — restrict the view to a specific subgraph URI subtree

Example personas:

| Persona   | Depth     | Schema filter          | Use case                             |
| --------- | --------- | ---------------------- | ------------------------------------ |
| Architect | 2         | None                   | High-level system review             |
| Developer | Unlimited | `spike.dataflow.typed` | Working on a specific module         |
| Ops       | 3         | `io.k8s`               | Reviewing deployment topology        |
| Reviewer  | 1         | None                   | PR review — top-level structure only |

Personas are stored in the graph (shared) or user preferences (personal) with different scopes. A
URI can be shared with a persona: `spike://acme/backend/auth-service?persona=ops`.

### Text View

The canvas and tree view are complemented by a **text view** — a code editor pane showing the
currently focused subgraph as Spike-Lisp (see Language Representations). Edits in the text view write to the same CRDT
graph store as canvas edits; both views update in real time.

The text view is backed by the same constraint plugin host that drives canvas validation — there is
no separate validation path. The LSP server _is_ the constraint plugin host: completions,
diagnostics, and hover information in the text editor come from the same plugin pipeline that
annotates nodes and edges on the canvas. This ensures the two views are genuinely isomorphic: any
graph state reachable by canvas editing is reachable by text editing, and vice versa.

The lossless round-trip guarantee of Spike-Lisp (see Language Representations) is therefore a **first-class architectural
requirement**, not an optimisation. Without it, the text and canvas views can diverge, and the
isomorphism breaks.

### Subgraph Navigation

- **Enter** — double-click a composite node to enter its subgraph; canvas transitions in,
  breadcrumbs update
- **Exit** — breadcrumb or keyboard shortcut to go up one level
- **Jump** — click any node in the tree view to jump directly to it
- **Share** — copy the URI of the currently focused subgraph, optionally with active persona
  appended

### Graph Authoring Interactions

The canvas supports three interaction modes, selectable from the toolbar:

- **Select** — default; click to select nodes/edges, drag to pan, drag node to reposition
- **Add Nodes** — click to create nodes; the target of the click determines placement:
  - Empty canvas → new root-level leaf node at click position
  - Background of an expanded subgraph → new child of that subgraph at click position
  - A collapsed composite node → expand it one level and add new child inside it
  - A leaf node → coerce it to a composite, expand it, add new child inside it
- **Add Edges** — click source node, click target node to wire them; Escape cancels

All newly created nodes are blank (no label, no data). The inspector opens immediately so the user
can name and configure the node without switching modes.

#### Leaf-to-subgraph promotion

Clicking a leaf node in Add Nodes mode promotes it to a composite (subgraph) node and adds a child.
This is intentional: any leaf can become a subgraph at any time, because the rose-tree structure has
no leaf-only constraint. Schema enforcement (if active) will validate the resulting structure
non-blockingly. Mistakes are cheap to undo.

#### Future authoring ideas

- **Node palette / templates** — a side-drawer of pre-configured node types (defined by active
  schemas) that can be dragged onto the canvas or clicked to place at center
- **Edge type inference** — when wiring two nodes that declare typed ports, automatically populate
  `data.type` on the new edge from the source node's declared outputs
- **Duplicate node** — copy a node and all its data onto the canvas as a sibling
- **Bulk operations** — marquee-select multiple nodes; move, delete, or group them
- **Undo/redo** — a linear history of workspace state snapshots; Cmd+Z / Cmd+Shift+Z
- **Delete** — Backspace/Delete key removes the selected node or edge (with confirmation if the node
  has children or connected edges)
- **Drag-to-group** — drag one node onto another to make it a child; drag out to promote to sibling

### Deployment

Deployed via Deno Deploy's native GitHub integration — pushes to `main` trigger automatic
deployment. No GitHub Action or `deployctl` CLI needed.

**Production URL:** `https://marlinspike.sordina.deno.net`

#### How it works

1. Deno Deploy watches the `main` branch and deploys on push
2. Build command runs automatically: `deno run --allow-read --allow-write --allow-net --allow-env build.ts`
3. Entrypoint is `mod.tsx` (configured in `deno.json` under `deploy`)
4. `mod.tsx` reads pre-built bundles from `dist/client.js` and `dist/stories.js` at startup
5. In dev mode (`--dev` flag), bundles are generated on-demand via `@deno/emit` instead

`dist/` is gitignored — Deno Deploy builds it automatically on each deployment.

### Collaboration

Collaboration is real-time, CRDT-backed, per-subgraph-URI. Multiple users edit simultaneously.
Presence (who is in which subgraph) is shown in both the tree view and the canvas. Merge diagnostics
from concurrent edits appear inline as constraint diagnostics — non-blocking.

---

## Alternative Implementations in Practice

**In the canvas**, a composite node with multiple implementations shows a small indicator. Clicking
it opens an implementation switcher showing available implementations and their tags.

**In the tree view**, the active implementation for each node is shown as a badge.

**At compile time**, the target runtime receives a fully resolved graph where all composite nodes
have had their URIs substituted with the selected implementation's URI. The structural graph (node
identities, port connections) remains unchanged.

**For testing**, selecting the `mock` implementation globally replaces all external dependencies
with mock subgraphs while leaving the internal structure intact. This is the primary testing story —
not a separate test configuration, but an implementation selection on the same graph.

---

## View Modes and Topology Constraints

### Two Orthogonal Axes

View mode and topology constraints are **fully decoupled**:

- **View mode** — how a subgraph is rendered. A persona-level setting. Independent of what topology
  constraints are active.
- **Topology schemas** — what structural and operational properties a subgraph is declared to
  satisfy. Validated by constraint plugins. Multiple schemas may be active simultaneously on the
  same subgraph.

This means an actor subgraph can be viewed in pipeline mode (useful for tracing message flow) even
though its topology schema permits cycles and dynamic dispatch. The view is a lens; the schema is a
contract.

### Call Graph vs. Pipeline — One Representation, Two Views

The underlying data model is always the same: a directed graph of identity-bearing nodes with typed
port nodes. Both major paradigms map onto this without structural distinction:

- **Call graph style** — nodes are prominent, named, addressable. Edges are wires between named
  ports. Node identity is primary.
- **Pipeline style** — flow is primary. Nodes are transformations between stages. Source nodes have
  only outputs; sink nodes have only inputs. A pure source is just a call-graph node with no input
  ports; a pure sink has no output ports.

**Pipeline mode is a view over the same identity-preserving node graph**, not a separate
representation. Switching between views is lossless. The one restriction that makes this true:
pipeline-mode edits must always produce valid call-graph nodes:

- Inserting a transformation inline on an edge creates a new node with a generated identity
- Fusing two adjacent nodes is **not** permitted in pipeline mode — it destroys call-graph identity.
  The equivalent is explicitly collapsing them into a named composite subgraph (the existing
  subgraph mechanism)

### Topology Schemas

Topology schemas are optional, composable declarations of structural and operational intent. They
are not mutually exclusive — a subgraph may carry multiple topology schemas simultaneously. Where
schemas are compatible, this is straightforward. Where they are in tension or outright incompatible,
the constraint system surfaces **informative diagnostics** explaining the conflict. Resolution is
always the author's decision — the system informs, it does not block.

#### `spike.topology.pipeline`

The strictest dataflow topology. Enforces that the subgraph can be expressed as a linear composition
of transformations.

- **Permits:** directed acyclic graphs, typed port contracts (input type → output type)
- **Forbids:** cycles, dynamic dispatch, nodes with no clear directional sense
- **Port semantics:** each node's output type is the next node's input type — matched statically
- **Edit restrictions in pipeline view:** no fusing; inline insertion always creates a named node
- **Analogues:** Unix pipes, Haskell `Category`/basic `Arrow`, Elixir `Stream`, Spark pipelines

#### `spike.topology.arrow`

A richer dataflow topology inspired by Haskell's `Arrow` hierarchy — `Arrow`, `ArrowChoice`,
`ArrowLoop`, `ArrowApply`. Strictly more expressive than `spike.topology.pipeline`.

- **Permits:** everything `pipeline` permits, plus:
  - **Choice** (`ArrowChoice`) — conditional branching on the type of input; a node may route to one
    of several outputs depending on the value. Edges carry `Left`/`Right` (or tagged union) type
    annotations.
  - **Looping** (`ArrowLoop`) — feedback edges carrying a "loop wire" — an internal state that feeds
    back into the same node. Represented as a special `loop` edge type, visually distinct (curved
    back-arrow). Does not violate acyclicity in the dataflow sense because the loop wire carries
    state, not a new activation.
  - **First/second** — parallel composition of arrows, where one branch passes through unchanged.
    Represented as parallel edge lanes.
- **Forbids:** fully dynamic dispatch (targets must be statically known at the edge level, even if
  the value routed is dynamic)
- **Port semantics:** ports may carry tagged union types; loop ports carry state type annotations
- **Edit restrictions in pipeline view:** same as `pipeline`, plus loop edges rendered as
  back-arrows and choice edges rendered as branching lanes
- **Analogues:** Haskell `Arrow`/`ArrowChoice`/`ArrowLoop`, FRP signal graphs, certain reactive
  stream libraries

#### `spike.topology.actor`

Message-passing topology. Structurally and operationally distinct from dataflow topologies — shares
visual metaphor but not semantics.

- **Permits:** cycles (an actor may send to itself or upstream), dynamic dispatch (a `dynamic` edge
  type whose target is a named dispatch group resolved at runtime), fan-out and fan-in,
  fire-and-forget message patterns
- **Forbids:** synchronous return edges (which would imply a response obligation incompatible with
  fire-and-forget)
- **Port semantics:** ports carry message schema types. No matched input→output contract per node.
  An actor receives messages and may emit zero or more messages to any reachable target.
- **Dynamic edges:** rendered as dashed arrows to a named dispatch group node rather than a concrete
  target node. The dispatch group declares the set of possible runtime targets.
- **Edit restrictions in pipeline view:** no fusing; inline insertion valid; cycles permitted
  (rendered as back-arrows in pipeline view)
- **Analogues:** Erlang/OTP, Akka (classic), Orleans, actor model generally

#### Compatibility Between Topology Schemas

Schemas form a loose hierarchy of expressiveness, but this does not mean they are mutually
exclusive. A subgraph may satisfy multiple schemas simultaneously — for example, a subgraph that is
both `pipeline`-valid and `arrow`-valid (since `pipeline` is a subset of `arrow`). The constraint
system validates each active schema independently and reports:

- **Compatible** — all active schemas are satisfied, no conflicts
- **Redundant** — one schema is a strict subset of another that is also active (informational, not
  an error)
- **Tensioned** — schemas are both satisfiable in principle but the current graph satisfies one and
  not another (diagnostic with explanation)
- **Incompatible** — schemas have mutually exclusive requirements (e.g. `pipeline` forbids cycles;
  `actor` permits them — if a cycle is present, `pipeline` is violated). Surfaced as a clear
  diagnostic: _"This subgraph satisfies `spike.topology.actor` but not `spike.topology.pipeline`
  because it contains a cycle at node X."_

The author decides how to respond — remove the unsatisfied schema, restructure the graph, or leave
both active with the diagnostic as a known tension.

```jsonc
// Example: a subgraph declared to satisfy both arrow and actor schemas
// The constraint system will validate both and report any tensions
{
  "uri": "spike://acme/backend/event-processor",
  "activeSchemas": [
    "spike.topology.arrow", // author intends ArrowChoice routing
    "spike.topology.actor" // author intends fire-and-forget messaging
  ]
  // If the graph contains dynamic dispatch edges, spike.topology.arrow
  // will emit a diagnostic: "dynamic edges are not permitted in arrow topology"
  // The author can then decide: remove spike.topology.arrow, or restructure
}
```

### View Mode in Personas

View mode is a persona-level setting. A developer might view an actor subgraph in pipeline mode to
trace message flow; an architect might prefer force mode to see the full topology. Any view mode can
be applied to any subgraph regardless of its topology schemas — the view is always a lens, never a
constraint.

```jsonc
{
  "persona": "developer",
  "viewMode": "pipeline", // "force" | "call-graph" | "pipeline"
  "depthLimit": null,
  "schemaFilter": ["spike.topology.actor"]
}
```

### Layout per View Mode

| View mode    | Layout algorithm                    | Edge style                                                                          | Node emphasis             |
| ------------ | ----------------------------------- | ----------------------------------------------------------------------------------- | ------------------------- |
| `force`      | Bottom-up d3-force (sibling-scoped) | Thin routed wires                                                                   | Equal                     |
| `call-graph` | Force or manual                     | Labelled port connectors                                                            | High — nodes prominent    |
| `pipeline`   | Sugiyama / layered, left-to-right   | Thick directional arrows; back-arrows for loops/cycles; dashed for dynamic dispatch | Low — flow prominent      |
| `text`       | N/A — Spike-Lisp code editor        | N/A                                                                                 | N/A — text representation |

The `text` view mode renders the subgraph as editable Spike-Lisp rather than a canvas. It is a full
peer of the visual modes: the same constraint plugin host provides LSP-style completions and
diagnostics, and edits write directly to the CRDT store. See Text View and Code Interface for
details.

In pipeline view, edge types introduced by topology schemas are rendered distinctly:

| Edge type              | Rendering                                       |
| ---------------------- | ----------------------------------------------- |
| Standard dataflow      | Solid thick arrow                               |
| `ArrowChoice` branch   | Forking lanes with `L`/`R` labels or tag labels |
| `ArrowLoop` feedback   | Curved solid back-arrow                         |
| Actor dynamic dispatch | Dashed arrow to dispatch group node             |
| Actor cycle            | Curved dashed back-arrow                        |

---

## Frontend Authoring

### Concept

A graph's top-level port nodes define its external interface — inputs it accepts and outputs it
produces. This interface is already schema-typed. A frontend is therefore just a **rendering of that
interface** — auto-generated from the port schemas, with no additional authoring required for basic
cases.

This means the same system used to design a distributed backend can also produce its UI. The graph
is a full-stack artifact.

### Form Generation

For simple cases, tools like **react-jsonschema-form** (rjsf) can generate a working frontend
directly from the JSON Schema of the top-level input port nodes. This is the zero-effort path —
useful for prototyping, internal tooling, admin interfaces, and data entry workflows.

```
Graph top-level ports
    │
    ├── input ports  → JSON Schema → rjsf form fields
    └── output ports → JSON Schema → result display components
```

The generated form submits to the graph's runtime target (e.g. an HTTP port node), and renders
responses from output port schemas. No frontend code needs to be written.

### Frontend as a Graph Layer

For richer UIs, the frontend itself can be authored as a graph layer — a subgraph whose nodes are UI
components (input, display, layout) and whose edges are data bindings. This subgraph is connected to
the top-level port nodes of the backend graph.

This is the same model as the rest of the system: the frontend subgraph is just another composite
node, with its own port nodes, alternative implementations (e.g. a `web` impl and a `mobile` impl),
and schema constraints (e.g. a `ui.form` schema that validates component compatibility).

### Port Schema → UI Component Mapping

Port schemas declare not just data types but UI hints, allowing the form generator to produce
appropriate components:

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

These `ui:` hints follow the rjsf convention and are optional — the generator falls back to sensible
defaults for plain JSON Schema types.

### Frontend Runtime Target

A dedicated frontend runtime target consumes a graph with UI port schemas and emits a deployable
frontend artifact:

| Target                  | Output                                                    |
| ----------------------- | --------------------------------------------------------- |
| `spike.frontend.rjsf`   | React app with auto-generated rjsf forms (prototype)      |
| `spike.frontend.web`    | Full React component tree from UI subgraph                |
| `spike.frontend.mobile` | React Native from UI subgraph with `mobile` impl selected |

The `rjsf` target is the quick-start path. The `web` and `mobile` targets are for production
frontends authored as graph layers.

### Implications

- **Prototyping becomes trivial** — define your port schemas, select the `rjsf` target, get a
  working UI immediately
- **Schema-first design** — the port interface is designed once and drives both validation and UI
  generation
- **Consistency guaranteed** — the frontend and backend share the same schema definitions; they
  cannot drift
- **Personas apply** — a `developer` persona might expose raw JSON input; an `end-user` persona
  might show a polished form; both derived from the same port schema

---

## Runtime Targets

A runtime target consumes a **validated, schema-annotated, implementation-resolved graph snapshot**
and produces an artifact or side effect.

| Target               | Schema         | Output                               |
| -------------------- | -------------- | ------------------------------------ |
| K8s                  | `io.k8s`       | Helm chart / manifests               |
| Audio DSP            | `audio.dsp`    | WASM audio worklet                   |
| Actor system         | `spike.actors` | Elixir supervision tree              |
| ETL                  | `spike.etl`    | Spark / dbt project                  |
| Simulation           | Any            | Discrete event simulation            |
| Test harness         | Any            | Test runner with mock impls selected |
| Mock server          | `io.http`      | Auto-generated mock API              |
| Frontend (prototype) | `spike.ui`     | React + rjsf form from port schemas  |
| Frontend (web)       | `spike.ui`     | Full React component tree            |
| Frontend (mobile)    | `spike.ui`     | React Native app                     |

---

## Implementation Roadmap

### Phase 1 — Core (MVP)

- [x] Base graph JSON schema (nodes, edges, port nodes, open properties, URIs)
- [x] Graph store per subgraph URI (SurrealDB embedded WASM, not Automerge — see Persistence Layer)
- [x] Minimal canvas UI (place nodes, draw edges, enter/exit subgraphs)
- [x] Tree view panel (rose-tree navigation, sync with canvas)
- [x] Live validation of the _base format_ constraint (internally implemented with JSON Schema, but
      surfaced through the constraint interface — not as raw JSON Schema errors)
- [x] Save/load graph (browser persistence via SurrealDB + IndexedDB bridge — see Persistence Layer)

### Phase 2 — Ports and Structure

- [x] Port node schema and typed edge validation
- [ ] Sibling-only communication enforcement
- [x] Multiple port nodes per composite node
- [ ] Port interface compatibility checking

### Phase 3 — Extensibility (Schema Plugin Foundation)

This phase lays the groundwork for the modular type system described in Constraint System. The goal is a working
plugin protocol and a first real schema — not a full ecosystem.

- [x] Constraint plugin protocol (in-process registry with `ConstraintTypeDefinition.evaluate`,
      not stdio JSON-RPC — see `validate_workspace.ts`)
- [x] Schema activation: `activeSchemas` list on graph and per-entity, runtime-editable
- [ ] Monoid composition enforced: schemas are order-independent; adding/removing schemas is always
      valid (never crashes the IDE)
- [ ] First constraint plugin (typed dataflow topology schema)
- [x] Modal validation: speculative mode (live diagnostics, no blocking) implemented first
- [ ] Diagnostic overlay on canvas and tree view
- [ ] Palette populated from active schemas

### Phase 4 — Implementations

- [x] Alternative implementation system (data model: `Node.implementations`)
- [x] Global and local implementation selection (data model: `Graph.activeImplementation`)
- [ ] Implementation interface validation
- [ ] Test/mock implementation workflow
- [ ] Frontend prototype target (rjsf from top-level port schemas)

### Phase 5 — Layout and Personas

- [x] Bottom-up force layout (sibling-scoped forces; multiple algorithms: SDF, FIELD, JANK, TOPOGRID)
- [x] Persona definition and storage
- [ ] Persona filter application in canvas and tree view
- [ ] URI sharing with persona query parameter

### Phase 5b — Profiles and Storage

- [ ] Profile storage (IndexedDB `marlinspike_profiles` collection)
- [ ] Profile CRUD UI (account-style dropdown: add, edit, switch, delete)
- [ ] `indxdb://` URL scheme interpretation in connection manager
- [ ] Split `workspace.connections` into `workspace` + `storage-location` constraints
- [ ] Profile–workspace binding (workspace nodes scoped to active profile)
- [ ] Workspace-as-tabs unification (remove separate tab registry)
- [ ] Connection inheritance: profile → workspace → children via outside-in principle

### Phase 6 — Collaboration

- [ ] Real-time CRDT sync (local network first, then remote)
- [ ] Presence indicators in tree view and canvas
- [ ] Merge diagnostic surfacing

### Phase 7 — Runtimes

- [ ] Runtime target protocol
- [ ] First runtime target (simulation or code-gen)
- [ ] Compile-time constraint evaluation (enforced validation mode — see Modal Validation — first used here)
- [ ] Implementation resolution at compile time

### Phase 8 — Schema Ecosystem

This phase builds out the full modular type system vision from Constraint System. Phase 3 establishes the plugin
protocol; Phase 8 makes it networked, composable, and externally distributable.

- [ ] Enforced validation mode: checkpoint declarations, hard stops at save/compile/publish
- [ ] Entity-level schema application (node, edge, port, not just graph-level)
- [ ] Remote schema application: validate a referenced subgraph URI's interface from the current
      graph's perspective
- [ ] Schema package format: versioned, distributable, with dependency declarations
- [ ] Schema registry: discovery, resolution, version pinning
- [ ] Remote constraint plugin servers: shared org-wide validation services over the network
- [ ] Inline constraint scripts: project-local rules without a full plugin
- [ ] Cross-URI constraint checking: schemas that span subgraph boundaries
- [ ] Public subgraph URI registry

### Phase 9 — Code Interface

- [x] Spike-Lisp serialiser and parser (Spike-Clojure variant — round-trip with graph format)
- [ ] MCP server with core read/write/validate tools
- [ ] `suggestion` field required in all constraint plugin diagnostics
- [ ] `graph_patch` partial diff support
- [ ] Depth-limited `graph_read` for context window efficiency
- [ ] AI edit workflow integration test (agent edits graph, sees live canvas update)

---

## Technology Candidates

| Layer              | Candidate                        | Notes                                         |
| ------------------ | -------------------------------- | --------------------------------------------- |
| Graph store        | SurrealDB (WASM, `mem://`)       | Per-tab databases; IndexedDB bridge (see Persistence Layer) |
| UI                 | TypeScript + Hono JSX DOM        | Server: Hono; client: Hono JSX DOM (not React) |
| Canvas rendering   | Custom SVG                       | Full control; custom force layout algorithms  |
| Tree view          | Custom Hono JSX component        | Tight sync with canvas                        |
| Force layout       | Custom (SDF, FIELD, JANK, TOPOGRID) | Scoped per subgraph level; composable      |
| Constraint plugins | In-process TypeScript registry   | `ConstraintTypeDefinition.evaluate` functions |
| Base schema        | JSON Schema Draft 2020-12        | Widest tooling support                        |
| Serialisation      | JSON (base) + SurrealQL (persistence) | SurrealQL dumps for IndexedDB bridge    |
| URI resolution     | Custom resolver                  | Local file, remote HTTP, version registry     |
| Code interface     | MCP server + Spike-Clojure       | Parser/serialiser done; MCP server planned (see Code Interface) |

---

## Code Interface

### Design Goals

The graph should be easily readable, writable, and navigable by an AI agent without requiring access
to the visual canvas. Three properties make this achievable:

- The graph structure maps directly to S-expressions — the rose-tree _is_ a nested list
- The URI addressing scheme gives the AI stable references to any subgraph, node, or port
- The constraint system already produces structured, informative diagnostics — these serve as the
  AI's error feedback loop, closing the edit→validate→fix cycle without human intervention

The interface has two components: a text format for reading and writing graphs, and an **MCP
server** that exposes graph operations as tools an AI agent can call.

### Language Representations

#### Concept

A **language representation** is a text format that is simultaneously valid in a host programming
language and encodes graph semantics. The two readings coexist without conflict:

- A reader who ignores graph semantics sees ordinary code — typed function definitions, data
  structures, and composition.
- A reader who cares sees the graph layered on top — nodes, edges, ports, and containment emerge
  from the code structure without any extra annotation.

This isomorphism is a design goal, not an implementation detail. It means:

- The graph notation is learnable by anyone who knows the host language.
- AI agents can read and write graphs using familiar programming patterns.
- The constraint system validates both the code semantics and the graph semantics in one pass.
- The text view (see Text View) is a full peer of the canvas — editing code and editing the graph are the
  same operation.

#### Two layers

Every language representation is built on two layers:

1. **Base reader** — a general-purpose S-expression reader (`src/graph/base_lisp.ts`), EDN-inspired.
   Produces a typed AST with no graph semantics. Shared across all language variants.

2. **Semantic layer** — maps host-language forms to graph concepts. Each variant defines its own
   mapping; no new syntax is introduced at this layer.

#### Language variants

The Spike notation is not tied to a single language. Each variant is a true subset of its host
language:

| Variant           | Host language | Status                                                           |
| ----------------- | ------------- | ---------------------------------------------------------------- |
| **Spike-Clojure** | Clojure / EDN | Active — see [`docs/spike-clojure.md`](../docs/spike-clojure.md) |
| Spike-TypeScript  | TypeScript    | Planned                                                          |
| Spike-Scheme      | Scheme        | Planned                                                          |

Spike-Clojure is the first variant and the current implementation target. It is not the canonical
form — future variants follow the same isomorphism principle in their respective host languages.

#### Graph concepts in language form

Regardless of variant, the mapping follows a common pattern:

| Graph concept              | Language form                                       |
| -------------------------- | --------------------------------------------------- |
| Structural container       | Named value / variable binding                      |
| Callable node              | Function definition with typed arguments and return |
| Call graph topology        | `let` bindings referencing each other               |
| Input ports                | Function arguments (with type annotations)          |
| Single output port         | Return type annotation                              |
| Multiple output ports      | Named fields in return map / record                 |
| Port selection             | Destructuring of the return value                   |
| Inline subgraph            | Function body                                       |
| Opaque / external subgraph | URI reference in place of body                      |

### MCP Server Interface

The MCP server exposes the graph as a set of AI-callable tools. It follows the Model Context
Protocol conventions — tools have typed inputs and return structured results including diagnostics.

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

Diagnostics include a `suggestion` field — a plain-language repair hint the AI can act on directly
in a subsequent `graph_patch` call. This closes the edit→validate→fix loop without human
intervention.

### AI Edit Workflow

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

The AI never needs to understand the visual canvas — it works entirely in Spike-Lisp and
diagnostics. The human sees the result live on the canvas as the AI edits, since the CRDT store is
shared.

### Context Window Efficiency

Spike-Lisp is designed to be token-efficient for LLMs:

- **Selective reading** — `node_read` and `graph_read` with depth limits mean the AI can fetch only
  what it needs rather than the entire graph
- **Subgraph URIs as handles** — composite nodes in Spike-Lisp output show `:subgraph "uri"` rather
  than inlining contents, keeping representations shallow until the AI explicitly descends
- **Patch operations** — `graph_patch` accepts a partial Spike-Lisp diff (only the changed
  nodes/edges) rather than requiring a full graph rewrite, minimising token cost for small edits
- **Diagnostic locality** — errors reference specific node/edge IDs, so the AI can fetch just the
  relevant subgraph for repair context

### File-Based Workflows

The Code Interface described above assumes an in-browser text view or an MCP-connected AI agent.
But Spike-Clojure source files on disk — such as those in [`examples/`](examples/) — are a natural
authoring surface too. Three approaches to synchronising files with a live graph, in increasing
order of ambition:

**A. CLI → MCP (import/push)**

A command-line tool reads `.clj` files, parses them via `spikeToGraph`, and pushes the resulting
graph to a running Marlinspike instance via MCP tools (`graph_write`). This is a one-shot import —
file to graph. The codec and MCP tool definitions already exist; this is a thin CLI wrapper.

```
marlinspike push examples/solar-calculator/
```

**B. File watcher ↔ graph sync (bidirectional)**

A local Marlinspike instance watches a directory. File edits parse and update the graph; graph edits
emit and update the files. This is the text view (see Text View) backed by the filesystem instead of an
in-browser editor. Harder than A — needs conflict resolution, file-to-subgraph mapping conventions
(one file per namespace? per subgraph?), and a decision about which side wins on concurrent edits.

**C. Headless instance as sync node**

A headless `marlinspike serve` process holds graph state and syncs with other instances (browser
UIs, CLI tools, or remote peers). Files are one peer among many. This is the collaboration story
(see Collaboration) with the filesystem as a participant. The CLI reads/writes files; the serve process mediates
between file state, local graph, and remote connections.

These are not mutually exclusive — A is a stepping stone to B, and B is a subset of C. The choice
of starting point depends on which workflow is most immediately useful: one-shot import for
bootstrapping graphs from existing code, bidirectional sync for a "files as source of truth"
workflow, or headless serve for multi-peer collaboration.

### Implications for the Constraint System

The MCP interface makes the constraint system's quality directly observable. A vague diagnostic like
_"invalid graph"_ is useless to an AI agent; it has no recourse. The `suggestion` field in
diagnostics is therefore not optional polish — it is a **first-class requirement** for every
constraint plugin that wants to be usable in the AI workflow.

This is a useful design forcing function: if a constraint plugin cannot explain its violations in
terms of concrete repair suggestions, it is incomplete. The Code Interface raises the bar for
constraint plugin quality across the whole system.

---

## Persistence Layer

### Current Implementation

Graph and UI state are stored in **SurrealDB embedded (WASM)** running in-browser with the `mem://`
engine. Persistence across page reloads is achieved via a custom bridge that exports SurrealDB
databases as SurrealQL dumps and stores them in IndexedDB.

```
WorkspaceState ←→ SurrealDB (mem://) ←→ export/import ←→ IndexedDB
                   in-memory WASM            SurrealQL        browser storage
                   (query engine)            dump strings     (marlinspike_snapshots)
```

#### Database layout

- **`_ui` database** — global UI state: tabs, personas, workflows, connected graphs, and a
  `db_registry` table listing all known graph databases.
- **Per-graph databases** — one SurrealDB database per tab/project, identified by UUID. Contains
  `tree_node`, `edge`, `constraint`, `constraint_application`, and `canvas_state` tables.

#### Sync strategy

A diff-based sync layer ([`src/ui/db/sync.ts`](src/ui/db/sync.ts)) compares the previous and current
`WorkspaceState` by reference equality on each field group (graph data, canvas state, UI state).
Only changed groups are written to SurrealDB. After writing, the affected databases are exported and
saved to IndexedDB via the bridge.

Sync uses a **leading-edge + trailing-edge debounce**: the first change after 2 seconds of
inactivity fires immediately; subsequent rapid changes are debounced at 500ms. A `beforeunload`
handler attempts a final flush on page close.

#### IndexedDB bridge

The bridge ([`src/ui/db/bridge.ts`](src/ui/db/bridge.ts)) is a thin wrapper around a single
IndexedDB object store (`marlinspike_snapshots` → `dumps`). Keys are `db:{uuid}` for graph databases
and `ui` for the UI database. Values are SurrealQL dump strings produced by `db.export()`.

On startup, [`loadStateAsync()`](src/ui/workspace.ts) restores the `_ui` dump first, reads the
`db_registry` to find the active tab's database, then restores that database's dump before querying
for graph data.

### SurrealDB RecordId Normalisation

SurrealDB's WASM SDK returns record identifiers as `RecordId` objects rather than plain strings, and
the `NONE` value (used for root nodes with no parent) deserialises as `undefined` rather than
`null`. All load functions in [`src/ui/db/operations.ts`](src/ui/db/operations.ts) normalise these
values back to plain strings via `normaliseRecordId()`.

This is critical for `buildTree()`, which reconstructs the rose-tree hierarchy from flat nodes —
without normalisation, root nodes (where `parent` is `NONE`/`undefined`) are never found and the
tree is empty.

### Why Not `indxdb://` (SurrealDB's Native IndexedDB Engine)

SurrealDB advertises an `indxdb://` engine for browser-native persistence. This would eliminate the
need for the export/import bridge. However, **it is broken as of surrealdb@2.0.3 /
@surrealdb/wasm@3.0.3** (the latest versions available at time of writing).

The failure mode: `connect("indxdb://marlinspike")` succeeds, but the first `use()` call triggers an
IndexedDB `TransactionInactiveError`. The root cause is a WASM↔JavaScript async boundary issue —
IndexedDB transactions auto-commit when the microtask queue empties, and SurrealDB's internal
changefeed cleanup task races with the first database operation.

This was confirmed in isolation via a standalone Vite test harness
([`spikes/surrealdb-indxdb/`](spikes/surrealdb-indxdb/)) that reproduces the failure outside our
stack. The issue is tracked upstream:
[surrealdb/surrealdb#5712](https://github.com/surrealdb/surrealdb/issues/5712).

**Decision:** Use `mem://` with the IndexedDB bridge until the upstream bug is fixed. The bridge
adds ~20 lines of code and works reliably. When `indxdb://` is fixed, the bridge can be removed and
`connect()` changed to `indxdb://` — the rest of the code (schema, operations, sync) is
engine-agnostic.

### Connection Pool and Bootstrap Layering

The connection manager ([`src/ui/db/surreal.ts`](src/ui/db/surreal.ts)) maintains a local embedded
connection and a pool of remote connections. All database acquisition goes through a single
function:

```typescript
getDb(); // → local embedded instance (mem:// via WASM)
getDb(connectionId); // → remote instance from pool
```

**Bootstrap layering** resolves the apparent circular dependency between "connection details live on
workspace root nodes" and "you need a connection to read workspace root nodes":

- **Root nodes are always local.** Every workspace root node lives in the local embedded database,
  which is always available without any external connection. The root node holds the workspace's
  identity, constraint applications, and connection config (via the `workspace.connections`
  constraint on `entity.data`).
- **Only children are remote.** The workspace's graph content (children, edges, etc.) may live in a
  remote SurrealDB instance. The root node is the local pointer to that remote data.
- **Empty URL = purely local.** A workspace whose connection config has no URL stores everything in
  the local database. Non-empty URL triggers `connectRemote()` to establish a remote connection,
  then children are synced from/to that remote.

```
┌─────────────────────────────────────┐
│  Local DB (mem:// via WASM)         │
│                                     │
│  Root "My Project"                  │
│    data.url: "wss://db.example.com" │──connect──▶  Remote SurrealDB
│                                     │              (children synced)
│  Root "Local Workspace"             │
│    data.url: ""                     │  (children also in local db)
└─────────────────────────────────────┘
```

Startup flow:

1. App starts → local mem:// db always available
2. Load workspace root nodes from local db
3. Read connection config from each root's constraint data
4. `connectRemote(id, config)` for non-empty URLs
5. Sync children from remote into local tree under the root

### Outside-In Connection Principle

The bootstrap layering above implements a general principle worth stating explicitly:

> **A parent node declares the connection context for its children without being subject to that
> connection itself.** The parent is a boundary node — it carries configuration but lives outside
> the connection it describes.

This is the "outside-in" pattern: configuration flows inward (from parent to children) but the
parent remains outside the boundary it creates. The workspace root node lives in the local
database and carries `data.connection` describing where its children live. The root is never
remote; only its children are.

The principle generalises beyond the root level. Any composite node that carries a
`storage-location` constraint acts as a boundary: it is resolved in its parent's connection
context, while its children are resolved in the connection it declares.

```
Profile (indxdb://marlinspike)
  └── Workspace W1 (lives locally; no storage override → children also local)
  └── Workspace W2 (lives locally; storage-location: wss://db.example.com)
        └── Child nodes (live in remote SurrealDB, via outside-in)
              └── Sub-workspace S1 (storage-location: wss://other.example.com)
                    └── Grandchildren (live in other remote)
```

### Profiles

Profiles solve the bootstrapping problem: what connection context exists _before_ any graph is
loaded? Profiles are **not graph nodes** — they are session-level metadata stored in a separate
IndexedDB collection, outside the graph entirely.

#### Storage

A dedicated IndexedDB object store (`marlinspike_profiles`) holds profile entries:

```typescript
interface Profile {
  id: string           // UUID
  name: string         // Display name (e.g. "Local", "Work", "Staging")
  connection: {
    url: string        // SurrealDB connection URL
    namespace?: string
    database?: string
    username?: string
    password?: string
  }
}
```

#### URL scheme convention

All profiles have URLs. The scheme determines the storage backend:

| Scheme | Backend | Example |
|---|---|---|
| `indxdb://` | Local IndexedDB (via mem:// + bridge) | `indxdb://marlinspike` |
| `wss://` | Remote SurrealDB (WebSocket) | `wss://db.example.com` |
| `https://` | Remote SurrealDB (HTTP) | `https://db.example.com` |

Local profiles use `indxdb://` — the SurrealDB IndexedDB scheme. The connection manager interprets
this as "create a mem:// instance and wire up the IndexedDB bridge with this key as the
serialisation namespace". When the upstream SurrealDB `indxdb://` bug
([surrealdb/surrealdb#5712](https://github.com/surrealdb/surrealdb/issues/5712)) is fixed, these
URLs become literal connection strings with no code change.

#### Default profile

A built-in "Local" profile is always present and cannot be deleted:

```typescript
{ id: "local", name: "Local", connection: { url: "indxdb://marlinspike", namespace: "marlinspike" } }
```

This is what the app currently does implicitly — the default profile makes the existing behaviour
explicit and uniform with remote profiles.

#### Connection inheritance

The top-level nodes visible under a profile are workspace nodes. Connection context flows inward
via the outside-in principle:

1. **Profile** provides the base connection. Workspace nodes are stored in the profile's target.
2. **Workspace node** may override with a `storage-location` constraint. If it does, its children
   use that connection. Otherwise children inherit the profile's connection.
3. **Any deeper node** may override again — the pattern repeats at every level.

#### UX

Profiles surface as an account-style dropdown in the top bar — a familiar pattern (IDE workspace
switcher, cloud account selector) with low friction. The dropdown shows the active profile name;
clicking opens a list with options to switch, add, edit, or delete profiles.

Switching profiles triggers: disconnect current remote (if any), connect to new profile's target,
load workspace nodes from that target.

### Workspace Nodes as Tabs

Currently, `tabs[]` in the `_ui` database and workspace root nodes are maintained as separate
concepts that must be kept in sync. The design intent is to unify them:

- **Workspace nodes under the active profile ARE the tabs.** There is no separate tab registry.
- A workspace node's label becomes the tab name. Its database ID is derived from its node ID.
- Creating a new tab creates a new workspace node under the current profile.
- Closing a tab hides the workspace node from the session but does not delete it.

Open question: should focusing on root (null focusId) show all workspace nodes as a "workspace
browser" view? This would provide a natural place to see and manage all workspaces under a profile.

### Workspace and Storage-Location Constraints

The current `workspace.connections` constraint conflates two independent concerns. These should be
split:

| Constraint | Purpose | Data |
|---|---|---|
| `workspace` | Makes a node tab-eligible | `{}` (presence is sufficient) |
| `storage-location` | Specifies where children are stored | `{url, namespace?, database?, username?, password?}` |

**`workspace` constraint:** Any node carrying this constraint can appear as a tab in the session
UI. This is not limited to root-level nodes — a deeply nested composite node with the workspace
constraint could be opened as a focused tab, providing a scoped view into a subgraph.

Tab opening is manual by default: the user explicitly opens a workspace-constrained node as a tab.
An optional auto-open flag on the constraint could be added later if needed.

**`storage-location` constraint:** Specifies the connection context for a node's children (the
outside-in principle). This is the successor to the current `workspace.connections` constraint's
connection fields.

The two constraints are orthogonal:
- A workspace tab with no `storage-location` inherits its parent's connection.
- A node with `storage-location` but no `workspace` constraint acts as a storage boundary without
  being tab-eligible.

### Future Direction

The current persistence model is a single-user, single-browser solution. The path to collaboration:

1. **Remote SurrealDB** — the connection pool already supports remote WebSocket connections
   alongside the local embedded instance. Profiles provide the connection context; workspace nodes
   and the `storage-location` constraint wire it to `connectRemote()`.
2. **CRDT layer** — for real-time collaboration, the graph store would move to a CRDT
   (Automerge/Yjs) with SurrealDB as the persistence backend rather than the source of truth.
3. **Multi-database composition** — the tab/database mapping is already UUID-based. The
   `connectedGraphs` field on each tab is designed to support connecting multiple databases into a
   single workspace view, though this is not yet implemented.
4. **Cross-device sync** — profiles are the natural unit for cross-device synchronisation. A future
   account system syncs the profile list and its associated workspace nodes to the user's account.
   The profile-as-local-pointer pattern is unchanged; the account is just another sync
   destination.

---

## Open Questions

### Architecture

1. **Schema composition semantics** — Schema Composition declares schemas as a commutative monoid, but the exact
   mechanism for detecting _incompatibility_ (vs mere _tension_) is unresolved. Is incompatibility
   declared statically in schema metadata ("this schema excludes that one"), detected dynamically by
   the constraint plugin at validation time, or both? Static declaration is cheaper and enables the
   IDE to warn before a plugin is even loaded; dynamic detection is more expressive but adds
   latency.

2. **Port interface versioning** — if a subgraph's port interface changes, how are existing edges to
   that subgraph's URI invalidated or migrated? Semver-style breaking change detection?

3. **Implementation interface equivalence** — what does it mean for two subgraphs to have "the same
   interface"? Structural port match? Named port match? Schema-defined contract?

4. **Shared mutable subgraphs** — if a subgraph URI is referenced by multiple parent nodes, and one
   parent's collaborator edits it, what happens to all other parents? Push notification? Opt-in
   subscription?

5. **Constraint plugin lifecycle** — are plugins started on demand per graph, or long-running
   processes? How are crashes and slow validators handled?

6. **Persona storage scope** — are personas stored in the graph (shared with collaborators) or in
   user preferences (personal)? Probably both, with explicit scope declaration.

7. **Force layout with fixed positions** — how does the bottom-up force layout interact with
   manually positioned nodes? Partial lock? Per-subtree layout mode?

8. **Cross-URI constraint checking** — some constraints may need to span subgraph URIs (e.g.
   checking that two services use compatible port schemas). How does the constraint plugin host
   resolve external URIs for validation?

### Notions Not Yet Explored

- **Graph database / API** — a dedicated store and query API for graphs, beyond simple URI-addressed
  document retrieval. (Partially addressed by Persistence Layer — SurrealDB provides the store and query layer;
  the bridge provides browser persistence. Remote API and multi-user access are not yet
  implemented.)
- **Overlay and modification of referenced graphs** — applying patches or extensions to a referenced
  subgraph URI without forking it; composing compatible graphs by overlay.
- **Class / template system** — a mechanism for templating new nodes from a prototype, similar to
  class inheritance, enabling reuse patterns beyond URI reference.
- **Workflow notion** — alongside the existing persona notion, workflows could allow easily
  bootstrapping projects of a certain type (e.g. "K8s service", "audio DSP graph", "ETL pipeline")
  with pre-configured schemas and constraint plugins.
- **Embeddable explorer UI** — an iframe-embeddable, read-only (or limited-edit) canvas for use in
  documentation, demos, and interactive examples.
- **Spike-Clojure as documentation syntax** — the Clojure-subset notation is human-readable enough
  to use directly in documentation and vision sketches. See [`examples/`](examples/) for
  aspirational examples that illustrate how Marlinspike applies to different domains (CI/CD
  pipelines, scientific calculations, Clojure project isomorphism). These examples envision future
  capabilities and should be revisited periodically as implementation progresses.

---

_This document is intentionally incomplete. It is a design starting point, not a specification.
Decisions should be made incrementally as implementation reveals the real constraints._
