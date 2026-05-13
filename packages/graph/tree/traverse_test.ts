import { assert, assertEquals } from "@std/assert";
import type { TreeNode } from "./types.ts";
import {
  collectSubtreeIds,
  findNode,
  findParentOf,
  findPath,
  findSiblings,
  walk,
} from "./traverse.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

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
            { id: "a2", label: "A2", kind: "leaf", children: [], data: {}, version: 1 },
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
// findNode
// ---------------------------------------------------------------------------

Deno.test("findNode — finds root-level node", () => {
  assertEquals(findNode(tree(), "root")?.label, "Root");
});

Deno.test("findNode — finds deeply nested node", () => {
  assertEquals(findNode(tree(), "a1")?.label, "A1");
});

Deno.test("findNode — returns undefined for missing node", () => {
  assertEquals(findNode(tree(), "missing"), undefined);
});

// ---------------------------------------------------------------------------
// findParentOf
// ---------------------------------------------------------------------------

Deno.test("findParentOf — root has no parent", () => {
  assertEquals(findParentOf(tree(), "root"), null);
});

Deno.test("findParentOf — finds parent of nested node", () => {
  assertEquals(findParentOf(tree(), "a1")?.id, "a");
});

Deno.test("findParentOf — finds parent of top-level child", () => {
  assertEquals(findParentOf(tree(), "a")?.id, "root");
});

// ---------------------------------------------------------------------------
// findSiblings
// ---------------------------------------------------------------------------

Deno.test("findSiblings — returns siblings excluding target", () => {
  const sibs = findSiblings(tree(), "a");
  assertEquals(sibs.length, 1);
  assertEquals(sibs[0].id, "b");
});

Deno.test("findSiblings — nested siblings", () => {
  const sibs = findSiblings(tree(), "a1");
  assertEquals(sibs.length, 1);
  assertEquals(sibs[0].id, "a2");
});

Deno.test("findSiblings — root-level node with no siblings", () => {
  const sibs = findSiblings(tree(), "root");
  assertEquals(sibs.length, 0);
});

// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------

Deno.test("findPath — path to root", () => {
  const path = findPath(tree(), "root");
  assertEquals(path.map((n) => n.id), ["root"]);
});

Deno.test("findPath — path to deeply nested node", () => {
  const path = findPath(tree(), "a2");
  assertEquals(path.map((n) => n.id), ["root", "a", "a2"]);
});

Deno.test("findPath — returns empty for missing node", () => {
  assertEquals(findPath(tree(), "missing"), []);
});

// ---------------------------------------------------------------------------
// collectSubtreeIds
// ---------------------------------------------------------------------------

Deno.test("collectSubtreeIds — leaf returns just self", () => {
  const leaf = findNode(tree(), "b")!;
  assertEquals(collectSubtreeIds(leaf), new Set(["b"]));
});

Deno.test("collectSubtreeIds — composite returns all descendants", () => {
  const root = findNode(tree(), "root")!;
  assertEquals(collectSubtreeIds(root), new Set(["root", "a", "a1", "a2", "b"]));
});

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

Deno.test("walk — visits in depth-first order", () => {
  const visited: string[] = [];
  walk(tree(), {
    enter: (node) => {
      visited.push(node.id);
    },
  });
  assertEquals(visited, ["root", "a", "a1", "a2", "b"]);
});

Deno.test("walk — enter returning false skips children", () => {
  const visited: string[] = [];
  walk(tree(), {
    enter: (node) => {
      visited.push(node.id);
      if (node.id === "a") return false;
    },
  });
  assertEquals(visited, ["root", "a", "b"]);
});

Deno.test("walk — leave is called after children", () => {
  const order: string[] = [];
  walk(tree(), {
    enter: (node) => {
      order.push(`enter:${node.id}`);
    },
    leave: (node) => {
      order.push(`leave:${node.id}`);
    },
  });
  assertEquals(order, [
    "enter:root",
    "enter:a",
    "enter:a1",
    "leave:a1",
    "enter:a2",
    "leave:a2",
    "leave:a",
    "enter:b",
    "leave:b",
    "leave:root",
  ]);
});

Deno.test("walk — parent and depth are correct", () => {
  const entries: { id: string; parentId: string | null; depth: number }[] = [];
  walk(tree(), {
    enter: (node, parent, depth) => {
      entries.push({ id: node.id, parentId: parent?.id ?? null, depth });
    },
  });
  assertEquals(entries, [
    { id: "root", parentId: null, depth: 0 },
    { id: "a", parentId: "root", depth: 1 },
    { id: "a1", parentId: "a", depth: 2 },
    { id: "a2", parentId: "a", depth: 2 },
    { id: "b", parentId: "root", depth: 1 },
  ]);
});

Deno.test("walk — skipped children still get leave on parent", () => {
  const leaves: string[] = [];
  walk(tree(), {
    enter: (node) => {
      if (node.id === "a") return false;
    },
    leave: (node) => {
      leaves.push(node.id);
    },
  });
  assert(leaves.includes("a"), "leave should be called on skipped node");
});
