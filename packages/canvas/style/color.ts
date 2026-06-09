/**
 * Color utilities for theming: blending, depth-aware fills, and contrast.
 *
 * Provides functions to blend colors toward a background at increasing
 * nesting depths, with hue rotation to prevent visual convergence.
 * Also provides WCAG-based relative luminance and contrast text selection
 * so that labels remain readable against any background fill.
 */

/** Parse "#rrggbb" to [r, g, b] in 0–255. */
export function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Format [r, g, b] (0–255) to "#rrggbb". */
export function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${
    clamp(b).toString(16).padStart(2, "0")
  }`;
}

/** Linear blend between two hex colors. factor 0 = a, factor 1 = b. */
export function blendHex(a: string, b: string, factor: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const f = Math.max(0, Math.min(1, factor));
  return toHex(
    ar + (br - ar) * f,
    ag + (bg - ag) * f,
    ab + (bb - ab) * f,
  );
}

/** RGB (0–255) to HSL (h: 0–360, s: 0–1, l: 0–1). */
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/** HSL (h: 0–360, s: 0–1, l: 0–1) to RGB (0–255). */
export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h / 360) * 255),
    Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255),
  ];
}

/**
 * WCAG relative luminance of a hex color (0 = black, 1 = white).
 * Uses the sRGB linearisation specified in WCAG 2.x.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const linearise = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * WCAG contrast ratio between two colors (1–21).
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick a readable text color for a given background.
 *
 * Returns `light` when the background is dark and `dark` when the
 * background is light, using WCAG relative luminance with a threshold
 * tuned for comfortable reading (not minimum compliance).
 *
 * @param bgHex  Background color as "#rrggbb"
 * @param light  Color to use on dark backgrounds (default "#e0e0e0")
 * @param dark   Color to use on light backgrounds (default "#1a1a1a")
 */
export function contrastText(
  bgHex: string,
  light = "#e0e0e0",
  dark = "#1a1a1a",
): string {
  return relativeLuminance(bgHex) > 0.18 ? dark : light;
}

/**
 * Ensure `textHex` is readable against `bgHex`.
 *
 * If the contrast ratio is at least `minRatio` (default 3, WCAG AA for
 * large text / UI components), returns `textHex` unchanged. Otherwise
 * falls back to `contrastText(bgHex)` for a guaranteed-readable alternative.
 */
export function ensureContrast(
  bgHex: string,
  textHex: string,
  minRatio = 3,
): string {
  if (contrastRatio(bgHex, textHex) >= minRatio) return textHex;
  return contrastText(bgHex);
}

/**
 * Compute container fill at a given nesting depth.
 *
 * Blends toward background with decreasing saturation and rotating hue
 * to prevent convergence to a single color at deep nesting levels.
 *
 * @param nodeFill Base fill color for nodes in this theme
 * @param background Canvas background color
 * @param depth Nesting depth (0 = root container)
 */
export function containerFill(
  nodeFill: string,
  background: string,
  depth: number,
): string {
  const [r, g, b] = parseHex(nodeFill);
  let [h, s, l] = rgbToHsl(r, g, b);
  const [, , bgL] = rgbToHsl(...parseHex(background));

  // Per-depth adjustments:
  // - Blend luminance 15% toward background per level (capped at 70%)
  // - Rotate hue by 20° per level (variety, not convergence)
  // - Reduce saturation by 10% per level (capped at 50% reduction)
  const blendFactor = Math.min(0.15 * depth, 0.7);
  const satReduction = Math.min(0.10 * depth, 0.5);

  l = l + (bgL - l) * blendFactor;
  s = s * (1 - satReduction);
  h = (h + 20 * depth) % 360;

  const [nr, ng, nb] = hslToRgb(h, s, l);
  return toHex(nr, ng, nb);
}
