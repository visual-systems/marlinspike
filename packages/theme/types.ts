/**
 * Theme definition types — generic theme machinery.
 *
 * ThemeDefinition describes what a theme *does*: resolve role strings to style
 * properties, provide layout constants, and map geometry identifiers to
 * NodeGeometry singletons.
 *
 * Domain-specific role contracts (e.g. MarlinSemanticIdentifiers) are defined
 * by the application and intersected with ThemeDefinition to produce a complete
 * theme type: `ThemeDefinition & MarlinSemanticIdentifiers`.
 */

import type { NodeStyleProps, ThemeConstants } from "@marlinspike/canvas";

/**
 * A named set of role→NodeStyleProps mappings.
 * Keys are role identifiers (strings), values are the base style defaults.
 */
export type RoleDefs = Record<string, NodeStyleProps>;

/**
 * Generic theme machinery interface.
 *
 * A ThemeDefinition knows how to resolve roles to style properties and
 * provides layout constants. It does NOT know which roles exist — that
 * contract comes from the application via structural intersection.
 *
 * A valid marlinspike theme: `ThemeDefinition & MarlinSemanticIdentifiers`
 */
export interface ThemeDefinition {
  /** Base style defaults keyed by role identifier. */
  readonly roles: RoleDefs;
  /** Layout constants (padding, label height, leaf radius). */
  readonly constants: ThemeConstants;
}
