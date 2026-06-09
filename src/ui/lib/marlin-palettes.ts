/**
 * Marlinspike theme palettes — pure aesthetic data for each visual theme.
 *
 * Each palette is a MarlinThemePalette constant that, when passed to
 * createMarlinTheme(), produces a full CanvasTheme<MarlinNodeState>.
 *
 * Colors are extracted from the original per-theme implementations.
 */

import { angularRouter, MANHATTAN_ANGLES, TRANSIT_ANGLES } from "@marlinspike/canvas";
import type { MarlinThemePalette, RoleStyles } from "./marlin-theme-palette.ts";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SANS = "sans-serif";
const MONO = "monospace";

// ---------------------------------------------------------------------------
// CLASSIC palette — the original Marlinspike IDE theme
// ---------------------------------------------------------------------------

const CLASSIC_ROLES: RoleStyles = {
  leaf: {
    geometry: "circle",
    fill: "#111125",
    stroke: "#252545",
    strokeWidth: 1,
    labelFill: "#777799",
    labelFont: SANS,
    labelSize: 9,
  },
  container: {
    geometry: "rect",
    fill: "#0f0f28",
    stroke: "#1e1e44",
    strokeWidth: 1,
    labelFill: "transparent",
    labelFont: SANS,
    labelSize: 11,
  },
  "collapsed-subgraph": {
    geometry: "circle",
    fill: "#141430",
    stroke: "#303060",
    strokeWidth: 1,
    labelFill: "#777799",
    labelFont: SANS,
    labelSize: 9,
  },
  ref: {
    geometry: "circle",
    fill: "#141428",
    stroke: "#605080",
    strokeWidth: 1,
    labelFill: "#9080b0",
    labelFont: SANS,
    labelSize: 9,
  },
  "leaf-rect": {
    geometry: "rect",
    fill: "#111125",
    stroke: "#252545",
    strokeWidth: 1,
    labelFill: "#777799",
    labelFont: SANS,
    labelSize: 9,
  },
};

export const CLASSIC_PALETTE: MarlinThemePalette = {
  background: "#0d0d1e",
  roles: CLASSIC_ROLES,
  interaction: {
    selected: { fill: "#1e2a4a", stroke: "#5070c0", strokeWidth: 2, labelFill: "#a0b4e0" },
    highlighted: { stroke: "#50c070", strokeWidth: 1.5 },
    hovered: { fill: "#1e2a4a", stroke: "#6080e0", strokeWidth: 2 },
    edgeSource: { fill: "#1e2a4a", stroke: "#5070c0", strokeWidth: 2 },
    candidate: { stroke: "#3050a0", strokeWidth: 1.5 },
    inactiveOpacity: 0.3,
  },
  diagnostics: {
    error: { fill: "#c04040", stroke: "#c04040", strokeWidth: 1.5 },
    warning: { stroke: "#c08020", strokeWidth: 1.5 },
    errorNodeFill: "#2a1a1a",
    badgeStroke: "#0d0d1e",
  },
  container: {
    refFill: "#0f0f24",
    errorFill: "#1a0f0f",
    labelFill: "#444466",
    selectedLabelFill: "#8090c0",
    errorLabelFill: "#c07070",
    selectedStroke: "#4060b0",
    highlightedStroke: "#50c070",
    refStroke: "#605080",
  },
  portDots: { in: "#6688cc", out: "#cc8844", radius: 3 },
  portNodes: {
    in: { fill: "#101828", stroke: "#4080c0" },
    out: { fill: "#181410", stroke: "#c06040" },
  },
  edges: {
    default: { stroke: "#2a2a50", strokeWidth: 1, arrowSize: 10 },
    selected: { stroke: "#5070c0", strokeWidth: 2 },
    highlighted: { stroke: "#50c070" },
    refDirect: { stroke: "#605080", strokeDash: "4,3", endCap: "dot" },
    refIndirect: { stroke: "#403860", strokeDash: "2,4", opacity: 0.6, endCap: "dot" },
    labelFill: "#556",
    labelFont: SANS,
    labelSize: 10,
  },
  refIndicatorFill: "#605080",
  refLabelFill: "#9080b0",
  childrenBadge: { fill: "#3a3a60", selectedFill: "#6070a0" },
  constants: { groupPadding: 32, labelH: 22, leafRadius: 26 },
};

