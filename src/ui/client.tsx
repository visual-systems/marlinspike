/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { render, useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import { Dropdown, DROPDOWN_WIDTH, IconBtn, PropLabel, SmallBtn } from "./components/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Panel {
  id: string;
  type: "tree";
  expandedNodes: string[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  inspectorSplit: number; // 0–1, fraction of body height given to inspector
}

interface Tab {
  id: string;
  name: string;
  panels: Panel[];
}

interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string;
  treeNodes: TreeNode[];
  edges: Edge[];
  personas: string[];
  activePersona: string | null;
  workflows: string[];
  activeWorkflow: string | null;
  connectedGraphs: ConnectedGraph[];
}

interface TreeNode {
  id: string;
  label: string;
  uri?: string;
  kind: "leaf" | "composite";
  children: TreeNode[];
  data: Record<string, unknown>;
  version: number;
}

interface Edge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  data: Record<string, unknown>;
  version: number;
}

interface ConnectedGraph {
  id: string;
  label: string;
  connected: boolean;
  required: boolean;
}

type Updater = (fn: (s: WorkspaceState) => WorkspaceState) => void;

interface ListEditorConfig {
  title: string;
  items: string[];
  onSave: (items: string[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeHash(node: TreeNode): string {
  const s = node.label + node.kind + JSON.stringify(node.data) +
    node.children.map((c) => c.id).join("");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return undefined;
}

function findParentOf(nodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const n of nodes) {
    if (n.children.some((c) => c.id === nodeId)) return n;
    const f = findParentOf(n.children, nodeId);
    if (f) return f;
  }
  return null;
}

function findSiblings(treeNodes: TreeNode[], nodeId: string): TreeNode[] {
  const parent = findParentOf(treeNodes, nodeId);
  return parent
    ? parent.children.filter((c) => c.id !== nodeId)
    : treeNodes.filter((n) => n.id !== nodeId);
}

function getEdgesIn(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.toId === nodeId);
}

function getEdgesOut(edges: Edge[], nodeId: string): Edge[] {
  return edges.filter((e) => e.fromId === nodeId);
}

function collectSubtreeIds(node: TreeNode): Set<string> {
  const ids = new Set<string>();
  const visit = (n: TreeNode): void => {
    ids.add(n.id);
    for (const c of n.children) visit(c);
  };
  visit(node);
  return ids;
}

function subgraphJson(node: TreeNode, edges: Edge[]): string {
  const ids = collectSubtreeIds(node);
  const internalEdges = edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
  return JSON.stringify({ root: node, edges: internalEdges }, null, 2);
}

function getActiveTab(ws: WorkspaceState): Tab {
  return ws.tabs.find((t) => t.id === ws.activeTabId) ?? ws.tabs[0];
}

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  label: string,
  kind: "leaf" | "composite",
  children: TreeNode[],
  uri?: string,
): TreeNode {
  return { id, label, kind, children, data: {}, version: 1, uri };
}

