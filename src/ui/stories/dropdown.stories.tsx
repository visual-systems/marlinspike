/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useState } from "@hono/hono/jsx/dom";
import { Dropdown } from "../components/index.ts";

export const meta = { title: "Dropdown" };

const PERSONAS = [
  { value: "Architect", label: "Architect" },
  { value: "Developer", label: "Developer" },
  { value: "Reviewer", label: "Reviewer" },
];

export function FixedWidth() {
  const [selected, setSelected] = useState<string | null>("Architect");
  return (
    <div style="padding:16px; background:#12122a; display:inline-block; min-width:200px;">
      <Dropdown
        items={PERSONAS}
        selectedValue={selected}
        placeholder="Select persona"
        onSelect={setSelected}
      />
    </div>
  );
}

export function FillWidth() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style="padding:16px; background:#12122a; width:300px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; color:#555; flex-shrink:0;">+ to sibling…</span>
        <Dropdown
          items={PERSONAS}
          selectedValue={selected}
          placeholder="+ to sibling…"
          onSelect={setSelected}
          width="fill"
        />
      </div>
    </div>
  );
}

export function WithEditRow() {
  const [selected, setSelected] = useState<string | null>("Explore");
  const [items, setItems] = useState(["Explore", "Design", "Build"]);
  return (
    <div style="padding:16px; background:#0f0f22; display:inline-block; min-width:200px;">
      <Dropdown
        items={items.map((i) => ({ value: i, label: i }))}
        selectedValue={selected}
        placeholder="Select workflow"
        onSelect={setSelected}
        onEdit={() => {
          const val = prompt("Edit workflows (comma separated):", items.join(", "));
          if (val) setItems(val.split(",").map((s) => s.trim()).filter(Boolean));
        }}
      />
    </div>
  );
}
