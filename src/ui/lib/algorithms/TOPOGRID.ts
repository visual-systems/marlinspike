// ---------------------------------------------------------------------------
// TOPOGRID — deterministic topological grid layout
// ---------------------------------------------------------------------------

import { topoGridLayout } from "../topo-grid.ts";
import type { LayoutAlgorithm } from "./types.ts";

export interface TopogridConfig {
  /** Horizontal spacing between node centres within a layer */
  hSpacing: number;
  /** Vertical spacing between layers */
  vSpacing: number;
}

export const DEFAULT_TOPOGRID_CONFIG: TopogridConfig = {
  hSpacing: 160,
  vSpacing: 130,
};

export function createTOPOGRID(config: TopogridConfig): LayoutAlgorithm {
  return {
    id: "TOPOGRID",
    name: "TOPOGRID",
    preservesPositions: false,
    initNodes(ids, edges, leafW, leafH, _defaults) {
      return topoGridLayout(ids, edges, leafW, leafH, config.hSpacing, config.vSpacing);
    },
    tick(nodes, _edges, _ticks) {
      return { nodes, settled: true };
    },
  };
}
