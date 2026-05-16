import { assertEquals } from "@std/assert";
import type { CanvasScene } from "../scene/types.ts";
import { marlinTheme } from "../style/marlin-theme.ts";
import { renderScene } from "./scene.ts";
import { renderNode } from "./node.ts";
import { computeEdgePath, groupEdges, renderEdge } from "./edge.ts";
import type { RenderGroup } from "./primitives.ts";
import type { Renderer } from "./renderer.ts";
import { renderWith } from "./renderer.ts";
import { svgRenderer } from "./svg.ts";

function circleNode(id: string, x: number, y: number) {
  return { id, x, y, w: 52, h: 52, shape: "circle" as const, label: id };
}

function rectNode(id: string, x: number, y: number) {
  return { id, x, y, w: 100, h: 60, shape: "rect" as const, label: id };
}

// ---------------------------------------------------------------------------
// renderNode
// ---------------------------------------------------------------------------

Deno.test("renderNode — circle node produces group with circle + text", () => {
  const node = circleNode("a", 0, 0);
  const result = renderNode(node, marlinTheme);
  assertEquals(result.kind, "group");
  const g = result as RenderGroup;
  assertEquals(g.id, "a");
  const kinds = g.children.map((c) => c.kind);
  assertEquals(kinds.includes("circle"), true);
  assertEquals(kinds.includes("text"), true);
});

Deno.test("renderNode — rect node produces group with rect + text", () => {
  const node = rectNode("b", 10, 20);
  const result = renderNode(node, marlinTheme);
  assertEquals(result.kind, "group");
  const g = result as RenderGroup;
  const kinds = g.children.map((c) => c.kind);
  assertEquals(kinds.includes("rect"), true);
  assertEquals(kinds.includes("text"), true);
});

Deno.test("renderNode — selected node changes style", () => {
  const node = { ...circleNode("a", 0, 0), selected: true };
  const result = renderNode(node, marlinTheme) as RenderGroup;
  const circle = result.children.find((c) => c.kind === "circle");
  assertEquals(circle !== undefined, true);
  if (circle?.kind === "circle") {
    assertEquals(circle.stroke, "#5070c0"); // selected stroke
  }
});

Deno.test("renderNode — ports produce additional circle primitives", () => {
  const node = {
    ...circleNode("a", 0, 0),
    ports: [
      { name: "in", direction: "in" as const, x: -26, y: 0, nx: -1, ny: 0 },
      { name: "out", direction: "out" as const, x: 26, y: 0, nx: 1, ny: 0 },
    ],
  };
  const result = renderNode(node, marlinTheme) as RenderGroup;
  const circles = result.children.filter((c) => c.kind === "circle");
  // 1 node circle + 2 port circles
  assertEquals(circles.length, 3);
});

// ---------------------------------------------------------------------------
// Edge rendering
// ---------------------------------------------------------------------------

Deno.test("computeEdgePath — straight edge between two nodes", () => {
  const nodeMap = new Map([
    ["a", circleNode("a", 0, 0)],
    ["b", circleNode("b", 200, 0)],
  ]);
  const edge = { id: "e1", fromId: "a", toId: "b" };
  const data = computeEdgePath(edge, nodeMap, 0, 1);
  assertEquals(data !== null, true);
  assertEquals(data!.isArc, false);
  assertEquals(data!.d.startsWith("M"), true);
  assertEquals(data!.d.includes("L"), true);
});

Deno.test("computeEdgePath — multi-edge produces arc", () => {
  const nodeMap = new Map([
    ["a", circleNode("a", 0, 0)],
    ["b", circleNode("b", 200, 0)],
  ]);
  const edge = { id: "e1", fromId: "a", toId: "b" };
  const data = computeEdgePath(edge, nodeMap, 0, 2);
  assertEquals(data !== null, true);
  assertEquals(data!.isArc, true);
  assertEquals(data!.d.includes("A"), true);
});

Deno.test("computeEdgePath — missing node returns null", () => {
  const nodeMap = new Map([["a", circleNode("a", 0, 0)]]);
  const edge = { id: "e1", fromId: "a", toId: "missing" };
  assertEquals(computeEdgePath(edge, nodeMap, 0, 1), null);
});

