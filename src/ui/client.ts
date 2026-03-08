/// <reference lib="dom" />

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
  required: boolean; // if true, cannot be deselected
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const DROPDOWN_WIDTH = 140; // px — keeps persona/workflow dropdowns same width so tabs and "+ Tree View" align

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

function findParentOf(nodeId: string): TreeNode | null {
  const search = (nodes: TreeNode[]): TreeNode | null => {
    for (const n of nodes) {
      if (n.children.some((c) => c.id === nodeId)) return n;
      const f = search(n.children);
      if (f) return f;
    }
    return null;
  };
  return search(state.treeNodes);
}

function findSiblings(nodeId: string): TreeNode[] {
  const parent = findParentOf(nodeId);
  return parent
    ? parent.children.filter((c) => c.id !== nodeId)
    : state.treeNodes.filter((n) => n.id !== nodeId);
}

function getEdgesIn(nodeId: string): Edge[] {
  return state.edges.filter((e) => e.toId === nodeId);
}

function getEdgesOut(nodeId: string): Edge[] {
  return state.edges.filter((e) => e.fromId === nodeId);
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const STATE_KEY = "marlinspike.workspace";

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

function saveState(): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

const state = loadState();

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

type Attrs = Record<string, string | boolean | EventListener>;

function el(tag: string, attrs: Attrs = {}, children: (HTMLElement | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2), v as EventListener);
    } else if (typeof v === "boolean") {
      if (v) node.setAttribute(k, "");
    } else {
      node.setAttribute(k, v as string);
    }
  }
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function iconBtn(label: string, title: string, onClick: () => void): HTMLElement {
  const btn = el("button", {
    title,
    style:
      "background:none; border:none; color:#555; cursor:pointer; font-size:12px; padding:0 3px; line-height:1;",
  }, [label]);
  btn.addEventListener("click", onClick);
  return btn;
}

function smallBtn(label: string, onClick: () => void): HTMLElement {
  const btn = el("button", {
    style: [
      "background:none; border:1px solid #2a2a4a; color:#666;",
      "font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px;",
    ].join(""),
  }, [label]);
  btn.addEventListener("click", onClick);
  return btn;
}

function propLabel(text: string): HTMLElement {
  return el("div", {
    style: "font-size:10px; color:#444; letter-spacing:0.06em; text-transform:uppercase;",
  }, [text]);
}

// ---------------------------------------------------------------------------
// Custom dropdown (flat, minimalist, fixed-width)
// ---------------------------------------------------------------------------

