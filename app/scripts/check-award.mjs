import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const A = await import("../lib/award.ts");
const { levelingCandidates } = await import("../lib/budget.ts");
const { ruleFixtureBudget: sampleBudget } = await import("./fixtures/budget-rules.mjs");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { addScope, approveScope, bidForm, inviteBidder, publishPackage, setInvitationStatus } = await import("../lib/procurement.ts");
const { openSubmission, setResponse, submitBid, updateDraft } = await import("../lib/submissions.ts");
const { buildLevelingImport } = await import("../lib/leveling-import.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-28T12:00:00.000Z";
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof A.AwardRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const approveAll = (s, pkg) => bidForm(s, pkg).reduce((acc, i) => approveScope(acc, i.id, "Safi", at), s);

// Demolition published; Capital (b1) bids all Y; Greenline (b6) bids with N, P and extras.
let proc = inviteBidder(structuredClone(sampleProcurement), "demolition", "b6", "Safi", at);
proc = freeze(publishPackage(approveAll(proc, "demolition"), "demolition", "Safi", at));
const form = bidForm(proc, "demolition");
const inv = (b) => proc.invitations.find(i => i.packageId === "demolition" && i.bidderId === b).id;
let subs = ["b1", "b6"].reduce((acc, b) => openSubmission(acc, proc, { projectId: "jelleff", invitationId: inv(b) }, at), []);
const sid = (b) => subs.find(x => x.bidderId === b).id;
subs = form.reduce((acc, i) => setResponse(acc, sid("b1"), i.id, "Y", "", at), subs);
subs = form.reduce((acc, i, n) => setResponse(acc, sid("b6"), i.id, n === 1 ? "N" : n === 2 ? "P" : "Y", n === 2 ? "Salvage only." : "", at), subs);
subs = updateDraft(subs, sid("b1"), { baseBid: 498000 }, at);
subs = updateDraft(subs, sid("b6"), { baseBid: 450000, exclusions: ["Hazardous materials abatement"], clarifications: ["Work hours 7–5."], alternates: [{ id: "alt-1", kind: "deduct", description: "Reuse crushed concrete on site", amount: 12000 }] }, at);
subs = freeze(["b1", "b6"].reduce((acc, b) => submitBid(acc, proc, sid(b), { name: b === "b1" ? "Michael Brooks" : "Jordan Davis", email: `${b}@example.com` }, at), subs));
const imported = buildLevelingImport({ projectId: "jelleff", projectName: "Jelleff Recreation Center", packageId: "demolition", procurement: proc, submissions: subs, directory: initialBidders });
// The estimator resolves Greenline's open N and P rows in leveling.
const workspace = imported.bidders.map(b => b.name === "Greenline Civil" ? { ...b, responses: Object.fromEntries(Object.entries(b.responses).map(([k, r]) => [k, { ...r, resolved: true }])) } : b);
const unresolved = freeze(levelingCandidates({ packageId: "demolition", items: imported.items, bidders: imported.bidders, provenance: imported.provenance }));
const candidates = freeze(levelingCandidates({ packageId: "demolition", items: imported.items, bidders: workspace, provenance: imported.provenance }));
const [capital, green] = candidates;
const ctx = freeze({ projectId: "jelleff", projectName: "Jelleff Recreation Center", procurement: proc, submissions: subs, candidates, budget: sampleBudget, directory: initialBidders });
const empty = freeze({ awards: [], notifications: [] });

// Who can be awarded.
assert.deepEqual(startingDraft("p2", "awards", empty), { awards: [], notifications: [] });
assert.deepEqual(A.awardCandidates(candidates).map(c => c.awardable), [true, true]);
const before = A.awardCandidates(unresolved)[1];
assert.equal(before.awardable, false);
assert.match(before.reasons.join(" "), /Leveling review is not complete \(open-scope-review\)/);
assert.match(A.awardCandidates([{ ...capital, submissionId: null }])[0].reasons.join(" "), /Not a portal submission/);
assert.match(A.awardCandidates([{ ...capital, stale: true }])[0].reasons.join(" "), /older bid form/);

// createAward refuses anything that is not an explicit, valid choice.
fails(() => A.createAward(empty, ctx, { levelingBidderId: "nobody", basis: "reviewed" }, "Safi", at), "candidate", /Choose a bidder/);
fails(() => A.createAward(empty, { ...ctx, candidates: unresolved }, { levelingBidderId: green.levelingBidderId, basis: "base" }, "Safi", at), "candidate", /cannot be awarded: Leveling review is not complete/);
fails(() => A.createAward(empty, ctx, { levelingBidderId: capital.levelingBidderId, basis: "lowest" }, "Safi", at), "basis", /Choose base bid/);
fails(() => A.createAward(empty, ctx, { levelingBidderId: capital.levelingBidderId, basis: "reviewed", budgetLineId: "nope" }, "Safi", at), "budgetLineId", /no longer exists/);
fails(() => A.createAward(empty, ctx, { levelingBidderId: capital.levelingBidderId, basis: "reviewed", budgetLineId: "i1" }, "Safi", at), "budgetLineId", /direct construction line/);
fails(() => A.createAward(empty, ctx, { levelingBidderId: capital.levelingBidderId, basis: "reviewed", allowanceIds: ["zz"] }, "Safi", at), "allowanceIds", /no longer exists/);
fails(() => A.createAward(empty, { ...ctx, budget: { ...sampleBudget, allowances: sampleBudget.allowances.map(a => a.id === "a1" ? { ...a, status: "excluded" } : a) } }, { levelingBidderId: capital.levelingBidderId, basis: "reviewed", allowanceIds: ["a1"] }, "Safi", at), "allowanceIds", /Excluded allowances/);
fails(() => A.createAward(empty, { ...ctx, projectId: "whittier" }, { levelingBidderId: capital.levelingBidderId, basis: "reviewed" }, "Safi", at), "candidate", /another project/);
fails(() => A.createAward(empty, { ...ctx, procurement: setInvitationStatus(proc, inv("b1"), "declined") }, { levelingBidderId: capital.levelingBidderId, basis: "reviewed" }, "Safi", at), "candidate", /active invitation/);
const v2 = publishPackage(approveAll(addScope(proc, { packageId: "demolition", title: "Remove the ceiling grid." }, "Safi", at), "demolition"), "demolition", "Safi", at);
fails(() => A.createAward(empty, { ...ctx, procurement: v2 }, { levelingBidderId: capital.levelingBidderId, basis: "reviewed" }, "Safi", at), "candidate", /older bid form/);

// Award Capital at its reviewed total, linked to the Demolition budget line with one allowance.
// The sample layout (no customer template) is pinned here; the Contractor layout is checked further down.
const SAMPLE_EXHIBIT = [A.generateSampleExhibit, A.SAMPLE_EXHIBIT_TEMPLATE];
let s = freeze(A.createAward(empty, ctx, { levelingBidderId: capital.levelingBidderId, basis: "reviewed", budgetLineId: "c1", allowanceIds: ["a2", "a2"] }, "Safi", at, ...SAMPLE_EXHIBIT));
let award = s.awards[0];
const id = award.id;
assert.deepEqual([award.packageId, award.invitationId, award.bidderId, award.submissionId, award.revisionNumber, award.budgetLineId, award.basis, award.amount],
  ["demolition", inv("b1"), "b1", sid("b1"), 1, "c1", "reviewed", 507960]);
assert.deepEqual([award.leveling.baseBid, award.leveling.provisionalTotal, award.leveling.reviewedTotal], [498000, 507960, 507960]);
assert.deepEqual([award.snapshot.packageOwner, award.snapshot.company, award.snapshot.scope.length, award.snapshot.allowances.map(a => a.id)],
  ["Safi", { name: "Capital Demolition", contact: "Michael Brooks", email: "b1@example.com" }, form.length, ["a2"]]);
assert.deepEqual([A.awardStage(award), award.exhibit.revisions.length, A.latestExhibit(award).template.sample], ["exhibit-draft", 1, true]);
const doc = A.latestExhibit(award).content;
assert.equal(doc.title, "Exhibit A — Scope of Work · 02 41 19 Demolition");
const section = (content, heading) => content.sections.find(x => x.heading === heading)?.lines ?? [];
assert.equal(section(doc, "Scope of work").length, form.length);
assert.deepEqual(section(doc, "Allowances"), ["Unforeseen existing conditions: $175,000 (General requirements · Existing conditions)"]);
assert.deepEqual(section(doc, "Subcontract amount"), ["$507,960, the reviewed leveled total from bid leveling."]);
assert.match(section(doc, "Template")[0], /not the customer's Exhibit A template/);
fails(() => A.createAward(s, ctx, { levelingBidderId: green.levelingBidderId, basis: "base" }, "Safi", at), "award", /Demolition is already awarded/);

// Greenline's exhibit carries the N, P, exclusions and alternates (after cancelling Capital's award).
const cancelled = freeze(A.cancelAward(s, id, "Owner chose to re-bid", "Safi", at));
fails(() => A.cancelAward(s, id, " ", "Safi", at), "reason", /Say why/);
assert.equal(A.awardStage(cancelled.awards[0]), "cancelled");
fails(() => A.shareExhibit(cancelled, id, at), "award", /cancelled/);
const g = A.createAward(cancelled, ctx, { levelingBidderId: green.levelingBidderId, basis: "base" }, "Safi", at, ...SAMPLE_EXHIBIT).awards[1];
const gdoc = A.latestExhibit(g).content;
assert.deepEqual([g.amount, section(gdoc, "Scope of work").length], [450000, form.length - 1], "The excluded item is not in the scope of work");
assert.deepEqual(section(gdoc, "Excluded from this subcontract"), [form[1].title, "Hazardous materials abatement"]);
assert(section(gdoc, "Scope of work").some(line => line.includes(`${form[2].title}`) && line.endsWith("Partial per bid: Salvage only.")));
assert.deepEqual(section(gdoc, "Clarifications"), ["Work hours 7–5."]);
assert.deepEqual(section(gdoc, "Alternates offered (not included unless accepted in writing)"), ["Deduct $12,000: Reuse crushed concrete on site"]);

// Close the gap: written answers applied in leveling override the bid's answer in Exhibit A, quoted.
const ans = (kind, amount, note) => ({ kind, amount, note, by: "Jordan Davis", at: "2026-09-29T15:00:00.000Z" });
const cline = (item, bid, answer) => ({ scopeItemId: item.id, number: "", item: item.title, section: "", requirement: "", bid, answer, appliedAt: "2026-09-29T16:00:00.000Z" });
const creq = (lines, extra = {}) => ({ id: "cl-1", projectId: "jelleff", projectName: "Jelleff Recreation Center", packageId: "demolition", trade: "Demolition", bidderId: green.levelingBidderId, bidder: "Greenline Civil", baseBid: 450000, recipient: null, lines, status: "sent", createdAt: at, sentAt: at, dueAt: null, appliedAt: null, version: 3, history: [], ...extra });
const clines = [cline(form[1], { status: "N", note: "" }, ans("add", 4200.5, "UL systems")), cline(form[2], { status: "P", note: "Salvage only." }, ans("excluded", null, ""))];
const exhibitWith = (clarifications) => A.latestExhibit(A.createAward(cancelled, { ...ctx, clarifications }, { levelingBidderId: green.levelingBidderId, basis: "base" }, "Safi", at, ...SAMPLE_EXHIBIT).awards[1]).content;
const cdoc = exhibitWith([creq(clines)]);
assert(section(cdoc, "Scope of work").some(line => line.includes(form[1].title)), "The item the sub agreed to add is in the scope of work");
assert.deepEqual(section(cdoc, "Excluded from this subcontract"), [`${form[2].title} (Excluded, confirmed in writing 2026-09-29 by Jordan Davis)`, "Hazardous materials abatement"]);
assert.deepEqual(section(cdoc, "Clarifications"), ["Work hours 7–5.", `${form[1].title}: Included for an added $4,200.50, confirmed in writing 2026-09-29 by Jordan Davis: "UL systems".`, `${form[2].title}: Excluded, confirmed in writing 2026-09-29 by Jordan Davis.`]);
for (const [why, requests] of [
  ["not applied", [creq(clines.map(l => ({ ...l, appliedAt: null })))]],
  ["cancelled", [creq(clines, { status: "cancelled" })]],
  ["another bidder's", [creq(clines, { bidderId: capital.levelingBidderId })]],
  ["about an answer this revision no longer gives", [creq(clines.map(l => ({ ...l, bid: { status: "Y", note: "" } })))]],
]) assert.deepEqual(exhibitWith(requests), gdoc, `A clarification ${why} leaves Exhibit A as bid`);

// Exhibit A negotiation: share → changes requested → revise → share → resolve → agree.
fails(() => A.agreeExhibit(s, id, "Michael Brooks", "subcontractor", at), "exhibit", /Only a shared revision/);
fails(() => A.generateSubcontract(s, id, "Marcel's company", "Safi", at), "subcontract", /Agree Exhibit A/);
s = freeze(A.shareExhibit(s, id, at));
assert.deepEqual([A.awardStage(s.awards[0]), s.notifications.at(-1).kind, s.notifications.at(-1).recipient], ["exhibit-shared", "exhibit-shared", "b1"]);
fails(() => A.shareExhibit(s, id, at), "exhibit", /already shared/);
fails(() => A.addExhibitComment(s, id, { author: " ", party: "contractor", text: "x" }, at), "name", /who is commenting/);
fails(() => A.addExhibitComment(s, id, { author: "Safi", party: "owner", text: "x" }, at), "comment", /which side/);
s = freeze(A.requestExhibitChanges(s, id, { author: "Michael Brooks", text: "Slab removal should be by others." }, at));
award = s.awards[0];
assert.deepEqual([A.awardStage(award), A.unresolvedComments(award).length, award.exhibit.comments[0].party, award.exhibit.comments[0].revisionNumber], ["exhibit-changes-requested", 1, "subcontractor", 1]);
assert.deepEqual([s.notifications.at(-1).kind, s.notifications.at(-1).recipientType, s.notifications.at(-1).recipient], ["exhibit-changes-requested", "team", "Safi"]);
fails(() => A.reviseExhibit(s, id, { title: " ", sections: [] }, "", "Safi", at), "exhibit", /title/);
fails(() => A.reviseExhibit(s, id, { title: "X", sections: [{ heading: "", lines: [] }] }, "", "Safi", at), "exhibit", /heading/);
const edited = { ...A.latestExhibit(award).content, sections: [...A.latestExhibit(award).content.sections, { heading: "Clarifications", lines: ["Slab removal by others.", " "] }] };
s = freeze(A.reviseExhibit(s, id, edited, "Slab removal moved to others", "Safi", at));
award = s.awards[0];
assert.deepEqual([award.exhibit.status, award.exhibit.revisions.length, A.latestExhibit(award).note, A.latestExhibit(award).content.sections.at(-1).lines], ["draft", 2, "Slab removal moved to others", ["Slab removal by others."]]);
assert.equal(award.exhibit.revisions[0].content.sections.length, doc.sections.length, "Earlier revisions are kept unchanged");
s = freeze(A.shareExhibit(s, id, at));
fails(() => A.agreeExhibit(s, id, "Michael Brooks", "subcontractor", at), "exhibit", /1 comment is still unresolved/);
s = freeze(A.setCommentResolved(s, id, award.exhibit.comments[0].id, true, "Safi", at));
assert.deepEqual([s.awards[0].exhibit.comments[0].resolved, s.awards[0].exhibit.comments[0].resolvedBy], [true, "Safi"]);
assert.equal(A.setCommentResolved(s, id, award.exhibit.comments[0].id, false, "Safi", at).awards[0].exhibit.comments[0].resolvedBy, null, "A comment can be reopened");
s = freeze(A.agreeExhibit(s, id, "Michael Brooks", "subcontractor", at));
award = s.awards[0];
assert.deepEqual([A.awardStage(award), award.exhibit.agreement.revisionNumber, s.notifications.slice(-2).map(n => n.recipientType)], ["exhibit-agreed", 2, ["team", "bidder"]]);
fails(() => A.addExhibitComment(s, id, { author: "Safi", party: "contractor", text: "late" }, at), "comment", /agreed and locked/);
fails(() => A.reviseExhibit(s, id, edited, "", "Safi", at), "exhibit", /agreed and locked/);

// Subcontract: only after agreement; sub signs, contractor countersigns, then executed.
fails(() => A.generateSubcontract(s, id, "  ", "Safi", at), "contractorName", /legal name/);
fails(() => A.sendSubcontract(s, id, at), "subcontract", /Generate the subcontract first/);
s = freeze(A.generateSubcontract(s, id, "Sample General Contractor LLC", "Safi", at, A.generateSampleSubcontract, A.SAMPLE_SUBCONTRACT_TEMPLATE));
award = s.awards[0];
assert.deepEqual([A.awardStage(award), award.subcontract.exhibitRevision, award.subcontract.amount, award.subcontract.template.sample], ["subcontract-draft", 2, 507960, true]);
assert.deepEqual(section(award.subcontract.content, "Parties"), ["Contractor: Sample General Contractor LLC", "Subcontractor: Capital Demolition", "Project: Jelleff Recreation Center"]);
s = freeze(A.generateSubcontract(s, id, "Sample GC Inc.", "Safi", at, A.generateSampleSubcontract, A.SAMPLE_SUBCONTRACT_TEMPLATE));
assert.equal(s.awards[0].subcontract.contractorName, "Sample GC Inc.", "An unsent draft can be regenerated");
s = freeze(A.sendSubcontract(s, id, at));
assert.deepEqual([A.awardStage(s.awards[0]), s.notifications.at(-1).kind], ["signature-pending", "subcontract-sent"]);
fails(() => A.generateSubcontract(s, id, "Other", "Safi", at), "subcontract", /already been sent/);
fails(() => A.signSubcontract(s, id, "contractor", { name: "Marcel Khoury", title: "PM", email: "m@example.com" }, at), "signature", /after the subcontractor/);
fails(() => A.executeSubcontract(s, id, at), "subcontract", /Both parties must sign/);
fails(() => A.signSubcontract(s, id, "subcontractor", { name: "Michael Brooks", title: "", email: "nope" }, at), "email", /email/);
s = freeze(A.signSubcontract(s, id, "subcontractor", { name: " Michael Brooks ", title: "President", email: "b1@example.com" }, at));
assert.deepEqual([A.awardStage(s.awards[0]), s.awards[0].subcontract.subcontractorSignature.name, s.awards[0].subcontract.subcontractorSignature.method, s.notifications.at(-1).recipient], ["subcontractor-signed", "Michael Brooks", "typed-demo", "Safi"]);
fails(() => A.signSubcontract(s, id, "subcontractor", { name: "Again", title: "", email: "b1@example.com" }, at), "signature", /not waiting/);
s = freeze(A.signSubcontract(s, id, "contractor", { name: "Marcel Khoury", title: "Project manager", email: "marcel@example.com" }, at));
assert.equal(A.awardStage(s.awards[0]), "countersigned");
s = freeze(A.executeSubcontract(s, id, at));
award = s.awards[0];
assert.equal(A.awardStage(award), "executed");
for (const text of ["Subcontract agreement · Demolition", "Exhibit A — Scope of Work · 02 41 19 Demolition", "Slab removal by others.", "Subcontractor: Michael Brooks, President <b1@example.com>", "Contractor: Marcel Khoury, Project manager <marcel@example.com>", "typed demo signature", `Executed ${at}`]) {
  assert(award.subcontract.executedCopy.includes(text), `Executed copy must include "${text}"`);
}
fails(() => A.cancelAward(s, id, "too late", "Safi", at), "award", /executed subcontract/);
assert.deepEqual(s.notifications.map(n => n.kind), ["exhibit-shared", "exhibit-changes-requested", "exhibit-shared", "exhibit-agreed", "exhibit-agreed", "subcontract-sent", "subcontract-signed", "subcontract-countersigned", "subcontract-executed", "subcontract-executed"]);
assert(A.markAwardNotificationsRead(s, s.notifications.map(n => n.id)).notifications.every(n => n.read));

// The customer (Contractor) templates are the default: the contractor's Exhibit A structure and subcontract, placeholders filled.
const mcnCtx = { ...ctx, owner: "DC Department of General Services", projectAddress: "3265 S Street NW, Washington, DC 20007", projectStart: "2026-06-01" };
const mcn = A.createAward(empty, mcnCtx, { levelingBidderId: green.levelingBidderId, basis: "base" }, "Safi", at).awards[0];
const mdoc = A.latestExhibit(mcn).content;
assert.deepEqual([A.latestExhibit(mcn).template.id, A.latestExhibit(mcn).template.sample, mdoc.title], ["mcn-exhibit-a", false, "Exhibit A — Scope of Work · 02 41 19 Demolition"]);
assert.deepEqual(section(mdoc, "Exhibit A — Scope of Work"), ["Demolition", "DC Department of General Services", "Jelleff Recreation Center", "3265 S Street NW, Washington, DC 20007"]);
const general = section(mdoc, "General requirements");
const notes = general.filter(line => /^\d+\. /.test(line));
assert.equal(mdoc.sections[2].heading, "Scope of work", "Scope is numbered Section 3");
assert.deepEqual([notes.length, notes[0].startsWith("1. It is the intent of this bid package"), notes.at(-1).startsWith("32. All work hours")], [32, true, true], "the contractor's 32 general notes, numbered");
const mscope = section(mdoc, "Scope of work");
assert(mscope[0].startsWith("The scope of work of this Subcontract includes") && mscope.at(-1) === "Provide an ADD ALTERNATE Payment and Performance Bond.");
assert.equal(mscope.length, 1 + (form.length - 1) + 1, "Intro, the included items (not the N item), the bond alternate");
assert.deepEqual(section(mdoc, "Scope exclusions"), [form[1].title, "Hazardous materials abatement"]);
assert(general.includes("02 41 19 — Demolition"), "Governing sections remain in the shell");
assert(section(mdoc, "Phasing & schedule highlights").includes("Project Commencement – 2026-06-01"));
assert(section(mdoc, "Phasing & schedule highlights").includes("Project Substantial Completion – [finish]"), "A missing value stays visible as [finish]");
assert(mdoc.sections.some(x => x.heading === "Economic inclusion requirements") && mdoc.sections.at(-1).heading === "- End of Exhibit A -");
assert.deepEqual(section(mdoc, "Subcontract amount"), ["$450,000, the base bid from bid leveling (bid revision 1, bid form version 1)."]);
assert.equal(A.latestExhibit(A.createAward(empty, ctx, { levelingBidderId: green.levelingBidderId, basis: "base" }, "Safi", at).awards[0]).content.sections[0].lines[1], "[owner]", "No owner supplied: the gap is shown");
let m = A.createAward(empty, mcnCtx, { levelingBidderId: capital.levelingBidderId, basis: "reviewed" }, "Safi", at);
const mid = m.awards[0].id;
m = A.shareExhibit(m, mid, at);
m = A.generateSubcontract(A.agreeExhibit(m, mid, "Michael", "subcontractor", at), mid, "General contractor", "Safi", at);
const msub = m.awards[0].subcontract.content;
assert.deepEqual([m.awards[0].subcontract.template.id, msub.title, msub.sections[0].heading], ["mcn-subcontract", "Subcontract agreement · Demolition", "General contractor"]);
assert.deepEqual(section(msub, "3.1 Total Subcontract Price"), ["Contractor shall pay Subcontractor for the performance of the Work, subject to additions and deductions by change order, the sum of $507,960."]);
assert.equal(section(msub, "Exhibits")[0], "Exhibit A: Scope of Work (revision 1)");
assert.match(section(msub, "Terms")[0], /Articles 1 through 29 of the General contractor Subcontract Agreement apply in full/);

// Documents: plain text for download, and generators/templates are replaceable.
assert.equal(A.renderDocumentText({ title: "T", sections: [{ heading: "Scope", lines: ["a", "b"] }] }), "T\n\nSCOPE\n  a\n  b\n");
const customTemplate = { id: "acme-exhibit", name: "Acme Exhibit A", version: "2026", sample: false, notice: "" };
const custom = A.createAward(empty, ctx, { levelingBidderId: capital.levelingBidderId, basis: "base" }, "Safi", at, (snap, terms) => ({ title: `Custom ${snap.packageName}`, sections: [{ heading: "Amount", lines: [String(terms.amount)] }] }), customTemplate).awards[0];
assert.deepEqual([A.latestExhibit(custom).content.title, A.latestExhibit(custom).content.sections[0].lines, A.latestExhibit(custom).template.id], ["Custom Demolition", ["498000"], "acme-exhibit"]);

// ── The Jelleff sample is one coherent story for Concrete and Drywall: published form → bids → award → executed ──
{
  const { sampleSubmissions, sampleAwards } = await import("../lib/data/sample-award.ts");
  const { sampleBudget: jelleffBudget } = await import("../lib/data/budget.ts");
  const { initialBidders } = await import("../lib/data/commercial.ts");
  assert.deepEqual(sampleAwards.awards.map(a => [a.packageId, a.bidderId, A.awardStage(a), a.amount, a.basis, a.budgetLineId]),
    [["concrete", "b2", "executed", 1742000, "base", "nc-03000"], ["drywall", "b7", "executed", 1012400, "base", "nc-09200"]]);
  assert.equal(sampleAwards.awards[0].id, "s-3", "Concrete's ids did not move when drywall was added");
  for (const award of sampleAwards.awards) {
    const submission = sampleSubmissions.find(x => x.id === award.submissionId);
    const form = sampleProcurement.packages.find(p => p.id === award.packageId).published;
    assert(submission && submission.revisions.at(-1).formVersion === form.version && submission.revisions.at(-1).baseBid === award.amount, `${award.packageId}: the award is the submitted bid on the current form`);
    assert.deepEqual(award.snapshot.scope.map(i => i.id), form.items.map(i => i.id), `${award.packageId}: awarded scope = the published form`);
    assert(award.snapshot.scope.every(i => i.answer === "Y"), `${award.packageId}: awarded bid answered every item Y`);
    assert(jelleffBudget.lines.some(l => l.id === award.budgetLineId && l.classification === "direct"), `${award.packageId}: linked to its direct budget line`);
    assert(award.createdAt > submission.revisions.at(-1).submittedAt && award.subcontract.executedAt > award.exhibit.agreement.at, `${award.packageId}: in date order`);
  }
  // Drywall: three invited, two bids, one decline; the lower bid has open exceptions, so it is not awardable.
  const drywallInvites = sampleProcurement.invitations.filter(i => i.packageId === "drywall");
  assert.deepEqual(drywallInvites.map(i => [i.bidderId, i.status]), [["b7", "submitted"], ["b8", "submitted"], ["b9", "declined"]]);
  assert(drywallInvites.every(i => initialBidders.some(b => b.id === i.bidderId && b.trade === "Drywall")), "Invited from the directory's drywall companies");
  const rockCreek = sampleSubmissions.find(x => x.invitationId === "inv-7").revisions.at(-1);
  assert.deepEqual([rockCreek.baseBid, rockCreek.responses.filter(r => r.answer !== "Y").map(r => [r.scopeItemId, r.answer])], [968750, [["scope-12", "P"], ["scope-20", "N"]]], "The lower drywall bid excludes ceilings and offers a partial finish");
  assert(rockCreek.baseBid < sampleAwards.awards[1].amount, "The award is not simply the lowest price");
  for (const inv of sampleProcurement.invitations) {
    const bid = sampleSubmissions.some(x => x.invitationId === inv.id && x.revisions.length);
    assert.equal(inv.status === "submitted", bid, `${inv.id}: "submitted" only with a submitted bid`);
  }
  assert(sampleSubmissions.every(x => sampleProcurement.packages.find(p => p.id === x.packageId).published), "No bids on unpublished forms");
  assert.deepEqual(startingDraft("p2", "awards", sampleAwards), { awards: [], notifications: [] }, "Other projects start with no awards");
  assert.deepEqual(startingDraft("p2", "submissions", sampleSubmissions), [], "Other projects start with no bids");
  assert(!JSON.stringify([sampleAwards, sampleSubmissions, sampleProcurement]).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/), "Fixed ids, no random UUIDs");
}

console.log(`Award checked: candidates, explicit award and basis, snapshot, Exhibit A share/changes/revise/resolve/agree, subcontract generate/send/sign/countersign/execute, notifications, documents; Jelleff sample Concrete and Drywall coherent from bids to executed subcontracts.`);
