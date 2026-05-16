/**
 * SVG renderer — reference Renderer<string> implementation.
 *
 * Walks the render primitive tree and produces SVG markup strings.
 * Useful for server-side rendering, testing, and as a template for
 * other backend implementations.
 */

import type { Renderer } from "./renderer.ts";
import type {
  RenderCircle,
  RenderGroup,
  RenderPath,
  RenderPolygon,
  RenderRect,
  RenderText,
} from "./primitives.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(name: string, value: string | number | undefined): string {
  if (value === undefined) return "";
  return ` ${name}="${esc(String(value))}"`;
}

/** SVG renderer that produces markup strings. */
export const svgRenderer: Renderer<string> = {
  circle(p: RenderCircle): string {
    return `<circle${attr("cx", p.cx)}${attr("cy", p.cy)}${attr("r", p.r)}${attr("fill", p.fill)}${
      attr("stroke", p.stroke)
    }${attr("stroke-width", p.strokeWidth)}${
      p.strokeDash ? attr("stroke-dasharray", p.strokeDash) : ""
    }${p.opacity !== undefined ? attr("opacity", p.opacity) : ""}${
      p.cursor ? ` style="cursor:${esc(p.cursor)};"` : ""
    }/>`;
  },

  rect(p: RenderRect): string {
    return `<rect${attr("x", p.x)}${attr("y", p.y)}${attr("width", p.w)}${attr("height", p.h)}${
      p.rx !== undefined ? attr("rx", p.rx) : ""
    }${attr("fill", p.fill)}${attr("stroke", p.stroke)}${attr("stroke-width", p.strokeWidth)}${
      p.strokeDash ? attr("stroke-dasharray", p.strokeDash) : ""
    }${p.opacity !== undefined ? attr("opacity", p.opacity) : ""}${
      p.cursor ? ` style="cursor:${esc(p.cursor)};"` : ""
    }/>`;
  },

  path(p: RenderPath): string {
    return `<path${attr("d", p.d)}${attr("stroke", p.stroke)}${
      attr("stroke-width", p.strokeWidth)
    }${attr("fill", p.fill)}${p.cursor ? ` style="cursor:${esc(p.cursor)};"` : ""}/>`;
  },

  polygon(p: RenderPolygon): string {
    const pts = p.points.map(([x, y]) => `${x},${y}`).join(" ");
    return `<polygon${attr("points", pts)}${attr("fill", p.fill)}${
      p.stroke ? attr("stroke", p.stroke) : ""
    }/>`;
  },

  text(p: RenderText): string {
    const attrs = `${attr("x", p.x)}${attr("y", p.y)}${attr("fill", p.fill)}${
      attr("font-size", p.fontSize)
    }${p.fontFamily ? attr("font-family", p.fontFamily) : ""}${
      p.anchor ? attr("text-anchor", p.anchor) : ""
    }`;
    const style = ' style="user-select:none; pointer-events:none;"';
    if (p.strokeOutline) {
      return `<text${attrs}${attr("stroke", p.strokeOutline.stroke)}${
        attr("stroke-width", p.strokeOutline.strokeWidth)
      } stroke-linejoin="round"${style} paint-order="stroke">${esc(p.text)}</text>`;
    }
    return `<text${attrs}${style}>${esc(p.text)}</text>`;
  },

  group(p: RenderGroup, children: string[]): string {
    const attrs = `${p.transform ? attr("transform", p.transform) : ""}${
      p.opacity !== undefined ? attr("opacity", p.opacity) : ""
    }${p.id ? attr("data-id", p.id) : ""}${p.cursor ? ` style="cursor:${esc(p.cursor)};"` : ""}`;
    return `<g${attrs}>${children.join("")}</g>`;
  },
};
