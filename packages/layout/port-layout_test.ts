import { assertEquals } from "@std/assert";
import { circlePortPositions, rectPortPositions, resolveNodePorts } from "./port-layout.ts";
import type { Port, TreeNode } from "@marlinspike/graph";

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

// ---------------------------------------------------------------------------
// resolveNodePorts
// ---------------------------------------------------------------------------

function mkNode(
  label: string,
  opts?: { ports?: Port[]; type?: "ref"; ref?: string; children?: TreeNode[] },
): TreeNode {
  return {
    id: label,
    label,
    kind: "composite",
    children: opts?.children ?? [],
    ...(opts?.ports ? { ports: opts.ports } : {}),
    ...(opts?.type ? { type: opts.type } : {}),
    ...(opts?.ref ? { ref: opts.ref } : {}),
    data: {},
    version: 1,
  };
}

Deno.test("resolveNodePorts: node with own ports returns them", () => {
  const ports: Port[] = [{ name: "a", direction: "in" }];
  const node = mkNode("f", { ports });
  assertEquals(resolveNodePorts(node, []), ports);
});

Deno.test("resolveNodePorts: ref node resolves target ports", () => {
  const targetPorts: Port[] = [
    { name: "x", direction: "in" },
    { name: "y", direction: "out" },
  ];
  const target = mkNode("divide", { ports: targetPorts });
  const ref = mkNode("use-divide", { type: "ref", ref: "divide" });
  assertEquals(resolveNodePorts(ref, [target]), targetPorts);
});

Deno.test("resolveNodePorts: ref node with no target returns empty", () => {
  const ref = mkNode("use-divide", { type: "ref", ref: "divide" });
  assertEquals(resolveNodePorts(ref, []), []);
});

Deno.test("resolveNodePorts: ref target without ports returns empty", () => {
  const target = mkNode("divide");
  const ref = mkNode("use-divide", { type: "ref", ref: "divide" });
  assertEquals(resolveNodePorts(ref, [target]), []);
});

Deno.test("resolveNodePorts: non-ref node without ports returns empty", () => {
  assertEquals(resolveNodePorts(mkNode("leaf"), []), []);
});

Deno.test("resolveNodePorts: ref resolves target nested in tree", () => {
  const targetPorts: Port[] = [{ name: "a", direction: "in" }];
  const nested = mkNode("divide", { ports: targetPorts });
  const parent = mkNode("math", { children: [nested] });
  const ref = mkNode("use-divide", { type: "ref", ref: "divide" });
  assertEquals(resolveNodePorts(ref, [parent]), targetPorts);
});

Deno.test("resolveNodePorts: ref with own ports uses own ports", () => {
  const ownPorts: Port[] = [{ name: "custom", direction: "in" }];
  const targetPorts: Port[] = [{ name: "x", direction: "in" }];
  const target = mkNode("divide", { ports: targetPorts });
  const ref = mkNode("use-divide", { type: "ref", ref: "divide", ports: ownPorts });
  assertEquals(resolveNodePorts(ref, [target]), ownPorts);
});