// ---------------------------------------------------------------------------
// MARLIN palette — same colors as classic, with manhattan routing
// ---------------------------------------------------------------------------

export const MARLIN_PALETTE: MarlinThemePalette = {
  ...CLASSIC_PALETTE,
  edgeRouter: angularRouter(MANHATTAN_ANGLES, 0),
};

// ---------------------------------------------------------------------------
// CONTAINER FLOW palette — dark navy, teal strokes, amber highlights
// ---------------------------------------------------------------------------

const CF_ROLES: RoleStyles = {
  leaf: {
    geometry: "rect",
    fill: "#0d1f2d",
    stroke: "#2a8a8a",
    strokeWidth: 1,
    labelFill: "#5a9a9a",
    labelFont: SANS,
    labelSize: 9,
  },
  container: {
    geometry: "rect",
    fill: "#0d1f2d",
    stroke: "#2a8a8a",
    strokeWidth: 1,
    labelFill: "transparent",
    labelFont: SANS,
    labelSize: 11,
  },
  "collapsed-subgraph": {
    geometry: "rect",
    fill: "#0d1f2d",
    stroke: "#2a8a8a",
    strokeWidth: 1,
    labelFill: "#5a9a9a",
    labelFont: SANS,
    labelSize: 9,
  },
  ref: {
    geometry: "rect",
    fill: "#0a1a28",
    stroke: "#1e6a6a",
    strokeWidth: 1,
    labelFill: "#5a9a9a",
    labelFont: SANS,
    labelSize: 9,
  },
  "leaf-rect": {
    geometry: "rect",
    fill: "#0d1f2d",
    stroke: "#2a8a8a",
    strokeWidth: 1,
    labelFill: "#5a9a9a",
    labelFont: SANS,
    labelSize: 9,
  },
};

export const CONTAINER_FLOW_PALETTE: MarlinThemePalette = {
  background: "#0a1628",
  roles: CF_ROLES,
  interaction: {
    selected: { fill: "#0d1f2d", stroke: "#40c0c0", strokeWidth: 2, labelFill: "#80d0d0" },
    highlighted: { stroke: "#d4a030", strokeWidth: 2 },
    hovered: { fill: "#0d2a3d", stroke: "#50d0d0", strokeWidth: 2 },
    edgeSource: { fill: "#0d2a3d", stroke: "#40c0c0", strokeWidth: 2 },
    candidate: { stroke: "#2a8a8a", strokeWidth: 1.5 },
    inactiveOpacity: 0.3,
  },
  diagnostics: {
    error: { fill: "#c04040", stroke: "#c04040", strokeWidth: 1.5 },
    warning: { stroke: "#c08020", strokeWidth: 1.5 },
    errorNodeFill: "#2a1a1a",
    badgeStroke: "#0a1628",
  },
  container: {
    labelFill: "#5a9a9a",
    selectedLabelFill: "#80d0d0",
    errorLabelFill: "#c07070",
    selectedStroke: "#40c0c0",
    highlightedStroke: "#d4a030",
  },
  portDots: { in: "#40c0c0", out: "#d4a030", radius: 3 },
  portNodes: {
    in: { fill: "#0a1a2d", stroke: "#40c0c0" },
    out: { fill: "#1a1a10", stroke: "#d4a030" },
  },
  edges: {
    default: { stroke: "#2a8a8a", strokeWidth: 1, arrowSize: 10 },
    selected: { stroke: "#40c0c0", strokeWidth: 2 },
    highlighted: { stroke: "#d4a030" },
    refDirect: { stroke: "#1e6a6a", strokeDash: "4,3", endCap: "dot" },
    refIndirect: { stroke: "#1a5050", strokeDash: "2,4", opacity: 0.6, endCap: "dot" },
    labelFill: "#5a9a9a",
    labelFont: SANS,
    labelSize: 10,
    endCap: "arrow",
  },
  refIndicatorFill: "#1e6a6a",
  refLabelFill: "#5a9a9a",
  childrenBadge: { fill: "#2a6a6a", selectedFill: "#40a0a0" },
  edgeRouter: angularRouter(MANHATTAN_ANGLES, 0),
};

