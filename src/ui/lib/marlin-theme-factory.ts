/**
 * Marlinspike theme factory — shared domain translation with pluggable aesthetics.
 *
 * `createMarlinTheme(palette)` takes a MarlinThemePalette (pure aesthetic data)
 * and returns a CanvasTheme<MarlinNodeState> with full domain-aware styling:
 * error/warning badges, hover feedback, edge-draw candidates, ref styling,
 * role-based geometry, inactive opacity, container labels, and port dots.
 *
 * The domain translation logic (priority chains for fill/stroke/strokeWidth)
 * is shared across all themes — only the colors and geometry differ.
 */

import type {
  CanvasEdge,
  CanvasNode,
  CanvasPort,
  CanvasTheme,
  EdgeStyle,
  NodeStyleProps,
  PortStyle,
  RenderPrimitive,
  ResolvedNode,
} from "@marlinspike/canvas";
import { containerFill, ensureContrast, RECT_GEOMETRY } from "@marlinspike/canvas";
import { resolveGeometryFromProps, resolveProps } from "@marlinspike/theme";
import type { MarlinNodeState, MarlinRole } from "./canvas-adapter.ts";
import type { MarlinThemePalette } from "./marlin-theme-palette.ts";

const LEAF_R = 26;

/**
 * Create a fully domain-aware Marlinspike theme from a pure aesthetic palette.
 *
 * All returned themes share the same domain translation logic — the palette
 * controls only visual presentation (colors, geometry, routing).
 */
