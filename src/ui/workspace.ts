/// <reference lib="dom" />
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { AlgorithmId } from "./lib/algorithms/index.ts";

export const PANEL_TYPES = ["tree", "constraints", "code"] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

export const PANEL_DEFAULT_WIDTH: Record<PanelType, number> = {
  tree: 300,
  constraints: 300,
  code: 600,
};

export const PANEL_MIN_WIDTH: Record<PanelType, number> = {
  tree: 200,
  constraints: 200,
  code: 300,
};

/** Unified selection — a panel or the canvas can select exactly one entity at a time. */
export type Selection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "constraint"; id: string }
  | null;

export interface Panel {
  id: string;
  type: PanelType;
  expandedNodes: string[];
  selected: Selection;
  inspectorSplit: number; // 0–1, fraction of body height given to inspector
  /** Code representation language; only used when type === "code". */
  codeLanguage?: string;
  /** Entity whose data this panel is viewing/editing as JSON. */
  codeEntityId?: string;
  codeEntityKind?: "node" | "edge";
  /** Persisted panel width in pixels. Falls back to PANEL_DEFAULT_WIDTH if omitted. */
  width?: number;
}

export interface Tab {
  id: string;
  /** Display name. Null means unnamed — UI shows "Untitled" as placeholder. */
  name: string | null;
  /** SurrealDB database identifier (UUID or "default" for the initial database). */
  databaseId: string;
  /** ID of this tab's workspace root node. Every tab's treeNodes has exactly one root. */
  rootNodeId: string;
  panels: Panel[];
}

/** Per-database state that gets swapped when switching tabs. */
export interface DatabaseSnapshot {
  treeNodes: TreeNode[];
  edges: Edge[];
  constraints: Constraint[];
  constraintApplications: ConstraintApplication[];
  focusId: string | null;
  canvasExpandedNodes: string[];
  canvasNodePositions: Record<string, { x: number; y: number; pinned?: boolean }>;
  canvasSelected: Selection;
  canvasAlgorithm: AlgorithmId;
  entityDrafts: Record<string, string>;
}

// Describes what kind of entities a constraint is relevant to.
// Discriminated union — more target types will be added in future (e.g. meta-constraints).
export type ConstraintTarget = {
  type: "entity";
  class: "node" | "edge" | "constraint";
};

export interface Constraint {
  id: string;
  label: string;
  uri?: string;
  type: string;
  /** Declared applicability — used by the UI to filter which entities can have this constraint. */
  targets: ConstraintTarget[];
  data: Record<string, unknown>;
  version: number;
}

export interface ConstraintApplication {
  id: string;
  constraintId: string;
  entityId: string;
  version: number;
}

export interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string;
  treeNodes: TreeNode[];
  edges: Edge[];
  constraints: Constraint[];
  constraintApplications: ConstraintApplication[];
  personas: string[];
  activePersona: string | null;
  workflows: string[];
  activeWorkflow: string | null;
  connectedGraphs: ConnectedGraph[];
  focusId: string | null;
  canvasExpandedNodes: string[];
  canvasNodePositions: Record<string, { x: number; y: number; pinned?: boolean }>;
  canvasSelected: Selection;
  canvasAlgorithm: AlgorithmId;
  /** Live unsaved edits keyed by entity ID. Shared between code panels and inspector. */
  entityDrafts: Record<string, string>;
  /** In-memory cache of other tabs' database snapshots. Not persisted. */
  _snapshotCache: Record<string, DatabaseSnapshot>;
}

export interface Port {
  name: string;
  direction: "in" | "out" | "inout";
  type?: string; // schema type identifier, e.g. "float", "io.http.request-response"
}

export interface TreeNode {
  id: string;
  label: string;
  uri?: string;
  kind: "leaf" | "composite";
  children: TreeNode[];
  ports?: Port[]; // declared input/output ports; absent = no port contract
  data: Record<string, unknown>;
  version: number;
}

export interface Edge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  data: Record<string, unknown>;
  version: number;
}

export interface ConnectedGraph {
  id: string;
  label: string;
  connected: boolean;
  required: boolean;
}

export type Updater = (fn: (s: WorkspaceState) => WorkspaceState) => void;

