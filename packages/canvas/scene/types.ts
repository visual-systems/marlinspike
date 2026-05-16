/**
 * Scene graph types for canvas rendering.
 *
 * A CanvasScene is a flat collection of positioned nodes and edges.
 * Nodes carry shape, dimensions, and optional port positions.
 * Edges reference nodes by ID.
 */

/** A port on a canvas node — position relative to node center. */
export interface CanvasPort {
  name: string;
  direction: "in" | "out" | "inout";
  type?: string;
  /** X offset from node center */
  x: number;
  /** Y offset from node center */
  y: number;
  /** Outward-facing normal X */
  nx: number;
  /** Outward-facing normal Y */
  ny: number;
}

/** A positioned node in the canvas scene. */
export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "circle" | "rect";
  label: string;
  ports?: CanvasPort[];
  selected?: boolean;
  highlighted?: boolean;
  dashed?: boolean;
  data?: Record<string, unknown>;
}

/** A directed edge between two nodes. */
export interface CanvasEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  selected?: boolean;
  highlighted?: boolean;
}

/** A flat scene: positioned nodes + edges. */
export interface CanvasScene {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
