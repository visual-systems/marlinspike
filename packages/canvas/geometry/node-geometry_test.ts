/**
 * Tests for NodeGeometry implementations — verify CIRCLE_GEOMETRY and RECT_GEOMETRY
 * produce identical results to the inline code they replace.
 */

import { assertAlmostEquals, assertEquals } from "@std/assert";
import {
  type BodyStyle,
  CIRCLE_GEOMETRY,
  RECT_GEOMETRY,
  resolveGeometry,
} from "./node-geometry.ts";
import { arcClipPoint, arcClipRect } from "./arc.ts";
import { circlePortPositions, rectPortPositions } from "./ports.ts";

const STYLE: BodyStyle = {
  fill: "#111",
  stroke: "#222",
  strokeWidth: 1,
};

// ---------------------------------------------------------------------------
// renderBody
// ---------------------------------------------------------------------------

Deno.test("CIRCLE_GEOMETRY.renderBody matches inline circle rendering", () => {
  const prims = CIRCLE_GEOMETRY.renderBody(52, 52, { ...STYLE, strokeDash: "3,2" });
  assertEquals(prims.length, 1);
  const p = prims[0];
  assertEquals(p.kind, "circle");
  if (p.kind === "circle") {
    assertEquals(p.cx, 0);
    assertEquals(p.cy, 0);
    assertEquals(p.r, 26);
    assertEquals(p.fill, "#111");
    assertEquals(p.strokeDash, "3,2");
  }
});

Deno.test("RECT_GEOMETRY.renderBody matches inline rect rendering", () => {
  const prims = RECT_GEOMETRY.renderBody(100, 80, STYLE);
  assertEquals(prims.length, 1);
  const p = prims[0];
  assertEquals(p.kind, "rect");
  if (p.kind === "rect") {
    assertEquals(p.x, -50);
    assertEquals(p.y, -40);
    assertEquals(p.w, 100);
    assertEquals(p.h, 80);
    assertEquals(p.rx, 8); // w > 60 → rx=8
  }
});

Deno.test("RECT_GEOMETRY.renderBody uses rx=4 for small nodes", () => {
  const prims = RECT_GEOMETRY.renderBody(52, 52, STYLE);
  if (prims[0].kind === "rect") {
    assertEquals(prims[0].rx, 4); // w <= 60 → rx=4
  }
});

// ---------------------------------------------------------------------------
// surfacePoint
// ---------------------------------------------------------------------------

Deno.test("CIRCLE_GEOMETRY.surfacePoint matches inline circle clipping", () => {
  // Circle at (100, 100), r=26, toward (200, 100), gap=5
  const p = CIRCLE_GEOMETRY.surfacePoint(100, 100, 52, 52, 200, 100, 5);
  assertEquals(p.x, 100 + 26 + 5); // 131
  assertEquals(p.y, 100);
});

Deno.test("RECT_GEOMETRY.surfacePoint matches inline rect clipping", () => {
  // Rect at (0, 0), 100x80, toward (100, 0), gap=0
  const p = RECT_GEOMETRY.surfacePoint(0, 0, 100, 80, 100, 0, 0);
  assertEquals(p.x, 50); // halfW
  assertEquals(p.y, 0);
});

Deno.test("RECT_GEOMETRY.surfacePoint diagonal matches inline", () => {
  // Rect at (0, 0), 100x100, toward (100, 100), gap=0
  const p = RECT_GEOMETRY.surfacePoint(0, 0, 100, 100, 100, 100, 0);
  // At 45°, halfW/|ux| = 50/0.707 ≈ 70.7, same for halfH. min = 70.7
  // point = (0.707 * 70.7, 0.707 * 70.7) = (50, 50)
  assertAlmostEquals(p.x, 50, 0.1);
  assertAlmostEquals(p.y, 50, 0.1);
});

Deno.test("surfacePoint returns center for coincident points", () => {
  const p = CIRCLE_GEOMETRY.surfacePoint(100, 100, 52, 52, 100, 100, 5);
  assertEquals(p.x, 100);
  assertEquals(p.y, 100);
});

// ---------------------------------------------------------------------------
// arcClip
// ---------------------------------------------------------------------------

Deno.test("CIRCLE_GEOMETRY.arcClip delegates to arcClipPoint", () => {
  const arcC = { x: 50, y: 0 };
  const center = { x: 0, y: 0 };
  const other = { x: 100, y: 0 };
  const r = 60;
  const gap = 5;

  const geo = CIRCLE_GEOMETRY.arcClip(arcC, r, center, 52, 52, gap, 0, other);
  const direct = arcClipPoint(arcC, r, center, 26 + gap, other);
  assertEquals(geo.x, direct.x);
  assertEquals(geo.y, direct.y);
});

