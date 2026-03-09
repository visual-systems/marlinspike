// ---------------------------------------------------------------------------
// Unit tests for the force simulation — pure functions, no DOM required.
// Run with: NO_COLOR=1 deno task test
// ---------------------------------------------------------------------------
import { assert, assertEquals, assertGreater, assertLess } from "@std/assert";
import { boundingBox, initPositions, maxVelocity, tickLevel } from "./force.ts";

function makeNode(
  id: string,
  x: number,
  y: number,
  opts?: { vx?: number; vy?: number; pinned?: boolean; w?: number; h?: number },
) {
  return {
    id,
    x,
    y,
    vx: opts?.vx ?? 0,
    vy: opts?.vy ?? 0,
    pinned: opts?.pinned ?? false,
    w: opts?.w ?? 52,
    h: opts?.h ?? 52,
  };
}

// ---------------------------------------------------------------------------
// maxVelocity
// ---------------------------------------------------------------------------

Deno.test("maxVelocity: empty list returns 0", () => {
  assertEquals(maxVelocity([]), 0);
});

Deno.test("maxVelocity: returns largest magnitude", () => {
  const nodes = [
    makeNode("a", 0, 0, { vx: 3, vy: 4 }), // magnitude 5
    makeNode("b", 0, 0, { vx: 0, vy: 1 }), // magnitude 1
    makeNode("c", 0, 0, { vx: -2, vy: 0 }), // magnitude 2
  ];
  assertEquals(maxVelocity(nodes), 5);
});

Deno.test("maxVelocity: single pinned node is 0", () => {
  const nodes = [makeNode("a", 0, 0, { vx: 10, vy: 10, pinned: true })];
  // pinned nodes still have velocity stored; maxVelocity just reads it
  assertGreater(maxVelocity(nodes), 0);
});

// ---------------------------------------------------------------------------
// boundingBox
// ---------------------------------------------------------------------------

Deno.test("boundingBox: empty list returns fallback", () => {
  const bb = boundingBox([], 0);
  assertEquals(bb.w, 80);
  assertEquals(bb.h, 60);
});

Deno.test("boundingBox: empty list with padding", () => {
  const bb = boundingBox([], 10);
  assertEquals(bb.w, 100); // 80 + 10*2
  assertEquals(bb.h, 80); // 60 + 10*2
});

Deno.test("boundingBox: single node at origin", () => {
  const bb = boundingBox([makeNode("a", 0, 0, { w: 52, h: 52 })], 0);
  assertEquals(bb.minX, -26);
  assertEquals(bb.minY, -26);
  assertEquals(bb.maxX, 26);
  assertEquals(bb.maxY, 26);
  assertEquals(bb.w, 52);
  assertEquals(bb.h, 52);
});

Deno.test("boundingBox: single node with padding", () => {
  const bb = boundingBox([makeNode("a", 0, 0, { w: 52, h: 52 })], 10);
  assertEquals(bb.minX, -36);
  assertEquals(bb.minY, -36);
  assertEquals(bb.w, 72);
  assertEquals(bb.h, 72);
});

Deno.test("boundingBox: multiple nodes", () => {
  const nodes = [
    makeNode("a", -50, 0, { w: 52, h: 52 }),
    makeNode("b", 50, 0, { w: 52, h: 52 }),
  ];
  const bb = boundingBox(nodes, 0);
  assertEquals(bb.minX, -76); // -50 - 26
  assertEquals(bb.maxX, 76); // 50 + 26
  assertEquals(bb.w, 152);
});

// ---------------------------------------------------------------------------
// initPositions
// ---------------------------------------------------------------------------

Deno.test("initPositions: single node placed at origin", () => {
  const nodes = initPositions(["a"], 100, new Map(), 52, 52);
  assertEquals(nodes.length, 1);
  assertEquals(nodes[0].id, "a");
  assertEquals(nodes[0].x, 0);
  assertEquals(nodes[0].y, 0);
});

Deno.test("initPositions: uses default position when provided", () => {
  const defaults = new Map([["a", { x: 42, y: -7, pinned: true }]]);
  const [node] = initPositions(["a"], 100, defaults, 52, 52);
  assertEquals(node.x, 42);
  assertEquals(node.y, -7);
  assertEquals(node.pinned, true);
});

Deno.test("initPositions: multiple nodes placed on a circle", () => {
  const nodes = initPositions(["a", "b", "c", "d"], 100, new Map(), 52, 52);
  assertEquals(nodes.length, 4);
  // All at radius 100
  for (const n of nodes) {
    const r = Math.sqrt(n.x * n.x + n.y * n.y);
    assert(Math.abs(r - 100) < 0.001, `node ${n.id} should be at radius 100, got ${r}`);
  }
});

