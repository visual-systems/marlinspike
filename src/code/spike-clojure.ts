/**
 * Spike-Clojure: bidirectional serialisation between the graph data model and
 * Spike-Clojure source text.
 *
 * Built on top of `src/graph/base_lisp.ts` (the S-expression reader).
 * This module covers the semantic layer: mapping Clojure forms to graph concepts.
 *
 * Supported forms (initial scaffold — `def` only):
 *   (def name [child ...])  — structural container; children are node references
 *
 * Edges are emitted as line comments and are not parsed back (round-trip for
 * structural containment only in this version).
 */

import type { Edge, TreeNode } from "../ui/workspace.ts";
import { parse } from "../graph/base_lisp.ts";

// ---------------------------------------------------------------------------
// graphToSpike
// ---------------------------------------------------------------------------

/**
 * Serialise a list of root nodes (and their subtrees) plus edges to
 * Spike-Clojure text.
 *
 * Composite nodes become `(def label [children...])` forms, emitted
 * depth-first so child definitions precede their parents (matching the
 * idiomatic Clojure style of defining things before use).
 *
 * Standalone root-level leaf nodes are emitted as line comments — they have
 * no `def` form in isolation.
 *
 * Edges are emitted as `; edge:` line comments at the end of the output.
 */
export function graphToSpike(nodes: TreeNode[], edges: Edge[]): string {
  const lines: string[] = [];
  const emitted = new Set<string>();

  function emitNode(node: TreeNode): void {
    if (emitted.has(node.id)) return;
    emitted.add(node.id);
    // Depth-first: emit composite children before this node
    for (const child of node.children) {
      if (child.kind === "composite") emitNode(child);
    }
    if (node.kind === "composite") {
      const refs = node.children.map((c) => c.label).join(" ");
      lines.push(`(def ${node.label} [${refs}])`);
    }
  }

  for (const node of nodes) {
    if (node.kind === "composite") {
      emitNode(node);
    } else {
      lines.push(`; ${node.label}`);
    }
    lines.push("");
  }

  if (edges.length > 0) {
    lines.push("; edges:");
    for (const edge of edges) {
      const label = edge.label ? ` (${edge.label})` : "";
      lines.push(`; ${edge.fromId} -> ${edge.toId}${label}`);
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// spikeToGraph
// ---------------------------------------------------------------------------

/**
 * Parse Spike-Clojure source text into a list of root `TreeNode`s.
 *
 * Each `(def name [child ...])` form becomes a composite node; any child
 * symbol that has no corresponding `def` becomes a leaf node.  Root nodes
 * are those defined by a `def` but not referenced as a child of another.
 *
 * Returns `{ treeNodes, errors }`.  On parse failure `treeNodes` is empty
 * and `errors` contains the problem descriptions.
 */
export function spikeToGraph(
  src: string,
): { treeNodes: TreeNode[]; errors: string[] } {
  const errors: string[] = [];

  let forms;
  try {
    forms = parse(src);
  } catch (e) {
    return { treeNodes: [], errors: [String(e)] };
  }

  // First pass: collect def forms → name → child name list
  const defs = new Map<string, string[]>();
  for (const form of forms) {
    if (form.type !== "list" || form.items.length < 3) continue;
    const [head, nameForm, bodyForm] = form.items;
    if (
      head.type !== "symbol" || head.value !== "def" ||
      nameForm.type !== "symbol"
    ) continue;
    const childNames: string[] = [];
    if (bodyForm.type === "vector") {
      for (const item of bodyForm.items) {
        if (item.type === "symbol") childNames.push(item.value);
      }
    }
    defs.set(nameForm.value, childNames);
  }

  if (defs.size === 0 && errors.length === 0) {
    // Nothing parseable — return empty without error (e.g. blank/comment-only input)
    return { treeNodes: [], errors: [] };
  }

  // Second pass: build TreeNode tree, creating implicit leaf nodes as needed
  const built = new Map<string, TreeNode>();

  function makeNode(name: string, visited: Set<string>): TreeNode {
    if (built.has(name)) return built.get(name)!;
    if (visited.has(name)) {
      errors.push(`Cycle detected at "${name}"`);
      const stub: TreeNode = {
        id: name,
        label: name,
        kind: "leaf",
        children: [],
        data: {},
        version: 1,
      };
      built.set(name, stub);
      return stub;
    }
    visited.add(name);
    const childNames = defs.get(name) ?? [];
    const children = childNames.map((n) => makeNode(n, new Set(visited)));
    const node: TreeNode = {
      id: name,
      label: name,
      kind: children.length > 0 ? "composite" : "leaf",
      children,
      data: {},
      version: 1,
    };
    built.set(name, node);
    return node;
  }

  for (const name of defs.keys()) makeNode(name, new Set());

  // Root nodes: defined by a `def` but not referenced as a child of any other `def`
  const allChildNames = new Set<string>();
  for (const children of defs.values()) {
    for (const c of children) allChildNames.add(c);
  }
  const treeNodes = [...defs.keys()]
    .filter((name) => !allChildNames.has(name))
    .map((name) => built.get(name)!);

  return { treeNodes, errors };
}
