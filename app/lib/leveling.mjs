// Jelleff Demo fallback only; imported/configured trade policy should override it.
export const DEFAULT_BOND_RATE = 0.02;

const ELIGIBLE_SOURCE_VALUES = new Set(["FULL SCOPE", "YES", "Y", "ELIGIBLE"]);
const INELIGIBLE_SOURCE_VALUES = new Set([
  "NO",
  "INCOMPLETE",
  "NOT LEVEL",
  "NOT LEVELED",
  "UNLEVELED",
  "UNLEVELLED",
]);

function cents(value, blankIsZero = false) {
  if (value == null || value === "") return blankIsZero ? 0 : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 1e-7 ? rounded : null;
}

function money(value) {
  return value == null ? null : value / 100;
}

function sourceEligibility(value) {
  if (value === true) return "eligible";
  if (value === false) return "ineligible";
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "unspecified";
  if (ELIGIBLE_SOURCE_VALUES.has(normalized)) return "eligible";
  if (INELIGIBLE_SOURCE_VALUES.has(normalized)) return "ineligible";
  return "invalid";
}

function bondRateFor(bidder, fallback) {
  const configured = bidder.bondRate == null || bidder.bondRate === "" ? fallback : bidder.bondRate;
  return typeof configured === "number" && Number.isFinite(configured) && configured >= 0
    ? configured
    : null;
}

function reviewResponse(item, response = {}) {
  const required = item.required === true;
  const includedInTotal = item.includeInTotal !== false;
  const status = String(response.status ?? "").trim().toUpperCase();
  const unknown = required && !["Y", "N", "P", "N/A"].includes(status);
  const coverageGap = required && (status === "N" || status === "P");
  const justifiedNA = status === "N/A"
    && response.resolved === true
    && String(response.note ?? "").trim() !== "";
  const coverageResolved = !required
    || status === "Y"
    || ((status === "N" || status === "P") && response.resolved === true)
    || justifiedNA;
  const adjustmentCents = includedInTotal ? cents(response.adjustment, true) : 0;
  const invalidAdjustment = adjustmentCents == null;
  const unapprovedAdjustment = adjustmentCents != null
    && adjustmentCents !== 0
    && response.adjustmentApproved !== true;

  return {
    adjustmentCents,
    coverageGap,
    invalidAdjustment,
    open: !coverageResolved || invalidAdjustment || unapprovedAdjustment,
    unknown,
    unapprovedAdjustment,
  };
}

/** Shared predicate for exception filters, counters, and ranking eligibility. */
export function responseNeedsReview(item, response = {}) {
  return reviewResponse(item, response).open;
}

/**
 * Calculates provisional money and review eligibility. Compatibility fields
 * (`adjustment`, `subtotal`, `bond`, `total`, `exceptions`) remain available;
 * `total` is provisional and only `reviewedTotal` may be ranked.
 *
 * New inputs: `bidder.zeroPriceApproved`, `bidder.bondRate`,
 * `bidder.sourceEligibility`, `response.resolved`,
 * `response.adjustmentApproved`, and `item.includeInTotal === false`.
 */