export interface ListEditorConfig {
  title: string;
  items: string[];
  onSave: (items: string[]) => void;
}

// ---------------------------------------------------------------------------
// Workspace root node
// ---------------------------------------------------------------------------

/** Create a workspace root node with the given ID and children. */
export function makeRootNode(id: string, children: TreeNode[]): TreeNode {
  return {
    id,
    label: "Workspace",
    kind: "composite",
    children,
    data: {},
    version: 1,
  };
}

/** Get the workspace root node from a WorkspaceState (via the active tab's rootNodeId). */
export function getWorkspaceRoot(ws: WorkspaceState): TreeNode | undefined {
  const rootId = getWorkspaceRootId(ws);
  if (!rootId) return ws.treeNodes[0];
  return ws.treeNodes.find((n) => n.id === rootId) ?? ws.treeNodes[0];
}

/**
 * Ensure treeNodes are wrapped in a root node.
 * If the tree already has a single root matching `rootNodeId`, returns as-is.
 * Otherwise wraps in a new root node. If no `rootNodeId` is provided, generates one.
 * Returns both the wrapped tree and the root ID used.
 */
export function ensureWorkspaceRoot(
  treeNodes: TreeNode[],
  rootNodeId?: string,
): { treeNodes: TreeNode[]; rootNodeId: string } {
  // Already wrapped — rootNodeId matches the single top-level node
  if (rootNodeId && treeNodes.length === 1 && treeNodes[0].id === rootNodeId) {
    return { treeNodes, rootNodeId };
  }
  // No rootNodeId but there's exactly one top-level node — treat it as the root
  // to avoid double-wrapping when rootNodeId is missing (pre-migration data that
  // was already wrapped by a previous session).
  if (!rootNodeId && treeNodes.length === 1) {
    return { treeNodes, rootNodeId: treeNodes[0].id };
  }
  // Need to wrap: either multiple top-level nodes or empty tree
  const id = rootNodeId ?? crypto.randomUUID();
  return { treeNodes: [makeRootNode(id, treeNodes)], rootNodeId: id };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function nodeHash(node: TreeNode): string {
  const s = node.label + node.kind + JSON.stringify(node.data) +
    node.children.map((c) => c.id).join("");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return undefined;
}

export function findParentOf(nodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const n of nodes) {
    if (n.children.some((c) => c.id === nodeId)) return n;
    const f = findParentOf(n.children, nodeId);
    if (f) return f;
  }
  return null;
}

export function findSiblings(treeNodes: TreeNode[], nodeId: string): TreeNode[] {
  const parent = findParentOf(treeNodes, nodeId);
  return parent
    ? parent.children.filter((c) => c.id !== nodeId)
    : treeNodes.filter((n) => n.id !== nodeId);
}

export function getEdgesIn(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.toId === nodeId);
}

export function getEdgesOut(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.fromId === nodeId);
}

export function collectSubtreeIds(node: TreeNode): Set<string> {
  const ids = new Set<string>();
  const visit = (n: TreeNode): void => {
    ids.add(n.id);
    for (const c of n.children) visit(c);
  };
  visit(node);
  return ids;
}

export function subgraphJson(
  node: TreeNode,
  edges: Edge[],
  constraints: Constraint[] = [],
  constraintApplications: ConstraintApplication[] = [],
): string {
  const ids = collectSubtreeIds(node);
  const internalEdges = edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
  const apps = constraintApplications.filter((a) => ids.has(a.entityId));
  const usedConstraintIds = new Set(apps.map((a) => a.constraintId));
  const internalConstraints = constraints.filter((c) => usedConstraintIds.has(c.id));
  return JSON.stringify(
    {
      root: node,
      edges: internalEdges,
      constraints: internalConstraints,
      constraintApplications: apps,
    },
    null,
    2,
  );
}

/** Returns the path from root to targetId inclusive, or [] if not found. */
export function findPath(nodes: TreeNode[], targetId: string): TreeNode[] {
  for (const n of nodes) {
    if (n.id === targetId) return [n];
    const child = findPath(n.children, targetId);
    if (child.length > 0) return [n, ...child];
  }
  return [];
}

