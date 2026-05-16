import { assertEquals } from "@std/assert";
import { PointerHandler } from "./pointer.ts";
import { renderScene } from "../render/scene.ts";
import { marlinTheme } from "../style/marlin-theme.ts";
import type { CanvasScene } from "../scene/types.ts";
import type { Point } from "../geometry/surface.ts";

function makeScene(): CanvasScene {
  return {
    nodes: [
      { id: "a", x: 0, y: 0, w: 52, h: 52, shape: "circle", label: "A" },
      { id: "b", x: 100, y: 0, w: 52, h: 52, shape: "circle", label: "B" },
    ],
    edges: [{ id: "e1", fromId: "a", toId: "b" }],
  };
}

function makeHandler(scene: CanvasScene, hooks: Record<string, unknown[]>) {
  const root = renderScene(scene, marlinTheme);
  return new PointerHandler({
    getRoot: () => root,
    hooks: {
      onClick: (id: string, pos: Point) => hooks.clicks.push({ id, pos }),
      onDoubleClick: (id: string, pos: Point) => hooks.doubleClicks.push({ id, pos }),
      onDragStart: (id: string, pos: Point) => hooks.dragStarts.push({ id, pos }),
      onDragMove: (id: string, pos: Point, delta: Point) =>
        hooks.dragMoves.push({ id, pos, delta }),
      onDragEnd: (id: string, pos: Point) => hooks.dragEnds.push({ id, pos }),
      onHoverEnter: (id: string) => hooks.hovers.push({ id, kind: "enter" }),
      onHoverLeave: (id: string) => hooks.hovers.push({ id, kind: "leave" }),
    },
    dragThreshold: 16,
    doubleClickWindow: 300,
  });
}

function freshHooks() {
  return {
    clicks: [] as unknown[],
    doubleClicks: [] as unknown[],
    dragStarts: [] as unknown[],
    dragMoves: [] as unknown[],
    dragEnds: [] as unknown[],
    hovers: [] as unknown[],
  };
}

Deno.test("PointerHandler — click dispatches onClick", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  handler.onPointerDown({ x: 0, y: 0 });
  handler.onPointerUp({ x: 0, y: 0 });

  assertEquals(hooks.clicks.length, 1);
  assertEquals((hooks.clicks[0] as { id: string }).id, "a");
});

Deno.test("PointerHandler — click on empty space dispatches nothing", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  handler.onPointerDown({ x: -200, y: -200 });
  handler.onPointerUp({ x: -200, y: -200 });

  assertEquals(hooks.clicks.length, 0);
});

Deno.test("PointerHandler — drag exceeding threshold dispatches drag hooks", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  handler.onPointerDown({ x: 0, y: 0 });
  handler.onPointerMove({ x: 5, y: 5 }); // 25 > 16 threshold
  handler.onPointerMove({ x: 10, y: 10 });
  handler.onPointerUp({ x: 10, y: 10 });

  assertEquals(hooks.dragStarts.length, 1);
  assertEquals((hooks.dragStarts[0] as { id: string }).id, "a");
  assertEquals(hooks.dragMoves.length, 2); // initial + second move
  assertEquals(hooks.dragEnds.length, 1);
  assertEquals(hooks.clicks.length, 0); // should NOT fire click after drag
});

Deno.test("PointerHandler — small movement below threshold still fires click", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  handler.onPointerDown({ x: 0, y: 0 });
  handler.onPointerMove({ x: 1, y: 1 }); // 2 < 16
  handler.onPointerUp({ x: 1, y: 1 });

  assertEquals(hooks.clicks.length, 1);
  assertEquals(hooks.dragStarts.length, 0);
});

Deno.test("PointerHandler — double click dispatches both onClick and onDoubleClick", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  // First click
  handler.onPointerDown({ x: 0, y: 0 });
  handler.onPointerUp({ x: 0, y: 0 });

  // Second click immediately
  handler.onPointerDown({ x: 0, y: 0 });
  handler.onPointerUp({ x: 0, y: 0 });

  assertEquals(hooks.clicks.length, 2);
  assertEquals(hooks.doubleClicks.length, 1);
  assertEquals((hooks.doubleClicks[0] as { id: string }).id, "a");
});

Deno.test("PointerHandler — hover enter and leave dispatched on move", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  // Move over node A
  handler.onPointerMove({ x: 0, y: 0 });
  assertEquals(hooks.hovers.length, 1);
  assertEquals((hooks.hovers[0] as { id: string; kind: string }).id, "a");
  assertEquals((hooks.hovers[0] as { id: string; kind: string }).kind, "enter");

  // Move away
  handler.onPointerMove({ x: -200, y: -200 });
  assertEquals(hooks.hovers.length, 2);
  assertEquals((hooks.hovers[1] as { id: string; kind: string }).id, "a");
  assertEquals((hooks.hovers[1] as { id: string; kind: string }).kind, "leave");
});

Deno.test("PointerHandler — hover transitions between nodes", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  handler.onPointerMove({ x: 0, y: 0 }); // enter A
  handler.onPointerMove({ x: 100, y: 0 }); // leave A, enter B

  assertEquals(hooks.hovers.length, 3);
  assertEquals((hooks.hovers[0] as { id: string; kind: string }).kind, "enter"); // A enter
  assertEquals((hooks.hovers[1] as { id: string; kind: string }).id, "a");
  assertEquals((hooks.hovers[1] as { id: string; kind: string }).kind, "leave"); // A leave
  assertEquals((hooks.hovers[2] as { id: string; kind: string }).id, "b");
  assertEquals((hooks.hovers[2] as { id: string; kind: string }).kind, "enter"); // B enter
});

Deno.test("PointerHandler — edge click dispatches onClick", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  // Click on edge midpoint
  handler.onPointerDown({ x: 50, y: 0 });
  handler.onPointerUp({ x: 50, y: 0 });

  assertEquals(hooks.clicks.length, 1);
  assertEquals((hooks.clicks[0] as { id: string }).id, "e1");
});

Deno.test("PointerHandler — edge drag does not fire (not draggable)", () => {
  const hooks = freshHooks();
  const handler = makeHandler(makeScene(), hooks);

  handler.onPointerDown({ x: 50, y: 0 });
  handler.onPointerMove({ x: 55, y: 5 }); // exceeds threshold
  handler.onPointerUp({ x: 55, y: 5 });

  // Edge is not draggable, so no drag hooks fire
  assertEquals(hooks.dragStarts.length, 0);
  // Also no click (movement exceeded threshold and pending was cancelled)
  assertEquals(hooks.clicks.length, 0);
});
