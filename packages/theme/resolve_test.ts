import { assertEquals } from "@std/assert";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";
import type { NodeStyleProps } from "@marlinspike/canvas";
import { resolveGeometryFromProps, resolveProps } from "./resolve.ts";
import type { RoleDefs } from "./types.ts";

const ROLES: RoleDefs = {
  leaf: {
    geometry: "circle",
    fill: "#111",
    stroke: "#222",
    strokeWidth: 1,
    labelFill: "#777",
  },
  container: {
    geometry: "rect",
    fill: "#0f0",
    stroke: "#1e1",
    strokeWidth: 1,
  },
};

Deno.test("resolveProps — returns base role defaults when no overrides", () => {
  const result = resolveProps(ROLES, "leaf");
  assertEquals(result, ROLES.leaf);
});

Deno.test("resolveProps — merges overrides over role defaults", () => {
  const overrides: NodeStyleProps = { fill: "#fff", strokeWidth: 3 };
  const result = resolveProps(ROLES, "leaf", overrides);
  assertEquals(result.fill, "#fff");
  assertEquals(result.strokeWidth, 3);
  assertEquals(result.stroke, "#222"); // preserved from base
  assertEquals(result.geometry, "circle"); // preserved from base
});

Deno.test("resolveProps — overrides can change geometry", () => {
  const overrides: NodeStyleProps = { geometry: "rect" };
  const result = resolveProps(ROLES, "leaf", overrides);
  assertEquals(result.geometry, "rect");
  assertEquals(result.fill, "#111"); // preserved from base
});

Deno.test("resolveProps — unknown role returns empty when no overrides", () => {
  const result = resolveProps(ROLES, "unknown");
  assertEquals(result, {});
});

Deno.test("resolveProps — unknown role returns overrides as-is", () => {
  const overrides: NodeStyleProps = { fill: "#abc" };
  const result = resolveProps(ROLES, "unknown", overrides);
  assertEquals(result, overrides);
});

Deno.test("resolveGeometryFromProps — circle", () => {
  assertEquals(resolveGeometryFromProps("circle"), CIRCLE_GEOMETRY);
});

Deno.test("resolveGeometryFromProps — rect", () => {
  assertEquals(resolveGeometryFromProps("rect"), RECT_GEOMETRY);
});

Deno.test("resolveGeometryFromProps — undefined falls back to circle", () => {
  assertEquals(resolveGeometryFromProps(undefined), CIRCLE_GEOMETRY);
});

Deno.test("resolveGeometryFromProps — unknown string falls back to circle", () => {
  assertEquals(resolveGeometryFromProps("hexagon"), CIRCLE_GEOMETRY);
});
