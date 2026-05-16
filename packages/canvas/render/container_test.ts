import { assertEquals } from "@std/assert";
import { renderScene } from "./scene.ts";
import { marlinTheme } from "../style/marlin-theme.ts";
import type { CanvasScene } from "../scene/types.ts";
import type { RenderGroup } from "./primitives.ts";

Deno.test("renderScene — expanded container renders rect + label + children", () => {
  const scene: CanvasScene = {
    nodes: [{
      id: "container",
      x: 100,
      y: 100,
      w: 200,
      h: 150,
      shape: "rect",
      label: "Group",
      expanded: true,
      children: [
        { id: "child1", x: -30, y: 0, w: 40, h: 40, shape: "circle", label: "A" },
        { id: "child2", x: 30, y: 0, w: 40, h: 40, shape: "circle", label: "B" },
      ],
      edges: [{ id: "e1", fromId: "child1", toId: "child2" }],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  assertEquals(root.kind, "group");

  // Root should contain one container group
  assertEquals(root.children.length, 1);
  const containerGroup = root.children[0] as RenderGroup;
  assertEquals(containerGroup.kind, "group");
  assertEquals(containerGroup.id, "container");
  assertEquals(containerGroup.tx, 100);
  assertEquals(containerGroup.ty, 100);

  // Container should have: rect + label + 2 child groups + edge primitives
  const rect = containerGroup.children[0];
  assertEquals(rect.kind, "rect");

  const label = containerGroup.children[1];
  assertEquals(label.kind, "text");
  if (label.kind === "text") {
    assertEquals(label.text, "Group");
    assertEquals(label.anchor, "start"); // top-left positioned
  }

  // Child nodes are groups
  const child1 = containerGroup.children[2] as RenderGroup;
  assertEquals(child1.kind, "group");
  assertEquals(child1.id, "child1");

  const child2 = containerGroup.children[3] as RenderGroup;
  assertEquals(child2.kind, "group");
  assertEquals(child2.id, "child2");
});

Deno.test("renderScene — non-expanded node with children renders as leaf", () => {
  const scene: CanvasScene = {
    nodes: [{
      id: "collapsed",
      x: 50,
      y: 50,
      w: 52,
      h: 52,
      shape: "circle",
      label: "Collapsed",
      expanded: false,
      children: [
        { id: "inner", x: 0, y: 0, w: 40, h: 40, shape: "circle", label: "X" },
      ],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  const nodeGroup = root.children[0] as RenderGroup;
  assertEquals(nodeGroup.id, "collapsed");

  // Should render as circle (leaf), not as container
  const shape = nodeGroup.children[0];
  assertEquals(shape.kind, "circle");
});

Deno.test("renderScene — nested containers (2 levels deep)", () => {
  const scene: CanvasScene = {
    nodes: [{
      id: "outer",
      x: 0,
      y: 0,
      w: 300,
      h: 200,
      shape: "rect",
      label: "Outer",
      expanded: true,
      children: [{
        id: "inner",
        x: 0,
        y: 0,
        w: 150,
        h: 100,
        shape: "rect",
        label: "Inner",
        expanded: true,
        children: [
          { id: "leaf", x: 0, y: 0, w: 40, h: 40, shape: "circle", label: "Leaf" },
        ],
        edges: [],
      }],
      edges: [],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  const outer = root.children[0] as RenderGroup;
  assertEquals(outer.id, "outer");

  // Outer contains: rect, label, inner container group
  const inner = outer.children[2] as RenderGroup;
  assertEquals(inner.id, "inner");

  // Inner contains: rect, label, leaf node group
  const leaf = inner.children[2] as RenderGroup;
  assertEquals(leaf.id, "leaf");
  // Leaf is a circle node
  assertEquals(leaf.children[0].kind, "circle");
});

Deno.test("renderScene — container with edges renders edge primitives", () => {
  const scene: CanvasScene = {
    nodes: [{
      id: "container",
      x: 0,
      y: 0,
      w: 200,
      h: 150,
      shape: "rect",
      label: "G",
      expanded: true,
      children: [
        { id: "a", x: -40, y: 0, w: 40, h: 40, shape: "circle", label: "A" },
        { id: "b", x: 40, y: 0, w: 40, h: 40, shape: "circle", label: "B" },
      ],
      edges: [{ id: "e1", fromId: "a", toId: "b" }],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  const container = root.children[0] as RenderGroup;

  // Should have: rect + label + 2 child nodes + edge group
  // The edge group contains path primitives
  const edgePrimitives = container.children.filter(
    (c) => c.kind === "group" && (c as RenderGroup).id === "e1",
  );
  assertEquals(edgePrimitives.length, 1);
});

Deno.test("renderScene — container theme resolver is used", () => {
  const scene: CanvasScene = {
    nodes: [{
      id: "c",
      x: 0,
      y: 0,
      w: 200,
      h: 150,
      shape: "rect",
      label: "Themed",
      expanded: true,
      selected: true,
      children: [
        { id: "x", x: 0, y: 0, w: 40, h: 40, shape: "circle", label: "X" },
      ],
      edges: [],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  const container = root.children[0] as RenderGroup;
  const rect = container.children[0];

  // Selected container should have the selected stroke color
  if (rect.kind === "rect") {
    assertEquals(rect.stroke, "#4060b0");
    assertEquals(rect.strokeWidth, 2);
  }
});
