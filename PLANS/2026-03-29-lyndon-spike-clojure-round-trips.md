# Spike: Clojure Round-trips

**Branch:** lyndon/spike-clojure-round-trips
**Date:** 2026-03-29

## Context

`src/code/spike-clojure.ts` currently round-trips structural containment (`def` forms) but has no edge round-trip. Edges must **not** be encoded in comments — comments are for humans only. Instead, edges should be expressed as proper Clojure forms, favouring terse and readable encoding with direct name references (not IDs).

The spike explores which Clojure encoding mechanisms work for which graph topologies, builds round-trip tests and stories, and documents shortcomings as it goes.

## Goal

- Edges round-trip via proper Clojure forms (not comments)
- Comprehensive unit tests for `clj→graph→clj` and `graph→clj→graph`
- Semantic verification via evaluator (eval original vs eval round-tripped)
- Stories demonstrating round-trips and known shortcomings
- Shortcomings documented in Deferred as discovered

## Approach

### 1. Add `defn` + `let` emitter & parser ✅
- [x] Extend `graphToSpike` to emit `defn`+`let` when edges are present
- [x] Extend `spikeToGraph` to parse `defn`+`let` bodies into nodes + edges
- [x] Handle chain, fan-out, fan-in, and diamond topologies

### 2. Binding-name-as-identity (Tier 1) ✅
Let binding variable names become node labels; the function name is stored in `data.fn`.
`(let [neg-b (negate b)] ...)` → node `neg-b`, fn `negate`. Fixes duplicate-call collapse.

### 3. Numeric literal preservation in let-bound calls ✅
Literals in let-bound call arguments (e.g. `2.0` in `(multiply 2.0 a)`) are preserved
via `data.argOrder` so the emitter reconstructs the full call including literals.

### 4. Inline-call hoisting in the emitter ✅
Single-use anonymous nodes (no `data.fn`, outgoing edge count ≤ 1) are inlined directly
as call arguments rather than emitted as separate let bindings. Avoids let-binding
names shadowing function names (e.g. `square (square b)`).

### 5. Conjunctive naming for duplicate inline calls (Tier 2) ✅
When an inline call's function name already exists as a node, the parser generates a
conjunctive name (`fn-arg1-arg2`) to create a distinct node. E.g. `(multiply 4.0 (multiply a c))`
creates nodes `multiply` (for `a*c`) and `multiply-4-multiply` (for `4*a*c`) with
`data.fn="multiply"` and `data.argOrder=["4", "multiply"]`. Fixes the nested inline call
literal loss that caused `b²−4ac` to round-trip as `b²−ac`.

### 6. Write unit tests (`src/code/spike-clojure_test.ts`) ✅
- [x] `graph→clj→graph` round-trips
- [x] `clj→graph→clj` round-trips (stability)
- [x] Fixture cases: chain, fan-out, fan-in, diamond, OIDC, quadratic, duplicate-call
- [x] Numeric literal preservation tests (verify correct eval, not just structural)
- [x] Binding-name and let-block structure tests
- [x] Quadratic-roots: 14-node parse, all nodes survive re-emit, eval matches original

### 7. Add evaluator (`src/code/spike-clojure-eval.ts`) ✅
- [x] `evaluateSpike` for semantic verification of round-trips
- [x] Unit tests in `spike-clojure-eval_test.ts`
- [x] Fixture-driven eval: `examples evaluate correctly` + `round-trip eval matches original`

### 8. Add round-trip stories ✅
- [x] `RoundTripCard` in `code-panel.stories.tsx` with clj→graph→clj and graph→clj→graph sections
- [x] Eval panel: shows inputs / orig / round-trip / ✓✗ per example
- [x] Fixtures extracted to `spike-clojure-fixtures.ts` — shared by tests and stories

### 9. Update call site _(deferred)_
- Moved to Deferred — wiring edges into code-panel.tsx will require iteration

### 10. Fix root-level leaves and nested defn resolution ✅
- [x] Emit root-level leaf nodes as `(def name)` instead of comments
- [x] Parse bare `(def name)` as leaf nodes
- [x] Resolve `def` children from `defns` table (nested defn inside def)
- [x] Reclassify root-level edges from shortcoming to by-design

### 11. Document shortcomings
- [x] Track in Deferred below

## Key Files

- `src/code/spike-clojure.ts` — serialiser (parser + emitter)
- `src/code/spike-clojure_test.ts` — tests (206 passing)
- `src/code/spike-clojure-eval.ts` — evaluator
- `src/code/spike-clojure-eval_test.ts` — evaluator tests
- `src/code/spike-clojure-fixtures.ts` — shared fixtures
- `src/ui/stories/code-panel.stories.tsx` — round-trip stories
- `src/ui/components/code-panel.tsx` — caller (edges not yet wired)

## Open Questions

- **Name vs ID**: Code references entities by label/name. If labels diverge from IDs, round-trip breaks. Explicit ID metadata (`^{:id "uuid"}`) is deferred.
- **`def` with edges**: Having edges currently forces `defn`. This seems correct.
- **How are edges labelled**: What's an idiomatic way to label and enrich edges?

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (206 tests, 0 failures)
- [x] All round-trip unit tests pass
- [x] Quadratic formula `b²−4ac` evaluates correctly after round-trip
- [ ] Stories render correctly (visual check)

## Deferred / Known Shortcomings

- **Root-level edges not supported (by design)**: Edges require a containing `defn`/`let` scope, matching Clojure semantics where dataflow lives inside a function.
- **IDs = labels**: Label uniqueness assumed; renames break identity. Deferred.
- **Edges across different root composites**: Not supported. Deferred.
- **Wire edges into code-panel.tsx**: `spikeToGraph` returns edges but the code panel doesn't use them yet. Will require iteration on the UI side.
- **Lint-suggest-fix system**: A layer that detects errors/warnings in the Spike-Clojure output (e.g. conjunctive names that could be promoted to let bindings, missing edges, ambiguous names) and suggests or auto-applies known fixes and heuristic improvements.
