// ---------------------------------------------------------------------------
// FIELD layout algorithm — SDF with directional flow field
//
// Extends SDF by applying a directional force based on each node's topological
// charge. Nodes with charge -1 (sources) are pushed leftward ("against" the
// field), nodes with charge +1 (sinks) are pushed rightward ("with" the field).
//
// The field direction is (1, 0) for now (North = right, left-to-right flow).
// A future compass widget will allow arbitrary rotation.
// ---------------------------------------------------------------------------

import type { LayoutAlgorithm } from "../types.ts";
import { initPositions, maxVelocity } from "../force.ts";
import { applyAnchorForces, type SdfPhysicsConfig, tickSdfLevel } from "../sdf-force.ts";

// ---------------------------------------------------------------------------
// FieldConfig
// ---------------------------------------------------------------------------

export interface FieldConfig extends SdfPhysicsConfig {
  /** Initial circular spread radius for new nodes */
  spread: number;
  /** Max velocity below which a level is considered settled */
  settleV: number;
  /** Maximum ticks before force-settling */
  maxTicks: number;
  /** Strength of the directional field force per unit charge */
  fieldStrength: number;
  /** Field direction vector [dx, dy] (unit vector). Default: [1, 0] = rightward. */
  fieldDirection: [number, number];
  /** Spring constant for port anchor forces (0 = disabled) */
  anchorK: number;
  /** Ticks over which anchor force ramps from 0 to anchorK */
  anchorRampTicks: number;
}

export const DEFAULT_FIELD_CONFIG: FieldConfig = {
  // SDF physics (same as SDF defaults)
  repulsionStrength: 30,
  restGap: 8,
  maxRepulsionDist: 60,
  sdfGradientEps: 0.5,
  springK: 0.04,
  springRestLength: 80,
  edgeClearance: 30,
  edgeRepulsionK: 5,
  componentRepulsionK: 20,
  damping: 0.80,
  maxVelocity: 20,
  circleThreshold: 0.05,
  // Lifecycle
  spread: 130,
  settleV: 0.3,
  maxTicks: 800,
  // Field
  fieldStrength: 3,
  fieldDirection: [1, 0],
  // Port anchors
  anchorK: 0.1,
  anchorRampTicks: 50,
};

// ---------------------------------------------------------------------------
// createFIELD — factory
// ---------------------------------------------------------------------------

export function createFIELD(config: FieldConfig): LayoutAlgorithm {
  return {
    id: "FIELD",
    name: "FIELD",
    preservesPositions: true,
    initNodes(ids, _edges, leafW, leafH, defaults) {
      return initPositions(ids, config.spread, defaults, leafW, leafH);
    },
    tick(nodes, edges, ticks) {
      // Run all SDF forces (repulsion, springs, edge clearance, components)
      const afterSdf = tickSdfLevel(nodes, edges, config);

      // Apply directional field force based on charge
      const [fx, fy] = config.fieldDirection;
      const strength = config.fieldStrength;
      const afterField = afterSdf.map((n) => {
        if (n.pinned || n.charge === undefined) return n;
        return {
          ...n,
          vx: n.vx + fx * strength * n.charge,
          vy: n.vy + fy * strength * n.charge,
        };
      });

      // Apply port anchor springs (ramps up over time)
      const result = applyAnchorForces(afterField, ticks, config.anchorK, config.anchorRampTicks);

      const mv = maxVelocity(result);
      return {
        nodes: result,
        settled: mv < config.settleV || ticks >= config.maxTicks,
      };
    },
  };
}
