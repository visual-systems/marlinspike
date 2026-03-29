# Exploring Spike-Clojure Ideas

**Branch:** lyndon/exploring-spike-lisp-ideas
**Date:** 2026-03-26

## Context

Spike-Clojure is a round-trippable text representation of the graph — a true Clojure subset where graph semantics layer on top of ordinary Clojure code without breaking host-language validity. It serves as the backing format for the text view (§6.5) and the AI/MCP interface (§13).

This branch designed the notation and built the base reader. The semantic interpreter and serialiser are deferred.

## Approach

- [x] **1. Understand the gap** — resolved as a design question (see decisions below); no separate document needed.
- [x] **2. Base-lisp reader** (`src/graph/base_lisp.ts`) — EDN-inspired S-expression reader; typed `SExp` AST, no graph semantics.
- [x] **3. Candidate syntax stories** (`src/ui/stories/candidate-spike-lisp-syntaxes.stories.tsx`) — 13 stories covering all syntax patterns: structural containers, call topology, ports, fan-out/fan-in/diamond, URI references, properties.
- [ ] **4. Semantic interpreter + serialiser** (`src/graph/spike_lisp.ts`) — deferred; needs targeting at `def`/`defn`/`fn` semantics (not the original `#Subgraph`/`#Call` approach). See Deferred.
- [ ] **5. Round-trip tests** (`src/graph/spike_lisp_test.ts`) — deferred; depends on interpreter.
- [x] **6. Bridge exploration** — resolved as a design question; no converter file needed. See decisions below.
- [x] **7. Update DESIGN.md** — §13.2 replaced with language-representation model; `docs/spike-clojure.md` created with full Spike-Clojure reference. §5.3 updated with sketch/enforce modes and UI layer relationship.

## Resolved Decisions

- **Rename: Spike-Lisp → Spike-Clojure** — the Clojure variant is a true Clojure subset. Future variants (TypeScript, Scheme, etc.) will have their own names. The base reader layer remains "base-lisp" (language-agnostic).

- **Isomorphism with idiomatic code** — the goal is not merely Clojure-inspired syntax but full isomorphism: valid Spike-Clojure is valid Clojure. When a design choice arises, prefer the idiomatic host-language form. Non-host forms (`#Subgraph`, `#Call`) are reserved for concepts with no natural host-language equivalent.

- **Core forms: `def` / `defn` / `fn`**
  - `def` — structural container, named value, not callable; body is a vector of node references: `(def my-graph [A B C])`
  - `defn` — callable node, has ports, can be invoked; body is a plain `let` returning a map
  - `fn` — anonymous sub-subgraph

- **`def` body is a vector of bare symbol references** — `(node)` invocation syntax inside a structural container incorrectly implied calling the node. Bare refs express presence without call order.

- **Inline named `def` inside a vector** — `(def A [B (def C [D])])` is valid shorthand, equivalent to separate `(def C [D])` + `(def A [B C])`. Use separate forms when the sub-container is shared or deeply nested.

- **`#Subgraph` and `#Call` are optional annotations** — `def`/`defn`/`fn` already carry the structural/callable distinction. `#Subgraph`/`#Call` are retained as optional explicit annotations and as the extensibility hook for user-defined semantic variants.

- **Port syntax** — in-ports are `defn` arguments with `^Type` hints; out-ports use the attr-map position:
  - Single output: `(defn ^float foo [^float x] ...)` — standard Clojure type hint
  - Multiple outputs: `(defn foo {:ports {:x1 float :x2 float}} [^float a] ...)` — attr-map, same position as `:deprecated`, `:arglists` etc.

- **Port selection via Clojure destructuring** — `(let [{:keys [port-name]} (node args)] ...)` replaces the Spike-Lisp-specific `:from :port-name`. Standard Clojure, no graph-specific syntax.

