// Scores the AI's scope reading for a trade against the contractor's own bid form (C9). A local tool,
// not part of `pnpm check`: it reads client documents and can call DeepSeek, so nothing it reads or
// writes belongs in the repository.
//
//   node --experimental-strip-types --no-warnings --env-file=<.env.local with DEEPSEEK_API_KEY> \
//     scripts/score-drywall.mjs --bid-form <bid form.pdf> --manual <project manual.pdf> [--out <dir>]
//
//   --findings <file.json>  score findings already made (an exported "extraction" draft, a run file
//                           this tool wrote, or an array of findings) instead of calling the AI
//   --concurrency <n>       requests at once when calling the AI (default 3)
//   --package <id>          the trade package id written on the findings (default drywall)
//
// It reads every section the bid form lists, a few pages per request through the same prompt and
// screening as the app, keeps the run, and writes report.md, lines.csv and extras.csv to --out
// (default: ./accuracy-out, which is git-ignored only if you put it outside the repository).

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

register("./ts-resolver.mjs", import.meta.url);
const K = await import("../lib/bid-form-key.ts");
const A = await import("../lib/scope-accuracy.ts");
const M = await import("../lib/manual-sections.ts");
const J = await import("../lib/ai-jobs.ts");
const D = await import("../lib/deepseek.ts");
const { chunkPages } = await import("../lib/ai-client.ts");

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

const key = K.parseBidForm((await pdfPages(need("bid-form"))).map(p => p.text).join("\n"));
console.log(`Bid form: ${key.trade} · ${key.sections.length} sections · ${K.scopeLines(key).length} scope lines · ${K.exclusionLines(key).length} exclusions`);

