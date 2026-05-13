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
  makeNode,
  makeRefNode,
  makeRootNode,
  nodeHash,
  removeNodeFromTree,
  updateNodeInTree,
  walk,
} from "@marlinspike/graph";
import type { Edge, TreeNode } from "@marlinspike/graph";

export const meta = { title: "Package: @marlinspike/graph" };

// ---------------------------------------------------------------------------
// Styles (Hono JSX DOM uses CSS strings, not style objects)
// ---------------------------------------------------------------------------

const PRE =
  "background:#0f0f22; padding:12px; border-radius:4px; font-size:12px; line-height:1.5; overflow:auto; max-height:400px; white-space:pre-wrap; font-family:monospace;";

const SECTION = "margin-bottom:24px;";

const HEADING = "font-size:14px; font-weight:bold; margin-bottom:8px; color:#a0a0d0;";

const LABEL = "font-size:11px; color:#888; margin-bottom:4px;";

const BTN =
  "background:#2a2a4a; color:#e0e0e0; border:1px solid #3a3a5a; border-radius:4px; padding:4px 10px; cursor:pointer; font-size:12px;";

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
  const dbWrite = makeNode("db-write", "DB Write", "leaf", []);

  const pipeline = makeNode("pipeline", "Request Pipeline", "composite", [
    httpIn,
    validate,
    transform,
    dbWrite,
  ]);

  const logger = makeRefNode("logger-ref", "Logger", "logger-service");

  return [makeRootNode("root", [pipeline, logger], "API Service")];
}

function sampleEdges(): Edge[] {
  return [
    { id: "e1", fromId: "http-in", toId: "validate", label: "request", data: {}, version: 1 },
    { id: "e2", fromId: "validate", toId: "transform", label: "validated", data: {}, version: 1 },
    { id: "e3", fromId: "transform", toId: "db-write", label: "record", data: {}, version: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export function TreeStructure() {
  const tree = sampleTree();

  const lines: string[] = [];
  walk(tree, {
    enter: (node, _parent, depth) => {
      const indent = "  ".repeat(depth);
      const kind = node.kind === "composite" ? "+" : "-";
      const ref = node.type === "ref" ? ` -> ref:${node.ref}` : "";
      const ports = node.ports?.length
        ? ` [${node.ports.map((p) => `${p.direction}:${p.name}`).join(", ")}]`
        : "";
      lines.push(`${indent}${kind} ${node.label} (${node.id})${ref}${ports}`);
    },
  });

  return (
    <div style={SECTION}>
      <div style={HEADING}>Rose-tree structure via walk()</div>
      <div style={LABEL}>
        + = composite, - = leaf, ports shown in brackets, refs shown with arrow
      </div>
      <pre style={PRE}>{lines.join("\n")}</pre>
    </div>
  );
}

export function TraversalQueries() {
  const tree = sampleTree();
  const edges = sampleEdges();

  const found = findNode(tree, "validate");
  const parent = findParentOf(tree, "validate");
  const siblings = findSiblings(tree, "validate");
  const path = findPath(tree, "db-write");
  const subtreeIds = collectSubtreeIds(findNode(tree, "pipeline")!);

  const pipeline = findNode(tree, "pipeline")!;
  const scoped = edgesInScope(pipeline, edges);

  return (
    <div style={SECTION}>
      <div style={HEADING}>Traversal & query results</div>
      <pre style={PRE}>
        {[
          `findNode("validate"):     ${found?.label} (kind: ${found?.kind})`,
          `findParentOf("validate"): ${parent?.label}`,
          `findSiblings("validate"): [${siblings.map((s) => s.label).join(", ")}]`,
          `findPath("db-write"):     [${path.map((n) => n.label).join(" > ")}]`,
          `collectSubtreeIds("pipeline"): {${[...subtreeIds].join(", ")}}`,
          ``,
          `edgesInScope("pipeline"): ${scoped.length} edges`,
          ...scoped.map((e) => `  ${e.fromId} --${e.label}--> ${e.toId}`),
        ].join("\n")}
      </pre>
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
    addLog(`Renamed "validate" to "${newName}"`);
  };

  const remove = () => {
    setTree((t) => removeNodeFromTree(t, "transform"));
    addLog(`Removed "transform" node`);
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
      lines.push(`${indent}${node.label} [${hash}]`);
    },
  });

  return (
    <div style={SECTION}>
      <div style={HEADING}>Immutable mutations</div>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <button type="button" style={BTN} onClick={rename}>
          Rename Validate
        </button>
        <button type="button" style={BTN} onClick={remove}>
          Remove Transform
        </button>
        <button type="button" style={BTN} onClick={reset}>
          Reset
        </button>
      </div>
      <div style="display:flex; gap:16px;">
        <div style="flex:1;">
          <div style={LABEL}>Current tree (with nodeHash)</div>
          <pre style={PRE}>{lines.join("\n")}</pre>
        </div>
        <div style="flex:1;">
          <div style={LABEL}>Mutation log</div>
          <pre style={PRE}>{log.length ? log.join("\n") : "(no mutations yet)"}</pre>
        </div>
      </div>
    </div>
  );
}

export function FlattenRoundTrip() {
  const tree = sampleTree();
  const flat = flattenTree(tree);
  const rebuilt = buildTree(flat);

  const match = JSON.stringify(tree) === JSON.stringify(rebuilt);

  return (
    <div style={SECTION}>
      <div style={HEADING}>Flatten / Build round-trip</div>
      <div style="display:flex; gap:16px;">
        <div style="flex:1;">
          <div style={LABEL}>flattenTree() {"->"} {flat.length} rows</div>
          <pre style={PRE}>
            {flat
              .map(
                (f) =>
                  `${f.id} (parent: ${f.parent ?? "null"}, kind: ${f.kind})`,
              )
              .join("\n")}
          </pre>
        </div>
        <div style="flex:1;">
          <div style={LABEL}>
            buildTree() round-trip: {match ? "MATCH" : "MISMATCH"}
          </div>
          <pre style={PRE}>
            {JSON.stringify(rebuilt, null, 2).slice(0, 800)}
            {JSON.stringify(rebuilt, null, 2).length > 800 ? "\n..." : ""}
          </pre>
        </div>
      </div>
    </div>
  );
}
