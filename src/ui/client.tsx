/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { render, useEffect, useMemo, useRef, useState } from "@hono/hono/jsx/dom";
import { FocusDropdown } from "./components/focus-dropdown.tsx";
import { TreePanel } from "./components/tree-panel.tsx";
import { ConstraintsPanel } from "./components/constraints-panel.tsx";
import { CodePanel } from "./components/code-panel.tsx";
import { Canvas } from "./components/canvas.tsx";
import { validateWorkspace } from "../graph/validate_workspace.ts";
import {
  collectSubtreeIds,
  defaultCodePanel,
  defaultConstraintsPanel,
  defaultPanel,
  ensureWorkspaceConstraint,
  findNode,
  getActiveTab,
  getConnectionConfig,
  loadState,
  loadStateAsync,
  makeRootNode,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  type Profile,
  removeNodeFromTree,
  type Tab,
  updateNodeInTree,
  type Updater,
  withPanel,
  type WorkspaceState,
} from "./workspace.ts";
import { flushSync, scheduleSyncToDb, setSyncBaseline } from "./db/sync.ts";
import {
  type ConnectionConfig,
  connectRemote,
  disconnectRemote,
  remoteConnectionIds,
} from "./db/surreal.ts";
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

  // Keep a ref to the latest ws so async closures always see current state —
  // Hono doesn't re-render child components.
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
      <WorkspaceBar ws={ws} update={update} />
      <WorkspaceControls ws={ws} update={update} />
      <WorkspaceArea ws={ws} update={update} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Workspace bar
// ---------------------------------------------------------------------------