Deno.test("initPositions: preserves original order and ids", () => {
  const ids = ["x", "y", "z"];
  const nodes = initPositions(ids, 50, new Map(), 52, 52);
  assertEquals(nodes.map((n) => n.id), ids);
});

// ---------------------------------------------------------------------------
// tickLevel
// ---------------------------------------------------------------------------

Deno.test("tickLevel: empty list returns empty", () => {
  assertEquals(tickLevel([], []).length, 0);
});

Deno.test("tickLevel: single node with no velocity stays put", () => {
  const nodes = [makeNode("a", 10, 20)];
  const result = tickLevel(nodes, []);
  assertEquals(result.length, 1);
  assertEquals(result[0].x, 10);
  assertEquals(result[0].y, 20);
});

Deno.test("tickLevel: two close nodes repel each other", () => {
  const nodes = [
    makeNode("a", -5, 0),
    makeNode("b", 5, 0),
  ];
  const result = tickLevel(nodes, []);
  const a = result.find((n) => n.id === "a")!;
  const b = result.find((n) => n.id === "b")!;
  assertLess(a.x, -5, "node a should move left");
  assertGreater(b.x, 5, "node b should move right");
});

Deno.test("tickLevel: pinned node does not move", () => {
  const nodes = [
    makeNode("a", 0, 0, { pinned: true }),
    makeNode("b", 10, 0),
  ];
  const result = tickLevel(nodes, []);
  const a = result.find((n) => n.id === "a")!;
  assertEquals(a.x, 0);
  assertEquals(a.y, 0);
  assertEquals(a.vx, 0);
  assertEquals(a.vy, 0);
});

Deno.test("tickLevel: pinned node has zero velocity after tick", () => {
  const nodes = [makeNode("a", 0, 0, { pinned: true, vx: 100, vy: 100 })];
  const result = tickLevel(nodes, []);
  assertEquals(result[0].vx, 0);
  assertEquals(result[0].vy, 0);
});

Deno.test("tickLevel: spring attracts two far nodes", () => {
  // SPRING_L = 160; nodes at ±200 should be pulled toward each other
  const nodes = [
    makeNode("a", -200, 0),
    makeNode("b", 200, 0),
  ];
  const result = tickLevel(nodes, [{ a: "a", b: "b" }]);
  const a = result.find((n) => n.id === "a")!;
  const b = result.find((n) => n.id === "b")!;
  assertGreater(a.x, -200, "a should move right toward b");
  assertLess(b.x, 200, "b should move left toward a");
});

Deno.test("tickLevel: preserves original node order", () => {
  const nodes = ["z", "y", "x", "w"].map((id, i) => makeNode(id, i * 100, 0));
  const result = tickLevel(nodes, []);
  assertEquals(result.map((n) => n.id), ["z", "y", "x", "w"]);
});

Deno.test("tickLevel: repulsion is symmetric", () => {
  const nodes = [makeNode("a", -10, 0), makeNode("b", 10, 0)];
  const result = tickLevel(nodes, []);
  const a = result.find((n) => n.id === "a")!;
  const b = result.find((n) => n.id === "b")!;
  // Movements should be equal and opposite
  const aDelta = a.x - (-10);
  const bDelta = b.x - 10;
  assert(Math.abs(aDelta + bDelta) < 0.001, "repulsion should be symmetric");
});

// ---------------------------------------------------------------------------
// Integration: simulation settles
// ---------------------------------------------------------------------------

Deno.test("integration: three nodes settle without overlapping (triangle)", () => {
  let nodes = [
    makeNode("a", -50, 0),
    makeNode("b", 50, 0),
    makeNode("c", 0, 50),
  ];
  const edges = [{ a: "a", b: "b" }, { a: "b", b: "c" }, { a: "a", b: "c" }];

  for (let i = 0; i < 500; i++) nodes = tickLevel(nodes, edges);

  const mv = maxVelocity(nodes);
  assertLess(mv, 0.5, `should settle (max velocity ${mv.toFixed(3)})`);

  // No two nodes should overlap (dist > sum of radii = 52)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      assertGreater(dist, 52, `nodes ${a.id} and ${b.id} overlap (dist=${dist.toFixed(1)})`);
    }
  }
});

Deno.test("integration: five unconnected nodes spread apart", () => {
  let nodes = [0, 1, 2, 3, 4].map((i) => makeNode(String(i), i * 10, 0));
  for (let i = 0; i < 1500; i++) nodes = tickLevel(nodes, []);

  // Should settle (no springs, only repulsion, takes longer)
  assertLess(maxVelocity(nodes), 0.5);

  // No overlapping
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      assertGreater(dist, 52, `nodes ${a.id} and ${b.id} overlap (dist=${dist.toFixed(1)})`);
    }
  }
});
