/**
 * Edge rendering — produces render primitives for a canvas edge.
 *
 * Handles straight lines, circular arcs, multi-edge grouping,
 * arrowheads, and label placement.
 */

import type { CanvasEdge, CanvasNode } from "../scene/types.ts";
import type { CanvasTheme } from "../style/types.ts";
import { arcMidpoint, pathEndTangent } from "../geometry/arc.ts";
import { resolveGeometry } from "../geometry/node-geometry.ts";
import { type Point, surfacePoint } from "../geometry/surface.ts";
import type { RenderPrimitive } from "./primitives.ts";

/** Pre-computed edge path data for two-pass rendering. */
export interface EdgeRenderData {
  edge: CanvasEdge;
  src: Point;
  dst: Point;
  d: string;
  isArc: boolean;
  r: number;
  sweep: number;
  arcC?: Point;
  /** Override arrival direction (unit vector) from custom edge router. */
  endTangent?: Point;
}

/**
 * Compute path data for a single edge within a scene.
 *
 * @param edge - The edge to compute
 * @param nodeMap - Map of node ID → CanvasNode for position lookup
 * @param groupIndex - This edge's index within its parallel-edge group
 * @param groupCount - Total edges in this edge's parallel-edge group
 * @param obstacleOffset - Pre-computed arc offset for obstacle avoidance (0 = straight)
 * @param dstGap - Gap at destination for endpoint decoration (default 15 for arrowhead)
 */
export function computeEdgePath<S>(
  edge: CanvasEdge,
  nodeMap: Map<string, CanvasNode<S>>,
  groupIndex: number,
  groupCount: number,
  obstacleOffset = 0,
  dstGap = 15,
): EdgeRenderData | null {
  const pa = nodeMap.get(edge.fromId);
  const pb = nodeMap.get(edge.toId);
  if (!pa || !pb) return null;

  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return null;

  const isMulti = groupCount > 1;

  let h = 0;
  if (isMulti) {
    const baseSweep = edge.fromId < edge.toId ? 0 : 1;
    const side = groupIndex % 2 === 0 ? baseSweep : 1 - baseSweep;
    const sign = side === 1 ? -1 : 1;
    const scale = 1.5 + Math.floor(groupIndex / 2) * 0.5;
    const r = dist * scale;
    const hh = Math.max(0, r * r - (dist / 2) * (dist / 2));
    h = sign * Math.sqrt(hh);
  } else {
    h = obstacleOffset;
  }

  const isArc = Math.abs(h) > 0.5;
  let src: Point;
  let dst: Point;
  let edgeArcC: Point | undefined;
  let r = 0;
  let sweep = 0;

  if (isArc) {
    const ux = dx / dist, uy = dy / dist;
    const nx = -uy, ny = ux;
    r = Math.sqrt((dist / 2) * (dist / 2) + h * h);
    edgeArcC = {
      x: (pa.x + pb.x) / 2 + h * nx,
      y: (pa.y + pb.y) / 2 + h * ny,
    };
    const arcSweep = h < 0 ? 1 : 0;

    // Clip source and destination via node geometry
    const geoA = resolveGeometry(pa);
    const geoB = resolveGeometry(pb);
    src = geoA.arcClip(edgeArcC, r, pa, pa.w, pa.h, 5, arcSweep, pb);
    dst = geoB.arcClip(edgeArcC, r, pb, pb.w, pb.h, dstGap, 1 - arcSweep, pa);

    // Derive SVG sweep from cross product
    const crossZ = (src.x - edgeArcC.x) * (dst.y - edgeArcC.y) -
      (src.y - edgeArcC.y) * (dst.x - edgeArcC.x);
    sweep = crossZ > 0 ? 1 : 0;
  } else {
    src = surfacePoint(pa, pb, 5);
    dst = surfacePoint(pb, pa, dstGap);
  }

  const d = isArc
    ? `M${src.x},${src.y} A${r},${r} 0 0,${sweep} ${dst.x},${dst.y}`
    : `M${src.x},${src.y} L${dst.x},${dst.y}`;

  return { edge, src, dst, d, isArc, r, sweep, arcC: edgeArcC };
}