export function createMarlinTheme(palette: MarlinThemePalette): CanvasTheme<MarlinNodeState> {
  const roleDefs: Record<MarlinRole, NodeStyleProps> = palette.roles;

  // -- Node resolution -------------------------------------------------------

  function resolveNodeStyle(node: CanvasNode<MarlinNodeState>): ResolvedNode {
    const s = node.state!;
    const { selected, highlighted } = node;

    const merged = resolveProps(roleDefs, s.role, s.styleOverrides);
    let geometry = resolveGeometryFromProps(merged.geometry);

    // Port geometry override (e.g. transit uses rect for ports)
    if (node.portDirection != null && palette.portGeometry) {
      geometry = resolveGeometryFromProps(palette.portGeometry);
    }

    let fill = palette.nodeColorFn && !s.isContainerBackground
      ? palette.nodeColorFn(node.id)
      : merged.fill!;
    let stroke = merged.stroke!;
    let strokeWidth = merged.strokeWidth!;
    let labelFill = merged.labelFill!;
    let opacity = merged.opacity;

    if (s.isContainerBackground) {
      // Container backgrounds use depth-aware fill
      const baseFill = palette.nodeColorFn ? palette.nodeColorFn(node.id) : merged.fill!;
      fill = containerFill(baseFill, palette.background, node.depth ?? 0);

      if (s.isRef && palette.container.refFill) fill = palette.container.refFill;
      if (s.hasError && palette.container.errorFill) fill = palette.container.errorFill;

      if (s.hasError) stroke = palette.diagnostics.error.stroke;
      else if (s.hasWarning) stroke = palette.diagnostics.warning.stroke;
      else if (selected) stroke = palette.container.selectedStroke;
      else if (highlighted) stroke = palette.container.highlightedStroke;
      else if (s.isRef && palette.container.refStroke) stroke = palette.container.refStroke;

      if (selected || s.hasError || s.hasWarning || highlighted) strokeWidth = 2;
    } else {
      // Non-container node styling — interaction state overrides
      if (s.isEdgeSource || s.isHovered) fill = palette.interaction.hovered.fill;
      else if (s.hasError) fill = palette.diagnostics.errorNodeFill;
      else if (selected) {
        fill = palette.selectedColorFn
          ? palette.selectedColorFn(fill)
          : palette.interaction.selected.fill;
      } else if (node.portDirection === "in") fill = palette.portNodes.in.fill;
      else if (node.portDirection === "out") fill = palette.portNodes.out.fill;

      if (s.isEdgeSource) stroke = palette.interaction.edgeSource.stroke;
      else if (s.isHovered) stroke = palette.interaction.hovered.stroke;
      else if (s.hasError) stroke = palette.diagnostics.error.stroke;
      else if (s.hasWarning) stroke = palette.diagnostics.warning.stroke;
      else if (selected) stroke = palette.interaction.selected.stroke;
      else if (s.isCandidate) stroke = palette.interaction.candidate.stroke;
      else if (highlighted) stroke = palette.interaction.highlighted.stroke;
      else if (node.portDirection === "in") stroke = palette.portNodes.in.stroke;
      else if (node.portDirection === "out") stroke = palette.portNodes.out.stroke;

      if (s.isEdgeSource || selected || s.isHovered) {
        strokeWidth = palette.interaction.selected.strokeWidth;
      } else if (s.isCandidate || s.hasError || s.hasWarning || highlighted) {
        strokeWidth = palette.interaction.candidate.strokeWidth;
      }

      labelFill = selected
        ? palette.interaction.selected.labelFill
        : (s.isRef ? palette.refLabelFill : merged.labelFill!);

      if (s.isInactive) opacity = palette.interaction.inactiveOpacity;
    }

    // Auto-contrast safety net: ensure label is readable against computed fill
    labelFill = ensureContrast(fill, labelFill);

    return {
      geometry,
      style: {
        fill,
        stroke,
        strokeWidth,
        labelFill,
        labelFont: merged.labelFont!,
        labelSize: merged.labelSize!,
        opacity,
      },
    };
  }

  // -- Edge resolution -------------------------------------------------------

  function resolveEdgeStyle(edge: CanvasEdge): EdgeStyle {
    if (edge.kind === "ref-direct" && palette.edges.refDirect) {
      return {
        stroke: palette.edges.refDirect.stroke,
        strokeWidth: 1,
        arrowSize: palette.edges.default.arrowSize,
        labelFill: palette.edges.labelFill,
        labelFont: palette.edges.labelFont,
        labelSize: palette.edges.labelSize,
        strokeDash: palette.edges.refDirect.strokeDash,
        endCap: palette.edges.refDirect.endCap,
      };
    }
    if (edge.kind === "ref-indirect" && palette.edges.refIndirect) {
      return {
        stroke: palette.edges.refIndirect.stroke,
        strokeWidth: 1,
        arrowSize: palette.edges.default.arrowSize,
        labelFill: palette.edges.labelFill,
        labelFont: palette.edges.labelFont,
        labelSize: palette.edges.labelSize,
        strokeDash: palette.edges.refIndirect.strokeDash,
        opacity: palette.edges.refIndirect.opacity,
        endCap: palette.edges.refIndirect.endCap,
      };
    }

    // For themes with nodeColorFn, edge stroke derives from source node color
    const sourceColor = palette.nodeColorFn ? palette.nodeColorFn(edge.fromId) : null;
    const defaultStroke = sourceColor ?? palette.edges.default.stroke;

    let stroke: string;
    if (edge.selected) {
      stroke = sourceColor && palette.selectedColorFn
        ? palette.selectedColorFn(sourceColor)
        : palette.edges.selected.stroke;
    } else if (edge.highlighted) {
      stroke = palette.edges.highlighted.stroke;
    } else {
      stroke = defaultStroke;
    }
    const strokeWidth = edge.selected
      ? palette.edges.selected.strokeWidth
      : palette.edges.default.strokeWidth;

    return {
      stroke,
      strokeWidth,
      arrowSize: palette.edges.default.arrowSize,
      labelFill: palette.edges.labelFill,
      labelFont: palette.edges.labelFont,
      labelSize: palette.edges.labelSize,
      endCap: palette.edges.endCap,
      outlineStroke: palette.edges.outline?.stroke,
      outlineWidth: palette.edges.outline ? strokeWidth + palette.edges.outline.width : undefined,
    };
  }

  // -- Port resolution -------------------------------------------------------

  function resolvePortStyle(port: CanvasPort, _node: CanvasNode<MarlinNodeState>): PortStyle {
    const isOut = port.direction === "out";
    return {
      fill: isOut ? palette.portDots.out : palette.portDots.in,
      stroke: "none",
      radius: palette.portDots.radius,
    };
  }

  // -- Decorations -----------------------------------------------------------

  function resolveDecorations(node: CanvasNode<MarlinNodeState>): RenderPrimitive[] {
    const s = node.state!;
    const prims: RenderPrimitive[] = [];
    const isRect = node.geometry === RECT_GEOMETRY;
    const r = Math.min(node.w, node.h) / 2;

    // Container background: top-left label
    if (s.isContainerBackground && s.containerLabel) {
      const halfW = node.w / 2;
      const halfH = node.h / 2;
      // Recompute container fill for contrast check
      const baseFill = palette.nodeColorFn
        ? palette.nodeColorFn(node.id)
        : palette.roles[s.role].fill;
      const bgFill = containerFill(baseFill, palette.background, node.depth ?? 0);
      let labelColor = node.selected
        ? palette.container.selectedLabelFill
        : s.hasError
        ? palette.container.errorLabelFill
        : palette.container.labelFill;
      labelColor = ensureContrast(bgFill, labelColor);
      prims.push({
        kind: "text",
        x: -halfW + 10,
        y: -halfH + 16,
        text: s.containerLabel,
        fill: labelColor,
        fontSize: 11,
        fontFamily: palette.roles.container.labelFont,
        anchor: "start",
      });
      return prims;
    }

    // Children count badge
    if (s.hasChildren && s.childrenCount > 0) {
      prims.push({
        kind: "text",
        x: 0,
        y: 10,
        text: `(${s.childrenCount})`,
        fill: node.selected ? palette.childrenBadge.selectedFill : palette.childrenBadge.fill,
        fontSize: 8,
        anchor: "middle",
      });
    }

    // Error/warning badge
    if (s.hasError || s.hasWarning) {
      const badgeY = -(isRect ? LEAF_R * 0.7 - 2 : r - 2);
      prims.push({
        kind: "circle",
        cx: r - 2,
        cy: badgeY,
        r: 5,
        fill: s.hasError ? palette.diagnostics.error.stroke : palette.diagnostics.warning.stroke,
        stroke: palette.diagnostics.badgeStroke,
        strokeWidth: 1,
      });
    }

    // Ref indicator text
    if (s.refTarget) {
      const labelY = isRect ? LEAF_R * 0.7 + 9 : r + 9;
      prims.push({
        kind: "text",
        x: 0,
        y: labelY,
        text: `\u2197 ${s.refTarget}`,
        fill: palette.refIndicatorFill,
        fontSize: 7,
        anchor: "middle",
      });
    }

    // Edge-derived port dots
    for (const dot of s.edgePortDots) {
      prims.push({
        kind: "circle",
        cx: dot.x,
        cy: dot.y,
        r: palette.portDots.radius,
        fill: dot.out ? palette.portDots.out : palette.portDots.in,
        stroke: "none",
        strokeWidth: 0,
      });
    }

    return prims;
  }

  // -- Assemble theme --------------------------------------------------------

  return {
    node: (node) => resolveNodeStyle(node).style,
    edge: resolveEdgeStyle,
    port: resolvePortStyle,
    decorations: resolveDecorations,
    background: palette.background,
    resolveNode: resolveNodeStyle,
    constants: palette.constants,
    edgeRouter: palette.edgeRouter,
  };
}
