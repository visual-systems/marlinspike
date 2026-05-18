// ---------------------------------------------------------------------------
// @marlinspike/layout — public API
// ---------------------------------------------------------------------------

// Core types
export type { AlgorithmId, BBox, ForceEdge, ForceNode, LayoutAlgorithm } from "./types.ts";

// Force simulation primitives
export type { ForceConfig } from "./force.ts";
export {
  boundingBox,
  centerNodes,
  DEFAULT_FORCE_CONFIG,
  initPositions,
  maxVelocity,
  tickLevel,
} from "./force.ts";

// Topological analysis
export { topoCharge } from "./topo-charge.ts";

// Topological grid layout
export {
  topoGridLayout,
  topoGridLayoutLTR,
  topoGridLayoutSized,
  topoGridLayoutSizedLTR,
} from "./topo-grid.ts";

// SDF force simulation
export type { SdfPhysicsConfig } from "./sdf-force.ts";
export {
  applyAnchorForces,
  connectedComponents,
  lineClosestPoint,
  lineSdfGrad,
  tickSdfLevel,
} from "./sdf-force.ts";

// Port layout
export type { PortPosition } from "./port-layout.ts";
export { circlePortPositions, rectPortPositions, resolveNodePorts } from "./port-layout.ts";

// Algorithm factories and configs
export type { JankConfig } from "./algorithms/JANK.ts";
export { createJANK, DEFAULT_JANK_CONFIG } from "./algorithms/JANK.ts";

export type { SdfConfig } from "./algorithms/SDF.ts";
export { createSDF, DEFAULT_SDF_CONFIG } from "./algorithms/SDF.ts";

export type { TopogridConfig } from "./algorithms/TOPOGRID.ts";
export { createTOPOGRID, DEFAULT_TOPOGRID_CONFIG } from "./algorithms/TOPOGRID.ts";

export type { FieldConfig } from "./algorithms/FIELD.ts";
export { createFIELD, DEFAULT_FIELD_CONFIG } from "./algorithms/FIELD.ts";

export type { PortConfig } from "./algorithms/PORT.ts";
export { createPORT, DEFAULT_PORT_CONFIG } from "./algorithms/PORT.ts";
