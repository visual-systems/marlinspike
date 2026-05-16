/**
 * Port geometry — compute port positions on node boundaries.
 *
 * All positions are relative to node center (0, 0).
 * Convention: input ports on the left, output ports on the right.
 */

import type { CanvasPort } from "../scene/types.ts";

/** Minimal port descriptor for position computation (direction + name). */
export interface PortDescriptor {
  name: string;
  direction: "in" | "out" | "inout";
  type?: string;
}

/**
 * Compute port positions for a circle node.
 * Input/inout ports spread along the left semicircle (π/2 to 3π/2).
 * Output ports spread along the right semicircle (-π/2 to π/2).
 */
export function circlePortPositions(
  ports: readonly PortDescriptor[],
  radius: number,
): CanvasPort[] {
  const inPorts = ports.filter((p) => p.direction === "in" || p.direction === "inout");
  const outPorts = ports.filter((p) => p.direction === "out");
  const result: CanvasPort[] = [];

  spreadOnArc(inPorts, radius, Math.PI / 2, (3 * Math.PI) / 2, result);
  spreadOnArc(outPorts, radius, -Math.PI / 2, Math.PI / 2, result);

  return result;
}

function spreadOnArc(
  ports: PortDescriptor[],
  radius: number,
  startAngle: number,
  endAngle: number,
  out: CanvasPort[],
): void {
  if (ports.length === 0) return;
  const n = ports.length;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const angle = startAngle + t * (endAngle - startAngle);
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    out.push({
      name: ports[i].name,
      direction: ports[i].direction,
      type: ports[i].type,
      x,
      y,
      nx: Math.cos(angle),
      ny: Math.sin(angle),
    });
  }
}

/**
 * Compute port positions for a rectangle node.
 * Input/inout ports spaced vertically along the left edge.
 * Output ports spaced vertically along the right edge.
 * Positions start below the label strip.
 */
export function rectPortPositions(
  ports: readonly PortDescriptor[],
  halfW: number,
  halfH: number,
  labelH: number,
): CanvasPort[] {
  const inPorts = ports.filter((p) => p.direction === "in" || p.direction === "inout");
  const outPorts = ports.filter((p) => p.direction === "out");
  const result: CanvasPort[] = [];

  const topY = -halfH + labelH;
  const bottomY = halfH;

  spreadOnEdge(inPorts, -halfW, topY, bottomY, -1, 0, result);
  spreadOnEdge(outPorts, halfW, topY, bottomY, 1, 0, result);

  return result;
}

function spreadOnEdge(
  ports: PortDescriptor[],
  x: number,
  topY: number,
  bottomY: number,
  nx: number,
  ny: number,
  out: CanvasPort[],
): void {
  if (ports.length === 0) return;
  const n = ports.length;
  const span = bottomY - topY;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : (i + 0.5) / n;
    const y = topY + t * span;
    out.push({
      name: ports[i].name,
      direction: ports[i].direction,
      type: ports[i].type,
      x,
      y,
      nx,
      ny,
    });
  }
}
