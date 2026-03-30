# Spike: Clojure Round-trips

**Branch:** lyndon/spike-clojure-round-trips
**Date:** 2026-03-29

## Context

`src/code/spike-clojure.ts` currently round-trips structural containment (`def` forms) but has no edge round-trip. Edges must **not** be encoded in comments — comments are for humans only. Instead, edges should be expressed as proper Clojure forms, favouring terse and readable encoding with direct name references (not IDs).

The spike explores which Clojure encoding mechanisms work for which graph topologies, builds round-trip tests and stories, and documents shortcomings as it goes.

## Goal

- Edges round-trip via proper Clojure forms (not comments)
- Comprehensive unit tests for `clj→graph→clj` and `graph→clj→graph`
- Stories demonstrating round-trips and known shortcomings
- Shortcomings documented in Deferred as discovered

## Approach

### 1. Add `defn` + `let` emitter & parser
The primary encoding for edges: a `defn` with a `let` body where bindings capture the output of each called node. The data flow topology falls out of the binding references — no separate edge declarations needed.

Emit rule: if a `def`-level graph has edges, emit it as `defn ... (let [...] ...)` instead of `def ... [...]`.

Parse rule: walk `let` bindings; each `(NodeName arg1 arg2 ...)` creates edges from each arg-binding's source node to `NodeName`.

- [x] Extend `graphToSpike` to emit `defn`+`let` when edges are present
- [x] Extend `spikeToGraph` to parse `defn`+`let` bodies into nodes + edges
- [x] Handle chain, fan-out, fan-in, and diamond topologies
- [x] File: `src/code/spike-clojure.ts`

### 2. Write unit tests (`src/code/spike-clojure_test.ts`)
- [x] `graph→clj→graph` round-trips: emit then re-parse, assert structural + edge equality
- [x] `clj→graph→clj` round-trips: parse then re-emit, assert text equality
- [x] Fixture cases:
  - `def` only: leaf-only, nested composites — already works, confirm
  - Chain: A → B → C (sequential `let`)
  - Fan-out: A → B, A → C
  - Fan-in: A → C, B → C
  - Diamond: A → B, A → C, B → D, C → D
  - Mixed: `def` container holding a `defn` with edges — deferred (see below)

### 3. Add round-trip stories
- [x] Add a `RoundTripGallery` story to `src/ui/stories/code-panel.stories.tsx`
- [x] Fixtures extracted to `src/code/spike-clojure-fixtures.ts` — shared by tests and stories
- [x] Show emitted Clojure alongside re-emitted Clojure with ✓/✗ stability badge

### 4. Update call site
- [x] `src/ui/components/code-panel.tsx`: use returned `edges` from `spikeToGraph`

### 5. Document shortcomings as discovered
- [ ] Track in Deferred below

## Encoding Heuristic Algorithm

The emitter uses an iterative refinement algorithm. The scoring metric is TBD — candidates include character count and form count; both will be explored during the spike. The algorithm is a pure function designed to be replaceable/pluggable.

```
encode(nodes, edges) → SExp
  1. Start: build canonical verbose form
       — nodes as separate top-level defs
       — edges as explicit declarations after main sexp (e.g. `(wire A B)`)
  2. Try: inline edges into `let` bindings inside the enclosing sexp
       — where input/output relationships are coherent (single-path flow)
       — keep if result scores better
  3. Try: inline single-use `let` bindings as direct call arguments
       — e.g. `(let [a (A x)] (B a))` → `(B (A x))`
       — keep if result scores better
  4. Repeat steps 2–3 until stable (no further improvement)
  5. Return final form
```

## Open Questions

- **Name vs ID**: Code references entities by label/name for readability, but the graph model uses IDs. When labels are unique within a scope, labels *are* the IDs (current behaviour). If they diverge, the round-trip breaks identity. Deferred.
- **`def` with edges**: Does having edges force `defn`? Explore during spike.
- **How are edges labelled**: What's an idiomatic way to label and enrich edges?

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (120 tests, 0 failed)
- [x] All round-trip unit tests pass
- [ ] Stories render correctly (visual check)

## Deferred

- Root-level leaf nodes emit as `; leafLabel` comments and are not parsed back — structural information is lost.
- IDs = labels: label uniqueness is assumed. Explicit ID metadata syntax (`^{:id "..."}`) is a future consideration.
- `defn` with ports (`{:ports {...}}`) and typed args (`^Type`) are not yet handled in the serialiser.
