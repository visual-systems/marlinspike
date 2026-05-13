/**
 * Immutable tree mutation functions.
 *
 * All functions return new trees — the original is never modified.
 */

import type { TreeNode } from "./types.ts";

/** Update a single node in the tree by ID, preserving the rest of the structure. */
export function updateNodeInTree(
  nodes: TreeNode[],
  nodeId: string,
  fn: (n: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === nodeId) return fn(n);
    return { ...n, children: updateNodeInTree(n.children, nodeId, fn) };
  });
}

/**
 * Remove a node from the tree by ID.
 * If removing a node's last child, the parent's kind is demoted to "leaf".
 */
export function removeNodeFromTree(nodes: TreeNode[], nodeId: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => {
      const children = removeNodeFromTree(n.children, nodeId);
      const kind = children.length === 0 ? "leaf" as const : n.kind;
      return { ...n, children, kind };
    });
}
