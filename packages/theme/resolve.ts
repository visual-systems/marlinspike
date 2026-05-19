/**
 * Theme resolution utilities — merge role defaults with per-element overrides
 * and resolve geometry identifiers to NodeGeometry singletons.
 */

import type { NodeGeometry, NodeStyleProps } from "@marlinspike/canvas";
import { CIRCLE_GEOMETRY, RECT_GEOMETRY } from "@marlinspike/canvas";
import type { RoleDefs } from "./types.ts";

/**
 * Resolve style properties for a given role, merging sparse per-element
 * overrides over theme defaults.
 *
 * @param roleDefs - Theme's role→NodeStyleProps map
 * @param role - The role identifier to look up
 * @param overrides - Optional sparse per-element overrides from constraints
 * @returns Merged NodeStyleProps (role defaults ← overrides)
 */
export function resolveProps(
  roleDefs: RoleDefs,
  role: string,
  overrides?: NodeStyleProps,
): NodeStyleProps {
  const base = roleDefs[role];
  if (!base) {
    return overrides ?? {};
  }
  if (!overrides) {
    return base;
  }
  return { ...base, ...overrides };
}

/** Built-in geometry registry: string identifier → NodeGeometry singleton. */
const GEOMETRY_REGISTRY: Record<string, NodeGeometry> = {
  circle: CIRCLE_GEOMETRY,
  rect: RECT_GEOMETRY,
};

/**
 * Resolve a geometry string identifier to a NodeGeometry singleton.
 * Falls back to CIRCLE_GEOMETRY for unknown identifiers.
 *
 * @param geometry - String identifier from NodeStyleProps.geometry
 * @returns The corresponding NodeGeometry singleton
 */
export function resolveGeometryFromProps(geometry: string | undefined): NodeGeometry {
  if (geometry && geometry in GEOMETRY_REGISTRY) {
    return GEOMETRY_REGISTRY[geometry];
  }
  return CIRCLE_GEOMETRY;
}
