/**
 * Node rendering — produces render primitives for a canvas node.
 */

import type { CanvasNode } from "../scene/types.ts";
import type { CanvasTheme } from "../style/types.ts";
import type { RenderPrimitive } from "./primitives.ts";

/**
 * Produce render primitives for a single node.
 * Returns a group containing the shape and label.
 */
export function renderNode(node: CanvasNode, theme: CanvasTheme): RenderPrimitive {
  const style = theme.node(node);
  const children: RenderPrimitive[] = [];

  if (node.shape === "rect") {
    const halfW = node.w / 2;
    const halfH = node.h / 2;
    children.push({
      kind: "rect",
      x: -halfW,
      y: -halfH,
      w: node.w,
      h: node.h,
      rx: node.w > 60 ? 8 : 4,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDash: node.dashed ? "6,3" : undefined,
    });
  } else {
    const r = Math.min(node.w, node.h) / 2;
    children.push({
      kind: "circle",
      cx: 0,
      cy: 0,
      r,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeDash: node.dashed ? "3,2" : undefined,
    });
  }

  // Label
  children.push({
    kind: "text",
    x: 0,
    y: 3,
    text: node.label,
    fill: style.labelFill,
    fontSize: style.labelSize,
    fontFamily: style.labelFont,
    anchor: "middle",
  });

  // Port dots
  if (node.ports) {
    for (const port of node.ports) {
      const portStyle = theme.port(port, node);
      children.push({
        kind: "circle",
        cx: port.x,
        cy: port.y,
        r: portStyle.radius,
        fill: portStyle.fill,
        stroke: portStyle.stroke,
        strokeWidth: portStyle.stroke === "none" ? 0 : 1,
      });
    }
  }

  return {
    kind: "group",
    transform: `translate(${node.x}, ${node.y})`,
    children,
    opacity: style.opacity,
    id: node.id,
  };
}
