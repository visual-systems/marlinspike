import { assertEquals } from "@std/assert";
import { hitTest } from "./hit-test.ts";
import { renderScene } from "../render/scene.ts";
import { marlinTheme } from "../style/marlin-theme.ts";
import type { CanvasScene } from "../scene/types.ts";

function makeScene(): CanvasScene {
  return {
    nodes: [
      { id: "a", x: 0, y: 0, w: 52, h: 52, shape: "circle", label: "A" },
      { id: "b", x: 100, y: 0, w: 52, h: 52, shape: "circle", label: "B" },
    ],
    edges: [{ id: "e1", fromId: "a", toId: "b" }],
  };
}

Deno.test("hitTest — returns node hint when clicking on node center", () => {
  const root = renderScene(makeScene(), marlinTheme);
  const hit = hitTest(root, { x: 0, y: 0 });
  assertEquals(hit?.id, "a");
  assertEquals(hit?.draggable, true);
});

Deno.test("hitTest — returns node hint when clicking within radius", () => {
  const root = renderScene(makeScene(), marlinTheme);
  const hit = hitTest(root, { x: 20, y: 0 });
  assertEquals(hit?.id, "a");
});

Deno.test("hitTest — returns null for empty space", () => {
  const root = renderScene(makeScene(), marlinTheme);
  const hit = hitTest(root, { x: -200, y: -200 });
  assertEquals(hit, null);
});

Deno.test("hitTest — returns correct node when multiple nodes present", () => {
  const root = renderScene(makeScene(), marlinTheme);
  const hit = hitTest(root, { x: 100, y: 0 });
  assertEquals(hit?.id, "b");
});

Deno.test("hitTest — edge hit returns edge hint", () => {
  const root = renderScene(makeScene(), marlinTheme);
  // Point along the edge path between node A (0,0) and B (100,0)
  // Edge is clipped at boundaries so roughly from x=31 to x=69
  const hit = hitTest(root, { x: 50, y: 0 });
  assertEquals(hit?.id, "e1");
  assertEquals(hit?.clickable, true);
  assertEquals(hit?.draggable, undefined);
});

Deno.test("hitTest — nested container: child hit returns child hint", () => {
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
        { id: "child", x: 0, y: 0, w: 40, h: 40, shape: "circle", label: "C" },
      ],
      edges: [],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  // Child is at container (100,100) + child (0,0) = world (100,100)
  const hit = hitTest(root, { x: 100, y: 100 });
  assertEquals(hit?.id, "child");
});

Deno.test("hitTest — nested container: clicking container background returns container", () => {
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
        { id: "child", x: 0, y: 0, w: 40, h: 40, shape: "circle", label: "C" },
      ],
      edges: [],
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  // Click on container area but away from child (child is at 100,100 with r=20)
  // Container spans from (0, 25) to (200, 175) in local coords, or (100, 125) to (200, 175) world
  const hit = hitTest(root, { x: 180, y: 160 });
  assertEquals(hit?.id, "container");
});

Deno.test("hitTest — rect node hit-testing works", () => {
  const scene: CanvasScene = {
    nodes: [{
      id: "rect-node",
      x: 50,
      y: 50,
      w: 80,
      h: 40,
      shape: "rect",
      label: "R",
    }],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  // Rect node at (50,50) with w=80, h=40 → local bounds (-40,-20) to (40,20)
  // World bounds: (10, 30) to (90, 70)
  const hit = hitTest(root, { x: 50, y: 50 });
  assertEquals(hit?.id, "rect-node");
});

Deno.test("hitTest — topmost element wins (z-order)", () => {
  // Two overlapping nodes — the later one in the array should be on top
  const scene: CanvasScene = {
    nodes: [
      { id: "bottom", x: 0, y: 0, w: 60, h: 60, shape: "circle", label: "Bot" },
      { id: "top", x: 10, y: 0, w: 60, h: 60, shape: "circle", label: "Top" },
    ],
    edges: [],
  };

  const root = renderScene(scene, marlinTheme);
  // Point at (10, 0) is within both circles — "top" should win (rendered last)
  const hit = hitTest(root, { x: 10, y: 0 });
  assertEquals(hit?.id, "top");
});
