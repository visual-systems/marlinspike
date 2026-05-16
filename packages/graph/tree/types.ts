/**
 * Core rose-tree graph types.
 *
 * A graph is a rose-tree of nodes where each node is either a leaf (no children)
 * or a composite (contains children). Edges connect siblings — never across
 * containment boundaries. Ports declare the I/O contract at containment boundaries.
 */

/** Typed I/O port on a node boundary. */
export interface Port {
  name: string;
  direction: "in" | "out" | "inout";
  type?: string; // schema type identifier, e.g. "float", "io.http.request-response"
}

/** A node in the rose-tree graph. */
export interface TreeNode {
  id: string;
  label: string;
  uri?: string;
  /** Node type discriminator. Absent or "standard" = regular node. "ref" = reference node. */
  type?: "ref";
  /** Target entity ID, label, or spike://UUID for reference nodes. */
  ref?: string;
  kind: "leaf" | "composite";
  children: TreeNode[];
  ports?: Port[]; // declared input/output ports; absent = no port contract
  data: Record<string, unknown>;
  version: number;
}

/** Type guard: is this node a reference? */
export function isRef(node: TreeNode): boolean {
  return node.type === "ref";
}

/** A directed edge between sibling nodes. */
export interface Edge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  data: Record<string, unknown>;
  version: number;
}
