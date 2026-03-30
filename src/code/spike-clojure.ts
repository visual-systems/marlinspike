/**
 * Spike-Clojure: bidirectional serialisation between the graph data model and
 * Spike-Clojure source text.
 *
 * Built on top of `src/graph/base_lisp.ts` (the S-expression reader).
 * This module covers the semantic layer: mapping Clojure forms to graph concepts.
 *
 * Supported forms:
 *   (def name [child ...])           — structural container; no edges
 *   (defn name [] (let [...] body))  — dataflow container; edges encoded as
 *                                      let-binding data flow
 *
 * Encoding heuristic (emitter):
 *   A composite node with no edges among its children → def form.
 *   A composite node with edges among its children → defn + let form.
 *
 * The emitter uses direct name references (node labels). The parser maps
 * names back to IDs (currently id === label). This means labels must be
 * unique within a scope for round-trips to preserve identity.
 *
 * Known shortcomings (see PLANS file):
 *   - Root-level leaf nodes cannot be parsed back (emitted as comments).
 *   - IDs are assumed to equal labels; label changes break identity.
 *   - Edges across different root composites are not supported.
 *   - defn parameter lists and port types are not yet handled.
 */

import type { Edge, TreeNode } from "../ui/workspace.ts";
import type { SExp } from "../graph/base_lisp.ts";
import { parse } from "../graph/base_lisp.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Kahn's topological sort. Returns IDs in dependency order. */
function topoSort(ids: string[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (inDegree.has(e.fromId) && inDegree.has(e.toId)) {
      inDegree.set(e.toId, inDegree.get(e.toId)! + 1);
      adj.get(e.fromId)!.push(e.toId);
    }
  }
  const queue = ids.filter((id) => inDegree.get(id) === 0);
  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = inDegree.get(next)! - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return result;
}

/**
 * Emit a composite node that has edges among its children as a defn + let form.
 *
 * The algorithm:
 *   1. Topological sort of children.
 *   2. Build let bindings for all nodes except the single terminal (if any).
 *   3. Inline the terminal node call as the return expression.
 *   4. If multiple terminals, collect them in a map return.
 */
function emitDefnForm(container: TreeNode, edges: Edge[]): string {
  const nodes = container.children;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Binding name: lowercase of label, safe for use as a Clojure symbol
  const binding = (id: string) => nodeById.get(id)!.label.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const sorted = topoSort(
    nodes.map((n) => n.id),
    edges,
  );
  const sourceIds = new Set(edges.map((e) => e.fromId));

  // Terminal nodes: no outgoing edges within this composite
  const terminalIds = sorted.filter((id) => !sourceIds.has(id));

  // For each node, collect incoming arg binding names in edge order
  const incomingArgs = new Map<string, string[]>();
  for (const id of sorted) incomingArgs.set(id, []);
  for (const e of edges) {
    incomingArgs.get(e.toId)?.push(binding(e.fromId));
  }

  function callExpr(id: string): string {
    const label = nodeById.get(id)!.label;
    const args = incomingArgs.get(id) ?? [];
    return args.length > 0 ? `(${label} ${args.join(" ")})` : `(${label})`;
  }

  // Let bindings: all nodes except a single terminal (inlined in return).
  // When there are multiple terminals, all nodes stay in let and the return
  // collects terminal binding names into a map.
  const letIds = terminalIds.length === 1 ? sorted.filter((id) => id !== terminalIds[0]) : sorted;

  // Return expression
  const returnExpr = terminalIds.length === 1
    ? callExpr(terminalIds[0])
    : `{${terminalIds.map((id) => `:${nodeById.get(id)!.label} ${binding(id)}`).join(" ")}}`;

  if (letIds.length === 0) {
    return `(defn ${container.label} []\n  ${returnExpr})`;
  }

  // Format let bindings: first on same line as `[`, rest indented to align
  const bindingLines = letIds.map((id) => {
    const bname = binding(id);
    // Only non-input nodes have incoming args from within the composite;
    // input nodes (no incoming edges) are called with no args
    return `${bname} ${callExpr(id)}`;
  });

  const indent = " ".repeat(8); // aligns under first binding name after `  (let [`
  const letBlock = bindingLines
    .map((b, i) => (i === 0 ? `[${b}` : `${indent}${b}`))
    .join("\n") + "]";

  return `(defn ${container.label} []\n  (let ${letBlock}\n    ${returnExpr}))`;
}

// ---------------------------------------------------------------------------
// graphToSpike
// ---------------------------------------------------------------------------

/**
 * Serialise a list of root nodes (and their subtrees) plus edges to
 * Spike-Clojure text.
 *
 * Composite nodes with edges among their children are emitted as
 * `(defn name [] (let [...] body))` forms encoding the dataflow topology.
 * Composite nodes with no such edges are emitted as `(def name [children...])`.
 *
 * Root-level leaf nodes are emitted as line comments — round-trip lossy.
 * Edges between nodes that are not co-children of a composite are not
 * encoded (noted as a known shortcoming).
 */