function WorkspaceBar(
  { ws, update }: {
    ws: WorkspaceState;
    update: Updater;
  },
) {
  function addTab() {
    const tabId = crypto.randomUUID();
    const rootNodeId = crypto.randomUUID();
    update((s) => {
      const newRoot = makeRootNode(rootNodeId, []);
      const wsConstraint = ensureWorkspaceConstraint(
        s.constraints,
        s.constraintApplications,
        rootNodeId,
      );
      return {
        ...s,
        tabs: [...s.tabs, {
          id: tabId,
          name: null,
          rootNodeId,
          panels: [defaultPanel()],
        }],
        activeTabId: tabId,
        treeNodes: [...s.treeNodes, newRoot],
        ...wsConstraint,
        focusId: rootNodeId,
      };
    });
  }

  function selectProfile(id: string) {
    update((s) => ({ ...s, activeProfileId: id }));
  }

  return (
    <div id="workspace-bar">
      {/* Profile indicator */}
      <ProfileSegment
        profiles={ws.profiles}
        activeProfileId={ws.activeProfileId}
        onSelect={selectProfile}
        onAdd={(p) =>
          update((s) => ({ ...s, profiles: [...s.profiles, p], activeProfileId: p.id }))}
        onUpdate={(p) =>
          update((s) => ({ ...s, profiles: s.profiles.map((x) => x.id === p.id ? p : x) }))}
      />

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
// Profile segment — green dot + name, click to switch profiles
// ---------------------------------------------------------------------------

function ProfileSegment(
  { profiles, activeProfileId, onSelect, onAdd, onUpdate }: {
    profiles: Profile[];
    activeProfileId: string;
    onSelect: (id: string) => void;
    onAdd: (p: Profile) => void;
    onUpdate: (p: Profile) => void;
  },
) {
  const [open, setOpen] = useState(false);
  // null = no form, "new" = adding, string = editing that profile's id
  const [formMode, setFormMode] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formNamespace, setFormNamespace] = useState("");
  const [formDatabase, setFormDatabase] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const active = profiles.find((p) => p.id === activeProfileId);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [open]);

  function resetForm() {
    setFormName("");
    setFormUrl("");
    setFormNamespace("");
    setFormDatabase("");
    setFormUsername("");
    setFormPassword("");
    setShowAdvanced(false);
    setFormMode(null);
  }

  function startEdit(p: Profile) {
    setFormMode(p.id);
    setFormName(p.name);
    setFormUrl(p.url);
    setFormNamespace(p.namespace ?? "");
    setFormDatabase(p.database ?? "");
    setFormUsername(p.username ?? "");
    setFormPassword(p.password ?? "");
    setShowAdvanced(Boolean(p.namespace || p.database || p.username || p.password));
  }

  function handleSave() {
    if (!formName.trim() || !formUrl.trim()) return;
    if (formMode === "new") {
      const p: Profile = {
        id: crypto.randomUUID(),
        name: formName.trim(),
        url: formUrl.trim(),
      };
      if (formNamespace.trim()) p.namespace = formNamespace.trim();
      if (formDatabase.trim()) p.database = formDatabase.trim();
      if (formUsername.trim()) p.username = formUsername.trim();
      if (formPassword.trim()) p.password = formPassword.trim();
      onAdd(p);
    } else if (formMode) {
      const existing = profiles.find((p) => p.id === formMode);
      const p: Profile = {
        id: formMode,
        name: formName.trim(),
        url: formUrl.trim(),
        isDefault: existing?.isDefault,
      };
      if (formNamespace.trim()) p.namespace = formNamespace.trim();
      if (formDatabase.trim()) p.database = formDatabase.trim();
      if (formUsername.trim()) p.username = formUsername.trim();
      if (formPassword.trim()) p.password = formPassword.trim();
      onUpdate(p);
    }
    resetForm();
    setOpen(false);
  }

  function isLocalUrl(url: string) {
    return url.startsWith("indxdb://") || url.startsWith("indexdb://");
  }

  const FIELD =
    "width:100%; box-sizing:border-box; background:#0a0a18; border:1px solid #252538; color:#999; font-size:12px; padding:5px 8px; border-radius:3px; outline:none;";
  const LABEL = "font-size:10px; color:#3a3a5a; letter-spacing:0.05em; text-transform:uppercase;";

  const isEditing = formMode !== null;
  const formTitle = formMode === "new" ? "New Profile" : "Edit Profile";

  return (
    <div style="position:relative; display:flex; align-items:center; flex-shrink:0; border-right:1px solid #1a1a2e;">
      <div
        style="display:flex; align-items:center; gap:6px; padding:0 12px; cursor:pointer; user-select:none;"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
          if (open) resetForm();
        }}
      >
        <div style="width:6px; height:6px; border-radius:50%; background:#4a7; flex-shrink:0;" />
        <span style="font-size:11px; color:#888; white-space:nowrap;">
          {active?.name ?? "Profile"}
        </span>
      </div>
      {open && (
        <div
          style="position:absolute; top:100%; left:0; min-width:300px; background:#0d0d1e; border:1px solid #252538; border-top:none; z-index:200; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <div style={`${LABEL} padding:10px 12px 6px;`}>Profiles</div>
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId;
            const isHovered = hovered === p.id;
            const scheme = isLocalUrl(p.url) ? "local" : "remote";
            return (
              <div
                key={p.id}
                style={[
                  "display:flex; align-items:center; gap:8px; padding:8px 12px; cursor:pointer; border-bottom:1px solid #1a1a2e;",
                  isActive
                    ? "background:#141428; color:#9090c0;"
                    : isHovered
                    ? "background:#111122; color:#888;"
                    : "color:#666;",
                ].join("")}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => {
                  setOpen(false);
                  resetForm();
                  onSelect(p.id);
                }}
              >
                <div style="flex:1; min-width:0;">
                  <div style="font-size:12px;">{p.name}</div>
                  <div style="font-size:10px; color:#3a3a5a; font-family:ui-monospace,monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    {p.url}
                  </div>
                </div>
                <span style="font-size:10px; color:#3a3a5a; flex-shrink:0;">{scheme}</span>
                {isActive && <span style="font-size:10px; color:#4a7; flex-shrink:0;">active</span>}
                <span
                  style="font-size:10px; color:#3a3a5a; flex-shrink:0; cursor:pointer;"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    startEdit(p);
                  }}
                >
                  ✎
                </span>
              </div>
            );
          })}

          {isEditing
            ? (
              <div style="padding:10px 12px; border-top:1px solid #1a1a2e;">
                <div style="font-size:12px; color:#999; font-weight:500; margin-bottom:10px;">
                  {formTitle}
                </div>
                <div style="margin-bottom:8px;">
                  <div style={`${LABEL} margin-bottom:3px;`}>Name</div>
                  <input
                    type="text"
                    value={formName}
                    onInput={(e: InputEvent) => setFormName((e.target as HTMLInputElement).value)}
                    placeholder="e.g. Staging"
                    style={FIELD}
                  />
                </div>
                <div style="margin-bottom:8px;">
                  <div style={`${LABEL} margin-bottom:3px;`}>URL</div>
                  <input
                    type="text"
                    value={formUrl}
                    onInput={(e: InputEvent) => setFormUrl((e.target as HTMLInputElement).value)}
                    placeholder="indxdb://... or wss://..."
                    style={`${FIELD} font-family:ui-monospace,monospace;`}
                  />
                </div>
                <div
                  style="display:flex; align-items:center; gap:4px; padding:4px 0; cursor:pointer; user-select:none;"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span style="font-size:10px; color:#3a3a5a;">
                    {showAdvanced ? "\u25be" : "\u25b8"}
                  </span>
                  <span style={LABEL}>Advanced</span>
                </div>
                {showAdvanced && (
                  <div style="padding-left:10px; border-left:1px solid #1a1a2e; margin-bottom:4px;">
                    <div style="margin-bottom:6px;">
                      <div style={`${LABEL} margin-bottom:3px;`}>Namespace</div>
                      <input
                        type="text"
                        value={formNamespace}
                        onInput={(e: InputEvent) =>
                          setFormNamespace((e.target as HTMLInputElement).value)}
                        placeholder="marlinspike"
                        style={FIELD}
                      />
                    </div>
                    <div style="margin-bottom:6px;">
                      <div style={`${LABEL} margin-bottom:3px;`}>Database</div>
                      <input
                        type="text"
                        value={formDatabase}
                        onInput={(e: InputEvent) =>
                          setFormDatabase((e.target as HTMLInputElement).value)}
                        placeholder="(auto)"
                        style={FIELD}
                      />
                    </div>
                    <div style="margin-bottom:6px;">
                      <div style={`${LABEL} margin-bottom:3px;`}>Username</div>
                      <input
                        type="text"
                        value={formUsername}
                        onInput={(e: InputEvent) =>
                          setFormUsername((e.target as HTMLInputElement).value)}
                        placeholder="(optional)"
                        style={FIELD}
                      />
                    </div>
                    <div style="margin-bottom:6px;">
                      <div style={`${LABEL} margin-bottom:3px;`}>Password</div>
                      <input
                        type="password"
                        value={formPassword}
                        onInput={(e: InputEvent) =>
                          setFormPassword((e.target as HTMLInputElement).value)}
                        placeholder="(optional)"
                        style={FIELD}
                      />
                    </div>
                  </div>
                )}
                <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                  <button
                    type="button"
                    style="background:none; border:1px solid #252538; color:#666; font-size:11px; padding:4px 10px; border-radius:3px; cursor:pointer;"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      resetForm();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    style={`border:1px solid #3a3a6a; font-size:11px; padding:4px 10px; border-radius:3px; cursor:pointer; ${
                      formName.trim() && formUrl.trim()
                        ? "background:#1a1a3a; color:#9090c0;"
                        : "background:none; color:#3a3a5a; cursor:default;"
                    }`}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      handleSave();
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )
            : (
              <div
                style={[
                  "display:flex; align-items:center; gap:8px; padding:8px 12px; cursor:pointer;",
                  hovered === "add" ? "color:#555;" : "color:#2a2a4a;",
                ].join("")}
                onMouseEnter={() => setHovered("add")}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setFormMode("new")}
              >
                <span style="font-size:14px;">+</span>
                <span style="font-size:11px;">New profile</span>
              </div>
            )}
        </div>
      )}
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
    update((s) => {
      if (tab.id === s.activeTabId) return s;
      return { ...s, activeTabId: tab.id, focusId: tab.rootNodeId };
    });
  }

  function closeTab(e: MouseEvent) {
    e.stopPropagation();
    update((s) => {
      const idx = s.tabs.findIndex((t) => t.id === tab.id);
      const newTabs = s.tabs.filter((t) => t.id !== tab.id);
      const newActiveId = s.activeTabId === tab.id
        ? (newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]?.id)
        : s.activeTabId;

      // Delete workspace node and its entire subtree from the graph
      const rootNode = findNode(s.treeNodes, tab.rootNodeId);
      if (!rootNode) {
        return { ...s, tabs: newTabs, activeTabId: newActiveId };
      }
      const subtreeIds = collectSubtreeIds(rootNode);
      const newTreeNodes = removeNodeFromTree(s.treeNodes, tab.rootNodeId);
      const newEdges = s.edges.filter(
        (edge) => !subtreeIds.has(edge.fromId) && !subtreeIds.has(edge.toId),
      );
      const newApps = s.constraintApplications.filter(
        (a) => !subtreeIds.has(a.entityId),
      );

      // Focus the new active tab's workspace root
      const newActiveTab = newTabs.find((t) => t.id === newActiveId);
      const newFocusId = newActiveTab?.rootNodeId ?? s.focusId;

      return {
        ...s,
        tabs: newTabs,
        activeTabId: newActiveId,
        treeNodes: newTreeNodes,
        edges: newEdges,
        constraintApplications: newApps,
        focusId: newFocusId,
      };
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
  { ws, update }: {
    ws: WorkspaceState;
    update: Updater;
  },
) {
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
