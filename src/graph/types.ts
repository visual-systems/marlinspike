/**
 * Base graph data model — see DESIGN.md §4.3
 *
 * The graph is a rose-tree of subgraphs. Every node is either a leaf (no subgraph)
 * or a composite (contains a subgraph referenced by URI). Nodes communicate only
 * via port nodes at the boundary of their parent subgraph.
 */

export type NodeKind = "node" | "port";
export type Direction = "in" | "out" | "inout";

/** A single alternative implementation of a composite node. */
export interface NodeImplementation {
  label: string;
  /** URI of the subgraph that provides this implementation. */
  subgraph: string;
  tags: string[];
}

/** One end of an edge — references a node and one of its port nodes. */
export interface EdgeEndpoint {
  node: string;
  port: string;
}

export interface Node {
  id: string;
  kind: NodeKind;
  label: string;
  /** URI of the subgraph this node contains, or null for leaf nodes. */
  subgraph: string | null;
  /** Only present when kind === "port". */
  portSchema?: string;
  /** Only present when kind === "port". */
  direction?: Direction;
  /** Named alternative implementations keyed by implementation id. */
  implementations: Record<string, NodeImplementation>;
  properties: Record<string, unknown>;
}

export interface Edge {
  id: string;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  properties: Record<string, unknown>;
}

export interface GraphMeta {
  name: string;
  created: string;
  modified: string;
}

export interface Graph {
  $schema: string;
  id: string;
  /** spike://<authority>/<repo>/<path>[@<version>] */
  uri: string;
  meta: GraphMeta;
  nodes: Record<string, Node>;
  edges: Record<string, Edge>;
  properties: Record<string, unknown>;
  /** Schema IDs active on this graph (topology, domain, etc.). */
  activeSchemas: string[];
  /** Graph-level default implementation selection. */
  activeImplementation: string | null;
}
