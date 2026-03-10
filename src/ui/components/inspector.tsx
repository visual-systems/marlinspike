/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useRef, useState } from "@hono/hono/jsx/dom";
import {
  type Edge,
  findNode,
  findParentOf,
  findSiblings,
  getEdgesIn,
  getEdgesOut,
  nodeHash,
  type Panel,
  removeNodeFromTree,
  subgraphJson,
  type Tab,
  type TreeNode,
  updateNodeInTree,
  type Updater,
  withNodeMutation,
  withPanel,
  type WorkspaceState,
} from "../workspace.ts";
import { Dropdown } from "./dropdown.tsx";
import { IconBtn, PropLabel, SmallBtn } from "./widgets.tsx";

// ---------------------------------------------------------------------------
// Inspector (dispatch)
// ---------------------------------------------------------------------------

export function Inspector(
  { panel, tab, ws, update }: { panel: Panel; tab: Tab; ws: WorkspaceState; update: Updater },
) {
  if (panel.selectedEdgeId) {
    const edge = ws.edges.find((e) => e.id === panel.selectedEdgeId);
    if (edge) {
      return (
        <EdgeInspector key={edge.id} edge={edge} panel={panel} tab={tab} ws={ws} update={update} />
      );
    }
  }
  if (panel.selectedNodeId) {
    const node = findNode(ws.treeNodes, panel.selectedNodeId);
    if (node) return <NodeInspector node={node} panel={panel} tab={tab} ws={ws} update={update} />;
  }
  return <div />;
}

// ---------------------------------------------------------------------------
// Shared inspector shell
// ---------------------------------------------------------------------------

