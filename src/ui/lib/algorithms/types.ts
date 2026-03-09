// ---------------------------------------------------------------------------
// LayoutAlgorithm interface — shared contract for all layout algorithms
// ---------------------------------------------------------------------------

import type { ForceNode } from "../force.ts";

export interface LayoutAlgorithm {
  readonly id: string;
  readonly name: string;
  /**
   * Whether initNodes should fall back to prevMap positions when a node already
   * exists in the layout. True for iterative algorithms (force-directed) where
   * existing simulation state should be preserved across layout syncs. False for
   * deterministic algorithms (topo-grid) where positions are fully recomputed
   * from topology.
   */
  readonly preservesPositions: boolean;

  /** Compute initial node positions for a level. */
  initNodes(
    ids: string[],
    edges: { a: string; b: string }[],
    leafW: number,
    leafH: number,
    defaults: Map<string, { x: number; y: number; pinned?: boolean }>,
  ): ForceNode[];

  /** Advance one simulation step. Returns updated nodes and whether settled. */
  tick(
    nodes: ForceNode[],
    edges: { a: string; b: string }[],
    ticks: number,
  ): { nodes: ForceNode[]; settled: boolean };
}

// ---------------------------------------------------------------------------
// Algorithm ID type — the string persisted in WorkspaceState
// ---------------------------------------------------------------------------

export type AlgorithmId = "JANK" | "TOPOGRID";
