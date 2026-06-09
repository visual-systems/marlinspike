// ---------------------------------------------------------------------------
// Topological-grid layout — deterministic, single-pass
// Nodes are assigned to layers by longest-path from roots, then spaced evenly
// within each layer. Directed edges are a→b; b is placed in a later layer.
// ---------------------------------------------------------------------------

import type { ForceEdge, ForceNode } from "./types.ts";

// ---------------------------------------------------------------------------
// Shared: topo sort + layer assignment
// ---------------------------------------------------------------------------

/** Count edge crossings between two adjacent layers given their node orderings. */
function countCrossings(
  prevLayer: string[],
  currLayer: string[],
  edgesBetween: { a: string; b: string }[],
): number {
  const posA = new Map(prevLayer.map((id, i) => [id, i]));
  const posB = new Map(currLayer.map((id, i) => [id, i]));
  let crossings = 0;
  for (let i = 0; i < edgesBetween.length; i++) {
    const e1 = edgesBetween[i];
    const a1 = posA.get(e1.a)!, b1 = posB.get(e1.b)!;
    for (let j = i + 1; j < edgesBetween.length; j++) {
      const e2 = edgesBetween[j];
      const a2 = posA.get(e2.a)!, b2 = posB.get(e2.b)!;
      if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) crossings++;
    }
  }
  return crossings;
}

/** Generate all permutations of an array (for small arrays only). */
function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield arr.slice();
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      perm.unshift(arr[i]);
      yield perm;
    }
  }
}

/**
 * Reorder nodes within each layer to minimize edge crossings with predecessor layers.
 *
 * Layer 0 stays fixed. For each subsequent layer:
 * - ≤7 nodes: exact permutation search (7! = 5040)
 * - >7 nodes: barycenter heuristic (order by mean predecessor position)
 */
function minimizeCrossings(
  sortedLayers: [number, string[]][],
  edges: ForceEdge[],
): [number, string[]][] {
  // Build lookup: for each node, edges arriving from any earlier layer
  const srcSet = new Map<number, Set<string>>();
  for (const [layerNum, ids] of sortedLayers) {
    const s = new Set(ids);
    srcSet.set(layerNum, s);
  }

  const result: [number, string[]][] = sortedLayers.map(([l, ids]) => [l, [...ids]]);

  for (let li = 1; li < result.length; li++) {
    const [, prevIds] = result[li - 1];
    const [layerNum, currIds] = result[li];
    const prevSet = new Set(prevIds);

    // Edges between prev and curr layers
    const edgesBetween = edges.filter((e) => prevSet.has(e.a) && srcSet.get(layerNum)?.has(e.b));
    if (edgesBetween.length === 0) continue;

    if (currIds.length <= 7) {
      // Exact: try all permutations
      let bestOrder = currIds;
      let bestCost = countCrossings(prevIds, currIds, edgesBetween);
      if (bestCost > 0) {
        for (const perm of permutations(currIds)) {
          const cost = countCrossings(prevIds, perm, edgesBetween);
          if (cost < bestCost) {
            bestCost = cost;
            bestOrder = perm;
            if (bestCost === 0) break;
          }
        }
      }
      result[li] = [layerNum, bestOrder];
    } else {
      // Barycenter heuristic
      const posOf = new Map(prevIds.map((id, i) => [id, i]));
      const bary = new Map<string, number>();
      for (const id of currIds) {
        const preds = edgesBetween.filter((e) => e.b === id).map((e) => posOf.get(e.a)!);
        bary.set(id, preds.length > 0 ? preds.reduce((s, v) => s + v, 0) / preds.length : Infinity);
      }
      const sorted = [...currIds].sort((a, b) => bary.get(a)! - bary.get(b)!);
      result[li] = [layerNum, sorted];
    }
  }

  return result;
}

function buildLayerAssignment(
  ids: string[],
  edges: ForceEdge[],
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
  const sortedLayers = minimizeCrossings(
    [...layers.entries()].sort((a, b) => a[0] - b[0]),
    edges.filter((e) => idSet.has(e.a) && idSet.has(e.b)),
  );

  return { sortedLayers, layer };
}