export function bidderTotals(bidder, items, fallbackBondRate = DEFAULT_BOND_RATE) {
  const baseBidCents = cents(bidder.baseBid);
  const priceState = baseBidCents == null
    ? (bidder.baseBid == null || bidder.baseBid === "" ? "missing" : "invalid")
    : baseBidCents < 0
      ? "invalid"
      : baseBidCents === 0
        ? "zero"
        : "present";
  const validBaseBidCents = priceState === "invalid" ? null : baseBidCents;
  const responses = bidder.responses ?? {};
  const reviews = items.map((item) => reviewResponse(item, responses[item.id]));
  const invalidAdjustments = reviews.filter((review) => review.invalidAdjustment).length;
  const adjustmentSum = reviews.reduce((sum, review) => sum + (review.adjustmentCents ?? 0), 0);
  const adjustmentCents = invalidAdjustments || !Number.isSafeInteger(adjustmentSum) ? null : adjustmentSum;
  const subtotalSum = validBaseBidCents == null || adjustmentCents == null
    ? null
    : validBaseBidCents + adjustmentCents;
  const subtotalCents = Number.isSafeInteger(subtotalSum) ? subtotalSum : null;
  const bondRate = bondRateFor(bidder, fallbackBondRate);
  const bondAmount = subtotalCents == null || bondRate == null || subtotalCents < 0
    ? null
    : Math.round(subtotalCents * bondRate);
  const bondCents = Number.isSafeInteger(bondAmount) ? bondAmount : null;
  const veCents = cents(bidder.acceptedVeAdjustment, true);
  const totalAmount = subtotalCents == null || bondCents == null || veCents == null ? null : subtotalCents + bondCents + veCents;
  const totalCents = Number.isSafeInteger(totalAmount) ? totalAmount : null;
  const sourceEligibilityState = sourceEligibility(bidder.sourceEligibility);
  const exceptions = items.filter((item) => responseNeedsReview(item, responses[item.id])).length;
  const eligibilityReasons = [];
  if (veCents == null || totalAmount != null && totalAmount < 0) eligibilityReasons.push("invalid-ve-adjustment");

  if (priceState === "missing") eligibilityReasons.push("missing-price");
  if (priceState === "invalid") eligibilityReasons.push("invalid-price");
  if (priceState === "zero" && bidder.zeroPriceApproved !== true) eligibilityReasons.push("zero-price-unapproved");
  if (bondRate == null) eligibilityReasons.push("invalid-bond-rate");
  if (invalidAdjustments) eligibilityReasons.push("invalid-adjustment");
  if (subtotalSum != null && subtotalSum < 0) eligibilityReasons.push("negative-subtotal");
  if (adjustmentCents == null && !invalidAdjustments) eligibilityReasons.push("invalid-adjustment-total");
  if (subtotalSum != null && subtotalCents == null) eligibilityReasons.push("invalid-subtotal");
  if (bondRate != null && subtotalCents != null && subtotalCents >= 0 && bondCents == null) eligibilityReasons.push("invalid-bond");
  if (totalAmount != null && totalCents == null) eligibilityReasons.push("invalid-total");
  if (exceptions) eligibilityReasons.push("open-scope-review");
  if (sourceEligibilityState === "ineligible") eligibilityReasons.push("source-ineligible");
  if (sourceEligibilityState === "invalid") eligibilityReasons.push("invalid-source-eligibility");

  const eligible = eligibilityReasons.length === 0 && totalCents != null;
  const provisionalAdjustment = money(adjustmentCents);
  const provisionalSubtotal = money(subtotalCents);
  const provisionalBond = money(bondCents);
  const provisionalTotal = money(totalCents);

  return {
    adjustment: provisionalAdjustment,
    acceptedVeAdjustment: money(veCents),
    subtotal: provisionalSubtotal,
    bond: provisionalBond,
    total: provisionalTotal,
    exceptions,
    provisionalAdjustment,
    provisionalSubtotal,
    provisionalBond,
    provisionalTotal,
    reviewedTotal: eligible ? provisionalTotal : null,
    priceState,
    bondRate,
    sourceEligibility: sourceEligibilityState,
    coverageGaps: reviews.filter((review) => review.coverageGap).length,
    unknownRequired: reviews.filter((review) => review.unknown).length,
    unapprovedAdjustments: reviews.filter((review) => review.unapprovedAdjustment).length,
    invalidAdjustments,
    scopeReviewComplete: exceptions === 0,
    eligible,
    eligibilityReasons,
  };
}

/** Returns only eligible bidders, ordered by reviewed total with 1, 1, 3 ties. */
export function rankedBidders(bidders, items, fallbackBondRate = DEFAULT_BOND_RATE) {
  const eligible = bidders
    .map((bidder, inputIndex) => ({
      bidder,
      inputIndex,
      ...bidderTotals(bidder, items, fallbackBondRate),
    }))
    .filter((entry) => entry.eligible && entry.reviewedTotal != null)
    .sort((left, right) => left.reviewedTotal - right.reviewedTotal || left.inputIndex - right.inputIndex);

  let previousTotal = null;
  let previousRank = 0;
  return eligible.map(({ inputIndex: _inputIndex, ...entry }, index) => {
    const rank = previousTotal === entry.reviewedTotal ? previousRank : index + 1;
    previousTotal = entry.reviewedTotal;
    previousRank = rank;
    return { ...entry, rank };
  });
}
