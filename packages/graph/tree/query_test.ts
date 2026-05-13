import { assertEquals } from "@std/assert";
import type { Edge, TreeNode } from "./types.ts";
import { edgesInScope, getEdgesIn, getEdgesOut, nodeHash } from "./query.ts";

function edges(): Edge[] {
  return [
    { id: "e1", fromId: "a", toId: "b", label: "x", data: {}, version: 1 },
    { id: "e2", fromId: "b", toId: "c", label: "y", data: {}, version: 1 },
    { id: "e3", fromId: "a", toId: "c", label: "z", data: {}, version: 1 },
  ];
}

// ---------------------------------------------------------------------------
// getEdgesIn / getEdgesOut
// ---------------------------------------------------------------------------

Deno.test("getEdgesIn — filters by toId", () => {
  const result = getEdgesIn(edges(), "c");
  assertEquals(result.map((e) => e.id), ["e2", "e3"]);
});

Deno.test("getEdgesOut — filters by fromId", () => {
  const result = getEdgesOut(edges(), "a");
  assertEquals(result.map((e) => e.id), ["e1", "e3"]);
});

Deno.test("getEdgesIn — returns empty for unconnected node", () => {
  assertEquals(getEdgesIn(edges(), "a"), []);
});

// ---------------------------------------------------------------------------
// edgesInScope
// ---------------------------------------------------------------------------

Deno.test("edgesInScope — returns only sibling-to-sibling edges", () => {
  const parent: TreeNode = {
    id: "parent",
    label: "Parent",
    kind: "composite",
    children: [
      { id: "a", label: "A", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "b", label: "B", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  const result = edgesInScope(parent, edges());
  assertEquals(result.map((e) => e.id), ["e1"]);
});

Deno.test("edgesInScope — excludes cross-scope edges", () => {
  const parent: TreeNode = {
    id: "parent",
    label: "Parent",
    kind: "composite",
    children: [
      { id: "a", label: "A", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  // Only "a" is a child; edges to "b" and "c" are cross-scope
  assertEquals(edgesInScope(parent, edges()), []);
});

// ---------------------------------------------------------------------------
// nodeHash
// ---------------------------------------------------------------------------

Deno.test("nodeHash — deterministic for same node", () => {
  const node: TreeNode = {
    id: "x",
    label: "X",
    kind: "leaf",
    children: [],
    data: { foo: 1 },
    version: 1,
  };
  assertEquals(nodeHash(node), nodeHash(node));
});

Deno.test("nodeHash — changes when label changes", () => {
  const a: TreeNode = {
    id: "x",
    label: "A",
    kind: "leaf",
    children: [],
    data: {},
    version: 1,
  };
  const b: TreeNode = { ...a, label: "B" };
  const hashA = nodeHash(a);
  const hashB = nodeHash(b);
  assertEquals(hashA !== hashB, true);
});
