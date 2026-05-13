# Random Brainstorming Session

**Branch:** lyndon/randon-brainstorming-session
**Date:** 2026-05-11
**Branch Preview:** <!-- replace me -->

## Context

Marlinspike has reached a point where the prototype covers much of the original roadmap, but the codebase is intentionally janky — prototyping-first, formalize-later. Several big questions are surfacing about direction, architecture, and what would make this genuinely useful.

A key realization: **Marlinspike is not one idea with a single kernel. It's a synthesis of independent ideas that compose well.** Each idea has its own core invariant — its own reason it works — and could exist as a standalone system. The synthesis is the product, but the kernels are the intellectual substance.

This document identifies those kernels, articulates their core designs, and then explores how they relate to the practical questions of what to build next.

---

## The Kernels

### 1. Rose-Tree Graph Model

**Core invariant:** *Containment is recursive. Communication is sibling-scoped.*

Every node is either a leaf or contains children. Edges only connect siblings — never across containment boundaries. This single rule produces:
- Natural hierarchy (directories, namespaces, modules, subsystems)
- Encapsulation for free (a node's internals are hidden from its siblings)
- Fractal navigation (zoom into any composite and it's a complete graph)
- Composability (subgraphs can be referenced, reused, substituted)

**What makes it distinct:** Most graph systems use flat node lists with optional grouping. The rose-tree isn't decoration — it's structural. It determines what edges are legal, how layout works, how navigation works, and how code maps to structure.

**Standalone value:** A rose-tree graph library with typed nodes, containment rules, and traversal utilities. Useful for any system that models hierarchy + connections (module deps, org charts, nested state machines, circuit design).

---

### 2. Port Encapsulation

**Core invariant:** *Ports are the interface contract between containment levels.*

Port nodes sit at the boundary of a composite node. They're the only way data crosses containment boundaries — like function parameters and return values. This gives you:
- Type contracts at boundaries (input ports have types, output ports have types)
- Implementation hiding (the internal wiring is invisible from outside)
- Substitutability (swap implementations if port signatures match)
- Alternative implementations (production/mock/test) on the same port interface

**What makes it distinct:** Most graph systems treat ports as visual decoration (connection points on a box). Here, ports are semantic — they define what a node *promises* to its environment. The `direction` (in/out/inout) and type schema are structural, not cosmetic.

**Standalone value:** A typed port system for any graph that needs interface contracts. Useful for dataflow programming, hardware description, API design tools, or any system where "what goes in and what comes out" matters.

---

### 3. Code↔Graph Isomorphism

**Core invariant:** *Existing language constructs naturally encode graph semantics. The mapping is lossless and bidirectional.*

Spike-Clojure demonstrates that:
- `def` / `defn` → nodes (leaf or composite)
- `let` bindings → edges (data flows from binding to downstream use)
- Function parameters → input ports (with type hints via `^Type`)
- Return values / destructuring → output ports
- Scope resolution → references (a symbol that resolves to a prior definition is an edge)
- Nesting → containment (function body contains its internal nodes)

The round-trip is lossless: `parse(emit(graph))` stabilizes after one pass.

**What makes it distinct:** This isn't "generate code from a graph" (one-way, lossy). It's a genuine isomorphism — the text IS the graph, the graph IS the text. You can edit either representation and the other updates. The codec preserves identity, not just structure.

**Standalone value:** A bidirectional codec framework. Define the mapping rules for any language/format, get lossless graph↔text conversion. The pattern (not just the Clojure implementation) is the kernel. Could support DOT, Mermaid, D2, or domain-specific textual notations.

---

### 4. Constraint Algebra

**Core invariant:** *Validation is composable, modal, and advisory — not monolithic or blocking.*

Constraints are:
- **Composable:** Multiple schemas can be active simultaneously; they compose as commutative monoids (order doesn't matter, combining is associative)
- **Modal:** Sketch mode shows diagnostics as feedback; enforce mode blocks invalid operations
- **Pluggable:** Each constraint type is a registered evaluator function — add new ones without touching existing code
- **Scoped:** Constraints target specific entities (nodes, edges, the whole workspace) via applications
- **Staged:** Live (in-editor), server-side (on save), compile-time (on build) — different constraints fire at different times

**What makes it distinct:** Most validation systems are all-or-nothing (schema valid or not). The modal/staged approach means you can sketch freely and progressively tighten constraints as a design matures. The plugin protocol means domain experts add their own rules.

**Standalone value:** A constraint evaluation engine for any structured data. Takes a registry of constraint types, a set of active constraints + applications, and an entity graph — produces diagnostics. Useful for form validation, config linting, architecture fitness functions, or any system where "is this valid?" has multiple meanings depending on context.

---

### 5. Hierarchical Force Layout

**Core invariant:** *Layout respects containment. Leaves settle first, parents resize to fit, forces propagate up the tree.*

The bottom-up approach:
1. At each tree level, only siblings exert forces on each other
2. Leaf nodes settle first (they have fixed sizes)
3. Once children settle, the parent computes its dimensions from their positions
4. Parent-level forces then step, treating each composite as a single body
5. Repeat up the tree until the root settles

This produces layouts where:
- Groups visually contain their children (not just overlay them)
- Hierarchy is legible at every zoom level
- Different algorithms can be used at different levels (force at leaves, grid at top)

**What makes it distinct:** D3-force treats all nodes as points in a flat plane. ELK handles hierarchy but uses deterministic algorithms only. This kernel combines force-directed flexibility with hierarchical awareness.

**Standalone value:** A hierarchical layout engine with pluggable per-level algorithms. Input: nodes with sizes, edges, containment. Output: positions. No DOM, no animation, no rendering — pure geometry. The `LayoutAlgorithm` interface (initNodes, tick, settled) is already clean.

---

### 6. Database-as-Protocol

**Core invariant:** *The database IS the coordination protocol. Tools don't talk to each other — they talk to the same data.*

Instead of designing RPC protocols between tools, every tool (IDE, CLI, MCP server, LSP) connects to SurrealDB — embedded for local/offline use, remote for shared/real-time. The schema enforces structure, live queries provide reactivity, and the connection spectrum provides flexibility:

| Mode | Engine | Sync | Use case |
|------|--------|------|----------|
| **Embedded offline** | `mem://` or `file://` | None | CLI one-shot ops, CI pipelines |
| **Local daemon** | `ws://localhost:8000` | Real-time | IDE + CLI on same machine |
| **Remote shared** | `wss://host` | Real-time + auth | Multi-user, MCP server, cloud |

**What makes it distinct:** Most tool ecosystems define custom protocols (LSP, DAP, MCP). This approach eliminates protocol design entirely — the query language is the API. Schema changes are protocol changes. New tools are just new database clients.

**Standalone value:** A pattern more than a library. But the extracted operations layer (`operations.ts` — typed CRUD for graph entities over any SurrealDB connection) is a concrete, reusable artifact.

**Open question:** Auth. SurrealDB has namespace/database/scope auth, but the model for who-runs-what and who-sees-what isn't designed yet. Pragmatic start: local single-user, no auth.

---

### 7. Judgment System (Unified Core of Constraints, Types, Tags, and Hints)

**Core invariant:** *A judgment is a predicate attached to an entity with a declared consequence. Types, constraints, tags, and hints are all judgments — they differ only in what they predicate over and what happens when they hold.*

The current codebase has at least 11 separate mechanisms that classify, validate, or annotate entities:

| Mechanism | What it does | Currently lives |
|-----------|-------------|-----------------|
| Constraint evaluators | Validate entity state → diagnostics | `validate_workspace.ts` |
| EntityDataSchema | JSON Schema for entity `.data` fields | Constraint definitions |
| Port schemas | Type identifiers on ports (`^Type`) | `workspace.ts`, spike-clojure |
| Active schemas | Graph-level schema activation | `types.ts` |
| Implementation tags | Classify alternative subgraphs | `types.ts` |
| Reference type | Soft discriminator (`type: "ref"`) | `workspace.ts` |
| Persona filters | View-level visibility rules | `workspace.ts` |
| Constraint targets | Applicability declarations | `workspace.ts` |
| Node/edge `.data` | Untyped property bags | `workspace.ts` |
| Node/edge `.properties` | Graph-level extensibility | `types.ts` |
| Spike-Clojure hints | Syntax-level type annotations | `spike-clojure.ts` |

These look different on the surface, but they're all doing the same thing: **attaching predicates to entities and computing consequences.**

#### The unified model: Judgments

Borrowing from type theory, a **judgment** has the form:

```
Γ ⊢ entity : predicate → consequence
```

Where:
- **Γ (context)** is the full workspace state — all entities, all active schemas, all constraints. Predicates can depend on other entities (cross-entity validation, scope resolution, port compatibility).
- **entity** is any addressable thing — node, edge, port, graph, view, or even another judgment.
- **predicate** is a computable assertion. It can be:
  - **Structural:** "this node has ports matching interface X" — structural typing
  - **Value-dependent:** "this node's children count ≤ N" — dependent typing / refinement
  - **Relational:** "this edge connects compatible port types" — constraint checking
  - **Classificatory:** "this implementation is tagged 'production'" — tag matching
  - **Existential:** "this symbol resolves to a prior definition in scope" — reference resolution
  - **Topological:** "this subgraph has cyclomatic complexity ≤ 10" / "this subtree forms a DAG" / "fan-out from this node > 3" — predicates over graph shape, not individual entity properties
- **consequence** is what happens when the predicate holds or fails:
  - **Diagnostic** (error/warning/info) — validation
  - **Type assignment** — structural/nominal typing
  - **Visibility** — persona/view filtering
  - **Selection** — implementation activation
  - **Rendering** — visual hints (dashed borders, colors, icons)
  - **Schema propagation** — entity inherits additional predicates
  - **Algorithm selection** — topology determines which layout/solver strategy to use

#### Why this unification matters

**1. Composition becomes universal.** The current constraint algebra (commutative monoid) only applies to constraints. But if types, tags, and hints are all judgments, they all compose the same way. You can combine a structural type predicate with a validation constraint and a rendering hint into a single composite judgment.

**2. Modal enforcement applies everywhere.** Currently, sketch/enforce mode only applies to constraints. But the same modality makes sense for types ("sketch mode: type mismatches show warnings, don't block") and tags ("sketch mode: missing implementation tags show info, don't prevent activation").

**3. The plugin protocol generalizes.** Currently, constraint plugins register evaluator functions. If all judgments use the same protocol, you get pluggable types, pluggable tags, and pluggable hints — not just pluggable constraints.

**4. Context-dependence becomes first-class.** Reference resolution already depends on scope (Γ). Port compatibility depends on the graph structure. If all judgments explicitly take a context, dependent typing falls out naturally — "this value is valid given the values of its siblings" is just a judgment with a relational predicate.

**5. Topology judgments bridge validation and layout.** Cyclomatic complexity, fan-out, DAG-ness, connectivity, path length — these are all predicates over the *shape* of a subgraph. They can produce diagnostics ("complexity too high"), but they can also produce **algorithm selection** ("this subtree is a linear chain, use sequential layout" / "this subtree is a DAG, use hierarchical layout" / "this subtree has cycles, use force-directed"). Layout strategy becomes a *consequence* of graph analysis, not a manual choice. This is the missing link between the constraint system and the layout engine.

#### What this looks like concretely

A unified judgment registry:

```typescript
interface Judgment<T = unknown> {
  id: string;
  predicate: (entity: Entity, context: WorkspaceState) => T | null;
  // null = predicate doesn't hold; T = it holds, with evidence
}

interface Consequence<T = unknown> {
  kind: "diagnostic" | "type" | "visibility" | "selection" | "rendering";
  apply: (entity: Entity, evidence: T) => Effect;
}

interface JudgmentBinding {
  judgmentId: string;
  entityId: string;       // or "*" for universal
  consequenceId: string;
  mode: "sketch" | "enforce";
}
```

Then the existing mechanisms become:
- **Constraint:** Judgment with a diagnostic consequence
- **Port type:** Judgment with a type-assignment consequence (structural — based on port signatures)
- **Implementation tag:** Judgment with a selection consequence (classificatory — based on tag membership)
- **Persona filter:** Judgment with a visibility consequence (based on schema membership + depth)
- **Ref type:** Judgment with a rendering consequence (existential — based on scope resolution)
- **Active schema:** A set of judgment bindings activated together (the monoid)

#### JSON Schema as a predicate language

JSON Schema is already doing compositional predicate logic — `allOf` (intersection), `anyOf` (union), `oneOf` (discriminated union), `not` (negation). It doesn't compete with judgments; it's a **predicate language** within the judgment system.

Currently, JSON Schema appears in two roles:
1. **ConstraintDataSchema** — validates the constraint's own configuration (edited in constraint inspector)
2. **EntityDataSchema** — validates entity `.data` fields AND drives UI form generation (edited in entity inspector)

That second role is already two consequences from one predicate — validation AND form generation — it's just implicit. The judgment system makes this explicit:

```
Judgment {
  predicate:    JSON Schema (structural/value validation)
  consequences: [
    diagnostic     → "field X is required"
    form generation → render UI controls from schema
    type assignment → entity conforms to schema
    propagation    → activate further judgments on conforming entities
  ]
  mode: sketch | enforce
}
```

**What the judgment wrapper adds to JSON Schema:**

| Capability | JSON Schema alone | + Judgment system |
|---|---|---|
| Validate data shape | Yes | Yes |
| Generate UI forms | Yes (rjsf) | Yes — form generation is a consequence type |
| Modal enforcement | No — pass/fail only | Sketch: warnings. Enforce: block. |
| Cross-entity predicates | No — validates one value in isolation | "This port's type must match the connected port's type" |
| Multiple consequences | No — only valid/invalid | Same schema drives validation + forms + type assignment |
| Compose with non-schema judgments | No | JSON Schema predicates compose with topology/relational judgments |
| Context-dependent schemas | Limited (`$ref` is structural) | "maxItems equals the parent node's fanOut property" — dependent typing |

**What's preserved:**
- Reusable schemas from the JSON Schema ecosystem — import as-is
- Form derivation via rjsf or equivalent — the inspector continues to work
- Data validation via ajv or similar — no change to the validation path
- Well-understood syntax — JSON Schema remains the default way to express structural predicates

**What's gained:**
- A JSON Schema predicate can produce multiple consequences (validate + render form + assign type) from a single declaration
- The same schema can be sketch-mode (soft warnings) in one context and enforce-mode (hard errors) in another
- JSON Schema predicates compose with topology judgments ("if this subgraph is a pipeline, validate that each node's output schema matches the next node's input schema")
- Context-dependent schemas become possible: a schema field's constraints can reference values on sibling or parent entities, bridging JSON Schema into dependent typing territory

**Predicate language pluralism:** JSON Schema is the default predicate language, but the judgment system doesn't require it. Other predicate languages could coexist:
- JSON Schema for structural/value validation (data shapes)
- SurrealQL queries for relational predicates (cross-entity, topology)
- JavaScript functions for complex/imperative predicates (the existing `js-script` constraint type)
- Future: a declarative constraint DSL for domain-specific predicates

Each predicate language has strengths; the judgment system unifies their consequences.

#### Relationship to established type theory

This model is essentially a **refinement type system with effects**:
- **Refinement types:** Types defined by predicates over values (`{ x: int | x > 0 }`)
- **Dependent types:** Types that depend on values (`Vec n` where `n` is a runtime value)
- **Effect system:** Consequences are effects produced by type checking

The constraint algebra's monoid structure maps to **intersection types** — combining two schemas means the entity must satisfy both, which is type intersection.

The implementation tag system maps to **union types with elimination** — an entity with alternatives is a sum type, and the active implementation is the eliminator (pattern match on the tag).

The modal enforcement maps to **gradual typing** — sketch mode is dynamically typed (check at use site, don't block), enforce mode is statically typed (check at definition site, block on failure).

**Standalone value:** A judgment engine that unifies validation, typing, classification, and rendering hints under a single model. Any system that needs "flexible, composable, context-dependent predicates over structured data with pluggable consequences" — which is surprisingly many systems.

**Open questions:**
- Performance: evaluating all judgments on every change could be expensive. Need incremental/lazy evaluation.
- Ordering: some consequences depend on other judgments having been evaluated (type assignment before type-dependent validation). Need a topological sort or fixpoint computation.
- Expressiveness vs. decidability: full dependent types are undecidable. Where to draw the line?

---

## How the Kernels Compose

The synthesis is what makes Marlinspike more than the sum of parts:

```
                    ┌─────────────────────────┐
                    │   Code↔Graph Codec (3)  │
                    │   text ↔ structure      │
                    └────────┬────────────────┘
                             │ bidirectional
                    ┌────────▼────────────────┐
                    │  Rose-Tree Graph (1)     │
                    │  + Port Encapsulation (2)│
                    │  the semantic model      │
                    └───┬────────┬────────┬───┘
                        │        │        │
           ┌────────────▼──┐     │   ┌────▼─────────────┐
           │ Judgment       │     │   │ Hierarchical     │
           │ System (7)     │     │   │ Force Layout (5) │
           │ predicates +   │     │   │ where it goes    │
           │ consequences   │     │   └────┬─────────────┘
           └──┬─────────────┘     │        │
              │ subsumes          │        │
           ┌──▼─────────────┐     │        │
           │ Constraint     │     │        │
           │ Algebra (4)    │     │        │
           │ (one consequence│     │        │
           │  type of 7)    │     │        │
           └──┬─────────────┘     │        │
              │                   │        │
              └───────┬───────────┘────────┘
                      │
                    ┌─▼───────────────────────┐
                    │  Database-as-Protocol (6)│
                    │  persistence + sync      │
                    └─────────────────────────┘
```

- **(1) + (2):** The graph model defines what exists; ports define the interfaces between levels
- **(1) + (3):** The codec makes the graph editable as text and vice versa
- **(1) + (5):** Layout makes the graph visible, respecting its containment structure
- **(1) + (6):** The database persists and syncs the graph across tools
- **(1) + (7):** Judgments predicate over graph entities — types, constraints, tags, hints all operate on the same structure
- **(3) + (7):** Type hints in text (`^Type`) are syntactic sugar for judgment bindings on the graph
- **(4) ⊂ (7):** The constraint algebra is a special case of the judgment system (diagnostic consequences only)
- **(5) + (6):** Layout state can be persisted and synced separately from semantic state
- **(7) + (5):** Rendering-consequence judgments drive visual presentation; topology judgments drive algorithm selection — layout strategy becomes a computed consequence, not a manual choice

Each kernel strengthens the others, but none *requires* the others to function. Kernel 7 subsumes kernel 4 — the constraint algebra becomes one consequence type within the judgment system, rather than a separate mechanism.

---

## Implications for What to Build Next

### The "Extract and Continue" strategy, refined

The kernel framing clarifies what extraction means: **each kernel becomes a module with its own interface, tests, and documentation.** The Marlinspike IDE becomes a composition of these modules plus UI glue.

### Package granularity criteria

Two perspectives determine whether something should be a separate package:

1. **Can it be used on its own by other people?** Not just within the Marlinspike ecosystem — does it solve a general problem?
2. **Will having it as a module enforce that it is only interacted with through its interface?** Does the boundary prevent coupling and maintain clean modular design?

Applied to the kernels:

| Kernel | (1) Standalone value? | (2) Enforces boundary? | Decision |
|---|---|---|---|
| **Graph model + Ports** (1, 2) | Yes — generic rose-tree with typed ports | Yes — separates semantic model from UI/persistence | **Package** (publishable). Ports merge into graph — they're the interface layer of the same data model. |
| **Codec framework** (3) | Yes — bidirectional codec pattern is broadly useful | Yes — prevents UI from reaching into parser internals | **Package** (publishable). Spike-Clojure is first impl. |
| **Judgment system** (7, subsumes 4) | Yes — "composable predicates with pluggable consequences" is very general | Yes — prevents ad-hoc validation scattered through UI | **Package** (publishable). JSON Schema as default predicate language. |
| **Hierarchical layout** (5) | Yes — pure geometry, zero DOM deps | Yes — forces layout to not depend on rendering | **Package** (publishable). |
| **Operations layer** (6) | No — Marlinspike-specific CRUD over SurrealDB | Yes — separates persistence from UI state management | **Internal module** (not published, but enforces boundary). |
| **Constraint algebra** (4) | Subsumed by judgment system | — | **Merged** into judgment system. |
| **Port encapsulation** (2) | Tightly coupled to graph model | — | **Merged** into graph model package. |

This gives four publishable packages, one internal module, and two merges:

```
packages/
  graph/        ← kernels 1 + 2 (rose-tree + ports)
  layout/       ← kernel 5 (hierarchical force layout)
  codec/        ← kernel 3 (bidirectional codec framework)
  judgment/     ← kernel 7 (predicate system, subsumes 4)
src/
  db/           ← kernel 6 (operations layer, internal module)
  ui/           ← IDE glue (canvas, panels, interaction)
```

### Extraction order

Follow dependency + value:
1. **Graph model + ports** — no dependencies, foundation for everything
2. **Layout engine** — depends on graph model (for containment structure)
3. **Judgment system** — depends on graph model (for entity types); JSON Schema predicates come free
4. **Codec framework** — depends on graph model; Spike-Clojure is the first implementation
5. **Operations layer** — depends on graph model; internal module, extracted for boundary discipline

### Prototype vs. refactor?

The kernel framing resolves this tension: **extract kernels (refactor), then build features on them (prototype).** Each extraction is small and focused. Each feature built on an extracted kernel validates the extraction.

### Repo strategy

Stay in this repo. Use Deno workspaces for `packages/`. Split to a separate repo only if a package gains its own community/lifecycle — and even then, start here first.

---

## Threads Revisited

### Distributed aspects (CLI, MCP, LSP)

With Database-as-Protocol (kernel 6) + extracted operations, the path is:
1. Extract operations layer out of `src/ui/`
2. Build CLI using embedded SurrealDB + operations
3. Wire live queries in IDE for real-time sync
4. Build MCP server as another DB client
5. Auth deferred until multi-user matters

### Layout rethink

With Hierarchical Force Layout (kernel 5) extracted:
1. Define layout input/output as plain data structures (no DOM, no TreeNode dependency)
2. Extract existing algorithms (JANK, SDF, TOPOGRID, FIELD) into the package
3. Replace canvas.tsx's inline simulation with calls to the extracted engine
4. Animation becomes a separate layer between layout and rendering

### Graph drawing / format support

With Code↔Graph Isomorphism (kernel 3) as a framework:
1. Define the codec interface (parse: string → Graph, emit: Graph → string)
2. Spike-Clojure is codec #1 (already done)
3. Add DOT codec, Mermaid codec, D2 codec as additional implementations
4. Drawing ergonomics are UI-layer concerns (quick-add, snapping, templates)

### Constraint-based browser layout (CSS alternative)

A standalone project that exercises kernels 2, 4, and 5 in a completely different domain.

**The problem with CSS:** It's a property cascade, not a constraint system. You describe *how things look*, then fight the engine to get *where things go*. Flexbox and grid are layout algorithms you configure — not relationships you declare.

**The alternative:** A constraint-based layout language where you declare relationships between elements and a solver computes positions:
```
A left-of B, gap: 16px
C fills remaining-width of parent
D aspect-ratio: 16/9
sidebar.width >= 200px, <= 400px
header.height == content-height
```

**How the kernels apply:**
- **Constraint algebra (4):** Composable, modal constraints across component boundaries. Sketch mode = rough layout with soft constraints (design time). Enforce mode = pixel-perfect (production). Constraints from different components compose without conflict — the monoid structure guarantees this.
- **Hierarchical layout (5):** The DOM is a rose-tree. Bottom-up settlement is literally how intrinsic sizing wants to work — leaves determine their size, parents resize to fit, forces propagate up. The engine already does this for graphs; applying it to DOM elements is a change of vocabulary, not architecture.
- **Port encapsulation (2):** Component "slots" are ports. A component declares its layout interface — what it needs from its parent (minimum width, aspect ratio) and what it provides to children (available space, alignment anchors) — without exposing internal layout decisions. This is the missing concept in CSS: components can't declare layout contracts.
- **Topology judgments (7):** The DOM subtree's *shape* can drive layout strategy automatically. A linear chain of elements → sequential flow. A grid-like structure (uniform children) → grid layout. A tree with high fan-out → wrap or overflow. The system *observes* the topology and *selects* the algorithm — rather than the developer manually choosing `display: flex` vs `display: grid`. This is layout as a computed consequence of structure, not a manually assigned property. Topology judgments can also flag complexity ("this component tree is too deeply nested — consider flattening") or detect patterns ("this subtree has the shape of a navigation bar — apply nav layout heuristics").

**Prior art and why it hasn't landed:**
- **Cassowary / Apple Auto Layout:** Constraint solver, works well, but never adapted for the web's document flow model
- **GSS (Grid Style Sheets):** Cassowary for CSS, abandoned — too academic, no incremental adoption path
- **Subform layout:** Explored constraint-based layout for UI design tools, never shipped
- None of these had topology analysis — they all required manual algorithm selection

**What would make this attempt different:**
- **Incremental adoption:** Works alongside CSS, not instead of it. Opt elements into constraint layout, leave the rest alone.
- **Modal:** Soft constraints for sketching, hard constraints for production — same model as Marlinspike's validation modes
- **Hierarchical solver:** Not a flat constraint system — respects the DOM tree, solves per-level like the force layout engine
- **Composable across components:** The port/interface model means components can participate in parent layout without leaking internals
- **Topology-driven algorithm selection:** The system analyzes the subtree shape and picks the best layout strategy. You declare constraints on *what* you want; the topology determines *how* it's achieved. Manual override is always available, but the default is intelligent.

**Kernel validation:** This project would stress-test the constraint algebra, topology judgments, and hierarchical layout kernels in a high-performance, real-world context (60fps browser rendering). Any performance or composability issues would surface here before they matter in the graph IDE.

### Real-world demos

Best demo targets are ones that exercise multiple kernels:
- **Module graph visualizer:** kernels 1 (hierarchy), 5 (layout), 3 (codec from import statements)
- **K8s topology:** kernels 1 (hierarchy), 2 (ports = container ports), 4 (networking constraints)
- **CI pipeline editor:** kernels 1, 3 (YAML codec), 4 (validation), 6 (sync to CI system)
- **CSS alternative:** kernels 2 (port contracts), 7→4 (judgment system / constraint algebra), 5 (hierarchical layout)
- **Self-hosting:** all kernels — Marlinspike visualizing its own architecture

---

## Suggested Sequencing

### Execution approach

Each extraction gets its own `/branch` session with a dedicated plan file. This brainstorming doc is the reference for *why* — the kernel invariants, design rationale, and how things compose. Each branch's plan file focuses on the *how* — specific files to move, interfaces to define, tests to write.

**Dependency graph determines the order:**

```
                 packages/graph  (kernels 1+2)
                  ▲    ▲     ▲
                 /     |      \
  packages/layout(5)  packages/judgment(7)  packages/codec(3)
                        ▲
                        |
                   src/db (6, internal)
```

Graph extraction must land first — everything depends on it. After that, layout, judgment, and codec are independent of each other and can run in parallel.

**Phase 1 — Sequential (blocking dependency)**
| Branch | Depends on | Notes |
|---|---|---|
| `lyndon/extract-graph` | — | Must land first. Foundation for all other packages. |

**Phase 2 — Parallel (independent after Phase 1)**
| Branch | Depends on | Notes |
|---|---|---|
| `lyndon/extract-layout` | graph | Pure geometry, zero DOM deps. |
| `lyndon/extract-judgment` | graph | Subsumes constraint algebra. JSON Schema as default predicate language. |
| `lyndon/extract-codec` | graph | Generalize Spike-Clojure pattern. |

These three can be worked on in any order or in parallel — they share the graph dependency but not each other. Each is its own branch off main (after graph merges).

**Phase 3 — Build on extracted packages**
| Branch | Depends on | Notes |
|---|---|---|
| `lyndon/extract-operations` | graph | Internal module. Separates persistence from UI. |
| `lyndon/build-cli` | graph, operations | First non-IDE tool. Embedded SurrealDB. |
| `lyndon/live-sync` | operations | Wire up live queries for real-time multi-tool sync. |
| `lyndon/module-graph-demo` | graph, layout, codec | Validate extracted packages against a real use case. |

**Phase 4 — Longer-term**
| Branch | Depends on | Notes |
|---|---|---|
| `lyndon/dot-mermaid-codecs` | codec | Additional codec implementations. |
| `lyndon/mcp-server` | graph, operations | AI-driven graph construction via SurrealDB. |
| `lyndon/constraint-lsp` | judgment | External validation checkers. |
| `lyndon/auth-remote-sync` | operations, live-sync | Multi-user, scoped permissions. |

---

## Open Questions

- [ ] Is the module graph visualizer the right first demo, or should we target something that exercises ports + judgments more heavily?
- [ ] How much of canvas.tsx can be preserved when layout is extracted, vs. needs rewriting?
- [ ] Should the codec interface target Graph (semantic) or TreeNode (UI) as its intermediate representation?
- [ ] What's the minimum viable "graph drawing tool" — just better creation UX, or full styling/export?

## Verification

This is a brainstorming document — verification is through discussion and alignment, not code. The output is a clear articulation of the independent kernels, how they compose, and a prioritized extraction/build sequence.
