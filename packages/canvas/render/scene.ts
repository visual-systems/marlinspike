/**
 * Scene rendering — produces a complete render primitive tree from a CanvasScene.
 *
 * This is the main entry point for rendering. It takes a scene and theme,
 * and returns a RenderGroup containing all nodes and edges.
 *
 * Array order in the scene determines z-order: nodes rendered first appear
 * behind nodes rendered later.
 */

import type { CanvasScene } from "../scene/types.ts";
import type { CanvasTheme } from "../style/types.ts";
import type { RenderGroup, RenderPrimitive } from "./primitives.ts";
import { renderNode } from "./node.ts";
import { computeEdgePath, type EdgeRenderData, groupEdges, renderEdge } from "./edge.ts";
import { marlinTheme } from "../style/marlin-theme.ts";
import { surfacePoint } from "../geometry/surface.ts";

/**
 * Render a CanvasScene into a render primitive tree.
 *
 * Theme is optional — defaults to `marlinTheme` (dark palette) when omitted.
 * Rendering order: nodes first (background), then edge paths, then edge labels on top.
 * Multi-edge grouping is handled automatically.
 */
export function renderScene<S>(
  scene: CanvasScene<S>,
  theme: CanvasTheme<S> = marlinTheme as CanvasTheme<S>,
): RenderGroup {
  const children: RenderPrimitive[] = [];
  const nodeMap = new Map(scene.nodes.map((n) => [n.id, n]));

  // Render nodes
  for (const node of scene.nodes) {
    children.push(renderNode(node, theme));
  }

  // Compute edge paths with parallel-edge grouping
  const { indexMap, countMap, keyMap } = groupEdges(scene.edges);
  const edgePaths: (EdgeRenderData | null)[] = [];
  for (const edge of scene.edges) {
    const key = keyMap.get(edge.id)!;
    const idx = indexMap.get(edge.id) ?? 0;
    const count = countMap.get(key) ?? 1;

    // Use custom edge router when available (single edges only — multi-edges keep arcs)
    if (theme.edgeRouter && count === 1) {
      const pa = nodeMap.get(edge.fromId);
      const pb = nodeMap.get(edge.toId);
      if (!pa || !pb) {
        edgePaths.push(null);
        continue;
      }
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      if (dx * dx + dy * dy < 0.001) {
        edgePaths.push(null);
        continue;
      }
      const edgeStyle = theme.edge(edge);
      const endCap = (edge.style?.endCap ?? edgeStyle.endCap) ?? "arrow";
      const dstGap = endCap === "none" ? 5 : 15;
      const src = surfacePoint(pa, pb, 5);
      const dst = surfacePoint(pb, pa, dstGap);
      const result = theme.edgeRouter(src, dst, edge);
      edgePaths.push({
        edge,
        src,
        dst,
        d: result.d,
        isArc: false,
        r: 0,
        sweep: 0,
        endTangent: result.endDirection,
      });
    } else {
      edgePaths.push(computeEdgePath(edge, nodeMap, idx, count));
    }
  }

  // Two-pass edge rendering: paths first, then labels on top
  const edgePathPrimitives: RenderPrimitive[] = [];
  const edgeLabelPrimitives: RenderPrimitive[] = [];

  for (const data of edgePaths) {
    if (!data) continue;
    const edgeGroup = renderEdge(data, theme);
    if (edgeGroup.kind === "group") {
      const pathChildren: RenderPrimitive[] = [];
      const labelChildren: RenderPrimitive[] = [];
      for (const child of edgeGroup.children) {
        if (child.kind === "text") {
          labelChildren.push(child);
        } else {
          pathChildren.push(child);
        }
      }
      if (pathChildren.length > 0) {
        edgePathPrimitives.push({
          kind: "group",
          children: pathChildren,
          id: edgeGroup.id,
          interaction: edgeGroup.interaction,
        });
      }
      if (labelChildren.length > 0) {
        edgeLabelPrimitives.push(...labelChildren);
      }
    }
  }

  children.push(...edgePathPrimitives);
  children.push(...edgeLabelPrimitives);

  return { kind: "group", children };
}
