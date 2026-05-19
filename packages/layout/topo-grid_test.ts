import { assertEquals } from "@std/assert";
import { topoGridLayoutLTR, topoGridLayoutSizedLTR } from "./topo-grid.ts";

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
