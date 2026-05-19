/**
 * Node rendering — produces render primitives for a canvas node.
 *
 * Delegates shape rendering to the node's NodeGeometry (or falls back via resolveGeometry).
 */

import type { CanvasNode } from "../scene/types.ts";
import type { CanvasTheme } from "../style/types.ts";
import type { RenderPrimitive } from "./primitives.ts";
import { resolveGeometry } from "../geometry/node-geometry.ts";

/**
 * Produce render primitives for a single node.
 * Returns a group containing the shape, label, ports, and decorations.
 */
export function renderNode<S>(node: CanvasNode<S>, theme: CanvasTheme<S>): RenderPrimitive {
  const resolved = theme.resolveNode?.(node);
  const style = resolved?.style ?? theme.node(node);
  const geo = resolved?.geometry ?? resolveGeometry(node);
  const children: RenderPrimitive[] = [];

  children.push(...geo.renderBody(node.w, node.h, {
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeDash: geo.strokeDash(!!node.dashed),
  }));

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

  // Decorations (badges, indicators, etc.)
  if (theme.decorations) {
    children.push(...theme.decorations(node));
  }

  return {
    kind: "group",
    transform: `translate(${node.x}, ${node.y})`,
    tx: node.x,
    ty: node.y,
    children,
    opacity: style.opacity,
    id: node.id,
    interaction: {
      id: node.id,
      draggable: true,
      clickable: true,
      doubleClickable: true,
      hoverable: true,
      cursor: "pointer",
    },
  };
}
