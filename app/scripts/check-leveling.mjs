import assert from "node:assert/strict";
import { bidderTotals, rankedBidders, responseNeedsReview } from "../lib/leveling.mjs";

const requiredItems = [
  { id: "scope-1", required: true },
  { id: "scope-2", required: true },
];
const included = (adjustment = 0, adjustmentApproved = false) => ({
  status: "Y",
  adjustment,
  adjustmentApproved,
});

const unresolved = {
  id: "unresolved",
  baseBid: 100_000,
  responses: {
    "scope-1": included(),
    "scope-2": { status: "N", adjustment: 5_000 },
  },
};
const complete = {
  id: "complete",
  baseBid: 110_000,
  responses: {
    "scope-1": included(),
    "scope-2": included(),
  },
};

const unresolvedTotals = bidderTotals(unresolved, requiredItems);
assert.equal(unresolvedTotals.provisionalTotal, 107_100);
assert.equal(unresolvedTotals.coverageGaps, 1);
assert.equal(unresolvedTotals.unapprovedAdjustments, 1);
assert.equal(unresolvedTotals.exceptions, 1);
assert.equal(unresolvedTotals.eligible, false);
assert.equal(unresolvedTotals.reviewedTotal, null);
assert.deepEqual(unresolvedTotals.eligibilityReasons, ["open-scope-review"]);
assert.equal(responseNeedsReview(requiredItems[1], unresolved.responses["scope-2"]), true);
assert.deepEqual(rankedBidders([unresolved, complete], requiredItems).map(({ bidder, rank }) => [bidder.id, rank]), [
  ["complete", 1],
]);

const missingPrice = bidderTotals({ baseBid: null, responses: complete.responses }, requiredItems);
const invalidPrice = bidderTotals({ baseBid: "not a price", responses: complete.responses }, requiredItems);
const pendingZero = bidderTotals({ baseBid: 0, responses: complete.responses }, requiredItems);
const approvedZero = bidderTotals({ baseBid: 0, zeroPriceApproved: true, responses: complete.responses }, requiredItems);
assert.equal(missingPrice.priceState, "missing");
assert.equal(missingPrice.provisionalTotal, null);
assert.equal(missingPrice.total, null);
assert.equal(invalidPrice.priceState, "invalid");
assert.equal(invalidPrice.provisionalTotal, null);
assert.equal(invalidPrice.total, null);
assert.equal(pendingZero.priceState, "zero");
assert.equal(pendingZero.eligible, false);
assert.equal(approvedZero.eligible, true);
assert.equal(approvedZero.reviewedTotal, 0);

const unknown = bidderTotals({
  baseBid: 10,
  responses: { "scope-1": included(), "scope-2": { status: "", adjustment: 0, resolved: true } },
}, requiredItems);
assert.equal(unknown.unknownRequired, 1);
assert.equal(unknown.exceptions, 1);
assert.equal(unknown.eligible, false);

const justifiedNA = bidderTotals({
  baseBid: 10,
  responses: { "scope-1": included(), "scope-2": { status: "N/A", note: "Not applicable", resolved: true } },
}, requiredItems);
const unjustifiedNA = bidderTotals({
  baseBid: 10,
  responses: { "scope-1": included(), "scope-2": { status: "N/A", resolved: true } },
}, requiredItems);
assert.equal(justifiedNA.eligible, true);
assert.equal(unjustifiedNA.eligible, false);

const resolvedPartial = {
  id: "partial",
  baseBid: 100,
  responses: {
    "scope-1": included(),
    "scope-2": { status: "P", resolved: true, adjustment: 10, adjustmentApproved: true },
  },
};
const partialTotals = bidderTotals(resolvedPartial, requiredItems);
assert.equal(partialTotals.coverageGaps, 1);
assert.equal(partialTotals.exceptions, 0);
assert.equal(partialTotals.eligible, true);
assert.equal(resolvedPartial.responses["scope-2"].status, "P");

assert.equal(bidderTotals({ ...complete, bondRate: 0 }, requiredItems).bond, 0);
assert.equal(bidderTotals({ ...complete, bondRate: 0.03 }, requiredItems).bond, 3_300);
assert.equal(bidderTotals({ ...complete, bondRate: Number.NaN }, requiredItems).eligible, false);
assert.equal(bidderTotals({ ...complete, bondRate: -0.01 }, requiredItems).eligible, false);
assert.equal(bidderTotals({ ...complete, baseBid: -1 }, requiredItems).eligible, false);
assert.equal(bidderTotals({ ...complete, sourceEligibility: "NO" }, requiredItems).eligible, false);
assert.equal(bidderTotals({ ...complete, sourceEligibility: "FULL SCOPE" }, requiredItems).eligible, true);
const unknownSource = bidderTotals({ ...complete, sourceEligibility: "PARTIAL SCOPE" }, requiredItems);
assert.equal(unknownSource.sourceEligibility, "invalid");
assert.equal(unknownSource.eligible, false);

const optionalAndExcluded = bidderTotals({
  baseBid: 100,
  responses: {
    required: included(),
    optional: { status: "", adjustment: 5, adjustmentApproved: true },
    unit: { status: "", adjustment: 999 },
  },
}, [
  { id: "required", required: true },
  { id: "optional", required: false },
  { id: "unit", required: false, includeInTotal: false },
]);
assert.equal(optionalAndExcluded.adjustment, 5);
assert.equal(optionalAndExcluded.exceptions, 0);

const tied = rankedBidders([
  { ...complete, id: "first", baseBid: 100 },
  { ...complete, id: "second", baseBid: 100 },
  { ...complete, id: "third", baseBid: 200 },
], requiredItems);
assert.deepEqual(tied.map(({ bidder, rank }) => [bidder.id, rank]), [
  ["first", 1],
  ["second", 1],
  ["third", 3],
]);
assert.deepEqual(rankedBidders([{ id: "missing", baseBid: null, responses: complete.responses }], requiredItems), []);

for (const total of [unresolvedTotals, missingPrice, invalidPrice, pendingZero, approvedZero]) {
  for (const value of [total.adjustment, total.subtotal, total.bond, total.total]) {
    assert.ok(value == null || Number.isFinite(value));
  }
}

const negativeSubtotal = bidderTotals({
  baseBid: 5,
  responses: {
    "scope-1": included(-10, true),
    "scope-2": included(),
  },
}, requiredItems);
assert.equal(negativeSubtotal.provisionalTotal, null);
assert.equal(negativeSubtotal.eligible, false);
assert.ok(negativeSubtotal.eligibilityReasons.includes("negative-subtotal"));

assert.equal(bidderTotals({
  baseBid: 100,
  responses: { "scope-1": included(), "scope-2": { status: "Y", adjustment: Number.POSITIVE_INFINITY } },
}, requiredItems).eligible, false);

const fractionalCent = bidderTotals({
  baseBid: 100,
  responses: { "scope-1": included(), "scope-2": included(0.004, true) },
}, requiredItems);
assert.equal(fractionalCent.provisionalTotal, null);
assert.equal(fractionalCent.eligible, false);

const roundedBond = bidderTotals({ ...complete, baseBid: 100.25, bondRate: 0.02 }, requiredItems);
assert.equal(roundedBond.bond, 2.01);
assert.equal(roundedBond.total, 102.26);

const nearLimit = Number.MAX_SAFE_INTEGER / 100;
const overflow = bidderTotals({
  baseBid: 1,
  responses: { "scope-1": included(nearLimit, true), "scope-2": included(nearLimit, true) },
}, requiredItems);
assert.equal(overflow.provisionalTotal, null);
assert.equal(overflow.eligible, false);

console.log("leveling check passed");