function renderCustomDropdown(
  items: string[],
  selected: string | null,
  placeholder: string,
  onSelect: (val: string) => void,
  onEdit: () => void,
): HTMLElement {
  const wrap = el("div", {
    style: `position:relative; width:${DROPDOWN_WIDTH}px; flex-shrink:0;`,
  });

  const btn = el("div", {
    style: [
      `width:${DROPDOWN_WIDTH}px; height:22px;`,
      "display:flex; align-items:center; justify-content:space-between;",
      "padding:0 8px; cursor:pointer; user-select:none;",
      "border-bottom:1px solid #252538; font-size:11px; color:#777;",
    ].join(""),
  });
  btn.appendChild(el("span", {}, [selected ?? placeholder]));
  btn.appendChild(el("span", { style: "font-size:9px; color:#3a3a5a;" }, ["▾"]));

  const menu = el("div", {
    style: [
      `position:absolute; top:100%; left:0; width:${DROPDOWN_WIDTH}px;`,
      "background:#0d0d1e; border:1px solid #252538; border-top:none; z-index:200;",
      "display:none; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);",
    ].join(""),
  });

  // Edit option (always first)
  const editRow = el("div", {
    style:
      "padding:5px 8px; font-size:11px; color:#3a3a5a; cursor:pointer; border-bottom:1px solid #191930;",
  }, ["✎ Edit\u2026"]);
  editRow.addEventListener("mouseenter", () => {
    editRow.style.color = "#888";
  });
  editRow.addEventListener("mouseleave", () => {
    editRow.style.color = "#3a3a5a";
  });
  editRow.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = "none";
    onEdit();
  });
  menu.appendChild(editRow);

  for (const item of items) {
    const isActive = item === selected;
    const row = el("div", {
      style: [
        "padding:5px 8px; font-size:11px; cursor:pointer;",
        isActive ? "color:#9090c0;" : "color:#666;",
      ].join(""),
    }, [item]);
    row.addEventListener("mouseenter", () => {
      if (!isActive) row.style.color = "#aaa";
    });
    row.addEventListener("mouseleave", () => {
      if (!isActive) row.style.color = "#666";
    });
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      onSelect(item);
    });
    menu.appendChild(row);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.style.display === "none";
    menu.style.display = opening ? "flex" : "none";
    if (opening) {
      document.addEventListener("click", () => {
        menu.style.display = "none";
      }, { once: true });
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

// ---------------------------------------------------------------------------
// Connected graphs popover
// ---------------------------------------------------------------------------

function renderConnectedGraphsBtn(): HTMLElement {
  const connectedCount = state.connectedGraphs.filter((g) => g.connected).length;

  const wrap = el("div", { style: "position:relative; flex-shrink:0;" });

  const btn = el("div", {
    style: [
      "display:flex; align-items:center; gap:4px; padding:0 8px;",
      "font-size:11px; color:#3a3a5a; cursor:pointer; user-select:none;",
      "height:100%; border-left:1px solid #1a1a2e;",
    ].join(""),
    title: "Connected graphs",
  });
  btn.appendChild(el("span", {}, [`${connectedCount} graph${connectedCount !== 1 ? "s" : ""}`]));
  btn.appendChild(el("span", { style: "font-size:9px; color:#2a2a4a;" }, ["▾"]));

  const menu = el("div", {
    style: [
      "position:absolute; top:100%; right:0; min-width:180px;",
      "background:#0d0d1e; border:1px solid #252538; z-index:200;",
      "display:none; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);",
    ].join(""),
  });

  for (const graph of state.connectedGraphs) {
    const row = el("div", {
      style: "display:flex; align-items:center; gap:8px; padding:6px 10px; font-size:11px;",
    });

    const check = el("div", {
      style: [
        "width:12px; height:12px; border:1px solid #2a2a4a; border-radius:2px;",
        "display:flex; align-items:center; justify-content:center; flex-shrink:0;",
        graph.connected ? "background:#1e2a4a;" : "background:#0f0f22;",
        graph.required ? "cursor:not-allowed; opacity:0.5;" : "cursor:pointer;",
      ].join(""),
    });
    if (graph.connected) {
      check.appendChild(el("span", { style: "font-size:9px; color:#7090d0;" }, ["✓"]));
    }

    if (!graph.required) {
      row.style.cursor = "pointer";
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        graph.connected = !graph.connected;
        saveState();
        renderWorkspaceBar();
      });
    }

    row.appendChild(check);
    row.appendChild(
      el("span", { style: graph.connected ? "color:#888;" : "color:#3a3a5a;" }, [graph.label]),
    );
    if (graph.required) {
      row.appendChild(
        el("span", { style: "font-size:10px; color:#2a2a4a; margin-left:auto;" }, ["required"]),
      );
    }
    menu.appendChild(row);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.style.display === "none";
    menu.style.display = opening ? "flex" : "none";
    if (opening) {
      document.addEventListener("click", () => {
        menu.style.display = "none";
      }, { once: true });
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

// ---------------------------------------------------------------------------
// List editor modal
// ---------------------------------------------------------------------------

function showListEditor(
  title: string,
  items: string[],
  onSave: (newItems: string[]) => void,
): void {
  document.getElementById("list-editor-overlay")?.remove();

  const overlay = el("div", {
    id: "list-editor-overlay",
    style: [
      "position:fixed; inset:0; background:rgba(0,0,0,0.6);",
      "display:flex; align-items:center; justify-content:center; z-index:1000;",
    ].join(""),
  });

  const dialog = el("div", {
    style: [
      "background:#1a1a2e; border:1px solid #3a3a5a; border-radius:6px;",
      "padding:16px; width:280px; display:flex; flex-direction:column; gap:10px;",
    ].join(""),
  });

  dialog.appendChild(
    el("div", { style: "font-size:13px; font-weight:600; color:#c0c0e0;" }, [title]),
  );
  dialog.appendChild(el("div", { style: "font-size:11px; color:#555;" }, ["One item per line"]));

  const textarea = el("textarea", {
    style: [
      "background:#0f0f22; border:1px solid #2a2a4a; color:#c0c0e0;",
      "font-size:13px; padding:6px; border-radius:3px; resize:vertical;",
      "min-height:120px; font-family:inherit; width:100%;",
    ].join(""),
  }) as HTMLTextAreaElement;
  textarea.value = items.join("\n");
  dialog.appendChild(textarea);

  const btns = el("div", { style: "display:flex; gap:8px; justify-content:flex-end;" });
  btns.appendChild(smallBtn("Cancel", () => overlay.remove()));
  const saveBtn = el("button", {
    style: [
      "background:#1e1e3a; border:1px solid #3a3a6a; color:#c0c0e0;",
      "font-size:12px; cursor:pointer; padding:4px 12px; border-radius:3px;",
    ].join(""),
  }, ["Save"]);
  saveBtn.addEventListener("click", () => {
    onSave(textarea.value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0));
    overlay.remove();
  });
  btns.appendChild(saveBtn);
  dialog.appendChild(btns);

  overlay.appendChild(dialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  textarea.focus();
}

// ---------------------------------------------------------------------------
// Tab actions
// ---------------------------------------------------------------------------

function activeTab(): Tab {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
}

function activateTab(id: string): void {
  state.activeTabId = id;
  saveState();
  render();
}

function addTab(): void {
  const tabId = crypto.randomUUID();
  state.tabs.push({ id: tabId, name: "New Tab", panels: [defaultPanel()] });
  state.activeTabId = tabId;
  saveState();
  render();
}

function closeTab(id: string): void {
  if (state.tabs.length <= 1) return;
  const idx = state.tabs.findIndex((t) => t.id === id);
  state.tabs.splice(idx, 1);
  if (state.activeTabId === id) state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  saveState();
  render();
}

function renameTab(id: string, name: string): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (tab) {
    tab.name = name || "Untitled";
    saveState();
    render();
  }
}

// ---------------------------------------------------------------------------
// Persona / workflow actions
// ---------------------------------------------------------------------------

function setPersona(name: string): void {
  state.activePersona = name;
  saveState();
  renderWorkspaceBar();
}

function editPersonas(): void {
  showListEditor("Edit Personas", state.personas, (items) => {
    state.personas = items;
    if (state.activePersona && !items.includes(state.activePersona)) {
      state.activePersona = items[0] ?? null;
    }
    saveState();
    renderWorkspaceBar();
  });
}

function setWorkflow(name: string): void {
  state.activeWorkflow = name;
  saveState();
  renderWorkspaceControls();
}

function editWorkflows(): void {
  showListEditor("Edit Workflows", state.workflows, (items) => {
    state.workflows = items;
    if (state.activeWorkflow && !items.includes(state.activeWorkflow)) {
      state.activeWorkflow = items[0] ?? null;
    }
    saveState();
    renderWorkspaceControls();
  });
}

// ---------------------------------------------------------------------------
// Panel actions
// ---------------------------------------------------------------------------

function addPanel(): void {
  activeTab().panels.push(defaultPanel());
  saveState();
  renderWorkspaceArea();
}

function closePanel(panelId: string): void {
  const tab = activeTab();
  const idx = tab.panels.findIndex((p) => p.id === panelId);
  if (idx === -1) return;
  tab.panels.splice(idx, 1);
  saveState();
  renderWorkspaceArea();
}

function getPanel(panelId: string): Panel | undefined {
  return activeTab().panels.find((p) => p.id === panelId);
}

function toggleNode(panelId: string, nodeId: string): void {
  const panel = getPanel(panelId);
  if (!panel) return;
  const idx = panel.expandedNodes.indexOf(nodeId);
  if (idx === -1) panel.expandedNodes.push(nodeId);
  else panel.expandedNodes.splice(idx, 1);
  saveState();
  renderWorkspaceArea();
}

function collapseAll(panelId: string): void {
  const panel = getPanel(panelId);
  if (!panel) return;
  panel.expandedNodes = [];
  saveState();
  renderWorkspaceArea();
}

function expandAll(panelId: string, nodes: TreeNode[]): void {
  const panel = getPanel(panelId);
  if (!panel) return;
  const collect = (ns: TreeNode[]): void => {
    for (const n of ns) {
      if (n.kind === "composite" && n.children.length > 0) {
        if (!panel.expandedNodes.includes(n.id)) panel.expandedNodes.push(n.id);
        collect(n.children);
      }
    }
  };
  collect(nodes);
  saveState();
  renderWorkspaceArea();
}

function selectNode(panelId: string, nodeId: string): void {
  const panel = getPanel(panelId);
  if (!panel) return;
  panel.selectedNodeId = panel.selectedNodeId === nodeId ? null : nodeId;
  panel.selectedEdgeId = null;
  saveState();
  renderWorkspaceArea();
}

function closeInspector(panelId: string): void {
  const panel = getPanel(panelId);
  if (!panel) return;
  panel.selectedNodeId = null;
  panel.selectedEdgeId = null;
  saveState();
  renderWorkspaceArea();
}

function selectEdge(panelId: string, edgeId: string): void {
  const panel = getPanel(panelId);
  if (!panel) return;
  panel.selectedEdgeId = panel.selectedEdgeId === edgeId ? null : edgeId;
  saveState();
  renderWorkspaceArea();
}

// ---------------------------------------------------------------------------
// Tree node actions
// ---------------------------------------------------------------------------

function bumpNode(node: TreeNode): void {
  node.version++;
}

function renameNode(nodeId: string, newLabel: string): void {
  const node = findNode(state.treeNodes, nodeId);
  if (node) {
    node.label = newLabel || "Untitled";
    bumpNode(node);
    saveState();
    renderWorkspaceArea();
  }
}

function updateNodeData(nodeId: string, json: string): void {
  try {
    const node = findNode(state.treeNodes, nodeId);
    if (node) {
      node.data = JSON.parse(json) as Record<string, unknown>;
      bumpNode(node);
      saveState();
      renderWorkspaceArea();
    }
  } catch {
    alert("Invalid JSON — changes not saved.");
  }
}

function startNodeRenaming(
  nodeId: string,
  row: HTMLElement,
  labelEl: HTMLElement,
  actions: HTMLElement,
): void {
  actions.style.display = "none";
  const input = el("input", {
    value: findNode(state.treeNodes, nodeId)?.label ?? "",
    style: [
      "background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0;",
      "font-size:13px; padding:0 4px; border-radius:2px; flex:1; min-width:0;",
    ].join(""),
  }) as HTMLInputElement;
  row.replaceChild(input, labelEl);
  input.focus();
  input.select();
  const finish = (): void => renameNode(nodeId, input.value.trim());
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") renderWorkspaceArea();
  });
}

