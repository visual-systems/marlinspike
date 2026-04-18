/**
 * Spike-Clojure: bidirectional serialisation between the graph data model and
 * Spike-Clojure source text.
 *
 * Built on top of `src/graph/base_lisp.ts` (the S-expression reader).
 * This module covers the semantic layer: mapping Clojure forms to graph concepts.
 *
 * Supported forms:
 *   (def name)                       — standalone leaf node (no children)
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
 *   - IDs are assumed to equal labels; label changes break identity.
 *   - Root-level edges are not supported (by design — edges require a
 *     containing defn/let scope, matching Clojure semantics).
 *   - Conjunctive naming handles duplicate inline calls (e.g. nested
 *     `(multiply 4.0 (multiply a c))`) by generating unique node names.
 */

import type { Edge, Port, TreeNode } from "../ui/workspace.ts";
import type { SExp } from "../graph/base_lisp.ts";
import { parse } from "../graph/base_lisp.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Data keys that are internal to the codec or the reactivity system and should not be emitted. */
const INTERNAL_DATA_KEYS = new Set(["fn", "argOrder"]);

/**
 * Return the def/defn name form, optionally prefixed with `^{...}` reader
 * metadata containing `:id`, `:uri`, and user data fields.
 *
 * Metadata is emitted when the node carries information beyond its label:
 *   - `:id` — only when the node's id is a genuine UUID (opaque, not label-derived)
 *   - `:uri` — when the node has a URI
 *   - user data fields — non-empty values from `node.data`, excluding codec-internal
 *     keys (`fn`, `argOrder`) which are reconstructed from call syntax
 *
 * When there is nothing to emit, returns the bare label.
 */
function nameWithIdMeta(node: TreeNode): string {
  const entries: string[] = [];
  if (looksLikeUuid(node.id)) {
    entries.push(`:id ${JSON.stringify(node.id)}`);
  }
  if (node.uri) {
    entries.push(`:uri ${JSON.stringify(node.uri)}`);
  }
  for (const [k, v] of Object.entries(node.data)) {
    if (INTERNAL_DATA_KEYS.has(k)) continue;
    const emitted = emitDataValue(v);
    if (emitted !== null) entries.push(`:${k} ${emitted}`);
  }
  if (entries.length === 0) return node.label;
  return `^{${entries.join(" ")}} ${node.label}`;
}

/** Emit a data value as a Clojure literal. Returns null for values that can't be represented. */
function emitDataValue(v: unknown): string | null {
  if (typeof v === "string") return v === "" ? null : JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  if (v === null) return "nil";
  if (Array.isArray(v)) {
    const items = v.map(emitDataValue).filter((x): x is string => x !== null);
    return `[${items.join(" ")}]`;
  }
  if (typeof v === "object") {
    const pairs: string[] = [];
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const emitted = emitDataValue(val);
      if (emitted !== null) pairs.push(`:${k} ${emitted}`);
    }
    return pairs.length > 0 ? `{${pairs.join(" ")}}` : null;
  }
  return null;
}

/** UUID pattern check — reused by emit (suppress metadata) and codec (id generation). */
function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Pull an `:id` string out of a symbol's reader metadata, if present.
 * Returns `undefined` when there is no metadata, no `:id` key, or the value
 * is not a string — callers fall back to label-as-id in those cases.
 */
function extractIdMeta(nameForm: SExp): string | undefined {
  const meta = nameForm.meta;
  if (!meta || meta.type !== "map") return undefined;
  for (const [k, v] of meta.entries) {
    if (k.type === "keyword" && k.value === "id" && v.type === "string") {
      return v.value;
    }
  }
  return undefined;
}

/** Metadata keys that are handled specially (not stored in node.data). */
const SPECIAL_META_KEYS = new Set(["id", "uri"]);

/**
 * Extract all metadata from a name form's reader metadata.
 * Returns `{ uri, data }` where data contains all non-special keyword entries.
 */
