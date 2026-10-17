export type GapResponse = { status: string; note: string; adjustment: number; resolved?: boolean; adjustmentApproved?: boolean };
export type CostBasis = { quantity: number; rate: number; unit: string; source: string };

export function gapCostAmount(basis: CostBasis): number {
  if (!Number.isFinite(basis.quantity) || basis.quantity <= 0 || !Number.isFinite(basis.rate) || basis.rate < 0 || !basis.unit.trim() || !basis.source.trim()) throw new Error("Enter a positive quantity, a nonnegative rate, the unit and the supporting cost basis.");
  const amount = Math.round(basis.quantity * basis.rate * 100);
  if (!Number.isSafeInteger(amount) || amount > 1e14) throw new Error("The adjustment is too large.");
  return amount / 100;
}

/** Replaces this cell's adjustment; only an explicit coverage decision resolves the scope gap. */
export function approveGapCost<T extends GapResponse>(response: T, basis: CostBasis, reviewed: boolean, coversScope = false): T {
  if (!["N", "P"].includes(response.status)) throw new Error("Choose an excluded or partial response.");
  if (!reviewed) throw new Error("Review the quantity, rate and basis before applying the adjustment.");
  const adjustment = gapCostAmount(basis);
  const previous = response.note.replace(/\n?Cost basis: [^\n]*/g, "").trim();
  return { ...response, adjustment, adjustmentApproved: true, resolved: coversScope,
    note: `${previous}${previous ? "\n" : ""}Cost basis: ${basis.quantity} ${basis.unit.trim()} × $${basis.rate} = $${adjustment.toFixed(2)}. ${basis.source.trim().replace(/[\r\n]+/g, " ")}` };
}
