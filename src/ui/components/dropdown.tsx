/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */
import { useEffect, useState } from "@hono/hono/jsx/dom";

export const DROPDOWN_WIDTH = 140; // px

export interface DropdownItem {
  value: string;
  label: string;
}

interface DropdownProps {
  items: DropdownItem[];
  selectedValue: string | null;
  placeholder: string;
  onSelect: (value: string) => void;
  onEdit?: () => void;
  width?: number | "fill";
}

export function Dropdown(
  { items, selectedValue, placeholder, onSelect, onEdit, width = DROPDOWN_WIDTH }: DropdownProps,
) {
  const [open, setOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [open]);

  const selectedItem = items.find((i) => i.value === selectedValue);
  const displayLabel = selectedItem?.label ?? placeholder;

  const isFill = width === "fill";
  const wrapStyle = isFill
    ? "position:relative; flex:1; min-width:0;"
    : `position:relative; width:${width}px; flex-shrink:0;`;
  const btnWidthStyle = isFill ? "width:100%;" : `width:${width}px;`;

  function handleBtnClick(e: MouseEvent) {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }

  function handleSelect(value: string) {
    setOpen(false);
    onSelect(value);
  }

  function handleEdit() {
    setOpen(false);
    onEdit?.();
  }

  return (
    <div style={wrapStyle}>
      <div
        style={[
          btnWidthStyle,
          "height:22px; display:flex; align-items:center; justify-content:space-between;",
          "padding:0 8px; cursor:pointer; user-select:none;",
          "border-bottom:1px solid #252538; font-size:11px; color:#777;",
        ].join("")}
        onClick={handleBtnClick}
      >
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;">
          {displayLabel}
        </span>
        <span style="font-size:9px; color:#3a3a5a; flex-shrink:0;">&#x25be;</span>
      </div>
      {open && (
        <div
          style={[
            `position:absolute; top:100%; left:0; ${
              isFill ? "min-width:100%;" : `min-width:${width}px;`
            }`,
            "background:#0d0d1e; border:1px solid #252538; border-top:none; z-index:200;",
            "display:flex; flex-direction:column; box-shadow:0 4px 12px rgba(0,0,0,0.5);",
          ].join("")}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          {onEdit && (
            <DropdownRow
              label="✎ Edit…"
              color="#3a3a5a"
              hoverColor="#888"
              hasBorder
              onClick={handleEdit}
            />
          )}
          {items.map((item) => (
            <DropdownRow
              key={item.value}
              label={item.label}
              color={item.value === selectedValue ? "#9090c0" : "#666"}
              hoverColor={item.value === selectedValue ? "#9090c0" : "#aaa"}
              onClick={() => handleSelect(item.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DropdownRowProps {
  label: string;
  color: string;
  hoverColor: string;
  hasBorder?: boolean;
  onClick: () => void;
}

function DropdownRow({ label, color, hoverColor, hasBorder, onClick }: DropdownRowProps) {
  const [hovered, setHovered] = useState(false);
  const style = [
    "padding:5px 8px; font-size:11px; cursor:pointer;",
    hasBorder ? "border-bottom:1px solid #191930;" : "",
    `color:${hovered ? hoverColor : color};`,
  ].join("");
  return (
    <div
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
    </div>
  );
}
