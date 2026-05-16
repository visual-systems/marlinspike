# Extract Graph

**Branch:** lyndon/extract-graph
**Date:** 2026-05-13
**Branch Preview:** <!-- replace me -->

## Status: COMPLETE

All phases (A-E) implemented, all verification items pass. 456 tests (47 in package + 409 existing). Merged to main via PR.

## Context

Marlinspike's brainstorm plan (PLANS/2026-05-11) identified the rose-tree graph model + port encapsulation (kernels 1+2) as the foundation everything else depends on. The graph types (`TreeNode`, `Edge`, `Port`) and pure tree operations (`findNode`, `updateNodeInTree`, etc.) lived inside `src/ui/workspace.ts` — a 1385-line file mixing graph semantics with UI state management. The interchange format types in `src/graph/types.ts` were unused.

This extraction created `packages/graph/` as a standalone, zero-dependency Deno workspace package — the first step toward the modular architecture described in the brainstorm.

## Goal

A publishable `@marlinspike/graph` package containing:
- Rose-tree types (`TreeNode`, `Edge`, `Port`) and pure operations (traversal, mutation, query)
- A general `walk` function as the integration point for codecs, constraints, layout, and other plugins
- Scope-aware edge queries (enforcing the sibling-scoped communication invariant)
- Flat serialization (`FlatNode`, `flattenTree`, `buildTree`) for any persistence backend
- Interchange format types (from `src/graph/types.ts`) for serialization targets
- README documenting the data model, core invariants, and API
- Interactive demo stories under `/stories` showing the package in action
- Full test coverage
- All existing consumers updated to import from the package

The package works equally well in browser (current web IDE), CLI, server-side, and test contexts. Zero runtime dependencies.

## Design Decisions

### Integration surface for future packages

The graph package is primarily a data-structure library. Its integration surface for codecs, constraints, layout, etc. is:

1. **Types** — `TreeNode`, `Edge`, `Port` are the lingua franca. Every downstream package works with these.
2. **Traversal** — Specific functions (`findNode`, `findPath`, etc.) for common operations + a general `walk` function for plugin traversal patterns.
3. **Scope queries** — `edgesInScope(parent, edges)` returns edges between a node's children, enforcing the core invariant that communication is sibling-scoped. This is what codecs need when emitting a subgraph, what constraints need when validating edge rules, and what layout needs to know what's connected at each level.
4. **Mutation** — Immutable tree transforms (`updateNodeInTree`, `removeNodeFromTree`) that any consumer can use.
5. **Flatten/Build** — Serialization to/from flat rows. Persistence-agnostic — works with SurrealDB, SQLite, IndexedDB, JSON files, etc.

Things the graph package deliberately does NOT include:
- Constraint evaluation (judgment system kernel)
- Code↔graph codecs (codec kernel)
- Layout algorithms (layout kernel)
- Persistence operations (internal module)
- Any DOM, UI, or runtime-specific concerns

### Edge naming

Runtime `Edge` (with `fromId`/`toId`) keeps the unqualified name. Interchange `Edge` (with `from: EdgeEndpoint`/`to: EdgeEndpoint`) is exported as `InterchangeEdge`. Same pattern for `Node` → `InterchangeNode`.

### Re-exports for backward compatibility

`src/ui/workspace.ts` will re-export graph types from `@marlinspike/graph`. This means all existing consumers continue to work. Direct consumers (like `spike-clojure.ts`) get updated to import from `@marlinspike/graph` directly.

## Approach

### Phase A: Create the package (no breaking changes)