- **Node identity in call graphs via `let`** — implicit label deduplication (D appearing twice = same node) is fragile. `let` binding is the resolution: `(let [d D] (A (B d) (C d)))` — `d` is a named reference shared across branches. Also handles pure fan-in and named-wire semantics.

- **UI layer vs. formal types** — the UI type system (`TreeNode`/`Edge`) is intentionally permissive. It can author all graph concepts (ports, schemas, implementations) but does not structurally require any of them — fields are optional, not absent. There is no separate "formal type" the UI must be converted into; the UI is the authoring model. The constraint system provides enforcement:
  - **sketch mode** — constraints surface feedback but do not block
  - **enforce mode** — violations are hard stops at declared checkpoints (save, compile, publish)
  - Relationship: **enforce-valid ⊆ sketch-valid ⊆ UI-representable**

## Deferred

Items to revisit in a future branch:

- **Semantic interpreter** (`src/graph/spike_lisp.ts`) — implement `interpret(sexp: SExp): Graph` targeting the `def`/`defn`/`fn` semantics. The original plan targeted `#Subgraph`/`#Call`; needs re-scoping.
- **Serialiser** (`src/graph/spike_lisp.ts`) — implement `serialize(graph: Graph): string`; emit `def`/`defn`/`fn` forms. Inline subgraph by default; fall back to URI reference.
- **Round-trip tests** (`src/graph/spike_lisp_test.ts`) — depends on interpreter + serialiser.
- **ID/URI tagging for `defn` forms** — how does a `defn` declare its own URI? Open: `{:uri "spike://..."}` in the attr-map, or a separate `defn` metadata convention.
- **`defn` body as bare `#Subgraph`** — if the body is a `#Subgraph` rather than a `let`, does that mean the node's implementation *is* the containment graph, or that the node *is* the graph? Needs pinning down.
- **User-defined semantic variants** — extensibility model for `#MyVariant` reader tags beyond `#Subgraph`/`#Call`.
- **Spike-TypeScript, Spike-Scheme variants** — future language variants following the same isomorphism principle. Base-lisp reader is shared; only the semantic mapping layer differs.
- **Inout ports** — bidirectional ports. Call-graph invocation already handles request/response implicitly; explicit inout ports deferred.
- **Correlated input/output types** — e.g. `(defn id [^T x] ^T)` where output type mirrors input. Requires type-level polymorphism / dynamic dispatch. Out of scope for now.
- **Two-finger pan, pinch-to-zoom** — replace drag-to-zoom with trackpad gestures.
- **Data explorer modal** — larger rendering of data/type information for nodes and edges.

## Critical Files

- `src/graph/base_lisp.ts` — base-lisp reader (done)
- `src/ui/stories/candidate-spike-lisp-syntaxes.stories.tsx` — syntax candidate stories (done)
- `docs/spike-clojure.md` — Spike-Clojure reference documentation (done)
- `DESIGN.md` §5.3 — sketch/enforce modes, UI layer relationship (done)
- `DESIGN.md` §13.2 — language representation model (done)
- `src/graph/spike_lisp.ts` — semantic interpreter + serialiser (deferred)
- `src/graph/spike_lisp_test.ts` — round-trip tests (deferred)

## Diversions

- **2026-03-28 — CI `deno task ci`** — lint error (`no-unused-vars` on `_open` param). Fixed. Added `ci` task to `deno.json`; updated `CLAUDE.md` to require it before every commit.
- **2026-03-29 — CI `check-ui` missing** — `TS2503: Cannot find namespace 'JSX'`. Fixed import; added `check-ui` to the `ci` task.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (fmt, lint, type-check, tests)
- [x] Syntax stories cover all syntax patterns (13 stories)
- [x] DESIGN.md updated with language-representation model and sketch/enforce modes
- [x] `docs/spike-clojure.md` created with full reference
- [ ] Round-trip: `interpret(parse(serialize(fixture)))` deep-equals fixture — deferred
- [ ] Semantic interpreter covers `def`/`defn`/`fn` forms — deferred
