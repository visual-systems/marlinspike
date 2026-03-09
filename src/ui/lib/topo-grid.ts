// ---------------------------------------------------------------------------
// Topological-grid layout — deterministic, single-pass
// Nodes are assigned to layers by longest-path from roots, then spaced evenly
// within each layer. Directed edges are a→b; b is placed in a later layer.
// ---------------------------------------------------------------------------

import type { ForceNode } from "./force.ts";

// ---------------------------------------------------------------------------
// Shared: topo sort + layer assignment
// ---------------------------------------------------------------------------

function buildLayerAssignment(
  ids: string[],
  edges: { a: string; b: string }[],
): { sortedLayers: [number, string[]][]; layer: Map<string, number> } {
  const idSet = new Set(ids);

  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const outEdges = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!idSet.has(e.a) || !idSet.has(e.b)) continue;
    inDegree.set(e.b, (inDegree.get(e.b) ?? 0) + 1);
    outEdges.get(e.a)!.push(e.b);
  }

  // Topological sort (Kahn's); cycle edges are ignored
  const tempIn = new Map(inDegree);
  const topoQueue: string[] = ids.filter((id) => tempIn.get(id) === 0);
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
  const processedSet = new Set(processed);
  for (const id of ids) {
    if (!processedSet.has(id)) processed.push(id);
  }

  // Layer = max(predecessor layer) + 1
  const layer = new Map<string, number>();
  for (const id of processed) {
    if (!layer.has(id)) layer.set(id, 0);
    const myLayer = layer.get(id)!;
    for (const next of outEdges.get(id)!) {
      layer.set(next, Math.max(layer.get(next) ?? 0, myLayer + 1));
    }
  }

  // Group by layer, preserving original node order within each layer
  const layers = new Map<number, string[]>();
  for (const id of ids) {
    const l = layer.get(id) ?? 0;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(id);
  }
  const sortedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0]);

  return { sortedLayers, layer };
}

// ---------------------------------------------------------------------------
// topoGridLayout — uniform node size (used for initNodes)
// hSpacing / vSpacing are centre-to-centre distances.
// ---------------------------------------------------------------------------

export function topoGridLayout(
  nodeIds: string[],
  edges: { a: string; b: string }[],
  leafW: number,
  leafH: number,
  hSpacing: number,
  vSpacing: number,
): ForceNode[] {
  if (nodeIds.length === 0) return [];

  const { sortedLayers } = buildLayerAssignment(nodeIds, edges);

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

// ---------------------------------------------------------------------------
// topoGridLayoutSized — per-node sizes (used in tick to handle composites)
// hGap / vGap are surface-to-surface gaps between node bounding boxes.
// Returns new positions while preserving all other ForceNode fields.
// ---------------------------------------------------------------------------

export function topoGridLayoutSized(
  nodes: ForceNode[],
  edges: { a: string; b: string }[],
  hGap: number,
  vGap: number,
): ForceNode[] {
  if (nodes.length === 0) return nodes;

  const ids = nodes.map((n) => n.id);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const { sortedLayers } = buildLayerAssignment(ids, edges);

  // Precompute max height per layer for vertical accumulation
  const maxHPerLayer = sortedLayers.map(([, layerIds]) =>
    Math.max(...layerIds.map((id) => nodeById.get(id)!.h))
  );

  // Centre y of each layer, accumulated from top
  const layerCenterY: number[] = [0];
  for (let i = 1; i < sortedLayers.length; i++) {
    layerCenterY.push(
      layerCenterY[i - 1] + maxHPerLayer[i - 1] / 2 + vGap + maxHPerLayer[i] / 2,
    );
  }

  // Compute positions
  const positions = new Map<string, { x: number; y: number }>();
  sortedLayers.forEach(([, layerIds], rowIdx) => {
    const y = layerCenterY[rowIdx];
    const widths = layerIds.map((id) => nodeById.get(id)!.w);
    const totalW = widths.reduce((s, w) => s + w, 0) + (layerIds.length - 1) * hGap;
    let curX = -totalW / 2;
    layerIds.forEach((id, i) => {
      positions.set(id, { x: curX + widths[i] / 2, y });
      curX += widths[i] + hGap;
    });
  });

  return nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: n.x, y: n.y };
    return { ...n, x: pos.x, y: pos.y };
  });
}
