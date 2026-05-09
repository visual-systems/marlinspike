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

import { assertAlmostEquals, assertEquals, assertExists, assertNotEquals } from "@std/assert";
import { graphToSpike, spikeToGraph } from "./spike-clojure.ts";
import { evaluateSpike, numericEnv } from "./spike-clojure-eval.ts";
import { FIXTURES } from "./spike-clojure-fixtures.ts";
import type { Edge, TreeNode } from "../ui/workspace.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripNode(n: TreeNode): unknown {
  const sortedPorts = (n.ports ?? [])
    .map((p) => ({ name: p.name, direction: p.direction, ...(p.type ? { type: p.type } : {}) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: n.id,
    label: n.label,
    kind: n.kind,
    // Include ref fields so scope-inferred refs are verified in round-trip tests.
    ...(n.type ? { type: n.type } : {}),
    ...(n.ref ? { ref: n.ref } : {}),
    // Include ports so port stability is verified in round-trip tests.
    ...(sortedPorts.length > 0 ? { ports: sortedPorts } : {}),
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

    // Evaluation tests — only for fixtures with clj, examples, and evalFns
    if (fixture.clj && fixture.examples && fixture.evalFns) {
      const { clj, examples, evalFns } = fixture;
      const fns = numericEnv(evalFns);

      Deno.test(`${fixture.label}: examples evaluate correctly`, () => {
        for (const { inputs, expected } of examples) {
          const result = evaluateSpike(clj, inputs, fns) as Record<string, number>;
          for (const [key, val] of Object.entries(expected)) {
            assertAlmostEquals(
              result[key],
              val,
              1e-9,
              `output '${key}' for inputs ${JSON.stringify(inputs)}`,
            );
          }
        }
      });

      if (fixture.evalShortcoming) {
        // Known semantic loss: confirm round-trip evaluation differs.
        Deno.test(
          `[eval-shortcoming] ${fixture.label}: round-trip eval differs from original`,
          () => {
            const { treeNodes, edges } = spikeToGraph(clj);
            const reClj = graphToSpike(treeNodes, edges);
            const origResult = evaluateSpike(clj, examples[0].inputs, fns);
            const rtResult = evaluateSpike(reClj, examples[0].inputs, fns);
            assertNotEquals(
              JSON.stringify(origResult),
              JSON.stringify(rtResult),
              `eval shortcoming appears fixed — remove evalShortcoming flag: ${fixture.evalShortcoming}`,
            );
          },
        );
      } else {
        Deno.test(`${fixture.label}: round-trip eval matches original`, () => {
          const { treeNodes, edges } = spikeToGraph(clj);
          const reClj = graphToSpike(treeNodes, edges);
          for (const { inputs, expected } of examples) {
            const rtResult = evaluateSpike(reClj, inputs, fns) as Record<string, number>;
            for (const [key, val] of Object.entries(expected)) {
              assertAlmostEquals(
                rtResult[key],
                val,
                1e-9,
                `round-trip output '${key}' for inputs ${JSON.stringify(inputs)}`,
              );
            }
          }
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

Deno.test("inlined call: simple nesting — (outer (inner)) produces inner→x edge", () => {
  // Under binding-name-as-identity, `(let [x (outer (inner))] ...)` creates
  // node "x" (fn="outer") not a node named "outer". The inner call "inner"
  // is an inline arg and still uses the function name as identity.
  const src = `(defn f []
  (let [x (outer (inner))]
    x))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("inner"), true, "inner should be a node");
  assertEquals(nodeLabels.has("x"), true, "let-bound node uses binding name 'x'");
  const xNode = allNodes.find((n) => n.label === "x")!;
  assertEquals(xNode.data.fn as string, "outer", "node 'x' should store fn='outer'");
  assertEquals(
    edges.some((e) => e.fromId === "inner" && e.toId === "x"),
    true,
    "should have edge inner→x",
  );
});

Deno.test("inlined call: two-deep nesting — (f (g (h))) produces h→g→result edges", () => {
  // The outermost let-bound call "f" uses the binding name "result" as its
  // node identity. Inner inline calls "g" and "h" use function names.
  const src = `(defn pipeline []
  (let [result (f (g (h)))]
    result))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("h"), true, "h should be a node");
  assertEquals(nodeLabels.has("g"), true, "g should be a node");
  assertEquals(nodeLabels.has("result"), true, "let-bound node uses binding name 'result'");
  const resultNode = allNodes.find((n) => n.label === "result")!;
  assertEquals(resultNode.data.fn as string, "f", "node 'result' should store fn='f'");
  assertEquals(
    edges.some((e) => e.fromId === "h" && e.toId === "g"),
    true,
    "should have edge h→g",
  );
  assertEquals(
    edges.some((e) => e.fromId === "g" && e.toId === "result"),
    true,
    "should have edge g→result",
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

Deno.test("quadratic-roots clj: map body values expanded — add, x1, x2 are nodes", () => {
  // {:x1 (divide (add neg-b sqrt-d) two-a) :x2 ...} — each map entry becomes
  // a distinct terminal node named by the key (x1, x2), not the function name.
  const { treeNodes, edges, errors } = spikeToGraph(QR_FIXTURE.clj!);
  assertEquals(errors, []);
  const childLabels = new Set(treeNodes[0].children.map((c) => c.label));
  for (const expected of ["add", "x1", "x2"]) {
    assertEquals(childLabels.has(expected), true, `${expected} should be a node`);
  }
  assertEquals(
    edges.some((e) => e.fromId === "add" && e.toId === "x1"),
    true,
    "should have edge add→x1",
  );
});

Deno.test("quadratic-roots clj: all nodes captured — full 14-node set", () => {
  // Documents the complete expected parse output under binding-name-as-identity
  // with conjunctive naming for duplicate inline calls.
  // Let-bound nodes use their binding variable name; inline call nodes use the
  // function name (or a conjunctive name when the function name collides).
  //   Let-bound:  neg-b (fn=negate), disc (fn=subtract), sqrt-d (fn=sqrt),
  //               two-a (fn=multiply)
  //   Inline:     square (b²), multiply (a*c), multiply-4-multiply (4*a*c,
  //               conjunctive name because "multiply" was already taken),
  //               add (x1 numerator), subtract (x2 numerator)
  //   Map keys:   x1 (fn=divide), x2 (fn=divide)
  // Total: 3 params + 4 let-bound + 5 inline + 2 map-key = 14 nodes.
  const expected = new Set([
    "a",
    "b",
    "c",
    "neg-b", // let-binding name (fn="negate")
    "square", // inline arg in disc binding
    "multiply", // inline arg in disc binding (a*c)
    "multiply-4-multiply", // conjunctive: (multiply 4.0 (multiply a c))
    "disc", // let-binding name (fn="subtract")
    "sqrt-d", // let-binding name (fn="sqrt")
    "two-a", // let-binding name (fn="multiply") — distinct from inline "multiply"
    "add", // inline arg in :x1 map entry
    "subtract", // inline arg in :x2 map entry — distinct from let-bound "disc"
    "x1", // map key identity (fn="divide")
    "x2", // map key identity (fn="divide")
  ]);
  const { treeNodes, errors } = spikeToGraph(QR_FIXTURE.clj!);
  assertEquals(errors, []);
  const actual = new Set(treeNodes[0].children.map((c) => c.label));
  for (const n of expected) {
    assertEquals(actual.has(n), true, `node "${n}" should be parsed`);
  }
  assertEquals(actual.size, expected.size, "no unexpected extra nodes");
});

// All 14 nodes survive the re-emit round-trip.
Deno.test("quadratic-roots re-emit: all nodes survive", () => {
  const { treeNodes, edges } = spikeToGraph(QR_FIXTURE.clj!);
  const reClj = graphToSpike(treeNodes, edges);
  const { treeNodes: t2 } = spikeToGraph(reClj);
  const surviving = new Set(t2[0]?.children.map((c) => c.label) ?? []);

  for (
    const n of [
      "a",
      "b",
      "c",
      "neg-b",
      "square",
      "multiply",
      "multiply-4-multiply",
      "disc",
      "sqrt-d",
      "two-a",
      "add",
      "subtract",
      "x1",
      "x2",
    ]
  ) {
    assertEquals(surviving.has(n), true, `"${n}" should survive re-emit`);
  }
});

// ---------------------------------------------------------------------------
// Numeric literal preservation in let bindings
//
// Numeric literals appearing as arguments in let-bound calls (e.g. `2.0` in
// `(let [two-a (multiply 2.0 a)] ...)`) must survive the graph→clj round-trip
// so the re-emitted Clojure evaluates correctly.
//
// Numeric literals in let-bound calls are preserved via data.argOrder.
// Literals in nested inline calls are also preserved via conjunctive naming
// (duplicate inline calls get unique node names like "multiply-4-multiply").
// ---------------------------------------------------------------------------

Deno.test("literal preservation: numeric literal in let binding evaluates correctly after round-trip", () => {
  // `(let [two-a (multiply 2.0 a)] two-a)` — the 2.0 must survive round-trip.
  // Without preservation, two-a round-trips as `(multiply a)` → NaN.
  const src = `(defn f [a]
  (let [two-a (multiply 2.0 a)]
    two-a))`;
  const { treeNodes, edges } = spikeToGraph(src);
  const reClj = graphToSpike(treeNodes, edges);
  const fns = numericEnv({ multiply: (a, b) => a * b });
  for (const a of [1, 2, 3, 5]) {
    const rtResult = evaluateSpike(reClj, { a }, fns) as number;
    assertAlmostEquals(rtResult, 2 * a, 1e-9, `two-a round-trip: expected 2*${a}=${2 * a}`);
  }
});

Deno.test("literal preservation: literal as first arg, symbol as second", () => {
  // Verify position is preserved: (scale 3.0 x) → not (scale x) after round-trip.
  const src = `(defn f [x]
  (let [scaled (scale 3.0 x)]
    scaled))`;
  const { treeNodes, edges } = spikeToGraph(src);
  const reClj = graphToSpike(treeNodes, edges);
  const fns = numericEnv({ scale: (a, b) => a * b });
  assertAlmostEquals(
    evaluateSpike(reClj, { x: 4 }, fns) as number,
    12,
    1e-9,
    "scale(3, 4) = 12",
  );
});

// ---------------------------------------------------------------------------
// Let-binding name preservation
//
// When a binding name differs from the function name (e.g. `neg-b (negate b)`),
// the emitter must use the binding name — NOT the function name — as the let
// variable. Using the function name would shadow it for subsequent calls.
// ---------------------------------------------------------------------------

Deno.test("let-binding name preserved: neg-b (negate b) appears in let when non-terminal", () => {
  // The binding name is "neg-b"; the node label (function) is "negate".
  // When negate feeds a downstream node (so it's in the let block, not inlined),
  // the emitter must use "neg-b" as the variable name, not "negate".
  const src = `(defn f [b]
  (let [neg-b (negate b)]
    (process neg-b)))`;
  const { treeNodes, edges } = spikeToGraph(src);
  const clj = graphToSpike(treeNodes, edges);
  assertEquals(
    clj.includes("neg-b (negate"),
    true,
    "binding name 'neg-b' should be used as the let variable",
  );
  assertEquals(
    clj.includes("negate (negate"),
    false,
    "function name 'negate' must not shadow itself as a let variable",
  );
});

Deno.test("let-binding name preserved: downstream call references neg-b, not negate", () => {
  // After round-trip, any call that uses neg-b as an arg should reference
  // "neg-b" (the binding name), not the raw label "negate".
  const src = `(defn f [b]
  (let [neg-b  (negate b)
        disc   (subtract neg-b 1.0)]
    disc))`;
  const { treeNodes, edges } = spikeToGraph(src);
  const clj = graphToSpike(treeNodes, edges);
  // negate is in the let block as "neg-b"; subtract (terminal) is inlined
  assertEquals(
    clj.includes("neg-b (negate"),
    true,
    "negate should appear in let block with binding name 'neg-b'",
  );
  // The inlined terminal subtract should reference neg-b, not negate
  assertEquals(
    clj.includes("subtract neg-b"),
    true,
    "subtract call should reference 'neg-b', not 'negate'",
  );
});

Deno.test("quadratic-roots re-emit: binding names preserved — no self-shadowing", () => {
  // The four explicitly named let bindings from the original clj should
  // survive the round-trip: neg-b, disc, sqrt-d, two-a.
  const { treeNodes, edges } = spikeToGraph(QR_FIXTURE.clj!);
  const clj = graphToSpike(treeNodes, edges);
  assertEquals(clj.includes("neg-b (negate"), true, "should preserve binding name neg-b");
  assertEquals(clj.includes("disc (subtract"), true, "should preserve binding name disc");
  assertEquals(clj.includes("sqrt-d (sqrt"), true, "should preserve binding name sqrt-d");
  assertEquals(clj.includes("two-a (multiply"), true, "should preserve binding name two-a");
  // add and subtract are single-use inline nodes → inlined into the map return.
  // x1 = (divide (add neg-b sqrt-d) two-a), x2 = (divide (subtract neg-b sqrt-d) two-a)
  assertEquals(
    clj.includes(":x1 (divide (add neg-b sqrt-d) two-a)"),
    true,
    "x1 return: (divide (add neg-b sqrt-d) two-a)",
  );
  assertEquals(
    clj.includes(":x2 (divide (subtract neg-b sqrt-d) two-a)"),
    true,
    "x2 return: (divide (subtract neg-b sqrt-d) two-a)",
  );
});

// ---------------------------------------------------------------------------
// Binding-name-as-identity: duplicate let-binding calls produce distinct nodes
//
// Under binding-name-as-identity, `(let [x (double a) y (double b)] ...)` now
// creates TWO distinct nodes "x" and "y" (both with data.fn="double"), rather
// than collapsing to one "double" node. The round-trip is semantically correct.
// ---------------------------------------------------------------------------

const DUPE_SRC = `(defn f [a b]
  (let [x (double a)
        y (double b)]
    {:x x :y y}))`;

Deno.test("duplicate-call: parse — two let bindings create distinct nodes 'x' and 'y'", () => {
  const { treeNodes, edges } = spikeToGraph(DUPE_SRC);
  const children = treeNodes[0].children;
  // Two distinct nodes, one per binding — no collapse
  assertEquals(children.filter((c) => c.label === "x").length, 1, "node 'x' should exist");
  assertEquals(children.filter((c) => c.label === "y").length, 1, "node 'y' should exist");
  assertEquals(children.filter((c) => c.label === "double").length, 0, "no raw 'double' node");
  // Each binding has its own distinct incoming edge
  assertEquals(edges.some((e) => e.fromId === "a" && e.toId === "x"), true);
  assertEquals(edges.some((e) => e.fromId === "b" && e.toId === "y"), true);
  // Nodes store the function name in data.fn
  const xNode = children.find((c) => c.label === "x")!;
  assertEquals(xNode.data.fn as string, "double");
});

Deno.test("duplicate-call: emit — round-trip reproduces original let structure", () => {
  const { treeNodes, edges } = spikeToGraph(DUPE_SRC);
  const reClj = graphToSpike(treeNodes, edges);
  // Each binding round-trips correctly with its own call
  assertEquals(reClj.includes("x (double a)"), true, `got: ${reClj}`);
  assertEquals(reClj.includes("y (double b)"), true, `got: ${reClj}`);
  // Multi-entry maps get one key per line
  assertEquals(reClj.includes(":x x"), true, `got: ${reClj}`);
  assertEquals(reClj.includes(":y y"), true, `got: ${reClj}`);
});

Deno.test("duplicate-call: eval — round-trip result matches original", () => {
  const fns = numericEnv({ double: (x) => x * 2 });

  // Original: {x: double(3), y: double(4)} = {x: 6, y: 8}
  const origResult = evaluateSpike(DUPE_SRC, { a: 3, b: 4 }, fns) as Record<string, number>;
  assertAlmostEquals(origResult.x, 6, 1e-9);
  assertAlmostEquals(origResult.y, 8, 1e-9);

  // Round-trip: distinct nodes survive → same evaluation
  const { treeNodes, edges } = spikeToGraph(DUPE_SRC);
  const reClj = graphToSpike(treeNodes, edges);
  const rtResult = evaluateSpike(reClj, { a: 3, b: 4 }, fns) as Record<string, number>;
  assertAlmostEquals(rtResult.x, 6, 1e-9, "round-trip x should equal double(3)");
  assertAlmostEquals(rtResult.y, 8, 1e-9, "round-trip y should equal double(4)");
});

Deno.test("inlined call: quadratic-roots disc binding — (subtract (square b) ...) captures square", () => {
  // The `disc` binding uses binding-name-as-identity: node "disc" (fn="subtract").
  // The inlined `(square b)` arg still uses the function name as identity.
  const src = `(defn qr [b]
  (let [disc (subtract (square b) 1.0)]
    disc))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const allNodes = treeNodes.flatMap((t) => t.children);
  const nodeLabels = new Set(allNodes.map((n) => n.label));
  assertEquals(nodeLabels.has("square"), true, "square should be a node");
  // Let-bound node uses binding name "disc", not function name "subtract"
  assertEquals(nodeLabels.has("disc"), true, "let-bound node should use binding name 'disc'");
  assertEquals(
    edges.some((e) => e.fromId === "b" && e.toId === "square"),
    true,
    "should have edge b→square",
  );
  assertEquals(
    edges.some((e) => e.fromId === "square" && e.toId === "disc"),
    true,
    "should have edge square→disc",
  );
});

// ---------------------------------------------------------------------------
// Bare (def name) — root-level leaf nodes
// ---------------------------------------------------------------------------

Deno.test("bare (def A) parses as a leaf node", () => {
  const { treeNodes, edges, errors } = spikeToGraph("(def A)");
  assertEquals(errors, []);
  assertEquals(treeNodes.length, 1);
  assertEquals(treeNodes[0].kind, "leaf");
  assertEquals(treeNodes[0].label, "A");
  assertEquals(edges.length, 0);
});

Deno.test("multiple bare defs parse as independent leaf nodes", () => {
  const { treeNodes, errors } = spikeToGraph("(def A)\n(def B)\n(def C)");
  assertEquals(errors, []);
  assertEquals(treeNodes.length, 3);
  assertEquals(treeNodes.map((n) => n.label), ["A", "B", "C"]);
  assertEquals(treeNodes.every((n) => n.kind === "leaf"), true);
});

Deno.test("bare def round-trips: graph→clj→graph", () => {
  const { treeNodes: t1, edges: e1 } = spikeToGraph("(def X)\n\n(def Y)");
  const reClj = graphToSpike(t1, e1);
  const { treeNodes: t2 } = spikeToGraph(reClj);
  assertEquals(t2.length, 2);
  assertEquals(t2.map((n) => n.label), ["X", "Y"]);
  assertEquals(t2.every((n) => n.kind === "leaf"), true);
});

// ---------------------------------------------------------------------------
// Nested defn inside def — def children resolve from defn table
// ---------------------------------------------------------------------------

Deno.test("def referencing a defn child resolves as composite, not leaf", () => {
  const src = `(defn processor [input]
  (let [v (validate input)]
    (respond v)))

(def service [ingress processor egress])`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const service = treeNodes.find((n) => n.label === "service")!;
  assertEquals(service.kind, "composite");
  const proc = service.children.find((c) => c.label === "processor")!;
  assertEquals(proc.kind, "composite", "processor should be composite, not leaf");
  assertEquals(proc.children.length > 0, true, "processor should have children");
  // Binding-name-as-identity: `v (validate input)` creates node "v" (fn=validate)
  assertEquals(edges.some((e) => e.fromId === "v" && e.toId === "respond"), true);
});

// ---------------------------------------------------------------------------
// :id reader metadata
//
// When a node has a genuine UUID as its id, the emitter preserves it by
// prefixing the def/defn name with `^{:id "..."}` reader metadata. The
// parser reads the id back so round-trips keep the original identity.
// Nodes with label-derived ids (the common case) emit without metadata.
// ---------------------------------------------------------------------------

const TEST_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const TEST_UUID_2 = "11111111-2222-4333-8444-555555555555";
const TEST_UUID_3 = "66666666-7777-4888-9999-aaaaaaaaaaaa";

Deno.test("id meta: emits ^{:id} when node has a UUID id", () => {
  const node: TreeNode = {
    id: TEST_UUID,
    label: "Workspace",
    kind: "leaf",
    children: [],
    data: {},
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(clj, `(def ^{:id "${TEST_UUID}"} Workspace)`);
});

Deno.test("id meta: not emitted when id is label-derived (not a UUID)", () => {
  const clj = graphToSpike(
    [{ id: "Workspace", label: "Workspace", kind: "leaf", children: [], data: {}, version: 1 }],
    [],
  );
  assertEquals(clj, `(def Workspace)`);
});

Deno.test("id meta: not emitted for non-UUID ids like spike:// URIs", () => {
  const clj = graphToSpike(
    [{
      id: "spike://acme/backend",
      label: "acme/backend",
      kind: "leaf",
      children: [],
      data: {},
      version: 1,
    }],
    [],
  );
  assertEquals(clj, `(def acme/backend)`);
});

Deno.test("id meta: emits on composite (def name [...])", () => {
  const node: TreeNode = {
    id: TEST_UUID,
    label: "Workspace",
    kind: "composite",
    children: [
      { id: "child", label: "child", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(clj.includes(`(def ^{:id "${TEST_UUID}"} Workspace [child])`), true);
});

Deno.test("id meta: emits on defn name", () => {
  const node: TreeNode = {
    id: TEST_UUID,
    label: "pipeline",
    kind: "composite",
    children: [
      { id: TEST_UUID_2, label: "A", kind: "leaf", children: [], data: {}, version: 1 },
      { id: TEST_UUID_3, label: "B", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  const clj = graphToSpike([node], [
    { id: "A-B", fromId: TEST_UUID_2, toId: TEST_UUID_3, label: "", data: {}, version: 1 },
  ]);
  assertEquals(clj.includes(`(defn ^{:id "${TEST_UUID}"} pipeline`), true);
});

Deno.test("id meta: parser extracts :id and sets it as node id", () => {
  const src = `(def ^{:id "${TEST_UUID}"} Workspace [child])
(def child)`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const ws = treeNodes.find((n) => n.label === "Workspace")!;
  assertEquals(ws.id, TEST_UUID);
  assertEquals(ws.label, "Workspace");
});

Deno.test("id meta: parser ignores non-string :id values", () => {
  const src = `(def ^{:id 42} Name)`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  // Falls back to label-as-id.
  assertEquals(treeNodes[0].id, "Name");
});

Deno.test("id meta: round-trip preserves UUID id", () => {
  const node: TreeNode = {
    id: TEST_UUID,
    label: "OriginalName",
    kind: "leaf",
    children: [],
    data: {},
    version: 1,
  };
  const clj = graphToSpike([node], []);
  const { treeNodes } = spikeToGraph(clj);
  assertEquals(treeNodes[0].id, TEST_UUID);
  assertEquals(treeNodes[0].label, "OriginalName");
});

// ---------------------------------------------------------------------------
// Node metadata: data fields and uri
// ---------------------------------------------------------------------------

Deno.test("node meta: emits data fields in reader metadata", () => {
  const node: TreeNode = {
    id: "my-service",
    label: "my-service",
    kind: "leaf",
    children: [],
    data: { description: "A service", priority: 5 },
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(clj, `(def ^{:data {:description "A service" :priority 5}} my-service)`);
});

Deno.test("node meta: emits uri in reader metadata", () => {
  const node: TreeNode = {
    id: "backend",
    label: "backend",
    kind: "composite",
    children: [
      { id: "child", label: "child", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    uri: "spike://acme/backend",
    data: {},
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(clj, `(def ^{:uri "spike://acme/backend"} backend [child])`);
});

Deno.test("node meta: emits id + uri + data together", () => {
  const node: TreeNode = {
    id: TEST_UUID,
    label: "my-node",
    kind: "leaf",
    children: [],
    uri: "spike://example",
    data: { color: "red" },
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(
    clj,
    `(def ^{:id "${TEST_UUID}" :uri "spike://example" :data {:color "red"}} my-node)`,
  );
});

Deno.test("node meta: empty strings in data are not emitted", () => {
  const node: TreeNode = {
    id: "svc",
    label: "svc",
    kind: "leaf",
    children: [],
    data: { name: "ok", empty: "" },
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(clj, `(def ^{:data {:name "ok"}} svc)`);
});

Deno.test("node meta: internal data keys (fn, argOrder) are not emitted", () => {
  const node: TreeNode = {
    id: "x1",
    label: "x1",
    kind: "leaf",
    children: [],
    data: { fn: "divide", argOrder: ["a", "b"], visible: true },
    version: 1,
  };
  const clj = graphToSpike([node], []);
  assertEquals(clj, `(def ^{:data {:visible true}} x1)`);
});

Deno.test("node meta: parser extracts uri from metadata", () => {
  const src = `(def ^{:uri "spike://acme/backend"} backend [child])\n(def child)`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const node = treeNodes.find((n) => n.label === "backend")!;
  assertEquals(node.uri, "spike://acme/backend");
});

Deno.test("node meta: parser extracts data fields from metadata", () => {
  const src = `(def ^{:data {:description "A service" :priority 5}} my-service)`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  assertEquals(treeNodes[0].data.description, "A service");
  assertEquals(treeNodes[0].data.priority, 5);
});

Deno.test("node meta: round-trip preserves data and uri", () => {
  const node: TreeNode = {
    id: TEST_UUID,
    label: "my-node",
    kind: "leaf",
    children: [],
    uri: "spike://example",
    data: { color: "red", count: 3 },
    version: 1,
  };
  const clj = graphToSpike([node], []);
  const { treeNodes } = spikeToGraph(clj);
  assertEquals(treeNodes[0].id, TEST_UUID);
  assertEquals(treeNodes[0].uri, "spike://example");
  assertEquals(treeNodes[0].data.color, "red");
  assertEquals(treeNodes[0].data.count, 3);
});

Deno.test("node meta: defn container preserves data and uri", () => {
  const container: TreeNode = {
    id: TEST_UUID,
    label: "pipeline",
    kind: "composite",
    children: [
      { id: "A", label: "A", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "B", label: "B", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    uri: "spike://pipes/main",
    data: { env: "prod" },
    version: 1,
  };
  const edges: Edge[] = [
    { id: "A-B", fromId: "A", toId: "B", label: "", data: {}, version: 1 },
  ];
  const clj = graphToSpike([container], edges);
  // Verify emitted text includes the metadata
  assertEquals(clj.includes(`:id "${TEST_UUID}"`), true);
  assertEquals(clj.includes(`:uri "spike://pipes/main"`), true);
  assertEquals(clj.includes(`:env "prod"`), true);
  // Verify round-trip
  const { treeNodes } = spikeToGraph(clj);
  const p = treeNodes.find((n) => n.label === "pipeline")!;
  assertEquals(p.id, TEST_UUID);
  assertEquals(p.uri, "spike://pipes/main");
  assertEquals(p.data.env, "prod");
});

// ---------------------------------------------------------------------------
// Edge metadata: label and data via reader metadata on call arguments
// ---------------------------------------------------------------------------

Deno.test("edge meta: emits label as reader metadata on argument", () => {
  const container: TreeNode = {
    id: "flow",
    label: "flow",
    kind: "composite",
    children: [
      { id: "src", label: "src", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "mid", label: "mid", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "dst", label: "dst", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    ports: [{ name: "src", direction: "in" }],
    data: {},
    version: 1,
  };
  const edges: Edge[] = [
    { id: "src-mid", fromId: "src", toId: "mid", label: "transforms", data: {}, version: 1 },
    { id: "mid-dst", fromId: "mid", toId: "dst", label: "", data: {}, version: 1 },
  ];
  const clj = graphToSpike([container], edges);
  // src is an input param, so it appears as a bare symbol in the call to mid
  assertEquals(clj.includes(`^{:label "transforms"} src`), true);
});

Deno.test("edge meta: emits data fields alongside label", () => {
  const container: TreeNode = {
    id: "flow",
    label: "flow",
    kind: "composite",
    children: [
      { id: "A", label: "A", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "B", label: "B", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  const edges: Edge[] = [{
    id: "A-B",
    fromId: "A",
    toId: "B",
    label: "conn",
    data: { weight: 3 },
    version: 1,
  }];
  const clj = graphToSpike([container], edges);
  assertEquals(clj.includes(`:label "conn"`), true);
  assertEquals(clj.includes(`:weight 3`), true);
});

Deno.test("edge meta: not emitted when edge has empty label and data", () => {
  const container: TreeNode = {
    id: "flow",
    label: "flow",
    kind: "composite",
    children: [
      { id: "A", label: "A", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "B", label: "B", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  const edges: Edge[] = [
    { id: "A-B", fromId: "A", toId: "B", label: "", data: {}, version: 1 },
  ];
  const clj = graphToSpike([container], edges);
  // Should NOT have ^{ on arguments
  assertEquals(clj.includes("^{"), false);
});

Deno.test("edge meta: parser extracts label from argument metadata", () => {
  const src = `(defn flow\n  [A]\n  (B ^{:label "transforms"} A))`;
  const { edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const edge = edges.find((e) => e.fromId === "A" && e.toId === "B");
  assertEquals(edge?.label, "transforms");
});

Deno.test("edge meta: parser extracts data from argument metadata", () => {
  const src = `(defn flow\n  [A]\n  (B ^{:label "conn" :weight 3} A))`;
  const { edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const edge = edges.find((e) => e.fromId === "A" && e.toId === "B");
  assertEquals(edge?.label, "conn");
  assertEquals(edge?.data.weight, 3);
});

Deno.test("edge meta: round-trip preserves edge label and data", () => {
  const container: TreeNode = {
    id: "flow",
    label: "flow",
    kind: "composite",
    children: [
      { id: "A", label: "A", kind: "leaf", children: [], data: {}, version: 1 },
      { id: "B", label: "B", kind: "leaf", children: [], data: {}, version: 1 },
    ],
    data: {},
    version: 1,
  };
  const edges: Edge[] = [{
    id: "A-B",
    fromId: "A",
    toId: "B",
    label: "transforms",
    data: { weight: 5 },
    version: 1,
  }];
  const clj = graphToSpike([container], edges);
  const parsed = spikeToGraph(clj);
  assertEquals(parsed.errors, []);
  const edge = parsed.edges.find((e) => e.fromId === "A" && e.toId === "B");
  assertEquals(edge?.label, "transforms");
  assertEquals(edge?.data.weight, 5);
});

// ---------------------------------------------------------------------------
// Scope-inferred references
// ---------------------------------------------------------------------------

Deno.test("scope-inferred ref: call to prior def produces ref node", () => {
  const src = `(def square)
(defn pipeline [x]
  (square x))`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const pipeline = treeNodes.find((n) => n.label === "pipeline")!;
  const squareChild = pipeline.children.find((c) => c.label === "square");
  assertExists(squareChild);
  assertEquals(squareChild.type, "ref");
  assertEquals(squareChild.ref, "square");
});

Deno.test("scope-inferred ref: let-bound call to prior def produces ref node", () => {
  const src = `(def negate)
(defn f [b]
  (let [neg-b (negate b)]
    neg-b))`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const f = treeNodes.find((n) => n.label === "f")!;
  const negB = f.children.find((c) => c.label === "neg-b");
  assertExists(negB);
  assertEquals(negB.type, "ref");
  assertEquals(negB.ref, "negate");
  assertEquals(negB.data.fn, "negate");
});

Deno.test("scope-inferred ref: unresolved symbol is NOT marked as ref", () => {
  const src = `(defn f [x]
  (unknown x))`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const f = treeNodes.find((n) => n.label === "f")!;
  const unknownChild = f.children.find((c) => c.label === "unknown");
  assertExists(unknownChild);
  assertEquals(unknownChild.type, undefined);
  assertEquals(unknownChild.ref, undefined);
});

Deno.test("scope-inferred ref: forward reference is NOT marked as ref", () => {
  const src = `(defn pipeline [x]
  (square x))
(def square)`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const pipeline = treeNodes.find((n) => n.label === "pipeline")!;
  const squareChild = pipeline.children.find((c) => c.label === "square");
  assertExists(squareChild);
  assertEquals(squareChild.type, undefined, "forward ref should not be marked as ref");
});

Deno.test("scope-inferred ref: multiple defs, multiple refs in one defn", () => {
  const src = `(def add)
(def multiply)
(defn f [a b]
  (let [sum (add a b)
        product (multiply a b)]
    {:sum sum :product product}))`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const f = treeNodes.find((n) => n.label === "f")!;
  const sum = f.children.find((c) => c.label === "sum");
  const product = f.children.find((c) => c.label === "product");
  assertExists(sum);
  assertExists(product);
  assertEquals(sum.type, "ref");
  assertEquals(sum.ref, "add");
  assertEquals(product.type, "ref");
  assertEquals(product.ref, "multiply");
});

Deno.test("scope-inferred ref: prior defn is also a valid ref target", () => {
  const src = `(defn square [x]
  (let [result (multiply x x)]
    result))
(defn pipeline [a]
  (square a))`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const pipeline = treeNodes.find((n) => n.label === "pipeline")!;
  const squareChild = pipeline.children.find((c) => c.label === "square");
  assertExists(squareChild);
  assertEquals(squareChild.type, "ref");
  assertEquals(squareChild.ref, "square");
});

Deno.test("scope-inferred ref: round-trip preserves ref through emit and re-parse", () => {
  const src = `(def divide)
(defn normalise [a b]
  (divide b a))`;
  const { treeNodes, edges, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  // Re-emit and re-parse
  const clj2 = graphToSpike(treeNodes, edges);
  const { treeNodes: rt, errors: e2 } = spikeToGraph(clj2);
  assertEquals(e2, []);
  const normalise = rt.find((n) => n.label === "normalise")!;
  const divChild = normalise.children.find((c) => c.label === "divide" || c.ref === "divide");
  assertExists(divChild);
  assertEquals(divChild.type, "ref");
  assertEquals(divChild.ref, "divide");
});

Deno.test("scope-inferred ref: duplicate calls with distinct binding names → distinct ref nodes", () => {
  const src = `(def double)
(defn f [a b]
  (let [x (double a)
        y (double b)]
    {:x x :y y}))`;
  const { treeNodes, errors } = spikeToGraph(src);
  assertEquals(errors, []);
  const f = treeNodes.find((n) => n.label === "f")!;
  const xNode = f.children.find((c) => c.label === "x");
  const yNode = f.children.find((c) => c.label === "y");
  assertExists(xNode);
  assertExists(yNode);
  // Both are refs to the same target
  assertEquals(xNode.type, "ref");
  assertEquals(xNode.ref, "double");
  assertEquals(yNode.type, "ref");
  assertEquals(yNode.ref, "double");
  // Both preserve data.fn
  assertEquals(xNode.data.fn, "double");
  assertEquals(yNode.data.fn, "double");
  // Distinct identities
  assertEquals(xNode.id, "x");
  assertEquals(yNode.id, "y");
});

// ---------------------------------------------------------------------------
// Destructuring: {:keys [...]} in let bindings
// ---------------------------------------------------------------------------

Deno.test("destructuring: {:keys} binding creates node with destructuredKeys", () => {
  const clj = `(defn pipeline [input]
  (let [{:keys [p q]} (split input)]
    (combine p q)))`;
  const { treeNodes, edges } = spikeToGraph(clj);
  const pipeline = treeNodes[0];
  assertEquals(pipeline.label, "pipeline");

  const split = pipeline.children.find((c) => c.label === "split" || c.data.fn === "split");
  assertExists(split, "split node should exist");
  assertEquals(split.data.destructuredKeys, ["p", "q"]);

  const combine = pipeline.children.find((c) => c.label === "combine" || c.data.fn === "combine");
  assertExists(combine, "combine node should exist");
  // argOrder uses destructured binding names, not source node label
  assertEquals(combine.data.argOrder, ["p", "q"]);

  // Single edge from split → combine (not two separate edges)
  const splitToCombine = edges.filter((e) => e.fromId === split.id && e.toId === combine.id);
  assertEquals(splitToCombine.length, 1);
});

Deno.test("destructuring: round-trip preserves {:keys} syntax", () => {
  const clj = `(defn pipeline [input]
  (let [{:keys [p q]} (split input)]
    (combine p q)))`;
  const { treeNodes, edges } = spikeToGraph(clj);
  const emitted = graphToSpike(treeNodes, edges);
  // Emitter puts param vector on new line — normalising round-trip
  const expected =
    `(defn pipeline\n  [input]\n  (let [{:keys [p q]} (split input)]\n    (combine p q)))`;
  assertEquals(emitted.trim(), expected);
});

Deno.test("destructuring: normalising round-trip stabilises", () => {
  const clj = `(defn pipeline [input]
  (let [{:keys [p q]} (split input)]
    (combine p q)))`;
  const pass1 = spikeToGraph(clj);
  const emitted1 = graphToSpike(pass1.treeNodes, pass1.edges);
  const pass2 = spikeToGraph(emitted1);
  const emitted2 = graphToSpike(pass2.treeNodes, pass2.edges);
  assertEquals(emitted1, emitted2);
});

// ---------------------------------------------------------------------------
// Import declarations: (require name1 name2 ...)
// ---------------------------------------------------------------------------

Deno.test("import: require adds names to scope for ref inference", () => {
  const clj = `(require divide multiply)

(defn pipeline [a b]
  (let [result (divide a b)]
    (multiply result 2.0)))`;
  const { treeNodes } = spikeToGraph(clj);
  // require should NOT create nodes — only the defn should exist
  assertEquals(treeNodes.length, 1);
  assertEquals(treeNodes[0].label, "pipeline");
  // divide and multiply should be inferred as refs
  const divideNode = treeNodes[0].children.find((c) => c.id === "result");
  assertExists(divideNode);
  assertEquals(divideNode.type, "ref");
  assertEquals(divideNode.ref, "divide");
  const mulNode = treeNodes[0].children.find(
    (c) => c.label === "multiply" || c.data.fn === "multiply",
  );
  assertExists(mulNode);
  assertEquals(mulNode.type, "ref");
  assertEquals(mulNode.ref, "multiply");
});

Deno.test("import: graphToSpike emits require preamble when imports provided", () => {
  const clj = `(defn f [x] (add x 1))`;
  const { treeNodes, edges } = spikeToGraph(clj);
  const emitted = graphToSpike(treeNodes, edges, ["add", "subtract"]);
  assertEquals(emitted.startsWith("(require add subtract)"), true);
});

Deno.test("import: round-trip with require preserves refs", () => {
  const clj = `(require divide)

(defn f [a b]
  (divide a b))`;
  const pass1 = spikeToGraph(clj);
  const divNode = pass1.treeNodes[0].children.find(
    (c) => c.label === "divide" || c.data.fn === "divide",
  );
  assertExists(divNode);
  assertEquals(divNode.type, "ref");
  assertEquals(divNode.ref, "divide");
});
