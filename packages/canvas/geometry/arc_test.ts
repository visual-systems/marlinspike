import { assertAlmostEquals } from "@std/assert/assert-almost-equals";
import { assertEquals } from "@std/assert";
import { arcMidpoint, pathEndTangent } from "./arc.ts";

Deno.test("pathEndTangent — straight line returns chord direction", () => {
  const t = pathEndTangent({ x: 0, y: 0 }, { x: 10, y: 0 }, false, 0, 0);
  assertAlmostEquals(t.x, 1, 0.01);
  assertAlmostEquals(t.y, 0, 0.01);
});

Deno.test("pathEndTangent — coincident points return fallback", () => {
  const t = pathEndTangent({ x: 5, y: 5 }, { x: 5, y: 5 }, false, 0, 0);
  assertEquals(t.x, 1);
  assertEquals(t.y, 0);
});

Deno.test("pathEndTangent — diagonal chord", () => {
  const t = pathEndTangent({ x: 0, y: 0 }, { x: 10, y: 10 }, false, 0, 0);
  const inv = 1 / Math.sqrt(2);
  assertAlmostEquals(t.x, inv, 0.01);
  assertAlmostEquals(t.y, inv, 0.01);
});

Deno.test("arcMidpoint — no arc center returns chord midpoint", () => {
  const m = arcMidpoint(0, 0, 10, 0, 5, 0);
  assertEquals(m.x, 5);
  assertEquals(m.y, 0);
});

Deno.test("arcMidpoint — with arc center returns point on arc", () => {
  const m = arcMidpoint(10, 0, -10, 0, 10, 0, { x: 0, y: 0 });
  // Midpoint should be at distance r from arcC
  const dist = Math.sqrt(m.x * m.x + m.y * m.y);
  assertAlmostEquals(dist, 10, 0.01);
});
