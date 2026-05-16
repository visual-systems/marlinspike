/// <reference lib="dom" />
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { AlgorithmId } from "./lib/algorithms/index.ts";

// Re-export graph types and functions from @marlinspike/graph
export type { Edge, Port, TreeNode } from "@marlinspike/graph";
export {
  collectSubtreeIds,
  findNode,
  findParentOf,
  findPath,
  findSiblings,
  getEdgesIn,
  getEdgesOut,
  isRef,
  makeNode,
  makeRefNode,
  makeRootNode,
  nodeHash,
  removeNodeFromTree,
  updateNodeInTree,
} from "@marlinspike/graph";
import type { Edge, Port, TreeNode } from "@marlinspike/graph";
import { collectSubtreeIds, findNode, makeRootNode } from "@marlinspike/graph";

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
  /** @deprecated — database ID is now on WorkspaceState. Kept for migration only. */
  databaseId?: string;
  /** ID of this tab's workspace root node. Every tab's treeNodes has exactly one root. */
  rootNodeId: string;
  /** Workspace node ID that this tab considers "home" — used for the home indicator at root level. */
  homeWorkspaceId?: string;
  panels: Panel[];
}

// DatabaseSnapshot removed — single-graph model, no per-tab database swap.

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
  profiles: Profile[];
  activeProfileId: string;
  /** SurrealDB database identifier for the profile's single graph database. */
  databaseId: string;
  /** ID of the profile root node in treeNodes. */
  profileRootId: string;
  /** ID of the active workspace node (child of profile root). Tabs are derived from the tree. */
  activeWorkspaceId: string;
  /** Panel layout for the currently active workspace. Resets on workspace switch. */
  panels: Panel[];
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
  /** When true, overlay virtual edges showing ref→target relationships. */
  canvasShowRefEdges: boolean;
  /** Live unsaved edits keyed by entity ID. Shared between code panels and inspector. */
  entityDrafts: Record<string, string>;
}

// Port, TreeNode, isRef, Edge — re-exported from @marlinspike/graph above

export interface ConnectedGraph {
  id: string;
  label: string;
  connected: boolean;
  required: boolean;
}

export interface Profile {
  id: string;
  name: string;
  /** Connection URL. Local: `indxdb://marlinspike`, remote: `wss://...` or `https://...` */
  url: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
  /** Whether this is the built-in default profile (cannot be deleted). */
  isDefault?: boolean;
  /** SurrealDB database UUID for this profile's graph data. */
  localDatabaseId?: string;
}

export const DEFAULT_PROFILE: Profile = {
  id: "default",
  name: "Local",
  url: "indxdb://marlinspike",
  namespace: "marlinspike",
  isDefault: true,
};

