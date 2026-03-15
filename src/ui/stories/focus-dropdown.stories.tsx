/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { FocusDropdown } from "../components/focus-dropdown.tsx";
import { defaultState, makeNode, type Updater, type WorkspaceState } from "../workspace.ts";

export const meta = { title: "Focus Dropdown" };

// Render the dropdown inside a controls-bar mockup matching its real context.
function Bar({ initial }: { initial: WorkspaceState }) {
  const [ws, setWs] = useState<WorkspaceState>(initial);
  const update: Updater = (fn) => setWs((prev) => fn(prev));

  return (
    <div style="display:flex; align-items:stretch; height:32px; width:640px; background:#0a0a1e; border:1px solid #1a1a2e; font-family:system-ui,sans-serif;">
      {/* Workflow stub */}
      <div style="padding:0 10px; font-size:11px; color:#444; display:flex; align-items:center; border-right:1px solid #1a1a2e;">
        Workflow ▾
      </div>
      {/* View controls stub */}
      <div style="padding:0 10px; font-size:11px; color:#444; display:flex; align-items:center; gap:8px;">
        + Tree View
      </div>
      {/* Right side */}
      <div style="display:flex; align-items:stretch; margin-left:auto;">
        <FocusDropdown ws={ws} update={update} />
        {/* Connected graphs stub */}
        <div style="padding:0 10px; font-size:11px; color:#3a3a5a; display:flex; align-items:center; border-left:1px solid #1a1a2e;">
          1 graph ▾
        </div>
      </div>
    </div>
  );
}

/** No focus — shows "(root)" as the label. */
export function AtRoot() {
  const ws = defaultState();
  return <Bar initial={ws} />;
}

/**
 * Focus = auth-service.
 * Dropdown shows: (root) + acme/backend above the divider,
 * ▶ auth-service as current, nothing below (no selected node).
 */
export function FocusedOnAuthService() {
  const ws = defaultState();
  ws.focusId = "spike://acme/backend/auth-service";
  return <Bar initial={ws} />;
}

/**
 * Story from the plan — focus = auth-service, selected = token-validator.
 * token-validator is a leaf so no path-to-selection row appears below.
 */
export function FocusedWithLeafSelected() {
  const ws = defaultState();
  ws.focusId = "spike://acme/backend/auth-service";
  ws.canvasSelected = { type: "node", id: "spike://acme/backend/auth-service/token-validator" };
  return <Bar initial={ws} />;
}

/**
 * Deeper tree — focus = auth-service, selected = a leaf inside a nested
 * composite. The intermediate composite appears in the path-to-selection group.
 *
 * Tree:
 *   acme/backend
 *     auth-service  ← focus
 *       session-mgmt  ← composite (appears below divider)
 *         token-validator  ← selected leaf
 */
export function FocusedWithPathToSelection() {
  const ws = defaultState();
  // Replace default tree with a deeper structure
  ws.treeNodes = [
    makeNode("spike://acme/backend", "acme/backend", "composite", [
      makeNode("spike://acme/backend/auth-service", "auth-service", "composite", [
        makeNode("spike://acme/backend/auth-service/session-mgmt", "session-mgmt", "composite", [
          makeNode(
            "spike://acme/backend/auth-service/session-mgmt/token-validator",
            "token-validator",
            "leaf",
            [],
          ),
        ]),
      ]),
    ], "spike://acme/backend"),
  ];
  ws.focusId = "spike://acme/backend/auth-service";
  ws.canvasSelected = {
    type: "node",
    id: "spike://acme/backend/auth-service/session-mgmt/token-validator",
  };
  return <Bar initial={ws} />;
}