function defaultTreeNodes(): TreeNode[] {
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

function defaultPanel(): Panel {
  return {
    id: crypto.randomUUID(),
    type: "tree",
    expandedNodes: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    inspectorSplit: 0.5,
  };
}

function defaultState(): WorkspaceState {
  const tabId = crypto.randomUUID();
  return {
    tabs: [{ id: tabId, name: "Main", panels: [defaultPanel()] }],
    activeTabId: tabId,
    treeNodes: defaultTreeNodes(),
    edges: [],
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
  };
}

// ---------------------------------------------------------------------------
// State load / save
// ---------------------------------------------------------------------------

const STATE_KEY = "marlinspike.workspace";

function migrateNode(raw: Record<string, unknown>): TreeNode {
  return {
    id: raw.id as string,
    label: raw.label as string,
    uri: raw.uri as string | undefined,
    kind: (raw.kind as "leaf" | "composite") ?? "leaf",
    children: ((raw.children as Record<string, unknown>[] | undefined) ?? []).map(migrateNode),
    data: (raw.data as Record<string, unknown> | undefined) ?? {},
    version: (raw.version as number | undefined) ?? 1,
  };
}

function loadState(): WorkspaceState {
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
            type: "tree" as const,
            expandedNodes: (p.expandedNodes as string[] | undefined) ?? [],
            selectedNodeId: (p.selectedNodeId as string | null | undefined) ?? null,
            selectedEdgeId: (p.selectedEdgeId as string | null | undefined) ?? null,
            inspectorSplit: (p.inspectorSplit as number | undefined) ?? 0.5,
          }))
          : [{
            id: crypto.randomUUID(),
            type: "tree" as const,
            expandedNodes: oldExpanded ?? [],
            selectedNodeId: null,
            selectedEdgeId: null,
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
        treeNodes: rawNodes ? rawNodes.map(migrateNode) : defaultTreeNodes(),
        edges: (parsed.edges as Edge[] | undefined) ?? [],
        personas: (parsed.personas as string[] | undefined) ?? ds.personas,
        activePersona: (parsed.activePersona as string | null | undefined) ?? null,
        workflows: (parsed.workflows as string[] | undefined) ?? ds.workflows,
        activeWorkflow: (parsed.activeWorkflow as string | null | undefined) ?? null,
        connectedGraphs: (parsed.connectedGraphs as ConnectedGraph[] | undefined) ??
          ds.connectedGraphs,
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

function withPanel(
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

function withNodeMutation(
  ws: WorkspaceState,
  fn: (nodes: TreeNode[]) => TreeNode[],
): WorkspaceState {
  return { ...ws, treeNodes: fn(ws.treeNodes) };
}

function updateNodeInTree(
  nodes: TreeNode[],
  nodeId: string,
  fn: (n: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === nodeId) return fn(n);
    return { ...n, children: updateNodeInTree(n.children, nodeId, fn) };
  });
}

function removeNodeFromTree(nodes: TreeNode[], nodeId: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => ({ ...n, children: removeNodeFromTree(n.children, nodeId) }));
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

function App() {
  const [ws, setWs] = useState<WorkspaceState>(loadState);
  const [listEditor, setListEditor] = useState<ListEditorConfig | null>(null);

  // Persist to localStorage on every state change
  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify(ws));
  }, [ws]);

  const update: Updater = (fn) => setWs((prev) => fn(prev));

  const showListEditor = (config: ListEditorConfig) => setListEditor(config);

  return (
    <>
      <WorkspaceBar ws={ws} update={update} showListEditor={showListEditor} />
      <WorkspaceControls ws={ws} update={update} showListEditor={showListEditor} />
      <WorkspaceArea ws={ws} update={update} />
      {listEditor && <ListEditorModal config={listEditor} onClose={() => setListEditor(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// List editor modal
// ---------------------------------------------------------------------------

function ListEditorModal(
  { config, onClose }: { config: ListEditorConfig; onClose: () => void },
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSave() {
    const val = textareaRef.current?.value ?? "";
    config.onSave(val.split("\n").map((s) => s.trim()).filter((s) => s.length > 0));
    onClose();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      style="position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000;"
      onClick={handleOverlayClick}
    >
      <div style="background:#1a1a2e; border:1px solid #3a3a5a; border-radius:6px; padding:16px; width:280px; display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:13px; font-weight:600; color:#c0c0e0;">{config.title}</div>
        <div style="font-size:11px; color:#555;">One item per line</div>
        <textarea
          ref={textareaRef}
          style="background:#0f0f22; border:1px solid #2a2a4a; color:#c0c0e0; font-size:13px; padding:6px; border-radius:3px; resize:vertical; min-height:120px; font-family:inherit; width:100%;"
        >
          {config.items.join("\n")}
        </textarea>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <SmallBtn label="Cancel" onClick={onClose} />
          <button
            type="button"
            style="background:#1e1e3a; border:1px solid #3a3a6a; color:#c0c0e0; font-size:12px; cursor:pointer; padding:4px 12px; border-radius:3px;"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace bar
// ---------------------------------------------------------------------------

function WorkspaceBar(
  { ws, update, showListEditor }: {
    ws: WorkspaceState;
    update: Updater;
    showListEditor: (c: ListEditorConfig) => void;
  },
) {
  function setPersona(name: string) {
    update((s) => ({ ...s, activePersona: name }));
  }

  function editPersonas() {
    showListEditor({
      title: "Edit Personas",
      items: ws.personas,
      onSave: (items) => {
        update((s) => ({
          ...s,
          personas: items,
          activePersona: items.includes(s.activePersona ?? "")
            ? s.activePersona
            : (items[0] ?? null),
        }));
      },
    });
  }

  function addTab() {
    const tabId = crypto.randomUUID();
    update((s) => ({
      ...s,
      tabs: [...s.tabs, { id: tabId, name: "New Tab", panels: [defaultPanel()] }],
      activeTabId: tabId,
    }));
  }

  return (
    <div id="workspace-bar">
      {/* Persona dropdown */}
      <div
        style={`width:${DROPDOWN_WIDTH}px; flex-shrink:0; border-right:1px solid #1a1a2e; display:flex; align-items:center;`}
      >
        <Dropdown
          items={ws.personas.map((p) => ({ value: p, label: p }))}
          selectedValue={ws.activePersona}
          placeholder="Persona"
          onSelect={setPersona}
          onEdit={editPersonas}
        />
      </div>

      {/* Tabs */}
      <div style="display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;">
        {ws.tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === ws.activeTabId}
            canClose={ws.tabs.length > 1}
            update={update}
          />
        ))}
        <button
          type="button"
          style="background:none; border:none; color:#555; font-size:18px; cursor:pointer; padding:0 6px; line-height:1;"
          title="New tab"
          onClick={addTab}
        >
          +
        </button>
      </div>

      {/* Branding */}
      <div style="display:flex; align-items:center; flex-shrink:0;">
        <a
          href="https://github.com/visual-systems/marlinspike#readme"
          target="_blank"
          rel="noopener noreferrer"
          style="color:#2a2a4a; font-size:12px; font-weight:600; letter-spacing:0.05em; text-decoration:none; padding:0 12px; user-select:none;"
        >
          Marlinspike
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab item
// ---------------------------------------------------------------------------

function TabItem(
  { tab, isActive, canClose, update }: {
    tab: Tab;
    isActive: boolean;
    canClose: boolean;
    update: Updater;
  },
) {
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  function activateTab() {
    update((s) => ({ ...s, activeTabId: tab.id }));
  }

  function closeTab(e: MouseEvent) {
    e.stopPropagation();
    update((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tab.id);
      const newTabs = s.tabs.filter((t) => t.id !== tab.id);
      const newActiveId = s.activeTabId === tab.id
        ? (newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]?.id)
        : s.activeTabId;
      return { ...s, tabs: newTabs, activeTabId: newActiveId };
    });
  }

  function finishRename() {
    const val = inputRef.current?.value.trim() ?? "";
    update((s) => ({
      ...s,
      tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, name: val || "Untitled" } : t),
    }));
    setRenaming(false);
  }

  function handleLabelClick(e: MouseEvent) {
    if (!isActive) return;
    e.stopPropagation();
    setRenaming(true);
  }

  const tabStyle = [
    "display:inline-flex; align-items:center; gap:6px; padding:0 10px;",
    "height:28px; border-radius:4px; cursor:pointer; font-size:13px; user-select:none; flex-shrink:0;",
    isActive ? "background:#1e1e3a; color:#e0e0e0;" : "color:#888;",
  ].join("");

  return (
    <div
      style={tabStyle}
      onClick={isActive ? undefined : activateTab}
    >
      {renaming
        ? (
          <input
            ref={inputRef}
            style="background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0; font-size:13px; padding:0 4px; width:100px; border-radius:2px;"
            onBlur={finishRename}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") finishRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        )
        : (
          <span
            style={isActive ? "cursor:text;" : ""}
            onClick={handleLabelClick}
          >
            {tab.name}
          </span>
        )}
      {canClose && (
        <span
          style="font-size:11px; color:#555; line-height:1;"
          title="Close tab"
          onClick={closeTab}
        >
          ×
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace controls
// ---------------------------------------------------------------------------

function WorkspaceControls(
  { ws, update, showListEditor }: {
    ws: WorkspaceState;
    update: Updater;
    showListEditor: (c: ListEditorConfig) => void;
  },
) {
  function setWorkflow(name: string) {
    update((s) => ({ ...s, activeWorkflow: name }));
  }

  function editWorkflows() {
    showListEditor({
      title: "Edit Workflows",
      items: ws.workflows,
      onSave: (items) => {
        update((s) => ({
          ...s,
          workflows: items,
          activeWorkflow: items.includes(s.activeWorkflow ?? "")
            ? s.activeWorkflow
            : (items[0] ?? null),
        }));
      },
    });
  }

  function addPanel() {
    const tab = getActiveTab(ws);
    update((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, panels: [...t.panels, defaultPanel()] } : t
      ),
    }));
  }

  return (
    <div id="workspace-controls">
      {/* Workflow dropdown */}
      <div
        style={`width:${DROPDOWN_WIDTH}px; flex-shrink:0; border-right:1px solid #1a1a2e; display:flex; align-items:center;`}
      >
        <Dropdown
          items={ws.workflows.map((w) => ({ value: w, label: w }))}
          selectedValue={ws.activeWorkflow}
          placeholder="Workflow"
          onSelect={setWorkflow}
          onEdit={editWorkflows}
        />
      </div>

      {/* View controls */}
      <div style="display:flex; align-items:center; gap:8px;">
        <button
          type="button"
          title="Add a Tree View panel to this tab"
          style="background:none; border:1px solid #2a2a4a; color:#555; font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px; letter-spacing:0.04em;"
          onClick={addPanel}
        >
          + Tree View
        </button>
      </div>

      {/* Connected graphs */}
      <div style="display:flex; align-items:center; margin-left:auto; flex-shrink:0;">
        <ConnectedGraphsBtn ws={ws} update={update} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connected graphs button
// ---------------------------------------------------------------------------

function ConnectedGraphsBtn({ ws, update }: { ws: WorkspaceState; update: Updater }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [open]);

  const connectedCount = ws.connectedGraphs.filter((g) => g.connected).length;

  function toggleGraph(id: string) {
    update((s) => ({
      ...s,
      connectedGraphs: s.connectedGraphs.map((g) =>
        g.id === id && !g.required ? { ...g, connected: !g.connected } : g
      ),
    }));
  }

  return (
    <div
      style="position:relative; flex-shrink:0;"
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <div
        title="Connected graphs"
        style="display:flex; align-items:center; gap:4px; padding:0 8px; font-size:11px; color:#3a3a5a; cursor:pointer; user-select:none; height:100%; border-left:1px solid #1a1a2e;"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span>{connectedCount} graph{connectedCount !== 1 ? "s" : ""}</span>
        <span style="font-size:9px; color:#2a2a4a;">▾</span>
      </div>
      {open && (
        <div
          style="position:absolute; top:100%; right:0; min-width:180px; background:#0d0d1e; border:1px solid #252538; z-index:200; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          {ws.connectedGraphs.map((graph) => (
            <div
              key={graph.id}
              style={`display:flex; align-items:center; gap:8px; padding:6px 10px; font-size:11px;${
                graph.required ? "" : " cursor:pointer;"
              }`}
              onClick={graph.required ? undefined : () => toggleGraph(graph.id)}
            >
              <div
                style={[
                  "width:12px; height:12px; border:1px solid #2a2a4a; border-radius:2px;",
                  "display:flex; align-items:center; justify-content:center; flex-shrink:0;",
                  graph.connected ? "background:#1e2a4a;" : "background:#0f0f22;",
                  graph.required ? "cursor:not-allowed; opacity:0.5;" : "cursor:pointer;",
                ].join("")}
              >
                {graph.connected && <span style="font-size:9px; color:#7090d0;">✓</span>}
              </div>
              <span style={graph.connected ? "color:#888;" : "color:#3a3a5a;"}>
                {graph.label}
              </span>
              {graph.required && (
                <span style="font-size:10px; color:#2a2a4a; margin-left:auto;">required</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace area
// ---------------------------------------------------------------------------

function WorkspaceArea({ ws, update }: { ws: WorkspaceState; update: Updater }) {
  const tab = getActiveTab(ws);

  if (tab.panels.length === 0) {
    return (
      <div
        id="workspace-area"
        style="flex:1; align-items:center; justify-content:center; color:#3a3a5a; font-size:13px;"
      >
        No views open — use the toolbar above to add one
      </div>
    );
  }

  return (
    <div id="workspace-area">
      {tab.panels.map((panel) => (
        <TreePanel
          key={panel.id}
          panel={panel}
          tab={tab}
          ws={ws}
          update={update}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree panel
// ---------------------------------------------------------------------------

function TreePanel(
  { panel, tab, ws, update }: { panel: Panel; tab: Tab; ws: WorkspaceState; update: Updater },
) {
  const [localSplit, setLocalSplit] = useState(panel.inspectorSplit);
  const treeContentRef = useRef<HTMLDivElement | null>(null);
  const inspectorElRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const expanded = new Set(panel.expandedNodes);
  const selectedNode = panel.selectedNodeId ? findNode(ws.treeNodes, panel.selectedNodeId) : null;
  const selectedEdge = panel.selectedEdgeId
    ? ws.edges.find((e) => e.id === panel.selectedEdgeId)
    : null;
  const hasInspector = selectedNode != null || selectedEdge != null;

  const highlightedNodeIds: Set<string> = selectedEdge
    ? new Set([selectedEdge.fromId, selectedEdge.toId])
    : new Set();

  function closePanel() {
    update((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, panels: t.panels.filter((p) => p.id !== panel.id) } : t
      ),
    }));
  }

  function expandAll() {
    const collect = (nodes: TreeNode[]): string[] => {
      const ids: string[] = [];
      for (const n of nodes) {
        if (n.kind === "composite" && n.children.length > 0) {
          ids.push(n.id);
          ids.push(...collect(n.children));
        }
      }
      return ids;
    };
    const ids = collect(ws.treeNodes);
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, expandedNodes: ids })));
  }

  function collapseAll() {
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, expandedNodes: [] })));
  }

  function handleDividerMouseDown(e: MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startSplit = localSplit;
    const bodyH = bodyRef.current?.offsetHeight ?? 1;

    function onMove(ev: MouseEvent) {
      const delta = startY - ev.clientY;
      const newSplit = Math.max(0.15, Math.min(0.85, startSplit + delta / bodyH));
      if (treeContentRef.current) treeContentRef.current.style.flex = String(1 - newSplit);
      if (inspectorElRef.current) inspectorElRef.current.style.flex = String(newSplit);
    }

    function onUp(ev: MouseEvent) {
      document.removeEventListener("mousemove", onMove as EventListener);
      document.removeEventListener("mouseup", onUp as EventListener);
      const delta = startY - ev.clientY;
      const newSplit = Math.max(0.15, Math.min(0.85, startSplit + delta / bodyH));
      setLocalSplit(newSplit);
      update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, inspectorSplit: newSplit })));
    }

    document.addEventListener("mousemove", onMove as EventListener);
    document.addEventListener("mouseup", onUp as EventListener);
  }

  const treeFlex = hasInspector ? 1 - localSplit : 1;

  return (
    <div style="display:flex; flex-direction:column; width:300px; min-width:200px; flex-shrink:0; border-right:1px solid #2a2a4a; background:#14142a; overflow:hidden;">
      {/* Header */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>Tree View</span>
        <div style="display:flex; gap:2px; align-items:center;">
          <IconBtn label="⊞" title="Expand all" onClick={expandAll} />
          <IconBtn label="⊟" title="Collapse all" onClick={collapseAll} />
          <IconBtn label="×" title="Close panel" onClick={closePanel} />
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div
          ref={treeContentRef}
          style={`flex:${treeFlex}; overflow-y:auto; padding:4px 0; min-height:0;`}
        >
          {ws.treeNodes.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              expanded={expanded}
              panelId={panel.id}
              tabId={tab.id}
              selectedNodeId={panel.selectedNodeId}
              highlightedNodeIds={highlightedNodeIds}
              depth={0}
              ws={ws}
              update={update}
            />
          ))}
        </div>

        {hasInspector && (
          <>
            <div
              style="height:5px; flex-shrink:0; cursor:ns-resize; background:#2a2a4a; border-top:1px solid #3a3a5a; border-bottom:1px solid #3a3a5a;"
              onMouseDown={handleDividerMouseDown}
            />
            <div
              ref={inspectorElRef}
              style={`flex:${localSplit}; display:flex; flex-direction:column; overflow:hidden; min-height:0;`}
            >
              <Inspector panel={panel} tab={tab} ws={ws} update={update} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node row
// ---------------------------------------------------------------------------

function TreeNodeRow(
  { node, expanded, panelId, tabId, selectedNodeId, highlightedNodeIds, depth, ws, update }: {
    node: TreeNode;
    expanded: Set<string>;
    panelId: string;
    tabId: string;
    selectedNodeId: string | null;
    highlightedNodeIds: Set<string>;
    depth: number;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedNodeId;
  const isHighlighted = !isSelected && highlightedNodeIds.has(node.id);
  const hasChildren = node.kind === "composite" && node.children.length > 0;

  function toggleNode(e: MouseEvent) {
    e.stopPropagation();
    update((s) =>
      withPanel(s, tabId, panelId, (p) => ({
        ...p,
        expandedNodes: p.expandedNodes.includes(node.id)
          ? p.expandedNodes.filter((id) => id !== node.id)
          : [...p.expandedNodes, node.id],
      }))
    );
  }

  function selectNode() {
    update((s) =>
      withPanel(s, tabId, panelId, (p) => ({
        ...p,
        selectedNodeId: p.selectedNodeId === node.id ? null : node.id,
        selectedEdgeId: null,
      }))
    );
  }

  function startRename(e: MouseEvent) {
    e.stopPropagation();
    setRenaming(true);
  }

  function finishRename() {
    const val = inputRef.current?.value.trim() ?? "";
    update((s) =>
      withNodeMutation(
        s,
        (nodes) =>
          updateNodeInTree(
            nodes,
            node.id,
            (n) => ({ ...n, label: val || "Untitled", version: n.version + 1 }),
          ),
      )
    );
    setRenaming(false);
  }

  function addSubnode(e: MouseEvent) {
    e.stopPropagation();
    update((s) => ({
      ...withNodeMutation(s, (nodes) =>
        updateNodeInTree(nodes, node.id, (n) => ({
          ...n,
          kind: "composite",
          children: [...n.children, {
            id: crypto.randomUUID(),
            label: "New Node",
            kind: "leaf",
            children: [],
            data: {},
            version: 1,
          }],
          version: n.version + 1,
        }))),
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
            ...t,
            panels: t.panels.map((p) =>
              p.id === panelId && !p.expandedNodes.includes(node.id)
                ? { ...p, expandedNodes: [...p.expandedNodes, node.id] }
                : p
            ),
          }
          : t
      ),
    }));
  }

  function copyUri(e: MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(node.uri ?? node.id);
  }

  function deleteNode(e: MouseEvent) {
    e.stopPropagation();
    update((s) => {
      const newNodes = removeNodeFromTree(s.treeNodes, node.id);
      const newEdges = s.edges.filter((edge) => edge.fromId !== node.id && edge.toId !== node.id);
      return {
        ...s,
        treeNodes: newNodes,
        edges: newEdges,
        tabs: s.tabs.map((t) => ({
          ...t,
          panels: t.panels.map((p) => ({
            ...p,
            selectedNodeId: p.selectedNodeId === node.id ? null : p.selectedNodeId,
            selectedEdgeId: p.selectedEdgeId && !newEdges.some((e) => e.id === p.selectedEdgeId)
              ? null
              : p.selectedEdgeId,
          })),
        })),
      };
    });
  }

  const rowStyle = [
    "display:flex; align-items:center;",
    `padding:3px 6px 3px ${6 + depth * 16}px;`,
    "font-size:13px; user-select:none;",
    isSelected
      ? "background:#1e2a4a;"
      : isHighlighted
      ? "background:#181a30; border-left:2px solid #3a4080;"
      : hovered
      ? isHighlighted ? "background:#1e2040;" : "background:#1a1a38;"
      : "",
  ].join("");

  return (
    <div>
      <div
        style={rowStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          style={`font-size:10px; width:12px; display:inline-block; color:#555; flex-shrink:0;${
            hasChildren ? " cursor:pointer;" : ""
          }`}
          onClick={hasChildren ? toggleNode : undefined}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>

        {renaming
          ? (
            <input
              ref={inputRef}
              style="background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0; font-size:13px; padding:0 4px; border-radius:2px; flex:1; min-width:0;"
              onBlur={finishRename}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter") finishRename();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          )
          : (
            <span
              style={[
                "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;",
                isSelected ? "color:#b0c4ff;" : isHighlighted ? "color:#8090c0;" : "",
              ].join("")}
              onClick={selectNode}
            >
              {node.label}
            </span>
          )}

        {hovered && !renaming && (
          <div style="display:flex; align-items:center; gap:1px; flex-shrink:0;">
            <IconBtn label="✎" title="Rename" onClick={startRename} />
            <IconBtn label="+" title="Add subnode" onClick={addSubnode} />
            <IconBtn label="⎘" title="Copy URI" onClick={copyUri} />
            <IconBtn label="×" title="Delete" onClick={deleteNode} />
          </div>
        )}
      </div>

      {hasChildren && isExpanded && node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          expanded={expanded}
          panelId={panelId}
          tabId={tabId}
          selectedNodeId={selectedNodeId}
          highlightedNodeIds={highlightedNodeIds}
          depth={depth + 1}
          ws={ws}
          update={update}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector (dispatch)
// ---------------------------------------------------------------------------

function Inspector(
  { panel, tab, ws, update }: { panel: Panel; tab: Tab; ws: WorkspaceState; update: Updater },
) {
  if (panel.selectedEdgeId) {
    const edge = ws.edges.find((e) => e.id === panel.selectedEdgeId);
    if (edge) return <EdgeInspector edge={edge} panel={panel} tab={tab} ws={ws} update={update} />;
  }
  if (panel.selectedNodeId) {
    const node = findNode(ws.treeNodes, panel.selectedNodeId);
    if (node) return <NodeInspector node={node} panel={panel} tab={tab} ws={ws} update={update} />;
  }
  return <div />;
}

// Shared inspector shell
function InspectorShell(
  { title, onClose, children }: { title: string; onClose: () => void; children?: unknown },
) {
  return (
    <div style="display:flex; flex-direction:column; overflow:hidden; background:#10102a; height:100%;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>{title}</span>
        <IconBtn label="×" title="Close" onClick={onClose} />
      </div>
      <div style="flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:10px;">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node inspector
// ---------------------------------------------------------------------------

function NodeInspector(
  { node, panel, tab, ws, update }: {
    node: TreeNode;
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const [editingLabel, setEditingLabel] = useState(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const dataTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [editingLabel]);

  function closeInspector() {
    update((s) =>
      withPanel(s, tab.id, panel.id, (p) => ({ ...p, selectedNodeId: null, selectedEdgeId: null }))
    );
  }

  function finishLabelEdit() {
    const val = labelInputRef.current?.value.trim() ?? "";
    update((s) =>
      withNodeMutation(
        s,
        (nodes) =>
          updateNodeInTree(
            nodes,
            node.id,
            (n) => ({ ...n, label: val || "Untitled", version: n.version + 1 }),
          ),
      )
    );
    setEditingLabel(false);
  }

  function addSubnode() {
    update((s) => ({
      ...withNodeMutation(s, (nodes) =>
        updateNodeInTree(nodes, node.id, (n) => ({
          ...n,
          kind: "composite",
          children: [...n.children, {
            id: crypto.randomUUID(),
            label: "New Node",
            kind: "leaf",
            children: [],
            data: {},
            version: 1,
          }],
          version: n.version + 1,
        }))),
      tabs: s.tabs.map((t) =>
        t.id === tab.id
          ? {
            ...t,
            panels: t.panels.map((p) =>
              p.id === panel.id && !p.expandedNodes.includes(node.id)
                ? { ...p, expandedNodes: [...p.expandedNodes, node.id] }
                : p
            ),
          }
          : t
      ),
    }));
  }

  function saveData() {
    try {
      const data = JSON.parse(dataTextareaRef.current?.value ?? "{}") as Record<string, unknown>;
      update((s) =>
        withNodeMutation(
          s,
          (nodes) =>
            updateNodeInTree(nodes, node.id, (n) => ({ ...n, data, version: n.version + 1 })),
        )
      );
    } catch {
      alert("Invalid JSON — changes not saved.");
    }
  }

  function navigateToNode(nodeId: string) {
    update((s) =>
      withPanel(
        s,
        tab.id,
        panel.id,
        (p) => ({ ...p, selectedNodeId: nodeId, selectedEdgeId: null }),
      )
    );
  }

  function deleteNode() {
    update((s) => {
      const newNodes = removeNodeFromTree(s.treeNodes, node.id);
      const newEdges = s.edges.filter((e) => e.fromId !== node.id && e.toId !== node.id);
      return {
        ...s,
        treeNodes: newNodes,
        edges: newEdges,
        tabs: s.tabs.map((t) => ({
          ...t,
          panels: t.panels.map((p) => ({
            ...p,
            selectedNodeId: p.selectedNodeId === node.id ? null : p.selectedNodeId,
            selectedEdgeId: p.selectedEdgeId && !newEdges.some((e) => e.id === p.selectedEdgeId)
              ? null
              : p.selectedEdgeId,
          })),
        })),
      };
    });
  }

  function selectEdge(edgeId: string) {
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, selectedEdgeId: edgeId })));
  }

  function addEdge(fromId: string, toId: string) {
    update((s) => ({
      ...s,
      edges: [...s.edges, {
        id: crypto.randomUUID(),
        fromId,
        toId,
        label: "",
        data: {},
        version: 1,
      }],
    }));
  }

  function deleteEdge(edgeId: string) {
    update((s) => ({
      ...s,
      edges: s.edges.filter((e) => e.id !== edgeId),
      tabs: s.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) => ({
          ...p,
          selectedEdgeId: p.selectedEdgeId === edgeId ? null : p.selectedEdgeId,
        })),
      })),
    }));
  }

  const parent = findParentOf(ws.treeNodes, node.id);

  return (
    <InspectorShell title="Inspector" onClose={closeInspector}>
      {/* Editable label */}
      {editingLabel
        ? (
          <input
            ref={labelInputRef}
            style="background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0; font-size:14px; font-weight:600; padding:0 4px; border-radius:2px; width:100%;"
            onBlur={finishLabelEdit}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") finishLabelEdit();
              if (e.key === "Escape") setEditingLabel(false);
            }}
          />
        )
        : (
          <div
            style="font-size:14px; font-weight:600; color:#c0c0e0; cursor:text; word-break:break-all;"
            title="Click to rename"
            onClick={() => setEditingLabel(true)}
          >
            {node.label}
          </div>
        )}

      {/* Actions */}
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        <SmallBtn label="+ Subnode" onClick={addSubnode} />
        {node.uri && (
          <SmallBtn
            label="Copy URI"
            onClick={() => navigator.clipboard.writeText(node.uri!)}
          />
        )}
        <SmallBtn
          label="Copy Graph"
          onClick={() => navigator.clipboard.writeText(subgraphJson(node, ws.edges))}
        />
        <SmallBtn label="Delete" onClick={deleteNode} />
      </div>

      {/* Version + hash */}
      <div style="font-size:11px; color:#333; font-family:monospace;">
        v{node.version} • {nodeHash(node)}
      </div>

      {/* Parent */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="Parent" />
        {parent
          ? (
            <div
              style="font-size:12px; color:#7090d0; cursor:pointer; word-break:break-all;"
              title="Select parent"
              onClick={() => navigateToNode(parent.id)}
            >
              {parent.label}
            </div>
          )
          : <div style="font-size:12px; color:#333; font-style:italic;">(root)</div>}
      </div>

      {/* Children */}
      {node.kind === "composite" && node.children.length > 0 && (
        <div style="display:flex; flex-direction:column; gap:3px;">
          <PropLabel text="Children" />
          {node.children.map((child) => (
            <div
              key={child.id}
              style="font-size:12px; color:#7090d0; cursor:pointer; word-break:break-all;"
              title="Select child"
              onClick={() => navigateToNode(child.id)}
            >
              {child.label}
            </div>
          ))}
        </div>
      )}

      {/* ID */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="ID" />
        <div style="font-size:11px; color:#445; font-family:monospace; word-break:break-all;">
          {node.id}
        </div>
      </div>

      {/* URI */}
      {node.uri && (
        <div style="display:flex; flex-direction:column; gap:3px;">
          <PropLabel text="URI" />
          <div style="font-size:11px; color:#445; font-family:monospace; word-break:break-all;">
            {node.uri}
          </div>
        </div>
      )}

      {/* Edges In */}
      <EdgesSection
        node={node}
        dir="in"
        ws={ws}
        panel={panel}
        onSelectEdge={selectEdge}
        onAddEdge={addEdge}
        onDeleteEdge={deleteEdge}
      />

      {/* Edges Out */}
      <EdgesSection
        node={node}
        dir="out"
        ws={ws}
        panel={panel}
        onSelectEdge={selectEdge}
        onAddEdge={addEdge}
        onDeleteEdge={deleteEdge}
      />

      {/* Data */}
      <div style="display:flex; flex-direction:column; gap:4px;">
        <PropLabel text="Data" />
        <textarea
          ref={dataTextareaRef}
          style="background:#0d0d20; border:1px solid #2a2a4a; color:#9090b0; font-size:11px; font-family:monospace; padding:5px; border-radius:3px; resize:vertical; min-height:60px; width:100%;"
        >
          {JSON.stringify(node.data, null, 2)}
        </textarea>
        <SmallBtn label="Save data" onClick={saveData} />
      </div>
    </InspectorShell>
  );
}

// ---------------------------------------------------------------------------
// Edges section
// ---------------------------------------------------------------------------

function EdgesSection(
  { node, dir, ws, panel, onSelectEdge, onAddEdge, onDeleteEdge }: {
    node: TreeNode;
    dir: "in" | "out";
    ws: WorkspaceState;
    panel: Panel;
    onSelectEdge: (id: string) => void;
    onAddEdge: (fromId: string, toId: string) => void;
    onDeleteEdge: (id: string) => void;
  },
) {
  const edges = dir === "in" ? getEdgesIn(ws.edges, node.id) : getEdgesOut(ws.edges, node.id);
  const siblings = findSiblings(ws.treeNodes, node.id);

  return (
    <div style="display:flex; flex-direction:column; gap:4px;">
      <PropLabel text={dir === "in" ? "Edges In" : "Edges Out"} />

      {edges.length === 0 && siblings.length === 0
        ? <div style="font-size:11px; color:#333; font-style:italic;">no siblings</div>
        : null}

      {edges.map((edge) => {
        const peerId = dir === "in" ? edge.fromId : edge.toId;
        const peer = findNode(ws.treeNodes, peerId);
        const peerLabel = peer?.label ?? peerId;
        return (
          <EdgeRow
            key={edge.id}
            edge={edge}
            peerLabel={peerLabel}
            dir={dir}
            isSelected={panel.selectedEdgeId === edge.id}
            onSelect={() => onSelectEdge(edge.id)}
            onDelete={() => onDeleteEdge(edge.id)}
          />
        );
      })}

      {siblings.length > 0 && (
        <Dropdown
          items={siblings.map((s) => ({ value: s.id, label: s.label }))}
          selectedValue={null}
          placeholder={dir === "in" ? "+ from sibling…" : "+ to sibling…"}
          onSelect={(id) => {
            const [from, to] = dir === "in" ? [id, node.id] : [node.id, id];
            onAddEdge(from, to);
          }}
          width="fill"
        />
      )}
    </div>
  );
}

function EdgeRow(
  { edge, peerLabel, dir, isSelected: _isSelected, onSelect, onDelete }: {
    edge: Edge;
    peerLabel: string;
    dir: "in" | "out";
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
  },
) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={`display:flex; align-items:center; gap:6px; padding:4px 6px; background:${
        hovered ? "#181830" : "#13132a"
      }; border-radius:3px; cursor:pointer; font-size:12px;`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <span style="color:#555; font-size:10px; flex-shrink:0;">{dir === "in" ? "←" : "→"}</span>
      <span style="flex:1; color:#7070a0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        {edge.label ? `${edge.label} · ${peerLabel}` : peerLabel}
      </span>
      <IconBtn
        label="×"
        title="Delete edge"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onDelete();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge inspector
// ---------------------------------------------------------------------------

function EdgeInspector(
  { edge, panel, tab, ws, update }: {
    edge: Edge;
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const dataTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const fromNode = findNode(ws.treeNodes, edge.fromId);
  const toNode = findNode(ws.treeNodes, edge.toId);

  function closeEdgeView() {
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, selectedEdgeId: null })));
  }

  function navigateToNode(nodeId: string) {
    update((s) =>
      withPanel(
        s,
        tab.id,
        panel.id,
        (p) => ({ ...p, selectedNodeId: nodeId, selectedEdgeId: null }),
      )
    );
  }

  function deleteEdge() {
    update((s) => ({
      ...s,
      edges: s.edges.filter((e) => e.id !== edge.id),
      tabs: s.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) => ({
          ...p,
          selectedEdgeId: p.selectedEdgeId === edge.id ? null : p.selectedEdgeId,
        })),
      })),
    }));
  }

  function saveEdge() {
    try {
      const data = JSON.parse(dataTextareaRef.current?.value ?? "{}") as Record<string, unknown>;
      const label = labelInputRef.current?.value ?? "";
      update((s) => ({
        ...s,
        edges: s.edges.map((e) =>
          e.id === edge.id ? { ...e, label, data, version: e.version + 1 } : e
        ),
      }));
    } catch {
      alert("Invalid JSON — changes not saved.");
    }
  }

  return (
    <InspectorShell title="Edge" onClose={closeEdgeView}>
      {/* From → To nav */}
      <div style="display:flex; align-items:center; gap:6px; font-size:13px; flex-wrap:wrap;">
        <span
          style="color:#7090d0; cursor:pointer; word-break:break-all;"
          title="Inspect node"
          onClick={() => navigateToNode(edge.fromId)}
        >
          {fromNode?.label ?? edge.fromId}
        </span>
        <span style="color:#444;">→</span>
        <span
          style="color:#7090d0; cursor:pointer; word-break:break-all;"
          title="Inspect node"
          onClick={() => navigateToNode(edge.toId)}
        >
          {toNode?.label ?? edge.toId}
        </span>
      </div>

      {/* Actions */}
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        <SmallBtn label="Delete" onClick={deleteEdge} />
      </div>

      {/* Version */}
      <div style="font-size:11px; color:#333; font-family:monospace;">v{edge.version}</div>

      {/* Label */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="Label" />
        <input
          ref={labelInputRef}
          style="background:#0a0a18; border:1px solid #2a2a4a; color:#c0c0e0; font-size:12px; padding:3px 6px; border-radius:3px; width:100%;"
        />
      </div>

      {/* Data */}
      <div style="display:flex; flex-direction:column; gap:4px;">
        <PropLabel text="Data" />
        <textarea
          ref={dataTextareaRef}
          style="background:#0d0d20; border:1px solid #2a2a4a; color:#9090b0; font-size:11px; font-family:monospace; padding:5px; border-radius:3px; resize:vertical; min-height:60px; width:100%;"
        >
          {JSON.stringify(edge.data, null, 2)}
        </textarea>
      </div>

      <SmallBtn label="Save" onClick={saveEdge} />
    </InspectorShell>
  );
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const appEl = document.getElementById("app");
if (appEl) render(<App />, appEl);
