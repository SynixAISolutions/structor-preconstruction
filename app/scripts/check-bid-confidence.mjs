import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const { bidConfidence, DEFAULT_BANDS } = await import("../lib/bid-confidence.ts");

const row = (packageId, name, estimate, budget, estimateUnreviewed = 0) => ({ packageId, name, owner: "", estimate, estimateLines: estimate ? 3 : 0, estimateUnreviewed, bid: null, budget, forecast: null, budgetBasis: "budget", bidOverEstimate: null, budgetOverEstimate: null });
const cand = (packageId, reviewedTotal, extra = {}) => ({ levelingBidderId: `${packageId}-${reviewedTotal}`, bidderName: "", packageId, bidderId: null, submissionId: null, revisionNumber: 1, formVersion: 1, stale: false, eligible: true, eligibilityReasons: [], baseBid: reviewedTotal, provisionalTotal: reviewedTotal, reviewedTotal, ...extra });
const rows = [
  row("drywall", "Drywall", 1_200_000, 1_300_000),
  row("doors", "Doors", 400_000, 380_000),
  row("flooring", "Flooring", 500_000, 520_000, 2),
  row("roofing", "Roofing", null, 900_000),
  row("specialties", "Specialties", null, null),
];
const candidates = [
  cand("drywall", 1_000_000), cand("drywall", 1_180_000), cand("drywall", 1_250_000),
  cand("drywall", 1_100_000, { stale: true }),
  cand("doors", 410_000),
  cand("doors", 395_000, { reviewedTotal: null, provisionalTotal: 395_000 }),
];
const c = bidConfidence(rows, candidates);
const t = Object.fromEntries(c.trades.map(x => [x.packageId, x]));
// Drywall: lowest 1.0M is 15% under the next (1.18M) and 17% under the estimate: range 1.0M–1.2M.
assert.deepEqual([t.drywall.carried, t.drywall.low, t.drywall.high, t.drywall.basis], [1_000_000, 1_000_000, 1_200_000, "bid"]);
assert.deepEqual(t.drywall.reasons, ["The lowest bid is 15% under the next one; it may be missing scope.", "The bid is 17% under the in-house estimate.", "1 bid was priced on an older bid form."]);
// Doors: one reviewed bid, so the estimate bounds it; the other bid still has gaps.
assert.deepEqual([t.doors.carried, t.doors.low, t.doors.high], [410_000, 400_000, 410_000]);
assert.deepEqual(t.doors.reasons, ["Only one reviewed bid.", "The bid is 3% over the in-house estimate.", "1 bid has unresolved scope gaps."]);
// Flooring: no bid, estimate ±15%; Roofing: budget only ±10%; Specialties: no number at all.
assert.deepEqual([t.flooring.low, t.flooring.high, t.flooring.basis], [425_000, 575_000, "estimate"]);
assert.match(t.flooring.reasons[1], /2 estimate lines are not reviewed/);
assert.deepEqual([t.roofing.low, t.roofing.high, t.roofing.basis], [810_000, 990_000, "budget"]);
assert.deepEqual(c.withoutNumber, ["Specialties"]);
assert.deepEqual([c.total, c.low, c.high], [2_810_000, 2_635_000, 3_175_000]);
assert.deepEqual(c.drivers.map(d => d.packageId), ["drywall", "roofing", "flooring", "doors"], "Biggest spread first");
// The assumed bands are parameters.
const tight = bidConfidence(rows, candidates, { ...DEFAULT_BANDS, budgetBand: 0, estimateBand: 0 });
assert.deepEqual([tight.trades.find(x => x.packageId === "roofing").high, tight.trades.find(x => x.packageId === "flooring").high], [900_000, 500_000]);
assert.deepEqual(bidConfidence([], []), { total: 0, low: 0, high: 0, trades: [], drivers: [], withoutNumber: [] });

console.log("Bid confidence checked: lowest reviewed bid with spread and estimate bounds, single bids, estimate and budget bands, stale and unresolved bids named, drivers by spread.");
