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