- [x] **A1. Set up Deno workspace** — Add `"workspace": ["packages/graph"]` to root `deno.json`. Create `packages/graph/deno.json` with `"name": "@marlinspike/graph"`, `"version": "0.1.0"`, `"exports": "./mod.ts"`. Update root `fmt.include`, `ci` task, and `check` task to cover `packages/`. Note: the directory is `packages/graph/` but the published name is scoped as `@marlinspike/graph` (JSR) / `marlinspike-graph` (npm) to avoid generic name collisions.
- [x] **A2. Create `packages/graph/tree/types.ts`** — Extract from `src/ui/workspace.ts`: `Port` (L116-120), `TreeNode` (L122-135), `Edge` (L142-149), `isRef` (L138-140).
- [x] **A3. Create `packages/graph/tree/traverse.ts`** — Extract: `findNode` (L372), `findParentOf` (L381), `findSiblings` (L390), `findPath` (L457), `collectSubtreeIds` (L405). Add new: `walk(nodes, visitor)` — depth-first traversal with `enter`/`leave` callbacks and optional early exit.
- [x] **A4. Create `packages/graph/tree/mutate.ts`** — Extract: `updateNodeInTree` (L1331), `removeNodeFromTree` (L1342).
- [x] **A5. Create `packages/graph/tree/query.ts`** — Extract: `getEdgesIn` (L397), `getEdgesOut` (L401), `nodeHash` (L364). Add new: `edgesInScope(parent, edges)` — returns edges where both endpoints are children of `parent`, encoding the sibling-scoped communication invariant.
- [x] **A6. Create `packages/graph/tree/factory.ts`** — Extract: `makeNode` (L507), `makeRefNode` (L518), `makeRootNode` (L200).
- [x] **A7. Create `packages/graph/tree/flatten.ts`** — Extract from `src/ui/db/operations.ts`: `FlatNode` (L26-37), `flattenTree` (L62-82), `buildTree` (L85-114).
- [x] **A8. Create `packages/graph/interchange/types.ts`** — Move contents of `src/graph/types.ts`.
- [x] **A9. Create `packages/graph/mod.ts`** — Barrel exports with clear sections (types, traversal, mutation, query, factory, flatten, interchange).
- [x] **A10. Create `packages/graph/README.md`** — Document the data model (rose-tree + ports + sibling-scoped edges), core invariants, API overview, and usage examples. Target audience: someone using the package standalone, not just Marlinspike contributors.
- [x] **A11. Verify** — `NO_COLOR=1 deno check packages/graph/mod.ts`

### Phase B: Tests

- [x] **B1. `packages/graph/tree/traverse_test.ts`** — findNode (root/nested/missing), findParentOf, findSiblings, findPath, collectSubtreeIds. walk: depth-first order, early exit, enter/leave callbacks.
- [x] **B2. `packages/graph/tree/mutate_test.ts`** — updateNodeInTree (nested update, missing node), removeNodeFromTree (leaf, composite→leaf demotion).
- [x] **B3. `packages/graph/tree/query_test.ts`** — getEdgesIn, getEdgesOut, nodeHash determinism. edgesInScope: returns only sibling-to-sibling edges, excludes cross-scope edges.
- [x] **B4. `packages/graph/tree/factory_test.ts`** — makeNode, makeRefNode (type="ref", kind="composite"), makeRootNode (default label).
- [x] **B5. `packages/graph/tree/flatten_test.ts`** — flattenTree/buildTree round-trip (mirror existing tests from `operations_test.ts`).
- [x] **B6. Verify** — `NO_COLOR=1 deno test packages/graph/`

### Phase C: Wire up consumers

- [x] **C1. Refactor `src/ui/workspace.ts`** — Remove extracted type definitions and function bodies. Replace with imports from `@marlinspike/graph` and re-exports for backward compatibility. File should drop ~285 lines.
- [x] **C2. Refactor `src/ui/db/operations.ts`** — Remove `FlatNode`, `flattenTree`, `buildTree`. Import and re-export from `@marlinspike/graph`.
- [x] **C3. Delete `src/graph/types.ts`** — Now lives in `packages/graph/interchange/types.ts`.
- [x] **C4. Update direct consumers** — Where files import graph types/functions from `../ui/workspace.ts`, update to import from `@marlinspike/graph` directly. Key files:
  - `src/code/spike-clojure.ts` — `TreeNode`, `Edge`, `Port`
  - `src/code/spike-clojure-fixtures.ts` — `TreeNode`, `Edge`, `Port`
  - `src/code/workspace-codec.ts` — `TreeNode`, `Edge`, `findNode`, `updateNodeInTree` (also imports `WorkspaceState` which stays)
  - `src/ui/lib/port-layout.ts` — `isRef`, `Port`, `TreeNode`
  - `src/ui/components/canvas.tsx` — `collectSubtreeIds`, `findNode`, `findParentOf`, `findPath`
  - `src/ui/components/code-panel.tsx` — `findNode`, `findParentOf`, `updateNodeInTree`
  - `src/ui/components/focus-dropdown.tsx` — `collectSubtreeIds`, `findNode`, `findPath`
  - `src/ui/components/constraints-panel.tsx` — `findNode`
  - `src/ui/client.tsx` — `collectSubtreeIds`, `findNode`, `removeNodeFromTree`, `updateNodeInTree`
  - `src/graph/validate_workspace.ts` — `findNode` (also imports workspace-specific types which stay)
- [x] **C5. Full CI** — `NO_COLOR=1 deno task ci`

### Phase D: Demo stories

- [x] **D1. Create `src/ui/stories/graph-package.stories.tsx`** — Interactive demos under the existing `/stories` route. Four stories: TreeStructure (walk output), TraversalQueries (findNode/findPath/edgesInScope), MutationDemo (interactive rename/remove/reset with nodeHash), FlattenRoundTrip (flatten→build visualization).
- [x] **D2. Register in `src/ui/stories/index.ts`** — Added `GraphPackageStories` export.
- [x] **D3. Fix Hono JSX DOM styles** — Hono uses CSS strings for `style=`, not React-style objects. Rewrote all styles as string constants.

