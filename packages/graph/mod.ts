/**
 * @marlinspike/graph — Rose-tree graph with typed ports
 *
 * A standalone data-structure library for hierarchical graphs where:
 * - Containment is recursive (rose-tree)
 * - Communication is sibling-scoped (edges only connect siblings)
 * - Ports declare I/O contracts at containment boundaries
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type { Edge, Port, TreeNode } from "./tree/types.ts";
export { isRef } from "./tree/types.ts";

// ---------------------------------------------------------------------------
// Tree traversal
// ---------------------------------------------------------------------------

export {
  collectSubtreeIds,
  findNode,
  findParentOf,
  findPath,
  findSiblings,
  walk,
} from "./tree/traverse.ts";
export type { WalkVisitor } from "./tree/traverse.ts";

// ---------------------------------------------------------------------------
// Tree mutation (immutable)
// ---------------------------------------------------------------------------

export { removeNodeFromTree, updateNodeInTree } from "./tree/mutate.ts";

// ---------------------------------------------------------------------------
// Edge & node queries
// ---------------------------------------------------------------------------

export { edgesInScope, getEdgesIn, getEdgesOut, nodeHash } from "./tree/query.ts";

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

export { makeNode, makeRefNode, makeRootNode } from "./tree/factory.ts";

// ---------------------------------------------------------------------------
// Flat representation (for persistence)
// ---------------------------------------------------------------------------

export type { FlatNode } from "./tree/flatten.ts";
export { buildTree, flattenTree } from "./tree/flatten.ts";

// ---------------------------------------------------------------------------
// Interchange format (serialization target — see DESIGN.md §4.3)
// ---------------------------------------------------------------------------

export type {
  Direction,
  Edge as InterchangeEdge,
  EdgeEndpoint,
  Graph,
  GraphMeta,
  Node as InterchangeNode,
  NodeImplementation,
  NodeKind,
} from "./interchange/types.ts";
