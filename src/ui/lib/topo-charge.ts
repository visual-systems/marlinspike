// ---------------------------------------------------------------------------
// Topological charge — assign each node a charge from -1 (source) to +1 (sink)
//
// Uses longest-path ranking in a DAG. For cyclic graphs, SCCs are condensed
// into single nodes first. Disconnected nodes get charge 0.
// ---------------------------------------------------------------------------

/**
 * Compute a charge for each node based on its position in the topological
 * ordering of the directed graph. Sources (no incoming edges) get charge -1,
 * sinks (no outgoing edges) get charge +1, and intermediate nodes are linearly
 * interpolated by their longest-path rank.
 *
 * Returns a Map from node ID to charge in [-1, +1].
 */
export function topoCharge(
  nodeIds: string[],
  edges: { a: string; b: string }[],
): Map<string, number> {
  const result = new Map<string, number>();
  if (nodeIds.length === 0) return result;

  const idSet = new Set(nodeIds);
  // Filter edges to only those connecting known nodes
  const validEdges = edges.filter((e) => idSet.has(e.a) && idSet.has(e.b) && e.a !== e.b);

  if (validEdges.length === 0) {
    // No edges — all nodes get charge 0
    for (const id of nodeIds) result.set(id, 0);
    return result;
  }

  // Build adjacency lists
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const id of nodeIds) {
    successors.set(id, []);
    predecessors.set(id, []);
  }
  for (const e of validEdges) {
    successors.get(e.a)!.push(e.b);
    predecessors.get(e.b)!.push(e.a);
  }

  // Detect and condense SCCs using Tarjan's algorithm
  const sccOf = tarjanSCC(nodeIds, successors);

  // Build condensed DAG
  const sccIds = new Set<number>();
  for (const s of sccOf.values()) sccIds.add(s);
  const condensedSucc = new Map<number, Set<number>>();
  for (const s of sccIds) condensedSucc.set(s, new Set());
  for (const e of validEdges) {
    const sa = sccOf.get(e.a)!;
    const sb = sccOf.get(e.b)!;
    if (sa !== sb) condensedSucc.get(sa)!.add(sb);
  }

  // Compute longest-path rank on condensed DAG using topological order
  const sccInDeg = new Map<number, number>();
  for (const s of sccIds) sccInDeg.set(s, 0);
  for (const [, succs] of condensedSucc) {
    for (const s of succs) sccInDeg.set(s, sccInDeg.get(s)! + 1);
  }

  const sccRank = new Map<number, number>();
  const queue: number[] = [];
  for (const [s, deg] of sccInDeg) {
    if (deg === 0) {
      queue.push(s);
      sccRank.set(s, 0);
    }
  }

  let maxRank = 0;
  while (queue.length > 0) {
    const s = queue.shift()!;
    const r = sccRank.get(s)!;
    for (const t of condensedSucc.get(s)!) {
      const newRank = Math.max(sccRank.get(t) ?? 0, r + 1);
      sccRank.set(t, newRank);
      if (newRank > maxRank) maxRank = newRank;
      const deg = sccInDeg.get(t)! - 1;
      sccInDeg.set(t, deg);
      if (deg === 0) queue.push(t);
    }
  }

  // Map ranks back to nodes and normalize to [-1, +1]
  for (const id of nodeIds) {
    const scc = sccOf.get(id);
    if (scc === undefined) {
      result.set(id, 0);
      continue;
    }
    const rank = sccRank.get(scc) ?? 0;
    const charge = maxRank === 0 ? 0 : (rank / maxRank) * 2 - 1;
    result.set(id, charge);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tarjan's SCC algorithm
// ---------------------------------------------------------------------------

function tarjanSCC(
  nodeIds: string[],
  successors: Map<string, string[]>,
): Map<string, number> {
  let index = 0;
  let sccId = 0;
  const nodeIndex = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccOf = new Map<string, number>();

  function strongConnect(v: string): void {
    nodeIndex.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of successors.get(v) ?? []) {
      if (!nodeIndex.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, nodeIndex.get(w)!));
      }
    }

    if (lowlink.get(v) === nodeIndex.get(v)) {
      const currentScc = sccId++;
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        sccOf.set(w, currentScc);
      } while (w !== v);
    }
  }

  for (const id of nodeIds) {
    if (!nodeIndex.has(id)) strongConnect(id);
  }

  return sccOf;
}
