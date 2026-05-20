/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import type {
  BodyStyle,
  CanvasNode,
  CanvasScene,
  CanvasTheme,
  NodeGeometry,
  NodeStyle,
  ResolvedNode,
} from "@marlinspike/canvas";
import {
  agentTheme,
  CIRCLE_GEOMETRY,
  containerFlowTheme,
  marlinTheme,
  RECT_GEOMETRY,
  renderScene,
  renderWith,
  shenzhenTheme,
  surfacePoint,
  svgRenderer,
  transitTheme,
} from "@marlinspike/canvas";
import type { CanvasPort } from "@marlinspike/canvas";
import type { PortDescriptor } from "@marlinspike/canvas";
import type { Point } from "@marlinspike/canvas";
import type { RenderPrimitive } from "@marlinspike/canvas";
import type { ThemeDefinition } from "@marlinspike/theme";
import { resolveGeometryFromProps, resolveProps } from "@marlinspike/theme";

export const meta = {
  title: "Package: @marlinspike-theme",
  url: "https://github.com/visual-systems/marlinspike/blob/main/packages/theme/README.md",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SECTION = "margin-bottom:32px;";
const HEADING = "font-size:16px; font-weight:bold; margin-bottom:4px; color:#c0c0e0;";
const SUBHEADING = "font-size:13px; font-weight:600; margin-bottom:6px; color:#a0a0d0;";
const DESCRIPTION =
  "font-size:12px; color:#888; margin-bottom:12px; line-height:1.6; max-width:720px;";
const CALLOUT =
  "background:#1a1a30; border-left:3px solid #5a5a8a; padding:8px 12px; font-size:11px; color:#a0a0c0; margin-bottom:12px; line-height:1.5;";
const TAG =
  "display:inline-block; background:#2a2a4a; color:#9090c0; padding:1px 6px; border-radius:3px; font-size:10px; font-family:monospace; margin-right:4px;";
const PRE =
  "background:#0f0f22; padding:12px; border-radius:4px; font-size:12px; line-height:1.5; overflow:auto; max-height:500px; white-space:pre-wrap; font-family:monospace;";

// ---------------------------------------------------------------------------
// Helper: render scene to SVG HTML
// ---------------------------------------------------------------------------

function renderSvg<S>(
  scene: CanvasScene<S>,
  theme: CanvasTheme<S>,
  w: number,
  h: number,
  viewBox?: string,
): string {
  const group = renderScene(scene, theme);
  const [svgContent] = renderWith(svgRenderer, group);
  const vb = viewBox ? ` viewBox="${viewBox}"` : "";
  return `<svg width="${w}" height="${h}"${vb} style="background:${theme.background}; border-radius:4px;">${svgContent}</svg>`;
}

/** Compute a viewBox string that contains all nodes with padding. */
function sceneBounds(scene: CanvasScene, pad = 20): string {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of scene.nodes) {
    x0 = Math.min(x0, n.x - n.w / 2);
    y0 = Math.min(y0, n.y - n.h / 2);
    x1 = Math.max(x1, n.x + n.w / 2);
    y1 = Math.max(y1, n.y + n.h / 2);
  }
  return `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
}

// ---------------------------------------------------------------------------
// Bundled themes for gallery
// ---------------------------------------------------------------------------

const BUNDLED_THEMES: { name: string; theme: CanvasTheme<unknown> }[] = [
  { name: "marlin", theme: marlinTheme },
  { name: "containerFlow", theme: containerFlowTheme },
  { name: "shenzhen", theme: shenzhenTheme },
  { name: "transit", theme: transitTheme },
  { name: "agent", theme: agentTheme },
];

// ---------------------------------------------------------------------------
// Story: ResolveNode — theme-controlled geometry + style
// ---------------------------------------------------------------------------

interface RoleState {
  role: "primary" | "secondary" | "accent";
}

function makeRoleTheme(): CanvasTheme<RoleState> {
  const fallbackStyle: NodeStyle = {
    fill: "#111",
    stroke: "#333",
    strokeWidth: 1,
    labelFill: "#888",
    labelFont: "sans-serif",
    labelSize: 9,
  };

  return {
    node: () => fallbackStyle,
    edge: (e) => ({
      stroke: e.selected ? "#5070c0" : "#2a2a50",
      strokeWidth: e.selected ? 2 : 1,
      arrowSize: 10,
      labelFill: "#556",
      labelFont: "sans-serif",
      labelSize: 10,
    }),
    port: (p) => ({
      fill: p.direction === "out" ? "#cc8844" : "#6688cc",
      stroke: "none",
      radius: 3,
    }),
    background: "#0d0d1e",

    // resolveNode controls both geometry and style based on role
    resolveNode: (node: CanvasNode<RoleState>): ResolvedNode => {
      const role = node.state?.role ?? "primary";

      if (role === "secondary") {
        return {
          geometry: RECT_GEOMETRY,
          style: {
            fill: node.selected ? "#1e3a2a" : "#0f2820",
            stroke: node.selected ? "#40b070" : "#1e5040",
            strokeWidth: node.selected ? 2 : 1,
            labelFill: "#80c0a0",
            labelFont: "sans-serif",
            labelSize: 10,
          },
        };
      }

      if (role === "accent") {
        return {
          geometry: CIRCLE_GEOMETRY,
          style: {
            fill: node.selected ? "#3a1e2a" : "#280f20",
            stroke: node.selected ? "#c050a0" : "#501e40",
            strokeWidth: node.selected ? 2 : 1,
            labelFill: "#c080b0",
            labelFont: "sans-serif",
            labelSize: 9,
          },
        };
      }

      // primary — circle
      return {
        geometry: CIRCLE_GEOMETRY,
        style: {
          fill: node.selected ? "#1e2a4a" : "#111125",
          stroke: node.selected ? "#5070c0" : "#252545",
          strokeWidth: node.selected ? 2 : 1,
          labelFill: "#777799",
          labelFont: "sans-serif",
          labelSize: 9,
        },
      };
    },
  };
}

export function ResolveNode() {
  const theme = makeRoleTheme();

  const scene: CanvasScene<RoleState> = {
    nodes: [
      {
        id: "a",
        x: 80,
        y: 70,
        w: 52,
        h: 52,
        geometry: CIRCLE_GEOMETRY,
        label: "Primary",
        state: { role: "primary" },
      },
      {
        id: "b",
        x: 220,
        y: 70,
        w: 100,
        h: 50,
        geometry: RECT_GEOMETRY,
        label: "Secondary",
        state: { role: "secondary" },
      },
      {
        id: "c",
        x: 380,
        y: 70,
        w: 52,
        h: 52,
        geometry: CIRCLE_GEOMETRY,
        label: "Accent",
        state: { role: "accent" },
      },
      {
        id: "d",
        x: 220,
        y: 170,
        w: 100,
        h: 50,
        geometry: RECT_GEOMETRY,
        label: "Sel. Secondary",
        state: { role: "secondary" },
        selected: true,
      },
    ],
    edges: [
      { id: "e1", fromId: "a", toId: "b" },
      { id: "e2", fromId: "b", toId: "c" },
    ],
  };

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>theme.resolveNode — Role-Based Geometry + Style</div>
        <div style={DESCRIPTION}>
          A <span style={TAG}>CanvasTheme</span> with <span style={TAG}>resolveNode</span>{" "}
          controls both geometry and style in a single call. The theme decides what shape a node is
          based on its typed state — not hardcoded on the node itself. Here, "secondary" nodes
          render as rectangles while "primary" and "accent" render as circles, each with distinct
          color palettes.
        </div>
        <div
          dangerouslySetInnerHTML={{ __html: renderSvg(scene, theme, 480, 220) }}
        />
        <div style={CALLOUT}>
          <span style={TAG}>resolveNode</span> receives the full{" "}
          <span style={TAG}>{"CanvasNode<RoleState>"}</span> — including{" "}
          <span style={TAG}>state</span>, <span style={TAG}>selected</span>, and{" "}
          <span style={TAG}>highlighted</span>{" "}
          — so it can make dynamic decisions about both geometry and visual properties.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: CustomGeometry — a diamond NodeGeometry
// ---------------------------------------------------------------------------

/** A diamond (rotated square) — demonstrates implementing NodeGeometry. */
const DIAMOND_GEOMETRY: NodeGeometry = {
  renderBody(w: number, h: number, style: BodyStyle): RenderPrimitive[] {
    const hw = w / 2;
    const hh = h / 2;
    return [{
      kind: "polygon" as const,
      points: [
        [0, -hh] as [number, number], // top
        [hw, 0] as [number, number], // right
        [0, hh] as [number, number], // bottom
        [-hw, 0] as [number, number], // left
      ],
      fill: style.fill,
      stroke: style.stroke,
    }];
  },

  surfacePoint(
    cx: number,
    cy: number,
    w: number,
    h: number,
    tx: number,
    ty: number,
    gap: number,
  ): Point {
    // Diamond surface: parametric clipping along direction to target
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    const hw = w / 2;
    const hh = h / 2;
    // Diamond boundary: |x|/hw + |y|/hh = 1
    // Parametric: scale (dx, dy) so it hits the boundary
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    const bx = dx * t;
    const by = dy * t;
    const len = Math.sqrt(bx * bx + by * by);
    const gx = len > 0 ? (bx / len) * gap : 0;
    const gy = len > 0 ? (by / len) * gap : 0;
    return { x: cx + bx + gx, y: cy + by + gy };
  },

  arcClip(
    _arcC: Point,
    _r: number,
    center: Point,
    w: number,
    h: number,
    gap: number,
    _sweep: number,
    other: Point,
  ): Point {
    // Simplified: use surfacePoint fallback for arc clipping
    return this.surfacePoint(center.x, center.y, w, h, other.x, other.y, gap);
  },

  sdf(w: number, h: number): (px: number, py: number) => number {
    const hw = w / 2;
    const hh = h / 2;
    // Diamond SDF: |x|/hw + |y|/hh - 1, scaled to approximate Euclidean distance
    return (px: number, py: number) => {
      const d = Math.abs(px) / hw + Math.abs(py) / hh - 1;
      // Scale by the average half-dimension for reasonable distance units
      return d * (hw + hh) / 2;
    };
  },

  portPositions(
    ports: readonly PortDescriptor[],
    w: number,
    h: number,
    _labelH: number,
  ): CanvasPort[] {
    // Place ports at diamond vertices
    const hw = w / 2;
    const hh = h / 2;
    const positions = [
      { x: -hw, y: 0, nx: -1, ny: 0 }, // left
      { x: hw, y: 0, nx: 1, ny: 0 }, // right
      { x: 0, y: -hh, nx: 0, ny: -1 }, // top
      { x: 0, y: hh, nx: 0, ny: 1 }, // bottom
    ];
    return ports.map((p, i) => ({
      name: p.name,
      direction: p.direction,
      x: positions[i % positions.length].x,
      y: positions[i % positions.length].y,
      nx: positions[i % positions.length].nx,
      ny: positions[i % positions.length].ny,
    }));
  },

  strokeDash(dashed: boolean): string | undefined {
    return dashed ? "6,4" : undefined;
  },
};

export function CustomGeometry() {
  const diamondTheme: CanvasTheme = {
    node: (node) => ({
      fill: node.selected ? "#2a1e4a" : "#1a1035",
      stroke: node.selected ? "#8060c0" : "#4a3080",
      strokeWidth: node.selected ? 2 : 1,
      labelFill: "#a090c0",
      labelFont: "sans-serif",
      labelSize: 9,
    }),
    edge: () => ({
      stroke: "#4a3080",
      strokeWidth: 1,
      arrowSize: 10,
      labelFill: "#556",
      labelFont: "sans-serif",
      labelSize: 10,
    }),
    port: () => ({ fill: "#8060c0", stroke: "none", radius: 3 }),
    background: "#0a0a18",
  };

  const scene: CanvasScene = {
    nodes: [
      {
        id: "d1",
        x: 100,
        y: 100,
        w: 60,
        h: 60,
        geometry: DIAMOND_GEOMETRY,
        label: "Decision",
      },
      {
        id: "c1",
        x: 260,
        y: 60,
        w: 52,
        h: 52,
        geometry: CIRCLE_GEOMETRY,
        label: "Yes",
      },
      {
        id: "c2",
        x: 260,
        y: 140,
        w: 52,
        h: 52,
        geometry: CIRCLE_GEOMETRY,
        label: "No",
      },
      {
        id: "r1",
        x: 400,
        y: 100,
        w: 80,
        h: 40,
        geometry: RECT_GEOMETRY,
        label: "Output",
      },
      {
        id: "d2",
        x: 100,
        y: 220,
        w: 60,
        h: 60,
        geometry: DIAMOND_GEOMETRY,
        label: "Dashed",
        dashed: true,
      },
      {
        id: "d3",
        x: 260,
        y: 220,
        w: 80,
        h: 80,
        geometry: DIAMOND_GEOMETRY,
        label: "Selected",
        selected: true,
      },
    ],
    edges: [
      { id: "e1", fromId: "d1", toId: "c1" },
      { id: "e2", fromId: "d1", toId: "c2" },
      { id: "e3", fromId: "c1", toId: "r1" },
      { id: "e4", fromId: "c2", toId: "r1" },
    ],
  };

  // Also show surfacePoint working with diamond
  const d1 = scene.nodes[0];
  const c1 = scene.nodes[1];
  const sp = surfacePoint(d1, c1, 5);

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>Custom NodeGeometry — Diamond Shape</div>
        <div style={DESCRIPTION}>
          Any shape can be used by implementing the <span style={TAG}>NodeGeometry</span>{" "}
          interface. This diamond shape provides custom rendering (polygon), surface clipping, SDF,
          and port positioning. It works with all canvas features — edges clip correctly at the
          diamond boundary, dashed outlines follow the diamond shape, and hit-testing uses the
          diamond's SDF.
        </div>
        <div
          dangerouslySetInnerHTML={{
            __html: renderSvg(scene, diamondTheme, 500, 280),
          }}
        />
        <div style={CALLOUT}>
          The <span style={TAG}>DIAMOND_GEOMETRY</span> implements all 6 methods:{" "}
          <span style={TAG}>renderBody</span>, <span style={TAG}>surfacePoint</span>,{" "}
          <span style={TAG}>arcClip</span>, <span style={TAG}>sdf</span>,{" "}
          <span style={TAG}>portPositions</span>,{" "}
          <span style={TAG}>strokeDash</span>. Edge clipping uses{" "}
          <span style={TAG}>surfacePoint</span> to find where the edge exits the diamond boundary.
        </div>
        <div style={SUBHEADING}>Surface Point</div>
        <div style={`${PRE}; color:#a0a0c0;`}>
          {`surfacePoint(diamond → circle, gap=5):\n  x: ${sp.x.toFixed(2)}, y: ${sp.y.toFixed(2)}`}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: ThemeDefinition + resolveProps
// ---------------------------------------------------------------------------

export function ThemeResolution() {
  // Define a theme using ThemeDefinition
  const warmTheme: ThemeDefinition = {
    roles: {
      node: {
        geometry: "circle",
        fill: "#2a1a10",
        stroke: "#604020",
        strokeWidth: 1,
        labelFill: "#c0a080",
        labelFont: "sans-serif",
        labelSize: 9,
      },
      container: {
        geometry: "rect",
        fill: "#1a1408",
        stroke: "#403010",
        strokeWidth: 1,
        labelFill: "#a09070",
        labelFont: "sans-serif",
        labelSize: 11,
      },
      highlight: {
        geometry: "circle",
        fill: "#2a2010",
        stroke: "#c09040",
        strokeWidth: 2,
        labelFill: "#e0c080",
        labelFont: "sans-serif",
        labelSize: 9,
      },
    },
    constants: {
      groupPadding: 32,
      labelH: 22,
      leafRadius: 26,
    },
  };

  // Show resolveProps in action
  const baseStyle = resolveProps(warmTheme.roles, "node");
  const overridden = resolveProps(warmTheme.roles, "node", {
    fill: "#ff4040",
    strokeWidth: 3,
  });
  const unknownRole = resolveProps(warmTheme.roles, "unknown-role");
  const unknownWithOverrides = resolveProps(warmTheme.roles, "unknown-role", {
    fill: "#00ff00",
  });

  // Render with the theme definition — wire it into a CanvasTheme
  const canvasTheme: CanvasTheme = {
    node: (node) => {
      const role = node.selected ? "highlight" : "node";
      const props = resolveProps(warmTheme.roles, role);
      return {
        fill: props.fill!,
        stroke: props.stroke!,
        strokeWidth: props.strokeWidth!,
        labelFill: props.labelFill!,
        labelFont: props.labelFont!,
        labelSize: props.labelSize!,
      };
    },
    edge: () => ({
      stroke: "#604020",
      strokeWidth: 1,
      arrowSize: 10,
      labelFill: "#806040",
      labelFont: "sans-serif",
      labelSize: 10,
    }),
    port: () => ({ fill: "#c09040", stroke: "none", radius: 3 }),
    background: "#0d0a06",
    resolveNode: (node) => {
      const role = node.selected ? "highlight" : "node";
      const props = resolveProps(warmTheme.roles, role);
      const geometry = resolveGeometryFromProps(props.geometry);
      return {
        geometry,
        style: {
          fill: props.fill!,
          stroke: props.stroke!,
          strokeWidth: props.strokeWidth!,
          labelFill: props.labelFill!,
          labelFont: props.labelFont!,
          labelSize: props.labelSize!,
        },
      };
    },
  };

  const scene: CanvasScene = {
    nodes: [
      { id: "a", x: 80, y: 70, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Node A" },
      { id: "b", x: 220, y: 70, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Node B" },
      {
        id: "c",
        x: 360,
        y: 70,
        w: 52,
        h: 52,
        geometry: CIRCLE_GEOMETRY,
        label: "Selected",
        selected: true,
      },
    ],
    edges: [
      { id: "e1", fromId: "a", toId: "b" },
      { id: "e2", fromId: "b", toId: "c" },
    ],
  };

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif;">
      <div style={SECTION}>
        <div style={HEADING}>ThemeDefinition + resolveProps</div>
        <div style={DESCRIPTION}>
          The <span style={TAG}>@marlinspike/theme</span> package provides{" "}
          <span style={TAG}>ThemeDefinition</span> (pure data: role→style mappings + constants) and
          {" "}
          <span style={TAG}>resolveProps</span>{" "}
          (sparse merge of per-element overrides over role defaults). These wire into a{" "}
          <span style={TAG}>CanvasTheme</span> to drive rendering.
        </div>

        <div style={SUBHEADING}>Warm Theme (3 roles: node, container, highlight)</div>
        <div
          dangerouslySetInnerHTML={{ __html: renderSvg(scene, canvasTheme, 440, 140) }}
        />

        <div style={SUBHEADING}>resolveProps — Merge Behavior</div>
        <div style={`${PRE}; color:#a0a0c0;`}>
          {`// Base role defaults
resolveProps(roles, "node")
→ ${JSON.stringify(baseStyle, null, 2)}

// Sparse override: fill and strokeWidth changed, rest preserved
resolveProps(roles, "node", { fill: "#ff4040", strokeWidth: 3 })
→ ${JSON.stringify(overridden, null, 2)}

// Unknown role, no overrides → empty
resolveProps(roles, "unknown-role")
→ ${JSON.stringify(unknownRole)}

// Unknown role with overrides → overrides only
resolveProps(roles, "unknown-role", { fill: "#00ff00" })
→ ${JSON.stringify(unknownWithOverrides)}`}
        </div>

        <div style={CALLOUT}>
          <span style={TAG}>ThemeDefinition</span> is pure data — the <span style={TAG}>roles</span>
          {" "}
          map and <span style={TAG}>constants</span>. <span style={TAG}>resolveProps</span>{" "}
          handles the merge logic. Interaction-dependent styles (hover, selection) are computed in
          the <span style={TAG}>CanvasTheme</span>{" "}
          wiring — they stay as functions, not declarative data, because they depend on transient
          state.
        </div>

        <div style={SUBHEADING}>Geometry Resolution</div>
        <div style={`${PRE}; color:#a0a0c0;`}>
          {`resolveGeometryFromProps("circle") → CIRCLE_GEOMETRY
resolveGeometryFromProps("rect")   → RECT_GEOMETRY
resolveGeometryFromProps(undefined) → CIRCLE_GEOMETRY (default)
resolveGeometryFromProps("hexagon") → CIRCLE_GEOMETRY (unknown → default)`}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story: Gallery — theme comparison matrix
// ---------------------------------------------------------------------------

const GALLERY_SCENARIOS: { name: string; scene: CanvasScene }[] = [
  {
    name: "States",
    scene: {
      nodes: [
        { id: "n", x: 60, y: 80, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Normal" },
        {
          id: "s",
          x: 180,
          y: 80,
          w: 52,
          h: 52,
          geometry: CIRCLE_GEOMETRY,
          label: "Selected",
          selected: true,
        },
        {
          id: "h",
          x: 300,
          y: 80,
          w: 52,
          h: 52,
          geometry: CIRCLE_GEOMETRY,
          label: "Highlighted",
          highlighted: true,
        },
        {
          id: "d",
          x: 420,
          y: 80,
          w: 52,
          h: 52,
          geometry: CIRCLE_GEOMETRY,
          label: "Dashed",
          dashed: true,
        },
      ],
      edges: [
        { id: "e1", fromId: "n", toId: "s" },
        { id: "e2", fromId: "s", toId: "h" },
        { id: "e3", fromId: "h", toId: "d" },
      ],
    },
  },
  {
    name: "Mixed shapes",
    scene: {
      nodes: [
        { id: "a", x: 80, y: 80, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Input" },
        {
          id: "b",
          x: 240,
          y: 60,
          w: 100,
          h: 50,
          geometry: RECT_GEOMETRY,
          label: "Process",
          selected: true,
        },
        { id: "c", x: 240, y: 150, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "Filter" },
        {
          id: "d",
          x: 420,
          y: 100,
          w: 100,
          h: 50,
          geometry: RECT_GEOMETRY,
          label: "Output",
          highlighted: true,
        },
      ],
      edges: [
        { id: "e1", fromId: "a", toId: "b", label: "data" },
        { id: "e2", fromId: "a", toId: "c" },
        { id: "e3", fromId: "b", toId: "d" },
        { id: "e4", fromId: "c", toId: "d" },
      ],
    },
  },
  {
    name: "Fan-out",
    scene: {
      nodes: [
        {
          id: "hub",
          x: 100,
          y: 120,
          w: 80,
          h: 40,
          geometry: RECT_GEOMETRY,
          label: "Hub",
          selected: true,
        },
        { id: "t1", x: 320, y: 40, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "A" },
        { id: "t2", x: 320, y: 120, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "B" },
        {
          id: "t3",
          x: 320,
          y: 200,
          w: 52,
          h: 52,
          geometry: CIRCLE_GEOMETRY,
          label: "C",
          highlighted: true,
        },
        {
          id: "sink",
          x: 460,
          y: 120,
          w: 52,
          h: 52,
          geometry: CIRCLE_GEOMETRY,
          label: "Sink",
          dashed: true,
        },
      ],
      edges: [
        { id: "e1", fromId: "hub", toId: "t1" },
        { id: "e2", fromId: "hub", toId: "t2" },
        { id: "e3", fromId: "hub", toId: "t3" },
        { id: "e4", fromId: "t1", toId: "sink" },
        { id: "e5", fromId: "t2", toId: "sink" },
        { id: "e6", fromId: "t3", toId: "sink" },
      ],
    },
  },
  {
    name: "Chain",
    scene: {
      nodes: [
        { id: "c1", x: 60, y: 50, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "1" },
        {
          id: "c2",
          x: 180,
          y: 140,
          w: 80,
          h: 40,
          geometry: RECT_GEOMETRY,
          label: "2",
          selected: true,
        },
        { id: "c3", x: 320, y: 50, w: 52, h: 52, geometry: CIRCLE_GEOMETRY, label: "3" },
        {
          id: "c4",
          x: 440,
          y: 140,
          w: 80,
          h: 40,
          geometry: RECT_GEOMETRY,
          label: "4",
          highlighted: true,
        },
      ],
      edges: [
        { id: "e1", fromId: "c1", toId: "c2" },
        { id: "e2", fromId: "c2", toId: "c3" },
        { id: "e3", fromId: "c3", toId: "c4" },
      ],
    },
  },
  {
    name: "Dense",
    scene: {
      nodes: [
        { id: "a", x: 80, y: 60, w: 44, h: 44, geometry: CIRCLE_GEOMETRY, label: "A" },
        {
          id: "b",
          x: 200,
          y: 40,
          w: 44,
          h: 44,
          geometry: CIRCLE_GEOMETRY,
          label: "B",
          selected: true,
        },
        { id: "c", x: 320, y: 60, w: 44, h: 44, geometry: CIRCLE_GEOMETRY, label: "C" },
        {
          id: "d",
          x: 140,
          y: 150,
          w: 72,
          h: 36,
          geometry: RECT_GEOMETRY,
          label: "D",
          highlighted: true,
        },
        { id: "e", x: 280, y: 150, w: 72, h: 36, geometry: RECT_GEOMETRY, label: "E" },
        {
          id: "f",
          x: 420,
          y: 100,
          w: 44,
          h: 44,
          geometry: CIRCLE_GEOMETRY,
          label: "F",
          dashed: true,
        },
      ],
      edges: [
        { id: "e1", fromId: "a", toId: "b" },
        { id: "e2", fromId: "b", toId: "c" },
        { id: "e3", fromId: "a", toId: "d" },
        { id: "e4", fromId: "b", toId: "d" },
        { id: "e5", fromId: "b", toId: "e" },
        { id: "e6", fromId: "c", toId: "e" },
        { id: "e7", fromId: "c", toId: "f" },
        { id: "e8", fromId: "d", toId: "e" },
        { id: "e9", fromId: "e", toId: "f" },
      ],
    },
  },
];

export function Gallery() {
  const [expanded, setExpanded] = useState<
    { theme: number; scenario: number } | null
  >(null);

  const expandedTheme = expanded ? BUNDLED_THEMES[expanded.theme] : null;
  const expandedScenario = expanded ? GALLERY_SCENARIOS[expanded.scenario] : null;

  return (
    <div style="padding:16px; color:#c0c0e0; font-family:sans-serif; position:relative;">
      <div style={HEADING}>Bundled Theme Gallery</div>
      <div style={DESCRIPTION}>
        Each column is a scenario, each row is a bundled canvas theme. Click any cell to expand.
        Themes with angular edge routing (containerFlow, shenzhen, transit) show constrained-angle
        paths.
      </div>

      {/* Column headers */}
      <div style="display:grid; grid-template-columns:90px repeat(5, 1fr); gap:1px; margin-bottom:1px;">
        <div />
        {GALLERY_SCENARIOS.map((s) => (
          <div
            key={s.name}
            style="font-size:10px; color:#888; text-align:center; padding:2px 0;"
          >
            {s.name}
          </div>
        ))}
      </div>

      {/* Matrix */}
      {BUNDLED_THEMES.map((t, ti) => (
        <div
          key={t.name}
          style="display:grid; grid-template-columns:90px repeat(5, 1fr); gap:1px; margin-bottom:1px;"
        >
          <div style="font-size:11px; color:#a0a0d0; font-family:monospace; display:flex; align-items:center;">
            {t.name}
          </div>
          {GALLERY_SCENARIOS.map((s, si) => (
            <div
              key={s.name}
              style={`cursor:pointer; border-radius:2px; overflow:hidden; opacity:${
                expanded?.theme === ti && expanded?.scenario === si ? "0.7" : "1"
              };`}
              onClick={() =>
                setExpanded(
                  expanded?.theme === ti && expanded?.scenario === si
                    ? null
                    : { theme: ti, scenario: si },
                )}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: renderSvg(s.scene, t.theme, 100, 100, sceneBounds(s.scene))
                    .replace(`width="100"`, `width="100%"`)
                    .replace(`height="100"`, ""),
                }}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Expanded modal */}
      {expanded && expandedTheme && expandedScenario && (
        <div
          style="position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; padding:24px;"
          onClick={() => setExpanded(null)}
        >
          <div
            style="background:#1a1a2e; border:1px solid #3a3a5a; border-radius:8px; padding:16px; width:90vw; max-width:900px;"
            onClick={(e: Event) => e.stopPropagation()}
          >
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div>
                <span style="font-size:13px; font-weight:600; color:#a0a0d0; font-family:monospace;">
                  {expandedTheme.name}
                </span>
                <span style="font-size:11px; color:#666; margin-left:8px;">
                  {expandedScenario.name}
                </span>
              </div>
              <div
                style="cursor:pointer; color:#888; font-size:16px; padding:0 4px;"
                onClick={() => setExpanded(null)}
              >
                x
              </div>
            </div>
            <div
              dangerouslySetInnerHTML={{
                __html: renderSvg(
                  expandedScenario.scene,
                  expandedTheme.theme,
                  100,
                  100,
                  sceneBounds(expandedScenario.scene),
                )
                  .replace(`width="100"`, `width="100%"`)
                  .replace(`height="100"`, ""),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
