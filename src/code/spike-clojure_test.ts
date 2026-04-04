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

import { assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
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
