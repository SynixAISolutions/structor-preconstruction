"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Procurement } from "../../lib/procurement";
import { displayDate, downloadText } from "../../lib/format";
import { safeFileName, scopeExportFileName, scopeExportSheets, scopeWorkbook, tradeScopes } from "../../lib/scope-export";
import { Button, Modal } from "./shared";

type Format = "excel" | "pdf" | "pdf-each";

/**
 * Export in Scopes & bid forms (Marcel's issues log, item 20): asks which trades, which scope and which format, then
 * saves an Excel workbook with a tab per trade (lib/scope-export), one PDF with each trade from a new page, or a PDF
 * per trade in a .zip (lib/scope-pdf), each holding what that trade shows.
 */
export function ScopeExportButton({ state, projectName, notify }: { state: Procurement; projectName: string; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [general, setGeneral] = useState(true);
  const [detailed, setDetailed] = useState(true);
  const [format, setFormat] = useState<Format>("excel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const all = state.packages.map(p => p.id);
  const start = () => { setChosen(all); setError(""); setOpen(true); };
  const trades = (n: number) => `${n} trade${n === 1 ? "" : "s"}`;
  async function save() {
    setBusy(true); setError("");
    try {
      const choice = { packageIds: chosen, general, detailed };
      const today = new Date().toISOString().slice(0, 10), options = { projectName, exportedAt: displayDate(today) };
      if (format === "excel") {
        const sheets = scopeExportSheets(state, choice, projectName);
        const XLSX = await import("xlsx");
        XLSX.writeFile(scopeWorkbook(sheets, XLSX), scopeExportFileName(projectName, today, "xlsx"));
        notify(`Exported ${trades(chosen.length)} to Excel, one tab each.`);
      } else {
        const scopes = tradeScopes(state, choice);
        const { scopePdf, scopePdfsByTrade } = await import("../../lib/scope-pdf");
        if (format === "pdf-each" && scopes.length > 1) {
          const files = await scopePdfsByTrade(scopes, options);
          const { zipSync } = await import("fflate");
          downloadText(scopeExportFileName(projectName, today, "zip"), zipSync(Object.fromEntries(files.map(f => [f.name, f.bytes]))) as Uint8Array<ArrayBuffer>, "application/zip");
          notify(`Exported ${trades(scopes.length)}, a PDF each, in one .zip.`);
        } else {
          const name = scopes.length === 1 ? `${safeFileName(`${projectName} ${scopes[0].code} ${scopes[0].trade} scope ${today}`)}.pdf` : scopeExportFileName(projectName, today, "pdf");
          downloadText(name, await scopePdf(scopes, { ...options, summary: scopes.length > 1 }) as Uint8Array<ArrayBuffer>, "application/pdf");
          notify(`Exported ${trades(scopes.length)} to PDF${scopes.length > 1 ? ", each from a new page" : ""}.`);
        }
      }
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "The scopes couldn't be exported."); }
    setBusy(false);
  }
  const toggle = (id: string, on: boolean) => setChosen(current => on ? [...current, id] : current.filter(x => x !== id));
  const label = format === "excel" ? "Excel" : format === "pdf-each" && chosen.length > 1 ? "PDFs" : "PDF";
  return <>
    <Button onClick={start}><Download size={16}/>Export</Button>
    {open && <Modal title="Export scopes" subtitle="The scope as each trade shows it, for the trades you choose, as Excel or PDF." onClose={() => { if (!busy) setOpen(false); }}>
      <form className="scope-export" onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset><legend>What to include</legend>
          <label><input type="checkbox" checked={general} onChange={e => setGeneral(e.target.checked)}/> General scope: the short lines each trade opens on</label>
          <label><input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)}/> Detailed scope: every bid-form line, with the lines that apply to every trade</label>
        </fieldset>
        <fieldset><legend>Trades · {chosen.length} of {all.length}</legend>
          <div className="scope-export-quick"><button type="button" onClick={() => setChosen(all)}>Select all</button><button type="button" onClick={() => setChosen([])}>Clear</button></div>
          <div className="scope-export-trades">{state.packages.map(pkg => <label key={pkg.id}><input type="checkbox" checked={chosen.includes(pkg.id)} onChange={e => toggle(pkg.id, e.target.checked)}/> <span>{pkg.code} · {pkg.name}</span></label>)}</div>
        </fieldset>
        <fieldset><legend>Format</legend>
          <label><input type="radio" name="scope-export-format" checked={format === "excel"} onChange={() => setFormat("excel")}/> Excel workbook: a Summary tab, then a tab per trade</label>
          <label><input type="radio" name="scope-export-format" checked={format === "pdf"} onChange={() => setFormat("pdf")}/> PDF: one file, each trade from a new page</label>
          <label><input type="radio" name="scope-export-format" checked={format === "pdf-each"} onChange={() => setFormat("pdf-each")}/> PDF per trade: a separate PDF for each trade, ready to send to its subcontractors, in one .zip</label>
        </fieldset>
        {error && <p role="alert" className="scope-export-error">{error}</p>}
        <div className="proc-form-actions"><Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || !chosen.length || (!general && !detailed)}><Download size={15}/>{busy ? "Exporting…" : `Export ${trades(chosen.length)} as ${label}`}</Button></div>
      </form>
    </Modal>}
  </>;
}
