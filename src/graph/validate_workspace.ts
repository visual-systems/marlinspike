// Constraint evaluation against workspace state.
// Each Constraint with ConstraintApplications is evaluated against those entities;
// results are merged into a DiagnosticMap keyed by entity ID.
//
// Constraint types are an open set — new evaluators can be registered without changing
// the Constraint interface or any type union. Unknown types silently produce no diagnostics.

import type { Diagnostic, DiagnosticMap } from "./diagnostics.ts";
import {
  type Constraint,
  type ConstraintApplication,
  type Edge,
  findNode,
  type TreeNode,
  type WorkspaceState,
} from "../ui/workspace.ts";

type Entity = TreeNode | Edge;
type Evaluator = (constraint: Constraint, entity: Entity) => Diagnostic[];

/** A JSON Schema object describing valid property types for constraint.data fields. */
export type DataPropertySchema =
  | { type: "integer"; minimum?: number; default?: number }
  | { type: "number"; minimum?: number; default?: number }
  | { type: "string"; default?: string }
  | { type: "boolean"; default?: boolean };

/** Declares the shape of a constraint type's `data` field. */
export interface ConstraintDataSchema {
  properties: Record<string, DataPropertySchema>;
  required?: string[];
}

interface ConstraintTypeDefinition {
  /** Declares the expected shape of constraint.data for this type. */
  dataSchema: ConstraintDataSchema;
  evaluate: Evaluator;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry: Record<string, ConstraintTypeDefinition> = {
  "label-required": {
    dataSchema: { properties: {} },
    evaluate(constraint, entity) {
      if (typeof entity.label === "string" && entity.label.length > 0) return [];
      return [
        {
          code: constraint.id,
          severity: "error",
          message: `"${entity.id}" must have a non-empty label.`,
          entityId: entity.id,
        },
      ];
    },
  },

  "max-children": {
    dataSchema: {
      properties: {
        limit: { type: "integer", minimum: 0, default: 5 },
      },
      required: ["limit"],
    },
    evaluate(constraint, entity) {
      const limit = typeof constraint.data.limit === "number" ? constraint.data.limit : 5;
      if (!("children" in entity) || !Array.isArray(entity.children)) return [];
      if (entity.children.length <= limit) return [];
      return [
        {
          code: constraint.id,
          severity: "warning",
          message: `"${
            entity.label || entity.id
          }" has ${entity.children.length} children (max ${limit}).`,
          entityId: entity.id,
        },
      ];
    },
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the type strings of all currently registered constraint types. */
export function registeredConstraintTypes(): string[] {
  return Object.keys(registry);
}

/**
 * Returns the data schema for a constraint type, or null if the type is unknown.
 * Used by the UI to render type-specific configuration fields.
 */
export function getConstraintDataSchema(type: string): ConstraintDataSchema | null {
  return registry[type]?.dataSchema ?? null;
}

function findEntity(ws: WorkspaceState, entityId: string): Entity | undefined {
  return findNode(ws.treeNodes, entityId) ?? ws.edges.find((e) => e.id === entityId);
}

export function validateWorkspace(
  ws: WorkspaceState,
  apps: ConstraintApplication[],
): DiagnosticMap {
  const map: DiagnosticMap = {};
  for (const app of apps) {
    const constraint = ws.constraints.find((c) => c.id === app.constraintId);
    if (!constraint) continue;
    const entity = findEntity(ws, app.entityId);
    if (!entity) continue;
    const def = registry[constraint.type];
    if (!def) continue;
    const diags = def.evaluate(constraint, entity);
    if (diags.length > 0) {
      map[app.entityId] = [...(map[app.entityId] ?? []), ...diags];
    }
  }
  return map;
}
