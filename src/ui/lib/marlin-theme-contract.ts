/**
 * MarlinSemanticIdentifiers — the domain contract for marlinspike themes.
 *
 * Defines the required role keys that any marlinspike theme must provide.
 * Intersected with ThemeDefinition to produce a complete theme type:
 * `ThemeDefinition & MarlinSemanticIdentifiers`.
 *
 * This lives in src/ (application code) because roles are marlinspike-specific
 * semantics, not generic theme machinery.
 */

import type { NodeStyleProps } from "@marlinspike/canvas";
import type { MarlinRole } from "./canvas-adapter.ts";

/**
 * Required role→style mappings for a marlinspike theme.
 * Every MarlinRole must have a base NodeStyleProps definition.
 */
export interface MarlinSemanticIdentifiers {
  readonly roles: Record<MarlinRole, NodeStyleProps>;
}
