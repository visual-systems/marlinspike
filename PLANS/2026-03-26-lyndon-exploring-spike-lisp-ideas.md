# Exploring Spike-Lisp Ideas

**Branch:** lyndon/exploring-spike-lisp-ideas
**Date:** 2026-03-26

## Context

DESIGN.md §13.2 specifies Spike-Lisp — a round-trippable text representation of the graph for both the human-facing text view (§6.5) and the AI/MCP interface (§13). The design is well-described but no implementation exists.

The codebase currently has two separate type systems:
- `src/graph/types.ts` — formal `Graph`/`Node`/`Edge` types matching DESIGN.md §4.3 (port nodes, portSchema, implementations, URIs, activeSchemas)
- `src/ui/workspace.ts` — working `TreeNode`/`Edge` UI types used by the live canvas (simpler; no port nodes, no portSchema, no implementations)

The workspace model is missing key concepts that Spike-Lisp assumes (port nodes, port schemas, implementations). This gap is itself a design question that this branch should surface explicitly.

Spike-Lisp is a **two-layer system**:

1. **Base-lisp** — a general-purpose S-expression reader written from scratch, borrowing heavily from EDN (Clojure's data notation). Produces a typed AST with no graph semantics.
2. **Semantic variants** — named interpretations layered on top of base-lisp that assign graph meaning to S-expression structure. Two initial variants:
   - `Subgraph` — direct containment: `(A B (C D))` ≡ A contains B and C-containing-D
   - `Call` — invocation/dataflow chain: `(A (B C))` ≡ A calls B calls C
   - Variants are tagged explicitly: `#Subgraph (A B (C D))` / `#Call (A (B C))`
   - Mix-and-match within a document is permitted
   - The semantic set is extensible (user-defined variants planned)

## Goal

1. Design and implement the base-lisp reader (EDN-inspired, written from scratch)
2. Implement the `Subgraph` and `Call` semantic interpreters
3. Create syntax candidate stories that pair Spike-Lisp literals with their corresponding `Graph` objects — exploring both variants and mixed forms
4. Understand and document the gap between the formal types and the working workspace types
5. Update DESIGN.md with the layered architecture and what we learn

## Approach

- [ ] **1. Understand the gap** — read both type systems and document what `TreeNode`/`Edge` lacks relative to `Graph`/`Node`/`Edge`. Key missing: port nodes, portSchema, direction, implementations, activeSchemas, URI addressability.

- [ ] **2. Base-lisp reader** (`src/graph/base_lisp.ts`) — implement a self-contained S-expression reader, borrowing from EDN:
  - **Token types** (EDN-inspired):
    - `symbol` — bare identifiers: `A`, `my-node`, `spike.topology.pipeline`
    - `keyword` — `:foo`, `:bar` — metadata keys and named parameters
    - `string` — `"double-quoted"`
    - `number` — integers and floats
    - `boolean` — `true` / `false`
    - `nil` — `nil`
    - `list` — `(...)` — primary structural form
    - `vector` — `[...]` — ordered collections (schemas, ports)
    - `map` — `{:key val ...}` — properties/metadata bags
    - `tagged` — `#TagName value` — EDN-style reader tags; this is the semantic annotation mechanism (`#Subgraph`, `#Call`, user-defined)
    - `;` line comments (stripped by reader)
  - Produces a typed `SExp` union type, not plain strings
  - No graph semantics in this layer

- [ ] **3. Candidate syntax stories** (`src/ui/stories/candidate-spike-lisp-syntaxes.stories.tsx`) — before implementing semantics, create stories pairing Spike-Lisp string literals with expected `Graph` objects. Each story is a named candidate:
  - Leaf-only graph in `Subgraph` semantics
  - Composite with inlined subgraph in `Subgraph` semantics
  - Call chain in `Call` semantics
  - Mixed `#Subgraph` / `#Call` in the same document
  - Port nodes and schemas
  - URI-referenced subgraph vs inlined

- [ ] **4. Semantic interpreters** (`src/graph/spike_lisp.ts`) — implement `interpret(sexp: SExp): Graph` for each variant, informed by the stories:
  - `#Subgraph (A B (C D))` → rose-tree containment
  - `#Call (A (B C))` → call/dataflow chain (nesting = invocation order; edges implicit from structure)
  - Shared concerns: port node reconstruction from keyword args, edge declaration, properties from maps

- [ ] **5. Serialiser** (`src/graph/spike_lisp.ts`) — implement `serialize(graph: Graph, semantic: "Subgraph" | "Call"): string`
  - Emits tagged form: `#Subgraph (...)` or `#Call (...)`
  - Composite nodes inline their subgraph by default (more readable); fall back to URI reference if subgraph not available
  - Port nodes become keyword args inline on their parent node form
  - Properties rendered as EDN maps `{:key val}`

- [ ] **6. Round-trip tests** (`src/graph/spike_lisp_test.ts`)
  - `interpret(parse(serialize(graph)))` deep-equals the original for each fixture
  - Reuse graph fixtures from the syntax stories

- [ ] **7. Bridge exploration** (`src/graph/bridge.ts`) — implement `treeNodeToGraph(node: TreeNode, edges: Edge[]): Graph`
  - Map `TreeNode` → `Node` (composite detection via children)
  - Document what's lost (portSchema, direction, implementations) and what workspace changes would be needed

- [ ] **8. Update DESIGN.md** — replace/extend §13.2 with the two-layer architecture:
  - Base-lisp token grammar (EDN-inspired)
  - `Subgraph` and `Call` semantic variants with examples
  - Tagged literal syntax for semantic annotation (`#Subgraph`, `#Call`)
  - Extensibility model for user-defined semantic variants
  - Workspace gap findings

## Open Questions

- **`(semantics Name form)` vs `#Name form`** — EDN reader tags (`#Call (A (B C))`) are cleaner and more idiomatic; the list form is more explicit. Currently leaning toward reader tags. Stories will test readability.
- **Implicit vs explicit edges in `Call`** — in `(A (B C))` are edges implied by the nesting, or must they still be declared separately? For now: implied by nesting.
- **Port node notation** — `:port (in ...)` inline on a node form vs a separate declaration. Stories will explore this.
- **Properties bag** — `Node.properties` is `Record<string, unknown>`; render as an EDN map `{:key val}` attached to the node form.
- **Workspace migration** — bridge exploration will reveal whether `TreeNode` should grow port-node support or stay as a UI-layer simplification.
- **Node identity in `#Call` — implicit label deduplication is fragile** — `#Call (A (B D) (C D))` relies on `D` appearing twice meaning the *same* node by label identity. Two nodes with the same label would incorrectly collapse; labels aren't stable IDs. Two candidate resolutions:
  1. **Explicit ID/URI** — nodes carry an explicit `:id` or URI: `(B :id "d" D)` and `(C :id "d" D)` — verbose for inline graphs
  2. **Let binding** — `#Call (let [d D] (A (B d) (C d)))` — `d` is a local name bound to node `D`; both branches reference the same binding. This is the cleaner resolution and also addresses pure fan-in and named-wire semantics (see below). Note: `let` was already anticipated in the original `#Call` description.

- **Mixing `#Subgraph`/`#Call` vs. separate metadata** — `#Call` inside `#Subgraph` contributes nodes + edges to the containing graph; `#Subgraph` inside `#Call` defines a composite node inline. This handles most wiring and structure without a separate metadata system. Three known gaps where nesting breaks down:
  1. **Edge properties** — per-edge metadata (label, type, retry policy) has no slot in pure structural nesting; needs some decoration form e.g. `(#edge :label "retry" B)`
  2. **Pure fan-in** — `((A B) C)` is not viable: it implies A→B (which doesn't exist), and a `#Subgraph` grouping would require edges to transgress subgraph boundaries implicitly. Let binding is the correct resolution: `(let [c C] (A c) (B c))` — c is a named reference; A and B call it independently with no implied relationship between A and B
  3. **Let/binding** — naming intermediate values in dataflow (`let result = A(x) in B(result, y)`) is inherently flat; nesting gives the topology but loses named-wire semantics; `let` addresses this directly

## Critical Files

- `src/graph/types.ts` — formal types (read-only reference)
- `src/ui/workspace.ts` — UI types (read-only reference)
- `src/graph/base_lisp.ts` — new: base-lisp reader (tokeniser + typed AST)
- `src/graph/spike_lisp.ts` — new: semantic interpreters + serialiser
- `src/graph/spike_lisp_test.ts` — new: round-trip tests
- `src/graph/bridge.ts` — new: TreeNode ↔ Graph converter
- `src/ui/stories/candidate-spike-lisp-syntaxes.stories.tsx` — new: syntax candidate stories
- `DESIGN.md` §13.2 — update with layered architecture and findings

## Diversions

- **2026-03-28 — CI `deno task ci`** — CI was failing due to a lint error (`no-unused-vars` on `open` param in `base_lisp.ts`). Fixed by prefixing with `_`. Added a `ci` task to `deno.json` that runs `fmt --check && lint && check && test` in sequence, and updated `CLAUDE.md` to require `NO_COLOR=1 deno task ci` before every commit/push.
- **2026-03-29 — CI `check-ui` missing from `ci` task** — `TS2503: Cannot find namespace 'JSX'` in the stories file. Root cause: `JSX` must be imported from `@hono/hono/jsx/dom/jsx-runtime` (as `main.tsx` does), not the dom module itself. Also `check-ui` was absent from the `ci` task so it wasn't caught locally — added it.

## Verification

- [ ] `NO_COLOR=1 deno task ci` passes (fmt, lint, type-check, tests)
- [ ] Syntax stories render in the stories shell without errors
- [ ] Round-trip: `interpret(parse(serialize(fixture)))` deep-equals fixture for each story's graph
- [ ] Bridge: `treeNodeToGraph` runs on the default workspace tree without throwing
- [ ] DESIGN.md updated with the two-layer architecture

## Other deferred item to push back into design

* Try two-finger pan, pinch to zoom. Instead of drag to zoom.
* A data explorer modal to render data style information larger