/**
 * Produce render primitives for a pre-computed edge.
 * Returns a group containing the path, arrowhead, and optional label.
 */
export function renderEdge<S>(data: EdgeRenderData, theme: CanvasTheme<S>): RenderPrimitive {
  const themeStyle = theme.edge(data.edge);
  const style = data.edge.style ? { ...themeStyle, ...data.edge.style } : themeStyle;
  const children: RenderPrimitive[] = [];
  const isInteractive = data.edge.interactive !== false;

  // Transparent hit area (only for interactive edges)
  if (isInteractive) {
    children.push({
      kind: "path",
      d: data.d,
      stroke: "transparent",
      strokeWidth: 8,
      fill: "none",
      cursor: "pointer",
    });
  }

  // Visible path
  children.push({
    kind: "path",
    d: data.d,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    fill: "none",
    strokeDash: style.strokeDash,
    opacity: style.opacity,
  });

  // Endpoint decoration
  const endCap = style.endCap ?? "arrow";
  if (endCap === "arrow") {
    const tangent = data.endTangent ?? pathEndTangent(
      data.src,
      data.dst,
      data.isArc,
      data.r,
      data.sweep,
      data.arcC,
    );
    const perp = { x: -tangent.y, y: tangent.x };
    const tip = {
      x: data.dst.x + tangent.x * style.arrowSize,
      y: data.dst.y + tangent.y * style.arrowSize,
    };
    const arrowHalfW = style.arrowSize * 0.35;
    children.push({
      kind: "polygon",
      points: [
        [tip.x, tip.y],
        [data.dst.x + perp.x * arrowHalfW, data.dst.y + perp.y * arrowHalfW],
        [data.dst.x - perp.x * arrowHalfW, data.dst.y - perp.y * arrowHalfW],
      ],
      fill: style.stroke,
    });
  } else if (endCap === "dot") {
    const dotR = style.arrowSize * 0.3;
    children.push({
      kind: "circle",
      cx: data.dst.x,
      cy: data.dst.y,
      r: dotR,
      fill: style.stroke,
      stroke: "none",
      strokeWidth: 0,
    });
  }
  // endCap === "none" → no endpoint decoration

  // Label
  if (data.edge.label) {
    const lp = data.isArc
      ? arcMidpoint(data.src.x, data.src.y, data.dst.x, data.dst.y, data.r, data.sweep, data.arcC)
      : { x: (data.src.x + data.dst.x) / 2, y: (data.src.y + data.dst.y) / 2 };
    children.push({
      kind: "text",
      x: lp.x,
      y: lp.y - 4,
      text: data.edge.label,
      fill: style.labelFill,
      fontSize: style.labelSize,
      fontFamily: style.labelFont,
      anchor: "middle",
      strokeOutline: { stroke: "#0d0d1e", strokeWidth: 4 },
    });
  }

  return {
    kind: "group",
    children,
    id: data.edge.id,
    interaction: isInteractive
      ? { id: data.edge.id, clickable: true, hoverable: true, cursor: "pointer" }
      : undefined,
  };
}

/**
 * Group edges by unordered node pair for parallel-edge handling.
 * Returns maps of edge ID → group index and canonical key → group count.
 */
export function groupEdges(
  edges: CanvasEdge[],
): { indexMap: Map<string, number>; countMap: Map<string, number>; keyMap: Map<string, string> } {
  const indexMap = new Map<string, number>();
  const countMap = new Map<string, number>();
  const keyMap = new Map<string, string>();
  for (const e of edges) {
    const key = [e.fromId, e.toId].sort().join("|");
    indexMap.set(e.id, countMap.get(key) ?? 0);
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
    keyMap.set(e.id, key);
  }
  return { indexMap, countMap, keyMap };
}