export function graphToSpike(nodes: TreeNode[], edges: Edge[]): string {
  const lines: string[] = [];
  const emitted = new Set<string>();

  function emitNode(node: TreeNode): void {
    if (emitted.has(node.id)) return;
    emitted.add(node.id);

    if (node.kind === "leaf") {
      lines.push(`; ${node.label}`);
      return;
    }

    // Determine which edges are local to this node's direct children
    const childIds = new Set(node.children.map((c) => c.id));
    const localEdges = edges.filter(
      (e) => childIds.has(e.fromId) && childIds.has(e.toId),
    );

    // Emit composite children first (depth-first), each separated by a blank line
    for (const child of node.children) {
      if (child.kind === "composite") {
        emitNode(child);
        lines.push("");
      }
    }

    if (localEdges.length > 0) {
      lines.push(emitDefnForm(node, localEdges));
    } else {
      const refs = node.children.map((c) => c.label).join(" ");
      lines.push(`(def ${node.label} [${refs}])`);
    }
  }

  for (const node of nodes) {
    emitNode(node);
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// spikeToGraph
// ---------------------------------------------------------------------------

/**
 * Parse Spike-Clojure source text into root `TreeNode`s and `Edge`s.
 *
 * Supported forms:
 *   (def name [child ...])
 *     → composite node; children are node references (leaf if not defined)
 *
 *   (defn name [] (let [binding call ...] body))
 *     → composite node; children inferred from let bindings and body call;
 *       edges inferred from which bindings are passed as arguments
 *
 * Returns `{ treeNodes, edges, errors }`.
 */
export function spikeToGraph(
  src: string,
): { treeNodes: TreeNode[]; edges: Edge[]; errors: string[] } {
  const errors: string[] = [];

  let forms;
  try {
    forms = parse(src);
  } catch (e) {
    return { treeNodes: [], edges: [], errors: [String(e)] };
  }

  // Collect def and defn forms
  const defs = new Map<string, string[]>(); // name → child label list
  const defns = new Map<
    string,
    { nodes: string[]; edges: Array<{ from: string; to: string }> }
  >();

  for (const form of forms) {
    if (form.type !== "list" || form.items.length < 3) continue;
    const [head, nameForm] = form.items;
    if (head.type !== "symbol" || nameForm.type !== "symbol") continue;
    const name = nameForm.value;

    if (head.value === "def") {
      // (def name [child ...])
      const bodyForm = form.items[2];
      const childNames: string[] = [];
      if (bodyForm.type === "vector") {
        for (const item of bodyForm.items) {
          if (item.type === "symbol") childNames.push(item.value);
        }
      }
      defs.set(name, childNames);
    } else if (head.value === "defn") {
      // (defn name [params] (let [...] body))
      // Also handles attr-map position: (defn name {:ports ...} [params] body)
      const rest = form.items.slice(2);

      // Extract param names from the first vector, stripping ^Type hints
      const paramVec = rest.find((f) => f.type === "vector");
      const paramNames: string[] = [];
      if (paramVec && paramVec.type === "vector") {
        for (const item of paramVec.items) {
          if (item.type === "symbol" && !item.value.startsWith("^")) {
            paramNames.push(item.value);
          }
        }
      }

      // Find let form, or fall back to a direct body call/map
      const letForm = rest.find(
        (f) =>
          f.type === "list" &&
          f.items[0]?.type === "symbol" &&
          f.items[0].value === "let",
      );

      let letParts: SExp[];
      if (letForm && letForm.type === "list") {
        letParts = letForm.items.slice(1); // [bindingVec, body]
      } else {
        // No let — find the body expression (any list or map after the param vec)
        const bodyForm = rest.find((f) => f.type === "list" || f.type === "map");
        if (!bodyForm) continue;
        letParts = [{ type: "vector", items: [] }, bodyForm];
      }

      const result = parseLetForm(letParts, paramNames);
      if (result.errors.length > 0) errors.push(...result.errors);
      defns.set(name, result);
    }
  }

  if (defs.size === 0 && defns.size === 0 && errors.length === 0) {
    return { treeNodes: [], edges: [], errors: [] };
  }

  // Build TreeNodes from def forms
  const builtDef = new Map<string, TreeNode>();

  function makeDefNode(name: string, visited: Set<string>): TreeNode {
    if (builtDef.has(name)) return builtDef.get(name)!;
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
      builtDef.set(name, stub);
      return stub;
    }
    visited.add(name);
    const childNames = defs.get(name) ?? [];
    const children = childNames.map((n) => makeDefNode(n, new Set(visited)));
    const node: TreeNode = {
      id: name,
      label: name,
      kind: children.length > 0 ? "composite" : "leaf",
      children,
      data: {},
      version: 1,
    };
    builtDef.set(name, node);
    return node;
  }

  for (const name of defs.keys()) makeDefNode(name, new Set());

  // Build TreeNodes from defn forms
  const builtDefn = new Map<string, TreeNode>();
  const allEdges: Edge[] = [];

  for (const [name, { nodes: childLabels, edges: rawEdges }] of defns) {
    const children: TreeNode[] = childLabels.map((label) => ({
      id: label,
      label,
      kind: "leaf" as const,
      children: [],
      data: {},
      version: 1,
    }));
    builtDefn.set(name, {
      id: name,
      label: name,
      kind: "composite",
      children,
      data: {},
      version: 1,
    });
    for (const { from, to } of rawEdges) {
      allEdges.push({
        id: `${from}-${to}`,
        fromId: from,
        toId: to,
        label: "",
        data: {},
        version: 1,
      });
    }
  }

  // Root nodes: defined but not referenced as a child of any other def/defn
  const allChildLabels = new Set<string>();
  for (const children of defs.values()) {
    for (const c of children) allChildLabels.add(c);
  }
  for (const { nodes } of defns.values()) {
    for (const n of nodes) allChildLabels.add(n);
  }

  const defRoots = [...defs.keys()]
    .filter((name) => !allChildLabels.has(name) && !defns.has(name))
    .map((name) => builtDef.get(name)!);
  const defnRoots = [...defns.keys()]
    .filter((name) => !allChildLabels.has(name))
    .map((name) => builtDefn.get(name)!);

  return {
    treeNodes: [...defRoots, ...defnRoots],
    edges: allEdges,
    errors,
  };
}

/**
 * Parse a `let` form's binding vector and body into nodes and edges.
 *
 * Binding vector: [binding1 call1 binding2 call2 ...]
 * Body: the expression after the binding vector
 *
 * Returns node labels and edges (from-label → to-label).
 */
function parseLetForm(
  letParts: SExp[],
  paramNames: string[] = [],
): { nodes: string[]; edges: Array<{ from: string; to: string }>; errors: string[] } {
  const errors: string[] = [];
  const nodeLabels = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];

  if (letParts.length < 1 || letParts[0].type !== "vector") {
    errors.push("let: expected binding vector");
    return { nodes: [], edges: [], errors };
  }

  const bindingVec = letParts[0].items;
  const body = letParts[1]; // may be undefined for empty let

  // bindingVec alternates: [name sexp name sexp ...]
  // binding name → node label that produced this value
  const bindingToLabel = new Map<string, string>();

  // Seed with defn params — each becomes a leaf input node
  for (const p of paramNames) {
    nodeLabels.add(p);
    bindingToLabel.set(p, p);
  }

  // Track added edges to avoid duplicates (which corrupt topoSort inDegrees).
  const seenEdges = new Set<string>();

  // Expand a call SExp into nodes/edges. Returns the node label that
  // "produces" the value (the outermost function), or null if not a call.
  // Inlined call arguments are recursively expanded first (bottom-up).
  // Self-edges (same function appearing in its own args due to duplicate
  // invocations) and duplicate edges are both skipped.
  function expandCall(callExpr: SExp): string | null {
    if (callExpr.type !== "list" || callExpr.items[0]?.type !== "symbol") return null;
    const nodeLabel = callExpr.items[0].value;
    nodeLabels.add(nodeLabel);
    for (const arg of callExpr.items.slice(1)) {
      const srcLabel = resolveArg(arg);
      if (srcLabel !== null && srcLabel !== nodeLabel) {
        const key = `${srcLabel}->${nodeLabel}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          edges.push({ from: srcLabel, to: nodeLabel });
        }
      }
    }
    return nodeLabel;
  }

  // Resolve an argument SExp to the node label it refers to:
  //   - known binding symbol → the label bound to it
  //   - nested call → recursively expand and return its outermost label
  //   - anything else (literal, keyword, unknown symbol) → null
  function resolveArg(arg: SExp): string | null {
    if (arg.type === "symbol" && bindingToLabel.has(arg.value)) {
      return bindingToLabel.get(arg.value)!;
    }
    if (arg.type === "list") return expandCall(arg);
    return null;
  }

  for (let i = 0; i + 1 < bindingVec.length; i += 2) {
    const bname = bindingVec[i];
    const callExpr = bindingVec[i + 1];
    if (bname.type !== "symbol") continue;

    const nodeLabel = expandCall(callExpr);
    if (nodeLabel !== null) bindingToLabel.set(bname.value, nodeLabel);
  }

  // Parse body expression — may introduce one more node + edges
  if (body) {
    if (body.type === "list") {
      expandCall(body);
    }
    // map body `{:k v ...}` — terminals already captured via bindings
  }

  return { nodes: [...nodeLabels], edges, errors };
}
