// ---------------------------------------------------------------------------
// Property-based tests — layout invariants that hold across all algorithms
// ---------------------------------------------------------------------------
import { assert, assertEquals, assertGreater, assertLess } from "@std/assert";
import { surfaceToSurface } from "@marlinspike/canvas";
import {
  boundingBox,
  centerNodes,
  createFIELD,
  createJANK,
  createSDF,
  createTOPOGRID,
  DEFAULT_FIELD_CONFIG,
  DEFAULT_JANK_CONFIG,
  DEFAULT_SDF_CONFIG,
  DEFAULT_TOPOGRID_CONFIG,
  type ForceEdge,
  type ForceNode,
  type LayoutAlgorithm,
  maxVelocity,
  topoCharge,
  topoGridLayout,
} from "./mod.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, x: number, y: number, w = 52, h = 52): ForceNode {
  return { id, x, y, vx: 0, vy: 0, pinned: false, w, h };
}

/** Run an algorithm until settled or maxTicks, returning final nodes. */
function runUntilSettled(
  algo: LayoutAlgorithm,
  ids: string[],
  edges: ForceEdge[],
  maxTicks = 1000,
): ForceNode[] {
  let nodes = algo.initNodes(ids, edges, 52, 52, new Map());
  for (let t = 0; t < maxTicks; t++) {
    const result = algo.tick(nodes, edges, t);
    nodes = result.nodes;
    if (result.settled) break;
  }
  return nodes;
}

// Graph fixtures
const chain3Edges: ForceEdge[] = [{ a: "A", b: "B" }, { a: "B", b: "C" }];
const chain3Ids = ["A", "B", "C"];
const diamond4Edges: ForceEdge[] = [
  { a: "A", b: "B" },
  { a: "A", b: "C" },
  { a: "B", b: "D" },
  { a: "C", b: "D" },
];
const diamond4Ids = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------
// 1. No overlap after settlement (SDF-based algorithms)
// ---------------------------------------------------------------------------

Deno.test("property: no overlap after SDF settlement (chain)", () => {
  const algo = createSDF(DEFAULT_SDF_CONFIG);
  const nodes = runUntilSettled(algo, chain3Ids, chain3Edges);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const s = surfaceToSurface(nodes[i], nodes[j], 0.05);
      assertGreater(s, -1, `nodes ${nodes[i].id} and ${nodes[j].id} overlap (s2s=${s.toFixed(1)})`);
    }
  }
});

Deno.test("property: no overlap after SDF settlement (diamond)", () => {
  const algo = createSDF(DEFAULT_SDF_CONFIG);
  const nodes = runUntilSettled(algo, diamond4Ids, diamond4Edges);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const s = surfaceToSurface(nodes[i], nodes[j], 0.05);
      assertGreater(s, -1, `nodes ${nodes[i].id} and ${nodes[j].id} overlap (s2s=${s.toFixed(1)})`);
    }
  }
});