// ---------------------------------------------------------------------------
// topoGridLayout — uniform node size (used for initNodes)
// hSpacing / vSpacing are centre-to-centre distances.
// ---------------------------------------------------------------------------

export function topoGridLayout(
  nodeIds: string[],
  edges: ForceEdge[],
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
  edges: ForceEdge[],
  hGap: number,
  vGap: number,
): ForceNode[] {
  if (nodes.length === 0) return nodes;

  const ids = nodes.map((n) => n.id);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const { sortedLayers } = buildLayerAssignment(ids, edges);

  // Use a uniform row height (global max) so all layer pairs have the same
  // center-to-center distance — visually consistent spacing regardless of
  // individual node heights (e.g. port nodes with short labels).
  const uniformH = Math.max(...nodes.map((n) => n.h));

  // Centre y of each layer, with uniform center-to-center spacing
  const layerCenterY: number[] = [0];
  const rowStep = uniformH + vGap;
  for (let i = 1; i < sortedLayers.length; i++) {
    layerCenterY.push(layerCenterY[i - 1] + rowStep);
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

// ---------------------------------------------------------------------------
// topoGridLayoutLTR — uniform node size, left-to-right
// Layer index → x (columns), within-layer index → y (rows).
// hSpacing / vSpacing are centre-to-centre distances.
// ---------------------------------------------------------------------------

export function topoGridLayoutLTR(
  nodeIds: string[],
  edges: ForceEdge[],
  leafW: number,
  leafH: number,
  hSpacing: number,
  vSpacing: number,
): ForceNode[] {
  if (nodeIds.length === 0) return [];

  const { sortedLayers } = buildLayerAssignment(nodeIds, edges);

  const positions = new Map<string, { x: number; y: number }>();
  sortedLayers.forEach(([, ids], colIdx) => {
    const x = colIdx * hSpacing;
    const totalH = (ids.length - 1) * vSpacing;
    ids.forEach((id, row) => {
      positions.set(id, { x, y: row * vSpacing - totalH / 2 });
    });
  });

  return nodeIds.map((id): ForceNode => {
    const pos = positions.get(id) ?? { x: 0, y: 0 };
    return { id, x: pos.x, y: pos.y, vx: 0, vy: 0, pinned: false, w: leafW, h: leafH };
  });
}

// ---------------------------------------------------------------------------
// topoGridLayoutSizedLTR — per-node sizes, left-to-right
// Layer index → x (columns), within-layer index → y (rows).
// hGap / vGap are surface-to-surface gaps between node bounding boxes.
// ---------------------------------------------------------------------------

export function topoGridLayoutSizedLTR(
  nodes: ForceNode[],
  edges: ForceEdge[],
  hGap: number,
  vGap: number,
): ForceNode[] {
  if (nodes.length === 0) return nodes;

  const ids = nodes.map((n) => n.id);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const { sortedLayers } = buildLayerAssignment(ids, edges);

  // Use a uniform column width (global max) so all layer pairs have the same
  // center-to-center distance — visually consistent spacing regardless of
  // individual node widths (e.g. port nodes with short labels).
  const uniformW = Math.max(...nodes.map((n) => n.w));

  // Centre x of each layer, with uniform center-to-center spacing
  const layerCenterX: number[] = [0];
  const colStep = uniformW + hGap;
  for (let i = 1; i < sortedLayers.length; i++) {
    layerCenterX.push(layerCenterX[i - 1] + colStep);
  }

  // Compute positions
  const positions = new Map<string, { x: number; y: number }>();
  sortedLayers.forEach(([, layerIds], colIdx) => {
    const x = layerCenterX[colIdx];
    const heights = layerIds.map((id) => nodeById.get(id)!.h);
    const totalH = heights.reduce((s, h) => s + h, 0) + (layerIds.length - 1) * vGap;
    let curY = -totalH / 2;
    layerIds.forEach((id, i) => {
      positions.set(id, { x, y: curY + heights[i] / 2 });
      curY += heights[i] + vGap;
    });
  });

  return nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: n.x, y: n.y };
    return { ...n, x: pos.x, y: pos.y };
  });
}
