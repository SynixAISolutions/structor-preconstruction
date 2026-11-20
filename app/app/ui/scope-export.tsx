"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Procurement } from "../../lib/procurement";
import { scopeExportFileName, scopeExportSheets, scopeWorkbook } from "../../lib/scope-export";
import { Button, Modal } from "./shared";

/**
 * Export in Scopes & bid forms (Marcel's issues log, item 20): asks which trades and which scope, then saves an Excel
 * workbook with a tab per trade holding what that trade shows (lib/scope-export).
 */
export function ScopeExportButton({ state, projectName, notify }: { state: Procurement; projectName: string; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [general, setGeneral] = useState(true);
  const [detailed, setDetailed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const all = state.packages.map(p => p.id);
  const start = () => { setChosen(all); setError(""); setOpen(true); };
  async function save() {
    setBusy(true); setError("");
    try {
      const sheets = scopeExportSheets(state, { packageIds: chosen, general, detailed }, projectName);
      const XLSX = await import("xlsx");
      XLSX.writeFile(scopeWorkbook(sheets, XLSX), scopeExportFileName(projectName));
      notify(`Exported ${chosen.length} trade${chosen.length === 1 ? "" : "s"}, one tab each.`);
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "The scopes couldn't be exported."); }
    setBusy(false);
  }
  const toggle = (id: string, on: boolean) => setChosen(current => on ? [...current, id] : current.filter(x => x !== id));
  return <>
    <Button onClick={start}><Download size={16}/>Export</Button>
    {open && <Modal title="Export scopes" subtitle="An Excel workbook with a tab for each trade you choose, holding the scope as that trade shows it." onClose={() => { if (!busy) setOpen(false); }}>
      <form className="scope-export" onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset><legend>What to include</legend>
          <label><input type="checkbox" checked={general} onChange={e => setGeneral(e.target.checked)}/> General scope: the short lines each trade opens on</label>
          <label><input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)}/> Detailed scope: every bid-form line, with the lines that apply to every trade</label>
        </fieldset>
        <fieldset><legend>Trades · {chosen.length} of {all.length}</legend>
          <div className="scope-export-quick"><button type="button" onClick={() => setChosen(all)}>Select all</button><button type="button" onClick={() => setChosen([])}>Clear</button></div>
          <div className="scope-export-trades">{state.packages.map(pkg => <label key={pkg.id}><input type="checkbox" checked={chosen.includes(pkg.id)} onChange={e => toggle(pkg.id, e.target.checked)}/> <span>{pkg.code} · {pkg.name}</span></label>)}</div>
        </fieldset>
        {error && <p role="alert" className="scope-export-error">{error}</p>}
        <div className="proc-form-actions"><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || !chosen.length || (!general && !detailed)}><Download size={15}/>{busy ? "Exporting…" : `Export ${chosen.length} trade${chosen.length === 1 ? "" : "s"}`}</Button></div>
      </form>
    </Modal>}
  </>;
}
