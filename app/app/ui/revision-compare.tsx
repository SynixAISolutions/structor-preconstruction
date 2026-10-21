"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, GitBranchPlus, Layers, Sparkles } from "lucide-react";
import { Badge, Button, Empty, ExportButton, PageHeader, Panel, Tabs, exportRows, type ViewProps } from "./shared";
import { StoredPage } from "./project-file-viewer";
import { useLocalDraft } from "../../lib/use-local-draft";
import { latestDocuments, revisionLabel, revisionsOf, sheetKey, type StoredDocument } from "../../lib/project-files";
import { renderStoredPage } from "../../lib/project-files-client";
import { changeBoxes, overlayPixels, type ChangeBox } from "../../lib/revision-overlay";
import { aiJob } from "../../lib/ai-more-client";
import type { RevisionChange } from "../../lib/ai-jobs-more";
import { useSubmissions } from "../../lib/use-submissions";
import { RevisionRipple } from "./revision-ripple";

type SavedChange = RevisionChange & { id: string; key: string; reviewed: boolean };
/** A JPEG of one box of an image, grown by a margin so the AI sees the surroundings. */
async function cropBox(src: string, box: ChangeBox, maxSide = 1400): Promise<string> {
  const img = await loadImage(src);
  const grow = Math.max(0.04, Math.max(box.width, box.height) * 0.35);
  const x = Math.max(0, box.x - grow), y = Math.max(0, box.y - grow), w = Math.min(1 - x, box.width + grow * 2), h = Math.min(1 - y, box.height + grow * 2);
  const [sx, sy, sw, sh] = [x * img.naturalWidth, y * img.naturalHeight, w * img.naturalWidth, h * img.naturalHeight];
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });

