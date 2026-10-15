// Scores the AI's reading of one subcontractor proposal against the contractor's own leveling of the
// same proposal (C9, second half). A local tool, not part of `pnpm check`: it reads client documents and
// can call DeepSeek, so nothing it reads or writes belongs in the repository.
//
//   node --experimental-strip-types --no-warnings --env-file=<.env.local with DEEPSEEK_API_KEY> \
//     scripts/score-proposal.mjs --workbook <leveled bid sheet.xlsx> --bidder District --proposal <proposal.pdf> [--out <dir>]
//
//   --sheet <name>     the trade's sheet in the workbook (default GWB, drywall)
//   --reading <file>   score a run this tool wrote instead of calling the AI
//
// The bid-form items sent to the AI are the sheet's coverage rows, so the estimator's column for that
// bidder is the answer key. Writes the run, report.md and lines.csv to --out (default ./accuracy-out).

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

register("./ts-resolver.mjs", import.meta.url);
const W = await import("../lib/workbook.mjs");
const P = await import("../lib/proposal-accuracy.ts");
const J = await import("../lib/ai-jobs.ts");
const D = await import("../lib/deepseek.ts");

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, a, i, all) => a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : pairs, []));
const need = (name) => args[name] && args[name] !== "true" ? args[name] : (console.error(`Missing --${name}`), process.exit(2));
const out = args.out ?? "accuracy-out";
mkdirSync(out, { recursive: true });

async function pdfPages(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push({ page: i, text: c.items.map(it => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join("") });
  }
  await task.destroy();
  return pages;
}

const wb = W.importBidWorkbook(new Uint8Array(readFileSync(need("workbook"))), { sheetName: args.sheet ?? "GWB" });
const wanted = need("bidder").toLowerCase();
const bidder = wb.bidders.find(b => b.name.toLowerCase().includes(wanted));
if (!bidder) { console.error(`No bidder matching "${wanted}". Bidders: ${wb.bidders.map(b => b.name).join(", ")}`); process.exit(2); }
const items = wb.items.filter(i => i.rowKind === "coverage");
const expected = items.map(i => {
  const r = bidder.responses[i.id];
  return { lineId: i.id, text: `${i.number ? `${i.number}. ` : ""}${i.description}`, answer: r?.status || null, note: r?.note ?? "" };
});
console.log(`${bidder.name}: base bid ${bidder.baseBid} · ${items.length} lines · ${expected.filter(e => e.answer).length} leveled`);

let run;
if (args.reading && args.reading !== "true") {
  run = JSON.parse(readFileSync(args.reading, "utf8"));
} else {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) { console.error("DEEPSEEK_API_KEY is not set (use --env-file)."); process.exit(2); }
  const file = need("proposal");
  const pages = (await pdfPages(file)).filter(p => p.text.trim());
  const job = J.parseProposalJob({ form: { items: items.map(i => ({ id: i.id, title: i.description, detail: i.section })) }, document: basename(file), pages });
  const started = Date.now();
  const model = D.textModel();
  // Same prompt, screening and token budget as the app's /api/ai proposal job; a longer wait, as nobody is watching a spinner.
  const parts = [], jobs = J.proposalBatches(job);
  for (const [i, batch] of jobs.entries()) {
    const output = await D.deepseekJson(apiKey, J.proposalMessages(batch), { model, maxTokens: 8000, budgetMs: 55_000 });
    parts.push(J.screenProposal(output, batch));
    console.log(`  ${i + 1}/${jobs.length} proposal batches`);
  }
  const { reading, dropped } = J.mergeProposalReadings(parts);
  run = { model, proposal: basename(file), pages: pages.length, seconds: Math.round((Date.now() - started) / 1000), reading, dropped };
  const runFile = join(out, `proposal-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(runFile, JSON.stringify(run, null, 1));
  console.log(`Run saved: ${runFile}`);
}

const read = run.reading.responses.map(r => ({ lineId: r.scopeItemId, answer: r.answer, note: r.note }));
const report = P.scoreReading(expected, read, { expected: bidder.baseBid ?? null, read: run.reading.baseBid });
const s = report.summary;
const pct = (x) => x === null ? "unassessed" : `${Math.round(x * 100)}%`;
const csv = (rows) => rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
writeFileSync(join(out, "proposal-lines.csv"), csv([["Line", "Bid-form line", "Estimator", "AI", "Outcome", "Estimator note", "AI note"],
  ...report.lines.map(l => [l.lineId, l.text, l.expected, l.read, l.outcome, l.expectedNote, l.readNote])]));
const list = (outcome) => report.lines.filter(l => l.outcome === outcome).map(l => `- ${l.lineId} · ${l.text.slice(0, 140)} — estimator ${l.expected ?? "blank"}, AI ${l.read ?? "blank"}${l.expectedNote ? ` · estimator: ${l.expectedNote}` : ""}${l.readNote ? ` · AI: ${l.readNote}` : ""}`);
writeFileSync(join(out, "proposal-report.md"), [
  `# Proposal reading accuracy — ${bidder.name}`, "",
  `Run: ${JSON.stringify({ model: run.model, proposal: run.proposal, pages: run.pages, seconds: run.seconds, dropped: run.dropped?.length ?? 0 })}`, "",
  `- Base bid: estimator ${report.baseBid.expected ?? "—"} · AI ${report.baseBid.read ?? "—"} · ${report.baseBid.matches === null ? "not compared" : report.baseBid.matches ? "match" : "MISMATCH"}`,
  `- Lines the estimator leveled: ${s.leveled} · AI answered ${pct(s.coverage)} of them`,
  `- Of the lines both answered: ${s.agree} agree (${pct(s.agreement)}), ${s.disagree} disagree, ${s.hiddenExclusions} hidden exclusions (AI Y, estimator N)`,
  `- Estimator blank, AI answered (can't be scored): ${s.unverifiable}`, "",
  "Agreement is with one estimator's leveling, not proof of what the proposal includes: check each disagreement against the proposal before quoting a number.", "",
  ...(s.hiddenExclusions ? ["## Hidden exclusions", "", ...list("hidden-exclusion"), ""] : []),
  ...(s.disagree ? ["## Disagreements", "", ...list("disagree"), ""] : []),
  ...(s.unanswered ? ["## Leveled but not answered by the AI", "", ...list("unanswered"), ""] : []),
  ...(run.dropped?.length ? ["## Dropped by screening", "", ...run.dropped.map(d => `- ${d.what}: ${d.reason}`), ""] : []),
].join("\n"));
console.log(`Agreement ${pct(s.agreement)} on ${s.agree + s.disagree + s.hiddenExclusions} lines, coverage ${pct(s.coverage)} of ${s.leveled}; hidden exclusions ${s.hiddenExclusions}; base bid ${report.baseBid.matches}`);
console.log(`Report: ${join(out, "proposal-report.md")}`);
