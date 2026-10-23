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

/** What a gap can be plugged from: a priced estimate item, or a takeoff quantity with no rate yet (rate 0). */
export type GapReference = CostBasis & { id: string; item: string };

/**
 * Marcel (22 Oct, Budget summary): when a sub answers "no", Structor offers the quantity from the trade's
 * Quantity takeoffs and asks for the unit price. Every takeoff line of the trade with a quantity is
 * offered, priced or not; the source says when a line is not reviewed yet.
 */
export function takeoffReferences(rows: { id: string; item: string; unit: string; quantity: number; rate: number; source: string; reviewed: boolean; packageId?: string }[], packageId: string): GapReference[] {
  return rows.filter(r => r.packageId === packageId && r.quantity > 0 && r.item.trim() && r.unit.trim()).slice(0, 100).map(r => ({
    id: r.id, item: r.item.trim(), quantity: r.quantity, rate: r.rate > 0 ? r.rate : 0, unit: r.unit.trim(),
    source: `Quantity takeoff${r.reviewed ? "" : " (not reviewed)"}${r.source.trim() ? ` · ${r.source.trim()}` : ""}`,
  }));
}
