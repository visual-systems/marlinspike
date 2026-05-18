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
import { computeEdgePath, groupEdges, renderEdge } from "./edge.ts";

/**
 * Render a CanvasScene into a render primitive tree.
 *
 * Rendering order: nodes first (background), then edge paths, then edge labels on top.
 * Multi-edge grouping is handled automatically.
 */
export function renderScene<S>(scene: CanvasScene<S>, theme: CanvasTheme<S>): RenderGroup {
  const children: RenderPrimitive[] = [];
  const nodeMap = new Map(scene.nodes.map((n) => [n.id, n]));

  // Render nodes
  for (const node of scene.nodes) {
    children.push(renderNode(node, theme));
  }

  // Compute edge paths with parallel-edge grouping
  const { indexMap, countMap, keyMap } = groupEdges(scene.edges);
  const edgePaths: ReturnType<typeof computeEdgePath>[] = [];
  for (const edge of scene.edges) {
    const key = keyMap.get(edge.id)!;
    const idx = indexMap.get(edge.id) ?? 0;
    const count = countMap.get(key) ?? 1;
    edgePaths.push(computeEdgePath(edge, nodeMap, idx, count));
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