let findings, readSections, runInfo = {};
if (args.findings && args.findings !== "true") {
  const raw = JSON.parse(readFileSync(args.findings, "utf8"));
  const drafts = Array.isArray(raw) ? raw : raw.findings ?? raw.drafts ?? [];
  findings = drafts.filter(d => (d.kind ?? "scope") === "scope").map((d, i) => ({ id: d.id ?? d.key ?? `f${i + 1}`, title: d.title, detail: d.detail ?? "", source: d.source ?? "", status: d.status }));
  readSections = raw.readSections;
  runInfo = { from: basename(args.findings), status: raw.run?.status, failures: raw.run?.notes?.failures ?? raw.failures ?? [], screening: raw.run?.notes?.screening ?? raw.dropped ?? [] };
} else {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) { console.error("DEEPSEEK_API_KEY is not set (use --env-file)."); process.exit(2); }
  const manualFile = need("manual");
  const manual = await pdfPages(manualFile);
  const sections = M.sectionsFromBidForm(M.manualSections(manual), (await pdfPages(args["bid-form"])).map(p => p.text).join("\n")).sections;
  readSections = sections.map(s => s.section);
  const missing = key.sections.filter(k => !readSections.includes(k.number)).map(k => k.number);
  const pkg = { id: args.package ?? "drywall", name: key.trade.replace(/^\d+\s*-\s*/, "") || "Drywall", code: "09 29 00" };
  const jobs = sections.flatMap(section => chunkPages(section.pages).map(pages => ({ section, pages })));
  console.log(`Manual: ${manual.length} pages · reading ${sections.length} sections in ${jobs.length} requests · not in manual: ${missing.join(", ") || "none"}`);
  const model = D.textModel();
  const drafts = [], dropped = [], failures = [];
  let next = 0, done = 0;
  const started = Date.now();
  async function worker() {
    while (next < jobs.length) {
      const { section, pages } = jobs[next++];
      const where = `${section.section} pp. ${pages[0].page}–${pages.at(-1).page}`;
      try {
        const job = J.parseScopeJob({ pkg, document: basename(manualFile), section: { section: section.section, title: section.title }, pages, brief: key.items.map(item => item.text).join("\n").slice(0, 20_000) });
        const output = await D.deepseekJson(apiKey, J.scopeMessages(job), { model, maxTokens: 6000, budgetMs: 55_000 });
        const screened = J.screenScope(output, job);
        drafts.push(...screened.drafts.map(d => ({ ...d, key: `${d.key}@${pages[0].page}` })));
        dropped.push(...screened.dropped.map(d => ({ ...d, where })));
      } catch (error) {
        failures.push({ where, error: error instanceof Error ? error.message : String(error) });
      }
      console.log(`  ${++done}/${jobs.length} ${where}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(args.concurrency ?? 3)) }, worker));
  runInfo = { model, requests: jobs.length, failures: failures.length, dropped: dropped.length, seconds: Math.round((Date.now() - started) / 1000), missingSections: missing };
  const runFile = join(out, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(runFile, JSON.stringify({ ...runInfo, readSections, drafts, dropped, failures }, null, 1));
  console.log(`Run saved: ${runFile}`);
  findings = drafts.map(d => ({ id: d.key, title: d.title, detail: d.detail, source: d.source }));
}

if (!findings.length) {
  const message = `Unassessed: the reading produced no scope findings. No coverage percentage or missed-work count can be claimed.\nRun limitations: ${JSON.stringify(runInfo)}\n`;
  writeFileSync(join(out, "report.md"), message);
  console.log(message);
  process.exit(0);
}
const report = A.scoreScope(key, findings, { readSections, includeRejected: true });
const s = report.summary;
const pct = (x) => `${Math.round(x * 100)}%`;
const csv = (rows) => rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
const findingById = new Map(findings.map(f => [f.id, f]));

writeFileSync(join(out, "lines.csv"), csv([["Line", "Group", "Bid-form line", "Verdict", "Score", "Shared words", "Best finding", "Finding source"],
  ...report.lines.map(l => [l.item.id, l.item.group, l.item.text, l.verdict, l.best?.score ?? "", l.best?.shared.join(" ") ?? "", findingById.get(l.best?.findingId)?.title ?? "", findingById.get(l.best?.findingId)?.source ?? ""])]));
writeFileSync(join(out, "extras.csv"), csv([["Finding", "Source", "Closest line", "Score"],
  ...report.extras.map(e => [e.finding.title, e.finding.source, report.lines.find(l => l.item.id === e.best?.lineId)?.item.text ?? "", e.best?.score ?? ""])]));
writeFileSync(join(out, "report.md"), [
  `# Scope matching candidates — ${key.trade}`, "",
  "Word matching suggests source-review candidates. It does not verify trade responsibility, exclusions or scope accuracy. Use the explicit reviewed mapping for confirmed coverage; failed or unread pages remain unassessed.", "",
  `Run: ${JSON.stringify(runInfo)}`, "",
  `- Scope lines on the bid form: ${s.scopeLines}`,
  `- Matched: ${s.matched} (${pct(s.recall)}) · possible, to confirm: ${s.possible} · missed: ${s.missed}`,
  `- If every possible pairing is confirmed: ${pct(s.recallIfPossibleConfirmed)}`,
  `- Findings: ${s.findings} · paired with a line: ${s.findingsPaired} · extra: ${s.extras} · conflict with an exclusion: ${s.conflicts}`,
  `- Sections: ${s.sectionsListed} on the form · ${s.sectionsRead ?? "?"} read · ${s.sectionsCited} cited by findings`, "",
  "## By group", "", "| Group | Lines | Matched | Possible |", "|---|---|---|---|",
  ...report.groups.map(g => `| ${g.group || "—"} | ${g.lines} | ${g.matched} | ${g.possible} |`), "",
  "## Sections", "", "| Section | Title | Read | Findings |", "|---|---|---|---|",
  ...report.sections.map(x => `| ${x.number} | ${x.title} | ${x.read === null ? "?" : x.read ? "yes" : "NOT IN MANUAL"} | ${x.findings} |`), "",
  ...(report.conflicts.length ? ["## Conflicts with the form's exclusions", "", ...report.conflicts.map(c => `- ${c.finding.title} (${c.finding.source}) ↔ excluded: ${c.exclusion.text} (${c.exclusion.note})`), ""] : []),
  "## Missed lines", "", ...report.lines.filter(l => l.verdict === "missed").map(l => `- ${l.item.id} · ${l.item.group}: ${l.item.text}`), "",
  "Check every pairing in lines.csv against the original sources, including those labelled matched. Percentages here describe word matching only.",
].join("\n"));
console.log(`Matched ${s.matched}/${s.scopeLines} (${pct(s.recall)}), possible ${s.possible}, missed ${s.missed}; findings ${s.findings}, extras ${s.extras}, conflicts ${s.conflicts}; sections cited ${s.sectionsCited}/${s.sectionsListed}`);
console.log(`Report: ${join(out, "report.md")}`);