function deleteNode(nodeId: string): void {
  const remove = (nodes: TreeNode[]): boolean => {
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx !== -1) {
      nodes.splice(idx, 1);
      return true;
    }
    return nodes.some((n) => remove(n.children));
  };
  remove(state.treeNodes);
  // Remove all edges involving this node
  state.edges = state.edges.filter((e) => e.fromId !== nodeId && e.toId !== nodeId);
  for (const panel of activeTab().panels) {
    if (panel.selectedNodeId === nodeId) panel.selectedNodeId = null;
  }
  saveState();
  renderWorkspaceArea();
}

function addSubnode(parentId: string): void {
  const parent = findNode(state.treeNodes, parentId);
  if (!parent) return;
  parent.kind = "composite";
  parent.children.push({
    id: crypto.randomUUID(),
    label: "New Node",
    kind: "leaf",
    children: [],
    data: {},
    version: 1,
  });
  for (const panel of activeTab().panels) {
    if (!panel.expandedNodes.includes(parentId)) panel.expandedNodes.push(parentId);
  }
  bumpNode(parent);
  saveState();
  renderWorkspaceArea();
}

// ---------------------------------------------------------------------------
// Edge actions
// ---------------------------------------------------------------------------

function addEdge(fromId: string, toId: string): void {
  state.edges.push({ id: crypto.randomUUID(), fromId, toId, label: "", data: {}, version: 1 });
  saveState();
  renderWorkspaceArea();
}

