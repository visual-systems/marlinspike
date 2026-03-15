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

// ---------------------------------------------------------------------------
// Evaluator registry
// ---------------------------------------------------------------------------

const evaluators: Record<string, Evaluator> = {
  "label-required"(constraint, entity) {
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

  "max-children"(constraint, entity) {
    const max = typeof constraint.data.max === "number" ? constraint.data.max : 5;
    if (!("children" in entity) || !Array.isArray(entity.children)) return [];
    if (entity.children.length <= max) return [];
    return [
      {
        code: constraint.id,
        severity: "warning",
        message: `"${
          entity.label || entity.id
        }" has ${entity.children.length} children (max ${max}).`,
        entityId: entity.id,
      },
    ];
  },
};

/** Returns the type strings of all currently registered evaluators. */
export function registeredConstraintTypes(): string[] {
  return Object.keys(evaluators);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
    const evaluate = evaluators[constraint.type];
    if (!evaluate) continue;
    const diags = evaluate(constraint, entity);
    if (diags.length > 0) {
      map[app.entityId] = [...(map[app.entityId] ?? []), ...diags];
    }
  }
  return map;
}
