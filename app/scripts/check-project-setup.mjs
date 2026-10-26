import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/project-setup.ts");
const { normalizeProject } = await import("../lib/projects.ts");
const { compareRfpFacts } = await import("../lib/rfp.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-18T10:00:00.000Z";
const blank = normalizeProject({ id: "riverside", name: "Riverside Library" });
const complete = normalizeProject({ ...blank, location: "Arlington, VA", type: "Civic", squareFeet: 40000, workType: "new", taxStatus: "non-taxable", estimateStage: "dd", due: "2026-12-01", rfi: "2026-11-15" });
const doc = (o) => ({ id: o.id, projectId: "riverside", name: o.name, category: o.category, kind: o.kind ?? "other", series: o.id, revision: 1, size: 1000, pageCount: o.pages ?? 4, uploadedAt: at, sourcePath: "", sourceUrl: "", textChunk: 100, textChunks: o.chunks ?? 1, sheets: o.sheets ?? [], sections: o.sections ?? [] });
const sheet = (page, s, title) => ({ page, sheet: s, title, date: "" });
const drawings = doc({ id: "d1", name: "Riverside drawings.pdf", category: "Drawings", kind: "drawings", sheets: [sheet(1, "C1.0", "Demolition Plan"), sheet(2, "A8.1", "PARTITION TYPES"), sheet(3, "M1.1", "LEVEL 1 DUCTWORK"), sheet(4, "E1.1", "LEVEL 1 LIGHTING")] });
const emptyProc = { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] };
const run = (o = {}) => S.projectSetup(freeze({ project: blank, documents: [], procurement: emptyProc, pendingProposals: 0, budgetLines: 0, scheduleActivities: 0, state: S.EMPTY_SETUP, ...o }));
const st = (summary, id) => summary.steps.find(s => s.id === id);

// An empty project: the route starts at the documents.
const empty = run();
assert.deepEqual(empty.steps.map(s => s.id), ["documents", "details", "trades", "scopes", "contracts", "reports", "budget", "schedule", "team"]);
assert.deepEqual(empty.steps.filter(s => s.route).map(s => s.id), ["documents", "details", "trades", "scopes"]);
assert.equal(empty.next.id, "documents");
assert.deepEqual(empty.progress, { done: 0, total: 9, percent: 0 });
assert.equal(st(empty, "trades").status, "missing");

// Drawings alone are enough to start (Marcel's case): documents ready, trades suggested from the sheets.
const drawn = run({ documents: [drawings] });
assert.equal(st(drawn, "documents").status, "ready");
assert.equal(st(drawn, "documents").items.find(i => i.id === "manual").status, "missing", "The manual is recommended, not blocking");
assert.equal(st(drawn, "trades").status, "needs-review");
assert.match(st(drawn, "trades").detail, /Confirm the 4 suggested trades/);
assert.equal(drawn.next.id, "details", "Project facts are next");
assert.equal(run({ project: complete, documents: [drawings] }).next.id, "trades");

// Readiness: unread title blocks and unreadable PDFs are not "done".
assert.equal(S.documentReadiness(doc({ id: "d2", name: "x.pdf", category: "Drawings", kind: "drawings", pages: 10, sheets: [sheet(1, "A1", "PLAN")] })).status, "needs-review");
assert.equal(S.documentReadiness(doc({ id: "d3", name: "scan.pdf", category: "Drawings", kind: "drawings", chunks: 0 })).status, "failed");
assert.equal(S.documentReadiness(doc({ id: "m1", name: "manual.pdf", category: "Specifications", kind: "manual" })).status, "needs-review", "A manual without sections needs a look");
assert.equal(st(run({ documents: [doc({ id: "d3", name: "scan.pdf", category: "Drawings", kind: "drawings", chunks: 0 })] }), "documents").status, "failed");

// The RFP: uploaded is not reviewed; the review is per document version.
const rfp = doc({ id: "r1", name: "Riverside RFP.pdf", category: "RFP" });
assert.equal(st(run({ project: complete, documents: [drawings, rfp] }), "details").status, "needs-review");
const reviewed = S.markReviewed(S.EMPTY_SETUP, "r1", "Marcel", at);
assert.equal(st(run({ project: complete, documents: [drawings, rfp], state: reviewed }), "details").status, "ready");
assert.equal(st(run({ project: complete, documents: [drawings, { ...rfp, id: "r2", series: "r1", revision: 2 }], state: reviewed }), "details").status, "needs-review", "A new RFP revision needs reviewing again");

