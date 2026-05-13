import { assertEquals } from "@std/assert";
import type { TreeNode } from "./types.ts";
import { removeNodeFromTree, updateNodeInTree } from "./mutate.ts";

function tree(): TreeNode[] {
  return [
    {
      id: "root",
      label: "Root",
      kind: "composite",
      children: [
        {
          id: "a",
          label: "A",
          kind: "composite",
          children: [
            { id: "a1", label: "A1", kind: "leaf", children: [], data: {}, version: 1 },
          ],
          data: {},
          version: 1,
        },
        { id: "b", label: "B", kind: "leaf", children: [], data: {}, version: 1 },
      ],
      data: {},
      version: 1,
    },
  ];
}

// ---------------------------------------------------------------------------
// updateNodeInTree
// ---------------------------------------------------------------------------

Deno.test("updateNodeInTree — updates a nested node", () => {
  const result = updateNodeInTree(tree(), "a1", (n) => ({ ...n, label: "Updated" }));
  assertEquals(result[0].children[0].children[0].label, "Updated");
});

Deno.test("updateNodeInTree — leaves other nodes unchanged", () => {
  const result = updateNodeInTree(tree(), "a1", (n) => ({ ...n, label: "Updated" }));
  assertEquals(result[0].children[1].label, "B");
});

Deno.test("updateNodeInTree — missing node returns tree unchanged", () => {
  const original = tree();
  const result = updateNodeInTree(original, "missing", (n) => ({ ...n, label: "X" }));
  assertEquals(result[0].label, original[0].label);
  assertEquals(result[0].children.length, original[0].children.length);
});

// ---------------------------------------------------------------------------
// removeNodeFromTree
// ---------------------------------------------------------------------------

Deno.test("removeNodeFromTree — removes a leaf node", () => {
  const result = removeNodeFromTree(tree(), "b");
  assertEquals(result[0].children.length, 1);
  assertEquals(result[0].children[0].id, "a");
});

Deno.test("removeNodeFromTree — removing last child demotes parent to leaf", () => {
  const result = removeNodeFromTree(tree(), "a1");
  assertEquals(result[0].children[0].kind, "leaf");
  assertEquals(result[0].children[0].children.length, 0);
});

Deno.test("removeNodeFromTree — removing composite removes it and its subtree", () => {
  const result = removeNodeFromTree(tree(), "a");
  assertEquals(result[0].children.length, 1);
  assertEquals(result[0].children[0].id, "b");
});