function deleteEdge(edgeId: string): void {
  state.edges = state.edges.filter((e) => e.id !== edgeId);
  for (const panel of activeTab().panels) {
    if (panel.selectedEdgeId === edgeId) panel.selectedEdgeId = null;
  }
  saveState();
  renderWorkspaceArea();
}

function updateEdge(edgeId: string, label: string, json: string): void {
  try {
    const edge = state.edges.find((e) => e.id === edgeId);
    if (edge) {
      edge.label = label;
      edge.data = JSON.parse(json) as Record<string, unknown>;
      edge.version++;
      saveState();
      renderWorkspaceArea();
    }
  } catch {
    alert("Invalid JSON — changes not saved.");
  }
}

// ---------------------------------------------------------------------------
// Render: workspace bar
// ---------------------------------------------------------------------------

function renderWorkspaceBar(): void {
  const bar = document.getElementById("workspace-bar")!;
  bar.innerHTML = "";

  // Left: persona dropdown (fixed width for alignment)
  const leftArea = el("div", {
    style: [
      `width:${DROPDOWN_WIDTH}px; flex-shrink:0;`,
      "border-right:1px solid #1a1a2e; display:flex; align-items:center;",
    ].join(""),
  });
  leftArea.appendChild(renderCustomDropdown(
    state.personas,
    state.activePersona,
    "Persona",
    setPersona,
    editPersonas,
  ));
  bar.appendChild(leftArea);

  // Tabs
  const tabsArea = el("div", {
    style: "display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;",
  });
  for (const tab of state.tabs) {
    const isActive = tab.id === state.activeTabId;
    const tabEl = el("div", {
      style: [
        "display:inline-flex; align-items:center; gap:6px; padding:0 10px;",
        "height:28px; border-radius:4px; cursor:pointer; font-size:13px; user-select:none; flex-shrink:0;",
        isActive ? "background:#1e1e3a; color:#e0e0e0;" : "color:#888;",
      ].join(""),
    });
    const label = el("span", {}, [tab.name]);
    if (isActive) {
      label.style.cursor = "text";
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        startRenaming(tab.id, tabEl, label);
      });
    } else {
      tabEl.addEventListener("click", () => activateTab(tab.id));
    }
    tabEl.appendChild(label);
    if (state.tabs.length > 1) {
      const close = el("span", {
        style: "font-size:11px; color:#555; line-height:1;",
        title: "Close tab",
      }, ["×"]);
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      tabEl.appendChild(close);
    }
    tabsArea.appendChild(tabEl);
  }
  const newBtn = el("button", {
    style:
      "background:none; border:none; color:#555; font-size:18px; cursor:pointer; padding:0 6px; line-height:1;",
    title: "New tab",
  }, ["+"]);
  newBtn.addEventListener("click", addTab);
  tabsArea.appendChild(newBtn);
  bar.appendChild(tabsArea);

  // Right: connected graphs + branding
  const rightArea = el("div", { style: "display:flex; align-items:center; flex-shrink:0;" });
  rightArea.appendChild(renderConnectedGraphsBtn());
  const brand = el("a", {
    href: "https://github.com/visual-systems/marlinspike#readme",
    target: "_blank",
    rel: "noopener noreferrer",
    style: [
      "color:#2a2a4a; font-size:12px; font-weight:600; letter-spacing:0.05em;",
      "text-decoration:none; padding:0 12px; user-select:none;",
    ].join(""),
  }, ["Marlinspike"]);
  rightArea.appendChild(brand);
  bar.appendChild(rightArea);
}