// The delivery method decides what the RFP is (Marcel, 24 Oct): none on a hard bid, required on design-build.
const as = (deliveryMethod) => normalizeProject({ ...complete, deliveryMethod });
const rfpItem = (project, documents = [drawings]) => st(run({ project, documents }), "details").items.find(i => i.id === "rfp");
const prime = (project) => st(run({ project }), "contracts").items.find(i => i.id === "prime").label;
assert.equal(rfpItem(as("hard-bid")), undefined, "A hard bid has no RFP to ask for");
assert.equal(st(run({ project: as("hard-bid"), documents: [drawings] }), "details").status, "ready", "A hard bid's details are complete without an RFP");
assert.deepEqual([rfpItem(as("hard-bid"), [drawings, rfp]).label, rfpItem(as("hard-bid"), [drawings, rfp]).status], ["Invitation to bid", "needs-review"], "An uploaded invitation to bid is still reviewed");
assert.deepEqual([rfpItem(as("cmar")).label, rfpItem(as("cmar")).level, rfpItem(as("cmar")).status], ["RFP", "recommended", "missing"]);
assert.match(rfpItem(as("cmar")).why, /GMP stage/);
assert.deepEqual([rfpItem(as("design-build")).level, st(run({ project: as("design-build"), documents: [drawings] }), "details").status], ["required", "missing"], "Design-build starts from the RFP, so its details wait for it");
assert.equal(st(run({ project: as("design-build"), documents: [drawings, rfp], state: reviewed }), "details").status, "ready");
assert.equal(rfpItem(normalizeProject({ ...complete, id: "mine", deliveryMethod: null })).label, "RFP / invitation to bid", "Without a method, either document");
assert.deepEqual([prime(as("hard-bid")), prime(as("cmar")), prime(as("design-build"))], ["Owner contract (lump sum)", "Owner contract / GMP agreement", "Owner contract / design-build agreement"]);
assert.throws(() => S.markReviewed(S.EMPTY_SETUP, "r1", " "), /Sign in/);

// Scopes: per trade, and AI proposals waiting count as needing review.
const proc = { ...emptyProc, packages: [{ id: "demolition", name: "Demolition", division: "02", code: "02 41 19", owner: "", due: "" }, { id: "drywall", name: "Drywall", division: "09", code: "09 29 00", owner: "", due: "" }], scopes: [{ id: "s1", packageId: "demolition" }] };
assert.equal(st(run({ procurement: proc, documents: [drawings] }), "trades").status, "ready");
assert.match(st(run({ procurement: proc, documents: [drawings] }), "trades").detail, /2 trades; 2 more suggested/);
assert.equal(st(run({ procurement: proc }), "scopes").status, "in-progress");
assert.equal(st(run({ procurement: proc, pendingProposals: 3 }), "scopes").status, "needs-review");
assert.equal(st(run({ procurement: { ...proc, scopes: [...proc.scopes, { id: "s2", packageId: "drywall" }] } }), "scopes").status, "ready");

// Reports follow the work type, each with why; filenames confirm them.
const reports = (project, documents = []) => st(run({ project, documents }), "reports").items.map(i => `${i.id}:${i.status}`);
assert.deepEqual(reports(complete), ["geotech:missing", "survey:missing"]);
assert.deepEqual(reports(normalizeProject({ ...complete, workType: "renovation", squareFeet: 40000 })), ["hazmat:missing", "existing:missing"]);
assert.deepEqual(reports(blank), ["geotech:missing", "survey:missing", "hazmat:missing", "existing:missing"], "No work type: everything, until it is set");
assert.deepEqual(reports(complete, [doc({ id: "g", name: "Geotechnical Report - Riverside.pdf", category: "Reports" })]), ["geotech:ready", "survey:missing"]);
assert.ok(st(run({ project: complete }), "reports").items.every(i => i.why), "Every suggestion says why");

