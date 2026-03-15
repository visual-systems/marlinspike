/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  getFocusedRootNodes,
  type Panel,
  removeNodeFromTree,
  type Selection,
  type Tab,
  type TreeNode,
  updateNodeInTree,
  type Updater,
  withNodeMutation,
  withPanel,
  type WorkspaceState,
} from "../workspace.ts";
import { IconBtn } from "./widgets.tsx";
import { Inspector } from "./inspector.tsx";

// ---------------------------------------------------------------------------
// TreePanel
// ---------------------------------------------------------------------------

export function TreePanel(
  { panel, tab, ws, update }: { panel: Panel; tab: Tab; ws: WorkspaceState; update: Updater },
) {
  const [localSplit, setLocalSplit] = useState(panel.inspectorSplit);
  const treeContentRef = useRef<HTMLDivElement | null>(null);
  const inspectorElRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const expanded = new Set(panel.expandedNodes);
  const hasInspector = panel.selected != null;

  let highlightedNodeIds: Set<string> = new Set();
  if (panel.selected?.type === "edge") {
    const sel = panel.selected;
    const selectedEdge = ws.edges.find((e) => e.id === sel.id);
    if (selectedEdge) highlightedNodeIds = new Set([selectedEdge.fromId, selectedEdge.toId]);
  }

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
    const ids = collect(getFocusedRootNodes(ws));
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
    <div style="display:flex; flex-direction:column; width:300px; min-width:200px; flex-shrink:0; border-right:1px solid #2a2a4a; background:#14142a; overflow:hidden; height:100%;">
      {/* Header */}
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>Tree View</span>
        <div style="display:flex; gap:2px; align-items:center;">
          <IconBtn label="⊞" title="Expand all" onClick={expandAll} />
          <IconBtn label="⊟" title="Collapse all" onClick={collapseAll} />
          <IconBtn
            label="⬡"
            title="Mirror on canvas"
            onClick={() => update((s) => ({ ...s, canvasExpandedNodes: [...panel.expandedNodes] }))}
          />
          <IconBtn label="×" title="Close panel" onClick={closePanel} />
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div
          ref={treeContentRef}
          style={`flex:${treeFlex}; overflow-y:auto; padding:4px 0; min-height:0;`}
        >
          {getFocusedRootNodes(ws).map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              expanded={expanded}
              panelId={panel.id}
              tabId={tab.id}
              selected={panel.selected}
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
// TreeNodeRow
// ---------------------------------------------------------------------------

export function TreeNodeRow(
  { node, expanded, panelId, tabId, selected, highlightedNodeIds, depth, ws, update }: {
    node: TreeNode;
    expanded: Set<string>;
    panelId: string;
    tabId: string;
    selected: Selection | null;
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
  const isSelected = selected?.id === node.id;
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
        selected: p.selected?.id === node.id ? null : { type: "node" as const, id: node.id },
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
          panels: t.panels.map((p) => {
            const sel = p.selected;
            // IDs are globally unique — safe to compare without checking type
            if (!sel) return p;
            if (sel.id === node.id) return { ...p, selected: null };
            if (!newEdges.some((e) => e.id === sel.id)) return { ...p, selected: null };
            return p;
          }),
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
          selected={selected}
          highlightedNodeIds={highlightedNodeIds}
          depth={depth + 1}
          ws={ws}
          update={update}
        />
      ))}
    </div>
  );
}
