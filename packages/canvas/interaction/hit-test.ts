/**
 * Spatial hit-testing against the render primitive tree.
 *
 * Walks the tree depth-first in reverse child order (topmost visual = last child)
 * and returns the first InteractionHint found at the given point.
 */

import type { Point } from "../geometry/surface.ts";
import type { RenderGroup, RenderPrimitive } from "../render/primitives.ts";
import type { InteractionHint } from "./types.ts";

/** Tolerance in pixels for path hit-testing. */
const PATH_HIT_TOLERANCE = 6;

/**
 * Find the interactive element at a given point in the primitive tree.
 *
 * Returns the deepest (topmost visual) InteractionHint at the point, or null.
 * The point is in the same coordinate space as the root group.
 */
export function hitTest(root: RenderGroup, point: Point): InteractionHint | null {
  return hitTestGroup(root, point.x, point.y);
}

function hitTestGroup(group: RenderGroup, px: number, py: number): InteractionHint | null {
  // Adjust point for this group's translation
  const lx = px - (group.tx ?? 0);
  const ly = py - (group.ty ?? 0);

  // Walk children in reverse order (last rendered = visually on top)
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    const hit = hitTestPrimitive(child, lx, ly);
    if (hit) return hit;
  }

  // Check if the group itself is interactive and the point is within its bounds
  if (group.interaction) {
    if (hitTestGroupBounds(group, lx, ly)) {
      return group.interaction;
    }
  }

  return null;
}

function hitTestPrimitive(prim: RenderPrimitive, px: number, py: number): InteractionHint | null {
  switch (prim.kind) {
    case "group":
      return hitTestGroup(prim, px, py);

    case "circle":
      // Point-in-circle test
      if (distSq(px - prim.cx, py - prim.cy) <= prim.r * prim.r) {
        // Circles don't carry interaction hints directly — their parent group does
        return null;
      }
      return null;

    case "rect":
      if (
        px >= prim.x && px <= prim.x + prim.w &&
        py >= prim.y && py <= prim.y + prim.h
      ) {
        return null;
      }
      return null;

    case "path":
      // Path hit-testing: approximate using line segments from the d string
      if (hitTestPath(prim.d, px, py, PATH_HIT_TOLERANCE)) {
        return null;
      }
      return null;

    default:
      return null;
  }
}

/**
 * Test if a point is within the bounds of a group's first shape child.
 * This allows the group's interaction hint to fire when clicking within
 * the shape it represents (circle or rect).
 */
function hitTestGroupBounds(group: RenderGroup, px: number, py: number): boolean {
  for (const child of group.children) {
    if (child.kind === "circle") {
      return distSq(px - child.cx, py - child.cy) <= child.r * child.r;
    }
    if (child.kind === "rect") {
      return px >= child.x && px <= child.x + child.w &&
        py >= child.y && py <= child.y + child.h;
    }
    // For paths (edge hit areas), check with tolerance
    if (child.kind === "path") {
      return hitTestPath(child.d, px, py, PATH_HIT_TOLERANCE);
    }
  }
  return false;
}

function distSq(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

/**
 * Approximate path hit-testing by parsing M/L/A commands from the SVG path `d` string.
 * Returns true if the point is within `tolerance` pixels of any segment.
 */
function hitTestPath(d: string, px: number, py: number, tolerance: number): boolean {
  const segments = parsePath(d);
  const tolSq = tolerance * tolerance;

  for (const seg of segments) {
    if (seg.kind === "line") {
      const dist = pointToSegmentDistSq(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
      if (dist <= tolSq) return true;
    } else if (seg.kind === "arc") {
      // Approximate arc hit-test: check distance to the arc's circle
      const dx = px - seg.cx;
      const dy = py - seg.cy;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);
      const distFromArc = Math.abs(distFromCenter - seg.r);
      if (distFromArc <= tolerance) {
        // Verify the point is within the angular span of the arc
        // (simplified: accept if distance from circle is close enough)
        return true;
      }
    }
  }
  return false;
}

type PathSegment =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "arc"; cx: number; cy: number; r: number };

/**
 * Minimal SVG path parser — handles M, L, and A commands (the ones we generate).
 */
function parsePath(d: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const tokens = d.match(/[MLAZ][^MLAZ]*/gi) ?? [];
  let cx = 0, cy = 0;

  for (const token of tokens) {
    const cmd = token[0];
    const nums = token.slice(1).trim().split(/[\s,]+/).map(Number);

    switch (cmd.toUpperCase()) {
      case "M":
        cx = nums[0];
        cy = nums[1];
        break;
      case "L":
        segments.push({ kind: "line", x1: cx, y1: cy, x2: nums[0], y2: nums[1] });
        cx = nums[0];
        cy = nums[1];
        break;
      case "A": {
        // A rx ry x-rot large-arc sweep x y
        const r = nums[0];
        const endX = nums[5];
        const endY = nums[6];
        // Approximate arc center from start, end, radius
        const midX = (cx + endX) / 2;
        const midY = (cy + endY) / 2;
        segments.push({ kind: "arc", cx: midX, cy: midY, r });
        // Also add a line segment for fallback
        segments.push({ kind: "line", x1: cx, y1: cy, x2: endX, y2: endY });
        cx = endX;
        cy = endY;
        break;
      }
    }
  }
  return segments;
}

/** Squared distance from point (px,py) to line segment (x1,y1)-(x2,y2). */
function pointToSegmentDistSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.001) return distSq(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return distSq(px - projX, py - projY);
}