// Decisions: not applicable (reconsidered when the work type changes), waiting (still outstanding).
const reno = normalizeProject({ ...complete, workType: "renovation", squareFeet: 40000 });
const na = S.decide(S.EMPTY_SETUP, { target: "reports:hazmat", kind: "not-applicable", reason: "2019 survey found none" }, reno, "Marcel", at);
assert.equal(st(run({ project: reno, state: na }), "reports").items.find(i => i.id === "hazmat").status, "not-applicable");
const changed = st(run({ project: normalizeProject({ ...reno, workType: "both", renovationSquareFeet: 30000, additionSquareFeet: 10000 }), state: na }), "reports").items.find(i => i.id === "hazmat");
assert.deepEqual([changed.status, changed.reconsider], ["missing", true], "A new work type asks to reconsider");
const waiting = S.decide(S.EMPTY_SETUP, { target: "budget", kind: "waiting", reason: "Owner's budget", responsible: "DGS", followUp: "2026-10-25" }, complete, "Marcel", at);
const w = run({ project: complete, documents: [drawings], procurement: proc, state: waiting });
assert.equal(st(w, "budget").status, "waiting");
assert.notEqual(w.next?.id, "budget", "Waiting is outstanding but not the next thing to do");
assert.equal(st(run({ budgetLines: 3, state: waiting }), "budget").status, "ready", "Real work beats a saved decision");
assert.throws(() => S.decide(S.EMPTY_SETUP, { target: "trades", kind: "not-applicable", reason: "x" }, complete, "Marcel"), /needed before scopes/);
assert.throws(() => S.decide(S.EMPTY_SETUP, { target: "documents:drawings", kind: "not-applicable", reason: "x" }, complete, "Marcel"), /needed before scopes/);
assert.throws(() => S.decide(S.EMPTY_SETUP, { target: "budget", kind: "waiting", reason: "x" }, complete, "Marcel"), /Name who/);
assert.throws(() => S.decide(S.EMPTY_SETUP, { target: "budget", kind: "waiting", reason: "x", responsible: "DGS", followUp: "soon" }, complete, "Marcel"), /date/);
assert.throws(() => S.decide(S.EMPTY_SETUP, { target: "budget", kind: "not-applicable", reason: " " }, complete, "Marcel"), /why/);
assert.throws(() => S.decide(S.EMPTY_SETUP, { target: "nonsense", kind: "waiting", reason: "x", responsible: "y" }, complete, "Marcel"), /setup step/);
assert.equal(S.clearDecision(waiting, "budget").decisions.length, 0);
assert.equal(S.decide(waiting, { target: "budget", kind: "not-applicable", reason: "Owner holds the budget" }, complete, "Marcel", at).decisions.length, 1, "One decision per target");

// Completeness counts items (a step without items once): done, missing (red), to check (yellow), waiting.
const full = run({ project: complete, documents: [drawings, rfp], procurement: proc, state: waiting });
const c = full.completeness;
assert.equal(c.total, full.steps.reduce((n, s) => n + (s.items.length || 1), 0));
assert.equal(c.done + c.missing + c.review + c.waiting + full.steps.flatMap(s => s.items.length ? s.items : [s]).filter(u => u.status === "in-progress").length, c.total, "Every item is counted once");
assert.ok(c.review >= 1 && c.waiting === 1 && c.percent === Math.round(c.done / c.total * 100));
assert.deepEqual([empty.completeness.done, empty.completeness.review], [0, 0]);

// RFP review is a comparison, never a silent overwrite.
const cmp = compareRfpFacts(complete, [
  { field: "due", value: "2026-12-15", page: 3, quote: "q" }, { field: "location", value: "arlington, va", page: 1, quote: "q" },
  { field: "rfi", value: "2026-12-20", page: 3, quote: "q" }, { field: "architect", value: "Studio K", page: 1, quote: "q" },
  { field: "workType", value: "both", page: 2, quote: "q" }, { field: "renovationSquareFeet", value: 12000, page: 2, quote: "q" },
]);
assert.deepEqual(cmp.rows.map(r => [r.field, r.conflict, r.same]), [["due", true, false], ["location", false, true], ["rfi", true, false], ["architect", false, false], ["workType", true, false], ["renovationSquareFeet", false, false]]);
assert.deepEqual(cmp.issues, ["The last day for questions falls after the bid due date.", "Renovation and addition work needs both areas; one is missing."]);
assert.match(compareRfpFacts(complete, [{ field: "squareFeet", value: 450, page: 1, quote: "q" }]).issues[0], /check the units/);

