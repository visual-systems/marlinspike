/// <reference lib="dom" />
/**
 * Diff-based sync layer — compares previous and current WorkspaceState
 * and issues targeted SurrealDB operations for only what changed.
 */

import { type WorkspaceState } from "../workspace.ts";
import { exportDb, useDatabase, useUiDb } from "./surreal.ts";
import {
  type CanvasState,
  deleteApplication,
  deleteConstraint,
  deleteEdge,
  deleteTreeNode,
  flattenTree,
  saveApplication,
  saveCanvasState,
  saveConstraint,
  saveEdge,
  saveTreeNode,
  saveWorkspaceUi,
  type UiState,
} from "./operations.ts";
import { saveDump } from "./bridge.ts";

// ---------------------------------------------------------------------------
// Debounced sync entry point
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let prevState: WorkspaceState | null = null;
let syncing = false;
let lastSyncTime = 0;

const DEBOUNCE_MS = 500;
const EAGER_INTERVAL_MS = 2000;

/**
 * Schedule a sync of workspace state to SurrealDB.
 * Uses leading-edge + trailing-edge debounce: fires immediately if
 * EAGER_INTERVAL_MS has elapsed since the last sync, otherwise debounces.
 * This ensures edits are persisted quickly while avoiding excessive writes.
 */
export function scheduleSyncToDb(newState: WorkspaceState): void {
  if (syncTimer) clearTimeout(syncTimer);
  const prev = prevState;
  const now = Date.now();
  const elapsed = now - lastSyncTime;

  const doSync = async () => {
    syncing = true;
    try {
      await syncToDb(prev, newState);
      lastSyncTime = Date.now();
    } catch (err) {
      console.error("[sync] Failed to persist state:", err);
    }
    prevState = newState;
    syncing = false;
  };

  if (elapsed >= EAGER_INTERVAL_MS) {
    // Enough time since last sync — fire immediately
    doSync();
  } else {
    // Debounce — fire after DEBOUNCE_MS
    syncTimer = setTimeout(doSync, DEBOUNCE_MS);
  }
}

/** Immediately flush any pending sync. Returns when complete. */
export async function flushSync(currentState: WorkspaceState): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  // Wait for any in-flight sync to finish
  while (syncing) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const prev = prevState;
  try {
    await syncToDb(prev, currentState);
  } catch (err) {
    console.error("[sync] Flush failed:", err);
  }
  prevState = currentState;
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
  let graphChanged = false;
  let uiChanged = false;

  // If no previous state, this is a full write (shouldn't normally happen after init)
  if (!prev) {
    await syncGraphData(null, next);
    await syncCanvasState(null, next);
    await syncUiState(next);
    graphChanged = true;
    uiChanged = true;
  } else {
    // Sync graph data if any graph-related fields changed
    if (
      prev.treeNodes !== next.treeNodes ||
      prev.edges !== next.edges ||
      prev.constraints !== next.constraints ||
      prev.constraintApplications !== next.constraintApplications
    ) {
      await syncGraphData(prev, next);
      graphChanged = true;
    }

    // Sync canvas state if any per-database canvas fields changed
    if (
      prev.focusId !== next.focusId ||
      prev.canvasExpandedNodes !== next.canvasExpandedNodes ||
      prev.canvasNodePositions !== next.canvasNodePositions ||
      prev.canvasSelected !== next.canvasSelected ||
      prev.canvasAlgorithm !== next.canvasAlgorithm ||
      prev.entityDrafts !== next.entityDrafts
    ) {
      await syncCanvasState(prev, next);
      graphChanged = true;
    }

    // Sync global UI state if any UI-related fields changed
    if (
      prev.activeWorkspaceId !== next.activeWorkspaceId ||
      prev.panels !== next.panels ||
      prev.personas !== next.personas ||
      prev.activePersona !== next.activePersona ||
      prev.workflows !== next.workflows ||
      prev.activeWorkflow !== next.activeWorkflow ||
      prev.connectedGraphs !== next.connectedGraphs
    ) {
      await syncUiState(next);
      uiChanged = true;
    }
  }

  // Persist changed databases to IndexedDB via export/import bridge
  await persistDumps(next, graphChanged, uiChanged);
}

// ---------------------------------------------------------------------------
// Graph data sync
// ---------------------------------------------------------------------------

function getActiveDatabaseId(state: WorkspaceState): string {
  return state.databaseId;
}

async function syncGraphData(
  prev: WorkspaceState | null,
  next: WorkspaceState,
): Promise<void> {
  await useDatabase(getActiveDatabaseId(next));

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
// Canvas state sync (per-database, bulk write)
// ---------------------------------------------------------------------------

async function syncCanvasState(
  _prev: WorkspaceState | null,
  next: WorkspaceState,
): Promise<void> {
  await useDatabase(getActiveDatabaseId(next));
  const canvas: CanvasState = {
    focusId: next.focusId,
    canvasExpandedNodes: next.canvasExpandedNodes,
    canvasNodePositions: next.canvasNodePositions,
    canvasSelected: next.canvasSelected,
    canvasAlgorithm: next.canvasAlgorithm,
    entityDrafts: next.entityDrafts,
  };
  await saveCanvasState(canvas);
}

// ---------------------------------------------------------------------------
// UI state sync (global, bulk write)
// ---------------------------------------------------------------------------

async function syncUiState(state: WorkspaceState): Promise<void> {
  const uiState: UiState = {
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    activeWorkspaceId: state.activeWorkspaceId,
    panels: state.panels,
    personas: state.personas,
    activePersona: state.activePersona,
    workflows: state.workflows,
    activeWorkflow: state.activeWorkflow,
    connectedGraphs: state.connectedGraphs,
  };
  await saveWorkspaceUi(uiState);
}

// ---------------------------------------------------------------------------
// IndexedDB persistence bridge
// ---------------------------------------------------------------------------

async function persistDumps(
  state: WorkspaceState,
  graphChanged: boolean,
  uiChanged: boolean,
): Promise<void> {
  try {
    const databaseId = getActiveDatabaseId(state);

    if (graphChanged) {
      await useDatabase(databaseId);
      const graphDump = await exportDb();
      await saveDump(`db:${databaseId}`, graphDump);
      console.log(`[sync] Persisted db:${databaseId} (${graphDump.length} bytes)`);
    }

    if (uiChanged) {
      await useUiDb();
      const uiDump = await exportDb();
      await saveDump("ui", uiDump);
      console.log(`[sync] Persisted ui (${uiDump.length} bytes)`);
    }
  } catch (err) {
    console.error("[sync] Failed to persist dumps to IndexedDB:", err);
  }
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
