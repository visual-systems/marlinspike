import { assertEquals } from "@std/assert";
import { assertAlmostEquals } from "@std/assert/assert-almost-equals";
import type { CanvasNode } from "../scene/types.ts";
import { surfacePoint } from "./surface.ts";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "./node-geometry.ts";

function circleNode(id: string, x: number, y: number, r = 26): CanvasNode {
  return { id, x, y, w: r * 2, h: r * 2, geometry: CIRCLE_GEOMETRY, label: id };
}

function rectNode(id: string, x: number, y: number, w = 100, h = 60): CanvasNode {
  return { id, x, y, w, h, geometry: RECT_GEOMETRY, label: id };
}

Deno.test("surfacePoint — circle clips at radius", () => {
  const from = circleNode("a", 0, 0, 26);
  const to = circleNode("b", 100, 0, 26);
  const p = surfacePoint(from, to);
  assertAlmostEquals(p.x, 26, 0.01);
  assertAlmostEquals(p.y, 0, 0.01);
});

Deno.test("surfacePoint — circle with gap", () => {
  const from = circleNode("a", 0, 0, 26);
  const to = circleNode("b", 100, 0, 26);
  const p = surfacePoint(from, to, 5);
  assertAlmostEquals(p.x, 31, 0.01);
  assertAlmostEquals(p.y, 0, 0.01);
});

Deno.test("surfacePoint — rect clips at AABB boundary horizontally", () => {
  const from = rectNode("a", 0, 0, 100, 60);
  const to = rectNode("b", 200, 0, 100, 60);
  const p = surfacePoint(from, to);
  assertAlmostEquals(p.x, 50, 0.01);
  assertAlmostEquals(p.y, 0, 0.01);
});

Deno.test("surfacePoint — rect clips at AABB boundary vertically", () => {
  const from = rectNode("a", 0, 0, 100, 60);
  const to = rectNode("b", 0, 200, 100, 60);
  const p = surfacePoint(from, to);
  assertAlmostEquals(p.x, 0, 0.01);
  assertAlmostEquals(p.y, 30, 0.01);
});

Deno.test("surfacePoint — coincident nodes return center", () => {
  const a = circleNode("a", 50, 50);
  const b = circleNode("b", 50, 50);
  const p = surfacePoint(a, b);
  assertEquals(p.x, 50);
  assertEquals(p.y, 50);
});

Deno.test("surfacePoint — diagonal direction clips correctly for circle", () => {
  const from = circleNode("a", 0, 0, 10);
  const to = circleNode("b", 100, 100, 10);
  const p = surfacePoint(from, to);
  const dist = Math.sqrt(p.x * p.x + p.y * p.y);
  assertAlmostEquals(dist, 10, 0.01);
});
