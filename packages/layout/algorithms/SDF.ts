// ---------------------------------------------------------------------------
// SDF layout algorithm — geometry-aware force layout using signed-distance fields
// ---------------------------------------------------------------------------

import type { LayoutAlgorithm } from "../types.ts";
import { maxVelocity } from "../force.ts";
import { applyAnchorForces, type SdfPhysicsConfig, tickSdfLevel } from "../sdf-force.ts";
import { topoGridLayout } from "../topo-grid.ts";

// ---------------------------------------------------------------------------
// SdfConfig
// ---------------------------------------------------------------------------

export interface SdfConfig extends SdfPhysicsConfig {
  /** Initial circular spread radius for new nodes */
  spread: number;
  /** Max velocity below which a level is considered settled */
  settleV: number;
  /** Maximum ticks before force-settling */
  maxTicks: number;
  /** Spring constant for port anchor forces (0 = disabled) */
  anchorK: number;
  /** Ticks over which anchor force ramps from 0 to anchorK */
  anchorRampTicks: number;
}

export const DEFAULT_SDF_CONFIG: SdfConfig = {
  // Node-node repulsion
  repulsionStrength: 30,
  restGap: 8,
  maxRepulsionDist: 60,
  sdfGradientEps: 0.5,
  // Edge springs
  springK: 0.04,
  // springRestLength is surface-to-surface, not center-to-center.
  // For leaf circles (r=26 each), C2C 160 ≈ S2S 108. Use 80 for a compact layout.
  springRestLength: 80,
  // Inter-component cohesion
  componentRepulsionK: 20,
  // Integration
  damping: 0.80,
  maxVelocity: 20,
  // Shape detection
  circleThreshold: 0.05,
  // Lifecycle
  spread: 130,
  settleV: 0.3,
  maxTicks: 800,
  // Port anchors
  anchorK: 0.1,
  anchorRampTicks: 50,
};

// ---------------------------------------------------------------------------
// createSDF — factory
// ---------------------------------------------------------------------------

export function createSDF(config: SdfConfig): LayoutAlgorithm {
  return {
    id: "SDF",
    name: "SDF",
    preservesPositions: true,
    initNodes(ids, edges, leafW, leafH, defaults) {
      // Seed from topological grid so nodes start in roughly the right
      // topological order, avoiding local minima in the force simulation.
      const topo = topoGridLayout(ids, edges, leafW, leafH, config.spread * 1.5, config.spread);
      return topo.map((n) => {
        const d = defaults.get(n.id);
        if (d) return { ...n, x: d.x, y: d.y, pinned: d.pinned ?? false };
        return n;
      });
    },
    tick(nodes, edges, ticks) {
      const afterSdf = tickSdfLevel(nodes, edges, config);
      const next = applyAnchorForces(afterSdf, ticks, config.anchorK, config.anchorRampTicks);
      const mv = maxVelocity(next);
      return {
        nodes: next,
        settled: mv < config.settleV || ticks >= config.maxTicks,
      };
    },
  };
}
