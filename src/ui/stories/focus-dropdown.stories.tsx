/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { FocusDropdown } from "../components/focus-dropdown.tsx";
import {
  defaultState,
  makeNode,
  makeRootNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";

export const meta = { title: "Focus Dropdown" };

// Render the dropdown inside a controls-bar mockup matching its real context.
function Bar({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  return (
    <div style="display:flex; align-items:stretch; height:32px; width:640px; background:#0a0a1e; border:1px solid #1a1a2e; font-family:system-ui,sans-serif;">
      {/* View controls stub */}
      <div style="padding:0 10px; font-size:11px; color:#444; display:flex; align-items:center; gap:8px;">
        + Tree View
      </div>
      {/* Right side */}
      <div style="display:flex; align-items:stretch; margin-left:auto;">
        <FocusDropdown ws={ws} update={update} />
      </div>
    </div>
  );
}

/** Default state — focused on the workspace root (shows its label). */
export function AtWorkspaceRoot() {
  const ws = defaultState();
  return <Bar initial={ws} />;
}

/** Focused on the profile root — shows the profile node label (e.g. "Local"). */
export function AtProfileRoot() {
  const ws = defaultState();
  ws.focusId = ws.profileRootId;
  return <Bar initial={ws} />;
}

/** Virtual root (focusId=null) — shows "(root)" above the profile level. */
export function AtVirtualRoot() {
  const ws = defaultState();
  ws.focusId = null;
  return <Bar initial={ws} />;
}

/**
 * Deeper tree — focus on a composite node inside the workspace.
 * Dropdown shows ancestors (profile root, workspace root) above the divider.
 */
export function FocusedOnComposite() {
  const ds = defaultState();
  const rootId = ds.tabs[0].rootNodeId;
  const composite = makeNode("composite-1", "auth-service", "composite", [
    makeNode("leaf-1", "token-validator", "leaf", []),
  ]);
  ds.treeNodes = [
    makeRootNode(ds.profileRootId, [
      makeRootNode(rootId, [composite]),
    ]),
  ];
  ds.focusId = "composite-1";
  return <Bar initial={ds} />;
}

/**
 * Focus on a composite with a selected leaf inside a nested composite.
 * The intermediate composite appears in the path-to-selection group below the divider.
 */
export function FocusedWithPathToSelection() {
  const ds = defaultState();
  const rootId = ds.tabs[0].rootNodeId;
  ds.treeNodes = [
    makeRootNode(ds.profileRootId, [
      makeRootNode(rootId, [
        makeNode("auth-service", "auth-service", "composite", [
          makeNode("session-mgmt", "session-mgmt", "composite", [
            makeNode("token-validator", "token-validator", "leaf", []),
          ]),
        ]),
      ]),
    ]),
  ];
  ds.focusId = "auth-service";
  ds.canvasSelected = { type: "node", id: "token-validator" };
  return <Bar initial={ds} />;
}
