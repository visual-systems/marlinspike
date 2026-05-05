# Entity References

**Branch:** lyndon/entity-references
**Date:** 2026-04-27
**Branch Preview:** <!-- replace me -->

## Context

Marlinspike has no way to **reference** an existing entity as a reusable instance. A function like
`(defn square [x] (* x x))` should be definable once and referenceable multiple times. This branch
adds the `ref` concept to the type system, explores visual treatments via stories, and documents
the design in DESIGN.md.

**Scope:** Type changes + stories + documentation + codec/schema. Not full resolution/rendering.

## Goal

Introduce entity references as a first-class concept: `type?: "ref"` and `ref?: string` on TreeNode,
with full round-trip support through the DB layer, Spike-Clojure codec, and visual exploration via
stories.

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

### Step 4: Stories (`reference.stories.tsx`)

- [x] **ReferenceVsRegular** — Canvas with a regular composite, a reference to it, and a leaf
- [x] **MultipleReferences** — One target node with 3 references
- [x] **ReferenceInTree** — Tree panel showing reference nodes with visual indicator
- [x] **VisualTreatments** — Side-by-side canvas options for visual exploration
- [x] **BrokenReference** — A reference whose target doesn't exist
- [x] **ReferenceEditing** — Inspector view for a ref node

### Step 5: DESIGN.md updates

- [x] New "Entity References" section under Data Model
- [x] Add to Phase 2 roadmap
- [x] Update "Notions Not Yet Explored" re: class/template system

### Step 6: CI

- [x] `NO_COLOR=1 deno task ci` passes

## Key files

| File | Change |
|------|--------|
| `src/ui/workspace.ts` | `type`/`ref` on TreeNode, `makeRefNode`, `isRef`, parseNode, nodeHash |
| `src/ui/db/schema.ts` | `type` and `ref` field definitions |
| `src/ui/db/operations.ts` | `type`/`ref` in FlatNode, flattenTree, buildTree, saveTreeNode |
| `src/code/spike-clojure.ts` | Emit/parse `:ref` metadata + idiomatic `(def name target)` syntax |
| `src/code/workspace-codec.ts` | Preserve `ref`/`type` in mergeTrees |
| `src/ui/stories/reference.stories.tsx` | New — 6 visual exploration stories |
| `src/ui/stories/index.ts` | Register new story group |
| `DESIGN.md` | Entity References section, Phase 2 roadmap, Notions update |

## Open Questions

- **Subsume `data.function` / `data.script`?** — Could the `ref` concept subsume these? E.g. a
  `type: "ref"` node replaces `data.function`, and a new `type: "inline"` or `type: "foreign"` node
  type replaces `data.script`. Flagged for future exploration.

## Verification

- [x] `NO_COLOR=1 deno task ci` passes (375 tests, 0 failures)
- [ ] Stories render at `/stories` — visual inspection of reference treatments
- [ ] Spike-Clojure round-trip preserves `:ref` metadata
