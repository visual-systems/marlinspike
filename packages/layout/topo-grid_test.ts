import { assertEquals } from "@std/assert";
import { topoGridLayout, topoGridLayoutLTR, topoGridLayoutSizedLTR } from "./topo-grid.ts";

// ---------------------------------------------------------------------------
// topoGridLayoutLTR
// ---------------------------------------------------------------------------

Deno.test("topoGridLayoutLTR: empty graph", () => {
  const result = topoGridLayoutLTR([], [], 52, 52, 160, 100);
  assertEquals(result.length, 0);
});

Deno.test("topoGridLayoutLTR: single node at origin", () => {
  const result = topoGridLayoutLTR(["A"], [], 52, 52, 160, 100);
  assertEquals(result.length, 1);
  assertEquals(result[0].x, 0);
  assertEquals(result[0].y, 0);
});

Deno.test("topoGridLayoutLTR: chain A→B→C — layers go left to right", () => {
  const nodes = topoGridLayoutLTR(
    ["A", "B", "C"],
    [{ a: "A", b: "B" }, { a: "B", b: "C" }],
    52,
    52,
    160,
    100,
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A is layer 0 (leftmost), B is layer 1, C is layer 2 (rightmost)
  assertEquals(byId.get("A")!.x < byId.get("B")!.x, true);
  assertEquals(byId.get("B")!.x < byId.get("C")!.x, true);
  // All on same y (single node per layer)
  assertEquals(byId.get("A")!.y, byId.get("B")!.y);
  assertEquals(byId.get("B")!.y, byId.get("C")!.y);
});

Deno.test("topoGridLayoutLTR: two nodes in same layer — stacked vertically", () => {
  // A→C, B→C — A and B are both in layer 0, C in layer 1
  const nodes = topoGridLayoutLTR(
    ["A", "B", "C"],
    [{ a: "A", b: "C" }, { a: "B", b: "C" }],
    52,
    52,
    160,
    100,
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // A and B same x (same layer), different y
  assertEquals(byId.get("A")!.x, byId.get("B")!.x);
  assertEquals(byId.get("A")!.y !== byId.get("B")!.y, true);
  // C is to the right
  assertEquals(byId.get("C")!.x > byId.get("A")!.x, true);
});

// ---------------------------------------------------------------------------
// topoGridLayoutSizedLTR
// ---------------------------------------------------------------------------

Deno.test("topoGridLayoutSizedLTR: preserves node fields", () => {
  const input = [
    { id: "A", x: 0, y: 0, vx: 1, vy: 2, pinned: true, w: 52, h: 52, charge: -1 },
    { id: "B", x: 0, y: 0, vx: 3, vy: 4, pinned: false, w: 100, h: 80, charge: 1 },
  ];
  const result = topoGridLayoutSizedLTR(input, [{ a: "A", b: "B" }], 30, 30);
  // Non-positional fields preserved
  assertEquals(result[0].vx, 1);
  assertEquals(result[0].pinned, true);
  assertEquals(result[0].charge, -1);
  assertEquals(result[1].vx, 3);
  assertEquals(result[1].w, 100);
  // A (layer 0) is to the left of B (layer 1)
  assertEquals(result[0].x < result[1].x, true);
});

Deno.test("topoGridLayoutSizedLTR: wider nodes get more horizontal space", () => {
  const input = [
    { id: "A", x: 0, y: 0, vx: 0, vy: 0, pinned: false, w: 200, h: 52 },
    { id: "B", x: 0, y: 0, vx: 0, vy: 0, pinned: false, w: 52, h: 52 },
  ];
  const result = topoGridLayoutSizedLTR(input, [{ a: "A", b: "B" }], 30, 30);
  // Gap between A and B centres should account for A's width
  const gap = result[1].x - result[0].x;
  assertEquals(gap >= 200 / 2 + 30 + 52 / 2, true);
});

// ---------------------------------------------------------------------------
// Edge crossing minimization
// ---------------------------------------------------------------------------

Deno.test("crossing minimization: diamond graph has zero crossings", () => {
  // a→b, a→c, b→d, c→d — layer 0=[a], layer 1=[b,c], layer 2=[d]
  const nodes = topoGridLayout(
    ["a", "b", "c", "d"],
    [{ a: "a", b: "b" }, { a: "a", b: "c" }, { a: "b", b: "d" }, { a: "c", b: "d" }],
    52,
    52,
    160,
    130,
  );
  // With only one node in layer 0 and one in layer 2, no crossings are possible.
  // Just verify the layout completes and layers are correct.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assertEquals(byId.get("a")!.y < byId.get("b")!.y, true); // a in layer 0, b in layer 1
  assertEquals(byId.get("b")!.y < byId.get("d")!.y, true); // b in layer 1, d in layer 2
});

Deno.test("crossing minimization: reorders to avoid crossings", () => {
  // Layer 0: [a, b] (fixed order)
  // Layer 1: [c, d] — edges: a→d, b→c
  // Input order [c, d] would cross (a→d crosses b→c). Should reorder to [d, c].
  const nodes = topoGridLayout(
    ["a", "b", "c", "d"],
    [{ a: "a", b: "d" }, { a: "b", b: "c" }],
    52,
    52,
    160,
    130,
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // a and b in layer 0, d and c in layer 1
  // After minimization: d should be above c (same side as a) to avoid crossing
  // a is above b (first in input), a→d means d should be above c
  assertEquals(byId.get("a")!.x < byId.get("b")!.x, true, "a left of b in layer 0");
  assertEquals(byId.get("d")!.x < byId.get("c")!.x, true, "d left of c after reorder");
});

Deno.test("crossing minimization: disconnected nodes stay stable", () => {
  // a→c, b has no edges — b should not cause issues
  const nodes = topoGridLayout(
    ["a", "b", "c"],
    [{ a: "a", b: "c" }],
    52,
    52,
    160,
    130,
  );
  // Should complete without error; b is in layer 0 with a, c in layer 1
  assertEquals(nodes.length, 3);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  assertEquals(byId.get("c")!.y > byId.get("a")!.y, true, "c in later layer than a");
});

Deno.test("crossing minimization: large layer uses barycenter without crashing", () => {
  // Layer 0: [root], Layer 1: [n0..n9] — 10 nodes, exceeds permutation threshold
  const ids = ["root", ...Array.from({ length: 10 }, (_, i) => `n${i}`)];
  const edges = Array.from({ length: 10 }, (_, i) => ({ a: "root", b: `n${i}` }));
  const nodes = topoGridLayout(ids, edges, 52, 52, 160, 130);
  assertEquals(nodes.length, 11);
  // All n* nodes should be in layer 1 (same y, different x)
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let i = 0; i < 10; i++) {
    assertEquals(byId.get(`n${i}`)!.y > byId.get("root")!.y, true);
  }
});
