// ---------------------------------------------------------------------------
// PORT layout algorithm — LTR topogrid init + SDF with directional flow field
//
// Designed for port-aware edge routing: nodes are placed left-to-right by
// topological layer so that edges flow in the same direction as ports
// (inputs on left, outputs on right). After deterministic LTR initialisation,
// SDF forces + a directional field refine positions while preserving the
// left-to-right ordering.
// ---------------------------------------------------------------------------

import type { LayoutAlgorithm } from "../types.ts";
import type { FieldConfig } from "./FIELD.ts";
import { DEFAULT_FIELD_CONFIG } from "./FIELD.ts";
import { maxVelocity } from "../force.ts";
import { applyAnchorForces, tickSdfLevel } from "../sdf-force.ts";
import { topoGridLayoutLTR } from "../topo-grid.ts";

// ---------------------------------------------------------------------------
// PortConfig
// ---------------------------------------------------------------------------

export interface PortConfig extends FieldConfig {
  /** LTR topogrid horizontal spacing (centre-to-centre) */
  ltrHSpacing: number;
  /** LTR topogrid vertical spacing (centre-to-centre) */
  ltrVSpacing: number;
}

export const DEFAULT_PORT_CONFIG: PortConfig = {
  ...DEFAULT_FIELD_CONFIG,
  // Wider gaps so port dots and labels don't overlap
  restGap: 20,
  springRestLength: 140,
  maxRepulsionDist: 100,
  edgeClearance: 50,
  // Stronger field to maintain LTR ordering against SDF forces
  fieldStrength: 5,
  // LTR topogrid spacing
  ltrHSpacing: 220,
  ltrVSpacing: 120,
};

// ---------------------------------------------------------------------------
// createPORT — factory
// ---------------------------------------------------------------------------

export function createPORT(config: PortConfig): LayoutAlgorithm {
  return {
    id: "PORT",
    name: "PORT",
    preservesPositions: false,
    initNodes(ids, edges, leafW, leafH, _defaults) {
      return topoGridLayoutLTR(
        ids,
        edges,
        leafW,
        leafH,
        config.ltrHSpacing,
        config.ltrVSpacing,
      );
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
      const result = applyAnchorForces(
        afterField,
        ticks,
        config.anchorK,
        config.anchorRampTicks,
      );

      const mv = maxVelocity(result);
      return {
        nodes: result,
        settled: mv < config.settleV || ticks >= config.maxTicks,
      };
    },
  };
}
