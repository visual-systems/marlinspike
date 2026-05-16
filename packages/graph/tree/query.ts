/**
 * Edge and node query functions.
 */

import type { Edge, TreeNode } from "./types.ts";

/** All edges pointing to a given node. */
export function getEdgesIn(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.toId === nodeId);
}

/** All edges originating from a given node. */
export function getEdgesOut(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.fromId === nodeId);
}

/**
 * Edges in scope — edges where both endpoints are direct children of `parent`.
 *
 * This encodes the core graph invariant: communication is sibling-scoped.
 * Edges never cross containment boundaries.
 */
export function edgesInScope(parent: TreeNode, edges: Edge[]): Edge[] {
  const childIds = new Set(parent.children.map((c) => c.id));
  return edges.filter((e) => childIds.has(e.fromId) && childIds.has(e.toId));
}

/**
 * Compute a lightweight hash of a node's immediate properties.
 * Useful for change detection without deep comparison.
 */
export function nodeHash(node: TreeNode): string {
  const s = node.label + node.kind + (node.type ?? "") + (node.ref ?? "") +
    JSON.stringify(node.data) + node.children.map((c) => c.id).join("");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}
