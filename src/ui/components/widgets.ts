/// <reference lib="dom" />

import { el } from "./dom.ts";

export function iconBtn(label: string, title: string, onClick: () => void): HTMLElement {
  const btn = el("button", {
    title,
    style:
      "background:none; border:none; color:#555; cursor:pointer; font-size:12px; padding:0 3px; line-height:1;",
  }, [label]);
  btn.addEventListener("click", onClick);
  return btn;
}

export function smallBtn(label: string, onClick: () => void): HTMLElement {
  const btn = el("button", {
    style: [
      "background:none; border:1px solid #2a2a4a; color:#666;",
      "font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px;",
    ].join(""),
  }, [label]);
  btn.addEventListener("click", onClick);
  return btn;
}

export function propLabel(text: string): HTMLElement {
  return el("div", {
    style: "font-size:10px; color:#444; letter-spacing:0.06em; text-transform:uppercase;",
  }, [text]);
}