Deno.test("RECT_GEOMETRY.arcClip delegates to arcClipRect", () => {
  const arcC = { x: 50, y: 0 };
  const center = { x: 0, y: 0 };
  const other = { x: 100, y: 0 };
  const r = 60;
  const gap = 5;
  const sweep = 0;

  const geo = RECT_GEOMETRY.arcClip(arcC, r, center, 100, 80, gap, sweep, other);
  const direct = arcClipRect(arcC, r, center, 50, 40, gap, sweep, other);
  assertEquals(geo.x, direct.x);
  assertEquals(geo.y, direct.y);
});

// ---------------------------------------------------------------------------
// sdf
// ---------------------------------------------------------------------------

Deno.test("CIRCLE_GEOMETRY.sdf matches sdfOf circle", () => {
  const sdf = CIRCLE_GEOMETRY.sdf(52, 52);
  // At center: -r
  assertAlmostEquals(sdf(0, 0), -26, 0.01);
  // On surface: 0
  assertAlmostEquals(sdf(26, 0), 0, 0.01);
  // Outside: positive
  assertAlmostEquals(sdf(36, 0), 10, 0.01);
});

Deno.test("RECT_GEOMETRY.sdf matches sdfOf rect", () => {
  const sdf = RECT_GEOMETRY.sdf(100, 80);
  // At center: -min(halfW, halfH) = -40
  assertAlmostEquals(sdf(0, 0), -40, 0.01);
  // On right edge: 0
  assertAlmostEquals(sdf(50, 0), 0, 0.01);
  // Outside right: positive
  assertAlmostEquals(sdf(60, 0), 10, 0.01);
});

// ---------------------------------------------------------------------------
// portPositions
// ---------------------------------------------------------------------------

Deno.test("CIRCLE_GEOMETRY.portPositions delegates to circlePortPositions", () => {
  const ports = [
    { name: "a", direction: "in" as const },
    { name: "b", direction: "out" as const },
  ];
  const geo = CIRCLE_GEOMETRY.portPositions(ports, 52, 52, 0);
  const direct = circlePortPositions(ports, 26);
  assertEquals(geo.length, direct.length);
  for (let i = 0; i < geo.length; i++) {
    assertEquals(geo[i].name, direct[i].name);
    assertAlmostEquals(geo[i].x, direct[i].x, 0.01);
    assertAlmostEquals(geo[i].y, direct[i].y, 0.01);
  }
});

Deno.test("RECT_GEOMETRY.portPositions delegates to rectPortPositions", () => {
  const ports = [
    { name: "a", direction: "in" as const },
    { name: "b", direction: "out" as const },
  ];
  const geo = RECT_GEOMETRY.portPositions(ports, 100, 80, 22);
  const direct = rectPortPositions(ports, 50, 40, 22);
  assertEquals(geo.length, direct.length);
  for (let i = 0; i < geo.length; i++) {
    assertEquals(geo[i].name, direct[i].name);
    assertAlmostEquals(geo[i].x, direct[i].x, 0.01);
    assertAlmostEquals(geo[i].y, direct[i].y, 0.01);
  }
});

// ---------------------------------------------------------------------------
// strokeDash
// ---------------------------------------------------------------------------

Deno.test("CIRCLE_GEOMETRY.strokeDash returns '3,2' when dashed", () => {
  assertEquals(CIRCLE_GEOMETRY.strokeDash(true), "3,2");
  assertEquals(CIRCLE_GEOMETRY.strokeDash(false), undefined);
});

Deno.test("RECT_GEOMETRY.strokeDash returns '6,3' when dashed", () => {
  assertEquals(RECT_GEOMETRY.strokeDash(true), "6,3");
  assertEquals(RECT_GEOMETRY.strokeDash(false), undefined);
});

// ---------------------------------------------------------------------------
// resolveGeometry — bridge function
// ---------------------------------------------------------------------------

Deno.test("resolveGeometry prefers geometry over shape", () => {
  const geo = resolveGeometry({ geometry: RECT_GEOMETRY, shape: "circle" });
  assertEquals(geo, RECT_GEOMETRY);
});

Deno.test("resolveGeometry falls back to shape", () => {
  assertEquals(resolveGeometry({ shape: "rect" }), RECT_GEOMETRY);
  assertEquals(resolveGeometry({ shape: "circle" }), CIRCLE_GEOMETRY);
});

Deno.test("resolveGeometry defaults to CIRCLE_GEOMETRY", () => {
  assertEquals(resolveGeometry({}), CIRCLE_GEOMETRY);
});
