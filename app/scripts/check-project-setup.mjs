import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/project-setup.ts");
const { normalizeProject } = await import("../lib/projects.ts");
const { compareRfpFacts } = await import("../lib/rfp.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-10-18T10:00:00.000Z";
const blank = normalizeProject({ id: "riverside", name: "Riverside Library" });
const complete = normalizeProject({ ...blank, location: "Arlington, VA", type: "Civic", squareFeet: 40000, workType: "new", taxStatus: "non-taxable", estimateStage: "dd", due: "2026-12-01" });
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

// RFP review is a comparison, never a silent overwrite.
const cmp = compareRfpFacts(complete, [
  { field: "due", value: "2026-12-15", page: 3, quote: "q" }, { field: "location", value: "arlington, va", page: 1, quote: "q" },
  { field: "rfi", value: "2026-12-20", page: 3, quote: "q" }, { field: "architect", value: "Studio K", page: 1, quote: "q" },
  { field: "workType", value: "both", page: 2, quote: "q" }, { field: "renovationSquareFeet", value: 12000, page: 2, quote: "q" },
]);
assert.deepEqual(cmp.rows.map(r => [r.field, r.conflict, r.same]), [["due", true, false], ["location", false, true], ["rfi", false, false], ["architect", false, false], ["workType", true, false], ["renovationSquareFeet", false, false]]);
assert.deepEqual(cmp.issues, ["The last day for questions falls after the bid due date.", "Renovation and addition work needs both areas; one is missing."]);
assert.match(compareRfpFacts(complete, [{ field: "squareFeet", value: 450, page: 1, quote: "q" }]).issues[0], /check the units/);

console.log(`Project setup checked: ${empty.steps.length} steps, drawings-only start, readiness, RFP review per version, scopes per trade, reports by work type, decisions (not applicable, waiting, reconsider), RFP comparison.`);