function extractNameMeta(nameForm: SExp): {
  uri: string | undefined;
  data: Record<string, unknown>;
} {
  const meta = nameForm.meta;
  if (!meta || meta.type !== "map") return { uri: undefined, data: {} };
  let uri: string | undefined;
  const data: Record<string, unknown> = {};
  for (const [k, v] of meta.entries) {
    if (k.type !== "keyword") continue;
    if (k.value === "uri" && v.type === "string") {
      uri = v.value;
    } else if (!SPECIAL_META_KEYS.has(k.value)) {
      data[k.value] = sexpToValue(v);
    }
  }
  return { uri, data };
}

/** Convert a SExp value to a plain JS value for storage in node.data. */
function sexpToValue(sexp: SExp): unknown {
  switch (sexp.type) {
    case "string":
      return sexp.value;
    case "number":
      return sexp.value;
    case "boolean":
      return sexp.value;
    case "nil":
      return null;
    case "keyword":
      return sexp.value;
    case "symbol":
      return sexp.value;
    case "vector":
      return sexp.items.map(sexpToValue);
    case "map": {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of sexp.entries) {
        const key = k.type === "keyword" ? k.value : k.type === "string" ? k.value : String(k);
        obj[key] = sexpToValue(v);
      }
      return obj;
    }
    default:
      return null;
  }
}

/**
 * Extract edge metadata from `^{:label "..." :key val}` reader metadata on
 * a call argument. Returns empty label and data when no metadata is present.
 */
function extractEdgeMeta(arg: SExp): { label: string; data: Record<string, unknown> } {
  const meta = arg.meta;
  if (!meta || meta.type !== "map") return { label: "", data: {} };
  let label = "";
  const data: Record<string, unknown> = {};
  for (const [k, v] of meta.entries) {
    if (k.type !== "keyword") continue;
    if (k.value === "label" && v.type === "string") {
      label = v.value;
    } else {
      data[k.value] = sexpToValue(v);
    }
  }
  return { label, data };
}

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

/** Format a Clojure map literal — single entry stays inline, multiple get one line each. */
function formatMap(entries: [string, string][], baseIndent = ""): string {
  if (entries.length <= 1) {
    return `{${entries.map(([k, v]) => `${k} ${v}`).join(" ")}}`;
  }
  // Continuation lines align 1 char inside the `{`
  const cont = baseIndent + " ";
  return `{${entries.map(([k, v], i) => i === 0 ? `${k} ${v}` : `${cont}${k} ${v}`).join("\n")}}`;
}

/**
 * Emit a composite node that has edges among its children as a defn + let form.
 *
 * The algorithm:
 *   1. Input ports (direction "in") become defn params; excluded from let bindings.
 *   2. Topological sort of non-param children.
 *   3. Nodes that were explicitly named in the source (data.fn or data.argOrder set)
 *      OR are fan-out nodes (multiple outgoing edges) become let bindings.
 *      All other nodes are inlined directly as call arguments where they are used.
 *   4. Build the return expression, inlining single-use anonymous nodes recursively.
 */
