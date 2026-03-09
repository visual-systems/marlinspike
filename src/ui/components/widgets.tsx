/// <reference lib="dom" />
/** @jsxImportSource @hono/hono/jsx/dom */

interface IconBtnProps {
  label: string;
  title: string;
  onClick: () => void;
}

export function IconBtn({ label, title, onClick }: IconBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style="background:none; border:none; color:#555; cursor:pointer; font-size:12px; padding:0 3px; line-height:1;"
    >
      {label}
    </button>
  );
}

interface SmallBtnProps {
  label: string;
  title?: string;
  onClick: () => void;
}

export function SmallBtn({ label, title, onClick }: SmallBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style="background:none; border:1px solid #2a2a4a; color:#666; font-size:11px; cursor:pointer; padding:2px 8px; border-radius:3px;"
    >
      {label}
    </button>
  );
}

interface PropLabelProps {
  text: string;
}

export function PropLabel({ text }: PropLabelProps) {
  return (
    <div style="font-size:10px; color:#444; letter-spacing:0.06em; text-transform:uppercase;">
      {text}
    </div>
  );
}
