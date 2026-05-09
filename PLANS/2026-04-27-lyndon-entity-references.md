# Entity References

**Branch:** lyndon/entity-references
**Date:** 2026-04-27
**Branch Preview:** <!-- replace me -->

## Context

Marlinspike has no way to **reference** an existing entity as a reusable instance. A function like
`(defn square [x] (* x x))` should be definable once and referenceable multiple times. This branch
adds the `ref` concept to the type system, explores visual treatments via stories, and documents
the design in DESIGN.md.

**Scope:** Type changes + stories + documentation + codec/schema + canvas/inspector rendering.

## Goal

Introduce entity references as a first-class concept: `type?: "ref"` and `ref?: string` on TreeNode,
with full round-trip support through the DB layer, Spike-Clojure codec, canvas/inspector visual
distinction, and exploration via stories. Develop a proposed design for scope-inferred references,
import declarations, and destructuring-as-ports.

## Approach

### Step 1: Add `ref` to types and helpers (`workspace.ts`)

- [x] Add `type?: "ref"` and `ref?: string` to `TreeNode` interface
- [x] Add `makeRefNode(id, label, ref)` factory
- [x] Add `isRef(node)` type guard helper
- [x] Include `ref` and `type` in `parseNode` and `nodeHash`

### Step 2: DB layer (`operations.ts`, `schema.ts`)

- [x] Add `type?: string` and `ref?: string` to `FlatNode`
- [x] Include both in `flattenTree` and `buildTree`
- [x] Add schema fields for `type` and `ref` on `tree_node`
- [x] Include `type`/`ref` in `saveTreeNode`

### Step 3: Spike-Clojure codec (`spike-clojure.ts`, `workspace-codec.ts`)

- [x] Emit `:ref` in reader metadata (`nameWithIdMeta`)
- [x] Parse `:ref` from metadata (`extractNameMeta`)
- [x] Emit ref nodes as `(def name ref-target)` — idiomatic syntax
- [x] Parse `(def name symbol)` as ref node
- [x] Preserve `ref` and `type` in `mergeTrees`

### Step 4: Canvas and inspector rendering

- [x] Collapsed ref nodes: dashed stroke (`3,2`), purple tint (`#605080`), `↗ {target}` label
- [x] Expanded ref groups: dashed border (`6,3`), purple tint
- [x] Ref label shows resolved target label (not generic "ref")
- [x] Empty ref nodes cannot be expanded (no children — structure delegation is future work)
- [x] Inspector: "Reference" section with clickable link to target node
- [x] Inspector: broken ref shown in red with warning, remote ref shown in grey

### Step 5: Stories (`reference.stories.tsx`)

- [x] **ReferenceVsRegular** — regular composite vs reference vs leaf
- [x] **MultipleReferences** — one target with 3 references
- [x] **ReferenceInTree** — tree panel with reference indicators
- [x] **VisualTreatments** — side-by-side visual exploration
- [x] **BrokenReference** — broken and remote ref visual treatment
- [x] **ReferenceEditing** — inspector view for editing ref targets
- [x] **CubicRoots** — real-world example: shared math primitives referenced across
      four pipeline steps with full internal dataflow edges

### Step 6: Round-trip gallery fixture

- [x] Add `refNode()` builder to `spike-clojure-fixtures.ts`
- [x] Add cubic-roots-with-refs fixture to `FIXTURES` (clj + skeleton graph)

### Step 7: DESIGN.md updates

- [x] New "Entity References" section under Data Model
- [x] Add to Phase 2 roadmap
- [x] Update "Notions Not Yet Explored" re: class/template system
- [x] Proposed design: scope-inferred references, node identity from let-bindings,
      destructuring as port-level edges, import declarations, normalising round-trip
- [x] Updated graph-concept mapping table (references, imports, unresolved symbols, port-level edges)

### Step 8: CI

- [x] `NO_COLOR=1 deno task ci` passes

## Key files

| File | Change |
|------|--------|
| `src/ui/workspace.ts` | `type`/`ref` on TreeNode, `makeRefNode`, `isRef`, parseNode, nodeHash |
| `src/ui/db/schema.ts` | `type` and `ref` field definitions |
| `src/ui/db/operations.ts` | `type`/`ref` in FlatNode, flattenTree, buildTree, saveTreeNode |
| `src/code/spike-clojure.ts` | Emit/parse `:ref` metadata + idiomatic `(def name target)` syntax |
| `src/code/workspace-codec.ts` | Preserve `ref`/`type` in mergeTrees |
| `src/code/spike-clojure-fixtures.ts` | `refNode()` builder + cubic-roots-with-refs fixture |
| `src/ui/components/canvas.tsx` | Dashed stroke/fill for ref nodes, target label, expand guard |
| `src/ui/components/inspector.tsx` | Reference section with target link / broken indicator |
| `src/ui/stories/reference.stories.tsx` | 7 visual exploration stories incl. CubicRoots |
| `src/ui/stories/examples.stories.tsx` | CubicRootsWithRefs story (standalone parse-and-render) |
| `src/ui/stories/index.ts` | Register new story group |
| `DESIGN.md` | Entity References section with proposed design, Phase 2 roadmap, Notions update |

## Proposed design (documented in DESIGN.md)

The current branch implements explicit refs (`(def use-square square)` and `type: "ref"` on
TreeNode). Through design exploration, a fuller proposal emerged for how refs should work:

### Scope-inferred references

Any symbol that resolves to a prior definition in scope is a reference — not just call-position
symbols. The parser operates on a closed world:

1. **Source definitions** — `def`, `defn`, `let` bindings
2. **Explicit imports** — `(require [math :refer [divide]])` declarations
3. **Everything else** — unresolved symbol, classification deferred to later layers

This makes ref resolution fully syntactic — no ambient resolution against the broader graph.

### Node identity from let-bindings

Multiple invocations of the same function get distinct identity from their binding names:
`(let [b-over-a (divide b a)])` → `{id: "b-over-a", label: "divide", type: "ref", ref: "divide"}`.
No UUID metadata needed.

### Destructuring as port-level edges

Map bodies and `{:keys}` patterns map to port connections on edges, with `outputPort` and
`bindingName` in edge data for round-trip reconstruction.

### Normalising round-trip

The round-trip becomes normalising rather than idempotent: `parse(emit(parse(clj)))` stabilises
after one pass. The emitter reconstructs semantically equivalent Clojure from port edges and
edge data.

## Open Questions

- **Subsume `data.function` / `data.script`?** — Could the `ref` concept subsume these? E.g. a
  `type: "ref"` node replaces `data.function`, and a new `type: "inline"` or `type: "foreign"` node
  type replaces `data.script`. Flagged for future exploration.
- **Ref expansion / resolution** — When a ref node is expanded, should it show the target's
  children? Currently prevented (empty ref nodes can't expand). Future work: resolve the target
  and render its subtree inline, with visual indication that the content is delegated.
- **Import mechanism details** — Does `require` map to composite node boundaries (namespaces)?
  How does it interact with the workspace tree hierarchy?

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (376 tests, 0 failures)
- [x] Stories render at `/stories` — visual inspection of reference treatments
- [x] Cubic-roots-with-refs fixture in RoundTripGallery
- [ ] Spike-Clojure round-trip preserves `:ref` metadata