function startRenaming(tabId: string, tabEl: HTMLElement, labelEl: HTMLElement): void {
  const input = el("input", {
    value: state.tabs.find((t) => t.id === tabId)?.name ?? "",
    style: [
      "background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0;",
      "font-size:13px; padding:0 4px; width:100px; border-radius:2px;",
    ].join(""),
  }) as HTMLInputElement;
  tabEl.replaceChild(input, labelEl);
  input.focus();
  input.select();
  const finish = (): void => renameTab(tabId, input.value.trim());
  input.addEventListener("blur", finish);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish();
    if (e.key === "Escape") render();
  });
}

// ---------------------------------------------------------------------------
// Render: workspace controls
// ---------------------------------------------------------------------------

function renderWorkspaceControls(): void {
  const bar = document.getElementById("workspace-controls")!;
  bar.innerHTML = "";

  // Left: workflow dropdown (same fixed width as persona for alignment)
  const leftArea = el("div", {
    style: [
      `width:${DROPDOWN_WIDTH}px; flex-shrink:0;`,
      "border-right:1px solid #1a1a2e; display:flex; align-items:center;",
    ].join(""),
  });
  leftArea.appendChild(renderCustomDropdown(
    state.workflows,
    state.activeWorkflow,
    "Workflow",
    setWorkflow,
    editWorkflows,
  ));
  bar.appendChild(leftArea);

  // View controls
  const viewControls = el("div", {
    style: "display:flex; align-items:center; gap:8px; padding:0 8px;",
  });
  const addBtn = el("button", {
    title: "Add a Tree View panel to this tab",
    style: [
      "background:none; border:1px solid #2a2a4a; color:#555;",
      "font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px; letter-spacing:0.04em;",
    ].join(""),
  }, ["+ Tree View"]);
  addBtn.addEventListener("click", addPanel);
  viewControls.appendChild(addBtn);
  bar.appendChild(viewControls);
}

// ---------------------------------------------------------------------------
// Render: workspace area
// ---------------------------------------------------------------------------

function renderWorkspaceArea(): void {
  const area = document.getElementById("workspace-area")!;
  area.innerHTML = "";
  const tab = activeTab();
  if (tab.panels.length === 0) {
    area.appendChild(el("div", {
      style:
        "flex:1; display:flex; align-items:center; justify-content:center; color:#3a3a5a; font-size:13px;",
    }, ["No views open — use the toolbar above to add one"]));
    return;
  }
  for (const panel of tab.panels) area.appendChild(renderTreePanel(panel));
}

// ---------------------------------------------------------------------------
// Render: tree panel
// ---------------------------------------------------------------------------

