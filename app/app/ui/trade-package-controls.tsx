"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addPackage, editPackage, moveScope, removePackage, STANDARD_TRADES, type Procurement, type TradePackage } from "../../lib/procurement";
import { Button, Modal } from "./shared";

type Fields = { id: string; name: string; code: string; owner: string; due: string; splitFrom: string };
const empty: Fields = { id: "", name: "", code: "", owner: "", due: "", splitFrom: "" };

/** Trade edits use the owning screen's procurement instance, so scope reviews cannot drift apart. */
export function TradePackageControls({ state, run, notify }: { state: Procurement; run: (action: (current: Procurement) => Procurement) => string | null; notify: (text: string) => void }) {
  const [open, setOpen] = useState(false), [fields, setFields] = useState<Fields | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [combine, setCombine] = useState<{ from: string; to: string } | null>(null), [removing, setRemoving] = useState<TradePackage | null>(null);
  function edit(pkg?: TradePackage, split = false) { setOpen(true); setError(""); setCombine(null); setRemoving(null); setSelected([]); setFields(pkg ? { id: split ? "" : pkg.id, name: split ? "" : pkg.name, code: pkg.code, owner: pkg.owner, due: pkg.due, splitFrom: split ? pkg.id : "" } : { ...empty }); }
  function save(event: FormEvent) {
    event.preventDefault(); if (!fields) return;
    const message = run(current => {
      if (fields.id) return editPackage(current, fields.id, fields);
      let next = addPackage(current, { name: fields.name, code: fields.code, owner: fields.owner, due: fields.due });
      const added = next.packages.at(-1)!;
      for (const id of selected) next = moveScope(next, id, added.id, "Marcel Khoury");
      return next;
    });
    setError(message ?? "");
    if (!message) { setFields(null); notify(fields.splitFrom ? "Trade created and selected scope items moved. Review the changed bid forms." : fields.id ? "Trade package updated." : "Trade package added."); }
  }
  function combineTrades() {
    if (!combine) return;
    const message = run(current => {
      const source = current.packages.find(p => p.id === combine.from)!;
      // Refuse the whole operation before moving work if the source cannot be removed.
      if (source.published || current.invitations.some(i => i.packageId === source.id)) return removePackage(current, source.id);
      let next = current;
      for (const item of current.scopes.filter(s => s.packageId === source.id)) next = moveScope(next, item.id, combine.to, "Marcel Khoury");
      return removePackage(next, source.id);
    });
    setError(message ?? "");
    if (!message) { setCombine(null); notify("Trade scopes combined. Review the destination bid form before publishing."); }
  }
  return <><Button onClick={() => edit()}><Plus size={15}/>Add trade package</Button><Button onClick={() => { setOpen(true); setFields(null); setCombine(null); setRemoving(null); setError(""); }}>Manage trades</Button>
    {open && <Modal title={fields ? fields.splitFrom ? "Split a trade package" : fields.id ? "Edit trade package" : "Add trade package" : "Manage trade packages"} subtitle="Trade packages determine which scopes each subcontractor prices. Published bid forms retain their issued snapshots." wide onClose={() => setOpen(false)}>
      {fields ? <form onSubmit={save}>
        {!fields.id && !fields.splitFrom && <label className="ui-field">Start from a standard trade<select defaultValue="" onChange={e => { const trade = STANDARD_TRADES.find(t => t.id === e.target.value); if (trade) setFields(f => f && ({ ...f, name: trade.name, code: trade.code })); }}><option value="">Custom trade</option>{STANDARD_TRADES.map(t => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select></label>}
        <div className="ui-form-grid"><label className="ui-field">Trade name<input required value={fields.name} onChange={e => setFields({ ...fields, name: e.target.value })}/></label><label className="ui-field">Main CSI section<input required placeholder="09 29 00" value={fields.code} onChange={e => setFields({ ...fields, code: e.target.value })}/></label><label className="ui-field">Trade owner<input value={fields.owner} onChange={e => setFields({ ...fields, owner: e.target.value })}/></label><label className="ui-field">Bid due date<input type="date" value={fields.due} onChange={e => setFields({ ...fields, due: e.target.value })}/></label></div>
        {fields.splitFrom && <fieldset className="trade-split-items"><legend>Scope items to move into the new trade</legend>{state.scopes.filter(s => s.packageId === fields.splitFrom && !s.allTrades).map(s => <label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(e.target.checked ? [...selected, s.id] : selected.filter(id => id !== s.id))}/>{s.title}</label>)}<small>General requirements remain shared across trades. Published forms require a new issue after changes.</small></fieldset>}
        {error && <p role="alert" className="setup-error">{error}</p>}<div className="proc-form-actions"><Button onClick={() => { setFields(null); setError(""); }}>Back to trades</Button><Button type="submit" variant="primary">{fields.id ? "Save trade" : "Create trade"}</Button></div>
      </form> : <>
        <div className="proc-form-actions"><span>{state.packages.length} trade packages</span><Button onClick={() => edit()}><Plus size={14}/>Add trade package</Button></div>
        <ul className="trade-management-list">{state.packages.map(pkg => <li key={pkg.id}><div><strong>{pkg.name}</strong><small>{pkg.code} · {state.scopes.filter(s => s.packageId === pkg.id).length} scope items · {pkg.owner || "No owner"}</small></div><div><button className="ui-icon-btn" aria-label={`Edit ${pkg.name} trade`} onClick={() => edit(pkg)}><Pencil size={15}/></button><Button onClick={() => edit(pkg, true)}>Split</Button><Button disabled={state.packages.length < 2} onClick={() => { setError(""); setCombine({ from: pkg.id, to: state.packages.find(p => p.id !== pkg.id)!.id }); }}>Combine</Button><button className="ui-icon-btn" aria-label={`Remove ${pkg.name} trade`} onClick={() => { setRemoving(pkg); setError(""); }}><Trash2 size={15}/></button></div></li>)}</ul>
        {combine && <section className="trade-combine"><strong>Combine {state.packages.find(p => p.id === combine.from)?.name}</strong><p>This moves its scope items and removes the source package. Published trades and trades with invited bidders cannot be combined.</p><label className="ui-field">Destination trade<select value={combine.to} onChange={e => setCombine({ ...combine, to: e.target.value })}>{state.packages.filter(p => p.id !== combine.from).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Button variant="primary" onClick={combineTrades}>Move scopes and combine</Button></section>}
        {removing && <section className="trade-combine"><p>Remove <strong>{removing.name}</strong>? Only an empty, unpublished package without invited bidders can be removed.</p><div className="proc-form-actions"><Button onClick={() => setRemoving(null)}>Keep trade</Button><Button onClick={() => { const message = run(current => removePackage(current, removing.id)); setError(message ?? ""); if (!message) { setRemoving(null); notify("Empty trade package removed."); } }}>Remove empty trade</Button></div></section>}
        {error && <p role="alert" className="setup-error">{error}</p>}
      </>}
    </Modal>}
  </>;
}
