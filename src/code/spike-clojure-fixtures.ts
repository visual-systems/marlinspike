/**
 * Shared fixtures for Spike-Clojure round-trip tests and stories.
 *
 * Both `spike-clojure_test.ts` and the round-trip stories import from here,
 * so the test data and story display are always in sync.
 *
 * Fixtures are grouped by topology type. Some fixtures intentionally expose
 * known shortcomings — their round-trip will fail and the mismatch is
 * documented in the fixture's `shortcoming` field.
 */

import type { Edge, TreeNode } from "../ui/workspace.ts";
import type { NumericFnEnv } from "./spike-clojure-eval.ts";

// ---------------------------------------------------------------------------
// Primitive builders
// ---------------------------------------------------------------------------

export function leaf(label: string): TreeNode {
  return { id: label, label, kind: "leaf", children: [], data: {}, version: 1 };
}

export function composite(label: string, children: TreeNode[]): TreeNode {
  return {
    id: label,
    label,
    kind: "composite",
    children,
    data: {},
    version: 1,
  };
}

export function refNode(label: string, target: string): TreeNode {
  return {
    id: label,
    label,
    kind: "composite",
    type: "ref",
    ref: target,
    children: [],
    data: {},
    version: 1,
  };
}

export function edge(from: string, to: string): Edge {
  return {
    id: `${from}-${to}`,
    fromId: from,
    toId: to,
    label: "",
    data: {},
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// Fixture type
// ---------------------------------------------------------------------------

export interface Fixture {
  /** Short display label for the story / test name. */
  label: string;
  /** Human-readable description of the topology. */
  description: string;
  nodes: TreeNode[];
  edges: Edge[];
  /**
   * If set, an idiomatic hand-written Clojure form to use as the starting
   * point for the clj→graph→clj section of the round-trip story.
   * When absent, the section starts from the emitter output (graphToSpike).
   */
  clj?: string;
  /**
   * If set, describes a known serialisation shortcoming that prevents this
   * fixture from round-tripping correctly. The round-trip will show ✗ but
   * the failure is expected and documented.
   */
  shortcoming?: string;
  /**
   * If set, describes a known shortcoming that prevents the `fixture.clj`
   * idiomatic form from round-tripping stably (parse → emit → parse ≠ parse).
   * Only affects the `idiomatic clj parse stable` test, not graph→clj→graph.
   */
  cljShortcoming?: string;
  /**
   * Concrete input/output examples for evaluating this fixture's `clj` form.
   * Keys in `inputs` must match the defn's parameter names.
   * Keys in `expected` must match the defn's output map keys.
   */
  examples?: Array<{ inputs: Record<string, number>; expected: Record<string, number> }>;
  /** Functions needed to evaluate the `examples`. Provided as a numeric env. */
  evalFns?: NumericFnEnv;
  /**
   * If set, describes a known semantic loss in the round-trip: evaluating the
   * original and the round-tripped form with the same inputs produces different
   * results. The eval-comparison test confirms the mismatch is present.
   */
  evalShortcoming?: string;
}

// ---------------------------------------------------------------------------
// Fixture catalogue
// ---------------------------------------------------------------------------

export const FIXTURES: Fixture[] = [
  // ── def: structural containment (no edges) ──────────────────────────────

  {
    label: "def: leaf-only",
    description: "A composite holding three leaf children; no edges.",
    nodes: [composite("my-graph", [leaf("A"), leaf("B"), leaf("C")])],
    edges: [],
  },
  {
    label: "def: nested composites",
    description: "A composite whose child is itself a composite.",
    nodes: [composite("outer", [leaf("B"), composite("inner", [leaf("D")])])],
    edges: [],
  },
  {
    label: "def: three levels of nesting",
    description: "outer → middle → inner, each a structural container.",
    nodes: [
      composite("outer", [
        leaf("X"),
        composite("middle", [
          leaf("Y"),
          composite("inner", [leaf("Z1"), leaf("Z2")]),
        ]),
      ]),
    ],
    edges: [],
  },
  {
    label: "def: multiple root composites",
    description: "Two independent top-level structural containers.",
    nodes: [
      composite("service-a", [leaf("P"), leaf("Q")]),
      composite("service-b", [leaf("R"), leaf("S"), leaf("T")]),
    ],
    edges: [],
  },
  {
    label: "def: OIDC provider (structural listing)",
    description: "Six-node structural container — same nodes as OIDC flow but no call order.",
    nodes: [
      composite("oidc-provider", [
        leaf("parse-auth-request"),
        leaf("validate-client"),
        leaf("authenticate-user"),
        leaf("issue-auth-code"),
        leaf("exchange-code"),
        leaf("build-response"),
      ]),
    ],
    edges: [],
  },
  {
    label: "def: auth-service (structural)",
    description: "Structural container grouping ingress, processor, egress.",
    nodes: [
      composite("auth-service", [
        leaf("ingress"),
        leaf("processor"),
        leaf("egress"),
      ]),
    ],
    edges: [],
  },

  // ── defn: dataflow (edges encoded as let bindings) ──────────────────────

  {
    label: "defn: chain A→B→C",
    description: "Sequential pipeline — A feeds B, B feeds C.",
    clj: `(defn pipeline [A]
  (let [b (B A)]
    (C b)))`,
    nodes: [composite("pipeline", [leaf("A"), leaf("B"), leaf("C")])],
    edges: [edge("A", "B"), edge("B", "C")],
  },
  {
    label: "defn: long chain A→B→C→D→E",
    description: "Five-node sequential pipeline.",
    clj: `(defn pipeline [A]
  (let [b (B A)
        c (C b)
        d (D c)]
    (E d)))`,
    nodes: [
      composite("pipeline", [
        leaf("A"),
        leaf("B"),
        leaf("C"),
        leaf("D"),
        leaf("E"),
      ]),
    ],
    edges: [edge("A", "B"), edge("B", "C"), edge("C", "D"), edge("D", "E")],
  },
  {
    label: "defn: fan-out A→B, A→C",
    description: "A's output is consumed by both B and C independently.",
    clj: `(defn pipeline [A]
  (let [b (B A)
        c (C A)]
    {:b b :c c}))`,
    nodes: [composite("pipeline", [leaf("A"), leaf("B"), leaf("C")])],
    edges: [edge("A", "B"), edge("A", "C")],
  },
  {
    label: "defn: wide fan-out A→B, A→C, A→D",
    description: "One source node feeds three consumers.",
    clj: `(defn pipeline [A]
  (let [b (B A)
        c (C A)
        d (D A)]
    {:b b :c c :d d}))`,
    nodes: [
      composite("pipeline", [leaf("A"), leaf("B"), leaf("C"), leaf("D")]),
    ],
    edges: [edge("A", "B"), edge("A", "C"), edge("A", "D")],
  },
  {
    label: "defn: fan-in A→C, B→C",
    description: "A and B are independent; both feed C.",
    clj: `(defn pipeline [A B]
  (C A B))`,
    nodes: [composite("pipeline", [leaf("A"), leaf("B"), leaf("C")])],
    edges: [edge("A", "C"), edge("B", "C")],
  },
  {
    label: "defn: wide fan-in A→D, B→D, C→D",
    description: "Three independent sources all feed one sink.",
    clj: `(defn pipeline [A B C]
  (D A B C))`,
    nodes: [
      composite("pipeline", [leaf("A"), leaf("B"), leaf("C"), leaf("D")]),
    ],
    edges: [edge("A", "D"), edge("B", "D"), edge("C", "D")],
  },
  {
    label: "defn: diamond A→B, A→C, B→D, C→D",
    description: "A fans out to B and C; both converge at D.",
    clj: `(defn pipeline [A]
  (let [b (B A)
        c (C A)]
    (D b c)))`,
    nodes: [
      composite("pipeline", [leaf("A"), leaf("B"), leaf("C"), leaf("D")]),
    ],
    edges: [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")],
  },
  {
    label: "defn: two parallel chains merging",
    description: "A→B and C→D both feed E.",
    clj: `(defn pipeline [A C]
  (let [b (B A)
        d (D C)]
    (E b d)))`,
    nodes: [
      composite("pipeline", [
        leaf("A"),
        leaf("B"),
        leaf("C"),
        leaf("D"),
        leaf("E"),
      ]),
    ],
    edges: [edge("A", "B"), edge("C", "D"), edge("B", "E"), edge("D", "E")],
  },
  {
    label: "defn: validate-enrich-respond chain",
    description: "validate → enrich → respond sequential flow.",
    clj: `(defn processor [request]
  (let [validated (validate request)
        enriched  (enrich validated)]
    (respond enriched)))`,
    nodes: [
      composite("processor", [
        leaf("validate"),
        leaf("enrich"),
        leaf("respond"),
      ]),
    ],
    edges: [edge("validate", "enrich"), edge("enrich", "respond")],
  },
  {
    label: "defn: transform→validator pipeline",
    description: "Two-node pipeline matching PortSyntax story.",
    clj: `(defn pipeline [input]
  (let [t (transform input)]
    (validator t)))`,
    nodes: [
      composite("pipeline", [leaf("transform"), leaf("validator")]),
    ],
    edges: [edge("transform", "validator")],
  },
  {
    label: "defn: OIDC flow (parse fans out, converges at issue-auth-code)",
    description:
      "parse-auth-request → validate-client + authenticate-user → issue-auth-code → exchange-code → build-response.",
    clj: `(defn oidc-flow [request]
  (let [parsed    (parse-auth-request request)
        client    (validate-client parsed)
        user      (authenticate-user parsed)
        code      (issue-auth-code client user)
        token     (exchange-code code)]
    (build-response token)))`,
    nodes: [
      composite("oidc-flow", [
        leaf("parse-auth-request"),
        leaf("validate-client"),
        leaf("authenticate-user"),
        leaf("issue-auth-code"),
        leaf("exchange-code"),
        leaf("build-response"),
      ]),
    ],
    edges: [
      edge("parse-auth-request", "validate-client"),
      edge("parse-auth-request", "authenticate-user"),
      edge("validate-client", "issue-auth-code"),
      edge("authenticate-user", "issue-auth-code"),
      edge("issue-auth-code", "exchange-code"),
      edge("exchange-code", "build-response"),
    ],
  },

  {
    label: "defn: quadratic-roots — full algorithm",
    description: "14-node dataflow graph computing x₁ and x₂ via the quadratic formula. " +
      "Two fan-outs (b, sqrt-disc, negate-b) and two terminal outputs (div-x1, div-x2).",
    clj: `(defn quadratic-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  (let [neg-b  (negate b)
        disc   (subtract (square b) (multiply 4.0 (multiply a c)))
        sqrt-d (sqrt disc)
        two-a  (multiply 2.0 a)]
    {:x1 (divide (add      neg-b sqrt-d) two-a)
     :x2 (divide (subtract neg-b sqrt-d) two-a)}))`,
    nodes: [
      composite("quadratic-roots", [
        leaf("a"),
        leaf("b"),
        leaf("c"),
        leaf("negate-b"),
        leaf("square-b"),
        leaf("mul-ac"),
        leaf("mul-4ac"),
        leaf("sub-disc"),
        leaf("sqrt-disc"),
        leaf("mul-2a"),
        leaf("add-plus"),
        leaf("sub-minus"),
        leaf("div-x1"),
        leaf("div-x2"),
      ]),
    ],
    edges: [
      edge("b", "negate-b"),
      edge("b", "square-b"),
      edge("a", "mul-ac"),
      edge("c", "mul-ac"),
      edge("mul-ac", "mul-4ac"),
      edge("square-b", "sub-disc"),
      edge("mul-4ac", "sub-disc"),
      edge("sub-disc", "sqrt-disc"),
      edge("negate-b", "add-plus"),
      edge("negate-b", "sub-minus"),
      edge("sqrt-disc", "add-plus"),
      edge("sqrt-disc", "sub-minus"),
      edge("a", "mul-2a"),
      edge("add-plus", "div-x1"),
      edge("sub-minus", "div-x2"),
      edge("mul-2a", "div-x1"),
      edge("mul-2a", "div-x2"),
    ],
    examples: [
      // x² - 5x + 6 = 0  →  x = 3, x = 2
      { inputs: { a: 1, b: -5, c: 6 }, expected: { x1: 3, x2: 2 } },
      // x² - 3x + 2 = 0  →  x = 2, x = 1
      { inputs: { a: 1, b: -3, c: 2 }, expected: { x1: 2, x2: 1 } },
      // 2x² - 4x + 2 = 0  →  double root x = 1
      { inputs: { a: 2, b: -4, c: 2 }, expected: { x1: 1, x2: 1 } },
    ],
    evalFns: {
      negate: (x) => -x,
      square: (x) => x * x,
      multiply: (a, b) => a * b,
      subtract: (a, b) => a - b,
      sqrt: (x) => Math.sqrt(x),
      add: (a, b) => a + b,
      divide: (a, b) => a / b,
    },
  },

  // ── minimal repro: duplicate function call ───────────────────────────────

  {
    label: "defn: duplicate fn call — (double a) and (double b)",
    description:
      "Minimal repro for the duplicate-call collapse bug: same function called twice in separate let bindings with different args.",
    clj: `(defn f [a b]
  (let [x (double a)
        y (double b)]
    {:x x :y y}))`,
    nodes: [composite("f", [leaf("a"), leaf("b"), leaf("double")])],
    edges: [edge("a", "double"), edge("b", "double")],
    examples: [{ inputs: { a: 3, b: 4 }, expected: { x: 6, y: 8 } }],
    evalFns: { double: (x) => x * 2 },
  },

  // ── nested defn inside def ───────────────────────────────────────────────

  {
    label: "nested defn inside def: processor chain inside auth-service",
    description:
      "auth-service (def) contains ingress, egress, and processor (defn with validate→enrich→respond).",
    nodes: [
      composite("auth-service", [
        leaf("ingress"),
        composite("processor", [
          leaf("validate"),
          leaf("enrich"),
          leaf("respond"),
        ]),
        leaf("egress"),
      ]),
    ],
    edges: [edge("validate", "enrich"), edge("enrich", "respond")],
  },

  // ── root-level leaves ──────────────────────────────────────────────────

  {
    label: "def: root-level leaf nodes",
    description: "Standalone leaf nodes (no composite parent) emitted as bare (def name) forms.",
    nodes: [leaf("A"), leaf("B"), leaf("C")],
    edges: [],
  },

  // ── by-design limitations ──────────────────────────────────────────────

  {
    label: "by-design: root-level edges require a containing composite",
    description: "Edges between root-level nodes have no containing defn form — " +
      "this matches Clojure semantics where dataflow requires a function scope.",
    nodes: [leaf("A"), leaf("B"), leaf("C")],
    edges: [edge("A", "B"), edge("B", "C")],
    shortcoming: "By design: root-level edges require a containing composite (defn). " +
      "Leaf nodes are emitted as bare (def name) but edges need let-binding scope.",
  },

  // ── entity references ────────────────────────────────────────────────────

  {
    label: "def: cubic roots with references",
    description:
      "Shared math primitives referenced across four pipeline steps via (def name target) ref syntax.",
    nodes: [
      leaf("divide"),
      leaf("multiply"),
      leaf("square"),
      leaf("add"),
      leaf("subtract"),
      leaf("negate"),
      leaf("sqrt"),
      leaf("cbrt"),
      composite("normalise", [
        leaf("a"),
        leaf("b"),
        leaf("c"),
        leaf("d"),
      ]),
      composite("depressed-coefficients", [
        leaf("b"),
        leaf("c"),
        leaf("d"),
      ]),
      composite("cardano-terms", [
        leaf("p"),
        leaf("q"),
      ]),
      composite("back-substitute", [
        leaf("u"),
        leaf("v"),
        leaf("b-norm"),
      ]),
      refNode("use-normalise", "normalise"),
      refNode("use-depressed", "depressed-coefficients"),
      refNode("use-cardano", "cardano-terms"),
      refNode("use-back-sub", "back-substitute"),
    ],
    edges: [
      // normalise internals
      edge("b", "divide"),
      edge("a", "divide"),
      edge("c", "divide"),
      edge("d", "divide"),
    ],
    clj: `; Shared primitives
(def divide)
(def multiply)
(def square)
(def add)
(def subtract)
(def negate)
(def sqrt)
(def cbrt)

; Step 1 — normalise coefficients by dividing through by a
(defn normalise [a b c d]
  {:b (divide b a)
   :c (divide c a)
   :d (divide d a)})

; Step 2 — depress the cubic: eliminate the x² term
(defn depressed-coefficients [b c d]
  (let [b-sq (square b)
        b-cu (multiply b-sq b)
        p    (subtract c (divide b-sq 3))
        q    (add (subtract d (divide (multiply b c) 3))
                  (divide (multiply 2 b-cu) 27))]
    {:p p :q q}))

; Step 3 — Cardano's u and v terms
(defn cardano-terms [p q]
  (let [inner      (add (divide (square q) 4)
                         (divide (multiply p (square p)) 27))
        sqrt-inner (sqrt inner)
        neg-q-half (divide (negate q) 2)]
    {:u (cbrt (add      neg-q-half sqrt-inner))
     :v (cbrt (subtract neg-q-half sqrt-inner))}))

; Step 4 — recover x roots, back-substituting x = t - b/3
(defn back-substitute [u v b-norm]
  (let [shift    (divide b-norm 3)
        uv       (add u v)
        uv-half  (divide uv 2)]
    {:x1 (subtract uv          shift)
     :x2 (subtract (negate uv-half) shift)
     :x3 (subtract (negate uv-half) shift)}))

; Top-level entry point — references to shared functions
(def use-normalise normalise)
(def use-depressed depressed-coefficients)
(def use-cardano cardano-terms)
(def use-back-sub back-substitute)`,
    shortcoming: "graph→clj→graph: graph nodes/edges are a simplified skeleton — " +
      "the defn internals are only fully represented via the clj form.",
  },

  // ── destructuring ────────────────────────────────────────────────────────

  {
    label: "destructuring: {:keys} in let binding",
    description: "A destructured let binding produces a node with destructuredKeys " +
      "and downstream args use port names in argOrder.",
    nodes: [],
    edges: [],
    clj: `(defn pipeline [input]
  (let [{:keys [p q]} (split input)]
    (combine p q)))`,
  },

  // ── imports ──────────────────────────────────────────────────────────────

  {
    label: "require: imported names become refs",
    description: "A (require ...) preamble adds names to scope so calls to those " +
      "functions produce ref nodes, without creating any top-level nodes.",
    nodes: [],
    edges: [],
    clj: `(require divide multiply)

(defn pipeline [a b]
  (let [result (divide a b)]
    (multiply result 2.0)))`,
    cljShortcoming: "require preamble is lost in graph — imports are only scope markers, " +
      "not stored as nodes. Re-emit loses the require and ref annotations.",
  },
];
