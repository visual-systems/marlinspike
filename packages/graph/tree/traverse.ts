/**
 * Tree traversal functions for the rose-tree graph.
 */

import type { TreeNode } from "./types.ts";

/** Find a node by ID anywhere in the tree (depth-first). */
export function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return undefined;
}

/** Find the parent of a node by ID. Returns null if the node is at the root level. */
export function findParentOf(nodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const n of nodes) {
    if (n.children.some((c) => c.id === nodeId)) return n;
    const f = findParentOf(n.children, nodeId);
    if (f) return f;
  }
  return null;
}

/** Find sibling nodes (nodes sharing the same parent, excluding the target). */
export function findSiblings(treeNodes: TreeNode[], nodeId: string): TreeNode[] {
  const parent = findParentOf(treeNodes, nodeId);
  return parent
    ? parent.children.filter((c) => c.id !== nodeId)
    : treeNodes.filter((n) => n.id !== nodeId);
}

/** Returns the path from root to targetId inclusive, or [] if not found. */
export function findPath(nodes: TreeNode[], targetId: string): TreeNode[] {
  for (const n of nodes) {
    if (n.id === targetId) return [n];
    const child = findPath(n.children, targetId);
    if (child.length > 0) return [n, ...child];
  }
  return [];
}

/** Recursively collect all node IDs in a subtree (including the root). */
export function collectSubtreeIds(node: TreeNode): Set<string> {
  const ids = new Set<string>();
  const visit = (n: TreeNode): void => {
    ids.add(n.id);
    for (const c of n.children) visit(c);
  };
  visit(node);
  return ids;
}

// ---------------------------------------------------------------------------
// General-purpose walk
// ---------------------------------------------------------------------------

/** Visitor callbacks for tree walking. */
export interface WalkVisitor {
  /** Called when entering a node. Return false to skip its children. */
  enter?: (node: TreeNode, parent: TreeNode | null, depth: number) => boolean | void;
  /** Called when leaving a node (after all children have been visited). */
  leave?: (node: TreeNode, parent: TreeNode | null, depth: number) => void;
}

/**
 * Depth-first walk of the rose-tree.
 *
 * This is the primary integration point for plugins — codecs use it to emit
 * nodes in order, constraints use it to validate each node in context, and
 * layout uses it to process the tree bottom-up (via `leave`).
 */
export function walk(nodes: TreeNode[], visitor: WalkVisitor): void {
  function visit(node: TreeNode, parent: TreeNode | null, depth: number): void {
    const descend = visitor.enter?.(node, parent, depth);
    if (descend !== false) {
      for (const child of node.children) {
        visit(child, node, depth + 1);
      }
    }
    visitor.leave?.(node, parent, depth);
  }
  for (const node of nodes) {
    visit(node, null, 0);
  }
}
