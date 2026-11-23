"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { bidSheetEntries, readBidSheet, type SheetTrade } from "../../lib/bid-sheet-import";
import { learnMemory } from "../../lib/memory-client";
import { STANDARD_TRADES } from "../../lib/procurement";
import { Badge, Button, Modal } from "./shared";

// Import a bid sheet into the AI memory (lib/bid-sheet-import): every trade tab's sections, exclusions and scope lines,
// as proposals to approve. The workbook is read in this browser; only the entries go to the memory.

const BATCH = 200;
type Choice = { on: boolean; standard: string };

export function BidSheetImport({ onClose, onDone, notify }: { onClose: () => void; onDone: () => void; notify: (message: string) => void }) {
  const [file, setFile] = useState("");
  const [trades, setTrades] = useState<SheetTrade[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  async function read(picked: File) {
    setError(""); setTrades(null); setFile(picked.name);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await picked.arrayBuffer(), { type: "array" });
      const found = readBidSheet(book.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "" }) as unknown[][] })));
      if (!found.length) { setError("No trade tabs with a Section 3 scope were found in this workbook."); return; }
      setTrades(found);
      // Ticked: trades with bidders named or a section list; an untouched template tab isn't.
      setChoices(Object.fromEntries(found.map(t => [t.tab, { on: t.bid || t.key.sections.length > 0, standard: t.standard ?? "" }])));
    } catch (e) { setError(e instanceof Error ? `The workbook couldn't be read (${e.message}).` : "The workbook couldn't be read."); }
  }

  const chosen = useMemo(() => (trades ?? []).filter(t => choices[t.tab]?.on), [trades, choices]);
  const entries = useMemo(() => chosen.flatMap(t => bidSheetEntries(t, file, choices[t.tab].standard || null)), [chosen, choices, file]);
  const count = (kind: string) => entries.filter(e => e.kind === kind).length;
  const set = (tab: string, change: Partial<Choice>) => setChoices(c => ({ ...c, [tab]: { ...c[tab], ...change } }));

  async function save() {
    setError(""); setProgress({ done: 0, total: entries.length });
    let added = 0;
    try {
      for (let i = 0; i < entries.length; i += BATCH) {
        const r = await learnMemory(entries.slice(i, i + BATCH));
        added += r.added;
        setProgress({ done: Math.min(entries.length, i + BATCH), total: entries.length });
      }
      notify(added ? `${added} entr${added === 1 ? "y" : "ies"} imported for review${entries.length - added ? `; ${entries.length - added} were already in the memory` : ""}.` : "Everything in this sheet is already in the memory.");
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "The import stopped."); setProgress(null); }
  }

  const busy = !!progress;
  return <Modal title="Import a bid sheet" subtitle="Each trade tab's sections, exclusions and scope lines become proposals: approve them before scans read them." wide onClose={() => { if (!busy) onClose(); }}>
    <div className="memory-import">
      <label className="memory-import-file"><FileSpreadsheet size={18}/><span>{file || "Choose a live bid sheet (.xlsx)"}</span>
        <input type="file" accept=".xlsx,.xlsm,.xls" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); }}/></label>
      {trades && <>
        <p className="memory-confirm">{trades.length} trade tabs. Ticked: the trades with bidders named or a section list on this sheet; untouched template tabs aren't. Check each tab's Structor trade: its entries apply to that trade's packages on every project.</p>
        <div className="memory-import-list" role="table" aria-label="Trade tabs">
          <div className="memory-import-row head" role="row"><span/><span>Tab and trade on the sheet</span><span>Structor trade</span><span>Sections</span><span>Exclusions</span><span>Lines</span></div>
          {trades.map(t => <div key={t.tab} className="memory-import-row" role="row">
            <input type="checkbox" aria-label={`Import ${t.tab}`} checked={!!choices[t.tab]?.on} disabled={busy} onChange={e => set(t.tab, { on: e.target.checked })}/>
            <span><strong>{t.tab}</strong><small>{t.division} · {t.name}</small>{t.bid ? <Badge tone="green">Bidders</Badge> : <Badge>Template</Badge>}</span>
            <select aria-label={`Structor trade for ${t.tab}`} value={choices[t.tab]?.standard ?? ""} disabled={busy} onChange={e => set(t.tab, { standard: e.target.value })}>
              <option value="">Its own trade: {t.name}</option>
              {STANDARD_TRADES.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
            <span>{t.key.sections.length}</span><span>{t.key.exclusions.length}</span><span>{t.key.inclusions.length}</span>
          </div>)}
        </div>
        <p className="memory-confirm"><strong>{chosen.length} tabs:</strong> {count("assignment")} trade splits, {count("rule")} exclusions and {count("example")} wording examples, as proposals. Importing the same sheet again adds nothing new.</p>
      </>}
      {progress && <p className="proc-ai-progress" role="status">Importing {progress.done} of {progress.total}…</p>}
      {error && <p role="alert" className="memory-error">{error}</p>}
      <div className="proc-form-actions"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || !entries.length} onClick={() => void save()}><Upload size={15}/>{busy ? "Importing…" : `Import ${entries.length} for review`}</Button></div>
    </div>
  </Modal>;
}
