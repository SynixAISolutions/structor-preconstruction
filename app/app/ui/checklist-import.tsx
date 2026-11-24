"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Upload } from "lucide-react";
import { checklistText, learnMemory } from "../../lib/memory-client";
import { STANDARD_TRADES } from "../../lib/procurement";
import { checklistEntries, readChecklists, type Checklist } from "../../lib/scope-checklist";
import { Badge, Button, Modal } from "./shared";

// Import the contractor's scope checklists into the AI memory (lib/scope-checklist): one Word file per trade, each
// line it carries as the trade's wording and each exclusion as a "doesn't carry" rule, as proposals to approve. Once
// approved, every scan of that trade checks each line against the project's pages and writes it where they call for it
// (lib/memory-check). The server reads each file's text (app/api/checklist-text); only the entries go to the memory.

const BATCH = 200;
type Choice = { on: boolean; standard: string };
const keyOf = (list: Checklist) => `${list.file}#${list.code}#${list.name}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ChecklistImport({ onClose, onDone, notify }: { onClose: () => void; onDone: () => void; notify: (message: string) => void }) {
  const [lists, setLists] = useState<Checklist[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [unread, setUnread] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  async function read(files: File[]) {
    setError(""); setLists(null); setUnread([]); setOpen(null);
    const found: Checklist[] = [], failed: string[] = [];
    setReading({ done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      try {
        const got = readChecklists(await checklistText(file), file.name);
        if (got.length) found.push(...got); else failed.push(`${file.name}: no checklist lines were found.`);
      } catch (e) { failed.push(`${file.name}: ${e instanceof Error ? e.message : "it couldn't be read."}`); }
      setReading({ done: i + 1, total: files.length });
    }
    setReading(null); setUnread(failed);
    if (!found.length) { setError("No scope checklists were found in these files."); return; }
    found.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.name.localeCompare(b.name));
    setLists(found);
    setChoices(Object.fromEntries(found.map(list => [keyOf(list), { on: true, standard: list.standard ?? "" }])));
  }

  const chosen = useMemo(() => (lists ?? []).filter(list => choices[keyOf(list)]?.on), [lists, choices]);
  const entries = useMemo(() => chosen.flatMap(list => checklistEntries(list, choices[keyOf(list)].standard || null)), [chosen, choices]);
  const lines = entries.filter(e => e.kind === "example").length;
  const fillIn = chosen.reduce((n, list) => n + list.lines.filter(l => l.fillIn).length, 0);
  const set = (key: string, change: Partial<Choice>) => setChoices(c => ({ ...c, [key]: { ...c[key], ...change } }));
  // Two checklists with the same code (a draft and a final copy) would both be checked on every scan of the trade.
  const repeated = useMemo(() => {
    const seen = new Map<string, number>();
    for (const list of chosen) seen.set(list.code || list.name, (seen.get(list.code || list.name) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([code]) => code);
  }, [chosen]);

  async function save() {
    setError(""); setProgress({ done: 0, total: entries.length });
    let added = 0;
    try {
      for (let i = 0; i < entries.length; i += BATCH) {
        const r = await learnMemory(entries.slice(i, i + BATCH));
        added += r.added;
        setProgress({ done: Math.min(entries.length, i + BATCH), total: entries.length });
      }
      notify(added ? `${plural(added, "entry", "entries")} imported for review${entries.length - added ? `; ${entries.length - added} were already in the memory` : ""}.` : "Everything in these checklists is already in the memory.");
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "The import stopped."); setProgress(null); }
  }

  const busy = !!progress || !!reading;
  return <Modal title="Import scope checklists" subtitle="Each trade's checklist, the lines it always carries and its exclusions, becomes proposals: approve them, and every scan of the trade checks each line against the project's pages." wide onClose={() => { if (!busy) onClose(); }}>
    <div className="memory-import">
      <label className="memory-import-file"><FileText size={18}/><span>{lists ? `${plural(lists.length, "checklist")} read` : "Choose the trade checklists (.doc or .docx, several at once)"}</span>
        <input type="file" multiple accept=".doc,.docx" disabled={busy} onChange={e => { const files = [...(e.target.files ?? [])]; if (files.length) void read(files); }}/></label>
      {reading && <p className="proc-ai-progress" role="status">Reading file {reading.done} of {reading.total}…</p>}
      {unread.length > 0 && <div className="memory-error" role="alert"><strong>{plural(unread.length, "file")} not read:</strong><ul>{unread.map(line => <li key={line}>{line}</li>)}</ul></div>}
      {lists && <>
        <p className="memory-confirm">Check each checklist's Structor trade: its lines and exclusions apply to that trade's packages on every project. Open a checklist to see the lines as read: a lead-in keeps its sub-items, and the schedule's dates are left out.</p>
        <div className="memory-import-list" role="table" aria-label="Scope checklists">
          <div className="memory-import-row head" role="row"><span/><span>Checklist and file</span><span>Structor trade</span><span>Lines</span><span>Exclusions</span><span/></div>
          {lists.map(list => {
            const key = keyOf(list), shown = open === key;
            const carried = list.lines.filter(l => l.section === "includes"), excluded = list.lines.filter(l => l.section === "excludes");
            const line = (l: Checklist["lines"][number]) => <li key={`${l.section}${l.order}`}>{l.text}{l.fillIn && <> <Badge tone="amber">Fill in</Badge></>}
              {l.items.length > 0 && <ul>{l.items.map(item => <li key={item}>{item}</li>)}</ul>}</li>;
            return <div key={key} className="memory-import-item">
              <div className="memory-import-row" role="row">
                <input type="checkbox" aria-label={`Import ${list.code} ${list.name}`} checked={!!choices[key]?.on} disabled={busy} onChange={e => set(key, { on: e.target.checked })}/>
                <span><strong>{list.code ? `${list.code} · ` : ""}{list.name}</strong><small>{list.file}</small>{!list.standard && <Badge tone="amber">No match</Badge>}</span>
                <select aria-label={`Structor trade for ${list.code} ${list.name}`} value={choices[key]?.standard ?? ""} disabled={busy} onChange={e => set(key, { standard: e.target.value })}>
                  <option value="">Its own trade: {list.name}</option>
                  {STANDARD_TRADES.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                </select>
                <span>{carried.length}</span><span>{excluded.length}</span>
                <button type="button" className="memory-import-toggle" aria-expanded={shown} aria-label={`${shown ? "Hide" : "Show"} the lines of ${list.code} ${list.name}`} onClick={() => setOpen(shown ? null : key)}>{shown ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</button>
              </div>
              {shown && <div className="memory-import-lines">
                <ol>{carried.map(line)}</ol>
                {excluded.length > 0 && <><strong>Exclusions</strong><ol>{excluded.map(line)}</ol></>}
              </div>}
            </div>;
          })}
        </div>
        {repeated.length > 0 && <p className="memory-error" role="alert">More than one checklist is ticked for {repeated.join(", ")}: untick the older copy, or every scan of the trade checks both.</p>}
        <p className="memory-confirm"><strong>{plural(chosen.length, "checklist")}:</strong> {plural(lines, "line")} as the trades' wording and {plural(entries.length - lines, "exclusion")}, as proposals. {fillIn > 0 && `${plural(fillIn, "line has", "lines have")} blanks or a condition to fill in per project; a scan writes them only with the project's values. `}Importing the same checklist again adds nothing new.</p>
      </>}
      {progress && <p className="proc-ai-progress" role="status">Importing {progress.done} of {progress.total}…</p>}
      {error && <p role="alert" className="memory-error">{error}</p>}
      <div className="proc-form-actions"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || !entries.length} onClick={() => void save()}><Upload size={15}/>{progress ? "Importing…" : `Import ${entries.length} for review`}</Button></div>
    </div>
  </Modal>;
}