/** Returns the root nodes for the current focus level.
 *  When unfocused, returns the workspace root's children (hiding the root itself).
 *  When focused on a node, returns that node's children. */
export function getFocusedRootNodes(ws: WorkspaceState): TreeNode[] {
  if (ws.focusId == null) {
    const root = getWorkspaceRoot(ws);
    return root?.children ?? ws.treeNodes;
  }
  return findNode(ws.treeNodes, ws.focusId)?.children ?? [];
}

/** Get the active tab's workspace root node ID.
 *  Falls back to treeNodes[0].id if rootNodeId isn't set (pre-migration data). */
export function getWorkspaceRootId(ws: WorkspaceState): string {
  const tabRootId = getActiveTab(ws).rootNodeId;
  if (tabRootId) return tabRootId;
  // Fallback: assume first top-level node is the root
  return ws.treeNodes[0]?.id ?? "";
}

export function getActiveTab(ws: WorkspaceState): Tab {
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? ws.tabs[0];
}

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

export function makeNode(
  id: string,
  label: string,
  kind: "leaf" | "composite",
  children: TreeNode[],
  uri?: string,
): TreeNode {
  return { id, label, kind, children, data: {}, version: 1, uri };
}

export function defaultTreeNodes(rootNodeId: string): TreeNode[] {
  return ensureWorkspaceRoot([
    makeNode("spike://acme/backend", "acme/backend", "composite", [
      makeNode("spike://acme/backend/auth-service", "auth-service", "composite", [
        makeNode(
          "spike://acme/backend/auth-service/token-validator",
          "token-validator",
          "leaf",
          [],
        ),
        makeNode("spike://acme/backend/auth-service/ingress", "ingress", "leaf", []),
      ]),
      makeNode("spike://acme/backend/frontend", "frontend", "composite", []),
    ], "spike://acme/backend"),
  ], rootNodeId).treeNodes;
}

export function defaultPanel(): Panel {
  return {
    id: crypto.randomUUID(),
    type: "tree",
    expandedNodes: [],
    selected: null,
    inspectorSplit: 0.5,
  };
}

export function defaultConstraintsPanel(): Panel {
  return {
    id: crypto.randomUUID(),
    type: "constraints",
    expandedNodes: [],
    selected: null,
    inspectorSplit: 0.5,
  };
}

export function defaultCodePanel(): Panel {
  return {
    id: crypto.randomUUID(),
    type: "code",
    expandedNodes: [],
    selected: null,
    inspectorSplit: 0.5,
    codeLanguage: "spike-clojure",
  };
}

export function defaultState(): WorkspaceState {
  const tabId = crypto.randomUUID();
  const rootNodeId = crypto.randomUUID();
  const treeNodes = defaultTreeNodes(rootNodeId);
  return {
    tabs: [{
      id: tabId,
      name: "Main",
      databaseId: DEFAULT_DB,
      rootNodeId,
      panels: [defaultPanel()],
    }],
    activeTabId: tabId,
    treeNodes,
    edges: [],
    constraints: [],
    constraintApplications: [],
    personas: ["Architect", "Developer", "Reviewer"],
    activePersona: "Architect",
    workflows: ["Explore", "Design", "Build"],
    activeWorkflow: "Explore",
    connectedGraphs: [{
      id: DEFAULT_DB,
      label: `localStorage/Default (${DEFAULT_DB.slice(0, 8)})`,
      connected: true,
      required: true,
    }],
    focusId: null,
    canvasExpandedNodes: treeNodes[0]?.children.map((n) => n.id) ?? [],
    canvasNodePositions: {},
    canvasSelected: null,
    canvasAlgorithm: "SDF",
    entityDrafts: {},
    _snapshotCache: {},
  };
}

// ---------------------------------------------------------------------------
// State load / save
// ---------------------------------------------------------------------------

export const STATE_KEY = "marlinspike.workspace";

function parseNode(raw: Record<string, unknown>): TreeNode {
  return {
    id: raw.id as string,
    label: raw.label as string,
    uri: raw.uri as string | undefined,
    kind: (raw.kind as "leaf" | "composite") ?? "leaf",
    children: ((raw.children as Record<string, unknown>[] | undefined) ?? []).map(parseNode),
    ports: raw.ports as Port[] | undefined,
    data: (raw.data as Record<string, unknown> | undefined) ?? {},
    version: (raw.version as number | undefined) ?? 1,
  };
}