Deno.test("renderEdge — produces group with path and polygon", () => {
  const nodeMap = new Map([
    ["a", circleNode("a", 0, 0)],
    ["b", circleNode("b", 200, 0)],
  ]);
  const edge = { id: "e1", fromId: "a", toId: "b" };
  const data = computeEdgePath(edge, nodeMap, 0, 1)!;
  const result = renderEdge(data, marlinTheme);
  assertEquals(result.kind, "group");
  const g = result as RenderGroup;
  const kinds = g.children.map((c) => c.kind);
  assertEquals(kinds.includes("path"), true);
  assertEquals(kinds.includes("polygon"), true);
});

Deno.test("renderEdge — labeled edge includes text", () => {
  const nodeMap = new Map([
    ["a", circleNode("a", 0, 0)],
    ["b", circleNode("b", 200, 0)],
  ]);
  const edge = { id: "e1", fromId: "a", toId: "b", label: "data" };
  const data = computeEdgePath(edge, nodeMap, 0, 1)!;
  const result = renderEdge(data, marlinTheme) as RenderGroup;
  const texts = result.children.filter((c) => c.kind === "text");
  assertEquals(texts.length, 1);
});

Deno.test("groupEdges — parallel edges get distinct indices", () => {
  const edges = [
    { id: "e1", fromId: "a", toId: "b" },
    { id: "e2", fromId: "a", toId: "b" },
    { id: "e3", fromId: "b", toId: "a" },
  ];
  const { indexMap, countMap } = groupEdges(edges);
  assertEquals(countMap.get("a|b"), 3);
  assertEquals(indexMap.get("e1"), 0);
  assertEquals(indexMap.get("e2"), 1);
  assertEquals(indexMap.get("e3"), 2);
});

// ---------------------------------------------------------------------------
// renderScene
// ---------------------------------------------------------------------------

Deno.test("renderScene — empty scene produces empty group", () => {
  const scene: CanvasScene = { nodes: [], edges: [] };
  const result = renderScene(scene, marlinTheme);
  assertEquals(result.kind, "group");
  assertEquals(result.children.length, 0);
});

Deno.test("renderScene — nodes and edges produce correct primitive count", () => {
  const scene: CanvasScene = {
    nodes: [circleNode("a", 0, 0), circleNode("b", 200, 0)],
    edges: [{ id: "e1", fromId: "a", toId: "b" }],
  };
  const result = renderScene(scene, marlinTheme);
  assertEquals(result.kind, "group");
  // 2 node groups + 1 edge path group = 3
  assertEquals(result.children.length >= 3, true);
});

// ---------------------------------------------------------------------------
// Renderer<T> interface
// ---------------------------------------------------------------------------

Deno.test("Renderer — trivial collector walks primitive tree", () => {
  const collected: string[] = [];
  const collector: Renderer<void> = {
    circle() {
      collected.push("circle");
    },
    rect() {
      collected.push("rect");
    },
    path() {
      collected.push("path");
    },
    polygon() {
      collected.push("polygon");
    },
    text() {
      collected.push("text");
    },
    group(_p, _children) {
      collected.push("group");
    },
  };

  const scene: CanvasScene = {
    nodes: [circleNode("a", 0, 0)],
    edges: [],
  };
  const primitives = renderScene(scene, marlinTheme);
  renderWith(collector, primitives);
  // Should have visited: outer group, inner node group, circle, text
  assertEquals(collected.includes("group"), true);
  assertEquals(collected.includes("circle"), true);
  assertEquals(collected.includes("text"), true);
});

// ---------------------------------------------------------------------------
// SVG renderer
// ---------------------------------------------------------------------------

Deno.test("svgRenderer — circle node produces valid SVG", () => {
  const node = circleNode("a", 50, 50);
  const primitives = renderNode(node, marlinTheme);
  const [svg] = renderWith(svgRenderer, primitives);
  assertEquals(svg.startsWith("<g"), true);
  assertEquals(svg.includes("<circle"), true);
  assertEquals(svg.includes("<text"), true);
  assertEquals(svg.includes("</g>"), true);
});

Deno.test("svgRenderer — full scene produces valid SVG", () => {
  const scene: CanvasScene = {
    nodes: [circleNode("a", 0, 0), circleNode("b", 200, 0)],
    edges: [{ id: "e1", fromId: "a", toId: "b", label: "flow" }],
  };
  const primitives = renderScene(scene, marlinTheme);
  const [svg] = renderWith(svgRenderer, primitives);
  assertEquals(svg.includes("data-id"), true);
  assertEquals(svg.includes("flow"), true);
});
