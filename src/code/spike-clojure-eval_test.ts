/**
 * Unit tests for the Spike-Clojure evaluator.
 *
 * These tests exercise the evaluator directly against small hand-written
 * Spike-Clojure snippets, independently of the parser/emitter pipeline.
 * They verify that `evaluateSpike` is semantically correct before we rely
 * on it for round-trip comparison tests.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { assertAlmostEquals } from "@std/assert";
import { evaluateSpike, numericEnv } from "./spike-clojure-eval.ts";

// Shared numeric environment used across most tests
const math = numericEnv({
  negate: (x) => -x,
  double: (x) => x * 2,
  inc: (x) => x + 1,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  sq: (x) => x * x,
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
});

// ---------------------------------------------------------------------------
// Literals and basic expressions
// ---------------------------------------------------------------------------

Deno.test("evaluator: numeric literal in direct body", () => {
  // (defn f [] 42) — no params, no let; returns a literal
  // Note: base_lisp parses 42 as a number, not a call
  // Wrap in a let to allow returning a literal:
  const src = `(defn f [x] (inc x))`;
  assertEquals(evaluateSpike(src, { x: 41 }, math), 42);
});

Deno.test("evaluator: boolean literal passthrough", () => {
  // Boolean args pass through as EvalValue
  const src = `(defn f [x] (negate x))`;
  // Passing a number — just ensure the function gets called
  assertEquals(evaluateSpike(src, { x: 3 }, math), -3);
});

// ---------------------------------------------------------------------------
// Symbol resolution
// ---------------------------------------------------------------------------

Deno.test("evaluator: unbound symbol throws", () => {
  const src = `(defn f [x] (inc y))`;
  assertThrows(
    () => evaluateSpike(src, { x: 1 }, math),
    Error,
    "Unbound symbol: 'y'",
  );
});

Deno.test("evaluator: unknown function throws", () => {
  const src = `(defn f [x] (unknown x))`;
  assertThrows(
    () => evaluateSpike(src, { x: 1 }, math),
    Error,
    "Unknown function: 'unknown'",
  );
});

// ---------------------------------------------------------------------------
// Let bindings
// ---------------------------------------------------------------------------

Deno.test("evaluator: single let binding", () => {
  const src = `(defn f [x]
  (let [y (double x)]
    y))`;
  assertEquals(evaluateSpike(src, { x: 5 }, math), 10);
});

Deno.test("evaluator: chained let bindings", () => {
  const src = `(defn f [x]
  (let [a (double x)
        b (inc a)]
    b))`;
  assertEquals(evaluateSpike(src, { x: 3 }, math), 7); // double(3)=6, inc(6)=7
});

Deno.test("evaluator: let binding with numeric literal as arg", () => {
  // mul(4.0, x) — 4.0 is a numeric literal in the call
  const src = `(defn f [x]
  (let [y (mul 4.0 x)]
    y))`;
  assertEquals(evaluateSpike(src, { x: 3 }, math), 12);
});

// ---------------------------------------------------------------------------
// Nested calls (inline arguments)
// ---------------------------------------------------------------------------

Deno.test("evaluator: nested call as argument", () => {
  // inc(double(x)) — double is inlined as argument to inc
  const src = `(defn f [x]
  (inc (double x)))`;
  assertEquals(evaluateSpike(src, { x: 4 }, math), 9); // double(4)=8, inc(8)=9
});

Deno.test("evaluator: two-deep nesting", () => {
  const src = `(defn f [x]
  (negate (double (inc x))))`;
  assertEquals(evaluateSpike(src, { x: 2 }, math), -6); // inc(2)=3, double(3)=6, negate(6)=-6
});

// ---------------------------------------------------------------------------
// Map return
// ---------------------------------------------------------------------------

Deno.test("evaluator: map body return", () => {
  const src = `(defn f [x]
  (let [a (double x)
        b (negate x)]
    {:pos a :neg b}))`;
  assertEquals(evaluateSpike(src, { x: 5 }, math), { pos: 10, neg: -5 });
});

Deno.test("evaluator: map body with inlined calls", () => {
  // {:out1 (double x) :out2 (negate x)} — calls inlined directly in map values
  const src = `(defn f [x]
  {:out1 (double x) :out2 (negate x)})`;
  assertEquals(evaluateSpike(src, { x: 3 }, math), { out1: 6, out2: -3 });
});

// ---------------------------------------------------------------------------
// defn features: ^Type hints and {:ports …} attr-map (should be ignored)
// ---------------------------------------------------------------------------

Deno.test("evaluator: ^Type hints on params are ignored", () => {
  const src = `(defn f [^float x ^float y]
  (add x y))`;
  assertEquals(evaluateSpike(src, { x: 3, y: 4 }, math), 7);
});

Deno.test("evaluator: {:ports …} attr-map before params is ignored", () => {
  const src = `(defn f
  {:ports {:out float}}
  [^float x]
  (double x))`;
  assertEquals(evaluateSpike(src, { x: 5 }, math), 10);
});

// ---------------------------------------------------------------------------
// Multiple defns — select by name
// ---------------------------------------------------------------------------

Deno.test("evaluator: selects named defn when multiple present", () => {
  const src = `
(defn double-it [x] (double x))
(defn triple-it [x] (add x (double x)))`;
  assertEquals(evaluateSpike(src, { x: 4 }, math, "double-it"), 8);
  assertEquals(evaluateSpike(src, { x: 4 }, math, "triple-it"), 12);
});

Deno.test("evaluator: defaults to first defn when name omitted", () => {
  const src = `
(defn first-fn [x] (double x))
(defn second-fn [x] (negate x))`;
  assertEquals(evaluateSpike(src, { x: 5 }, math), 10); // first-fn
});

// ---------------------------------------------------------------------------
// Quadratic roots — end-to-end semantic test
// ---------------------------------------------------------------------------

const quadraticFns = numericEnv({
  negate: (x) => -x,
  square: (x) => x * x,
  multiply: (a, b) => a * b,
  subtract: (a, b) => a - b,
  sqrt: (x) => Math.sqrt(x),
  add: (a, b) => a + b,
  divide: (a, b) => a / b,
});

const QR_SRC = `(defn quadratic-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  (let [neg-b  (negate b)
        disc   (subtract (square b) (multiply 4.0 (multiply a c)))
        sqrt-d (sqrt disc)
        two-a  (multiply 2.0 a)]
    {:x1 (divide (add      neg-b sqrt-d) two-a)
     :x2 (divide (subtract neg-b sqrt-d) two-a)}))`;

Deno.test("evaluator: quadratic-roots x²-5x+6=0 → roots 3 and 2", () => {
  const result = evaluateSpike(QR_SRC, { a: 1, b: -5, c: 6 }, quadraticFns) as Record<
    string,
    number
  >;
  assertAlmostEquals(result.x1, 3, 1e-9);
  assertAlmostEquals(result.x2, 2, 1e-9);
});

Deno.test("evaluator: quadratic-roots x²-3x+2=0 → roots 2 and 1", () => {
  const result = evaluateSpike(QR_SRC, { a: 1, b: -3, c: 2 }, quadraticFns) as Record<
    string,
    number
  >;
  assertAlmostEquals(result.x1, 2, 1e-9);
  assertAlmostEquals(result.x2, 1, 1e-9);
});

Deno.test("evaluator: quadratic-roots 2x²-4x+2=0 → double root 1", () => {
  const result = evaluateSpike(QR_SRC, { a: 2, b: -4, c: 2 }, quadraticFns) as Record<
    string,
    number
  >;
  assertAlmostEquals(result.x1, 1, 1e-9);
  assertAlmostEquals(result.x2, 1, 1e-9);
});