function renderTreePanel(panel: Panel): HTMLElement {
  const expanded = new Set(panel.expandedNodes);
  const selectedNode = panel.selectedNodeId
    ? findNode(state.treeNodes, panel.selectedNodeId)
    : null;
  const hasInspector = selectedNode != null;

  const wrapper = el("div", {
    style: [
      "display:flex; flex-direction:column; width:300px; min-width:200px; flex-shrink:0;",
      "border-right:1px solid #2a2a4a; background:#14142a; overflow:hidden;",
    ].join(""),
  });

  const header = el("div", {
    style: [
      "display:flex; align-items:center; justify-content:space-between;",
      "padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em;",
      "text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;",
    ].join(""),
  });
  header.appendChild(el("span", {}, ["Tree View"]));
  const btns = el("div", { style: "display:flex; gap:2px; align-items:center;" });
  btns.appendChild(iconBtn("⊞", "Expand all", () => expandAll(panel.id, state.treeNodes)));
  btns.appendChild(iconBtn("⊟", "Collapse all", () => collapseAll(panel.id)));
  btns.appendChild(iconBtn("×", "Close panel", () => closePanel(panel.id)));
  header.appendChild(btns);
  wrapper.appendChild(header);

  const body = el("div", {
    style: "flex:1; display:flex; flex-direction:column; overflow:hidden;",
  });

  const treeFlex = hasInspector ? 1 - panel.inspectorSplit : 1;
  const treeContent = el("div", {
    style: `flex:${treeFlex}; overflow-y:auto; padding:4px 0; min-height:0;`,
  });
  for (const node of state.treeNodes) {
    treeContent.appendChild(renderTreeNode(node, expanded, panel.id, panel.selectedNodeId, 0));
  }
  body.appendChild(treeContent);

  if (hasInspector) {
    const divider = el("div", {
      style: [
        "height:5px; flex-shrink:0; cursor:ns-resize;",
        "background:#2a2a4a; border-top:1px solid #3a3a5a; border-bottom:1px solid #3a3a5a;",
      ].join(""),
    });
    const inspectorEl = el("div", {
      style:
        `flex:${panel.inspectorSplit}; display:flex; flex-direction:column; overflow:hidden; min-height:0;`,
    });
    inspectorEl.appendChild(renderInspector(panel, selectedNode));

    divider.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startY = (e as MouseEvent).clientY;
      const startSplit = panel.inspectorSplit;
      const bodyH = body.offsetHeight;
      const onMove = (ev: Event): void => {
        const delta = startY - (ev as MouseEvent).clientY;
        panel.inspectorSplit = Math.max(0.15, Math.min(0.85, startSplit + delta / bodyH));
        treeContent.style.flex = String(1 - panel.inspectorSplit);
        inspectorEl.style.flex = String(panel.inspectorSplit);
      };
      const onUp = (): void => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveState();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    body.appendChild(divider);
    body.appendChild(inspectorEl);
  }

  wrapper.appendChild(body);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Render: inspector
// ---------------------------------------------------------------------------

function renderInspector(panel: Panel, node: TreeNode): HTMLElement {
  const inspector = el("div", {
    style: "display:flex; flex-direction:column; overflow:hidden; background:#10102a;",
  });

  const subHeader = el("div", {
    style: [
      "display:flex; align-items:center; justify-content:space-between;",
      "padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em;",
      "text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;",
    ].join(""),
  });
  subHeader.appendChild(el("span", {}, ["Inspector"]));
  subHeader.appendChild(iconBtn("×", "Close inspector", () => closeInspector(panel.id)));
  inspector.appendChild(subHeader);

  const content = el("div", {
    style: "flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:10px;",
  });

  // Editable label
  const labelHeading = el("div", {
    style: "font-size:14px; font-weight:600; color:#c0c0e0; cursor:text; word-break:break-all;",
    title: "Click to rename",
  }, [node.label]);
  labelHeading.addEventListener("click", () => {
    const input = el("input", {
      value: node.label,
      style: [
        "background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0;",
        "font-size:14px; font-weight:600; padding:0 4px; border-radius:2px; width:100%;",
      ].join(""),
    }) as HTMLInputElement;
    labelHeading.replaceWith(input);
    input.focus();
    input.select();
    const finish = (): void => renameNode(node.id, input.value.trim());
    input.addEventListener("blur", finish);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") renderWorkspaceArea();
    });
  });
  content.appendChild(labelHeading);

  // Version + hash
  content.appendChild(
    el("div", { style: "font-size:11px; color:#333; font-family:monospace;" }, [
      `v${node.version}  \u2022  ${nodeHash(node)}`,
    ]),
  );

  // Parent
  const parent = findParentOf(node.id);
  const parentSec = el("div", { style: "display:flex; flex-direction:column; gap:3px;" });
  parentSec.appendChild(propLabel("Parent"));
  if (parent) {
    const lnk = el("div", {
      style: "font-size:12px; color:#7090d0; cursor:pointer; word-break:break-all;",
      title: "Select parent",
    }, [parent.label]);
    lnk.addEventListener("click", () => selectNode(panel.id, parent.id));
    parentSec.appendChild(lnk);
  } else {
    parentSec.appendChild(
      el("div", { style: "font-size:12px; color:#333; font-style:italic;" }, ["(root)"]),
    );
  }
  content.appendChild(parentSec);

  // Children
  if (node.kind === "composite" && node.children.length > 0) {
    const childSec = el("div", { style: "display:flex; flex-direction:column; gap:3px;" });
    childSec.appendChild(propLabel("Children"));
    for (const child of node.children) {
      const lnk = el("div", {
        style: "font-size:12px; color:#7090d0; cursor:pointer; word-break:break-all;",
        title: "Select child",
      }, [child.label]);
      lnk.addEventListener("click", () => selectNode(panel.id, child.id));
      childSec.appendChild(lnk);
    }
    content.appendChild(childSec);
  }

  // ID
  const idSec = el("div", { style: "display:flex; flex-direction:column; gap:3px;" });
  idSec.appendChild(propLabel("ID"));
  idSec.appendChild(
    el(
      "div",
      { style: "font-size:11px; color:#445; font-family:monospace; word-break:break-all;" },
      [node.id],
    ),
  );
  content.appendChild(idSec);

  if (node.uri) {
    const uriSec = el("div", { style: "display:flex; flex-direction:column; gap:3px;" });
    uriSec.appendChild(propLabel("URI"));
    uriSec.appendChild(
      el("div", {
        style: "font-size:11px; color:#445; font-family:monospace; word-break:break-all;",
      }, [node.uri]),
    );
    content.appendChild(uriSec);
  }

  // Edges In
  content.appendChild(renderEdgesSection(panel, node, "in"));
  // Edges Out
  content.appendChild(renderEdgesSection(panel, node, "out"));

  // Data
  const dataSec = el("div", { style: "display:flex; flex-direction:column; gap:4px;" });
  dataSec.appendChild(propLabel("Data"));
  const textarea = el("textarea", {
    style: [
      "background:#0d0d20; border:1px solid #2a2a4a; color:#9090b0;",
      "font-size:11px; font-family:monospace; padding:5px; border-radius:3px;",
      "resize:vertical; min-height:60px; width:100%;",
    ].join(""),
  }) as HTMLTextAreaElement;
  textarea.value = JSON.stringify(node.data, null, 2);
  dataSec.appendChild(textarea);
  dataSec.appendChild(smallBtn("Save data", () => updateNodeData(node.id, textarea.value)));
  content.appendChild(dataSec);

  // Actions
  const actRow = el("div", { style: "display:flex; flex-wrap:wrap; gap:4px; padding-top:2px;" });
  actRow.appendChild(smallBtn("+ Subnode", () => addSubnode(node.id)));
  actRow.appendChild(smallBtn("Delete", () => deleteNode(node.id)));
  content.appendChild(actRow);

  inspector.appendChild(content);
  return inspector;
}

