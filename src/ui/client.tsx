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
  freshProfileState,
  getConnectionConfig,
  loadProfileState,
  loadState,
  loadStateAsync,
  localDbIdFromUrl,
  makeRootNode,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  type Profile,
  removeNodeFromTree,
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
import { readUrlState, serializeHash, urlStateFromWs, writeUrlState } from "./url-state.ts";
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

  // Guard against re-entrant URL ↔ state sync
  const suppressHashSync = useRef(false);
  // When true, next URL sync uses pushState instead of replaceState
  const pushNextUrl = useRef(false);

  // Async initialisation — load from SurrealDB (with localStorage migration),
  // then apply URL hash overrides (or set hash from loaded state).
  useEffect(() => {
    loadStateAsync()
      .then(async (state) => {
        const urlState = readUrlState();
        if (urlState) {
          // URL has navigation state — apply overrides
          const urlProfile = state.profiles.find(
            (p) => p.id === urlState.profileId,
          );
          if (urlProfile?.localDatabaseId) {
            // Switch to the URL-specified profile's database if different
            if (urlProfile.localDatabaseId !== state.databaseId) {
              await useDatabase(urlProfile.localDatabaseId);
              const loaded = await loadProfileState(
                urlProfile.localDatabaseId,
                urlProfile.name,
              );
              Object.assign(state, {
                activeProfileId: urlState.profileId,
                ...loaded,
              });
            } else {
              state.activeProfileId = urlState.profileId;
            }
          }
          // Apply workspace/focus/selection from URL
          if (urlState.workspaceId) {
            state.activeWorkspaceId = urlState.workspaceId;
          }
          if (urlState.focusId) {
            state.focusId = urlState.focusId;
          }
          state.canvasSelected = urlState.selection;
        } else {
          // No hash — set it from loaded state
          writeUrlState(urlStateFromWs(state), false);
        }
        setWs(state);
        setSyncBaseline(state);
      })
      .catch((err) => {
        console.error("[init] SurrealDB init failed, falling back to localStorage:", err);
        setDbError(String(err));
        const state = loadState();
        setWs(state);
        writeUrlState(urlStateFromWs(state), false);
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

  // Sync URL hash from state — pushState for workspace/profile changes, replaceState otherwise
  useEffect(() => {
    if (!ws || suppressHashSync.current) return;
    const current = readUrlState();
    const desired = urlStateFromWs(ws);
    if (!current || serializeHash(desired) !== serializeHash(current)) {
      const push = pushNextUrl.current ?? false;
      pushNextUrl.current = false;
      writeUrlState(desired, push);
    }
  }, [ws]);

  // Handle back/forward button via hashchange
  useEffect(() => {
    const handler = () => {
      if (suppressHashSync.current) return;
      const urlState = readUrlState();
      if (!urlState) return;
      const current = wsRef.current;
      if (!current) return;

      suppressHashSync.current = true;
      try {
        // Profile changed — need async database switch
        if (urlState.profileId !== current.activeProfileId) {
          const profile = current.profiles.find(
            (p) => p.id === urlState.profileId,
          );
          if (profile?.localDatabaseId) {
            // Fire async profile switch
            (async () => {
              try {
                await flushSync(current);
                await useDatabase(profile.localDatabaseId!);
                const loaded = await loadProfileState(
                  profile.localDatabaseId!,
                  profile.name,
                );
                setWs((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    activeProfileId: urlState.profileId,
                    ...loaded,
                    activeWorkspaceId: urlState.workspaceId ||
                      loaded.activeWorkspaceId,
                    focusId: urlState.focusId ?? loaded.focusId,
                    canvasSelected: urlState.selection,
                  };
                });
                setSyncBaseline(wsRef.current!);
              } finally {
                suppressHashSync.current = false;
              }
            })();
            return; // async — don't unsuppress yet
          }
        }

        // Same profile — workspace/focus/selection change only
        setWs((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          if (urlState.workspaceId !== prev.activeWorkspaceId) {
            next.activeWorkspaceId = urlState.workspaceId;
            next.panels = [defaultPanel()];
          }
          next.focusId = urlState.focusId ?? urlState.workspaceId;
          next.canvasSelected = urlState.selection;
          return next;
        });
      } finally {
        // Only unsuppress if we didn't start an async operation
        if (suppressHashSync.current) {
          queueMicrotask(() => {
            suppressHashSync.current = false;
          });
        }
      }
    };

    globalThis.addEventListener("hashchange", handler);
    return () => globalThis.removeEventListener("hashchange", handler);
  }, []);

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
      <WorkspaceBar
        ws={ws}
        wsRef={wsRef}
        update={update}
        pushUrl={() => {
          pushNextUrl.current = true;
        }}
      />
      <WorkspaceControls ws={ws} update={update} />
      <WorkspaceArea ws={ws} update={update} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Workspace bar
// ---------------------------------------------------------------------------

function WorkspaceBar(
  { ws, wsRef, update, pushUrl }: {
    ws: WorkspaceState;
    wsRef: { current: WorkspaceState | null };
    update: Updater;
    pushUrl: () => void;
  },
) {
  function addTab() {
    const rootNodeId = crypto.randomUUID();
    pushUrl();
    update((s) => {
      const newRoot = makeRootNode(rootNodeId, []);
      const wsConstraint = ensureWorkspaceConstraint(
        s.constraints,
        s.constraintApplications,
        rootNodeId,
      );
      // Add workspace node as child of the profile root
      const treeNodes = updateNodeInTree(
        s.treeNodes,
        s.profileRootId,
        (n) => ({ ...n, children: [...n.children, newRoot] }),
      );
      return {
        ...s,
        activeWorkspaceId: rootNodeId,
        panels: [defaultPanel()],
        treeNodes,
        ...wsConstraint,
        focusId: rootNodeId,
      };
    });
  }

  async function selectProfile(id: string) {
    if (id === ws.activeProfileId) return;
    const targetProfile = ws.profiles.find((p) => p.id === id);
    if (!targetProfile?.localDatabaseId) {
      console.warn("[profile] No localDatabaseId for profile", id);
      return;
    }

    try {
      // Flush current state to its database
      const current = wsRef.current;
      if (current) await flushSync(current);

      // Create fresh state for the target profile's database
      const dbId = targetProfile.localDatabaseId;
      await useDatabase(dbId);

      // Load the target profile's saved state (or fresh state if empty)
      const loaded = await loadProfileState(dbId, targetProfile.name);
      console.log("[profile] loaded state for", targetProfile.name, {
        dbId: dbId.slice(0, 8),
        profileRootId: loaded.profileRootId.slice(0, 8),
        focusId: loaded.focusId?.slice(0, 8) ?? null,
        activeWorkspaceId: loaded.activeWorkspaceId.slice(0, 8),
      });
      pushUrl();
      update((s) => ({
        ...s,
        activeProfileId: id,
        ...loaded,
      }));
      setSyncBaseline(wsRef.current!);
    } catch (err) {
      console.error("[profile] Failed to switch profile:", err);
    }
  }

  async function addProfile(p: Profile) {
    try {
      // Create a new SurrealDB database for this profile
      // Derive database ID from local URL path (e.g. indxdb://foobar → "foobar")
      const localId = localDbIdFromUrl(p.url);
      const dbId = await createDatabase(p.name, localId ?? undefined);
      p.localDatabaseId = dbId;

      // Flush current state first
      const current = wsRef.current;
      if (current) await flushSync(current);

      // Initialize the new database with fresh profile state
      const fresh = freshProfileState(p.name, dbId);

      // Persist the new empty database to IndexedDB
      await useDatabase(dbId);
      const graphDump = await exportDb();
      await saveDump(`db:${dbId}`, graphDump);

      pushUrl();
      update((s) => ({
        ...s,
        profiles: [...s.profiles, p],
        activeProfileId: p.id,
        ...fresh,
      }));
      setSyncBaseline(wsRef.current!);

      // Persist UI state with new profile
      await useUiDb();
      const uiDump = await exportDb();
      await saveDump("ui", uiDump);

      console.log(`[profile] Created profile "${p.name}" with db:${dbId}`);
    } catch (err) {
      console.error("[profile] Failed to create profile:", err);
    }
  }

  return (
    <div id="workspace-bar">
      {/* Profile indicator */}
      <ProfileSegment
        profiles={ws.profiles}
        activeProfileId={ws.activeProfileId}
        onSelect={selectProfile}
        onAdd={addProfile}
        onUpdate={(p) =>
          update((s) => ({ ...s, profiles: s.profiles.map((x) => x.id === p.id ? p : x) }))}
        onDelete={(id) => {
          const remaining = ws.profiles.filter((p) => p.id !== id);
          if (remaining.length === 0) return;
          const switchTo = remaining.find((p) => p.isDefault) ?? remaining[0];
          update((s) => ({ ...s, profiles: remaining }));
          if (id === ws.activeProfileId) selectProfile(switchTo.id);
        }}
      />

      {/* Tabs — derived from profile root's children */}
      <div style="display:flex; align-items:center; gap:4px; flex:1; overflow:hidden; padding:0 8px;">
        {(() => {
          const profileRoot = findNode(ws.treeNodes, ws.profileRootId);
          const workspaces = profileRoot?.children ?? [];
          return workspaces.map((wsNode) => (
            <TabItem
              key={wsNode.id}
              workspaceId={wsNode.id}
              label={wsNode.label === "Untitled" ? null : wsNode.label}
              isActive={wsNode.id === ws.activeWorkspaceId}
              canClose={workspaces.length > 1}
              update={update}
              pushUrl={pushUrl}
            />
          ));
        })()}
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
  { profiles, activeProfileId, onSelect, onAdd, onUpdate, onDelete }: {
    profiles: Profile[];
    activeProfileId: string;
    onSelect: (id: string) => void;
    onAdd: (p: Profile) => void;
    onUpdate: (p: Profile) => void;
    onDelete: (id: string) => void;
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
        url: existing?.isDefault ? existing.url : formUrl.trim(),
        isDefault: existing?.isDefault,
        localDatabaseId: existing?.localDatabaseId,
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
  const editingProfile = formMode && formMode !== "new"
    ? profiles.find((p) => p.id === formMode)
    : null;
  const isEditingDefault = editingProfile?.isDefault === true;
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
                    disabled={isEditingDefault}
                    onInput={(e: InputEvent) => setFormUrl((e.target as HTMLInputElement).value)}
                    placeholder="indxdb://... or wss://..."
                    style={`${FIELD} font-family:ui-monospace,monospace;${
                      isEditingDefault ? " opacity:0.4; cursor:not-allowed;" : ""
                    }`}
                  />
                  {isEditingDefault && (
                    <div style="font-size:10px; color:#3a3a5a; margin-top:2px;">
                      Default profile URL cannot be changed
                    </div>
                  )}
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
                  {formMode !== "new" && !isEditingDefault && (
                    <button
                      type="button"
                      style="background:none; border:1px solid #3a2020; color:#a05050; font-size:11px; padding:4px 10px; border-radius:3px; cursor:pointer; margin-right:auto;"
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        if (formMode) {
                          onDelete(formMode);
                          resetForm();
                          setOpen(false);
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
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
  { workspaceId, label, isActive, canClose, update, pushUrl }: {
    workspaceId: string;
    label: string | null;
    isActive: boolean;
    canClose: boolean;
    update: Updater;
    pushUrl: () => void;
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
    pushUrl();
    update((s) => {
      if (workspaceId === s.activeWorkspaceId) return s;
      return {
        ...s,
        activeWorkspaceId: workspaceId,
        panels: [defaultPanel()],
        focusId: workspaceId,
      };
    });
  }

  function closeTab(e: MouseEvent) {
    e.stopPropagation();
    pushUrl();
    update((s) => {
      const profileRoot = findNode(s.treeNodes, s.profileRootId);
      const siblings = profileRoot?.children ?? [];
      const idx = siblings.findIndex((c) => c.id === workspaceId);
      const nextActiveId = s.activeWorkspaceId === workspaceId
        ? (siblings[Math.max(0, idx - 1)]?.id ?? siblings[idx + 1]?.id ?? s.activeWorkspaceId)
        : s.activeWorkspaceId;

      // Delete workspace node and its entire subtree from the graph
      const rootNode = findNode(s.treeNodes, workspaceId);
      if (!rootNode) return s;
      const subtreeIds = collectSubtreeIds(rootNode);
      const newTreeNodes = removeNodeFromTree(s.treeNodes, workspaceId);
      const newEdges = s.edges.filter(
        (edge) => !subtreeIds.has(edge.fromId) && !subtreeIds.has(edge.toId),
      );
      const newApps = s.constraintApplications.filter(
        (a) => !subtreeIds.has(a.entityId),
      );

      return {
        ...s,
        activeWorkspaceId: nextActiveId,
        panels: nextActiveId !== s.activeWorkspaceId ? [defaultPanel()] : s.panels,
        treeNodes: newTreeNodes,
        edges: newEdges,
        constraintApplications: newApps,
        focusId: nextActiveId,
      };
    });
  }

  function finishRename() {
    const val = inputRef.current?.value.trim() ?? "";
    update((s) => ({
      ...s,
      treeNodes: updateNodeInTree(
        s.treeNodes,
        workspaceId,
        (n) => ({ ...n, label: val || "Untitled", version: n.version + 1 }),
      ),
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
            value={label ?? ""}
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
            style={isActive ? "cursor:text;" : (label ? "" : "color:#555;")}
            onClick={handleLabelClick}
          >
            {label || "Untitled"}
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
    update((s) => ({ ...s, panels: [...s.panels, defaultPanel()] }));
  }

  function addConstraintsPanel() {
    update((s) => ({ ...s, panels: [...s.panels, defaultConstraintsPanel()] }));
  }

  function addCodePanel() {
    update((s) => ({ ...s, panels: [...s.panels, defaultCodePanel()] }));
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
      {ws.panels.length > 0 && (
        <div style="position:absolute; top:0; left:0; bottom:0; display:flex; z-index:1; pointer-events:none;">
          {ws.panels.map((panel) => (
            <div key={panel.id} style="pointer-events:auto; height:100%; display:flex;">
              {panel.type === "constraints"
                ? (
                  <ConstraintsPanel
                    panel={panel}
                    ws={ws}
                    update={update}
                    diagnostics={diagnostics}
                  />
                )
                : panel.type === "code"
                ? (
                  <CodePanel
                    panel={panel}
                    ws={ws}
                    update={update}
                  />
                )
                : (
                  <TreePanel
                    panel={panel}
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
                      withPanel(s, panel.id, (p) => ({ ...p, width: w }))
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
