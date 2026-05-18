import { assertEquals } from "@std/assert";
import { marlinTheme } from "./marlin-theme.ts";

Deno.test("marlinTheme — default node style", () => {
  const style = marlinTheme.node({
    id: "n",
    x: 0,
    y: 0,
    w: 52,
    h: 52,
    shape: "circle",
    label: "N",
  });
  assertEquals(style.fill, "#111125");
  assertEquals(style.stroke, "#252545");
  assertEquals(style.strokeWidth, 1);
  assertEquals(style.labelFill, "#777799");
});

Deno.test("marlinTheme — selected node style", () => {
  const style = marlinTheme.node({
    id: "n",
    x: 0,
    y: 0,
    w: 52,
    h: 52,
    shape: "circle",
    label: "N",
    selected: true,
  });
  assertEquals(style.fill, "#1e2a4a");
  assertEquals(style.stroke, "#5070c0");
  assertEquals(style.strokeWidth, 2);
});

Deno.test("marlinTheme — highlighted node style", () => {
  const style = marlinTheme.node({
    id: "n",
    x: 0,
    y: 0,
    w: 52,
    h: 52,
    shape: "circle",
    label: "N",
    highlighted: true,
  });
  assertEquals(style.stroke, "#50c070");
  assertEquals(style.strokeWidth, 2);
});

Deno.test("marlinTheme — dashed node style (ref-like)", () => {
  const style = marlinTheme.node({
    id: "n",
    x: 0,
    y: 0,
    w: 52,
    h: 52,
    shape: "circle",
    label: "N",
    dashed: true,
  });
  assertEquals(style.fill, "#141428");
  assertEquals(style.stroke, "#605080");
});

Deno.test("marlinTheme — default node has no opacity", () => {
  const style = marlinTheme.node({
    id: "n",
    x: 0,
    y: 0,
    w: 52,
    h: 52,
    shape: "circle",
    label: "N",
  });
  assertEquals(style.opacity, undefined);
});

Deno.test("marlinTheme — default edge style", () => {
  const style = marlinTheme.edge({ id: "e", fromId: "a", toId: "b" });
  assertEquals(style.stroke, "#2a2a50");
  assertEquals(style.strokeWidth, 1);
  assertEquals(style.arrowSize, 10);
});

Deno.test("marlinTheme — selected edge style", () => {
  const style = marlinTheme.edge({ id: "e", fromId: "a", toId: "b", selected: true });
  assertEquals(style.stroke, "#5070c0");
  assertEquals(style.strokeWidth, 2);
});

Deno.test("marlinTheme — port style", () => {
  const inStyle = marlinTheme.port(
    { name: "in", direction: "in", x: 0, y: 0, nx: -1, ny: 0 },
    { id: "n", x: 0, y: 0, w: 52, h: 52, shape: "circle", label: "N" },
  );
  assertEquals(inStyle.fill, "#6688cc");

  const outStyle = marlinTheme.port(
    { name: "out", direction: "out", x: 0, y: 0, nx: 1, ny: 0 },
    { id: "n", x: 0, y: 0, w: 52, h: 52, shape: "circle", label: "N" },
  );
  assertEquals(outStyle.fill, "#cc8844");
});

Deno.test("marlinTheme — background color", () => {
  assertEquals(marlinTheme.background, "#0d0d1e");
});
