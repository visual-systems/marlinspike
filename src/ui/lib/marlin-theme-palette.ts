/**
 * MarlinThemePalette — pure aesthetic data for the Marlinspike theme factory.
 *
 * A palette is a bag of colors, geometry choices, and routing config.
 * It contains no domain logic — the factory applies shared domain
 * translation to produce a full CanvasTheme<MarlinNodeState>.
 */

import type { CanvasTheme, NodeStyleProps, ThemeConstants } from "@marlinspike/canvas";
import type { MarlinRole } from "./canvas-adapter.ts";

/** Style props for each visual role — same shape as NodeStyleProps. */
export type RoleStyles = Record<
  MarlinRole,
  Required<
    Pick<
      NodeStyleProps,
      "geometry" | "fill" | "stroke" | "strokeWidth" | "labelFill" | "labelFont" | "labelSize"
    >
  >
>;

/** Pure aesthetic data — no functions, no domain logic. */
export interface MarlinThemePalette {
  background: string;

  /** Base style defaults per visual role. */
  roles: RoleStyles;

  /** Interaction state color overrides (applied over role defaults). */
  interaction: {
    selected: { fill: string; stroke: string; strokeWidth: number; labelFill: string };
    highlighted: { stroke: string; strokeWidth: number };
    hovered: { fill: string; stroke: string; strokeWidth: number };
    edgeSource: { fill: string; stroke: string; strokeWidth: number };
    candidate: { stroke: string; strokeWidth: number };
    inactiveOpacity: number;
  };

  /** Diagnostic badge/stroke colors. */
  diagnostics: {
    error: { fill: string; stroke: string; strokeWidth: number };
    warning: { stroke: string; strokeWidth: number };
    /** Node fill override when error is present. */
    errorNodeFill: string;
    /** Badge background stroke (usually matches theme background for cutout). */
    badgeStroke: string;
  };

  /** Container background overrides. */
  container: {
    /** Fill for ref containers. */
    refFill?: string;
    /** Fill for error containers. */
    errorFill?: string;
    /** Label fill in normal/selected/error states. */
    labelFill: string;
    selectedLabelFill: string;
    errorLabelFill: string;
    /** Selected container stroke. */
    selectedStroke: string;
    /** Highlighted container stroke. */
    highlightedStroke: string;
    /** Ref container stroke. */
    refStroke?: string;
  };

  /** Port direction colors. */
  ports: {
    in: { fill: string; stroke: string };
    out: { fill: string; stroke: string };
    /** Radius for edge-derived port dots. */
    dotRadius: number;
  };

  /** Edge style palette. */
  edges: {
    default: { stroke: string; strokeWidth: number; arrowSize: number };
    selected: { stroke: string; strokeWidth: number };
    highlighted: { stroke: string };
    refDirect?: { stroke: string; strokeDash: string; endCap: "arrow" | "dot" | "none" };
    refIndirect?: {
      stroke: string;
      strokeDash: string;
      opacity: number;
      endCap: "arrow" | "dot" | "none";
    };
    labelFill: string;
    labelFont: string;
    labelSize: number;
    /** Default end cap for normal edges. */
    endCap?: "arrow" | "dot" | "none";
  };

  /** Ref indicator text color. */
  refIndicatorFill: string;

  /** Label for selected ref nodes. */
  refLabelFill: string;

  /** Children count badge colors. */
  childrenBadge: { fill: string; selectedFill: string };

  /**
   * Optional: derive node base color from ID (e.g. transit hash-based coloring).
   * When present, overrides `roles[role].fill` for non-container leaf nodes.
   * Also used for edge stroke color when provided.
   */
  nodeColorFn?: (id: string) => string;

  /**
   * Optional: transform a color for selected state (e.g. darken).
   * Used with nodeColorFn to derive selected edge/node colors from the source color.
   */
  selectedColorFn?: (hex: string) => string;

  /**
   * Optional: geometry override for port-direction nodes.
   * Transit uses "rect" for ports even though default leaf is "circle".
   */
  portGeometry?: string;

  /** Custom edge routing. */
  // deno-lint-ignore no-explicit-any
  edgeRouter?: CanvasTheme<any>["edgeRouter"];

  /** Layout constants (groupPadding, labelH, leafRadius). */
  constants?: ThemeConstants;
}
