// A rough in-house estimate for one trade, drafted by AI (15 Oct, Danial: "when you upload the project,
// the AI would be able to bring up this estimate on its own; it should give you a rough estimate").
//
// The AI only proposes what to price, how much, and which rate fits; the arithmetic is done here, to
// the cent. A rate must come from a reference the app already holds (an estimate line with a rate, or
// the historical cost per SF of the trade's division), or it is marked an assumption. Every quantity
// states its basis. Lines land unreviewed in the trade's estimate (lib/estimate addAiEstimateLines).

import type { TakeoffRow } from "./data/preconstruction";
import type { ConceptBudget } from "./historical-budget";

export type EstimateRef = { id: string; item: string; unit: string; rate: number; source: string };
export type EstimateDraftInput = {
  trade: { id: string; name: string; code: string };
  project: { name: string; type: string; location: string; squareFeet: number; workType: string; stage: string };
  scope: string[];
  quantities: { item: string; quantity: number; unit: string; basis: string }[];
  sheets: { sheet: string; title: string; text: string }[];
  references: EstimateRef[];
};
export type EstimateDraftLine = { item: string; quantity: number; unit: string; rate: number; amount: number; quantityBasis: string; rateSource: string; rateNote: string; flags: string[] };

export const ESTIMATE_UNITS = ["SF", "LF", "EA", "CY", "SY", "TON", "LB", "HR", "LS"] as const;
const cents = (n: number) => Math.round(n * 100);

/**
 * Rates the app already holds for this trade: its own estimate lines with a rate (then other trades'
 * lines in the same division), and the historical cost per SF of its division's concept-budget lines.
 */
export function estimateReferences(rows: TakeoffRow[], trade: { id: string; code: string }, concept: ConceptBudget | null, max = 24): EstimateRef[] {
  const division = trade.code.slice(0, 2);
  const priced = rows.filter(r => r.rate > 0 && r.quantity > 0);
  const own = priced.filter(r => r.packageId === trade.id);
  const sameDivision = priced.filter(r => r.packageId !== trade.id && r.division.startsWith(division));
  const fromRows = [...own, ...sameDivision].map(r => ({ id: r.id, item: r.item, unit: r.unit, rate: r.rate, source: r.source || "Estimate line" }));
  const fromConcept = (concept?.lines ?? []).filter(l => l.csiCode?.replace(/\D/g, "").startsWith(division) && l.unitCost > 0)
    .map(l => ({ id: `concept:${l.csiCode}:${l.description}`.slice(0, 120), item: l.description, unit: "SF", rate: Math.round(l.unitCost * 100) / 100, source: `Historical cost per SF, ${l.observations} project${l.observations === 1 ? "" : "s"}` }));
  return [...fromRows, ...fromConcept].slice(0, max);
}

/**
 * The AI's proposed lines, screened: known units, sane numbers, one line per item, the rate taken from
 * the cited reference (same unit) or marked an assumption, amounts to the cent. With nothing usable
 * and a historical cost per SF for the division, one area-based allowance is offered instead.
 */
export function screenEstimateLines(output: unknown, input: EstimateDraftInput): EstimateDraftLine[] {
  const raw = Array.isArray((output as { lines?: unknown })?.lines) ? (output as { lines: unknown[] }).lines : [];
  const seen = new Set<string>();
  const lines = raw.slice(0, 30).flatMap((value): EstimateDraftLine[] => {
    const o = (value ?? {}) as Record<string, unknown>;
    const item = typeof o.item === "string" ? o.item.trim().slice(0, 200) : "";
    const unit = typeof o.unit === "string" ? o.unit.trim().toUpperCase() : "";
    const quantity = Number(o.quantity), proposed = Number(o.rate);
    if (!item || seen.has(item.toLowerCase()) || !(ESTIMATE_UNITS as readonly string[]).includes(unit)) return [];
    if (!(Number.isFinite(quantity) && quantity > 0 && quantity <= 1e7) || !(Number.isFinite(proposed) && proposed >= 0 && proposed <= 1e6)) return [];
    const basis = typeof o.quantityBasis === "string" ? o.quantityBasis.trim().slice(0, 300) : "";
    const ref = input.references.find(r => r.id === o.rateSource);
    const flags: string[] = [];
    let rate = proposed, rateSource = "assumption", rateNote = "AI assumption: check against current pricing.";
    if (ref && ref.unit.toUpperCase() === unit) {
      if (Math.abs(ref.rate - proposed) > Math.max(0.01, ref.rate * 0.01)) flags.push("Rate set to the cited reference");
      rate = ref.rate; rateSource = ref.id; rateNote = `${ref.item}: ${ref.source}`;
    } else {
      if (ref) flags.push("Cited reference uses another unit");
      flags.push("Assumed rate");
    }
    if (basis.length < 8) flags.push("No quantity basis");
    const amount = cents(quantity * rate) / 100;
    if (!Number.isSafeInteger(cents(quantity * rate)) || amount > 1e9) return [];
    seen.add(item.toLowerCase());
    return [{ item, quantity, unit, rate, amount, quantityBasis: basis, rateSource, rateNote, flags }];
  });
  if (lines.length) return lines.slice(0, 25);
  const perSf = input.references.find(r => r.id.startsWith("concept:") && r.unit === "SF");
  if (!perSf || !(input.project.squareFeet > 0)) return [];
  const amount = cents(input.project.squareFeet * perSf.rate) / 100;
  return [{ item: `${input.trade.name}: area-based allowance`, quantity: input.project.squareFeet, unit: "SF", rate: perSf.rate, amount, quantityBasis: `Building area ${input.project.squareFeet.toLocaleString("en-US")} SF`, rateSource: perSf.id, rateNote: `${perSf.item}: ${perSf.source}`, flags: ["Area-based allowance"] }];
}