function parsePanelType(raw: unknown): PanelType {
  return (PANEL_TYPES as readonly string[]).includes(raw as string) ? (raw as PanelType) : "tree";
}

function parseConstraint(raw: Record<string, unknown>): Constraint {
  return {
    id: raw.id as string,
    label: (raw.label as string | undefined) ?? "Unnamed",
    uri: raw.uri as string | undefined,
    type: (raw.type as string | undefined) ?? "label-required",
    targets: (raw.targets as ConstraintTarget[] | undefined) ?? [],
    data: (raw.data as Record<string, unknown> | undefined) ?? {},
    version: (raw.version as number | undefined) ?? 1,
  };
}

function parseConstraintApplication(raw: Record<string, unknown>): ConstraintApplication {
  return {
    id: raw.id as string,
    constraintId: raw.constraintId as string,
    entityId: raw.entityId as string,
    version: (raw.version as number | undefined) ?? 1,
  };
}

export function loadState(): WorkspaceState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const rawTabs = (parsed.tabs as Record<string, unknown>[] | undefined) ?? [];
      const tabs: Tab[] = rawTabs.map((t) => {
        const rawPanels = t.panels as Record<string, unknown>[] | undefined;
        const oldExpanded = t.expandedNodes as string[] | undefined;
        const panels: Panel[] = rawPanels
          ? rawPanels.map((p) => ({
            id: p.id as string,
            type: parsePanelType(p.type),
            expandedNodes: (p.expandedNodes as string[] | undefined) ?? [],
            selected: (p.selected as Selection | undefined) ?? null,
            inspectorSplit: (p.inspectorSplit as number | undefined) ?? 0.5,
            codeLanguage: (p.codeLanguage as string | undefined) ?? "spike-clojure",
            codeEntityId: p.codeEntityId as string | undefined,
            codeEntityKind: p.codeEntityKind as "node" | "edge" | undefined,
          }))
          : [{
            id: crypto.randomUUID(),
            type: "tree" as const,
            expandedNodes: oldExpanded ?? [],
            selected: null,
            inspectorSplit: 0.5,
          }];
        return {
          id: t.id as string,
          name: t.name as string,
          databaseId: (t.databaseId as string | undefined) ?? "default",
          rootNodeId: (t.rootNodeId as string | undefined) ?? "",
          panels,
        };
      });
      if (tabs.length === 0) return defaultState();
      const rawNodes = parsed.treeNodes as Record<string, unknown>[] | undefined;
      const parsedNodes = rawNodes ? rawNodes.map(parseNode) : [];
      // Ensure workspace root — backfill rootNodeId on tab if missing
      const existingRootId = tabs[0].rootNodeId || undefined;
      const wrapped = ensureWorkspaceRoot(
        parsedNodes.length > 0
          ? parsedNodes
          : defaultTreeNodes(existingRootId ?? crypto.randomUUID()),
        existingRootId,
      );
      const treeNodes = wrapped.treeNodes;
      // Backfill rootNodeId on all tabs (migration from before rootNodeId existed)
      for (const tab of tabs) {
        if (!tab.rootNodeId) tab.rootNodeId = wrapped.rootNodeId;
      }
      const ds = defaultState();
      // Validate focusId — clear if the referenced node no longer exists
      const rawFocusId = (parsed.focusId as string | null | undefined) ?? null;
      const focusId = rawFocusId && findNode(treeNodes, rawFocusId) ? rawFocusId : null;
      // Validate canvasExpandedNodes — drop IDs that no longer exist
      const rawExpanded = (parsed.canvasExpandedNodes as string[] | undefined) ?? [];
      const canvasExpandedNodes = rawExpanded.filter((id) => findNode(treeNodes, id) !== null);
      return {
        tabs,
        activeTabId: (parsed.activeTabId as string | undefined) ?? tabs[0].id,
        treeNodes,
        edges: (parsed.edges as Edge[] | undefined) ?? [],
        constraints: ((parsed.constraints as Record<string, unknown>[] | undefined) ?? []).map(
          parseConstraint,
        ),
        constraintApplications: (
          (parsed.constraintApplications as Record<string, unknown>[] | undefined) ?? []
        ).map(parseConstraintApplication),
        personas: (parsed.personas as string[] | undefined) ?? ds.personas,
        activePersona: (parsed.activePersona as string | null | undefined) ?? null,
        workflows: (parsed.workflows as string[] | undefined) ?? ds.workflows,
        activeWorkflow: (parsed.activeWorkflow as string | null | undefined) ?? null,
        connectedGraphs: (parsed.connectedGraphs as ConnectedGraph[] | undefined) ??
          ds.connectedGraphs,
        focusId,
        canvasExpandedNodes,
        canvasNodePositions: (parsed.canvasNodePositions as
          | Record<string, { x: number; y: number; pinned?: boolean }>
          | undefined) ?? {},
        canvasSelected: null,
        canvasAlgorithm: (parsed.canvasAlgorithm as AlgorithmId | undefined) ?? "SDF",
        entityDrafts: {},
        _snapshotCache: {},
      };
    }
  } catch {
    // ignore corrupt state
  }
  return defaultState();
}

