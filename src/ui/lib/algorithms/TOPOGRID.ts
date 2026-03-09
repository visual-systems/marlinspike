// ---------------------------------------------------------------------------
// TOPOGRID — deterministic topological grid layout
// ---------------------------------------------------------------------------

import { topoGridLayout, topoGridLayoutSized } from "../topo-grid.ts";
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
    tick(nodes, edges, _ticks) {
      // Recompute positions using actual node dimensions so that expanded
      // composite nodes don't overlap. Settle once positions have converged.
      const next = topoGridLayoutSized(nodes, edges, config.hSpacing, config.vSpacing);
      const settled = next.every(
        (n, i) => Math.abs(n.x - nodes[i].x) < 0.5 && Math.abs(n.y - nodes[i].y) < 0.5,
      );
      return { nodes: next, settled };
    },
  };
}
