import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const V = await import("../lib/value-engineering.ts");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const at = "2026-09-30T15:00:00.000Z";
const fails = (fn, field, pattern) => assert.throws(fn, e => e instanceof V.VeRuleError && pattern.test(e.errors[field] ?? ""), `expected ${field} error ${pattern}`);
const [b1, b2] = initialBidders;

// Every project starts empty.
assert.deepEqual(startingDraft("p2", "value-engineering", V.EMPTY_VE), { target: { ownerBudget: null, reduction: null }, markupFactor: 1, lastNumber: 0, ideas: [], notifications: [] }, "A new project keeps markup factor 1, not an emptied 0");
assert.deepEqual(V.veSummary(V.EMPTY_VE, 1000).targetReduction, null);

// Target: owner budget → target = estimate − owner budget; a typed reduction wins.
let s = freeze(V.setVeTarget(V.EMPTY_VE, { ownerBudget: 28000000 }));
assert.equal(V.veSummary(s, 30000000).targetReduction, 2000000, "Marcel's example: $30M estimate, owner has $28M");
assert.equal(V.veSummary(s, null).targetReduction, null, "No estimate, no target from the owner budget");
assert.equal(V.veSummary(V.setVeTarget(s, { reduction: 1500000 }), 30000000).targetReduction, 1500000);
assert.equal(V.veSummary(V.setVeTarget(V.EMPTY_VE, { ownerBudget: 31000000 }), 30000000).targetReduction, 0, "Already under the owner budget");
fails(() => V.setVeTarget(s, { reduction: -5 }), "reduction", /positive/);
fails(() => V.setVeTarget(s, { ownerBudget: 0 }), "ownerBudget", /cannot be zero/);
fails(() => V.setMarkupFactor(s, 0.5), "markupFactor", /between 1 and 3/);
s = freeze(V.setMarkupFactor(s, 1.248));
assert.equal(V.weightedImpact(-132000, s.markupFactor), -164736, "Weighted impact = cost impact × markup factor");

// Ideas: validation, numbering that never reuses a removed number.
fails(() => V.addVeIdea(s, { description: " ", costImpact: 0 }, "Sadie", at), "description", /Describe/);
fails(() => V.addVeIdea(s, { description: "x", costImpact: 1.234 }, "Sadie", at), "costImpact", /two decimal/);
s = V.addVeIdea(s, { description: "Alternative roofing membrane", category: "Envelope", csiCode: "07 54 23", costImpact: -132000, source: "07 54 23 · §2.1" }, "Sadie", at);
s = V.addVeIdea(s, { description: "Reduce storefront height", costImpact: -80000, origin: "ai" }, "Sadie", at);
s = V.addVeIdea(s, { description: "Upgrade lobby finish", costImpact: 25000 }, "Sadie", at);
assert.deepEqual(s.ideas.map(i => [i.number, i.status, i.origin]), [["VE-01", "idea", "team"], ["VE-02", "idea", "ai"], ["VE-03", "idea", "team"]]);
const third = s.ideas[2].id;
s = freeze(V.addVeIdea(V.removeVeIdea(s, third), { description: "Simplify site paving", costImpact: -40000 }, "Sadie", at));
assert.deepEqual(s.ideas.map(i => i.number), ["VE-01", "VE-02", "VE-04"], "VE-03 is never reused");
const [roof, storefront, paving] = s.ideas.map(i => i.id);

// Pricing from subcontractors: recorded, each company once, quotes and declines.
fails(() => V.requestVePricing(s, roof, [], "Sadie", at), "bidders", /at least one/);
s = freeze(V.requestVePricing(s, roof, [b1, b2], "Sadie", at));
let r = s.ideas[0];
assert.deepEqual([r.status, r.pricing.map(p => [p.company, p.status]), s.notifications.map(n => n.recipient)], ["pricing", [[b1.company, "requested"], [b2.company, "requested"]], [b1.id, b2.id]]);
fails(() => V.requestVePricing(s, roof, [b1], "Sadie", at), "bidders", /already asked/);
fails(() => V.recordVeQuote(s, roof, "nope", { quotedImpact: -1 }, at), "quote", /no longer exists/);
s = freeze(V.recordVeQuote(s, roof, r.pricing[0].id, { quotedImpact: -120000, note: "Membrane B" }, at));
s = freeze(V.declineVePricing(s, roof, r.pricing[1].id, "Not our system", at));
r = s.ideas[0];
assert.deepEqual([r.status, r.pricing.map(p => p.status), V.bestKnownImpact(r)], ["priced", ["quoted", "declined"], -120000], "Best known = the quote, not the estimate");
assert.equal(V.bestKnownImpact(s.ideas[1]), -80000, "No quote: the estimate");

// Decisions: accept needs an explicit amount; decided ideas are locked; reopen restores.
fails(() => V.decideVeIdea(s, roof, "accepted", {}, "Marcel", at), "decision", /number/);
fails(() => V.decideVeIdea(s, roof, "maybe", {}, "Marcel", at), "decision", /Accept or reject/);
s = freeze(V.decideVeIdea(s, roof, "accepted", { acceptedImpact: -120000, note: "Owner approved" }, "Marcel", at));
s = freeze(V.decideVeIdea(s, storefront, "rejected", { note: "Architect declined" }, "Marcel", at));
fails(() => V.editVeIdea(s, roof, { costImpact: -1 }, at), "decision", /VE-01 is accepted; reopen it first/);
fails(() => V.requestVePricing(s, roof, [b2], "Sadie", at), "decision", /reopen/);
fails(() => V.removeVeIdea(s, roof), "decision", /accepted; reopen it before removing/);
assert.equal(V.removeVeIdea(s, storefront).ideas.length, 2, "A rejected idea can be removed");
assert.deepEqual([V.reopenVeIdea(s, roof, at).ideas[0].status, V.reopenVeIdea(s, storefront, at).ideas[1].status], ["priced", "idea"]);

// Summary: accepted and pending, weighted; gap and projected estimate.
const sum = V.veSummary(s, 30000000);
assert.deepEqual([sum.accepted, sum.acceptedWeighted, sum.pendingWeighted, sum.gap, sum.percentOfTarget, sum.projectedEstimate],
  [-120000, -149760, -49920, 1850240, 7.5, 29850240], "−120,000 × 1.248 = −149,760; paving −40,000 × 1.248 pending");
assert.deepEqual(sum.counts, { idea: 1, pricing: 0, priced: 0, accepted: 1, rejected: 1 });
const edited = V.editVeIdea(s, paving, { description: "  Simplify site paving and curbs ", costImpact: -45000 }, at).ideas[2];
assert.deepEqual([edited.description, edited.costImpact, edited.number], ["Simplify site paving and curbs", -45000, "VE-04"]);

console.log("Value engineering checked: target from owner budget or reduction, markups, idea numbering, pricing requests, quotes, decisions, locking, summary.");