/** Extract the database ID from a local profile URL (indxdb:// or indexdb://). */
export function localDbIdFromUrl(url: string): string | null {
  const match = url.match(/^ind(?:x|ex)db:\/\/(.+)$/);
  return match ? match[1] : null;
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

// makeRootNode — re-exported from @marlinspike/graph above

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

/**
 * Ensure the workspace constraint exists and is applied to the workspace root.
 * Idempotent — returns inputs unchanged if already present.
 */
export function ensureWorkspaceConstraint(
  constraints: Constraint[],
  constraintApplications: ConstraintApplication[],
  rootNodeId: string,
): { constraints: Constraint[]; constraintApplications: ConstraintApplication[] } {
  const cId = WORKSPACE_CONSTRAINT.id;
  const hasConstraint = constraints.some((c) => c.id === cId);
  const hasApplication = constraintApplications.some(
    (a) => a.constraintId === cId && a.entityId === rootNodeId,
  );
  return {
    constraints: hasConstraint ? constraints : [...constraints, WORKSPACE_CONSTRAINT],
    constraintApplications: hasApplication ? constraintApplications : [...constraintApplications, {
      id: crypto.randomUUID(),
      constraintId: cId,
      entityId: rootNodeId,
      version: 1,
    }],
  };
}

/**
 * Ensure a profile root node exists wrapping all workspace nodes.
 * If treeNodes already has a single node with the profile constraint applied,
 * returns as-is. Otherwise wraps all existing nodes under a new profile root.
 */
export function ensureProfileRoot(
  treeNodes: TreeNode[],
  constraints: Constraint[],
  constraintApplications: ConstraintApplication[],
  profileRootId?: string,
  profileLabel = "Local",
): {
  treeNodes: TreeNode[];
  profileRootId: string;
  constraints: Constraint[];
  constraintApplications: ConstraintApplication[];
} {
  const pId = PROFILE_CONSTRAINT.id;
  // Check if profile root already exists
  if (treeNodes.length === 1) {
    const isProfile = constraintApplications.some(
      (a) => a.constraintId === pId && a.entityId === treeNodes[0].id,
    );
    if (isProfile) {
      return {
        treeNodes,
        profileRootId: treeNodes[0].id,
        constraints,
        constraintApplications,
      };
    }
  }

  // Wrap all existing nodes under a new profile root
  const id = profileRootId ?? crypto.randomUUID();
  const profileRoot = makeRootNode(id, treeNodes, profileLabel);
  const hasConstraint = constraints.some((c) => c.id === pId);
  return {
    treeNodes: [profileRoot],
    profileRootId: id,
    constraints: hasConstraint ? constraints : [...constraints, PROFILE_CONSTRAINT],
    constraintApplications: [...constraintApplications, {
      id: crypto.randomUUID(),
      constraintId: pId,
      entityId: id,
      version: 1,
    }],
  };
}

/**
 * Read the connection config from the workspace root node's data.
 * Returns null if the root has no connections constraint applied
 * or if the URL is empty (purely local workspace).
 */
export function getConnectionConfig(
  ws: WorkspaceState,
): {
  entityId: string;
  url: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
} | null {
  const rootId = getWorkspaceRootId(ws);
  const cId = CONNECTIONS_CONSTRAINT.id;
  const app = ws.constraintApplications.find(
    (a) => a.constraintId === cId && a.entityId === rootId,
  );
  if (!app) return null;
  const root = getWorkspaceRoot(ws);
  if (!root) return null;
  const conn = root.data.connection;
  if (typeof conn !== "object" || conn === null) return null;
  const c = conn as Record<string, unknown>;
  const url = typeof c.url === "string" ? c.url.trim() : "";
  if (!url) return null;
  return {
    entityId: rootId,
    url,
    namespace: typeof c.namespace === "string" ? c.namespace || undefined : undefined,
    database: typeof c.database === "string" ? c.database || undefined : undefined,
    username: typeof c.username === "string" ? c.username || undefined : undefined,
    password: typeof c.password === "string" ? c.password || undefined : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// nodeHash, findNode, findParentOf, findSiblings, getEdgesIn, getEdgesOut,
// collectSubtreeIds — re-exported from @marlinspike/graph above

/**
 * Validate that focusId is within the active workspace's subtree.
 * Returns focusId if valid, otherwise falls back to workspaceId.
 */
function validateFocusForWorkspace(
  focusId: string | null,
  workspaceId: string,
  treeNodes: TreeNode[],
): string {
  if (!focusId) return workspaceId;
  if (focusId === workspaceId) return focusId;
  const wsNode = findNode(treeNodes, workspaceId);
  if (!wsNode) return workspaceId;
  // Check if focusId is a descendant of the workspace node
  if (collectSubtreeIds(wsNode).has(focusId)) return focusId;
  return workspaceId;
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

// findPath — re-exported from @marlinspike/graph above

/** Returns the root nodes for the current focus level.
 *  - focusId === null: returns treeNodes as-is (shows the workspace root on the canvas,
 *    allowing the user to inspect it). This is the "virtual root" level.
 *  - focusId === workspaceRootId: returns the workspace root's children (the default view).
 *  - focusId === other: returns that node's children. */
export function getFocusedRootNodes(ws: WorkspaceState): TreeNode[] {
  if (ws.focusId == null) {
    return ws.treeNodes;
  }
  const node = findNode(ws.treeNodes, ws.focusId);
  if (!node) {
    console.warn(
      `[getFocusedRootNodes] focusId "${ws.focusId}" not found in tree — returning []`,
    );
  }
  return node?.children ?? [];
}

/** Get the active workspace's root node ID. */
export function getWorkspaceRootId(ws: WorkspaceState): string {
  return ws.activeWorkspaceId;
}

/** Computed tab view — derived from the active workspace node + panels.
 *  NOT persisted. Components receive this instead of a stored Tab. */
export function getActiveTab(ws: WorkspaceState): Tab {
  const profileRoot = findNode(ws.treeNodes, ws.profileRootId);
  const wsNode = profileRoot?.children.find((c) => c.id === ws.activeWorkspaceId) ??
    profileRoot?.children[0];
  return {
    id: wsNode?.id ?? ws.activeWorkspaceId,
    name: wsNode?.label === "Untitled" ? null : (wsNode?.label ?? null),
    rootNodeId: wsNode?.id ?? ws.activeWorkspaceId,
    panels: ws.panels,
  };
}

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

// makeNode, makeRefNode — re-exported from @marlinspike/graph above

export function defaultTreeNodes(rootNodeId: string): TreeNode[] {
  return ensureWorkspaceRoot([], rootNodeId).treeNodes;
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

/**
 * Create graph/tab state for a fresh profile — empty workspace under a profile root.
 * Used for both default state and new profile creation.
 */
export function freshProfileState(
  profileLabel: string,
  databaseId: string,
): ProfileStateFields {
  const rootNodeId = crypto.randomUUID();
  const profileRootId = crypto.randomUUID();
  const workspaceNodes = defaultTreeNodes(rootNodeId);
  const profileRoot = makeRootNode(profileRootId, workspaceNodes, profileLabel);
  return {
    databaseId,
    profileRootId,
    activeWorkspaceId: rootNodeId,
    panels: [defaultPanel()],
    treeNodes: [profileRoot],
    edges: [],
    constraints: [PROFILE_CONSTRAINT, WORKSPACE_CONSTRAINT],
    constraintApplications: [
      {
        id: crypto.randomUUID(),
        constraintId: PROFILE_CONSTRAINT.id,
        entityId: profileRootId,
        version: 1,
      },
      {
        id: crypto.randomUUID(),
        constraintId: WORKSPACE_CONSTRAINT.id,
        entityId: rootNodeId,
        version: 1,
      },
    ],
    focusId: rootNodeId,
    canvasExpandedNodes: [],
    canvasNodePositions: {},
    canvasSelected: null,
    canvasAlgorithm: "SDF",
    canvasShowRefEdges: false,
    entityDrafts: {},
    connectedGraphs: [{
      id: databaseId,
      label: `localStorage/${profileLabel} (${databaseId})`,
      connected: true,
      required: true,
    }],
  };
}

type ProfileStateFields = Pick<
  WorkspaceState,
  | "databaseId"
  | "profileRootId"
  | "activeWorkspaceId"
  | "panels"
  | "treeNodes"
  | "edges"
  | "constraints"
  | "constraintApplications"
  | "focusId"
  | "canvasExpandedNodes"
  | "canvasNodePositions"
  | "canvasSelected"
  | "canvasAlgorithm"
  | "canvasShowRefEdges"
  | "entityDrafts"
  | "connectedGraphs"
>;

/**
 * Load a profile's graph state from its SurrealDB database (via IndexedDB dump).
 * Falls back to freshProfileState() if the database has no saved data.
 */
export async function loadProfileState(
  dbId: string,
  profileName: string,
): Promise<ProfileStateFields> {
  // Restore graph database from IndexedDB dump
  const graphDump = await loadDump(`db:${dbId}`);
  if (graphDump) {
    console.log(`[profile] Found dump for ${dbId} (${graphDump.length} bytes), importing...`);
    await useDatabase(dbId);
    await importDb(graphDump);
  } else {
    console.log(`[profile] No dump for db:${dbId}, initialising fresh schema`);
    await initGraphSchema(dbId);
  }

  // Load graph data from SurrealDB
  await useDatabase(dbId);
  const [flatNodes, edges, constraints, applications] = await Promise.all([
    loadAllNodes(),
    loadAllEdges(),
    loadAllConstraints(),
    loadAllApplications(),
  ]);

  console.log("[profile] Loaded from SurrealDB:", {
    nodes: flatNodes.length,
    edges: edges.length,
    constraints: constraints.length,
    applications: applications.length,
  });

  // If database is empty, return fresh state for a new profile
  if (flatNodes.length === 0 && edges.length === 0) {
    console.log("[profile] Empty database — returning fresh state");
    return freshProfileState(profileName, dbId);
  }

  // Reconstruct tree — ensure profile root wraps workspace nodes
  const tree = buildTree(flatNodes);
  const profile = ensureProfileRoot(
    tree,
    constraints,
    applications,
    undefined,
    profileName,
  );

  // Find the first workspace root inside the profile root (child with workspace constraint)
  const profileRoot = profile.treeNodes[0];
  const wsConstraintId = WORKSPACE_CONSTRAINT.id;
  const workspaceRoot = profileRoot.children.find((child) =>
    profile.constraintApplications.some(
      (a) => a.constraintId === wsConstraintId && a.entityId === child.id,
    )
  ) ?? profileRoot.children[0];
  const workspaceRootId = workspaceRoot?.id ?? profileRoot.id;

  // Ensure workspace constraint exists on the workspace root (not the profile root)
  const wsConstraint = ensureWorkspaceConstraint(
    profile.constraints,
    profile.constraintApplications,
    workspaceRootId,
  );

  // Load canvas state
  const canvasState = await loadCanvasState();

  // Derive active workspace from the stored focusId if it belongs to a workspace
  // in this profile, otherwise fall back to the first workspace.
  let activeWorkspaceId = workspaceRootId;
  const storedFocusId = canvasState?.focusId ?? null;
  if (storedFocusId && profileRoot.children.length > 0) {
    // Check if focusId is (or is within) one of the workspace children
    for (const ws of profileRoot.children) {
      if (ws.id === storedFocusId || collectSubtreeIds(ws).has(storedFocusId)) {
        activeWorkspaceId = ws.id;
        break;
      }
    }
  }

  return {
    databaseId: dbId,
    profileRootId: profile.profileRootId,
    activeWorkspaceId,
    panels: [defaultPanel()],
    treeNodes: profile.treeNodes,
    edges: normaliseEdges(edges),
    constraints: wsConstraint.constraints,
    constraintApplications: wsConstraint.constraintApplications,
    focusId: validateFocusForWorkspace(
      storedFocusId,
      activeWorkspaceId,
      profile.treeNodes,
    ),
    canvasExpandedNodes: canvasState?.canvasExpandedNodes ?? [],
    canvasNodePositions: canvasState?.canvasNodePositions ?? {},
    canvasSelected: canvasState?.canvasSelected ?? null,
    canvasAlgorithm: canvasState?.canvasAlgorithm ?? "SDF",
    canvasShowRefEdges: canvasState?.canvasShowRefEdges ?? false,
    entityDrafts: canvasState?.entityDrafts ?? {},
    connectedGraphs: [{
      id: dbId,
      label: `localStorage/${profileName} (${dbId})`,
      connected: true,
      required: true,
    }],
  };
}

export function defaultState(): WorkspaceState {
  const databaseId = localDbIdFromUrl(DEFAULT_PROFILE.url) ?? crypto.randomUUID();
  const profile = freshProfileState("Local", databaseId);
  const defaultProfile = { ...DEFAULT_PROFILE, localDatabaseId: databaseId };
  return {
    profiles: [defaultProfile],
    activeProfileId: defaultProfile.id,
    ...profile,
    personas: ["Architect", "Developer", "Reviewer"],
    activePersona: "Architect",
    workflows: ["Explore", "Design", "Build"],
    activeWorkflow: "Explore",
  };
}

/** Workspace state with a guaranteed focus target — returned by `storyState`. */
export type FocusedWorkspaceState = WorkspaceState & { focusId: string };

/** Create a workspace state with children placed inside the workspace root.
 *  Returns a `FocusedWorkspaceState` so callers can use `ws.focusId` without
 *  null-assertions — if the workspace root can't be found, it throws eagerly
 *  rather than silently producing an empty canvas. */
export function storyState(children: TreeNode[]): FocusedWorkspaceState {
  const ws = defaultState();
  if (!ws.focusId) throw new Error("storyState: defaultState has no focusId");
  const wsRoot = findNode(ws.treeNodes, ws.focusId);
  if (!wsRoot) {
    throw new Error(`storyState: workspace root ${ws.focusId} not found in tree`);
  }
  wsRoot.children = children;
  return ws as FocusedWorkspaceState;
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
    type: raw.type as "ref" | undefined,
    ref: raw.ref as string | undefined,
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

/**
 * Ensure every profile has a `localDatabaseId`. Profiles created before
 * this field existed won't have one — backfill the active profile with
 * the state-level `databaseId`.
 */
function backfillProfileDatabaseIds(state: WorkspaceState): WorkspaceState {
  const needsBackfill = state.profiles.some((p) => !p.localDatabaseId);
  if (!needsBackfill) return state;
  return {
    ...state,
    profiles: state.profiles.map((p) => {
      if (p.localDatabaseId) return p;
      // Derive from URL for local profiles, fall back to state.databaseId for active
      const fromUrl = localDbIdFromUrl(p.url);
      if (fromUrl) return { ...p, localDatabaseId: fromUrl };
      if (p.id === state.activeProfileId) return { ...p, localDatabaseId: state.databaseId };
      return p;
    }),
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
          databaseId: (t.databaseId as string | undefined) ?? "default", // legacy fallback
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
      const validFocusId = rawFocusId && findNode(treeNodes, rawFocusId) ? rawFocusId : null;
      // Default to workspace root so users see graph contents; null = "virtual root" level
      const focusId = validFocusId ?? wrapped.rootNodeId;
      // Validate canvasExpandedNodes — drop IDs that no longer exist
      const rawExpanded = (parsed.canvasExpandedNodes as string[] | undefined) ?? [];
      const canvasExpandedNodes = rawExpanded.filter((id) => findNode(treeNodes, id) !== null);
      // Ensure workspace constraint is present and applied to the root
      const parsedConstraints =
        ((parsed.constraints as Record<string, unknown>[] | undefined) ?? [])
          .map(parseConstraint);
      const parsedApps = (
        (parsed.constraintApplications as Record<string, unknown>[] | undefined) ?? []
      ).map(parseConstraintApplication);
      const wsConstraint = ensureWorkspaceConstraint(
        parsedConstraints,
        parsedApps,
        wrapped.rootNodeId,
      );
      // Ensure profile root wraps workspace nodes
      const activeProfile = (parsed.profiles as Profile[] | undefined)?.find(
        (p: Profile) => p.id === (parsed.activeProfileId as string),
      );
      const profile = ensureProfileRoot(
        treeNodes,
        wsConstraint.constraints,
        wsConstraint.constraintApplications,
        undefined,
        activeProfile?.name ?? "Local",
      );
      // Migrate: derive activeWorkspaceId from the active tab's rootNodeId
      const activeTabId = (parsed.activeTabId as string | undefined) ?? tabs[0].id;
      const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
      const activeWorkspaceId = activeTab.rootNodeId || wrapped.rootNodeId;
      const migratedPanels = activeTab.panels ?? [defaultPanel()];
      return backfillProfileDatabaseIds({
        profiles: (parsed.profiles as Profile[] | undefined) ?? ds.profiles,
        activeProfileId: (parsed.activeProfileId as string | undefined) ?? ds.activeProfileId,
        databaseId: tabs[0]?.databaseId ?? ds.databaseId,
        profileRootId: profile.profileRootId,
        activeWorkspaceId,
        panels: migratedPanels,
        treeNodes: profile.treeNodes,
        edges: (parsed.edges as Edge[] | undefined) ?? [],
        constraints: profile.constraints,
        constraintApplications: profile.constraintApplications,
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
        canvasShowRefEdges: (parsed.canvasShowRefEdges as boolean | undefined) ?? false,
        entityDrafts: {},
      });
    }
  } catch {
    // ignore corrupt state
  }
  return defaultState();
}

// ---------------------------------------------------------------------------
// Async load (SurrealDB with localStorage migration)
// ---------------------------------------------------------------------------

import {
  CONNECTIONS_CONSTRAINT,
  PROFILE_CONSTRAINT,
  WORKSPACE_CONSTRAINT,
} from "../graph/builtin_constraints.ts";
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
    const defaultUuid = localDbIdFromUrl(DEFAULT_PROFILE.url) ?? crypto.randomUUID();
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
    const hasExistingData = rootChildren.length > 0;

    const stateToMigrate = hasExistingData ? existingState : defaultState();
    await migrateToSurreal(stateToMigrate, defaultUuid);

    // Persist initial dumps to IndexedDB
    await persistInitialDumps(defaultUuid);

    // Clear localStorage after successful migration
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      // Ignore — may not have access to localStorage
    }

    return backfillProfileDatabaseIds({
      ...stateToMigrate,
      databaseId: defaultUuid,
      connectedGraphs: [{
        id: defaultUuid,
        label: `localStorage/Default (${defaultUuid})`,
        connected: true,
        required: true,
      }],
    });
  }

  // 4. Load UI state (profiles, panels, personas, etc.)
  // Navigation state (activeProfileId, activeWorkspaceId) comes from the URL,
  // not from the _ui database.
  const uiState = await loadWorkspaceUi();
  // Default to the first profile's database
  const firstProfile = uiState?.profiles?.[0];
  let activeDatabaseId = firstProfile?.localDatabaseId ?? dbs[0]?.uuid ??
    crypto.randomUUID();
  if (uiState) {
    console.log("[init] UI state loaded:", { activeDatabaseId });
    // Migration: old _ui records may have tabs/activeTabId — derive panels
    // deno-lint-ignore no-explicit-any
    const raw = uiState as any;
    if (raw.tabs?.length > 0) {
      const activeTab = raw.tabs.find((t: Tab) => t.id === raw.activeTabId) ?? raw.tabs[0];
      if (activeTab?.databaseId) activeDatabaseId = activeTab.databaseId;
      uiState.panels = activeTab?.panels ?? [defaultPanel()];
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

  // Ensure workspace root
  const wrapped = ensureWorkspaceRoot(buildTree(flatNodes));
  const treeNodes = wrapped.treeNodes;
  const canvasState = await loadCanvasState();
  console.log("[init] Canvas state:", canvasState ? "found" : "not found");

  if (uiState) {
    // Update connectedGraphs to show current database
    const dbEntry = dbs.find((d) => d.uuid === activeDatabaseId);
    const connectedGraphs = [{
      id: activeDatabaseId,
      label: `localStorage/${dbEntry?.name ?? "Default"} (${activeDatabaseId})`,
      connected: true,
      required: true,
    }];

    const ds = defaultState();
    // Ensure workspace constraint is present and applied to the root
    const wsConstraint = ensureWorkspaceConstraint(constraints, applications, wrapped.rootNodeId);
    // Ensure profile root wraps workspace nodes — use first profile as default
    // (the client applies URL-based profile/workspace overrides after this returns)
    const profiles = uiState.profiles ?? ds.profiles;
    const firstProf = profiles[0];
    const profile = ensureProfileRoot(
      treeNodes,
      wsConstraint.constraints,
      wsConstraint.constraintApplications,
      undefined,
      firstProf?.name ?? "Local",
    );
    // Default activeWorkspaceId to first workspace node (child of profile root)
    const defaultWsId = findNode(profile.treeNodes, profile.profileRootId)
      ?.children[0]?.id ?? wrapped.rootNodeId;
    return backfillProfileDatabaseIds({
      ...ds,
      // UI-only fields from SurrealDB (panels, personas, workflows, etc.)
      // Spread first so explicit graph/canvas fields below take precedence.
      ...uiState,
      profiles,
      activeProfileId: firstProf?.id ?? ds.activeProfileId,
      databaseId: activeDatabaseId,
      profileRootId: profile.profileRootId,
      // Graph data loaded from SurrealDB — must override any stale fields in uiState
      treeNodes: profile.treeNodes,
      edges: normaliseEdges(edges),
      constraints: profile.constraints,
      constraintApplications: profile.constraintApplications,
      activeWorkspaceId: defaultWsId,
      panels: uiState.panels ?? [defaultPanel()],
      connectedGraphs,
      focusId: validateFocusForWorkspace(
        canvasState?.focusId ?? null,
        defaultWsId,
        profile.treeNodes,
      ),
      canvasExpandedNodes: canvasState?.canvasExpandedNodes ?? ds.canvasExpandedNodes,
      canvasNodePositions: canvasState?.canvasNodePositions ?? {},
      canvasSelected: canvasState?.canvasSelected ?? null,
      canvasAlgorithm: canvasState?.canvasAlgorithm ?? ds.canvasAlgorithm,
      canvasShowRefEdges: canvasState?.canvasShowRefEdges ?? false,
      entityDrafts: canvasState?.entityDrafts ?? {},
    });
  }

  // No UI state saved yet — return defaults with loaded graph data
  const ds = defaultState();
  const wsConstraint2 = ensureWorkspaceConstraint(constraints, applications, wrapped.rootNodeId);
  const profile2 = ensureProfileRoot(
    treeNodes,
    wsConstraint2.constraints,
    wsConstraint2.constraintApplications,
  );
  return backfillProfileDatabaseIds({
    ...ds,
    databaseId: activeDatabaseId,
    profileRootId: profile2.profileRootId,
    treeNodes: profile2.treeNodes,
    edges: normaliseEdges(edges),
    constraints: profile2.constraints,
    constraintApplications: profile2.constraintApplications,
  });
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

// loadDatabaseSnapshot removed — single-graph model, no per-tab database loading.

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
async function migrateToSurreal(state: WorkspaceState, databaseId: string): Promise<void> {
  // Write graph data to the target database
  await useDatabase(databaseId);

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
    canvasShowRefEdges: state.canvasShowRefEdges,
    entityDrafts: state.entityDrafts,
  });

  // Write global UI state (navigation state lives in URL, not here)
  const uiState: UiState = {
    profiles: state.profiles,
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
// State update helpers
// ---------------------------------------------------------------------------

export function withPanel(
  ws: WorkspaceState,
  panelId: string,
  fn: (p: Panel) => Panel,
): WorkspaceState {
  return {
    ...ws,
    panels: ws.panels.map((p) => p.id === panelId ? fn(p) : p),
  };
}

export function withNodeMutation(
  ws: WorkspaceState,
  fn: (nodes: TreeNode[]) => TreeNode[],
): WorkspaceState {
  return { ...ws, treeNodes: fn(ws.treeNodes) };
}

// updateNodeInTree, removeNodeFromTree — re-exported from @marlinspike/graph above

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