export function InspectorShell(
  { title, onClose, children }: { title: string; onClose: () => void; children?: unknown },
) {
  return (
    <div style="display:flex; flex-direction:column; overflow:hidden; background:#10102a; height:100%;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a; flex-shrink:0;">
        <span>{title}</span>
        <IconBtn label="×" title="Close" onClick={onClose} />
      </div>
      <div style="flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:10px;">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CopyField — compact monospace value; hover shows label tooltip, click copies
// ---------------------------------------------------------------------------

function CopyField({ title, value }: { title: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div
      title={copied ? "Copied!" : title}
      style="font-size:11px; color:#333355; font-family:monospace; word-break:break-all; cursor:pointer; padding:1px 0;"
      onClick={copy}
    >
      {value}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node inspector
// ---------------------------------------------------------------------------

export function NodeInspector(
  { node, panel, tab, ws, update, extraActions }: {
    node: TreeNode;
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
    extraActions?: unknown;
  },
) {
  const [editingLabel, setEditingLabel] = useState(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const dataTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [editingLabel]);

  function closeInspector() {
    update((s) =>
      withPanel(s, tab.id, panel.id, (p) => ({ ...p, selectedNodeId: null, selectedEdgeId: null }))
    );
  }

  function finishLabelEdit() {
    const val = labelInputRef.current?.value.trim() ?? "";
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
    setEditingLabel(false);
  }

  function addSubnode() {
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
        t.id === tab.id
          ? {
            ...t,
            panels: t.panels.map((p) =>
              p.id === panel.id && !p.expandedNodes.includes(node.id)
                ? { ...p, expandedNodes: [...p.expandedNodes, node.id] }
                : p
            ),
          }
          : t
      ),
    }));
  }

  function saveData() {
    try {
      const data = JSON.parse(dataTextareaRef.current?.value ?? "{}") as Record<string, unknown>;
      update((s) =>
        withNodeMutation(
          s,
          (nodes) =>
            updateNodeInTree(nodes, node.id, (n) => ({ ...n, data, version: n.version + 1 })),
        )
      );
    } catch {
      alert("Invalid JSON — changes not saved.");
    }
  }

  function navigateToNode(nodeId: string) {
    update((s) =>
      withPanel(
        s,
        tab.id,
        panel.id,
        (p) => ({ ...p, selectedNodeId: nodeId, selectedEdgeId: null }),
      )
    );
  }

  function deleteNode() {
    update((s) => {
      const newNodes = removeNodeFromTree(s.treeNodes, node.id);
      const newEdges = s.edges.filter((e) => e.fromId !== node.id && e.toId !== node.id);
      return {
        ...s,
        treeNodes: newNodes,
        edges: newEdges,
        tabs: s.tabs.map((t) => ({
          ...t,
          panels: t.panels.map((p) => ({
            ...p,
            selectedNodeId: p.selectedNodeId === node.id ? null : p.selectedNodeId,
            selectedEdgeId: p.selectedEdgeId && !newEdges.some((e) => e.id === p.selectedEdgeId)
              ? null
              : p.selectedEdgeId,
          })),
        })),
      };
    });
  }

  function selectEdge(edgeId: string) {
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, selectedEdgeId: edgeId })));
  }

  function addEdge(fromId: string, toId: string) {
    update((s) => ({
      ...s,
      edges: [...s.edges, {
        id: crypto.randomUUID(),
        fromId,
        toId,
        label: "",
        data: {},
        version: 1,
      }],
    }));
  }

  function deleteEdge(edgeId: string) {
    update((s) => ({
      ...s,
      edges: s.edges.filter((e) => e.id !== edgeId),
      tabs: s.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) => ({
          ...p,
          selectedEdgeId: p.selectedEdgeId === edgeId ? null : p.selectedEdgeId,
        })),
      })),
    }));
  }

  const parent = findParentOf(ws.treeNodes, node.id);

  return (
    <InspectorShell title="Inspector" onClose={closeInspector}>
      {/* Editable label */}
      {editingLabel
        ? (
          <input
            ref={labelInputRef}
            style="background:#0f0f22; border:1px solid #4a4a7a; color:#e0e0e0; font-size:14px; font-weight:600; padding:0 4px; border-radius:2px; width:100%;"
            onBlur={finishLabelEdit}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") finishLabelEdit();
              if (e.key === "Escape") setEditingLabel(false);
            }}
          />
        )
        : (
          <div
            style="font-size:14px; font-weight:600; color:#c0c0e0; cursor:text; word-break:break-all;"
            title="Click to rename"
            onClick={() => setEditingLabel(true)}
          >
            {node.label}
          </div>
        )}

      {/* Actions */}
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        <SmallBtn label="+ Subnode" onClick={addSubnode} />
        <SmallBtn
          label="Export"
          title="copy graph as json"
          onClick={() => navigator.clipboard.writeText(subgraphJson(node, ws.edges))}
        />
        <SmallBtn label="Delete" onClick={deleteNode} />
        {extraActions}
      </div>

      {/* Identity: version/hash/id/uri — compact, no labels, hover to identify */}
      <div style="display:flex; flex-direction:column; gap:1px;">
        <CopyField
          title={`v${node.version} • hash (click to copy)`}
          value={`v${node.version} • ${nodeHash(node)}`}
        />
        <CopyField title="ID (click to copy)" value={node.id} />
        {node.uri && <CopyField title="URI (click to copy)" value={node.uri} />}
      </div>

      {/* Parent */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="Parent" />
        {parent
          ? (
            <div
              style="font-size:12px; color:#7090d0; cursor:pointer; word-break:break-all;"
              title="Select parent"
              onClick={() => navigateToNode(parent.id)}
            >
              {parent.label}
            </div>
          )
          : <div style="font-size:12px; color:#333; font-style:italic;">(root)</div>}
      </div>

      {/* Children */}
      {node.kind === "composite" && node.children.length > 0 && (
        <div style="display:flex; flex-direction:column; gap:3px;">
          <PropLabel text="Children" />
          {node.children.map((child) => (
            <div
              key={child.id}
              style="font-size:12px; color:#7090d0; cursor:pointer; word-break:break-all;"
              title="Select child"
              onClick={() => navigateToNode(child.id)}
            >
              {child.label}
            </div>
          ))}
        </div>
      )}

      {/* Edges In */}
      <EdgesSection
        node={node}
        dir="in"
        ws={ws}
        panel={panel}
        onSelectEdge={selectEdge}
        onAddEdge={addEdge}
        onDeleteEdge={deleteEdge}
      />

      {/* Edges Out */}
      <EdgesSection
        node={node}
        dir="out"
        ws={ws}
        panel={panel}
        onSelectEdge={selectEdge}
        onAddEdge={addEdge}
        onDeleteEdge={deleteEdge}
      />

      {/* Data */}
      <div style="display:flex; flex-direction:column; gap:4px;">
        <PropLabel text="Data" />
        <textarea
          ref={dataTextareaRef}
          style="background:#0d0d20; border:1px solid #2a2a4a; color:#9090b0; font-size:11px; font-family:monospace; padding:5px; border-radius:3px; resize:vertical; min-height:60px; width:100%;"
        >
          {JSON.stringify(node.data, null, 2)}
        </textarea>
        <SmallBtn label="Save data" onClick={saveData} />
      </div>
    </InspectorShell>
  );
}