// ---------------------------------------------------------------------------
// SHENZHEN palette — circuit-board aesthetic
// ---------------------------------------------------------------------------

const SZ_ROLES: RoleStyles = {
  leaf: {
    geometry: "rect",
    fill: "#c8a832",
    stroke: "#1a6a5a",
    strokeWidth: 1,
    labelFill: "#1a3a2a",
    labelFont: MONO,
    labelSize: 9,
  },
  container: {
    geometry: "rect",
    fill: "#c8a832",
    stroke: "#1a6a5a",
    strokeWidth: 1,
    labelFill: "transparent",
    labelFont: MONO,
    labelSize: 11,
  },
  "collapsed-subgraph": {
    geometry: "rect",
    fill: "#c8a832",
    stroke: "#1a6a5a",
    strokeWidth: 1,
    labelFill: "#1a3a2a",
    labelFont: MONO,
    labelSize: 9,
  },
  ref: {
    geometry: "rect",
    fill: "#a08828",
    stroke: "#145a4a",
    strokeWidth: 1,
    labelFill: "#1a3a2a",
    labelFont: MONO,
    labelSize: 9,
  },
  "leaf-rect": {
    geometry: "rect",
    fill: "#c8a832",
    stroke: "#1a6a5a",
    strokeWidth: 1,
    labelFill: "#1a3a2a",
    labelFont: MONO,
    labelSize: 9,
  },
};

export const SHENZHEN_PALETTE: MarlinThemePalette = {
  background: "#1a2a3a",
  roles: SZ_ROLES,
  interaction: {
    selected: { fill: "#c8a832", stroke: "#30d060", strokeWidth: 2, labelFill: "#d0ffd0" },
    highlighted: { stroke: "#e0c040", strokeWidth: 2 },
    hovered: { fill: "#d0b840", stroke: "#40e070", strokeWidth: 2 },
    edgeSource: { fill: "#d0b840", stroke: "#30d060", strokeWidth: 2 },
    candidate: { stroke: "#208050", strokeWidth: 1.5 },
    inactiveOpacity: 0.3,
  },
  diagnostics: {
    error: { fill: "#c04040", stroke: "#c04040", strokeWidth: 1.5 },
    warning: { stroke: "#c08020", strokeWidth: 1.5 },
    errorNodeFill: "#4a2a2a",
    badgeStroke: "#1a2a3a",
  },
  container: {
    labelFill: "#1a6a5a",
    selectedLabelFill: "#d0ffd0",
    errorLabelFill: "#c07070",
    selectedStroke: "#30d060",
    highlightedStroke: "#e0c040",
  },
  portDots: { in: "#1a6a5a", out: "#c8a832", radius: 3 },
  portNodes: {
    in: { fill: "#2a6a5a", stroke: "#30a090" },
    out: { fill: "#d4b040", stroke: "#e0c060" },
  },
  edges: {
    default: { stroke: "#1a6a5a", strokeWidth: 2, arrowSize: 10 },
    selected: { stroke: "#30d060", strokeWidth: 3 },
    highlighted: { stroke: "#e0c040" },
    refDirect: { stroke: "#145a4a", strokeDash: "4,3", endCap: "dot" },
    refIndirect: { stroke: "#104a3a", strokeDash: "2,4", opacity: 0.6, endCap: "dot" },
    labelFill: "#1a6a5a",
    labelFont: MONO,
    labelSize: 10,
    endCap: "arrow",
  },
  refIndicatorFill: "#145a4a",
  refLabelFill: "#1a6a5a",
  childrenBadge: { fill: "#1a5a4a", selectedFill: "#30a080" },
  edgeRouter: angularRouter(MANHATTAN_ANGLES, 0),
};

