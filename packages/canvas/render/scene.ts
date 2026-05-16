/**
 * Scene rendering — produces a complete render primitive tree from a CanvasScene.
 *
 * This is the main entry point for rendering. It takes a scene and theme,
 * and returns a RenderGroup containing all nodes and edges.
 */

import type { CanvasEdge, CanvasNode, CanvasScene } from "../scene/types.ts";
import type { CanvasTheme } from "../style/types.ts";
import type { RenderGroup, RenderPrimitive } from "./primitives.ts";
import { renderNode } from "./node.ts";
import { computeEdgePath, groupEdges, renderEdge } from "./edge.ts";

/**
 * Render a list of nodes and edges at one level into primitives.
 *
 * This is the recursive workhorse — used by both `renderScene` (top level)
 * and `renderContainer` (nested levels inside expanded nodes).
 *
 * Rendering order: nodes first (background), then edge paths, then edge labels on top.
 */
export function renderLevel<S>(
  nodes: CanvasNode<S>[],
  edges: CanvasEdge[],
  theme: CanvasTheme<S>,
): RenderPrimitive[] {
  const children: RenderPrimitive[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Render nodes (renderNode handles expanded→container delegation)
  for (const node of nodes) {
    children.push(renderNode(node, theme));
  }

  // Compute edge paths with parallel-edge grouping
  const { indexMap, countMap, keyMap } = groupEdges(edges);
  const edgePaths: ReturnType<typeof computeEdgePath>[] = [];
  for (const edge of edges) {
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

  return children;
}

/**
 * Render a CanvasScene into a render primitive tree.
 *
 * Supports both flat scenes and hierarchical scenes (nodes with children).
 * Multi-edge grouping is handled automatically at each level.
 */
export function renderScene<S>(scene: CanvasScene<S>, theme: CanvasTheme<S>): RenderGroup {
  const children = renderLevel(scene.nodes, scene.edges, theme);
  return { kind: "group", children };
}
