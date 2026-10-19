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
  /** What the trade's estimate already holds, so the draft prices only what's missing (missing on older callers). */
  existing?: { item: string; quantity: number; unit: string; rate: number }[];
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
  // A row's source is where its quantity came from (often a sheet), not its price: say whose rate it is.
  const fromRows = [...own, ...sameDivision].map(r => ({ id: r.id, item: r.item, unit: r.unit, rate: r.rate, source: `rate from this project's estimate line${r.source ? ` (line source: ${r.source.slice(0, 120)})` : ""}` }));
  const fromConcept = (concept?.lines ?? []).filter(l => l.csiCode?.replace(/\D/g, "").startsWith(division) && l.unitCost > 0)
    .map(l => ({ id: `concept:${l.csiCode}:${l.description}`.slice(0, 120), item: l.description, unit: "SF", rate: Math.round(l.unitCost * 100) / 100, source: `Historical cost per SF, ${l.observations} project${l.observations === 1 ? "" : "s"}` }));
  return [...fromRows, ...fromConcept].slice(0, max);
}

/**
 * The value of an arithmetic expression (numbers, + - * / and parentheses only), or null. The AI
 * states each quantity's formula and the app does the arithmetic: a model's own multiplication
 * is not to be trusted to the cent.
 */
export function evalArithmetic(expr: string): number | null {
  const src = expr.replace(/,(?=\d{3}\b)/g, "").replace(/[×x]/g, "*").replace(/÷/g, "/");
  if (!/^[\d.+\-*/()\s]+$/.test(src) || src.length > 200) return null;
  const tokens = src.match(/\d+(?:\.\d+)?|[+\-*/()]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): number => {
    const tok = tokens[i++];
    if (tok === "-") return -factor();
    if (tok === "(") { const v = sum(); if (tokens[i++] !== ")") throw new Error(); return v; }
    if (tok === undefined || !/^\d/.test(tok)) throw new Error();
    return Number(tok);
  };
  const product = (): number => { let v = factor(); while (peek() === "*" || peek() === "/") { const op = tokens[i++], r = factor(); v = op === "*" ? v * r : v / r; } return v; };
  const sum = (): number => { let v = product(); while (peek() === "+" || peek() === "-") { const op = tokens[i++], r = product(); v = op === "+" ? v + r : v - r; } return v; };
  try { const v = sum(); return i === tokens.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

const STOP = new Set(["and", "the", "with", "for", "including", "incl", "per", "all", "new", "from", "into"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.length > 4 ? w.replace(/ies$/, "y").replace(/s$/, "") : w));
/** Whether two estimate items describe the same work: their significant words mostly overlap. */
export function sameWork(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter(w => y.has(w)).length;
  return shared / (x.size + y.size - shared) >= 0.6;
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
    const proposed = Number(o.rate), formula = typeof o.quantityFormula === "string" ? o.quantityFormula.trim().slice(0, 200) : "";
    const computed = formula ? evalArithmetic(formula) : null;
    // The formula wins when the stated quantity doesn't match it (the model's arithmetic slipped).
    let quantity = Number(o.quantity);
    const corrected = computed !== null && computed > 0 && Math.abs(computed - quantity) > Math.max(0.5, computed * 0.02);
    if (corrected) quantity = Math.round(computed! * 100) / 100;
    if (!item || seen.has(item.toLowerCase()) || !(ESTIMATE_UNITS as readonly string[]).includes(unit)) return [];
    // Already in the trade's estimate: accepting it again would count the work twice.
    if (input.existing?.some(e => sameWork(e.item, item))) return [];
    if (!(Number.isFinite(quantity) && quantity > 0 && quantity <= 1e7) || !(Number.isFinite(proposed) && proposed >= 0 && proposed <= 1e6)) return [];
    const stated = typeof o.quantityBasis === "string" ? o.quantityBasis.trim().slice(0, 300) : "";
    const basis = computed !== null && computed > 0 && /\d\s*[-+*/]/.test(formula) ? `${stated}${stated ? " " : ""}[${formula} = ${Math.round(computed * 100) / 100}]`.trim() : stated;
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
    if (corrected) flags.push("Quantity corrected to its formula");
    if (stated.length < 8) flags.push("No quantity basis");
    else if (/\b\d+(\.\d+)?\s*%|\bpercent\b|\bshare of\b/i.test(stated)) flags.push("Quantity is a share of the area");
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
