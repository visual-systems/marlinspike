import { assertEquals, assertNotEquals } from "@std/assert";
import { blendHex, containerFill, hslToRgb, parseHex, rgbToHsl, toHex } from "./color.ts";

Deno.test("parseHex — parses hex color to RGB components", () => {
  assertEquals(parseHex("#ff0000"), [255, 0, 0]);
  assertEquals(parseHex("#00ff00"), [0, 255, 0]);
  assertEquals(parseHex("#0000ff"), [0, 0, 255]);
  assertEquals(parseHex("#1a2a3a"), [26, 42, 58]);
});

Deno.test("toHex — formats RGB to hex string", () => {
  assertEquals(toHex(255, 0, 0), "#ff0000");
  assertEquals(toHex(0, 255, 0), "#00ff00");
  assertEquals(toHex(26, 42, 58), "#1a2a3a");
});

Deno.test("toHex — clamps out-of-range values", () => {
  assertEquals(toHex(300, -10, 128), "#ff0080");
});

Deno.test("blendHex — factor 0 returns source", () => {
  assertEquals(blendHex("#ff0000", "#0000ff", 0), "#ff0000");
});

Deno.test("blendHex — factor 1 returns target", () => {
  assertEquals(blendHex("#ff0000", "#0000ff", 1), "#0000ff");
});

Deno.test("blendHex — factor 0.5 returns midpoint", () => {
  assertEquals(blendHex("#000000", "#ffffff", 0.5), "#808080");
});

Deno.test("rgbToHsl / hslToRgb — round-trip for pure red", () => {
  const [h, s, l] = rgbToHsl(255, 0, 0);
  assertEquals(h, 0);
  assertEquals(s, 1);
  assertEquals(l, 0.5);
  const [r, g, b] = hslToRgb(h, s, l);
  assertEquals(r, 255);
  assertEquals(g, 0);
  assertEquals(b, 0);
});

Deno.test("rgbToHsl / hslToRgb — round-trip for gray", () => {
  const [h, s, l] = rgbToHsl(128, 128, 128);
  assertEquals(h, 0);
  assertEquals(s, 0);
  const [r, g, b] = hslToRgb(h, s, l);
  assertEquals(r, Math.round(l * 255));
  assertEquals(g, Math.round(l * 255));
  assertEquals(b, Math.round(l * 255));
});

Deno.test("containerFill — depth 0 is close to nodeFill", () => {
  const result = containerFill("#c8a832", "#1a2a3a", 0);
  // At depth 0, no blending/rotation applied
  assertEquals(result, "#c8a832");
});

Deno.test("containerFill — produces distinct colors at different depths", () => {
  const bg = "#1a2a3a";
  const fill = "#c8a832";
  const d0 = containerFill(fill, bg, 0);
  const d1 = containerFill(fill, bg, 1);
  const d2 = containerFill(fill, bg, 2);
  const d3 = containerFill(fill, bg, 3);
  // All should be different from each other
  assertNotEquals(d0, d1);
  assertNotEquals(d1, d2);
  assertNotEquals(d2, d3);
  // None should equal the background
  assertNotEquals(d1, bg);
  assertNotEquals(d2, bg);
  assertNotEquals(d3, bg);
});

Deno.test("containerFill — deep nesting doesn't converge to background", () => {
  const bg = "#0d0d1e";
  const fill = "#111125";
  const deep = containerFill(fill, bg, 10);
  assertNotEquals(deep, bg);
});