// ---------------------------------------------------------------------------
// Async load (SurrealDB with localStorage migration)
// ---------------------------------------------------------------------------

import { exportDb, getDb, importDb, initSurreal, useDatabase, useUiDb } from "./db/surreal.ts";
import {
  buildTree,
  flattenTree,
  initGraphSchema,
  initUiSchema,
  listDatabases,
  loadAllApplications,
  loadAllConstraints,
  loadAllEdges,
  loadAllNodes,
  loadCanvasState,
  loadWorkspaceUi,
  saveApplication,
  saveCanvasState,
  saveConstraint,
  saveEdge,
  saveTreeNode,
  saveWorkspaceUi,
  type UiState,
} from "./db/operations.ts";
import { DEFAULT_DB } from "./db/surreal.ts";
import { loadDump, saveDump } from "./db/bridge.ts";

/**
 * Initialise SurrealDB and load workspace state.
 *
 * Startup sequence:
 *   1. Connect to mem://
 *   2. Restore _ui database from IndexedDB dump (if any)
 *   3. Read registry to find the active database
 *   4. Restore that database from its IndexedDB dump
 *   5. Load state from SurrealDB's in-memory tables
 *
 * On first run: migrates existing localStorage data, creates default DB.
 * Falls back to defaultState() if all sources are empty.
 */