// ── Phase 2: completeness only when proven, referenced reports, addenda, file classification ──
const K = await import("../lib/setup-checks.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");
const set = ["G0.1", "A1.1", "A1.2", "A8.1", "A8.2", "M101", "M201", "S101", "CIV0102", "E1.1", "K-101"];
const indexText = "SHEET INDEX G0.1 COVER A1.1 FIRST FLOOR A1.2 SECOND FLOOR A8.1 PARTITIONS A8.2 DOORS M101 HVAC M201 PIPING M202 PIPING L2 S101 FRAMING CIV0102 DEMO E1.1 LIGHTING K-101 KITCHEN NFPA13 A1 GRID B4";
assert.equal(K.indexSheet([{ sheet: "A0.1", title: "PROJECT DATA" }, { sheet: "G0.1", title: "COVER SHEET" }]).sheet, "G0.1");
const idx = K.drawingIndexCheck("d1", indexText, set.filter(s => s !== "M201"));
assert.deepEqual([idx.status, idx.missing], ["checked", ["M201", "M202"]], "Only tokens shaped like the set's sheets count; grid A1, B4 and NFPA13 never do");
assert.equal(K.drawingIndexCheck("d1", "", set).status, "not-checked");
assert.equal(K.drawingIndexCheck("d1", "A1.1 A1.2 M101", set).status, "not-checked", "Too short an index is not trusted");
assert.equal(K.drawingIndexCheck("d1", indexText.replace(/A1.1|A1.2|A8.1|A8.2|M101|S101|CIV0102|E1.1/g, ""), set).status, "not-checked", "An index missing most uploaded sheets is not trusted");
const contents = Array.from({ length: 12 }, (_, n) => `09 ${String(21 + n).padStart(2, "0")} 00 SECTION TITLE ${n}`).join("\n") + "\n13 34 16.53 METAL BUILDING\n00 00 00 COVER";
assert.equal(K.tocSections(contents).length, 13, "The 00 00 00 cover line is not a section");
assert.equal(K.tocText([{ page: 2, text: contents }, { page: 3, text: "A page of prose." }, { page: 90, text: contents }]), contents, "Contents pages: dense section lines within the first 40 pages");
const found = Array.from({ length: 10 }, (_, n) => ({ section: `09 ${String(21 + n).padStart(2, "0")} 00`, title: "", first: 1, last: 2 }));
const tocCheck = K.specTocCheck("m1", contents, found, code => K.sectionInText(code, "SECTION 093100 - FLOORING\nTITLE 133416.53 - 4"));
assert.deepEqual([tocCheck.status, tocCheck.missing], ["checked", ["09 32 00"]], "A candidate confirmed in the full text is not missing");
assert.equal(K.sectionInText("13 34 16.53", "METAL BUILDING 133416.53 - 2"), true);
assert.equal(K.sectionInText("05 73 00", "RAILINGS 057300.13 - 1"), false, "A decimal subsection does not stand for its parent");
assert.equal(K.specTocCheck("m1", "09 21 00 A", found).status, "not-checked");
const refPages = K.referencePages([{ page: 5, text: contents }, { page: 9, text: "A Geotechnical Investigation Report prepared by ECS. Boring logs attached." }, { page: 12, text: "Nothing here." }, { page: 43, text: "Hazardous materials: an asbestos report is on file." }]);
assert.deepEqual(refPages.map(p => p.page), [9, 43], "Pages naming reports, contents pages skipped");
const R = EXTRA_JOBS["referenced-documents"];
const rIn = R.parse({ pages: refPages });
assert.deepEqual(R.screen({ documents: [{ kind: "geotech", title: "Geotechnical Investigation Report (ECS)", page: 9, quote: "Geotechnical Investigation Report prepared by ECS" }, { kind: "geotech", title: "Geotechnical Investigation Report (ECS)", page: 9, quote: "Geotechnical Investigation Report prepared by ECS" }, { kind: "hazmat", title: "Asbestos report", page: 43, quote: "a lead paint report signed by nobody" }, { kind: "weird", title: "Boring logs", page: 9, quote: "Boring logs attached" }] }, rIn).documents.map(d => [d.kind, d.page]), [["geotech", 9], ["other", 9]], "Quote on its page, once each; unknown kinds become other");
assert.throws(() => R.parse({ pages: [] }), /specification pages/);
for (const [name, text, sheets, category] of [["Addendum 02.pdf", "", 0, "Addenda"], ["Jelleff ITB.pdf", "", 0, "RFP"], ["x.pdf", "REQUEST FOR PROPOSALS for construction", 0, "RFP"], ["Project Manual.pdf", "", 0, "Specifications"], ["set.pdf", "", 12, "Drawings"], ["Subcontract Agreement.pdf", "", 0, "Contracts"], ["Geotech Report.pdf", "", 0, "Reports"], ["scan.pdf", "", 0, "Other"]])
  assert.equal(K.classifyFile(name, text, sheets).category, category, name);
assert.equal(K.classifyFile("misc.pdf", "", 0).confidence, "low");

