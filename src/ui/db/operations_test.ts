import { assertEquals } from "@std/assert";
import { buildTree, type FlatNode, flattenTree } from "./operations.ts";
import type { TreeNode } from "../workspace.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leaf(id: string, label?: string): TreeNode {
  return {
    id,
    label: label ?? id,
    kind: "leaf",
    children: [],
    data: {},
    version: 1,
  };
}

function composite(id: string, children: TreeNode[], label?: string): TreeNode {
  return {
    id,
    label: label ?? id,
    kind: "composite",
    children,
    data: {},
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

Deno.test("flattenTree: empty list returns empty", () => {
  assertEquals(flattenTree([]), []);
});

Deno.test("flattenTree: single leaf", () => {
  const flat = flattenTree([leaf("a")]);
  assertEquals(flat.length, 1);
  assertEquals(flat[0].id, "a");
  assertEquals(flat[0].parent, null);
  assertEquals(flat[0].kind, "leaf");
});

Deno.test("flattenTree: composite with children", () => {
  const tree = [composite("root", [leaf("c1"), leaf("c2")])];
  const flat = flattenTree(tree);
  assertEquals(flat.length, 3);
  assertEquals(flat[0].id, "root");
  assertEquals(flat[0].parent, null);
  assertEquals(flat[1].id, "c1");
  assertEquals(flat[1].parent, "root");
  assertEquals(flat[2].id, "c2");
  assertEquals(flat[2].parent, "root");
});

Deno.test("flattenTree: nested composites", () => {
  const tree = [composite("a", [composite("b", [leaf("c")])])];
  const flat = flattenTree(tree);
  assertEquals(flat.length, 3);
  assertEquals(flat[0], {
    id: "a",
    label: "a",
    kind: "composite",
    parent: null,
    data: {},
    version: 1,
  });
  assertEquals(flat[1].parent, "a");
  assertEquals(flat[2].parent, "b");
});

Deno.test("flattenTree: multiple roots", () => {
  const tree = [leaf("a"), leaf("b"), leaf("c")];
  const flat = flattenTree(tree);
  assertEquals(flat.length, 3);
  for (const node of flat) {
    assertEquals(node.parent, null);
  }
});

Deno.test("flattenTree: preserves uri and ports", () => {
  const node: TreeNode = {
    id: "x",
    label: "X",
    uri: "spike://test",
    kind: "leaf",
    children: [],
    ports: [{ name: "in", type: "input", direction: "in" }],
    data: { foo: 42 },
    version: 3,
  };
  const flat = flattenTree([node]);
  assertEquals(flat[0].uri, "spike://test");
  assertEquals(flat[0].ports?.length, 1);
  assertEquals(flat[0].data, { foo: 42 });
  assertEquals(flat[0].version, 3);
});

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

Deno.test("buildTree: empty list returns empty", () => {
  assertEquals(buildTree([]), []);
});

Deno.test("buildTree: single root", () => {
  const flat: FlatNode[] = [
    { id: "a", label: "a", kind: "leaf", parent: null, data: {}, version: 1 },
  ];
  const tree = buildTree(flat);
  assertEquals(tree.length, 1);
  assertEquals(tree[0].id, "a");
  assertEquals(tree[0].children, []);
});

Deno.test("buildTree: parent-child relationship", () => {
  const flat: FlatNode[] = [
    { id: "root", label: "root", kind: "composite", parent: null, data: {}, version: 1 },
    { id: "c1", label: "c1", kind: "leaf", parent: "root", data: {}, version: 1 },
    { id: "c2", label: "c2", kind: "leaf", parent: "root", data: {}, version: 1 },
  ];
  const tree = buildTree(flat);
  assertEquals(tree.length, 1);
  assertEquals(tree[0].children.length, 2);
  assertEquals(tree[0].children[0].id, "c1");
  assertEquals(tree[0].children[1].id, "c2");
});

Deno.test("buildTree: deeply nested", () => {
  const flat: FlatNode[] = [
    { id: "a", label: "a", kind: "composite", parent: null, data: {}, version: 1 },
    { id: "b", label: "b", kind: "composite", parent: "a", data: {}, version: 1 },
    { id: "c", label: "c", kind: "leaf", parent: "b", data: {}, version: 1 },
  ];
  const tree = buildTree(flat);
  assertEquals(tree.length, 1);
  assertEquals(tree[0].children[0].id, "b");
  assertEquals(tree[0].children[0].children[0].id, "c");
  assertEquals(tree[0].children[0].children[0].children, []);
});

Deno.test("buildTree: multiple roots", () => {
  const flat: FlatNode[] = [
    { id: "a", label: "a", kind: "leaf", parent: null, data: {}, version: 1 },
    { id: "b", label: "b", kind: "leaf", parent: null, data: {}, version: 1 },
  ];
  const tree = buildTree(flat);
  assertEquals(tree.length, 2);
});

Deno.test("buildTree: preserves optional fields", () => {
  const flat: FlatNode[] = [
    {
      id: "x",
      label: "X",
      uri: "spike://test",
      kind: "leaf",
      parent: null,
      ports: [{ name: "in", type: "input", direction: "in" }],
      data: { foo: 42 },
      version: 3,
    },
  ];
  const tree = buildTree(flat);
  assertEquals(tree[0].uri, "spike://test");
  assertEquals(tree[0].ports?.length, 1);
  assertEquals(tree[0].data, { foo: 42 });
  assertEquals(tree[0].version, 3);
});

// ---------------------------------------------------------------------------
// Round-trip: flattenTree → buildTree
// ---------------------------------------------------------------------------

Deno.test("round-trip: single leaf", () => {
  const original = [leaf("a")];
  const result = buildTree(flattenTree(original));
  assertEquals(result.length, 1);
  assertEquals(result[0].id, "a");
  assertEquals(result[0].children, []);
});

Deno.test("round-trip: composite with children", () => {
  const original = [composite("root", [leaf("c1"), leaf("c2")])];
  const result = buildTree(flattenTree(original));
  assertEquals(result.length, 1);
  assertEquals(result[0].id, "root");
  assertEquals(result[0].children.length, 2);
  assertEquals(result[0].children[0].id, "c1");
  assertEquals(result[0].children[1].id, "c2");
});

Deno.test("round-trip: three levels deep", () => {
  const original = [
    composite("a", [
      composite("b", [leaf("c"), leaf("d")]),
      leaf("e"),
    ]),
  ];
  const result = buildTree(flattenTree(original));
  assertEquals(result.length, 1);
  assertEquals(result[0].children.length, 2);
  assertEquals(result[0].children[0].children.length, 2);
  assertEquals(result[0].children[0].children[0].id, "c");
  assertEquals(result[0].children[0].children[1].id, "d");
  assertEquals(result[0].children[1].id, "e");
  assertEquals(result[0].children[1].children, []);
});

Deno.test("round-trip: multiple roots with mixed nesting", () => {
  const original = [
    composite("r1", [leaf("a"), composite("b", [leaf("c")])]),
    leaf("r2"),
    composite("r3", [leaf("d")]),
  ];
  const result = buildTree(flattenTree(original));
  assertEquals(result.length, 3);
  assertEquals(result[0].children.length, 2);
  assertEquals(result[0].children[1].children[0].id, "c");
  assertEquals(result[1].children, []);
  assertEquals(result[2].children.length, 1);
});

Deno.test("round-trip: preserves all fields", () => {
  const original: TreeNode[] = [{
    id: "x",
    label: "Test Node",
    uri: "spike://acme/test",
    kind: "composite",
    children: [{
      id: "y",
      label: "Child",
      kind: "leaf",
      children: [],
      ports: [{ name: "out", type: "output", direction: "out" }],
      data: { key: "value" },
      version: 2,
    }],
    ports: [{ name: "in", type: "input", direction: "in" }],
    data: { count: 7 },
    version: 5,
  }];
  const result = buildTree(flattenTree(original));
  assertEquals(result[0].label, "Test Node");
  assertEquals(result[0].uri, "spike://acme/test");
  assertEquals(result[0].version, 5);
  assertEquals(result[0].data, { count: 7 });
  assertEquals(result[0].ports?.length, 1);
  assertEquals(result[0].children[0].label, "Child");
  assertEquals(result[0].children[0].version, 2);
  assertEquals(result[0].children[0].ports?.[0].name, "out");
});