// ---------------------------------------------------------------------------
// TRANSIT palette — metro/rail map aesthetic
// ---------------------------------------------------------------------------

const TRANSIT_LINE_COLOURS = ["#d03030", "#2060c0", "#208040", "#7040b0", "#d07020"];

function transitColourIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return ((h % TRANSIT_LINE_COLOURS.length) + TRANSIT_LINE_COLOURS.length) %
    TRANSIT_LINE_COLOURS.length;
}

function transitNodeColour(id: string): string {
  return TRANSIT_LINE_COLOURS[transitColourIndex(id)];
}

/** Darken a hex colour by mixing toward black (factor 0.7). */
function darken(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 0.7;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${
    Math.round(g * f).toString(16).padStart(2, "0")
  }${Math.round(b * f).toString(16).padStart(2, "0")}`;
}

const TRANSIT_ROLES: RoleStyles = {
  leaf: {
    geometry: "circle",
    fill: "#d03030",
    stroke: "#3a3530",
    strokeWidth: 1,
    labelFill: "#3a3530",
    labelFont: SANS,
    labelSize: 9,
  },
  container: {
    geometry: "rect",
    fill: "#d03030",
    stroke: "#3a3530",
    strokeWidth: 1,
    labelFill: "transparent",
    labelFont: SANS,
    labelSize: 11,
  },
  "collapsed-subgraph": {
    geometry: "circle",
    fill: "#d03030",
    stroke: "#3a3530",
    strokeWidth: 1,
    labelFill: "#3a3530",
    labelFont: SANS,
    labelSize: 9,
  },
  ref: {
    geometry: "circle",
    fill: "#d03030",
    stroke: "#3a3530",
    strokeWidth: 1,
    labelFill: "#3a3530",
    labelFont: SANS,
    labelSize: 9,
  },
  "leaf-rect": {
    geometry: "rect",
    fill: "#d03030",
    stroke: "#3a3530",
    strokeWidth: 1,
    labelFill: "#3a3530",
    labelFont: SANS,
    labelSize: 9,
  },
};

export const TRANSIT_PALETTE: MarlinThemePalette = {
  background: "#e8e4dc",
  roles: TRANSIT_ROLES,
  interaction: {
    selected: { fill: "#000000", stroke: "#3a3530", strokeWidth: 3, labelFill: "#1a1510" },
    highlighted: { stroke: "#1a1510", strokeWidth: 2 },
    hovered: { fill: "#000000", stroke: "#1a1510", strokeWidth: 2 },
    edgeSource: { fill: "#000000", stroke: "#1a1510", strokeWidth: 3 },
    candidate: { stroke: "#6a6560", strokeWidth: 1.5 },
    inactiveOpacity: 0.3,
  },
  diagnostics: {
    error: { fill: "#c04040", stroke: "#c04040", strokeWidth: 1.5 },
    warning: { stroke: "#c08020", strokeWidth: 1.5 },
    errorNodeFill: "#f0d0d0",
    badgeStroke: "#e8e4dc",
  },
  container: {
    labelFill: "#3a3530",
    selectedLabelFill: "#1a1510",
    errorLabelFill: "#c07070",
    selectedStroke: "#1a1510",
    highlightedStroke: "#1a1510",
  },
  portDots: { in: "#2060c0", out: "#d03030", radius: 3 },
  portNodes: {
    in: { fill: "#ffffff", stroke: "#2060c0" },
    out: { fill: "#ffffff", stroke: "#d03030" },
  },
  edges: {
    default: { stroke: "#d03030", strokeWidth: 4.5, arrowSize: 0 },
    selected: { stroke: "#000000", strokeWidth: 6 },
    highlighted: { stroke: "#1a1510" },
    labelFill: "#3a3530",
    labelFont: SANS,
    labelSize: 10,
    endCap: "none",
  },
  refIndicatorFill: "#6a6560",
  refLabelFill: "#3a3530",
  childrenBadge: { fill: "#8a8580", selectedFill: "#3a3530" },
  nodeColorFn: transitNodeColour,
  selectedColorFn: darken,
  portGeometry: "rect",
  edgeRouter: angularRouter(TRANSIT_ANGLES, 8),
};

// ---------------------------------------------------------------------------
// AGENT palette — clean minimal dark aesthetic
// ---------------------------------------------------------------------------

const AGENT_ROLES: RoleStyles = {
  leaf: {
    geometry: "circle",
    fill: "#2a2a2a",
    stroke: "#444444",
    strokeWidth: 1,
    labelFill: "#888888",
    labelFont: SANS,
    labelSize: 9,
  },
  container: {
    geometry: "rect",
    fill: "#2a2a2a",
    stroke: "#444444",
    strokeWidth: 1,
    labelFill: "transparent",
    labelFont: SANS,
    labelSize: 11,
  },
  "collapsed-subgraph": {
    geometry: "circle",
    fill: "#2a2a2a",
    stroke: "#444444",
    strokeWidth: 1,
    labelFill: "#888888",
    labelFont: SANS,
    labelSize: 9,
  },
  ref: {
    geometry: "circle",
    fill: "#222222",
    stroke: "#383838",
    strokeWidth: 1,
    labelFill: "#888888",
    labelFont: SANS,
    labelSize: 9,
  },
  "leaf-rect": {
    geometry: "rect",
    fill: "#2a2a2a",
    stroke: "#444444",
    strokeWidth: 1,
    labelFill: "#888888",
    labelFont: SANS,
    labelSize: 9,
  },
};

export const AGENT_PALETTE: MarlinThemePalette = {
  background: "#1a1a1a",
  roles: AGENT_ROLES,
  interaction: {
    selected: { fill: "#2a2a2a", stroke: "#ffffff", strokeWidth: 2, labelFill: "#e0e0e0" },
    highlighted: { stroke: "#4488ff", strokeWidth: 2 },
    hovered: { fill: "#333333", stroke: "#aaaaaa", strokeWidth: 2 },
    edgeSource: { fill: "#333333", stroke: "#ffffff", strokeWidth: 2 },
    candidate: { stroke: "#666666", strokeWidth: 1.5 },
    inactiveOpacity: 0.3,
  },
  diagnostics: {
    error: { fill: "#c04040", stroke: "#c04040", strokeWidth: 1.5 },
    warning: { stroke: "#c08020", strokeWidth: 1.5 },
    errorNodeFill: "#2a1a1a",
    badgeStroke: "#1a1a1a",
  },
  container: {
    labelFill: "#666666",
    selectedLabelFill: "#e0e0e0",
    errorLabelFill: "#c07070",
    selectedStroke: "#ffffff",
    highlightedStroke: "#4488ff",
  },
  portDots: { in: "#4488ff", out: "#ffffff", radius: 3 },
  portNodes: {
    in: { fill: "#1a2030", stroke: "#4488ff" },
    out: { fill: "#2a2a2a", stroke: "#ffffff" },
  },
  edges: {
    default: { stroke: "#555555", strokeWidth: 1, arrowSize: 8 },
    selected: { stroke: "#ffffff", strokeWidth: 1.5 },
    highlighted: { stroke: "#4488ff" },
    refDirect: { stroke: "#555555", strokeDash: "4,3", endCap: "dot" },
    refIndirect: { stroke: "#444444", strokeDash: "2,4", opacity: 0.6, endCap: "dot" },
    labelFill: "#666666",
    labelFont: SANS,
    labelSize: 10,
    endCap: "arrow",
  },
  refIndicatorFill: "#555555",
  refLabelFill: "#888888",
  childrenBadge: { fill: "#444444", selectedFill: "#888888" },
  edgeRouter: angularRouter(MANHATTAN_ANGLES, 0),
};
