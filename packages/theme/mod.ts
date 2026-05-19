/**
 * @marlinspike/theme — Generic theme infrastructure
 *
 * Provides the machinery for defining and resolving visual themes:
 * - ThemeDefinition interface — what a theme *does*
 * - resolveProps — merge role defaults with per-element overrides
 * - resolveGeometryFromProps — geometry string → NodeGeometry singleton
 *
 * Domain-specific role contracts are defined by the application and
 * intersected with ThemeDefinition: `ThemeDefinition & AppRoles`.
 *
 * @module
 */

export type { RoleDefs, ThemeDefinition } from "./types.ts";
export { resolveGeometryFromProps, resolveProps } from "./resolve.ts";