export async function loadStateAsync(): Promise<WorkspaceState> {
  // 1. Initialise SurrealDB connection (mem://)
  await initSurreal();

  // 2. Restore _ui database from IndexedDB dump
  const uiDump = await loadDump("ui");
  if (uiDump) {
    console.log(`[init] Found _ui dump (${uiDump.length} bytes), importing...`);
    await useUiDb();
    await importDb(uiDump);
    console.log("[init] Restored _ui database from IndexedDB");
  } else {
    console.log("[init] No _ui dump found, initialising fresh schema");
    await initUiSchema();
  }

  // 3. Check if we have databases registered
  const dbs = await listDatabases();
  console.log("[init] Registered databases:", dbs.map((d) => `${d.name} (${d.uuid})`));
  const hasDefault = dbs.some((d) => d.name === "Default");

  if (!hasDefault) {
    // First launch — create default DB and attempt localStorage migration
    const defaultUuid = DEFAULT_DB;
    await initGraphSchema(defaultUuid);

    // Register it
    await useUiDb();
    const db = getDb();
    await db.query("CREATE db_registry SET name = 'Default', uuid = $uuid", {
      uuid: defaultUuid,
    });

    // Check for existing localStorage data to migrate
    const existingState = loadState();
    const rootChildren = getWorkspaceRoot(existingState)?.children ?? existingState.treeNodes;
    const hasExistingData = rootChildren.length > 0 &&
      !(rootChildren.length === 1 &&
        rootChildren[0].id === "spike://acme/backend");

    const stateToMigrate = hasExistingData ? existingState : defaultState();
    await migrateToSurreal(stateToMigrate);

    // Persist initial dumps to IndexedDB
    await persistInitialDumps(defaultUuid);

    // Clear localStorage after successful migration
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      // Ignore — may not have access to localStorage
    }

    return {
      ...stateToMigrate,
      tabs: stateToMigrate.tabs.map((t) => ({
        ...t,
        databaseId: t.databaseId ?? defaultUuid,
      })),
      connectedGraphs: [{
        id: defaultUuid,
        label: `localStorage/Default (${defaultUuid.slice(0, 8)})`,
        connected: true,
        required: true,
      }],
      _snapshotCache: stateToMigrate._snapshotCache ?? {},
    };
  }

  // 4. Load UI state to find active tab / database
  const uiState = await loadWorkspaceUi();
  let activeDatabaseId = DEFAULT_DB;
  if (uiState) {
    console.log("[init] UI state loaded:", {
      activeTabId: uiState.activeTabId,
      tabCount: uiState.tabs.length,
      tabs: uiState.tabs.map((t: Tab) => ({
        id: t.id.slice(0, 8),
        name: t.name,
        databaseId: t.databaseId?.slice(0, 8),
      })),
    });
    const activeTab = uiState.tabs.find((t: Tab) => t.id === uiState.activeTabId) ??
      uiState.tabs[0];
    if (activeTab?.databaseId) {
      activeDatabaseId = activeTab.databaseId;
    }
  } else {
    console.log("[init] No UI state found in _ui database");
  }

  // 5. Restore active graph database from IndexedDB dump
  console.log(`[init] Active database: ${activeDatabaseId}`);
  const graphDump = await loadDump(`db:${activeDatabaseId}`);
  if (graphDump) {
    console.log(
      `[init] Found graph dump for ${activeDatabaseId} (${graphDump.length} bytes), importing...`,
    );
    await useDatabase(activeDatabaseId);
    await importDb(graphDump);
    console.log(`[init] Restored database ${activeDatabaseId} from IndexedDB`);
  } else {
    console.log(`[init] No dump found for db:${activeDatabaseId}, initialising fresh schema`);
    await initGraphSchema(activeDatabaseId);
  }

  // 6. Load graph data from SurrealDB
  await useDatabase(activeDatabaseId);
  const [flatNodes, edges, constraints, applications] = await Promise.all([
    loadAllNodes(),
    loadAllEdges(),
    loadAllConstraints(),
    loadAllApplications(),
  ]);

  console.log("[init] Loaded from SurrealDB:", {
    nodes: flatNodes.length,
    edges: edges.length,
    constraints: constraints.length,
    applications: applications.length,
  });

  // Ensure workspace root — backfill rootNodeId on tabs if missing
  const existingRootId =
    uiState?.tabs?.find((t: Tab) => t.id === uiState.activeTabId)?.rootNodeId ||
    undefined;
  const wrapped = ensureWorkspaceRoot(buildTree(flatNodes), existingRootId);
  const treeNodes = wrapped.treeNodes;
  const canvasState = await loadCanvasState();
  console.log("[init] Canvas state:", canvasState ? "found" : "not found");

  if (uiState) {
    // Backfill databaseId and rootNodeId on tabs that predate these fields.
    // Only the active tab gets the wrapped rootNodeId — inactive tabs will get
    // their rootNodeId when their database is loaded via loadDatabaseSnapshot.
    const activeTabId = uiState.activeTabId;
    const tabs = uiState.tabs.map((t: Tab) => ({
      ...t,
      databaseId: t.databaseId ?? DEFAULT_DB,
      rootNodeId: t.rootNodeId || (t.id === activeTabId ? wrapped.rootNodeId : ""),
    }));
    // Update connectedGraphs to show current database
    const activeTab = tabs.find((t: Tab) => t.id === uiState.activeTabId) ?? tabs[0];
    const dbEntry = dbs.find((d) => d.uuid === activeTab?.databaseId);
    const connectedGraphs = [{
      id: activeTab?.databaseId ?? DEFAULT_DB,
      label: `localStorage/${dbEntry?.name ?? "Default"} (${
        (activeTab?.databaseId ?? DEFAULT_DB).slice(0, 8)
      })`,
      connected: true,
      required: true,
    }];

    const ds = defaultState();
    return {
      ...ds,
      // UI-only fields from SurrealDB (tabs, personas, workflows, etc.)
      // Spread first so explicit graph/canvas fields below take precedence.
      ...uiState,
      // Graph data loaded from SurrealDB — must override any stale fields in uiState
      treeNodes,
      edges: normaliseEdges(edges),
      constraints,
      constraintApplications: applications,
      // Overrides
      tabs,
      connectedGraphs,
      focusId: canvasState?.focusId ?? null,
      canvasExpandedNodes: canvasState?.canvasExpandedNodes ?? ds.canvasExpandedNodes,
      canvasNodePositions: canvasState?.canvasNodePositions ?? {},
      canvasSelected: canvasState?.canvasSelected ?? null,
      canvasAlgorithm: canvasState?.canvasAlgorithm ?? ds.canvasAlgorithm,
      entityDrafts: canvasState?.entityDrafts ?? {},
      _snapshotCache: {},
    };
  }

  // No UI state saved yet — return defaults with loaded graph data
  const ds = defaultState();
  return {
    ...ds,
    treeNodes,
    edges: normaliseEdges(edges),
    constraints,
    constraintApplications: applications,
  };
}

