import type { Selection } from "./workspace.ts";

export interface UrlState {
  profileId: string;
  workspaceId: string;
  focusId: string | null;
  selection: Selection;
}

/**
 * Parse the URL hash into navigation state.
 *
 * Format: #/{profileId}/{workspaceId}/{focusId?}/{selectionType:selectionId?}
 *
 * - `_` in the focusId slot means null (no explicit focus).
 * - Selection is `node:id`, `edge:id`, or `constraint:id`.
 */
export function parseHash(hash: string): UrlState | null {
  // Strip leading "#" and optional leading "/"
  const raw = hash.replace(/^#\/?/, "");
  if (!raw) return null;

  const parts = raw.split("/");
  if (parts.length < 2) return null;

  const profileId = parts[0];
  const workspaceId = parts[1];
  if (!profileId || !workspaceId) return null;

  const focusId = parts[2] && parts[2] !== "_" ? parts[2] : null;

  let selection: Selection = null;
  if (parts[3]) {
    const colonIdx = parts[3].indexOf(":");
    if (colonIdx > 0) {
      const type = parts[3].slice(0, colonIdx);
      const id = parts[3].slice(colonIdx + 1);
      if ((type === "node" || type === "edge" || type === "constraint") && id) {
        selection = { type, id };
      }
    }
  }

  return { profileId, workspaceId, focusId, selection };
}

/**
 * Serialize navigation state into a URL hash string (including the leading `#`).
 */
export function serializeHash(state: UrlState): string {
  const parts = [state.profileId, state.workspaceId];

  // Only append focus/selection segments if they carry information
  if (state.focusId || state.selection) {
    parts.push(state.focusId ?? "_");
  }
  if (state.selection) {
    parts.push(`${state.selection.type}:${state.selection.id}`);
  }

  return "#/" + parts.join("/");
}

/**
 * Read the current UrlState from location.hash.
 */
export function readUrlState(): UrlState | null {
  return parseHash(globalThis.location?.hash ?? "");
}

/**
 * Update the URL hash. Uses pushState for profile/workspace changes (creates
 * history entries for back-button navigation) and replaceState for
 * focus/selection changes (avoids polluting history with every click).
 */
export function writeUrlState(state: UrlState, push: boolean): void {
  const hash = serializeHash(state);
  if (push) {
    globalThis.history.pushState(null, "", hash);
  } else {
    globalThis.history.replaceState(null, "", hash);
  }
}

/**
 * Build a UrlState from WorkspaceState fields.
 */
export function urlStateFromWs(ws: {
  activeProfileId: string;
  activeWorkspaceId: string;
  focusId: string | null;
  canvasSelected: Selection;
}): UrlState {
  return {
    profileId: ws.activeProfileId,
    workspaceId: ws.activeWorkspaceId,
    focusId: ws.focusId,
    selection: ws.canvasSelected,
  };
}