// Phase 2 in the guide: items appear only with a check result for the current document version.
const manualDoc = doc({ id: "m1", name: "Manual.pdf", category: "Specifications", kind: "manual", sections: found.map(s => ({ ...s })) });
const withChecks = (checks, docs = [drawings, manualDoc], project = complete) => run({ project, documents: docs, state: { ...S.EMPTY_SETUP, checks } });
const p2 = withChecks({ drawingIndex: { ...idx, docId: "d1" }, specToc: { ...tocCheck, docId: "m1" }, references: { docId: "m1", documents: [{ kind: "geotech", title: "Geotechnical Investigation Report (ECS, 2023)", page: 9, quote: "Geotechnical Investigation Report prepared by ECS" }, { kind: "hazmat", title: "Hazardous Materials Survey (2022)", page: 43, quote: "asbestos report is on file" }, { kind: "other", title: "Traffic impact study", page: 12, quote: "traffic study" }] } });
const docItemsOf = s => st(s, "documents").items.map(i => `${i.id}:${i.status}`);
assert.deepEqual(docItemsOf(p2), ["drawings:ready", "manual:ready", "sheets:missing", "sections:needs-review"]);
assert.match(st(p2, "documents").items.find(i => i.id === "sheets").note, /M201, M202/);
assert.equal(st(p2, "documents").status, "ready", "Missing index sheets don't block the route; they are their own item");
assert.deepEqual(docItemsOf(withChecks({ drawingIndex: { ...idx, docId: "old-version" } })), ["drawings:ready", "manual:ready"], "A check for another version is ignored");
const reportsP2 = st(p2, "reports").items;
assert.deepEqual(reportsP2.map(i => i.id), ["geotech", "survey", "hazmat", "ref-2"], "New work + a referenced hazmat survey: the referenced one is added; others get a new item");
assert.match(reportsP2.find(i => i.id === "geotech").why, /^Referenced in the project manual, p. 9/);
assert.equal(reportsP2.find(i => i.id === "geotech").label, "Geotechnical Investigation Report (ECS, 2023)");
const addendum = doc({ id: "ad1", name: "Addendum 01.pdf", category: "Addenda" });
assert.equal(st(withChecks({}, [drawings, addendum]), "details").items.find(i => i.id === "addenda").status, "needs-review");
assert.equal(st(withChecks({}, [drawings, addendum]), "details").status, "needs-review");
assert.equal(st(run({ project: complete, documents: [drawings, addendum], state: S.markReviewed(S.EMPTY_SETUP, "ad1", "Marcel", at) }), "details").items.find(i => i.id === "addenda").status, "ready");

// Running the checks: a failed step keeps the others' results and says what failed; a retry runs only what's missing.
const indexed = doc({ id: "d2", name: "Set.pdf", category: "Drawings", kind: "drawings", sheets: [sheet(1, "G0.1", "COVER SHEET"), ...set.slice(1).map((s, n) => sheet(n + 2, s, "PLAN"))] });
const manualPages = [{ page: 2, text: contents }, { page: 9, text: "A Geotechnical Investigation Report prepared by ECS." }];
const calls = [];
const io = (fail = {}) => ({
  text: async (d, range) => { calls.push(`text:${d.id}`); if (fail.text === d.id) throw new Error("chunk unavailable"); return d.id === "d2" ? [{ page: range.first, text: indexText }] : manualPages; },
  references: async pages => { calls.push("ai"); if (fail.ai) throw new Error("AI request failed (502)"); return [{ kind: "geotech", title: "Geotechnical report", page: pages[0].page, quote: "Geotechnical Investigation Report" }]; },
});
assert.deepEqual(K.dueChecks(indexed, manualDoc, {}), ["drawingIndex", "specToc", "references"]);
const failed = await K.runSetupChecks(indexed, manualDoc, {}, io({ ai: true }));
assert.deepEqual(Object.keys(failed.found), ["drawingIndex", "specToc"], "The AI failing keeps the index and contents results");
assert.match(failed.error, /^Referenced reports: AI request failed \(502\)$/);
assert.deepEqual(K.dueChecks(indexed, manualDoc, failed.found), ["references"], "Only the failed check is still due");
calls.length = 0;
const retried = await K.runSetupChecks(indexed, manualDoc, failed.found, io());
assert.deepEqual([Object.keys(retried.found), retried.error, calls], [["references"], null, ["text:m1", "ai"]], "The retry reads the manual and asks the AI only");
assert.deepEqual(K.dueChecks(indexed, manualDoc, { ...failed.found, ...retried.found }), [], "Nothing is due after the retry");
const noText = await K.runSetupChecks(indexed, manualDoc, {}, io({ text: "m1" }));
assert.deepEqual([Object.keys(noText.found), noText.error], [["drawingIndex"], "Project manual: chunk unavailable"]);
assert.deepEqual(await K.runSetupChecks(null, null, {}, io()), { found: {}, error: null }, "Nothing uploaded, nothing to run");

console.log(`Project setup checked: ${empty.steps.length} steps, drawings-only start, readiness, RFP review per version, scopes per trade, reports by work type, decisions (not applicable, waiting, reconsider), RFP comparison.`);