function renderEdgesSection(panel: Panel, node: TreeNode, dir: "in" | "out"): HTMLElement {
  const edges = dir === "in" ? getEdgesIn(node.id) : getEdgesOut(node.id);
  const siblings = findSiblings(node.id);
  const title = dir === "in" ? "Edges In" : "Edges Out";

  const sec = el("div", { style: "display:flex; flex-direction:column; gap:4px;" });
  sec.appendChild(propLabel(title));

  if (edges.length === 0 && siblings.length === 0) {
    sec.appendChild(
      el("div", { style: "font-size:11px; color:#333; font-style:italic;" }, ["no siblings"]),
    );
    return sec;
  }

  for (const edge of edges) {
    const peerId = dir === "in" ? edge.fromId : edge.toId;
    const peer = findNode(state.treeNodes, peerId);
    const peerLabel = peer?.label ?? peerId;
    const isSelected = panel.selectedEdgeId === edge.id;

    const edgeWrap = el("div", {
      style: [
        "border:1px solid #1e1e38; border-radius:3px; overflow:hidden;",
        isSelected ? "border-color:#2a2a5a;" : "",
      ].join(""),
    });

    // Edge row header
    const edgeRow = el("div", {
      style: [
        "display:flex; align-items:center; gap:6px; padding:4px 6px; cursor:pointer;",
        "font-size:12px;",
        isSelected ? "background:#181830;" : "background:#13132a;",
      ].join(""),
    });
    edgeRow.appendChild(
      el("span", { style: "color:#555; font-size:10px;" }, [dir === "in" ? "←" : "→"]),
    );
    const edgePeerLabel = el("span", {
      style: "flex:1; color:#7070a0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;",
    }, [edge.label ? `${edge.label} (${peerLabel})` : peerLabel]);
    edgeRow.appendChild(edgePeerLabel);
    edgeRow.appendChild(iconBtn("×", "Delete edge", () => deleteEdge(edge.id)));
    edgeRow.addEventListener("click", () => selectEdge(panel.id, edge.id));
    edgeWrap.appendChild(edgeRow);

    // Expanded edge detail
    if (isSelected) {
      const detail = el("div", {
        style: "padding:6px; background:#0f0f22; display:flex; flex-direction:column; gap:6px;",
      });

      // Label field
      const labelRow = el("div", { style: "display:flex; flex-direction:column; gap:3px;" });
      labelRow.appendChild(propLabel("Label"));
      const labelInput = el("input", {
        value: edge.label,
        style: [
          "background:#0a0a18; border:1px solid #2a2a4a; color:#c0c0e0;",
          "font-size:12px; padding:3px 6px; border-radius:3px; width:100%;",
        ].join(""),
      }) as HTMLInputElement;
      labelRow.appendChild(labelInput);
      detail.appendChild(labelRow);

      // Data field
      const dataRow = el("div", { style: "display:flex; flex-direction:column; gap:3px;" });
      dataRow.appendChild(propLabel("Data"));
      const edgeTextarea = el("textarea", {
        style: [
          "background:#0a0a18; border:1px solid #2a2a4a; color:#9090b0;",
          "font-size:11px; font-family:monospace; padding:4px; border-radius:3px;",
          "resize:vertical; min-height:48px; width:100%;",
        ].join(""),
      }) as HTMLTextAreaElement;
      edgeTextarea.value = JSON.stringify(edge.data, null, 2);
      dataRow.appendChild(edgeTextarea);
      detail.appendChild(dataRow);

      detail.appendChild(
        smallBtn("Save", () => updateEdge(edge.id, labelInput.value, edgeTextarea.value)),
      );
      edgeWrap.appendChild(detail);
    }

    sec.appendChild(edgeWrap);
  }

  // Add edge button
  if (siblings.length > 0) {
    const addRow = el("div", { style: "display:flex; align-items:center; gap:6px;" });
    const sel = document.createElement("select");
    sel.style.cssText = [
      "background:#0f0f22; color:#666; border:1px solid #2a2a4a;",
      "font-size:11px; padding:2px 4px; border-radius:3px; flex:1;",
    ].join("");
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = dir === "in" ? "from sibling\u2026" : "to sibling\u2026";
    ph.disabled = true;
    ph.selected = true;
    sel.appendChild(ph);
    for (const sib of siblings) {
      const opt = document.createElement("option");
      opt.value = sib.id;
      opt.textContent = sib.label;
      sel.appendChild(opt);
    }
    addRow.appendChild(sel);
    addRow.appendChild(smallBtn("+", () => {
      if (!sel.value) return;
      const [from, to] = dir === "in" ? [sel.value, node.id] : [node.id, sel.value];
      addEdge(from, to);
    }));
    sec.appendChild(addRow);
  }

  return sec;
}

