/// <reference lib="dom" />
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { AlgorithmId } from "./lib/algorithms/index.ts";

export const PANEL_TYPES = ["tree", "constraints"] as const;
export type PanelType = (typeof PANEL_TYPES)[number];

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
}

export interface Tab {
  id: string;
  name: string;
  panels: Panel[];
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
}

export interface TreeNode {
  id: string;
  label: string;
  uri?: string;
  kind: "leaf" | "composite";
  children: TreeNode[];
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

/** Returns the root nodes for the current focus level. If focusId is null, returns top-level treeNodes. */
export function getFocusedRootNodes(ws: WorkspaceState): TreeNode[] {
  if (ws.focusId == null) return ws.treeNodes;
  return findNode(ws.treeNodes, ws.focusId)?.children ?? [];
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

export function defaultTreeNodes(): TreeNode[] {
  return [
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
  ];
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

export function defaultState(): WorkspaceState {
  const tabId = crypto.randomUUID();
  return {
    tabs: [{ id: tabId, name: "Main", panels: [defaultPanel()] }],
    activeTabId: tabId,
    treeNodes: defaultTreeNodes(),
    edges: [],
    constraints: [],
    constraintApplications: [],
    personas: ["Architect", "Developer", "Reviewer"],
    activePersona: "Architect",
    workflows: ["Explore", "Design", "Build"],
    activeWorkflow: "Explore",
    connectedGraphs: [{
      id: "localStorage",
      label: "localStorage",
      connected: true,
      required: true,
    }],
    focusId: null,
    canvasExpandedNodes: defaultTreeNodes().map((n) => n.id),
    canvasNodePositions: {},
    canvasSelected: null,
    canvasAlgorithm: "SDF",
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
          }))
          : [{
            id: crypto.randomUUID(),
            type: "tree" as const,
            expandedNodes: oldExpanded ?? [],
            selected: null,
            inspectorSplit: 0.5,
          }];
        return { id: t.id as string, name: t.name as string, panels };
      });
      if (tabs.length === 0) return defaultState();
      const rawNodes = parsed.treeNodes as Record<string, unknown>[] | undefined;
      const ds = defaultState();
      return {
        tabs,
        activeTabId: (parsed.activeTabId as string | undefined) ?? tabs[0].id,
        treeNodes: rawNodes ? rawNodes.map(parseNode) : defaultTreeNodes(),
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
        focusId: (parsed.focusId as string | null | undefined) ?? null,
        canvasExpandedNodes: (parsed.canvasExpandedNodes as string[] | undefined) ?? [],
        canvasNodePositions: (parsed.canvasNodePositions as
          | Record<string, { x: number; y: number; pinned?: boolean }>
          | undefined) ?? {},
        canvasSelected: null,
        canvasAlgorithm: (parsed.canvasAlgorithm as AlgorithmId | undefined) ?? "SDF",
      };
    }
  } catch {
    // ignore corrupt state
  }
  return defaultState();
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