/** Persist the initial SurrealDB state to IndexedDB after migration. */
async function persistInitialDumps(graphDatabaseId: string): Promise<void> {
  try {
    await useDatabase(graphDatabaseId);
    const graphDump = await exportDb();
    await saveDump(`db:${graphDatabaseId}`, graphDump);

    await useUiDb();
    const uiDumpStr = await exportDb();
    await saveDump("ui", uiDumpStr);

    console.log("[init] Persisted initial dumps to IndexedDB");
  } catch (err) {
    console.error("[init] Failed to persist initial dumps:", err);
  }
}

/** Load graph + canvas data for a specific database. Restores from IndexedDB dump if needed. */
export async function loadDatabaseSnapshot(
  databaseId: string,
  rootNodeId?: string,
): Promise<DatabaseSnapshot> {
  console.log(`[snapshot] Loading database ${databaseId}...`);
  // Restore from IndexedDB dump if this database hasn't been loaded yet
  const dump = await loadDump(`db:${databaseId}`);
  if (dump) {
    console.log(`[snapshot] Found dump for ${databaseId} (${dump.length} bytes), importing...`);
    await useDatabase(databaseId);
    await importDb(dump);
    console.log(`[snapshot] Restored database ${databaseId} from IndexedDB`);
  } else {
    console.log(`[snapshot] No dump found for db:${databaseId}, initialising fresh schema`);
    await initGraphSchema(databaseId);
  }

  await useDatabase(databaseId);
  const [flatNodes, edges, constraints, applications] = await Promise.all([
    loadAllNodes(),
    loadAllEdges(),
    loadAllConstraints(),
    loadAllApplications(),
  ]);
  console.log(`[snapshot] Loaded from SurrealDB:`, {
    nodes: flatNodes.length,
    edges: edges.length,
    constraints: constraints.length,
    applications: applications.length,
  });
  const canvasState = await loadCanvasState();
  const ds = defaultState();
  return {
    treeNodes: ensureWorkspaceRoot(buildTree(flatNodes), rootNodeId || undefined).treeNodes,
    edges: normaliseEdges(edges),
    constraints,
    constraintApplications: applications,
    focusId: canvasState?.focusId ?? null,
    canvasExpandedNodes: canvasState?.canvasExpandedNodes ?? ds.canvasExpandedNodes,
    canvasNodePositions: canvasState?.canvasNodePositions ?? {},
    canvasSelected: canvasState?.canvasSelected ?? null,
    canvasAlgorithm: canvasState?.canvasAlgorithm ?? ds.canvasAlgorithm,
    entityDrafts: canvasState?.entityDrafts ?? {},
  };
}

/**
 * Normalise edge records coming from SurrealDB.
 * Record link fields like fromId/toId may come back as record objects
 * rather than plain strings.
 */
function normaliseEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => ({
    ...e,
    id: recordIdToString(e.id),
    fromId: recordIdToString(e.fromId),
    toId: recordIdToString(e.toId),
  }));
}

