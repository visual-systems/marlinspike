/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useState } from "@hono/hono/jsx/dom";
import {
  collectSubtreeIds,
  findNode,
  findPath,
  type TreeNode,
  type Updater,
  type WorkspaceState,
} from "../workspace.ts";

export function FocusDropdown({ ws, update }: { ws: WorkspaceState; update: Updater }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [open]);

  // Path from root to current focus (all nodes, inclusive)
  const focusPath: TreeNode[] = ws.focusId ? findPath(ws.treeNodes, ws.focusId) : [];
  const focusNode: TreeNode | null = ws.focusId
    ? (findNode(ws.treeNodes, ws.focusId) ?? null)
    : null;
  const label = focusNode ? focusNode.label : "(root)";

  // Path from focus down to selected canvas node (composites only, excluding focus itself)
  const selectedNodeId = ws.canvasSelected?.type === "node" ? ws.canvasSelected.id : null;
  let pathToSelection: TreeNode[] = [];
  if (selectedNodeId && selectedNodeId !== ws.focusId) {
    const fullPath = findPath(ws.treeNodes, selectedNodeId);
    const afterFocus = ws.focusId
      ? fullPath.slice(fullPath.findIndex((n) => n.id === ws.focusId) + 1)
      : fullPath;
    pathToSelection = afterFocus.filter((n) => n.kind === "composite");
  }

  function setFocus(id: string | null) {
    update((s) => {
      const subtreeIds = id ? collectSubtreeIds(findNode(s.treeNodes, id)!) : null;
      // Keep only nodes within the new subtree (or all if ascending to root)
      let expanded = subtreeIds
        ? s.canvasExpandedNodes.filter((nid) => subtreeIds.has(nid))
        : s.canvasExpandedNodes;
      // When ascending: add the old focus node to expanded so it re-appears
      // as an already-open box, preserving visual continuity
      const oldFocusId = s.focusId;
      if (oldFocusId && (!subtreeIds || subtreeIds.has(oldFocusId))) {
        if (!expanded.includes(oldFocusId)) expanded = [...expanded, oldFocusId];
      }
      return { ...s, focusId: id, canvasExpandedNodes: expanded };
    });
    setOpen(false);
  }

  const triggerStyle =
    "display:flex; align-items:center; gap:4px; padding:0 8px; height:100%; font-size:11px; color:#888; cursor:pointer; user-select:none; border-left:1px solid #1a1a2e; flex-shrink:0;";
  const itemStyle = (dimmed = false) =>
    `display:flex; align-items:center; padding:5px 10px; font-size:11px; cursor:pointer; color:${
      dimmed ? "#404466" : "#888"
    }; white-space:nowrap;`;
  const currentItemStyle =
    "display:flex; align-items:center; padding:5px 10px; font-size:11px; color:#a0b4e0; user-select:none; white-space:nowrap; gap:4px;";
  const dividerStyle = "height:1px; background:#1a1a2e; margin:2px 0;";

  // Ancestors: nodes in focusPath excluding the focus node itself
  const ancestors = focusPath.slice(0, -1);

  const hasAbove = ancestors.length > 0 || ws.focusId !== null;
  const hasBelow = pathToSelection.length > 0;

  return (
    <div
      style="position:relative; flex-shrink:0;"
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <div
        style={triggerStyle}
        title="Focus scope"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span>{label}</span>
        <span style="font-size:9px; color:#2a2a4a;">▾</span>
      </div>

      {open && (
        <div
          style="position:absolute; top:100%; right:0; min-width:160px; background:#0d0d1e; border:1px solid #252538; z-index:200; display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);"
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          {/* Ancestors (above) */}
          {hasAbove && (
            <>
              {ws.focusId !== null && (
                <div
                  style={itemStyle()}
                  onClick={() => setFocus(null)}
                  onMouseEnter={(e: MouseEvent) =>
                    (e.currentTarget as HTMLElement).style.background = "#1a1a2e"}
                  onMouseLeave={(e: MouseEvent) =>
                    (e.currentTarget as HTMLElement).style.background = ""}
                >
                  (root)
                </div>
              )}
              {ancestors.map((n) => (
                <div
                  key={n.id}
                  style={itemStyle()}
                  onClick={() => setFocus(n.id)}
                  onMouseEnter={(e: MouseEvent) =>
                    (e.currentTarget as HTMLElement).style.background = "#1a1a2e"}
                  onMouseLeave={(e: MouseEvent) =>
                    (e.currentTarget as HTMLElement).style.background = ""}
                >
                  {n.label}
                </div>
              ))}
              <div style={dividerStyle} />
            </>
          )}

          {/* Current focus */}
          <div style={currentItemStyle}>
            <span style="font-size:9px;">▶</span>
            <span>{label}</span>
          </div>

          {/* Path to selection (below) */}
          {hasBelow && (
            <>
              <div style={dividerStyle} />
              {pathToSelection.map((n) => (
                <div
                  key={n.id}
                  style={itemStyle(true)}
                  onClick={() => setFocus(n.id)}
                  onMouseEnter={(e: MouseEvent) =>
                    (e.currentTarget as HTMLElement).style.background = "#1a1a2e"}
                  onMouseLeave={(e: MouseEvent) =>
                    (e.currentTarget as HTMLElement).style.background = ""}
                >
                  {n.label}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
