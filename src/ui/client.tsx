/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { render, useEffect, useMemo, useRef, useState } from "@hono/hono/jsx/dom";
import { Dropdown, DROPDOWN_WIDTH } from "./components/index.ts";
import { FocusDropdown } from "./components/focus-dropdown.tsx";
import { SmallBtn } from "./components/widgets.tsx";
import { TreePanel } from "./components/tree-panel.tsx";
import { ConstraintsPanel } from "./components/constraints-panel.tsx";
import { Canvas } from "./components/canvas.tsx";
import { validateWorkspace } from "../graph/validate_workspace.ts";
import {
  defaultConstraintsPanel,
  defaultPanel,
  getActiveTab,
  type ListEditorConfig,
  loadState,
  STATE_KEY,
  type Tab,
  type Updater,
  type WorkspaceState,
} from "./workspace.ts";

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

  function addConstraintsPanel() {
    const tab = getActiveTab(ws);
    update((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, panels: [...t.panels, defaultConstraintsPanel()] } : t
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
        <button
          type="button"
          title="Add a Constraints View panel to this tab"
          style="background:none; border:1px solid #2a2a4a; color:#555; font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px; letter-spacing:0.04em;"
          onClick={addConstraintsPanel}
        >
          + Constraints View
        </button>
      </div>

      {/* Right-side controls */}
      <div style="display:flex; align-items:stretch; margin-left:auto; flex-shrink:0;">
        <FocusDropdown ws={ws} update={update} />
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

  const diagnostics = useMemo(
    () => validateWorkspace(ws, ws.constraintApplications),
    [ws.constraints, ws.constraintApplications, ws.treeNodes, ws.edges],
  );

  const highlightEntityIds = useMemo<Set<string>>(() => {
    const sel = ws.canvasSelected;
    if (sel?.type !== "constraint") return new Set();
    return new Set(
      ws.constraintApplications
        .filter((a) => a.constraintId === sel.id)
        .map((a) => a.entityId),
    );
  }, [ws.canvasSelected, ws.constraintApplications]);

  return (
    <div id="workspace-area" style="position:relative; overflow:hidden;">
      {/* Canvas — always visible as the background layer */}
      <Canvas
        ws={ws}
        update={update}
        diagnostics={diagnostics}
        highlightEntityIds={highlightEntityIds}
      />

      {/* Panels — overlaid on top of the canvas, left-aligned */}
      {tab.panels.length > 0 && (
        <div style="position:absolute; top:0; left:0; bottom:0; display:flex; z-index:1; pointer-events:none;">
          {tab.panels.map((panel) => (
            <div key={panel.id} style="pointer-events:auto; height:100%; display:flex;">
              {panel.type === "constraints"
                ? (
                  <ConstraintsPanel
                    panel={panel}
                    tab={tab}
                    ws={ws}
                    update={update}
                    diagnostics={diagnostics}
                  />
                )
                : (
                  <TreePanel
                    panel={panel}
                    tab={tab}
                    ws={ws}
                    update={update}
                  />
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const appEl = document.getElementById("app");
if (appEl) render(<App />, appEl);
