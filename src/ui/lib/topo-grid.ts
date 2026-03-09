// ---------------------------------------------------------------------------
// Topological-grid layout — deterministic, single-pass
// Nodes are assigned to layers by longest-path from roots, then spaced evenly
// within each layer. Directed edges are a→b; b is placed in a later layer.
// ---------------------------------------------------------------------------

import type { ForceNode } from "./force.ts";

export function topoGridLayout(
  nodeIds: string[],
  edges: { a: string; b: string }[],
  leafW: number,
  leafH: number,
  hSpacing: number,
  vSpacing: number,
): ForceNode[] {
  if (nodeIds.length === 0) return [];

  const idSet = new Set(nodeIds);

  // Build in-degree and adjacency for edges within this level
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const outEdges = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (!idSet.has(e.a) || !idSet.has(e.b)) continue;
    inDegree.set(e.b, (inDegree.get(e.b) ?? 0) + 1);
    outEdges.get(e.a)!.push(e.b);
  }

  // Topological sort (Kahn's) to get processing order; cycle edges are ignored
  const tempIn = new Map(inDegree);
  const topoQueue: string[] = nodeIds.filter((id) => tempIn.get(id) === 0);
  const processed: string[] = [];
  let qi = 0;
  while (qi < topoQueue.length) {
    const id = topoQueue[qi++];
    processed.push(id);
    for (const next of outEdges.get(id)!) {
      const d = (tempIn.get(next) ?? 1) - 1;
      tempIn.set(next, d);
      if (d === 0) topoQueue.push(next);
    }
  }
  // Nodes not reached (in cycles) are appended in original order
  const processedSet = new Set(processed);
  for (const id of nodeIds) {
    if (!processedSet.has(id)) processed.push(id);
  }

  // Assign layers: each node's layer = max(predecessor layer) + 1
  const layer = new Map<string, number>();
  for (const id of processed) {
    if (!layer.has(id)) layer.set(id, 0);
    const myLayer = layer.get(id)!;
    for (const next of outEdges.get(id)!) {
      layer.set(next, Math.max(layer.get(next) ?? 0, myLayer + 1));
    }
  }

  // Group nodes by layer (preserve node order within each layer)
  const layers = new Map<number, string[]>();
  for (const id of nodeIds) {
    const l = layer.get(id) ?? 0;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(id);
  }
  const sortedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0]);

  // Compute pixel positions: each row centred on x=0
  const positions = new Map<string, { x: number; y: number }>();
  sortedLayers.forEach(([, ids], rowIdx) => {
    const y = rowIdx * vSpacing;
    const totalW = (ids.length - 1) * hSpacing;
    ids.forEach((id, col) => {
      positions.set(id, { x: col * hSpacing - totalW / 2, y });
    });
  });

  return nodeIds.map((id): ForceNode => {
    const pos = positions.get(id) ?? { x: 0, y: 0 };
    return { id, x: pos.x, y: pos.y, vx: 0, vy: 0, pinned: false, w: leafW, h: leafH };
  });
}