/** Overlays two renders of a sheet: red was removed, blue was added, grey is unchanged. */
function Overlay({ before, after, onBoxes }: { before: { doc: StoredDocument; page: number }; after: { doc: StoredDocument; page: number }; onBoxes: (boxes: ChangeBox[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{ status: string; counts?: { removed: number; added: number } }>({ status: "Rendering both revisions…" });
  useEffect(() => {
    let live = true;
    setState({ status: "Rendering both revisions…" });
    (async () => {
      const [a, b] = await Promise.all([renderStoredPage(before.doc, before.page, 2400), renderStoredPage(after.doc, after.page, 2400)]);
      const [ia, ib] = await Promise.all([loadImage(a.image), loadImage(b.image)]);
      if (!live || !canvas.current) return;
      const width = ib.naturalWidth, height = ib.naturalHeight;
      const draw = (img: HTMLImageElement) => { const c = document.createElement("canvas"); c.width = width; c.height = height; const x = c.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, width, height); x.drawImage(img, 0, 0, width, height); return x.getImageData(0, 0, width, height); };
      const da = draw(ia), db = draw(ib);
      const out = new ImageData(width, height);
      const counts = overlayPixels(da.data, db.data, out.data);
      canvas.current.width = width; canvas.current.height = height;
      const context = canvas.current.getContext("2d")!;
      context.putImageData(out, 0, 0);
      const boxes = changeBoxes(out.data, width, height).slice(0, 8);
      context.strokeStyle = "#f05a22"; context.lineWidth = Math.max(3, width / 500); context.font = `bold ${Math.round(width / 70)}px sans-serif`; context.fillStyle = "#f05a22";
      boxes.forEach((b, i) => { const pad = width * 0.01; context.strokeRect(b.x * width - pad, b.y * height - pad, b.width * width + pad * 2, b.height * height + pad * 2); context.fillText(String(i + 1), b.x * width - pad, b.y * height - pad * 1.6); });
      onBoxes(boxes);
      setState({ status: "", counts });
    })().catch(error => { if (live) setState({ status: error instanceof Error ? error.message : "The overlay could not be drawn." }); });
    return () => { live = false; };
  }, [before.doc.id, before.page, after.doc.id, after.page]);
  return <div className="rev-overlay">
    <div className="rev-legend"><span><i className="removed"/>Removed in {revisionLabel(after.doc)}</span><span><i className="added"/>Added in {revisionLabel(after.doc)}</span><span><i className="both"/>Unchanged</span>{state.counts && <small>{state.counts.removed + state.counts.added === 0 ? "No visible differences" : "Numbered boxes mark where the sheet changed"}</small>}</div>
    {state.status && <p className="stored-page-status" role="status">{state.status}</p>}
    <div className="stored-viewer-frame"><canvas ref={canvas} className="stored-page-image" style={{ display: state.status ? "none" : "block" }}/></div>
  </div>;
}

/**
 * Revision comparison on the real uploaded revisions (Marcel, 15 Oct): choose a drawing set that has
 * a newer revision in Project files, then a sheet. The overlay shows what changed; the AI lists the
 * changes an estimator must price, for review.
 */
export function RevisionCompare({ projectName, notify, navigate, documents }: ViewProps & { documents: StoredDocument[] }) {
  const sets = latestDocuments(documents).filter(d => d.kind === "drawings");
  const comparable = sets.filter(d => revisionsOf(documents, d.series).length > 1);
  const [series, setSeries] = useState(comparable[0]?.series ?? "");
  const revisions = revisionsOf(documents, series);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const after = revisions.find(r => r.id === toId) ?? revisions.at(-1);
  const before = revisions.find(r => r.id === fromId) ?? revisions.at(-2);
  const sheets = useMemo(() => after ? after.sheets.filter(s => s.sheet) : [], [after]);
  const [sheet, setSheet] = useState("");
  const current = sheets.find(s => s.sheet === sheet) ?? sheets[0];
  const previous = before && current ? before.sheets.find(s => sheetKey(s.sheet) === sheetKey(current.sheet)) : undefined;
  const [mode, setMode] = useState("Overlay");
  const [changes, setChanges] = useLocalDraft<SavedChange[]>("revision-changes", []);
  const { procurement, runProcurement, submissions } = useSubmissions();
  const [busy, setBusy] = useState(false);
  const [boxes, setBoxes] = useState<ChangeBox[]>([]);
  const key = before && after && current ? `${before.id}>${after.id}:${current.sheet}` : "";
  const listed = changes.filter(c => c.key === key);
  const comparedSheets = before && after ? sheets.map(s => ({
    sheet: s.sheet,
    revision: revisionLabel(after),
    changes: changes.filter(c => c.reviewed && c.key === `${before.id}>${after.id}:${s.sheet}`),
  })) : [];

  async function describe() {
    if (!before || !after || !current || !previous) return;
    setBusy(true);
    try {
      if (!boxes.length) { notify(`No visible differences on ${current.sheet}.`); return; }
      // Zoom into each changed spot: a whole 24x36 sheet is too small for the AI to read the change.
      const [a, b] = await Promise.all([renderStoredPage(before, previous.page, 3600), renderStoredPage(after, current.page, 3600)]);
      const spots = boxes.slice(0, 4);
      const results = await Promise.all(spots.map(async (box, i) => {
        const [x, y] = [Math.round((box.x + box.width / 2) * 100), Math.round((box.y + box.height / 2) * 100)];
        const reply = await aiJob<{ changes: RevisionChange[] }>("revision-diff", { sheet: `${current.sheet} (area ${i + 1}, about ${x}% across and ${y}% down the sheet)`, before: await cropBox(a.image, box), after: await cropBox(b.image, box) });
        return reply.changes.map(c => ({ ...c, title: `Area ${i + 1}: ${c.title}` }));
      }));
      const found = results.flat();
      setChanges(prev => [...prev.filter(c => c.key !== key), ...found.map((c, i) => ({ ...c, id: `${key}#${i + 1}`, key, reviewed: false }))]);
      notify(found.length ? `${found.length} change${found.length === 1 ? "" : "s"} listed for review on ${current.sheet}.` : `No changes found on ${current.sheet}.`);
    } catch (error) { notify(error instanceof Error ? error.message : "The AI could not compare these revisions."); }
    finally { setBusy(false); }
  }

  if (!comparable.length) return <div className="intel-view">
    <PageHeader eyebrow={`${projectName} / Document control`} title="Revision comparison" description="Overlay two issues of a drawing to see what changed, then let the AI list the changes for review." actions={<Button onClick={() => navigate("documents")}><Layers size={16}/>Project files</Button>}/>
    <Panel><Empty title="No drawing revisions to compare yet" description={sets.length ? `When a newer issue arrives, open Project files and choose Upload revision on ${sets.map(s => s.name).join(" or ")}. Its sheets are matched by number and compared here.` : "Upload the drawing set in Project files first; when a newer issue arrives, upload it as a revision."} action={<Button variant="primary" onClick={() => navigate("documents")}><GitBranchPlus size={15}/>Upload a revision</Button>}/></Panel>
  </div>;

  return <div className="intel-view revision-compare-view">
    <PageHeader eyebrow={`${projectName} / Document control`} title="Revision comparison" description="Overlay two issues of a drawing to see what changed, then let the AI list the changes for review." actions={<ExportButton onClick={() => exportRows("revision-changes.csv", [["Sheet comparison", "Change", "Kind", "Trade", "Detail", "Reviewed"], ...changes.map(c => [c.key, c.title, c.kind, c.trade, c.detail, c.reviewed ? "Yes" : "No"])])}/>}/>
    <Panel className="intel-comparison-settings"><div className="rev-selects">
      <label className="ui-field">DRAWING SET<select value={series} onChange={e => { setSeries(e.target.value); setFromId(""); setToId(""); setSheet(""); }}>{comparable.map(d => <option key={d.series} value={d.series}>{d.name}</option>)}</select></label>
      <label className="ui-field">PREVIOUS<select value={before?.id ?? ""} onChange={e => setFromId(e.target.value)}>{revisions.slice(0, -1).map(r => <option key={r.id} value={r.id}>{revisionLabel(r)} · {r.uploadedAt.slice(0, 10)}</option>)}</select></label>
      <label className="ui-field">LATEST<select value={after?.id ?? ""} onChange={e => setToId(e.target.value)}>{revisions.slice(1).map(r => <option key={r.id} value={r.id}>{revisionLabel(r)} · {r.uploadedAt.slice(0, 10)}</option>)}</select></label>
      <label className="ui-field">SHEET<select value={current?.sheet ?? ""} onChange={e => setSheet(e.target.value)}>{sheets.map(s => <option key={`${s.page}-${s.sheet}`} value={s.sheet}>{s.sheet}{s.title ? ` · ${s.title}` : ""}</option>)}</select></label>
    </div></Panel>
    {!current ? <Panel><Empty title="No named sheets in this revision" description="Sheet numbers are read from the title blocks when the revision is uploaded."/></Panel> : !previous ? <Panel><Empty title={`${current.sheet} is new in ${revisionLabel(after!)}`} description="The previous revision has no sheet with this number, so the whole sheet is new."/></Panel> : <>
      <div className="intel-compare-toolbar"><Tabs tabs={["Overlay", "Side by side"]} value={mode} onChange={setMode}/><Button variant="primary" disabled={busy} onClick={() => void describe()}><Sparkles size={15}/>{busy ? "Comparing…" : listed.length ? "Describe changes again" : "Describe changes with AI"}</Button></div>
      {mode === "Overlay" ? <Panel title={`${current.sheet} · ${revisionLabel(before!)} → ${revisionLabel(after!)}`}><Overlay before={{ doc: before!, page: previous.page }} after={{ doc: after!, page: current.page }} onBoxes={setBoxes}/></Panel> : <div className="intel-revision-drawings"><Panel title="Previous" subtitle={`${revisionLabel(before!)} · ${previous.date || before!.uploadedAt.slice(0, 10)}`}><StoredPage doc={before!} page={previous.page}/></Panel><Panel title="Latest" subtitle={`${revisionLabel(after!)} · ${current.date || after!.uploadedAt.slice(0, 10)}`}><StoredPage doc={after!} page={current.page}/></Panel></div>}
      <Panel title="Changes" subtitle={listed.length ? `${listed.filter(c => !c.reviewed).length} awaiting review` : "Ask the AI to list the changes, then review each"}>
        {listed.length ? <div className="intel-change-list">{listed.map((c, i) => <div key={c.id} className="intel-change-row"><span className="intel-change-index">{String(i + 1).padStart(2, "0")}</span><span><strong>{c.title}</strong><small>{c.trade || "Trade not named"} · {c.detail}</small></span><Badge tone={c.reviewed ? "green" : c.kind === "Added" ? "orange" : c.kind === "Removed" ? "red" : "blue"}>{c.reviewed ? "Reviewed" : c.kind}</Badge><Button onClick={() => setChanges(prev => prev.map(x => x.id === c.id ? { ...x, reviewed: !x.reviewed } : x))}><Check size={14}/>{c.reviewed ? "Reopen" : "Mark reviewed"}</Button></div>)}</div> : <p className="intel-muted">No changes listed yet for this sheet.</p>}
      </Panel>
    </>}
    <RevisionRipple key={`${before?.id}>${after?.id}`} sheets={comparedSheets} procurement={procurement} submissions={submissions} run={runProcurement} notify={notify} navigate={navigate}/>
  </div>;
}
