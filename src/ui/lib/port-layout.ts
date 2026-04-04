// ---------------------------------------------------------------------------
// Port geometry — compute port positions on node boundaries
//
// All positions are relative to node center (0, 0).
// Convention: input ports on the left, output ports on the right.
// ---------------------------------------------------------------------------

import type { Port } from "../workspace.ts";

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

// ---------------------------------------------------------------------------
// Circle node port positions
// ---------------------------------------------------------------------------

/**
 * Compute port positions for a collapsed circle node.
 * Input ports are spread evenly along the left semicircle (π/2 to 3π/2).
 * Output ports are spread evenly along the right semicircle (-π/2 to π/2).
 * Inout ports are placed on the left semicircle alongside inputs.
 */
export function circlePortPositions(
  ports: readonly Port[],
  radius: number,
): PortPosition[] {
  const inPorts = ports.filter((p) => p.direction === "in" || p.direction === "inout");
  const outPorts = ports.filter((p) => p.direction === "out");
  const result: PortPosition[] = [];

  // Left semicircle: angles from π/2 (top-left) to 3π/2 (bottom-left)
  spreadOnArc(inPorts, radius, Math.PI / 2, (3 * Math.PI) / 2, result);
  // Right semicircle: angles from -π/2 (bottom-right) to π/2 (top-right)
  spreadOnArc(outPorts, radius, -Math.PI / 2, Math.PI / 2, result);

  return result;
}

function spreadOnArc(
  ports: Port[],
  radius: number,
  startAngle: number,
  endAngle: number,
  out: PortPosition[],
): void {
  if (ports.length === 0) return;
  const n = ports.length;
  for (let i = 0; i < n; i++) {
    // Evenly distribute with padding from arc endpoints so ports stay in the interior
    const t = (i + 0.5) / n;
    const angle = startAngle + t * (endAngle - startAngle);
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    out.push({
      portName: ports[i].name,
      direction: ports[i].direction,
      type: ports[i].type,
      x,
      y,
      nx: Math.cos(angle),
      ny: Math.sin(angle),
    });
  }
}

// ---------------------------------------------------------------------------
// Rectangle node port positions
// ---------------------------------------------------------------------------

/**
 * Compute port positions for an expanded rectangle node.
 * Input ports are spaced vertically along the left edge.
 * Output ports are spaced vertically along the right edge.
 * Inout ports are placed on the left edge alongside inputs.
 * Positions start below the label strip.
 */
export function rectPortPositions(
  ports: readonly Port[],
  halfW: number,
  halfH: number,
  labelH: number,
): PortPosition[] {
  const inPorts = ports.filter((p) => p.direction === "in" || p.direction === "inout");
  const outPorts = ports.filter((p) => p.direction === "out");
  const result: PortPosition[] = [];

  // Usable vertical range: from top of content area to bottom
  const topY = -halfH + labelH;
  const bottomY = halfH;

  spreadOnEdge(inPorts, -halfW, topY, bottomY, -1, 0, result);
  spreadOnEdge(outPorts, halfW, topY, bottomY, 1, 0, result);

  return result;
}

function spreadOnEdge(
  ports: Port[],
  x: number,
  topY: number,
  bottomY: number,
  nx: number,
  ny: number,
  out: PortPosition[],
): void {
  if (ports.length === 0) return;
  const n = ports.length;
  const span = bottomY - topY;
  for (let i = 0; i < n; i++) {
    // Evenly distribute with padding from edges
    const t = n === 1 ? 0.5 : (i + 0.5) / n;
    const y = topY + t * span;
    out.push({
      portName: ports[i].name,
      direction: ports[i].direction,
      type: ports[i].type,
      x,
      y,
      nx,
      ny,
    });
  }
}
