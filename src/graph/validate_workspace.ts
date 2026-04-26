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
type Evaluator = (constraint: Constraint, entity: Entity, ws: WorkspaceState) => Diagnostic[];

/** A JSON Schema object describing valid property types for constraint.data fields. */
export type DataPropertySchema =
  | { type: "integer"; minimum?: number; default?: number }
  | { type: "number"; minimum?: number; default?: number }
  | { type: "string"; default?: string }
  | { type: "boolean"; default?: boolean }
  | {
    type: "object";
    default?: Record<string, unknown>;
    properties?: Record<string, DataPropertySchema>;
    required?: string[];
  };

/** Declares the shape of a constraint type's `data` field. */
export interface ConstraintDataSchema {
  properties: Record<string, DataPropertySchema>;
  required?: string[];
}

interface ConstraintTypeDefinition {
  /** Schema for the constraint's own configuration (edited on the constraint inspector). */
  dataSchema: ConstraintDataSchema;
  /**
   * Schema for entity data that this constraint type requires (edited on the entity inspector).
   * When a constraint with an entityDataSchema is applied to an entity, the entity inspector
   * renders these fields against `entity.data`. The evaluator reads from `entity.data` too.
   */
  entityDataSchema?: ConstraintDataSchema;
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

  "js-script": {
    dataSchema: {
      properties: {
        requireInputs: { type: "boolean", default: false },
        requireOutputs: { type: "boolean", default: false },
      },
    },
    evaluate(constraint, entity) {
      const diags: Diagnostic[] = [];
      const name = entity.label || entity.id;
      const d = "data" in entity ? entity.data : {};

      if (typeof d.script !== "string" || d.script.trim().length === 0) {
        diags.push({
          code: constraint.id,
          severity: "error",
          message: `"${name}" must have a non-empty script.`,
          entityId: entity.id,
        });
      }
      if (constraint.data.requireInputs === true) {
        if (!Array.isArray(d.inputs) || (d.inputs as unknown[]).length === 0) {
          diags.push({
            code: constraint.id,
            severity: "warning",
            message: `"${name}" must declare at least one input.`,
            entityId: entity.id,
          });
        }
      }
      if (constraint.data.requireOutputs === true) {
        if (!Array.isArray(d.outputs) || (d.outputs as unknown[]).length === 0) {
          diags.push({
            code: constraint.id,
            severity: "warning",
            message: `"${name}" must declare at least one output.`,
            entityId: entity.id,
          });
        }
      }
      return diags;
    },
  },

  "edge-output-type": {
    dataSchema: { properties: {} },
    evaluate(constraint, entity, ws) {
      if (!("fromId" in entity)) return [];
      const edge = entity as Edge;
      const name = edge.label || edge.id;
      const edgeType = edge.data.type;
      if (typeof edgeType !== "string" || edgeType.trim().length === 0) {
        return [
          {
            code: constraint.id,
            severity: "error",
            message: `Edge "${name}" must declare a type.`,
            entityId: edge.id,
          },
        ];
      }
      const source = findNode(ws.treeNodes, edge.fromId);
      if (!source) return [];
      const outputs = source.data.outputs;
      if (!Array.isArray(outputs)) return [];
      if ((outputs as unknown[]).includes(edgeType)) return [];
      return [
        {
          code: constraint.id,
          severity: "error",
          message: `Edge "${name}" type "${edgeType}" is not in source node "${
            source.label || source.id
          }" outputs [${(outputs as string[]).join(", ")}].`,
          entityId: edge.id,
        },
      ];
    },
  },

  "connections": {
    dataSchema: { properties: {} },
    entityDataSchema: {
      properties: {
        connection: {
          type: "object",
          default: { url: "", namespace: "", database: "", username: "", password: "" },
          properties: {
            url: { type: "string", default: "" },
            namespace: { type: "string", default: "" },
            database: { type: "string", default: "" },
            username: { type: "string", default: "" },
            password: { type: "string", default: "" },
          },
          required: ["url"],
        },
      },
      required: ["connection"],
    },
    evaluate(constraint, entity) {
      const diags: Diagnostic[] = [];
      const name = entity.label || entity.id;
      const conn = entity.data.connection;
      const url = typeof conn === "object" && conn !== null
        ? (conn as Record<string, unknown>).url
        : undefined;

      if (typeof url !== "string" || url.trim().length === 0) {
        diags.push({
          code: constraint.id,
          severity: "error",
          message: `"${name}" connection requires a URL.`,
          entityId: entity.id,
        });
        return diags;
      }

      // Validate URL format — must be ws://, wss://, http://, or https://
      try {
        const parsed = new URL(url);
        if (!["ws:", "wss:", "http:", "https:"].includes(parsed.protocol)) {
          diags.push({
            code: constraint.id,
            severity: "error",
            message:
              `"${name}" connection URL must use ws://, wss://, http://, or https:// (got "${parsed.protocol}").`,
            entityId: entity.id,
          });
        }
      } catch {
        diags.push({
          code: constraint.id,
          severity: "error",
          message: `"${name}" connection URL is not a valid URL.`,
          entityId: entity.id,
        });
      }

      return diags;
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
 * Returns the constraint-config data schema for a constraint type, or null if unknown.
 * Used by the UI to render type-specific configuration fields on the constraint inspector.
 */
export function getConstraintDataSchema(type: string): ConstraintDataSchema | null {
  return registry[type]?.dataSchema ?? null;
}

/**
 * Returns the entity data schema for a constraint type, or null if the type
 * doesn't impose entity-level data requirements.
 * Used by the entity inspector to render schema-driven fields on `entity.data`.
 */
export function getEntityDataSchema(type: string): ConstraintDataSchema | null {
  return registry[type]?.entityDataSchema ?? null;
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
    const diags = def.evaluate(constraint, entity, ws);
    if (diags.length > 0) {
      map[app.entityId] = [...(map[app.entityId] ?? []), ...diags];
    }
  }
  return map;
}
