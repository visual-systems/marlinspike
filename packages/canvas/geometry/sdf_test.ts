import { assertAlmostEquals } from "@std/assert/assert-almost-equals";
import { assertEquals } from "@std/assert";
import { isCircleShape, lineSdfDist, sdfGradient, sdfOf, surfaceToSurface } from "./sdf.ts";

Deno.test("isCircleShape — square is circle", () => {
  assertEquals(isCircleShape({ x: 0, y: 0, w: 52, h: 52 }, 0.1), true);
});

Deno.test("isCircleShape — rectangle is not circle", () => {
  assertEquals(isCircleShape({ x: 0, y: 0, w: 100, h: 60 }, 0.1), false);
});

Deno.test("isCircleShape — zero size is circle", () => {
  assertEquals(isCircleShape({ x: 0, y: 0, w: 0, h: 0 }, 0.1), true);
});

Deno.test("sdfOf — circle: center returns negative radius", () => {
  const sdf = sdfOf({ x: 0, y: 0, w: 20, h: 20 }, 0.1);
  assertAlmostEquals(sdf(0, 0), -10, 0.01);
});

Deno.test("sdfOf — circle: on surface returns zero", () => {
  const sdf = sdfOf({ x: 0, y: 0, w: 20, h: 20 }, 0.1);
  assertAlmostEquals(sdf(10, 0), 0, 0.01);
});

Deno.test("sdfOf — circle: outside returns positive distance", () => {
  const sdf = sdfOf({ x: 0, y: 0, w: 20, h: 20 }, 0.1);
  assertAlmostEquals(sdf(15, 0), 5, 0.01);
});

Deno.test("sdfOf — rect: center returns negative", () => {
  const sdf = sdfOf({ x: 0, y: 0, w: 100, h: 60 }, 0.1);
  const val = sdf(0, 0);
  assertEquals(val < 0, true);
});

Deno.test("sdfOf — rect: on corner returns zero", () => {
  const sdf = sdfOf({ x: 0, y: 0, w: 100, h: 60 }, 0.1);
  assertAlmostEquals(sdf(50, 30), 0, 0.01);
});

Deno.test("surfaceToSurface — touching circles return zero", () => {
  const a = { x: 0, y: 0, w: 20, h: 20 };
  const b = { x: 20, y: 0, w: 20, h: 20 };
  assertAlmostEquals(surfaceToSurface(a, b, 0.1), 0, 0.01);
});

Deno.test("surfaceToSurface — separated circles return positive", () => {
  const a = { x: 0, y: 0, w: 20, h: 20 };
  const b = { x: 30, y: 0, w: 20, h: 20 };
  assertAlmostEquals(surfaceToSurface(a, b, 0.1), 10, 0.01);
});

Deno.test("surfaceToSurface — overlapping circles return negative", () => {
  const a = { x: 0, y: 0, w: 20, h: 20 };
  const b = { x: 10, y: 0, w: 20, h: 20 };
  assertAlmostEquals(surfaceToSurface(a, b, 0.1), -10, 0.01);
});

Deno.test("surfaceToSurface — coincident shapes return negative sum of extents", () => {
  const a = { x: 5, y: 5, w: 20, h: 20 };
  const b = { x: 5, y: 5, w: 20, h: 20 };
  assertAlmostEquals(surfaceToSurface(a, b, 0.1), -20, 0.01);
});

Deno.test("sdfGradient — circle gradient points outward", () => {
  const sdf = sdfOf({ x: 0, y: 0, w: 20, h: 20 }, 0.1);
  const [gx, gy] = sdfGradient(sdf, 15, 0, 0.01);
  assertAlmostEquals(gx, 1, 0.01);
  assertAlmostEquals(gy, 0, 0.1);
});

Deno.test("lineSdfDist — point on segment returns zero", () => {
  assertAlmostEquals(lineSdfDist(5, 0, 0, 0, 10, 0), 0, 0.01);
});

Deno.test("lineSdfDist — point perpendicular to segment", () => {
  assertAlmostEquals(lineSdfDist(5, 3, 0, 0, 10, 0), 3, 0.01);
});

Deno.test("lineSdfDist — point beyond segment end", () => {
  const d = lineSdfDist(15, 0, 0, 0, 10, 0);
  assertAlmostEquals(d, 5, 0.01);
});

Deno.test("lineSdfDist — degenerate segment (zero length)", () => {
  const d = lineSdfDist(3, 4, 0, 0, 0, 0);
  assertAlmostEquals(d, 5, 0.01);
});
