import { assertEquals } from "@std/assert";
import { assertAlmostEquals } from "@std/assert/assert-almost-equals";
import { circlePortPositions, rectPortPositions } from "./ports.ts";

Deno.test("circlePortPositions — single input port on left", () => {
  const ports = circlePortPositions([{ name: "in", direction: "in" }], 26);
  assertEquals(ports.length, 1);
  assertEquals(ports[0].name, "in");
  // Should be on the left semicircle (negative x)
  assertEquals(ports[0].x < 0, true);
});

Deno.test("circlePortPositions — single output port on right", () => {
  const ports = circlePortPositions([{ name: "out", direction: "out" }], 26);
  assertEquals(ports.length, 1);
  assertEquals(ports[0].name, "out");
  // Should be on the right semicircle (positive x or near zero)
  assertEquals(ports[0].x >= -0.01, true);
});

Deno.test("circlePortPositions — mixed ports split correctly", () => {
  const ports = circlePortPositions([
    { name: "a", direction: "in" },
    { name: "b", direction: "out" },
    { name: "c", direction: "inout" },
  ], 26);
  assertEquals(ports.length, 3);
  // a and c are input-side (left), b is output-side (right)
  const a = ports.find((p) => p.name === "a")!;
  const b = ports.find((p) => p.name === "b")!;
  const c = ports.find((p) => p.name === "c")!;
  assertEquals(a.x < 0, true);
  assertEquals(c.x < 0, true);
  assertEquals(b.x >= -0.01, true);
});

Deno.test("circlePortPositions — all ports lie on the circle", () => {
  const r = 26;
  const ports = circlePortPositions([
    { name: "a", direction: "in" },
    { name: "b", direction: "out" },
  ], r);
  for (const p of ports) {
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    assertAlmostEquals(dist, r, 0.01);
  }
});

Deno.test("circlePortPositions — normals are unit vectors", () => {
  const ports = circlePortPositions([
    { name: "a", direction: "in" },
    { name: "b", direction: "out" },
  ], 26);
  for (const p of ports) {
    const len = Math.sqrt(p.nx * p.nx + p.ny * p.ny);
    assertAlmostEquals(len, 1, 0.01);
  }
});

Deno.test("rectPortPositions — inputs on left edge", () => {
  const ports = rectPortPositions(
    [
      { name: "x", direction: "in" },
    ],
    50,
    30,
    22,
  );
  assertEquals(ports.length, 1);
  assertEquals(ports[0].x, -50); // left edge
  assertEquals(ports[0].nx, -1);
});

Deno.test("rectPortPositions — outputs on right edge", () => {
  const ports = rectPortPositions(
    [
      { name: "y", direction: "out" },
    ],
    50,
    30,
    22,
  );
  assertEquals(ports.length, 1);
  assertEquals(ports[0].x, 50); // right edge
  assertEquals(ports[0].nx, 1);
});

Deno.test("rectPortPositions — empty ports returns empty", () => {
  const ports = rectPortPositions([], 50, 30, 22);
  assertEquals(ports.length, 0);
});