### Phase E: CI

- [x] **E1. Update `.github/workflows/ci.yml`** — Add a step for the graph package. Either a separate job or additional steps in the existing `ci` job:
  - `deno check packages/graph/mod.ts` (type-check the package standalone)
  - `deno test packages/graph/` (run package tests)
  - The existing `deno fmt --check`, `deno lint`, and `deno test --allow-read` steps should already cover `packages/` since they run at root level, but verify the globs include the new directory.
- [x] **E2. Update the `Type check` step** — Add `packages/graph/mod.ts` to the existing `deno check` command.

## Package Structure

```
packages/graph/
  deno.json              # @marlinspike/graph, version 0.1.0
  mod.ts                 # Barrel exports
  README.md              # Data model, invariants, API docs
  tree/
    types.ts             # TreeNode, Edge, Port, isRef
    traverse.ts          # findNode, findParentOf, findSiblings, findPath, collectSubtreeIds, walk
    mutate.ts            # updateNodeInTree, removeNodeFromTree
    query.ts             # getEdgesIn, getEdgesOut, nodeHash, edgesInScope
    factory.ts           # makeNode, makeRefNode, makeRootNode
    flatten.ts           # FlatNode, flattenTree, buildTree
    traverse_test.ts
    mutate_test.ts
    query_test.ts
    factory_test.ts
    flatten_test.ts
  interchange/
    types.ts             # Node, Edge, Graph, etc. (serialization format from DESIGN.md §4.3)

Demo stories: src/ui/stories/graph-package.stories.tsx
```

## What stays in `src/ui/workspace.ts`

- All UI types: `WorkspaceState`, `Panel`, `Tab`, `Selection`, `Constraint`, `ConstraintApplication`, `Profile`, `ConnectedGraph`, `PanelType`, `ListEditorConfig`, `Updater`, etc.
- Workspace-specific helpers: `ensureWorkspaceRoot`, `ensureProfileRoot`, `ensureWorkspaceConstraint`, `getWorkspaceRoot`, `getWorkspaceRootId`, `getActiveTab`, `getFocusedRootNodes`, `validateFocusForWorkspace`, `subgraphJson`, `getConnectionConfig`
- State mutation wrappers: `withPanel`, `withNodeMutation`, `withConstraintMutation`, `withApplicationMutation`, `getAppliedEntityIds`, `getConstraintsForEntity`
- Default/factory functions: `defaultState`, `freshProfileState`, `storyState`, `defaultPanel`, `defaultConstraintsPanel`, `defaultCodePanel`, `defaultTreeNodes`
- Persistence: `loadState`, `loadStateAsync`, `loadProfileState`, `migrateToSurreal`, `saveState`
- Re-exports from `@marlinspike/graph` for backward compat

## New functions

### `walk(nodes, visitor)` — General tree traversal

```typescript
interface WalkVisitor {
  enter?: (node: TreeNode, parent: TreeNode | null, depth: number) => boolean | void;
  leave?: (node: TreeNode, parent: TreeNode | null, depth: number) => void;
}

/** Depth-first walk of the rose-tree. Return false from enter to skip children. */
function walk(nodes: TreeNode[], visitor: WalkVisitor): void;
```

This is the primary integration point for plugins. Codecs use it to emit nodes in order. Constraints use it to validate each node in context. Layout uses it to process the tree bottom-up (via `leave`).

### `edgesInScope(parent, edges)` — Sibling-scoped edges

```typescript
/** Return edges where both endpoints are direct children of parent. */
function edgesInScope(parent: TreeNode, edges: Edge[]): Edge[];
```

Encodes the core invariant: communication is sibling-scoped. The codec already does this inline in `workspace-codec.ts`. The constraint system needs it for edge validation. Layout needs it to know connections at each containment level.

## Open Questions

- Should `nodeHash` go in the package or stay in workspace? It's a pure function over `TreeNode`. **Decision: extract it** — it's useful for change detection in any context.

## Verification

- [x] `NO_COLOR=1 deno check packages/graph/mod.ts` — package type-checks standalone
- [x] `NO_COLOR=1 deno test packages/graph/` — all package tests pass (46 tests)
- [x] `NO_COLOR=1 deno task ci` — full CI (fmt, lint, check, test) passes (455 tests)
- [x] `src/graph/types.ts` deleted — no orphaned file
- [x] `workspace.ts` re-exports graph types — no consumer breakage
- [x] No circular dependencies between `packages/graph/` and `src/`
- [x] README accurately describes the data model and API
- [x] Package demo stories render under `/stories`
