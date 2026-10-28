import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const Y = await import("../lib/buyout.ts");
const { deriveTodo } = await import("../lib/todo.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { sampleSubmissions, sampleAwards } = await import("../lib/data/sample-award.ts");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { sampleBudget } = await import("../lib/data/budget.ts");
const { sampleFiles } = await import("../lib/data/preconstruction.ts");
const { sampleProjectRecords } = await import("../lib/projects.ts");

const at = "2026-10-23T12:00:00.000Z";
const base = { procurement: sampleProcurement, submissions: sampleSubmissions, candidates: [], directory: initialBidders, budget: sampleBudget, awards: sampleAwards, buyout: Y.EMPTY_BUYOUT };
const row = (rows, id) => rows.find(r => r.packageId === id);
const rows = Y.buyoutRows(base);

// Every trade, in procurement order; status and ball in court follow the bids and the award.
assert.deepEqual(rows.map(r => r.packageId), sampleProcurement.packages.map(p => p.id));
assert.deepEqual(["demolition", "thermal", "concrete", "drywall"].map(id => [row(rows, id).status, row(rows, id).ballInCourt]),
  [["awaiting-bids", "subcontractor"], ["ready-for-review", "contractor"], ["executed", null], ["executed", null]]);
assert.deepEqual((({ low, award, budget, delta }) => [low.value, award, budget, delta])(row(rows, "thermal")), [508750, null, 1961479.38, Math.round((1961479.38 - 508750) * 100) / 100]);
assert.deepEqual((({ award, delta }) => [award.amount, delta])(row(rows, "drywall")), [1012400, Math.round((1065450.18 - 1012400) * 100) / 100], "After the award the delta is against the award");

// The Whittier tracker's columns: contract sent / executed, BIC as a name or "Closed", and the totals.
assert.deepEqual(["thermal", "drywall", "demolition"].map(id => (({ bic, contractSent, executed }) => [bic, contractSent, executed])(row(rows, id))),
  [["Our team", false, false], ["Closed", true, true], ["Bidders", false, false]]);
assert.deepEqual(Y.buyoutSummary(rows), { contracts: rows.filter(r => r.award).reduce((s, r) => s + r.award.amount, 0), awarded: 2, executed: 2, open: rows.length - 2 });

// Marcel's flow: scope review, minutes, held, best and final, then choose.
let s = Y.scheduleScopeReview(Y.EMPTY_BUYOUT, sampleProcurement, "thermal", { date: "2026-10-27", attendees: "Potomac Roof Systems" }, "Victor", at);
assert.deepEqual((({ status, next }) => [status, next])(row(Y.buyoutRows({ ...base, buyout: s }), "thermal")), ["review-scheduled", "Scope review 2026-10-27"]);
s = Y.addMinutes(s, sampleProcurement, "thermal", "Flashings at the curtain wall are included.", "Victor", at);
s = Y.markScopeReviewHeld(s, sampleProcurement, "thermal", "Victor", at);
assert.deepEqual((({ status, ballInCourt, bic }) => [status, ballInCourt, bic])(row(Y.buyoutRows({ ...base, buyout: s }), "thermal")), ["negotiating", "subcontractor", "Potomac Roof Systems (sample)"], "Waiting for best and final: the low bidder has the ball");
s = Y.recordBafo(s, sampleProcurement, "thermal", { bidderId: "demo-r2", company: "Potomac Roof Systems (sample)", amount: 505000 }, "Victor", at);
s = Y.recordBafo(s, sampleProcurement, "thermal", { bidderId: "demo-r2", company: "Potomac Roof Systems (sample)", amount: 501000, note: "Final" }, "Victor", at);
const roof = row(Y.buyoutRows({ ...base, buyout: s }), "thermal");
assert.deepEqual([roof.status, roof.ballInCourt, roof.next, roof.bestAndFinal.amount, roof.entry.bafos.length, roof.delta, roof.entry.scopeReview.minutes.map(m => m.text)],
  ["negotiating", "contractor", "Choose the subcontractor", 501000, 1, Math.round((1961479.38 - 501000) * 100) / 100, ["Flashings at the curtain wall are included."]], "A newer offer replaces the company's earlier one");
s = Y.setBuyoutPlan(s, sampleProcurement, "thermal", { recommended: "Potomac Roof Systems (sample)", targets: ["District Roofing (sample)", "District Roofing (sample)", " "], anticipatedAward: "2026-10-30", notes: " Award after BAFO. ", welcomeSent: true }, "Victor", at);
assert.deepEqual((({ recommended, targets, anticipatedAward, notes, welcomeSent }) => [recommended, targets, anticipatedAward, notes, welcomeSent])(s.entries.find(e => e.packageId === "thermal")), ["Potomac Roof Systems (sample)", ["District Roofing (sample)"], "2026-10-30", "Award after BAFO.", true]);

// Rules, in words for the person.
const fails = (fn, re) => assert.throws(fn, e => e instanceof Y.BuyoutRuleError && re.test(e.message));
fails(() => Y.addMinutes(Y.EMPTY_BUYOUT, sampleProcurement, "openings", "x", "S", at), /Schedule the scope review first/);
fails(() => Y.markScopeReviewHeld(Y.EMPTY_BUYOUT, sampleProcurement, "openings", "S", at), /Schedule the scope review first/);
fails(() => Y.scheduleScopeReview(Y.EMPTY_BUYOUT, sampleProcurement, "openings", { date: "next week" }, "S", at), /scope review date/);
fails(() => Y.scheduleScopeReview(Y.EMPTY_BUYOUT, sampleProcurement, "nope", { date: "2026-10-27" }, "S", at), /trade package/);
fails(() => Y.recordBafo(Y.EMPTY_BUYOUT, sampleProcurement, "openings", { company: "X", amount: 10.005 }, "S", at), /dollars and cents/);
fails(() => Y.recordBafo(Y.EMPTY_BUYOUT, sampleProcurement, "openings", { company: " ", amount: 10 }, "S", at), /Name the company/);
fails(() => Y.setBuyoutPlan(Y.EMPTY_BUYOUT, sampleProcurement, "openings", { dropDeadAward: "soon" }, "S", at), /drop-dead/);

// Step 7 of the to-do follows the buyout.
const todo = (buyout) => deriveTodo({ project: sampleProjectRecords[0], documents: sampleFiles, procurement: sampleProcurement, submissions: sampleSubmissions, leveling: null, budget: sampleBudget, awards: sampleAwards, buyout })
  .tasks.filter(t => t.group === "scope-review").map(t => [t.id, t.status, t.screen]);
const scheduled = Y.scheduleScopeReview(Y.EMPTY_BUYOUT, sampleProcurement, "thermal", { date: "2026-10-27" }, "Victor", at);
assert.deepEqual(todo(scheduled), [["buyout:review:thermal", "todo", "buyout"]]);
assert.deepEqual(todo(Y.markScopeReviewHeld(scheduled, sampleProcurement, "thermal", "Victor", at)), [["buyout:bafo:thermal", "waiting", "buyout"]]);
assert.deepEqual(todo(s), [["award:select:thermal", "todo", "contracts"]], "With a best and final in, choose the subcontractor");

// The best and final pulled from the subcontractor's revised proposal (Marcel, 24 Oct), not typed.
{
  const revision = (number, baseBid, submittedAt) => ({ number, baseBid, submittedAt, formVersion: 1, submitter: { name: "Pat Roofer", email: "pat@example.com" }, responses: [], exclusions: [], alternates: [], clarifications: [], attachments: [] });
  const sub = (id, bidderId, revisions) => ({ id, projectId: "jelleff", packageId: "thermal", invitationId: `inv-${id}`, bidderId, status: revisions.length > 1 ? "revised" : "submitted", draft: revisions.at(-1), revisions, updatedAt: at });
  const directory = [{ id: "roof-a", company: "Alpha Roofing" }, { id: "roof-b", company: "Beta Roofing" }];
  const subs = [sub("s1", "roof-a", [revision(1, 500000, "2026-10-20T00:00:00Z"), revision(2, 470000, "2026-10-25T00:00:00Z")]), sub("s2", "roof-b", [revision(1, 480000, "2026-10-20T00:00:00Z")])];
  const held = { date: "2026-10-24", attendees: "", held: { at: "2026-10-24T15:00:00Z", by: "Victor" }, minutes: [] };
  const pulled = Y.proposalBafos(subs, "thermal", held, directory);
  assert.deepEqual(pulled.map(b => [b.company, b.amount, b.revision, b.source]), [["Alpha Roofing", 470000, 2, "proposal"]], "V2 after the scope review is Alpha's best and final; Beta never resubmitted");
  assert.deepEqual(Y.proposalBafos(subs, "thermal", { ...held, held: { at: "2026-10-26T00:00:00Z", by: "Victor" } }, directory), [], "A revision sent before the review was held is not the best and final");
  assert.equal(Y.proposalBafos(subs, "thermal", null, directory).length, 1, "Without a held review, any resubmission counts");
  const typed = [{ id: "t1", bidderId: null, company: "Beta Roofing", amount: 465000, note: "By email", receivedAt: "2026-10-26T00:00:00Z", by: "Victor", source: "typed" }, { id: "t0", bidderId: "roof-a", company: "Alpha Roofing", amount: 490000, note: "Phone", receivedAt: "2026-10-24T16:00:00Z", by: "Victor" }];
  assert.deepEqual(Y.currentBafos(typed, pulled).map(b => [b.company, b.amount]), [["Beta Roofing", 465000], ["Alpha Roofing", 470000]], "Each company's latest best and final, lowest first: Alpha's V2 replaces its earlier phone number");
}

console.log("Buyout checked: rows per trade, status and ball in court from bids and awards, scope review, minutes, best and final (typed or from a revised proposal), plan, rules, and the to-do's scope review step.");