/** Convert a SurrealDB record ID (e.g. "tree_node:abc") to just the id part. */
function recordIdToString(val: unknown): string {
  if (typeof val === "string") {
    // Strip table prefix if present: "tree_node:abc" → "abc"
    const colonIdx = (val as string).indexOf(":");
    if (colonIdx >= 0 && (val as string).startsWith("tree_node:")) {
      return (val as string).slice(colonIdx + 1);
    }
    return val as string;
  }
  // SurrealDB SDK may return RecordId objects with .toString()
  if (val && typeof val === "object" && "toString" in val) {
    return recordIdToString(String(val));
  }
  return String(val);
}

/** Write a full WorkspaceState into SurrealDB (used for initial migration). */
async function migrateToSurreal(state: WorkspaceState): Promise<void> {
  // Write graph data to the default database
  await useDatabase(DEFAULT_DB);

  const flatNodes = flattenTree(state.treeNodes);
  for (const node of flatNodes) {
    await saveTreeNode(node);
  }
  for (const edge of state.edges) {
    await saveEdge(edge);
  }
  for (const constraint of state.constraints) {
    await saveConstraint(constraint);
  }
  for (const app of state.constraintApplications) {
    await saveApplication(app);
  }

  // Write canvas state to the graph database
  await saveCanvasState({
    focusId: state.focusId,
    canvasExpandedNodes: state.canvasExpandedNodes,
    canvasNodePositions: state.canvasNodePositions,
    canvasSelected: state.canvasSelected,
    canvasAlgorithm: state.canvasAlgorithm,
    entityDrafts: state.entityDrafts,
  });

  // Write global UI state
  const uiState: UiState = {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    personas: state.personas,
    activePersona: state.activePersona,
    workflows: state.workflows,
    activeWorkflow: state.activeWorkflow,
    connectedGraphs: state.connectedGraphs,
  };
  await saveWorkspaceUi(uiState);
}

// ---------------------------------------------------------------------------
// State update helpers
// ---------------------------------------------------------------------------

export function withPanel(
  ws: WorkspaceState,
  tabId: string,
  panelId: string,
  fn: (p: Panel) => Panel,
): WorkspaceState {
  return {
    ...ws,
    tabs: ws.tabs.map((t) =>
      t.id === tabId ? { ...t, panels: t.panels.map((p) => p.id === panelId ? fn(p) : p) } : t
    ),
  };
}

export function withNodeMutation(
  ws: WorkspaceState,
  fn: (nodes: TreeNode[]) => TreeNode[],
): WorkspaceState {
  return { ...ws, treeNodes: fn(ws.treeNodes) };
}

export function updateNodeInTree(
  nodes: TreeNode[],
  nodeId: string,
  fn: (n: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === nodeId) return fn(n);
    return { ...n, children: updateNodeInTree(n.children, nodeId, fn) };
  });
}

export function removeNodeFromTree(nodes: TreeNode[], nodeId: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => ({ ...n, children: removeNodeFromTree(n.children, nodeId) }));
}

export function withConstraintMutation(
  ws: WorkspaceState,
  fn: (constraints: Constraint[]) => Constraint[],
): WorkspaceState {
  return { ...ws, constraints: fn(ws.constraints) };
}

export function withApplicationMutation(
  ws: WorkspaceState,
  fn: (apps: ConstraintApplication[]) => ConstraintApplication[],
): WorkspaceState {
  return { ...ws, constraintApplications: fn(ws.constraintApplications) };
}

/** Collect all node and edge IDs that a constraint is applied to via ConstraintApplication. */
export function getAppliedEntityIds(
  apps: ConstraintApplication[],
  constraintId: string,
): string[] {
  return apps.filter((a) => a.constraintId === constraintId).map((a) => a.entityId);
}

/** Collect all constraints applied to a given entity. */
export function getConstraintsForEntity(
  apps: ConstraintApplication[],
  constraints: Constraint[],
  entityId: string,
): Constraint[] {
  const constraintIds = new Set(
    apps.filter((a) => a.entityId === entityId).map((a) => a.constraintId),
  );
  return constraints.filter((c) => constraintIds.has(c.id));
}
