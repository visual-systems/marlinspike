// ---------------------------------------------------------------------------
// Core layout types — shared contract for all layout algorithms
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ForceNode — the physics body used by all layout algorithms
// ---------------------------------------------------------------------------

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
  /** Effective body width for repulsion calculations */
  w: number;
  /** Effective body height for repulsion calculations */
  h: number;
  /** Topological charge in [-1, +1] for directional field layout. Optional. */
  charge?: number;
  /** Target position for port-node anchor spring. Optional. */
  anchor?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// ForceEdge — a named edge type for the layout system
// ---------------------------------------------------------------------------

export interface ForceEdge {
  a: string;
  b: string;
}

// ---------------------------------------------------------------------------
// BBox — bounding box with min/max corners and dimensions
// ---------------------------------------------------------------------------

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// LayoutAlgorithm — shared contract for all layout algorithms
// ---------------------------------------------------------------------------

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
    edges: ForceEdge[],
    leafW: number,
    leafH: number,
    defaults: Map<string, { x: number; y: number; pinned?: boolean }>,
  ): ForceNode[];

  /** Advance one simulation step. Returns updated nodes and whether settled. */
  tick(
    nodes: ForceNode[],
    edges: ForceEdge[],
    ticks: number,
  ): { nodes: ForceNode[]; settled: boolean };
}

// ---------------------------------------------------------------------------
// Algorithm ID type — the string persisted in WorkspaceState
// ---------------------------------------------------------------------------

export type AlgorithmId = "JANK" | "TOPOGRID" | "TOPOLTR" | "SDF" | "FIELD" | "PORT";
