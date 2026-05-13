/**
 * Flat representation of the rose-tree for persistence.
 *
 * Converts between recursive TreeNode[] and flat FlatNode[] rows with parent
 * links. Works with any storage backend — SurrealDB, SQLite, IndexedDB, JSON.
 */

import type { Port, TreeNode } from "./types.ts";

/** A flattened node row — no nested children, uses a parent link instead. */
export interface FlatNode {
  id: string;
  label: string;
  uri?: string;
  type?: "ref";
  ref?: string;
  kind: "leaf" | "composite";
  parent: string | null; // record id string or null for roots
  ports?: Port[];
  data: Record<string, unknown>;
  version: number;
}

/** Flatten a recursive TreeNode[] into flat rows with parent links. */
export function flattenTree(nodes: TreeNode[], parentId: string | null = null): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      label: node.label,
      ...(node.uri !== undefined ? { uri: node.uri } : {}),
      ...(node.type ? { type: node.type } : {}),
      ...(node.ref ? { ref: node.ref } : {}),
      kind: node.kind,
      parent: parentId,
      ...(node.ports !== undefined ? { ports: node.ports } : {}),
      data: node.data,
      version: node.version,
    });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, node.id));
    }
  }
  return result;
}

/** Reconstruct recursive TreeNode[] from flat rows. */
export function buildTree(flat: FlatNode[]): TreeNode[] {
  const childrenOf = new Map<string | null, FlatNode[]>();
  for (const row of flat) {
    // Normalise parent: null/undefined/empty → null (root node)
    const key = row.parent || null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(row);
  }

  function build(parentId: string | null): TreeNode[] {
    const rows = childrenOf.get(parentId) ?? [];
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      ...(row.uri !== undefined ? { uri: row.uri } : {}),
      ...(row.type ? { type: row.type } : {}),
      ...(row.ref ? { ref: row.ref } : {}),
      kind: row.kind,
      children: build(row.id),
      ...(row.ports !== undefined ? { ports: row.ports } : {}),
      data: row.data,
      version: row.version,
    }));
  }

  return build(null);
}
