/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { IconBtn } from "../components/index.ts";

export const meta = { title: "Tree Panel" };

interface SimpleNode {
  id: string;
  label: string;
  children: SimpleNode[];
}

const SAMPLE_TREE: SimpleNode[] = [
  {
    id: "acme/backend",
    label: "acme/backend",
    children: [
      {
        id: "auth-service",
        label: "auth-service",
        children: [
          { id: "token-validator", label: "token-validator", children: [] },
          { id: "ingress", label: "ingress", children: [] },
        ],
      },
      { id: "frontend", label: "frontend", children: [] },
    ],
  },
];

function TreeNode(
  { node, depth, expanded, onToggle, selected, onSelect }: {
    node: SimpleNode;
    depth: number;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    selected: string | null;
    onSelect: (id: string) => void;
  },
) {
  const [hovered, setHovered] = useState(false);
  const isExpanded = expanded.has(node.id);
  const isSelected = node.id === selected;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        style={[
          "display:flex; align-items:center; user-select:none;",
          `padding:3px 6px 3px ${6 + depth * 16}px; font-size:13px;`,
          isSelected ? "background:#1e2a4a;" : hovered ? "background:#1a1a38;" : "",
        ].join("")}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          style={`font-size:10px; width:12px; display:inline-block; color:#555;${
            hasChildren ? " cursor:pointer;" : ""
          }`}
          onClick={hasChildren ? () => onToggle(node.id) : undefined}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <span
          style={`flex:1; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;${
            isSelected ? " color:#b0c4ff;" : ""
          }`}
          onClick={() => onSelect(node.id)}
        >
          {node.label}
        </span>
        {hovered && (
          <div style="display:flex; gap:1px; flex-shrink:0;">
            <IconBtn label="✎" title="Rename" onClick={() => {}} />
            <IconBtn label="+" title="Add subnode" onClick={() => {}} />
            <IconBtn label="×" title="Delete" onClick={() => {}} />
          </div>
        )}
      </div>
      {hasChildren && isExpanded && node.children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function Default() {
  const [expanded, setExpanded] = useState(new Set<string>(["acme/backend", "auth-service"]));
  const [selected, setSelected] = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style="width:300px; background:#14142a; border:1px solid #2a2a4a; display:flex; flex-direction:column; border-radius:4px; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a;">
        <span>Tree View</span>
        <div style="display:flex; gap:2px;">
          <IconBtn
            label="⊞"
            title="Expand all"
            onClick={() => setExpanded(new Set(["acme/backend", "auth-service", "frontend"]))}
          />
          <IconBtn label="⊟" title="Collapse all" onClick={() => setExpanded(new Set())} />
        </div>
      </div>
      <div style="overflow-y:auto; padding:4px 0;">
        {SAMPLE_TREE.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>
    </div>
  );
}

export function AllExpanded() {
  const allIds = new Set(["acme/backend", "auth-service", "frontend"]);
  const [selected, setSelected] = useState<string | null>("auth-service");

  return (
    <div style="width:300px; background:#14142a; border:1px solid #2a2a4a; border-radius:4px; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:#666; border-bottom:1px solid #2a2a4a;">
        <span>Tree View</span>
      </div>
      <div style="overflow-y:auto; padding:4px 0;">
        {SAMPLE_TREE.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={allIds}
            onToggle={() => {}}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>
    </div>
  );
}