// ---------------------------------------------------------------------------
// Edges section
// ---------------------------------------------------------------------------

export function EdgesSection(
  { node, dir, ws, panel, onSelectEdge, onAddEdge, onDeleteEdge }: {
    node: TreeNode;
    dir: "in" | "out";
    ws: WorkspaceState;
    panel: Panel;
    onSelectEdge: (id: string) => void;
    onAddEdge: (fromId: string, toId: string) => void;
    onDeleteEdge: (id: string) => void;
  },
) {
  const edges = dir === "in" ? getEdgesIn(ws.edges, node.id) : getEdgesOut(ws.edges, node.id);
  const siblings = findSiblings(ws.treeNodes, node.id);

  return (
    <div style="display:flex; flex-direction:column; gap:4px;">
      <PropLabel text={dir === "in" ? "Edges In" : "Edges Out"} />

      {edges.length === 0 && siblings.length === 0
        ? <div style="font-size:11px; color:#333; font-style:italic;">no siblings</div>
        : null}

      {edges.map((edge) => {
        const peerId = dir === "in" ? edge.fromId : edge.toId;
        const peer = findNode(ws.treeNodes, peerId);
        const peerLabel = peer?.label ?? peerId;
        return (
          <EdgeRow
            key={edge.id}
            edge={edge}
            peerLabel={peerLabel}
            dir={dir}
            isSelected={panel.selectedEdgeId === edge.id}
            onSelect={() => onSelectEdge(edge.id)}
            onDelete={() => onDeleteEdge(edge.id)}
          />
        );
      })}

      {siblings.length > 0 && (
        <Dropdown
          items={siblings.map((s) => ({ value: s.id, label: s.label }))}
          selectedValue={null}
          placeholder={dir === "in" ? "+ from sibling…" : "+ to sibling…"}
          onSelect={(id) => {
            const [from, to] = dir === "in" ? [id, node.id] : [node.id, id];
            onAddEdge(from, to);
          }}
          width="fill"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge row
// ---------------------------------------------------------------------------

export function EdgeRow(
  { edge, peerLabel, dir, isSelected: _isSelected, onSelect, onDelete }: {
    edge: Edge;
    peerLabel: string;
    dir: "in" | "out";
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
  },
) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={`display:flex; align-items:center; gap:6px; padding:4px 6px; background:${
        hovered ? "#181830" : "#13132a"
      }; border-radius:3px; cursor:pointer; font-size:12px;`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <span style="color:#555; font-size:10px; flex-shrink:0;">{dir === "in" ? "←" : "→"}</span>
      <span style="flex:1; color:#7070a0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        {edge.label ? `${edge.label} · ${peerLabel}` : peerLabel}
      </span>
      <IconBtn
        label="×"
        title="Delete edge"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onDelete();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge inspector
// ---------------------------------------------------------------------------

export function EdgeInspector(
  { edge, panel, tab, ws, update }: {
    edge: Edge;
    panel: Panel;
    tab: Tab;
    ws: WorkspaceState;
    update: Updater;
  },
) {
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const dataTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (labelInputRef.current) labelInputRef.current.value = edge.label;
    if (dataTextareaRef.current) dataTextareaRef.current.value = JSON.stringify(edge.data, null, 2);
  }, []);

  const fromNode = findNode(ws.treeNodes, edge.fromId);
  const toNode = findNode(ws.treeNodes, edge.toId);

  function closeEdgeView() {
    update((s) => withPanel(s, tab.id, panel.id, (p) => ({ ...p, selectedEdgeId: null })));
  }

  function navigateToNode(nodeId: string) {
    update((s) =>
      withPanel(
        s,
        tab.id,
        panel.id,
        (p) => ({ ...p, selectedNodeId: nodeId, selectedEdgeId: null }),
      )
    );
  }

  function deleteEdge() {
    update((s) => ({
      ...s,
      edges: s.edges.filter((e) => e.id !== edge.id),
      tabs: s.tabs.map((t) => ({
        ...t,
        panels: t.panels.map((p) => ({
          ...p,
          selectedEdgeId: p.selectedEdgeId === edge.id ? null : p.selectedEdgeId,
        })),
      })),
    }));
  }

  function saveEdge() {
    try {
      const data = JSON.parse(dataTextareaRef.current?.value ?? "{}") as Record<string, unknown>;
      const label = labelInputRef.current?.value ?? "";
      update((s) => ({
        ...s,
        edges: s.edges.map((e) =>
          e.id === edge.id ? { ...e, label, data, version: e.version + 1 } : e
        ),
      }));
    } catch {
      alert("Invalid JSON — changes not saved.");
    }
  }

  return (
    <InspectorShell title="Edge" onClose={closeEdgeView}>
      {/* From → To nav */}
      <div style="display:flex; align-items:center; gap:6px; font-size:13px; flex-wrap:wrap;">
        <span
          style="color:#7090d0; cursor:pointer; word-break:break-all;"
          title="Inspect node"
          onClick={() => navigateToNode(edge.fromId)}
        >
          {fromNode?.label ?? edge.fromId}
        </span>
        <span style="color:#444;">→</span>
        <span
          style="color:#7090d0; cursor:pointer; word-break:break-all;"
          title="Inspect node"
          onClick={() => navigateToNode(edge.toId)}
        >
          {toNode?.label ?? edge.toId}
        </span>
      </div>

      {/* ID */}
      <CopyField title="Edge ID (click to copy)" value={edge.id} />

      {/* Actions */}
      <div style="display:flex; gap:4px; flex-wrap:wrap;">
        <SmallBtn label="Delete" onClick={deleteEdge} />
      </div>

      {/* Version */}
      <div style="font-size:11px; color:#333; font-family:monospace;">v{edge.version}</div>

      {/* Label */}
      <div style="display:flex; flex-direction:column; gap:3px;">
        <PropLabel text="Label" />
        <input
          ref={labelInputRef}
          style="background:#0a0a18; border:1px solid #2a2a4a; color:#c0c0e0; font-size:12px; padding:3px 6px; border-radius:3px; width:100%;"
        />
      </div>

      {/* Data */}
      <div style="display:flex; flex-direction:column; gap:4px;">
        <PropLabel text="Data" />
        <textarea
          ref={dataTextareaRef}
          style="background:#0d0d20; border:1px solid #2a2a4a; color:#9090b0; font-size:11px; font-family:monospace; padding:5px; border-radius:3px; resize:vertical; min-height:60px; width:100%;"
        />
      </div>

      <SmallBtn label="Save" onClick={saveEdge} />
    </InspectorShell>
  );
}
