/**
 * Scene graph types for canvas rendering.
 *
 * A CanvasScene is a collection of positioned nodes and edges.
 * Nodes carry shape, dimensions, optional port positions, and
 * optional children for hierarchical (nested container) rendering.
 * Edges reference nodes by ID.
 *
 * The `S` type parameter allows consumers to attach typed state
 * to nodes for use in theme resolvers — the package itself never
 * inspects this state, only passes it through.
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
export interface CanvasNode<S = unknown> {
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
  /** Consumer-specific state, typed per-consumer. Opaque to the package. */
  state?: S;
  /** Child nodes rendered inside this container when expanded. */
  children?: CanvasNode<S>[];
  /** If true and children exist, render as an expanded container rather than a leaf. */
  expanded?: boolean;
  /** Edges among children at this level (only relevant when expanded). */
  edges?: CanvasEdge[];
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

/** A scene: positioned nodes + edges, optionally hierarchical. */
export interface CanvasScene<S = unknown> {
  nodes: CanvasNode<S>[];
  edges: CanvasEdge[];
}
