"use client";

import { X, ArrowUpRight, Download, Search, Sparkles } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

// The navigation contract, formatting and CSV export live in lib/ (functionality side).
// They are re-exported here so existing UI imports keep working unchanged.
export type { Screen, ViewProps } from "../../lib/screens";
export { usd, downloadText, exportRows } from "../../lib/format";
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`ui-badge ${tone}`}>{children}</span>; }
export function Button({ children, onClick, variant = "secondary", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; variant?: string; disabled?: boolean; type?: "button" | "submit" | "reset" }) { return <button type={type} className={`ui-btn ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>; }
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) { return <div className="ui-page-header"><div>{eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="ui-header-actions">{actions}</div></div>; }
export function Panel({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`ui-panel ${className}`}>{title && <header className="ui-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}{children}</section>; }
export function Stats({ items }: { items: { label: string; value: ReactNode; detail?: string; tone?: string }[] }) { return <div className="ui-stats">{items.map(item => <div className="ui-stat" key={item.label}><span>{item.label}</span><strong className={item.tone || ""}>{item.value}</strong>{item.detail && <small>{item.detail}</small>}</div>)}</div>; }
export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) { return <div className="ui-tabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={t === value} className={t === value ? "active" : ""} onClick={() => onChange(t)}>{t}</button>)}</div>; }
export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) { return <label className="ui-search"><Search size={16}/><input aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>; }
export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className="ui-empty"><Search size={28}/><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const last = document.activeElement as HTMLElement | null; const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if(e.key === "Tab") { const items = Array.from(document.querySelectorAll<HTMLElement>('.ui-modal button:not(:disabled), .ui-modal input, .ui-modal select, .ui-modal textarea, .ui-modal a[href]')); if(!items.length)return; const first=items[0],end=items[items.length-1]; if(e.shiftKey && document.activeElement===first){e.preventDefault();end.focus();} else if(!e.shiftKey && document.activeElement===end){e.preventDefault();first.focus();} } }; document.addEventListener("keydown", handler); document.querySelector<HTMLElement>('.ui-modal button')?.focus(); return () => { document.removeEventListener("keydown", handler); last?.focus(); }; }, [onClose]);
  // Animated pages change the containing block of fixed overlays.
  return typeof document === "undefined" ? null : createPortal(<div className="ui-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`ui-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="ui-icon-btn" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header><div className="ui-modal-body">{children}</div></section></div>, document.querySelector(".product-app") ?? document.body);
}
export function PreviewNote({ children = "Sample workspace · Generated suggestions are ready for your review." }: { children?: ReactNode }) { return <div className="ui-preview-note"><Sparkles size={15}/>{children}</div>; }
export function Source({ children, onClick }: { children: ReactNode; onClick?: () => void }) { return <button className="ui-source" onClick={onClick}>{children}<ArrowUpRight size={12}/></button>; }
export function ExportButton({ onClick }: { onClick: () => void }) { return <Button onClick={onClick}><Download size={16}/>Export CSV</Button>; }
