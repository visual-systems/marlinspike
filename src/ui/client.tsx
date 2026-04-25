/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { render, useEffect, useMemo, useRef, useState } from "@hono/hono/jsx/dom";
import { Dropdown, DROPDOWN_WIDTH } from "./components/index.ts";
import { FocusDropdown } from "./components/focus-dropdown.tsx";
import { SmallBtn } from "./components/widgets.tsx";
import { TreePanel } from "./components/tree-panel.tsx";
import { ConstraintsPanel } from "./components/constraints-panel.tsx";
import { CodePanel } from "./components/code-panel.tsx";
import { Canvas } from "./components/canvas.tsx";
import { validateWorkspace } from "../graph/validate_workspace.ts";
import {
  type DatabaseSnapshot,
  defaultCodePanel,
  defaultConstraintsPanel,
  defaultPanel,
  ensureWorkspaceConstraint,
  getActiveTab,
  getConnectionConfig,
  type ListEditorConfig,
  loadDatabaseSnapshot,
  loadState,
  loadStateAsync,
  makeRootNode,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  type Tab,
  updateNodeInTree,
  type Updater,
  withPanel,
  type WorkspaceState,
} from "./workspace.ts";
import { flushSync, scheduleSyncToDb, setSyncBaseline } from "./db/sync.ts";
import { createDatabase } from "./db/operations.ts";
import {
  type ConnectionConfig,
  connectRemote,
  disconnectRemote,
  exportDb,
  remoteConnectionIds,
  useDatabase,
  useUiDb,
} from "./db/surreal.ts";
import { saveDump } from "./db/bridge.ts";

// Module-level flag: skip baseline reset when addTab handles its own persistence
let skipBaselineReset = false;

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hono JSX DOM workaround: state propagation to child components
// ---------------------------------------------------------------------------
// Hono's JSX DOM has two limitations that affect this app:
//
//  1. Child components do NOT receive updated props when the parent re-renders.
//  2. useEffect([dep]) does NOT reliably fire after setState updates.
//
// To work around this, state changes are broadcast via a CustomEvent
// ("ws-updated") carrying the latest WorkspaceState as `detail`. Child
// components that need fresh state (currently Canvas) listen for this event
// and store the state locally. The event is dispatched from two places:
//
//  - update() — via queueMicrotask inside the setWs updater (handles all
//    user-initiated state changes; queueMicrotask ensures it fires after
//    Hono commits the state).
//  - useEffect([ws]) — as a fallback for the initial load, where setWs is
//    called directly (not through update).
// ---------------------------------------------------------------------------

