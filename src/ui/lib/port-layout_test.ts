import { assertEquals } from "@std/assert";
import { circlePortPositions, rectPortPositions } from "./port-layout.ts";
import type { Port } from "../workspace.ts";

// ---------------------------------------------------------------------------
// circlePortPositions
// ---------------------------------------------------------------------------

Deno.test("circlePortPositions: no ports returns empty", () => {
  assertEquals(circlePortPositions([], 26), []);
});

Deno.test("circlePortPositions: single input port at left midpoint", () => {
  const ports: Port[] = [{ name: "a", direction: "in" }];
  const result = circlePortPositions(ports, 26);
  assertEquals(result.length, 1);
  assertEquals(result[0].portName, "a");
  assertEquals(result[0].direction, "in");
  // Midpoint of left semicircle (angle π) → x ≈ -26, y ≈ 0
  assertEquals(Math.round(result[0].x), -26);
  assertEquals(Math.abs(result[0].y) < 0.01, true);
});

Deno.test("circlePortPositions: single output port at right midpoint", () => {
  const ports: Port[] = [{ name: "b", direction: "out" }];
  const result = circlePortPositions(ports, 26);
  assertEquals(result.length, 1);
  assertEquals(result[0].portName, "b");
  // Midpoint of right semicircle (angle 0) → x ≈ 26, y ≈ 0
  assertEquals(Math.round(result[0].x), 26);
  assertEquals(Math.abs(result[0].y) < 0.01, true);
});

Deno.test("circlePortPositions: mixed in/out ports", () => {
  const ports: Port[] = [
    { name: "x", direction: "in" },
    { name: "y", direction: "in" },
    { name: "z", direction: "out" },
  ];
  const result = circlePortPositions(ports, 26);
  assertEquals(result.length, 3);
  // Two inputs on left (negative x), one output on right (positive x)
  assertEquals(result[0].x < 0, true);
  assertEquals(result[1].x < 0, true);
  assertEquals(result[2].x > 0, true);
});

Deno.test("circlePortPositions: inout ports placed with inputs on left", () => {
  const ports: Port[] = [{ name: "io", direction: "inout" }];
  const result = circlePortPositions(ports, 26);
  assertEquals(result.length, 1);
  assertEquals(result[0].x < 0, true); // left side
});

Deno.test("circlePortPositions: normals point outward", () => {
  const ports: Port[] = [
    { name: "a", direction: "in" },
    { name: "b", direction: "out" },
  ];
  const result = circlePortPositions(ports, 10);
  // Input normal should point left (nx < 0)
  assertEquals(result[0].nx < 0, true);
  // Output normal should point right (nx > 0)
  assertEquals(result[1].nx > 0, true);
});

// ---------------------------------------------------------------------------
// rectPortPositions
// ---------------------------------------------------------------------------

Deno.test("rectPortPositions: no ports returns empty", () => {
  assertEquals(rectPortPositions([], 100, 80, 22), []);
});

Deno.test("rectPortPositions: input ports on left edge", () => {
  const ports: Port[] = [
    { name: "a", direction: "in" },
    { name: "b", direction: "in" },
  ];
  const result = rectPortPositions(ports, 100, 80, 22);
  assertEquals(result.length, 2);
  // Both on left edge (x = -halfW = -100)
  assertEquals(result[0].x, -100);
  assertEquals(result[1].x, -100);
  // Normals point left
  assertEquals(result[0].nx, -1);
  assertEquals(result[0].ny, 0);
  // Vertically spaced, below label strip
  assertEquals(result[0].y < result[1].y, true);
});

Deno.test("rectPortPositions: output ports on right edge", () => {
  const ports: Port[] = [{ name: "out", direction: "out" }];
  const result = rectPortPositions(ports, 100, 80, 22);
  assertEquals(result.length, 1);
  assertEquals(result[0].x, 100);
  assertEquals(result[0].nx, 1);
});

Deno.test("rectPortPositions: ports below label strip", () => {
  const halfH = 80;
  const labelH = 22;
  const ports: Port[] = [{ name: "a", direction: "in" }];
  const result = rectPortPositions(ports, 100, halfH, labelH);
  // Port should be between topY (-80 + 22 = -58) and bottomY (80)
  assertEquals(result[0].y > -halfH + labelH, true);
  assertEquals(result[0].y < halfH, true);
});

Deno.test("rectPortPositions: type is preserved", () => {
  const ports: Port[] = [{ name: "req", direction: "in", type: "http.request" }];
  const result = rectPortPositions(ports, 50, 50, 22);
  assertEquals(result[0].type, "http.request");
});
