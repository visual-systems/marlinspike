/// <reference lib="dom" />

import { el } from "./dom.ts";

export const DROPDOWN_WIDTH = 140; // px — keeps persona/workflow dropdowns same width

export interface DropdownItem {
  value: string;
  label: string;
}

/**
 * Render a flat minimalist dropdown.
 *
 * width: pixel width (default DROPDOWN_WIDTH) or "fill" to stretch with flex:1.
 * onEdit: if provided, an "✎ Edit…" row appears at the top of the menu.
 */
export function renderDropdown(
  items: DropdownItem[],
  selectedValue: string | null,
  placeholder: string,
  onSelect: (value: string) => void,
  onEdit?: () => void,
  width: number | "fill" = DROPDOWN_WIDTH,
): HTMLElement {
  const selectedItem = items.find((i) => i.value === selectedValue);
  const displayLabel = selectedItem?.label ?? placeholder;

  const isFill = width === "fill";
  const wrapStyle = isFill
    ? "position:relative; flex:1; min-width:0;"
    : `position:relative; width:${width}px; flex-shrink:0;`;
  const btnWidthStyle = isFill ? "width:100%;" : `width:${width}px;`;

  const wrap = el("div", { style: wrapStyle });

  const btn = el("div", {
    style: [
      btnWidthStyle,
      "height:22px; display:flex; align-items:center; justify-content:space-between;",
      "padding:0 8px; cursor:pointer; user-select:none;",
      "border-bottom:1px solid #252538; font-size:11px; color:#777;",
    ].join(""),
  });
  btn.appendChild(el("span", {
    style: "overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;",
  }, [displayLabel]));
  btn.appendChild(
    el("span", { style: "font-size:9px; color:#3a3a5a; flex-shrink:0;" }, ["\u25be"]),
  );

  const menuWidthStyle = isFill ? "min-width:100%;" : `min-width:${width}px;`;
  const menu = el("div", {
    style: [
      `position:absolute; top:100%; left:0; ${menuWidthStyle}`,
      "background:#0d0d1e; border:1px solid #252538; border-top:none; z-index:200;",
      "display:none; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);",
    ].join(""),
  });

  if (onEdit) {
    const editRow = el("div", {
      style:
        "padding:5px 8px; font-size:11px; color:#3a3a5a; cursor:pointer; border-bottom:1px solid #191930;",
    }, ["\u270e Edit\u2026"]);
    editRow.addEventListener("mouseenter", () => {
      editRow.style.color = "#888";
    });
    editRow.addEventListener("mouseleave", () => {
      editRow.style.color = "#3a3a5a";
    });
    editRow.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      onEdit();
    });
    menu.appendChild(editRow);
  }

  for (const item of items) {
    const isActive = item.value === selectedValue;
    const row = el("div", {
      style: [
        "padding:5px 8px; font-size:11px; cursor:pointer;",
        isActive ? "color:#9090c0;" : "color:#666;",
      ].join(""),
    }, [item.label]);
    row.addEventListener("mouseenter", () => {
      if (!isActive) row.style.color = "#aaa";
    });
    row.addEventListener("mouseleave", () => {
      if (!isActive) row.style.color = "#666";
    });
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      onSelect(item.value);
    });
    menu.appendChild(row);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.style.display === "none";
    menu.style.display = opening ? "flex" : "none";
    if (opening) {
      document.addEventListener("click", () => {
        menu.style.display = "none";
      }, { once: true });
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}