function App() {
  const [ws, setWs] = useState<WorkspaceState | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [listEditor, setListEditor] = useState<ListEditorConfig | null>(null);
  const prevTabIdRef = useRef<string | null>(null);
  // Keep a ref to the latest ws so async closures (addTab, activateTab)
  // always see the current state — Hono doesn't re-render child components.
  const wsRef = useRef<WorkspaceState | null>(null);
  wsRef.current = ws;

  // Async initialisation — load from SurrealDB (with localStorage migration)
  useEffect(() => {
    loadStateAsync()
      .then((state) => {
        setWs(state);
        setSyncBaseline(state);
      })
      .catch((err) => {
        console.error("[init] SurrealDB init failed, falling back to localStorage:", err);
        setDbError(String(err));
        const state = loadState();
        setWs(state);
      });
  }, []);

  // Flush pending sync before page unload so edits survive refresh
  useEffect(() => {
    const handler = () => {
      const current = wsRef.current;
      if (current) {
        // flushSync is async but beforeunload can't wait — fire and hope.
        // To improve reliability, we also persist eagerly (not just debounced).
        flushSync(current);
      }
    };
    globalThis.addEventListener("beforeunload", handler);
    return () => globalThis.removeEventListener("beforeunload", handler);
  }, []);

  // Persist to SurrealDB + IndexedDB on every state change (debounced)
  useEffect(() => {
    if (!ws) return;
    // Reset sync baseline when active tab changes (new database context)
    // Skip if addTab already handled persistence (avoids clobbering the diff)
    if (prevTabIdRef.current !== null && prevTabIdRef.current !== ws.activeTabId) {
      if (skipBaselineReset) {
        skipBaselineReset = false;
      } else {
        setSyncBaseline(ws);
      }
    }
    prevTabIdRef.current = ws.activeTabId;
    if (!dbError) {
      scheduleSyncToDb(ws);
    }
  }, [ws]);

  // ---------------------------------------------------------------------------
  // Remote connections — bootstrap on load, reconnect when config changes
  // ---------------------------------------------------------------------------
  const remoteConfigRef = useRef<string>(""); // JSON snapshot for change detection
  useEffect(() => {
    if (!ws) return;
    const config = getConnectionConfig(ws);
    const configJson = config ? JSON.stringify(config) : "";

    // Skip if nothing changed
    if (configJson === remoteConfigRef.current) return;
    remoteConfigRef.current = configJson;

    if (!config) {
      // No remote URL — disconnect any active remote and keep local-only connectedGraphs
      for (const id of remoteConnectionIds()) {
        disconnectRemote(id);
      }
      setWs((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          connectedGraphs: prev.connectedGraphs.filter((g) => g.required),
        };
      });
      return;
    }

    // Attempt remote connection
    const connConfig: ConnectionConfig = {
      url: config.url,
      namespace: config.namespace,
      database: config.database,
      username: config.username,
      password: config.password,
    };

    // Disconnect any stale remotes that don't match the current entityId
    for (const id of remoteConnectionIds()) {
      if (id !== config.entityId) disconnectRemote(id);
    }

    connectRemote(config.entityId, connConfig)
      .then(() => {
        console.log(`[remote] Connected: ${config.url}`);
        setWs((prev) => {
          if (!prev) return prev;
          const existing = prev.connectedGraphs.filter(
            (g) => g.id !== config.entityId,
          );
          return {
            ...prev,
            connectedGraphs: [
              ...existing,
              {
                id: config.entityId,
                label: config.url,
                connected: true,
                required: false,
              },
            ],
          };
        });
      })
      .catch((err) => {
        console.error(`[remote] Connection failed: ${config.url}`, err);
        setWs((prev) => {
          if (!prev) return prev;
          const existing = prev.connectedGraphs.filter(
            (g) => g.id !== config.entityId,
          );
          return {
            ...prev,
            connectedGraphs: [
              ...existing,
              {
                id: config.entityId,
                label: `${config.url} (failed: ${String(err).slice(0, 60)})`,
                connected: false,
                required: false,
              },
            ],
          };
        });
      });
  }, [ws]);

  const update: Updater = (fn) =>
    setWs((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      // See "Hono JSX DOM workaround" block comment above App.
      queueMicrotask(() => {
        globalThis.dispatchEvent(new CustomEvent("ws-updated", { detail: next }));
      });
      return next;
    });

  // Fallback for initial load — see "Hono JSX DOM workaround" block comment above App.
  useEffect(() => {
    if (ws) globalThis.dispatchEvent(new CustomEvent("ws-updated", { detail: ws }));
  }, [ws]);

  const showListEditor = (config: ListEditorConfig) => setListEditor(config);

  // Loading state while SurrealDB initialises
  if (!ws) {
    return (
      <div style="display:flex; align-items:center; justify-content:center; height:100vh; color:#555; font-size:14px;">
        Loading…
      </div>
    );
  }

  return (
    <>
      <WorkspaceBar ws={ws} wsRef={wsRef} update={update} />
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
  { ws, wsRef, update }: {
    ws: WorkspaceState;
    wsRef: { current: WorkspaceState | null };
    update: Updater;
  },
) {
  async function addTab() {
    try {
      // Flush current database to IndexedDB before switching
      const currentWs = wsRef.current;
      if (currentWs) await flushSync(currentWs);

      const uuid = await createDatabase("Untitled");
      const tabId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      // Snapshot current tab's data before switching
      update((s) => {
        const currentTab = getActiveTab(s);
        const snapshot: DatabaseSnapshot = {
          treeNodes: s.treeNodes,
          edges: s.edges,
          constraints: s.constraints,
          constraintApplications: s.constraintApplications,
          focusId: s.focusId,
          canvasExpandedNodes: s.canvasExpandedNodes,
          canvasNodePositions: s.canvasNodePositions,
          canvasSelected: s.canvasSelected,
          canvasAlgorithm: s.canvasAlgorithm,
          entityDrafts: s.entityDrafts,
        };
        return {
          ...s,
          tabs: [...s.tabs, {
            id: tabId,
            name: null,
            databaseId: uuid,
            rootNodeId,
            panels: [defaultPanel()],
          }],
          activeTabId: tabId,
          // New empty database with workspace root + builtin constraint
          treeNodes: [makeRootNode(rootNodeId, [])],
          edges: [],
          ...ensureWorkspaceConstraint([], [], rootNodeId),
          focusId: rootNodeId,
          canvasExpandedNodes: [],
          canvasNodePositions: {},
          canvasSelected: null,
          canvasAlgorithm: s.canvasAlgorithm,
          entityDrafts: {},
          connectedGraphs: [{
            id: uuid,
            label: `localStorage/Untitled (${uuid.slice(0, 8)})`,
            connected: true,
            required: true,
          }],
          _snapshotCache: {
            ...s._snapshotCache,
            [currentTab.databaseId]: snapshot,
          },
        };
      });
      // Tell the useEffect not to reset the sync baseline — we need the
      // diff to detect the new tab/UI changes and persist them.
      skipBaselineReset = true;

      // Immediately persist the new (empty) database and updated UI state
      // to IndexedDB. We can't rely on the sync cycle because the useEffect
      // resets the sync baseline on tab change, causing the diff to see no changes.
      await useDatabase(uuid);
      const graphDump = await exportDb();
      await saveDump(`db:${uuid}`, graphDump);
      console.log(`[addTab] Persisted db:${uuid} (${graphDump.length} bytes)`);

      await useUiDb();
      const uiDump = await exportDb();
      await saveDump("ui", uiDump);
      console.log(`[addTab] Persisted ui (${uiDump.length} bytes)`);
    } catch (err) {
      console.error("[addTab] Failed to create database:", err);
    }
  }

  function selectProfile(id: string) {
    update((s) => ({ ...s, activeProfileId: id }));
  }

  const activeProfile = ws.profiles.find((p) => p.id === ws.activeProfileId);

  return (
    <div id="workspace-bar">
      {/* Profile dropdown */}
      <div
        style={`width:${DROPDOWN_WIDTH}px; flex-shrink:0; border-right:1px solid #1a1a2e; display:flex; align-items:center;`}
      >
        <Dropdown
          items={ws.profiles.map((p) => ({ value: p.id, label: p.name }))}
          selectedValue={activeProfile?.id ?? null}
          placeholder="Profile"
          onSelect={selectProfile}
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
            wsRef={wsRef}
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
  { tab, isActive, canClose, update, wsRef }: {
    tab: Tab;
    isActive: boolean;
    canClose: boolean;
    update: Updater;
    wsRef: { current: WorkspaceState | null };
  },
) {
  const [renaming, setRenaming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  async function activateTab() {
    const currentWs = wsRef.current;
    if (switching || !currentWs || tab.id === currentWs.activeTabId) return;
    setSwitching(true);
    try {
      // 1. Flush any pending writes to the current database
      await flushSync(currentWs);

      // 2. Snapshot current tab's data
      const currentTab = getActiveTab(currentWs);
      const snapshot: DatabaseSnapshot = {
        treeNodes: currentWs.treeNodes,
        edges: currentWs.edges,
        constraints: currentWs.constraints,
        constraintApplications: currentWs.constraintApplications,
        focusId: currentWs.focusId,
        canvasExpandedNodes: currentWs.canvasExpandedNodes,
        canvasNodePositions: currentWs.canvasNodePositions,
        canvasSelected: currentWs.canvasSelected,
        canvasAlgorithm: currentWs.canvasAlgorithm,
        entityDrafts: currentWs.entityDrafts,
      };

      // 3. Load target tab's data (from cache or DB)
      let targetData: DatabaseSnapshot;
      if (currentWs._snapshotCache[tab.databaseId]) {
        targetData = currentWs._snapshotCache[tab.databaseId];
      } else {
        targetData = await loadDatabaseSnapshot(tab.databaseId, tab.rootNodeId);
      }

      // 4. Update state atomically
      update((s) => {
        const newCache = { ...s._snapshotCache };
        newCache[currentTab.databaseId] = snapshot;
        delete newCache[tab.databaseId]; // Now "live", remove from cache
        return {
          ...s,
          activeTabId: tab.id,
          ...targetData,
          connectedGraphs: [{
            id: tab.databaseId,
            label: `localStorage/${tab.name || "Untitled"} (${tab.databaseId.slice(0, 8)})`,
            connected: true,
            required: true,
          }],
          _snapshotCache: newCache,
        };
      });

      // 5. Reset sync baseline for the new database context
      // (We need to get the updated state, but since update is async in Hono
      // we set a flag and let the useEffect handle baseline reset)
    } catch (err) {
      console.error("[activateTab] Failed to switch tab:", err);
    }
    setSwitching(false);
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
    update((s) => {
      const rootId = tab.rootNodeId;
      const rootLabel = val || "Untitled";
      return {
        ...s,
        tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, name: val || null } : t),
        // Keep workspace root label in sync with tab name
        treeNodes: isActive
          ? updateNodeInTree(
            s.treeNodes,
            rootId,
            (n) => ({ ...n, label: rootLabel, version: n.version + 1 }),
          )
          : s.treeNodes,
      };
    });
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
            value={tab.name ?? ""}
            placeholder="Untitled"
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
            style={isActive ? "cursor:text;" : (tab.name ? "" : "color:#555;")}
            onClick={handleLabelClick}
          >
            {tab.name || "Untitled"}
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

  function addCodePanel() {
    const tab = getActiveTab(ws);
    update((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === tab.id ? { ...t, panels: [...t.panels, defaultCodePanel()] } : t
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
        <button
          type="button"
          title="Add a Code View panel to this tab"
          style="background:none; border:1px solid #2a2a4a; color:#555; font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px; letter-spacing:0.04em;"
          onClick={addCodePanel}
        >
          + Code View
        </button>
      </div>

      {/* Right-side controls */}
      <div style="display:flex; align-items:stretch; margin-left:auto; flex-shrink:0;">
        <FocusDropdown ws={ws} update={update} />
      </div>
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
                : panel.type === "code"
                ? (
                  <CodePanel
                    panel={panel}
                    tab={tab}
                    ws={ws}
                    update={update}
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
              {/* Horizontal resize handle */}
              <div
                style="width:5px; cursor:col-resize; background:transparent; flex-shrink:0; height:100%; position:relative; z-index:2;"
                onMouseDown={(e: MouseEvent) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startW = panel.width ?? PANEL_DEFAULT_WIDTH[panel.type];
                  const minW = PANEL_MIN_WIDTH[panel.type];
                  const prevCursor = document.body.style.cursor;
                  document.body.style.cursor = "col-resize";
                  const wrapper = (e.currentTarget as HTMLElement).parentElement!;
                  const panelEl = wrapper.firstElementChild as HTMLElement;
                  function onMove(ev: MouseEvent) {
                    panelEl.style.width = Math.max(minW, startW + ev.clientX - startX) + "px";
                  }
                  function onUp(ev: MouseEvent) {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                    document.body.style.cursor = prevCursor;
                    const w = Math.max(minW, startW + ev.clientX - startX);
                    update((s) =>
                      withPanel(s, tab.id, panel.id, (p) => ({ ...p, width: w }))
                    );
                  }
                  document.addEventListener("mousemove", onMove);
                  document.addEventListener("mouseup", onUp);
                }}
              >
                <div style="position:absolute; top:0; bottom:0; left:2px; width:1px; background:#2a2a4a;" />
              </div>
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