Deno.test("property: no overlap after FIELD settlement (diamond)", () => {
  const algo = createFIELD(DEFAULT_FIELD_CONFIG);
  const nodes = runUntilSettled(algo, diamond4Ids, diamond4Edges);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const s = surfaceToSurface(nodes[i], nodes[j], 0.05);
      assertGreater(s, -1, `nodes ${nodes[i].id} and ${nodes[j].id} overlap (s2s=${s.toFixed(1)})`);
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Bounding box contains all non-anchored nodes
// ---------------------------------------------------------------------------

Deno.test("property: boundingBox contains all nodes", () => {
  const nodes = [
    makeNode("a", -100, 50, 60, 40),
    makeNode("b", 80, -30, 52, 52),
    makeNode("c", 0, 0, 100, 80),
  ];
  const bb = boundingBox(nodes, 10);
  for (const n of nodes) {
    assert(n.x - n.w / 2 >= bb.minX, `node ${n.id} left edge outside bbox`);
    assert(n.y - n.h / 2 >= bb.minY, `node ${n.id} top edge outside bbox`);
    assert(n.x + n.w / 2 <= bb.maxX, `node ${n.id} right edge outside bbox`);
    assert(n.y + n.h / 2 <= bb.maxY, `node ${n.id} bottom edge outside bbox`);
  }
});

Deno.test("property: boundingBox excludes anchored nodes", () => {
  const nodes: ForceNode[] = [
    makeNode("interior", 0, 0),
    { ...makeNode("port", 200, 0), anchor: { x: 200, y: 0 } },
  ];
  const bb = boundingBox(nodes, 0);
  // Interior node at (0,0) w=52: bounds -26 to 26
  assertEquals(bb.minX, -26);
  assertEquals(bb.maxX, 26);
});

// ---------------------------------------------------------------------------
// 3. Center invariant: centroid near (0,0) after centerNodes
// ---------------------------------------------------------------------------

Deno.test("property: centerNodes puts centroid near origin", () => {
  const nodes = [
    makeNode("a", 100, 200),
    makeNode("b", 300, 400),
    makeNode("c", 200, 300),
  ];
  const centered = centerNodes(nodes);
  const bb = boundingBox(centered, 0);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  assertLess(Math.abs(cx), 1, `centroid x should be near 0, got ${cx}`);
  assertLess(Math.abs(cy), 1, `centroid y should be near 0, got ${cy}`);
});

// ---------------------------------------------------------------------------
// 4. TOPOGRID determinism: same input → identical output
// ---------------------------------------------------------------------------

Deno.test("property: TOPOGRID is deterministic", () => {
  const ids = ["A", "B", "C", "D"];
  const edges: ForceEdge[] = [{ a: "A", b: "B" }, { a: "A", b: "C" }, { a: "C", b: "D" }];
  const run1 = topoGridLayout(ids, edges, 52, 52, 160, 130);
  const run2 = topoGridLayout(ids, edges, 52, 52, 160, 130);
  assertEquals(run1.length, run2.length);
  for (let i = 0; i < run1.length; i++) {
    assertEquals(run1[i].id, run2[i].id);
    assertEquals(run1[i].x, run2[i].x);
    assertEquals(run1[i].y, run2[i].y);
  }
});

// ---------------------------------------------------------------------------
// 5. Topological ordering: edge a→b implies layer(a) < layer(b) in TOPOGRID
// ---------------------------------------------------------------------------

Deno.test("property: TOPOGRID respects topological order", () => {
  const algo = createTOPOGRID(DEFAULT_TOPOGRID_CONFIG);
  const ids = ["A", "B", "C", "D"];
  const edges: ForceEdge[] = [{ a: "A", b: "B" }, { a: "B", b: "C" }, { a: "A", b: "D" }];
  const nodes = algo.initNodes(ids, edges, 52, 52, new Map());
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // In top-down layout: A at top (smallest y), then B/D, then C
  for (const e of edges) {
    const from = byId.get(e.a)!;
    const to = byId.get(e.b)!;
    assertLess(
      from.y,
      to.y,
      `edge ${e.a}→${e.b}: from.y (${from.y}) should be less than to.y (${to.y})`,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. Charge range: topoCharge always returns values in [-1, +1]
// ---------------------------------------------------------------------------

Deno.test("property: topoCharge values in [-1, +1]", () => {
  const ids = ["A", "B", "C", "D", "E"];
  const edges: ForceEdge[] = [
    { a: "A", b: "B" },
    { a: "B", b: "C" },
    { a: "C", b: "D" },
    { a: "D", b: "E" },
    { a: "A", b: "E" }, // skip edge
  ];
  const charges = topoCharge(ids, edges);
  for (const [id, charge] of charges) {
    assert(charge >= -1, `charge for ${id} below -1: ${charge}`);
    assert(charge <= 1, `charge for ${id} above +1: ${charge}`);
  }
});

Deno.test("property: topoCharge values in [-1, +1] with cycles", () => {
  const ids = ["A", "B", "C"];
  const edges: ForceEdge[] = [
    { a: "A", b: "B" },
    { a: "B", b: "C" },
    { a: "C", b: "A" }, // cycle
  ];
  const charges = topoCharge(ids, edges);
  for (const [id, charge] of charges) {
    assert(charge >= -1, `charge for ${id} below -1: ${charge}`);
    assert(charge <= 1, `charge for ${id} above +1: ${charge}`);
  }
});

// ---------------------------------------------------------------------------
// 7. Pinned node immobility
// ---------------------------------------------------------------------------

Deno.test("property: pinned nodes don't move after tick (JANK)", () => {
  const algo = createJANK(DEFAULT_JANK_CONFIG);
  const nodes: ForceNode[] = [
    { ...makeNode("A", 0, 0), pinned: true },
    makeNode("B", 100, 0),
  ];
  const edges: ForceEdge[] = [{ a: "A", b: "B" }];
  const result = algo.tick(nodes, edges, 0);
  const a = result.nodes.find((n) => n.id === "A")!;
  assertEquals(a.x, 0);
  assertEquals(a.y, 0);
  assertEquals(a.vx, 0);
  assertEquals(a.vy, 0);
});

Deno.test("property: pinned nodes don't move after tick (SDF)", () => {
  const algo = createSDF(DEFAULT_SDF_CONFIG);
  const nodes: ForceNode[] = [
    { ...makeNode("A", 0, 0), pinned: true },
    makeNode("B", 100, 0),
  ];
  const edges: ForceEdge[] = [{ a: "A", b: "B" }];
  const result = algo.tick(nodes, edges, 0);
  const a = result.nodes.find((n) => n.id === "A")!;
  assertEquals(a.x, 0);
  assertEquals(a.y, 0);
  assertEquals(a.vx, 0);
  assertEquals(a.vy, 0);
});

// ---------------------------------------------------------------------------
// 8. Settlement convergence
// ---------------------------------------------------------------------------

Deno.test("property: JANK settles within maxTicks (chain)", () => {
  const algo = createJANK(DEFAULT_JANK_CONFIG);
  let nodes = algo.initNodes(chain3Ids, chain3Edges, 52, 52, new Map());
  let settled = false;
  for (let t = 0; t < DEFAULT_JANK_CONFIG.maxTicks; t++) {
    const result = algo.tick(nodes, chain3Edges, t);
    nodes = result.nodes;
    if (result.settled) {
      settled = true;
      break;
    }
  }
  assert(settled, "JANK should settle within maxTicks");
  assertLess(maxVelocity(nodes), DEFAULT_JANK_CONFIG.settleV + 0.1);
});

Deno.test("property: SDF settles within maxTicks (diamond)", () => {
  const algo = createSDF(DEFAULT_SDF_CONFIG);
  let nodes = algo.initNodes(diamond4Ids, diamond4Edges, 52, 52, new Map());
  let settled = false;
  for (let t = 0; t < DEFAULT_SDF_CONFIG.maxTicks; t++) {
    const result = algo.tick(nodes, diamond4Edges, t);
    nodes = result.nodes;
    if (result.settled) {
      settled = true;
      break;
    }
  }
  assert(settled, "SDF should settle within maxTicks");
});

Deno.test("property: TOPOGRID settles within 2 ticks", () => {
  const algo = createTOPOGRID(DEFAULT_TOPOGRID_CONFIG);
  let nodes = algo.initNodes(chain3Ids, chain3Edges, 52, 52, new Map());
  let settled = false;
  for (let t = 0; t < 3; t++) {
    const result = algo.tick(nodes, chain3Edges, t);
    nodes = result.nodes;
    if (result.settled) {
      settled = true;
      break;
    }
  }
  assert(settled, "TOPOGRID should settle within 2 ticks");
});
