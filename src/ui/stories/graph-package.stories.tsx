/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import {
  buildTree,
  collectSubtreeIds,
  edgesInScope,
  findNode,
  findParentOf,
  findPath,
  findSiblings,
  flattenTree,
  isRef,
  makeNode,
  makeRefNode,
  makeRootNode,
  nodeHash,
  removeNodeFromTree,
  updateNodeInTree,
  walk,
} from "@marlinspike/graph";
import type { Edge, TreeNode } from "@marlinspike/graph";

export const meta = {
  title: "Package: @marlinspike-graph",
  url: "https://github.com/visual-systems/marlinspike/blob/main/packages/graph/README.md",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PRE =
  "background:#0f0f22; padding:12px; border-radius:4px; font-size:12px; line-height:1.5; overflow:auto; max-height:500px; white-space:pre-wrap; font-family:monospace;";

const SECTION = "margin-bottom:32px;";

const HEADING = "font-size:16px; font-weight:bold; margin-bottom:4px; color:#c0c0e0;";

const SUBHEADING = "font-size:13px; font-weight:600; margin-bottom:6px; color:#a0a0d0;";

const DESCRIPTION =
  "font-size:12px; color:#888; margin-bottom:12px; line-height:1.6; max-width:720px;";

const LABEL = "font-size:11px; color:#666; margin-bottom:4px;";

const BTN =
  "background:#2a2a4a; color:#e0e0e0; border:1px solid #3a3a5a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:12px;";

const BTN_ACTIVE =
  "background:#3a3a6a; color:#e0e0ff; border:1px solid #5a5a8a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:12px;";

const CALLOUT =
  "background:#1a1a30; border-left:3px solid #5a5a8a; padding:8px 12px; font-size:11px; color:#a0a0c0; margin-bottom:12px; line-height:1.5;";

const TAG =
  "display:inline-block; background:#2a2a4a; color:#9090c0; padding:1px 6px; border-radius:3px; font-size:10px; font-family:monospace; margin-right:4px;";

const COLUMNS = "display:flex; gap:16px;";
const COL = "flex:1;";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

function sampleTree(): TreeNode[] {
  const httpIn = makeNode("http-in", "HTTP In", "leaf", []);
  httpIn.ports = [{ name: "request", direction: "out", type: "http.request" }];

  const validate = makeNode("validate", "Validate", "leaf", []);
  validate.ports = [
    { name: "input", direction: "in", type: "http.request" },
    { name: "output", direction: "out", type: "validated" },
  ];

  const transform = makeNode("transform", "Transform", "leaf", []);
  transform.ports = [
    { name: "input", direction: "in", type: "validated" },
    { name: "output", direction: "out", type: "record" },
  ];

  const dbWrite = makeNode("db-write", "DB Write", "leaf", []);
  dbWrite.ports = [{ name: "input", direction: "in", type: "record" }];

  const pipeline = makeNode("pipeline", "Request Pipeline", "composite", [
    httpIn,
    validate,
    transform,
    dbWrite,
  ]);
  pipeline.ports = [
    { name: "request", direction: "in", type: "http.request" },
    { name: "status", direction: "out", type: "http.status" },
  ];

  const logger = makeRefNode("logger-ref", "Logger", "logger-service");

  return [makeRootNode("root", [pipeline, logger], "API Service")];
}

function sampleEdges(): Edge[] {
  return [
    { id: "e1", fromId: "http-in", toId: "validate", label: "request", data: {}, version: 1 },
    { id: "e2", fromId: "validate", toId: "transform", label: "validated", data: {}, version: 1 },
    { id: "e3", fromId: "transform", toId: "db-write", label: "record", data: {}, version: 1 },
    { id: "e4", fromId: "pipeline", toId: "logger-ref", label: "logs", data: {}, version: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Helper: render a node with type annotations
// ---------------------------------------------------------------------------

function nodeTag(node: TreeNode): string {
  const parts: string[] = [];
  if (node.kind === "composite") parts.push("composite");
  if (node.kind === "leaf") parts.push("leaf");
  if (isRef(node)) parts.push(`ref:${node.ref}`);
  if (node.ports?.length) parts.push(`${node.ports.length} ports`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export function DataModel() {
  const tree = sampleTree();
  const edges = sampleEdges();

  const lines: string[] = [];
  walk(tree, {
    enter: (node, _parent, depth) => {
      const indent = "  ".repeat(depth);
      const icon = node.kind === "composite" ? "+" : isRef(node) ? "~" : "-";
      const tag = nodeTag(node);
      const portList = node.ports?.length
        ? `\n${indent}    ports: ${
          node.ports.map((p) => `${p.direction}:${p.name}:${p.type ?? "any"}`).join(", ")
        }`
        : "";
      lines.push(`${indent}${icon} ${node.label} (${node.id}) [${tag}]${portList}`);
    },
  });

  return (
    <div style={SECTION}>
      <div style={HEADING}>The Rose-Tree Data Model</div>
      <div style={DESCRIPTION}>
        The graph is a <strong>rose-tree</strong>: every node is either a <strong>composite</strong>
        {" "}
        (contains children) or a <strong>leaf</strong>{" "}
        (no children). This structure produces natural hierarchy, encapsulation, and fractal
        navigation. Three invariants govern the model:
      </div>

      <div style={CALLOUT}>
        <strong>1. Containment is recursive.</strong>{" "}
        A composite's children form a complete subgraph. Zoom into any composite and it's
        self-contained.
        <br />
        <strong>2. Communication is sibling-scoped.</strong>{" "}
        Edges only connect nodes sharing the same parent. Data never flows directly across
        containment boundaries.
        <br />
        <strong>3. Ports are boundary contracts.</strong>{" "}
        Port declarations define what goes in/out of a node — the interface between containment
        levels.
      </div>

      <div style={SUBHEADING}>Sample tree: API Service</div>
      <div style={DESCRIPTION}>
        This tree has a root composite containing a pipeline (composite with 4 leaf children) and a
        logger reference node. The <span style={TAG}>+</span> prefix marks composites,
        <span style={TAG}>-</span> marks leaves, and <span style={TAG}>~</span>{" "}
        marks references. Ports show the boundary contract at each level.
      </div>

      <pre style={PRE}>{lines.join("\n")}</pre>

      <div style="margin-top:16px;">
        <div style={SUBHEADING}>Edges (sibling-scoped)</div>
        <div style={DESCRIPTION}>
          Edges e1-e3 connect siblings within the pipeline. Edge e4 connects siblings under root
          (pipeline and logger-ref). No edge crosses containment boundaries.
        </div>
        <pre style={PRE}>
          {edges.map((e) => `${e.id}: ${e.fromId} --${e.label}--> ${e.toId}`).join("\n")}
        </pre>
      </div>
    </div>
  );
}

export function TraversalQueries() {
  const tree = sampleTree();
  const edges = sampleEdges();
  const [selectedId, setSelectedId] = useState("validate");

  const allIds: string[] = [];
  walk(tree, {
    enter: (n) => {
      allIds.push(n.id);
    },
  });

  const found = findNode(tree, selectedId);
  const parent = findParentOf(tree, selectedId);
  const siblings = findSiblings(tree, selectedId);
  const path = findPath(tree, selectedId);
  const subtreeIds = found ? collectSubtreeIds(found) : new Set<string>();

  const scopeParent = parent ?? found;
  const scoped = scopeParent ? edgesInScope(scopeParent, edges) : [];

  return (
    <div style={SECTION}>
      <div style={HEADING}>Traversal & Queries</div>
      <div style={DESCRIPTION}>
        The package provides a set of pure query functions for navigating the tree. Select a node
        below to see how each function resolves relative to that node.
      </div>

      <div style="margin-bottom:12px;">
        <div style={LABEL}>Select a node to query:</div>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          {allIds.map((id) => (
            <button
              type="button"
              key={id}
              style={id === selectedId ? BTN_ACTIVE : BTN}
              onClick={() => setSelectedId(id)}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <div style={COLUMNS}>
        <div style={COL}>
          <div style={SUBHEADING}>Query Results</div>
          <pre style={PRE}>
            {[
              `findNode("${selectedId}"):`,
              found
                ? `  ${found.label} (kind: ${found.kind}${isRef(found) ? `, ref: ${found.ref}` : ""})`
                : "  (not found)",
              ``,
              `findParentOf("${selectedId}"):`,
              parent ? `  ${parent.label} (${parent.id})` : "  (none — this is a root)",
              ``,
              `findSiblings("${selectedId}"):`,
              siblings.length
                ? siblings.map((s) => `  ${s.label} (${s.id})`).join("\n")
                : "  (no siblings)",
              ``,
              `findPath("${selectedId}"):`,
              `  ${path.map((n) => n.label).join(" > ") || "(not found)"}`,
              ``,
              `collectSubtreeIds("${selectedId}"):`,
              `  {${[...subtreeIds].join(", ")}}`,
            ].join("\n")}
          </pre>
        </div>
        <div style={COL}>
          <div style={SUBHEADING}>Scoped Edges</div>
          <div style={DESCRIPTION}>
            <code style="color:#a0a0d0;">edgesInScope(parent, edges)</code>{" "}
            returns only edges where both endpoints are direct children of the parent. This is the
            core query that codecs, constraints, and layout engines use.
          </div>
          <pre style={PRE}>
            {[
              `Scope parent: ${scopeParent?.label ?? "none"} (${scopeParent?.id ?? "?"})`,
              `Edges in scope: ${scoped.length}`,
              ``,
              ...scoped.map(
                (e) => `  ${e.fromId} --${e.label}--> ${e.toId}`,
              ),
              ...(scoped.length === 0
                ? ["  (no sibling edges at this level)"]
                : []),
            ].join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function MutationDemo() {
  const [tree, setTree] = useState(sampleTree);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((l) => [...l, msg]);

  const rename = () => {
    const newName = `Validate_${Date.now() % 1000}`;
    setTree((t) =>
      updateNodeInTree(t, "validate", (n) => ({ ...n, label: newName, version: n.version + 1 }))
    );
    addLog(`updateNodeInTree("validate", n => {...n, label: "${newName}"})`);
  };

  const remove = () => {
    setTree((t) => removeNodeFromTree(t, "transform"));
    addLog(`removeNodeFromTree(tree, "transform")`);
  };

  const addPort = () => {
    setTree((t) =>
      updateNodeInTree(t, "db-write", (n) => ({
        ...n,
        ports: [...(n.ports ?? []), { name: "error", direction: "out" as const, type: "error" }],
        version: n.version + 1,
      }))
    );
    addLog(`updateNodeInTree("db-write", n => {...n, ports: [...n.ports, errorPort]})`);
  };

  const reset = () => {
    setTree(sampleTree());
    setLog([]);
  };

  const lines: string[] = [];
  walk(tree, {
    enter: (node, _parent, depth) => {
      const indent = "  ".repeat(depth);
      const hash = nodeHash(node);
      const ports = node.ports?.length ? ` (${node.ports.length} ports)` : "";
      lines.push(`${indent}${node.label} [hash: ${hash}]${ports}`);
    },
  });

  return (
    <div style={SECTION}>
      <div style={HEADING}>Immutable Mutations</div>
      <div style={DESCRIPTION}>
        All tree mutations are <strong>immutable</strong>{" "}
        — they return a new tree, leaving the original untouched.{" "}
        <code style="color:#a0a0d0;">updateNodeInTree</code> applies a function to a node by ID.
        {" "}
        <code style="color:#a0a0d0;">removeNodeFromTree</code>{" "}
        removes a node (and demotes its parent to a leaf if it was the last child).{" "}
        <code style="color:#a0a0d0;">nodeHash</code>{" "}
        produces a lightweight hash for change detection — notice how hashes change only for
        modified nodes and their ancestors.
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
        <button type="button" style={BTN} onClick={rename}>
          Rename "Validate"
        </button>
        <button type="button" style={BTN} onClick={remove}>
          Remove "Transform"
        </button>
        <button type="button" style={BTN} onClick={addPort}>
          Add port to "DB Write"
        </button>
        <button type="button" style={BTN} onClick={reset}>
          Reset
        </button>
      </div>

      <div style={COLUMNS}>
        <div style={COL}>
          <div style={SUBHEADING}>Current tree (with nodeHash)</div>
          <pre style={PRE}>{lines.join("\n")}</pre>
        </div>
        <div style={COL}>
          <div style={SUBHEADING}>Mutation log</div>
          <div style={DESCRIPTION}>
            Each entry shows the function call that produced the current tree state.
          </div>
          <pre
            style={PRE}
          >{log.length ? log.join("\n") : "(no mutations yet — click a button above)"}</pre>
        </div>
      </div>
    </div>
  );
}

export function WalkTraversal() {
  const tree = sampleTree();
  const [showLeave, setShowLeave] = useState(false);
  const [skipComposites, setSkipComposites] = useState(false);

  const events: string[] = [];
  walk(tree, {
    enter: (node, parent, depth) => {
      if (skipComposites && node.kind === "composite" && depth > 0) {
        events.push(
          `${"  ".repeat(depth)}ENTER ${node.label} -> SKIP (returning false)`,
        );
        return false;
      }
      events.push(
        `${"  ".repeat(depth)}ENTER ${node.label} (parent: ${
          parent?.label ?? "none"
        }, depth: ${depth})`,
      );
    },
    leave: (node, _parent, depth) => {
      if (showLeave) {
        events.push(`${"  ".repeat(depth)}LEAVE ${node.label}`);
      }
    },
  });

  return (
    <div style={SECTION}>
      <div style={HEADING}>walk() — Depth-First Traversal</div>
      <div style={DESCRIPTION}>
        <code style="color:#a0a0d0;">walk(nodes, visitor)</code>{" "}
        is the general traversal function. The visitor receives{" "}
        <code style="color:#a0a0d0;">enter</code> and <code style="color:#a0a0d0;">leave</code>{" "}
        callbacks with the current node, its parent, and the depth. Returning{" "}
        <code style="color:#a0a0d0;">false</code> from <code style="color:#a0a0d0;">enter</code>
        {" "}
        skips that node's children — useful for collapsing subtrees or pruning traversal.
      </div>

      <div style={CALLOUT}>
        This is the primary integration point for plugins. Codecs use it to emit nodes in order.
        Constraints use it to validate each node in context. Layout uses it bottom-up via{" "}
        <code style="color:#a0a0d0;">leave</code>.
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button
          type="button"
          style={showLeave ? BTN_ACTIVE : BTN}
          onClick={() => setShowLeave((v) => !v)}
        >
          {showLeave ? "Hide" : "Show"} leave events
        </button>
        <button
          type="button"
          style={skipComposites ? BTN_ACTIVE : BTN}
          onClick={() => setSkipComposites((v) => !v)}
        >
          {skipComposites ? "Traversing all" : "Skip nested composites"}
        </button>
      </div>

      <pre style={PRE}>{events.join("\n")}</pre>
    </div>
  );
}

export function FlattenRoundTrip() {
  const tree = sampleTree();
  const flat = flattenTree(tree);
  const rebuilt = buildTree(flat);

  // Deep structural comparison (key-order-independent)
  const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null) return false;
    if (Array.isArray(a)) {
      return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
    }
    if (typeof a === "object") {
      const ka = Object.keys(a as Record<string, unknown>);
      const kb = Object.keys(b as Record<string, unknown>);
      return ka.length === kb.length &&
        ka.every((k) =>
          deepEqual(
            (a as Record<string, unknown>)[k],
            (b as Record<string, unknown>)[k],
          )
        );
    }
    return false;
  };
  const match = deepEqual(tree, rebuilt);

  return (
    <div style={SECTION}>
      <div style={HEADING}>Flatten / Build — Persistence Round-Trip</div>
      <div style={DESCRIPTION}>
        <code style="color:#a0a0d0;">flattenTree</code>{" "}
        converts the recursive rose-tree into flat rows with parent pointers — suitable for storage
        in any tabular backend (SQL, SurrealDB, IndexedDB, etc.).{" "}
        <code style="color:#a0a0d0;">buildTree</code>{" "}
        reconstructs the tree from those rows. Together they provide storage-agnostic persistence.
      </div>

      <div style={CALLOUT}>
        The round-trip is lossless: all fields (ports, data, version, uri) are preserved. The flat
        format uses <code style="color:#a0a0d0;">parent: string | null</code>{" "}
        to encode the tree structure.
      </div>

      <div style={COLUMNS}>
        <div style={COL}>
          <div style={SUBHEADING}>
            flattenTree() {"->"} {flat.length} rows
          </div>
          <pre style={PRE}>
            {flat
              .map((f) => {
                const ports = f.ports?.length ? `, ${f.ports.length} ports` : "";
                return `${f.id} (parent: ${f.parent ?? "null"}, kind: ${f.kind}${ports})`;
              })
              .join("\n")}
          </pre>
        </div>
        <div style={COL}>
          <div style={SUBHEADING}>
            buildTree() round-trip:{" "}
            <span style={match ? "color:#5a5;" : "color:#a55;"}>
              {match ? "MATCH" : "MISMATCH"}
            </span>
          </div>
          <pre style={PRE}>
            {JSON.stringify(rebuilt, null, 2).slice(0, 1200)}
            {JSON.stringify(rebuilt, null, 2).length > 1200 ? "\n..." : ""}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function FactoryFunctions() {
  const leaf = makeNode("my-leaf", "My Leaf", "leaf", []);
  const composite = makeNode("my-group", "My Group", "composite", [
    makeNode("child-1", "Child 1", "leaf", []),
    makeNode("child-2", "Child 2", "leaf", []),
  ]);
  const ref = makeRefNode("my-ref", "My Reference", "target-service");
  const root = makeRootNode("my-root", [composite, leaf, ref], "My Graph");

  const examples = [
    {
      label: 'makeNode("my-leaf", "My Leaf", "leaf", [])',
      desc: "Creates a standard leaf node with no children",
      result: leaf,
    },
    {
      label: 'makeNode("my-group", "My Group", "composite", [child1, child2])',
      desc: "Creates a composite node containing two children",
      result: composite,
    },
    {
      label: 'makeRefNode("my-ref", "My Reference", "target-service")',
      desc: "Creates a reference node — points to another node by ID without duplicating it",
      result: ref,
    },
    {
      label: 'makeRootNode("my-root", [composite, leaf, ref], "My Graph")',
      desc: "Creates a root container wrapping multiple top-level nodes",
      result: root,
    },
  ];

  return (
    <div style={SECTION}>
      <div style={HEADING}>Factory Functions</div>
      <div style={DESCRIPTION}>
        Factory functions create properly-initialized tree nodes. They handle defaults
        (<code style="color:#a0a0d0;">version: 1</code>,{" "}
        <code style="color:#a0a0d0;">data: {"{}"}</code>) and ensure structural correctness
        (reference nodes get <code style="color:#a0a0d0;">type: "ref"</code>, root nodes get{" "}
        <code style="color:#a0a0d0;">kind: "composite"</code>).
      </div>

      {examples.map((ex) => (
        <div key={ex.label} style="margin-bottom:16px;">
          <div style="font-size:12px; font-family:monospace; color:#a0a0d0; margin-bottom:4px;">
            {ex.label}
          </div>
          <div style={DESCRIPTION}>{ex.desc}</div>
          <pre style={PRE}>
            {JSON.stringify(
              { ...ex.result, children: ex.result.children.length ? `[${ex.result.children.length} children]` : "[]" },
              null,
              2,
            )}
          </pre>
        </div>
      ))}
    </div>
  );
}
