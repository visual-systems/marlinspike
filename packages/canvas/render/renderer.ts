/**
 * Renderer interface — backend abstraction for render primitives.
 *
 * Implement this interface to render primitives to SVG, Canvas2D, WebGL,
 * or any other target. The type parameter T is the output representation
 * (e.g. string for SVG markup, void for Canvas2D immediate-mode drawing).
 */

import type {
  RenderCircle,
  RenderGroup,
  RenderPath,
  RenderPolygon,
  RenderRect,
  RenderText,
} from "./primitives.ts";

export interface Renderer<T> {
  circle(p: RenderCircle): T;
  rect(p: RenderRect): T;
  path(p: RenderPath): T;
  polygon(p: RenderPolygon): T;
  text(p: RenderText): T;
  group(p: RenderGroup, children: T[]): T;
}

/** Walk a render primitive tree through a renderer, producing output of type T. */
export function renderWith<T>(
  renderer: Renderer<T>,
  ...primitives: import("./primitives.ts").RenderPrimitive[]
): T[] {
  return primitives.map((p) => renderOne(renderer, p));
}

function renderOne<T>(
  renderer: Renderer<T>,
  p: import("./primitives.ts").RenderPrimitive,
): T {
  switch (p.kind) {
    case "circle":
      return renderer.circle(p);
    case "rect":
      return renderer.rect(p);
    case "path":
      return renderer.path(p);
    case "polygon":
      return renderer.polygon(p);
    case "text":
      return renderer.text(p);
    case "group":
      return renderer.group(p, p.children.map((c) => renderOne(renderer, c)));
  }
}
