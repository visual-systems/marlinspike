/// <reference lib="dom" />
/**
 * Diff-based sync layer — compares previous and current WorkspaceState
 * and issues targeted SurrealDB operations for only what changed.
 */

import type { WorkspaceState } from "../workspace.ts";
import { useDatabase } from "./surreal.ts";
import { DEFAULT_DB } from "./surreal.ts";
import {
  deleteApplication,
  deleteConstraint,
  deleteEdge,
  deleteTreeNode,
  flattenTree,
  saveApplication,
  saveConstraint,
  saveEdge,
  saveTreeNode,
  saveWorkspaceUi,
  type UiState,
} from "./operations.ts";

// ---------------------------------------------------------------------------
// Debounced sync entry point
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let prevState: WorkspaceState | null = null;

const DEBOUNCE_MS = 500;

/**
 * Schedule a debounced sync of workspace state to SurrealDB.
 * Only the diff between prevState and newState is written.
 */
export function scheduleSyncToDb(newState: WorkspaceState): void {
  if (syncTimer) clearTimeout(syncTimer);
  const prev = prevState;
  syncTimer = setTimeout(async () => {
    try {
      await syncToDb(prev, newState);
    } catch (err) {
      console.error("[sync] Failed to persist state:", err);
    }
    prevState = newState;
  }, DEBOUNCE_MS);
}

/** Set the initial state for diffing (called after loadStateAsync). */
export function setSyncBaseline(state: WorkspaceState): void {
  prevState = state;
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

async function syncToDb(
  prev: WorkspaceState | null,
  next: WorkspaceState,
): Promise<void> {
  // If no previous state, this is a full write (shouldn't normally happen after init)
  if (!prev) {
    await syncGraphData(null, next);
    await syncUiState(next);
    return;
  }

  // Sync graph data if any graph-related fields changed
  if (
    prev.treeNodes !== next.treeNodes ||
    prev.edges !== next.edges ||
    prev.constraints !== next.constraints ||
    prev.constraintApplications !== next.constraintApplications
  ) {
    await syncGraphData(prev, next);
  }

  // Sync UI state if any UI-related fields changed
  if (
    prev.tabs !== next.tabs ||
    prev.activeTabId !== next.activeTabId ||
    prev.personas !== next.personas ||
    prev.activePersona !== next.activePersona ||
    prev.workflows !== next.workflows ||
    prev.activeWorkflow !== next.activeWorkflow ||
    prev.connectedGraphs !== next.connectedGraphs ||
    prev.focusId !== next.focusId ||
    prev.canvasExpandedNodes !== next.canvasExpandedNodes ||
    prev.canvasNodePositions !== next.canvasNodePositions ||
    prev.canvasSelected !== next.canvasSelected ||
    prev.canvasAlgorithm !== next.canvasAlgorithm ||
    prev.entityDrafts !== next.entityDrafts
  ) {
    await syncUiState(next);
  }
}

// ---------------------------------------------------------------------------
// Graph data sync
// ---------------------------------------------------------------------------

async function syncGraphData(
  prev: WorkspaceState | null,
  next: WorkspaceState,
): Promise<void> {
  await useDatabase(DEFAULT_DB);

  // Tree nodes — compare flat representations
  if (!prev || prev.treeNodes !== next.treeNodes) {
    const prevFlat = prev ? flattenTree(prev.treeNodes) : [];
    const nextFlat = flattenTree(next.treeNodes);
    await syncCollection(prevFlat, nextFlat, saveTreeNode, deleteTreeNode);
  }

  // Edges
  if (!prev || prev.edges !== next.edges) {
    await syncCollection(prev?.edges ?? [], next.edges, saveEdge, deleteEdge);
  }

  // Constraints
  if (!prev || prev.constraints !== next.constraints) {
    await syncCollection(
      prev?.constraints ?? [],
      next.constraints,
      saveConstraint,
      deleteConstraint,
    );
  }

  // Constraint applications
  if (!prev || prev.constraintApplications !== next.constraintApplications) {
    await syncCollection(
      prev?.constraintApplications ?? [],
      next.constraintApplications,
      saveApplication,
      deleteApplication,
    );
  }
}

// ---------------------------------------------------------------------------
// UI state sync (bulk write — small data, changes frequently)
// ---------------------------------------------------------------------------

async function syncUiState(state: WorkspaceState): Promise<void> {
  const uiState: UiState = {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    personas: state.personas,
    activePersona: state.activePersona,
    workflows: state.workflows,
    activeWorkflow: state.activeWorkflow,
    connectedGraphs: state.connectedGraphs,
    focusId: state.focusId,
    canvasExpandedNodes: state.canvasExpandedNodes,
    canvasNodePositions: state.canvasNodePositions,
    canvasSelected: state.canvasSelected,
    canvasAlgorithm: state.canvasAlgorithm,
    entityDrafts: state.entityDrafts,
  };
  await saveWorkspaceUi(uiState);
}

// ---------------------------------------------------------------------------
// Generic collection sync
// ---------------------------------------------------------------------------

interface Identifiable {
  id: string;
  version?: number;
}

async function syncCollection<T extends Identifiable>(
  prev: T[],
  next: T[],
  save: (item: T) => Promise<void>,
  remove: (id: string) => Promise<void>,
): Promise<void> {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));

  // Additions and updates
  for (const [id, item] of nextById) {
    const prevItem = prevById.get(id);
    if (!prevItem || prevItem !== item) {
      await save(item);
    }
  }

  // Deletions
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      await remove(id);
    }
  }
}