// ---------------------------------------------------------------------------
// Render: tree node row
// ---------------------------------------------------------------------------

function renderTreeNode(
  node: TreeNode,
  expanded: Set<string>,
  panelId: string,
  selectedNodeId: string | null,
  depth: number,
): HTMLElement {
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selectedNodeId;
  const hasChildren = node.kind === "composite" && node.children.length > 0;

  const wrapper = el("div", {});
  const row = el("div", {
    style: [
      "display:flex; align-items:center;",
      `padding:3px 6px 3px ${6 + depth * 16}px;`,
      "font-size:13px; user-select:none;",
      isSelected ? "background:#1e2a4a;" : "",
    ].join(""),
  });

  const chevron = el("span", {
    style: "font-size:10px; width:12px; display:inline-block; color:#555; flex-shrink:0;",
  }, [hasChildren ? (isExpanded ? "▾" : "▸") : ""]);
  if (hasChildren) {
    chevron.style.cursor = "pointer";
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNode(panelId, node.id);
    });
  }
  row.appendChild(chevron);

  const labelEl = el("span", {
    style: [
      "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;",
      isSelected ? "color:#b0c4ff;" : "",
    ].join(""),
  }, [node.label]);
  labelEl.addEventListener("click", () => selectNode(panelId, node.id));
  row.appendChild(labelEl);

  const actions = el("div", { style: "display:none; align-items:center; gap:1px; flex-shrink:0;" });
  const aBtn = (lbl: string, title: string, fn: (e: Event) => void): HTMLElement => {
    const b = el("button", {
      title,
      style:
        "background:none; border:none; color:#555; cursor:pointer; font-size:12px; padding:0 3px; line-height:1;",
    }, [lbl]);
    b.addEventListener("click", fn);
    return b;
  };
  actions.appendChild(aBtn("✎", "Rename", (e) => {
    e.stopPropagation();
    startNodeRenaming(node.id, row, labelEl, actions);
  }));
  actions.appendChild(aBtn("+", "Add subnode", (e) => {
    e.stopPropagation();
    addSubnode(node.id);
  }));
  actions.appendChild(aBtn("×", "Delete", (e) => {
    e.stopPropagation();
    deleteNode(node.id);
  }));
  row.appendChild(actions);

  row.addEventListener("mouseenter", () => {
    if (!isSelected) row.style.background = "#1a1a38";
    actions.style.display = "flex";
  });
  row.addEventListener("mouseleave", () => {
    row.style.background = isSelected ? "#1e2a4a" : "";
    actions.style.display = "none";
  });

  wrapper.appendChild(row);
  if (hasChildren && isExpanded) {
    for (const child of node.children) {
      wrapper.appendChild(renderTreeNode(child, expanded, panelId, selectedNodeId, depth + 1));
    }
  }
  return wrapper;
}

// ---------------------------------------------------------------------------
// Root render
// ---------------------------------------------------------------------------

function render(): void {
  renderWorkspaceBar();
  renderWorkspaceControls();
  renderWorkspaceArea();
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

render();
