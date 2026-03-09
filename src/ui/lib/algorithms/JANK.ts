// ---------------------------------------------------------------------------
// JANK — iterative force-directed layout
// ---------------------------------------------------------------------------

import {
  DEFAULT_FORCE_CONFIG,
  type ForceConfig,
  initPositions,
  maxVelocity,
  tickLevel,
} from "../force.ts";
import type { LayoutAlgorithm } from "./types.ts";

export interface JankConfig extends ForceConfig {
  /** Initial circular spread radius when placing new nodes */
  spread: number;
  /** Velocity threshold below which a level is considered settled */
  settleV: number;
  /** Maximum ticks before a level is force-settled */
  maxTicks: number;
}

export const DEFAULT_JANK_CONFIG: JankConfig = {
  ...DEFAULT_FORCE_CONFIG,
  spread: 130,
  settleV: 0.3,
  maxTicks: 600,
};

export function createJANK(config: JankConfig): LayoutAlgorithm {
  return {
    id: "JANK",
    name: "JANK",
    preservesPositions: true,
    initNodes(ids, _edges, leafW, leafH, defaults) {
      return initPositions(ids, config.spread, defaults, leafW, leafH);
    },
    tick(nodes, edges, ticks) {
      const next = tickLevel(nodes, edges, config);
      const mv = maxVelocity(next);
      return { nodes: next, settled: mv < config.settleV || ticks >= config.maxTicks };
    },
  };
}
