// ---------------------------------------------------------------------------
// Port geometry — compute port positions on node boundaries
//
// Geometry computation is provided by @marlinspike/canvas.
// This module re-exports with the PortPosition interface (uses `portName`)
// and adds `resolveNodePorts` which depends on @marlinspike/graph.
// ---------------------------------------------------------------------------

import { isRef, type Port, type TreeNode } from "@marlinspike/graph";
import {
  type CanvasPort,
  circlePortPositions as circlePortPositions_,
  rectPortPositions as rectPortPositions_,
} from "@marlinspike/canvas";

// ---------------------------------------------------------------------------
// PortPosition — the computed position of a single port on a node boundary
// ---------------------------------------------------------------------------

export interface PortPosition {
  portName: string;
  direction: Port["direction"];
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

/** Convert CanvasPort (name) to PortPosition (portName) */
function toPortPosition(cp: CanvasPort): PortPosition {
  return {
    portName: cp.name,
    direction: cp.direction,
    type: cp.type,
    x: cp.x,
    y: cp.y,
    nx: cp.nx,
    ny: cp.ny,
  };
}

// ---------------------------------------------------------------------------
// Port resolution — resolve effective ports for a node
// ---------------------------------------------------------------------------

/**
 * Returns the effective ports for a node. If the node has its own ports, those
 * are returned. For ref nodes without ports, the target's ports are resolved.
 */
export function resolveNodePorts(
  node: TreeNode,
  treeNodes: TreeNode[],
): Port[] {
  if (node.ports && node.ports.length > 0) return node.ports;
  if (isRef(node) && node.ref) {
    const target = treeNodes.flatMap(function flat(n: TreeNode): TreeNode[] {
      return [n, ...n.children.flatMap(flat)];
    }).find((n) => n.label === node.ref);
    return target?.ports ?? [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Circle node port positions (delegates to @marlinspike/canvas)
// ---------------------------------------------------------------------------

export function circlePortPositions(
  ports: readonly Port[],
  radius: number,
): PortPosition[] {
  return circlePortPositions_(ports, radius).map(toPortPosition);
}

// ---------------------------------------------------------------------------
// Rectangle node port positions (delegates to @marlinspike/canvas)
// ---------------------------------------------------------------------------

export function rectPortPositions(
  ports: readonly Port[],
  halfW: number,
  halfH: number,
  labelH: number,
): PortPosition[] {
  return rectPortPositions_(ports, halfW, halfH, labelH).map(toPortPosition);
}
