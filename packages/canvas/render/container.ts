/**
 * Container rendering — produces render primitives for an expanded container node.
 *
 * A container is a node with `expanded: true` and `children`. It renders as a
 * rounded rect background with a label in the top-left corner, containing its
 * child nodes and intra-container edges.
 */

import type { CanvasNode } from "../scene/types.ts";
import type { CanvasTheme, ContainerStyle } from "../style/types.ts";
import type { RenderGroup, RenderPrimitive } from "./primitives.ts";
import { renderLevel } from "./scene.ts";

/** Default container style when no theme resolver is provided. */
const DEFAULT_CONTAINER_STYLE: ContainerStyle = {
  fill: "#0f0f28",
  stroke: "#1e1e44",
  strokeWidth: 1,
  labelFill: "#444466",
  labelFont: "sans-serif",
  labelSize: 11,
  cornerRadius: 8,
};

/**
 * Render an expanded container node as a group containing a background rect,
 * label, and recursively rendered children.
 */
export function renderContainer<S>(node: CanvasNode<S>, theme: CanvasTheme<S>): RenderGroup {
  const style = theme.container ? theme.container(node) : DEFAULT_CONTAINER_STYLE;
  const halfW = node.w / 2;
  const halfH = node.h / 2;
  const children: RenderPrimitive[] = [];

  // Background rect
  children.push({
    kind: "rect",
    x: -halfW,
    y: -halfH,
    w: node.w,
    h: node.h,
    rx: style.cornerRadius,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeDash: style.strokeDash,
    opacity: style.opacity,
  });

  // Label in top-left corner
  children.push({
    kind: "text",
    x: -halfW + 10,
    y: -halfH + style.labelSize + 5,
    text: node.label,
    fill: style.labelFill,
    fontSize: style.labelSize,
    fontFamily: style.labelFont,
    anchor: "start",
  });

  // Port dots on the container boundary
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

  // Recursively render children and their edges
  const innerContent = renderLevel(node.children ?? [], node.edges ?? [], theme);
  children.push(...innerContent);

  return {
    kind: "group",
    transform: `translate(${node.x}, ${node.y})`,
    tx: node.x,
    ty: node.y,
    children,
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