function emitDefnForm(container: TreeNode, edges: Edge[]): string {
  const nodes = container.children;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Input ports are defn params: in scope as bindings, not in let block
  const inputPorts = (container.ports ?? []).filter((p) => p.direction === "in");
  const inputPortIds = new Set(inputPorts.map((p) => p.name));

  // Binding name for a node: always the node label.
  // Under binding-name-as-identity, the label IS the let variable name.
  const binding = (id: string) => nodeById.get(id)!.label;

  // Non-param nodes are the ones that go in the let bindings
  const letNodes = nodes.filter((n) => !inputPortIds.has(n.id));

  const sorted = topoSort(letNodes.map((n) => n.id), edges);
  const sourceIds = new Set(edges.map((e) => e.fromId));

  // Terminal nodes: no outgoing edges within this composite
  const terminalIds = sorted.filter((id) => !sourceIds.has(id));

  // Count outgoing edges per node (to detect fan-out)
  const outgoingCounts = new Map<string, number>();
  for (const e of edges) {
    outgoingCounts.set(e.fromId, (outgoingCounts.get(e.fromId) ?? 0) + 1);
  }

  // A node is inline-able when it was NOT explicitly renamed in the original source
  // (data.fn undefined means label === function name) and is used by at most one
  // downstream node. Input-port nodes are never inline-able (they appear in the
  // param list). Fan-out nodes must be bound in a let to avoid recomputing.
  //
  // Note: data.argOrder (literal preservation) is intentionally NOT checked here.
  // Map-key nodes and let-bound nodes where the binding name equals the function
  // name both lack data.fn. Inlining them is always safe because the binding name
  // carries no extra identity beyond the function name.
  function isInlineable(id: string): boolean {
    if (inputPortIds.has(id)) return false;
    const node = nodeById.get(id);
    if (!node) return false;
    if (node.data.fn !== undefined) return false; // explicitly renamed — must keep binding
    return (outgoingCounts.get(id) ?? 0) <= 1;
  }

  // For each node, collect its incoming arg labels in edge order (fallback when
  // no data.argOrder is stored, e.g. inline-call nodes and user-constructed graphs).
  const incomingArgs = new Map<string, string[]>();
  for (const id of sorted) incomingArgs.set(id, []);
  for (const e of edges) {
    incomingArgs.get(e.toId)?.push(binding(e.fromId));
  }

  // Edge lookup by (fromId, toId) for metadata emission
  const edgeLookup = new Map<string, Edge>();
  for (const e of edges) {
    edgeLookup.set(`${e.fromId}->${e.toId}`, e);
  }

  /** Emit an argument, prefixed with ^{...} reader metadata if the edge carries label/data. */
  function emitArg(argLabel: string, targetId: string): string {
    const argId = [...nodeById.entries()].find(([_, n]) => n.label === argLabel)?.[0];
    const expr = nodeById.has(argLabel) && isInlineable(argLabel) ? callExpr(argLabel) : argLabel;
    if (!argId) return expr;
    const edge = edgeLookup.get(`${argId}->${targetId}`);
    if (!edge) return expr;
    const metaEntries: string[] = [];
    if (edge.label) metaEntries.push(`:label ${JSON.stringify(edge.label)}`);
    for (const [k, v] of Object.entries(edge.data)) {
      const emitted = emitDataValue(v);
      if (emitted !== null) metaEntries.push(`:${k} ${emitted}`);
    }
    if (metaEntries.length === 0) return expr;
    return `^{${metaEntries.join(" ")}} ${expr}`;
  }

  // Build the call expression for a node, recursively inlining inline-able args.
  // Uses data.argOrder (preserves literal values) when available, otherwise falls
  // back to edge-derived incomingArgs.
  function callExpr(id: string): string {
    const node = nodeById.get(id)!;
    const fn = (node.data.fn as string | undefined) ?? node.label;
    const argOrder = node.data.argOrder as string[] | undefined;
    const rawArgs = argOrder ?? incomingArgs.get(id) ?? [];
    const args = rawArgs.map((a) => emitArg(a, id));
    return args.length > 0 ? `(${fn} ${args.join(" ")})` : `(${fn})`;
  }

  // Param list with optional ^Type hints
  const paramList = inputPorts.map((p) => p.type ? `^${p.type} ${p.name}` : p.name).join(" ");

  // Output ports attr-map: emit if any output ports are declared
  const outputPorts = (container.ports ?? []).filter((p) => p.direction === "out");
  const attrMap = outputPorts.length > 0
    ? `\n  {:ports {${outputPorts.map((p) => `:${p.name} ${p.type ?? "any"}`).join(" ")}}}`
    : "";

  // When all terminal nodes are named by output ports (map-key identity from
  // the parser), inline each terminal call directly in the map return rather
  // than binding it in a let. This produces {:x1 (divide ...) :x2 (divide ...)}
  // instead of {:x1 x1 :x2 x2} and preserves distinct output slots.
  const portNameSet = new Set(outputPorts.map((p) => p.name));
  const portsMatchTerminals = outputPorts.length > 0 &&
    terminalIds.length > 0 &&
    terminalIds.every((id) => portNameSet.has(id));

  // Let bindings: exclude terminals and inline-able nodes (which are folded
  // directly into their single consumer's call expression).
  const letIds =
    (portsMatchTerminals
      ? sorted.filter((id) => !portNameSet.has(id))
      : terminalIds.length === 1
      ? sorted.filter((id) => id !== terminalIds[0])
      : sorted).filter((id) => !isInlineable(id));

  const letIdSet = new Set(letIds);

  // For the return expression: nodes in the let block are referenced by their
  // binding name; nodes not in the let block are inlined as call expressions.
  const returnRef = (id: string) => letIdSet.has(id) ? binding(id) : callExpr(id);

  // Return expression — map keys get their own lines for readability.
  // Base indent depends on whether there is a let block (4 spaces) or not (2 spaces).
  const mapEntries: [string, string][] | null = portsMatchTerminals
    ? outputPorts.map((p) => [`:${p.name}`, callExpr(p.name)] as [string, string])
    : terminalIds.length === 1
    ? null
    : terminalIds.map((id) => [`:${nodeById.get(id)!.label}`, returnRef(id)] as [string, string]);

  const nameForm = nameWithIdMeta(container);
  if (letIds.length === 0) {
    const returnExpr = mapEntries ? formatMap(mapEntries, "  ") : callExpr(terminalIds[0]);
    return `(defn ${nameForm}${attrMap}\n  [${paramList}]\n  ${returnExpr})`;
  }

  // Format let bindings: first on same line as `[`, rest indented to align
  const bindingLines = letIds.map((id) => `${binding(id)} ${callExpr(id)}`);

  const indent = " ".repeat(8); // aligns under first binding name after `  (let [`
  const letBlock = bindingLines
    .map((b, i) => (i === 0 ? `[${b}` : `${indent}${b}`))
    .join("\n") + "]";

  const returnExpr = mapEntries ? formatMap(mapEntries, "    ") : callExpr(terminalIds[0]);
  return `(defn ${nameForm}${attrMap}\n  [${paramList}]\n  (let ${letBlock}\n    ${returnExpr}))`;
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
 * Root-level leaf nodes are emitted as bare `(def name)` forms.
 *
 * Edges between nodes that are not co-children of a composite are not
 * encoded (by design — edges require a containing defn/let scope).
 */
export function graphToSpike(nodes: TreeNode[], edges: Edge[]): string {
  const lines: string[] = [];
  const emitted = new Set<string>();

  function emitNode(node: TreeNode): void {
    if (emitted.has(node.id)) return;
    emitted.add(node.id);

    if (node.kind === "leaf") {
      lines.push(`(def ${nameWithIdMeta(node)})`);
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
      lines.push(`(def ${nameWithIdMeta(node)} [${refs}])`);
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
 *   (def name)
 *     → standalone leaf node (no children, no value)
 *
 *   (def name [child ...])
 *     → composite node; children are node references (leaf if not defined)
 *
 *   (defn name [params] (let [binding call ...] body))
 *     → composite node; children inferred from let bindings and body call;
 *       edges inferred from which bindings are passed as arguments;
 *       ^Type hints on params → input ports; {:ports ...} attr-map → output ports
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
    {
      nodes: string[];
      edges: ParsedEdge[];
      ports: Port[];
      nodeFunctions: Map<string, string>;
      nodeArgOrders: Map<string, string[]>;
    }
  >();
  // Label → explicit UUID pulled from `^{:id "..."}` reader metadata on the
  // def/defn name. When absent, the node falls back to label-as-id.
  const nameId = new Map<string, string>();
  // Label → { uri, data } extracted from the name's reader metadata.
  const nameMeta = new Map<string, { uri: string | undefined; data: Record<string, unknown> }>();

  for (const form of forms) {
    if (form.type !== "list" || form.items.length < 2) continue;
    const [head, nameForm] = form.items;
    if (head.type !== "symbol" || nameForm.type !== "symbol") continue;
    const name = nameForm.value;
    const uuid = extractIdMeta(nameForm);
    if (uuid) nameId.set(name, uuid);
    const meta = extractNameMeta(nameForm);
    if (meta.uri || Object.keys(meta.data).length > 0) {
      nameMeta.set(name, meta);
    }

    if (head.value === "def") {
      // (def name [child ...]) or bare (def name) for leaf nodes
      const bodyForm = form.items[2]; // undefined for bare (def name)
      const childNames: string[] = [];
      if (bodyForm && bodyForm.type === "vector") {
        for (const item of bodyForm.items) {
          if (item.type === "symbol") childNames.push(item.value);
        }
      }
      defs.set(name, childNames);
    } else if (head.value === "defn") {
      // (defn name [params] (let [...] body))
      // Also handles attr-map position: (defn name {:ports ...} [params] body)
      const rest = form.items.slice(2);

      // Extract typed params from the param vector (^Type hints become input ports)
      const paramVec = rest.find((f) => f.type === "vector");
      const paramNames: string[] = [];
      const inputPorts: Port[] = [];
      if (paramVec && paramVec.type === "vector") {
        let typeHint: string | undefined;
        for (const item of paramVec.items) {
          if (item.type === "symbol" && item.value.startsWith("^")) {
            typeHint = item.value.slice(1);
          } else if (item.type === "symbol") {
            paramNames.push(item.value);
            inputPorts.push(
              typeHint
                ? { name: item.value, direction: "in", type: typeHint }
                : { name: item.value, direction: "in" },
            );
            typeHint = undefined;
          }
        }
      }

      // Extract output ports from {:ports {:name type ...}} attr-map
      const attrMap = rest.find((f) => f.type === "map");
      const outputPorts: Port[] = [];
      if (attrMap && attrMap.type === "map") {
        const portsEntry = attrMap.entries.find(
          ([k]) => k.type === "keyword" && k.value === "ports",
        );
        if (portsEntry) {
          const portsMap = portsEntry[1];
          if (portsMap.type === "map") {
            for (const [k, v] of portsMap.entries) {
              if (k.type === "keyword") {
                outputPorts.push(
                  v.type === "symbol"
                    ? { name: k.value, direction: "out", type: v.value }
                    : { name: k.value, direction: "out" },
                );
              }
            }
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
      defns.set(name, { ...result, ports: [...inputPorts, ...outputPorts] });
    }
  }

  if (defs.size === 0 && defns.size === 0 && errors.length === 0) {
    return { treeNodes: [], edges: [], errors: [] };
  }

  // Build TreeNodes from defn forms first, so def nodes can reference them
  const builtDefn = new Map<string, TreeNode>();
  const allEdges: Edge[] = [];

  for (
    const [name, { nodes: childLabels, edges: rawEdges, ports, nodeFunctions, nodeArgOrders }]
      of defns
  ) {
    const children: TreeNode[] = childLabels.map((label) => ({
      id: label,
      label,
      kind: "leaf" as const,
      children: [],
      data: {
        // fn: actual function name when node label differs from function name
        // (e.g. node "neg-b" calls "negate"; node "x1" calls "divide")
        ...(nodeFunctions.has(label) ? { fn: nodeFunctions.get(label)! } : {}),
        // argOrder: preserved arg list (symbolic labels + literal reprs) so the
        // emitter can reconstruct the exact call including literal values.
        ...(nodeArgOrders.has(label) ? { argOrder: nodeArgOrders.get(label)! } : {}),
      },
      version: 1,
    }));
    const meta = nameMeta.get(name);
    builtDefn.set(name, {
      id: nameId.get(name) ?? name,
      label: name,
      kind: "composite",
      children,
      ports: ports.length > 0 ? ports : undefined,
      data: meta?.data ?? {},
      version: 1,
      ...(meta?.uri ? { uri: meta.uri } : {}),
    });
    for (const pe of rawEdges) {
      allEdges.push({
        id: `${pe.from}-${pe.to}`,
        fromId: pe.from,
        toId: pe.to,
        label: pe.label,
        data: pe.data,
        version: 1,
      });
    }
  }

  // Build TreeNodes from def forms (after defn, so children can resolve defn nodes)
  const builtDef = new Map<string, TreeNode>();

  function makeDefNode(name: string, visited: Set<string>): TreeNode {
    if (builtDef.has(name)) return builtDef.get(name)!;
    // If this name was defined as a defn, use the already-built composite node
    if (builtDefn.has(name)) return builtDefn.get(name)!;
    if (visited.has(name)) {
      errors.push(`Cycle detected at "${name}"`);
      const stub: TreeNode = {
        id: nameId.get(name) ?? name,
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
    const meta = nameMeta.get(name);
    const node: TreeNode = {
      id: nameId.get(name) ?? name,
      label: name,
      kind: children.length > 0 ? "composite" : "leaf",
      children,
      data: meta?.data ?? {},
      version: 1,
      ...(meta?.uri ? { uri: meta.uri } : {}),
    };
    builtDef.set(name, node);
    return node;
  }

  for (const name of defs.keys()) makeDefNode(name, new Set());

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
interface ParsedEdge {
  from: string;
  to: string;
  label: string;
  data: Record<string, unknown>;
}

function parseLetForm(
  letParts: SExp[],
  paramNames: string[] = [],
): {
  nodes: string[];
  edges: ParsedEdge[];
  errors: string[];
  nodeFunctions: Map<string, string>;
  nodeArgOrders: Map<string, string[]>;
} {
  const errors: string[] = [];
  const nodeLabels = new Set<string>();
  const edges: ParsedEdge[] = [];
  // Maps node label → function name when they differ (e.g. node "x1" calls "divide")
  const nodeFunctions = new Map<string, string>();
  // Maps node label → ordered arg list (symbolic labels + literal reprs).
  // Stored for let-bound nodes and conjunctive-named inline nodes.
  const nodeArgOrders = new Map<string, string[]>();

  if (letParts.length < 1 || letParts[0].type !== "vector") {
    errors.push("let: expected binding vector");
    return { nodes: [], edges: [], errors, nodeFunctions, nodeArgOrders: new Map() };
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

  // Check whether adding fromLabel→toLabel would create a cycle in the
  // edges accumulated so far. Uses DFS from toLabel; if fromLabel is
  // reachable, the edge is a back-edge and must be skipped to keep the
  // graph acyclic. This handles duplicate function-name calls in bodies
  // (e.g. two calls to `subtract` with different args) without breaking
  // topoSort for the rest of the graph.
  function wouldCreateCycle(fromLabel: string, toLabel: string): boolean {
    const visited = new Set<string>();
    const stack = [toLabel];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === fromLabel) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const e of edges) {
        if (e.from === node) stack.push(e.to);
      }
    }
    return false;
  }

  // Expand a call SExp into nodes/edges. Returns the node label that
  // "produces" the value (the outermost function), or null if not a call.
  // Inlined call arguments are recursively expanded first (bottom-up).
  // Self-edges, duplicate edges, and back-edges (cycle-forming) are all
  // skipped to keep the accumulated edge set a valid DAG.
  //
  // nameOverride: when set (e.g. a map key), the node is identified by that
  // name rather than the function name, and the function name is stored in
  // nodeFunctions for the emitter to use.
  function expandCall(callExpr: SExp, nameOverride?: string): string | null {
    if (callExpr.type !== "list" || callExpr.items[0]?.type !== "symbol") return null;
    const funcLabel = callExpr.items[0].value;

    // First pass: resolve all arguments to determine their labels/literals.
    // Nested calls are recursively expanded, creating their own nodes and edges.
    const resolvedArgs: Array<{
      label: string | null;
      literal: string | null;
      edgeMeta: { label: string; data: Record<string, unknown> };
    }> = [];
    for (const arg of callExpr.items.slice(1)) {
      // Extract edge metadata from ^{...} reader metadata on the argument
      const edgeMeta = extractEdgeMeta(arg);
      if (arg.type === "number") {
        resolvedArgs.push({ label: null, literal: String(arg.value), edgeMeta });
      } else if (arg.type === "string") {
        resolvedArgs.push({ label: null, literal: JSON.stringify(arg.value), edgeMeta });
      } else {
        const srcLabel = resolveArg(arg);
        resolvedArgs.push({ label: srcLabel, literal: null, edgeMeta });
      }
    }

    // Determine node label. When no nameOverride is given and the function name
    // already exists as a node, generate a conjunctive name (fn-arg1-arg2) to
    // avoid collapsing distinct inline calls into a single node. The conjunctive
    // name becomes the node's identity and data.fn stores the real function name.
    let effectiveOverride = nameOverride;
    if (effectiveOverride === undefined && nodeLabels.has(funcLabel)) {
      const parts = resolvedArgs
        .map((a) => a.label ?? a.literal)
        .filter((x): x is string => x !== null);
      if (parts.length > 0) {
        effectiveOverride = `${funcLabel}-${parts.join("-")}`;
      }
    }

    const nodeLabel = effectiveOverride ?? funcLabel;
    nodeLabels.add(nodeLabel);
    if (effectiveOverride && effectiveOverride !== funcLabel) {
      nodeFunctions.set(nodeLabel, funcLabel);
    }

    // Second pass: build argList and add edges from resolved args to this node.
    const argList: string[] = [];
    for (const a of resolvedArgs) {
      if (a.literal !== null) {
        argList.push(a.literal);
      } else if (a.label !== null && a.label !== nodeLabel) {
        const key = `${a.label}->${nodeLabel}`;
        if (!seenEdges.has(key) && !wouldCreateCycle(a.label, nodeLabel)) {
          seenEdges.add(key);
          edges.push({
            from: a.label,
            to: nodeLabel,
            label: a.edgeMeta.label,
            data: a.edgeMeta.data,
          });
        }
        argList.push(a.label);
      }
    }

    if (effectiveOverride !== undefined) {
      nodeArgOrders.set(nodeLabel, argList);
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

    // Pass the binding variable name as the node identity: (let [neg-b (negate b)] ...)
    // creates node "neg-b" with data.fn="negate", not node "negate".
    const nodeLabel = expandCall(callExpr, bname.value);
    if (nodeLabel !== null) {
      bindingToLabel.set(bname.value, nodeLabel);
    }
  }

  // Parse body expression — may introduce more nodes + edges
  if (body) {
    if (body.type === "list") {
      expandCall(body);
    } else if (body.type === "map") {
      // Map body: {:k (call ...) ...} — expand each call using the map key as
      // the node's identity. This preserves distinct terminal nodes even when
      // the same function (e.g. `divide`) is called multiple times.
      for (const [key, val] of body.entries) {
        if (val.type === "list") {
          const nameOverride = key.type === "keyword" ? key.value : undefined;
          expandCall(val, nameOverride);
        }
      }
    }
  }

  return { nodes: [...nodeLabels], edges, errors, nodeFunctions, nodeArgOrders };
}
