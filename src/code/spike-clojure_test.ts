/**
 * Round-trip tests for Spike-Clojure serialisation.
 *
 * Two directions tested for each fixture:
 *   graph→clj→graph  emit then re-parse; assert structural + edge equality
 *   clj→graph→clj    parse then re-emit; assert text equality
 *
 * Fixtures tagged with `shortcoming` are tested to confirm the failure is
 * present (acting as regression guards for known limitations).
 *
 * Fixtures are defined in spike-clojure-fixtures.ts and shared with stories.
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { graphToSpike, spikeToGraph } from "./spike-clojure.ts";
import { FIXTURES } from "./spike-clojure-fixtures.ts";
import type { Edge, TreeNode } from "../ui/workspace.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripNode(n: TreeNode): unknown {
  return {
    id: n.id,
    label: n.label,
    kind: n.kind,
    // Sort children by id: defn round-trips reorder children via topo sort,
    // and child order is not semantically significant for dataflow graphs.
    children: n.children.map(stripNode).sort((a, b) =>
      String((a as { id: string }).id).localeCompare(
        String((b as { id: string }).id),
      )
    ),
  };
}

function edgeSet(edges: Edge[]) {
  return new Set(edges.map((e) => `${e.fromId}->${e.toId}`));
}

// ---------------------------------------------------------------------------
// Fixture round-trips
// ---------------------------------------------------------------------------

for (const fixture of FIXTURES) {
  if (fixture.shortcoming) {
    // Known-bad fixtures: confirm the round-trip is currently broken so we
    // notice if/when it starts working unexpectedly.
    Deno.test(`[shortcoming] ${fixture.label}`, () => {
      const clj = graphToSpike(fixture.nodes, fixture.edges);
      const { treeNodes, edges } = spikeToGraph(clj);
      const graphStable = JSON.stringify(treeNodes.map(stripNode)) ===
          JSON.stringify(fixture.nodes.map(stripNode)) &&
        JSON.stringify([...edgeSet(edges)].sort()) ===
          JSON.stringify([...edgeSet(fixture.edges)].sort());
      const cljStable = graphToSpike(treeNodes, edges) === clj;
      // At least one direction should be broken — otherwise fix the shortcoming
      assertNotEquals(
        graphStable && cljStable,
        true,
        `Shortcoming appears fixed — remove the shortcoming flag: ${fixture.shortcoming}`,
      );
    });
  } else {
    Deno.test(`${fixture.label}: graph→clj→graph`, () => {
      const clj = graphToSpike(fixture.nodes, fixture.edges);
      const { treeNodes, edges, errors } = spikeToGraph(clj);

      assertEquals(errors, []);
      assertEquals(treeNodes.map(stripNode), fixture.nodes.map(stripNode));
      assertEquals(edgeSet(edges), edgeSet(fixture.edges));
    });

    Deno.test(`${fixture.label}: clj→graph→clj`, () => {
      const clj = graphToSpike(fixture.nodes, fixture.edges);
      const { treeNodes, edges, errors } = spikeToGraph(clj);
      assertEquals(errors, []);
      assertEquals(graphToSpike(treeNodes, edges), clj);
    });

    if (fixture.clj) {
      if (fixture.cljShortcoming) {
        // Known-bad idiomatic forms: confirm instability so we notice if fixed.
        Deno.test(`[clj-shortcoming] ${fixture.label}: idiomatic clj parse stable`, () => {
          const { treeNodes, edges } = spikeToGraph(fixture.clj!);
          const reClj = graphToSpike(treeNodes, edges);
          const { treeNodes: t2, edges: e2 } = spikeToGraph(reClj);
          const stable =
            JSON.stringify(treeNodes.map(stripNode)) === JSON.stringify(t2.map(stripNode)) &&
            JSON.stringify([...edgeSet(edges)].sort()) === JSON.stringify([...edgeSet(e2)].sort());
          assertNotEquals(
            stable,
            true,
            `clj shortcoming appears fixed — remove cljShortcoming flag: ${fixture.cljShortcoming}`,
          );
        });
      } else {
        // Idiomatic hand-written Clojure may use different node names or
        // structure than the fixture graph.  The meaningful check is stability:
        // parse → emit → parse should give the same graph (no information is
        // lost in the re-emit cycle, even if the first parse is partial).
        Deno.test(`${fixture.label}: idiomatic clj parse stable`, () => {
          const { treeNodes, edges, errors } = spikeToGraph(fixture.clj!);
          assertEquals(errors, []);
          const reClj = graphToSpike(treeNodes, edges);
          const { treeNodes: t2, edges: e2, errors: err2 } = spikeToGraph(reClj);
          assertEquals(err2, []);
          assertEquals(treeNodes.map(stripNode), t2.map(stripNode));
          assertEquals(edgeSet(edges), edgeSet(e2));
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

Deno.test("empty input returns empty graph", () => {
  const { treeNodes, edges, errors } = spikeToGraph("");
  assertEquals(errors, []);
  assertEquals(treeNodes, []);
  assertEquals(edges, []);
});

Deno.test("comment-only input returns empty graph", () => {
  const { treeNodes, edges, errors } = spikeToGraph(
    "; this is a comment\n; another comment",
  );
  assertEquals(errors, []);
  assertEquals(treeNodes, []);
  assertEquals(edges, []);
});

Deno.test("parse error is reported", () => {
  const { errors } = spikeToGraph("(def broken [");
  assertEquals(errors.length > 0, true);
});

// ---------------------------------------------------------------------------
// Parser gap: inlined call arguments in let bindings
//
// When a let binding's RHS contains nested calls like `(outer (inner))`,
// the current parser only captures `outer` as a node. `inner` and any further
// nesting is silently dropped. These tests document the expected behaviour
// after the parser is improved and currently FAIL.
// ---------------------------------------------------------------------------

Deno.test("inlined call: simple nesting — (outer (inner)) produces inner→outer edge", () => {
  // `inner` should become a node; `outer` should receive `inner`'s output.
  const src = `(defn f []
  (let [x (outer (inner))]
    x))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("inner"), true, "inner should be a node");
  assertEquals(nodeLabels.has("outer"), true, "outer should be a node");
  assertEquals(
    edges.some((e) => e.fromId === "inner" && e.toId === "outer"),
    true,
    "should have edge inner→outer",
  );
});

Deno.test("inlined call: two-deep nesting — (f (g (h))) produces h→g→f edges", () => {
  const src = `(defn pipeline []
  (let [result (f (g (h)))]
    result))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("h"), true, "h should be a node");
  assertEquals(nodeLabels.has("g"), true, "g should be a node");
  assertEquals(nodeLabels.has("f"), true, "f should be a node");
  assertEquals(
    edges.some((e) => e.fromId === "h" && e.toId === "g"),
    true,
    "should have edge h→g",
  );
  assertEquals(
    edges.some((e) => e.fromId === "g" && e.toId === "f"),
    true,
    "should have edge g→f",
  );
});

Deno.test("inlined call: mixed binding and inlined — (f (g a) b) where a is a param", () => {
  // (f (g a) b): g receives param a, f receives g's output and param b
  const src = `(defn pipeline [a b]
  (f (g a) b))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("g"), true, "g should be a node");
  assertEquals(nodeLabels.has("f"), true, "f should be a node");
  assertEquals(
    edges.some((e) => e.fromId === "a" && e.toId === "g"),
    true,
    "should have edge a→g",
  );
  assertEquals(
    edges.some((e) => e.fromId === "g" && e.toId === "f"),
    true,
    "should have edge g→f",
  );
  assertEquals(
    edges.some((e) => e.fromId === "b" && e.toId === "f"),
    true,
    "should have edge b→f",
  );
});

// ---------------------------------------------------------------------------
// Quadratic-roots parse precision tests
//
// These tests pin down exactly what spikeToGraph should produce when parsing
// the idiomatic quadratic-roots fixture.clj — independently of round-trip
// stability. They catch regressions in port parsing, map-body expansion, and
// inlined call capture without being confused by known re-emit shortcomings.
// ---------------------------------------------------------------------------

const QR_FIXTURE = FIXTURES.find((f) => f.label.includes("quadratic-roots"))!;

Deno.test("quadratic-roots clj: input ports captured from ^Type param hints", () => {
  const { treeNodes, errors } = spikeToGraph(QR_FIXTURE.clj!);
  assertEquals(errors, []);
  const root = treeNodes[0];
  const inPorts = (root.ports ?? []).filter((p) => p.direction === "in");
  assertEquals(inPorts.map((p) => p.name), ["a", "b", "c"]);
  assertEquals(inPorts.map((p) => p.type), ["float", "float", "float"]);
});

Deno.test("quadratic-roots clj: output ports captured from {:ports ...} attr-map", () => {
  const { treeNodes, errors } = spikeToGraph(QR_FIXTURE.clj!);
  assertEquals(errors, []);
  const root = treeNodes[0];
  const outPorts = (root.ports ?? []).filter((p) => p.direction === "out");
  assertEquals(outPorts.map((p) => p.name).sort(), ["x1", "x2"]);
  assertEquals(outPorts.map((p) => p.type).sort(), ["float", "float"]);
});

Deno.test("quadratic-roots clj: map body values expanded — add and divide are nodes", () => {
  // {:x1 (divide (add neg-b sqrt-d) two-a) :x2 ...} — the call expressions
  // inside the map body must be expanded, not silently dropped.
  const { treeNodes, edges, errors } = spikeToGraph(QR_FIXTURE.clj!);
  assertEquals(errors, []);
  const childLabels = new Set(treeNodes[0].children.map((c) => c.label));
  for (const expected of ["add", "divide"]) {
    assertEquals(childLabels.has(expected), true, `${expected} should be a node`);
  }
  assertEquals(
    edges.some((e) => e.fromId === "add" && e.toId === "divide"),
    true,
    "should have edge add→divide",
  );
});

Deno.test("quadratic-roots clj: all nodes captured — full 10-node set", () => {
  // Documents the complete expected parse output so any parser regression is
  // immediately obvious.
  const expected = new Set([
    "a",
    "b",
    "c",
    "negate",
    "square",
    "multiply",
    "subtract",
    "sqrt",
    "add",
    "divide",
  ]);
  const { treeNodes, errors } = spikeToGraph(QR_FIXTURE.clj!);
  assertEquals(errors, []);
  const actual = new Set(treeNodes[0].children.map((c) => c.label));
  for (const n of expected) {
    assertEquals(actual.has(n), true, `node "${n}" should be parsed`);
  }
  assertEquals(actual.size, expected.size, "no unexpected extra nodes");
});

// The back-edge check now prevents the subtract↔sqrt cycle, so all 10 nodes
// survive the re-emit. This test documents that the fix holds.
Deno.test("quadratic-roots re-emit: all nodes survive (cycle check prevents back-edge)", () => {
  const { treeNodes, edges } = spikeToGraph(QR_FIXTURE.clj!);
  const reClj = graphToSpike(treeNodes, edges);
  const { treeNodes: t2 } = spikeToGraph(reClj);
  const surviving = new Set(t2[0]?.children.map((c) => c.label) ?? []);

  for (
    const n of ["a", "b", "c", "negate", "square", "multiply", "subtract", "sqrt", "add", "divide"]
  ) {
    assertEquals(surviving.has(n), true, `"${n}" should survive re-emit`);
  }
});

Deno.test("inlined call: quadratic-roots disc binding — (subtract (square b) ...) captures square", () => {
  // Simplified slice of quadratic-roots: the `disc` binding has an inlined
  // `square` call that the current parser drops entirely.
  const src = `(defn qr [b]
  (let [disc (subtract (square b) 1.0)]
    disc))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("square"), true, "square should be a node");
  assertEquals(nodeLabels.has("subtract"), true, "subtract should be a node");
  assertEquals(
    edges.some((e) => e.fromId === "b" && e.toId === "square"),
    true,
    "should have edge b→square",
  );
  assertEquals(
    edges.some((e) => e.fromId === "square" && e.toId === "subtract"),
    true,
    "should have edge square→subtract",
  );
});
