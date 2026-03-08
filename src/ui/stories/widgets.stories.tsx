/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { IconBtn, PropLabel, SmallBtn } from "../components/index.ts";

export const meta = { title: "Widgets" };

export function IconButtons() {
  return (
    <div style="display:flex; gap:8px; align-items:center; padding:8px; background:#1a1a2e; border-radius:4px;">
      <IconBtn label="✎" title="Rename" onClick={() => alert("rename")} />
      <IconBtn label="+" title="Add subnode" onClick={() => alert("add")} />
      <IconBtn label="⎘" title="Copy URI" onClick={() => alert("copy")} />
      <IconBtn label="×" title="Delete" onClick={() => alert("delete")} />
    </div>
  );
}

export function SmallButtons() {
  return (
    <div style="display:flex; gap:8px; flex-wrap:wrap; padding:8px;">
      <SmallBtn label="+ Subnode" onClick={() => {}} />
      <SmallBtn label="Copy URI" onClick={() => {}} />
      <SmallBtn label="Copy Graph" onClick={() => {}} />
      <SmallBtn label="Delete" onClick={() => {}} />
      <SmallBtn label="Save data" onClick={() => {}} />
    </div>
  );
}

export function Labels() {
  return (
    <div style="display:flex; flex-direction:column; gap:8px; padding:8px;">
      <PropLabel text="Parent" />
      <PropLabel text="Children" />
      <PropLabel text="Edges In" />
      <PropLabel text="Edges Out" />
      <PropLabel text="Data" />
    </div>
  );
}
