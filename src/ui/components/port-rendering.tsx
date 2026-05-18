/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
// ---------------------------------------------------------------------------
// Port rendering — SVG elements for port indicators on canvas nodes
// ---------------------------------------------------------------------------

import type { PortPosition } from "@marlinspike/layout";

const PORT_R = 4;

const DIR_COLORS: Record<string, string> = {
  in: "#4080c0",
  out: "#c06040",
  inout: "#80a040",
};

/**
 * Render port indicator dots on a node boundary.
 * All positions are relative to the node center (caller wraps in a <g> with transform).
 */
export function NodePorts(
  { ports, showLabels }: { ports: PortPosition[]; showLabels: boolean },
) {
  if (ports.length === 0) return null;
  return (
    <>
      {ports.map((p) => {
        const fill = DIR_COLORS[p.direction] ?? "#666";
        const label = p.type ? `${p.portName}: ${p.type}` : p.portName;
        return (
          <g key={p.portName}>
            <circle
              cx={p.x}
              cy={p.y}
              r={PORT_R}
              fill={fill}
              stroke="#10102a"
              stroke-width={1.5}
              style="pointer-events: all;"
            >
              <title>{label}</title>
            </circle>
            {showLabels && (
              <text
                x={p.x + (p.nx > 0 ? PORT_R + 3 : -(PORT_R + 3))}
                y={p.y + 3}
                fill="#606080"
                font-size={9}
                text-anchor={p.nx > 0 ? "start" : "end"}
                style="pointer-events: none; user-select: none;"
              >
                {p.portName}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}
