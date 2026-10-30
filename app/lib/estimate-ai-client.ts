"use client";

// "Estimate with AI" in the browser: gathers one trade's inputs and asks for its lines (lib/estimate-ai).
// The screen then adds the accepted lines with lib/estimate addAiEstimateLines.

import { aiJob } from "./ai-more-client";
import type { TakeoffRow } from "./data/preconstruction";
import { estimateReferences, type EstimateDraftInput, type EstimateDraftLine } from "./estimate-ai";
import type { ExtractionState } from "./extraction";
import { generateConceptBudget, type BudgetHistory, type ConceptBudget } from "./historical-budget";
import type { Procurement, TradePackage } from "./procurement";
import { drawingRegister, type StoredDocument } from "./project-files";
import { readStoredText } from "./project-files-client";
import { sheetsForTrade } from "./project-scopes";
import type { Project } from "./projects";

/** Historical cost per SF for the project from the stored past budgets, or null when there are none (or the project lacks area or stage). */
export function conceptReference(project: Project, history: BudgetHistory[]): ConceptBudget | null {
  if (!history.length) return null;
  try {
    return generateConceptBudget(project, history.slice(0, 50), { locationIndex: history[0].locationIndex, costIndex: history[0].costIndex, profileFactor: 1, basis: "Reference rates for Estimate with AI, indexes of the first historical project." });
  } catch { return null; }
}

/** Drafts one trade's estimate: its scope lines, accepted AI quantities, up to four of its drawing sheets, and the rates the app holds. */
export async function draftTradeEstimate(args: { trade: TradePackage; project: Project; procurement: Procurement; rows: TakeoffRow[]; extraction: ExtractionState; documents: StoredDocument[]; concept: ConceptBudget | null; signal?: AbortSignal }): Promise<EstimateDraftLine[]> {
  const { trade, project } = args;
  const scope = args.procurement.scopes.filter(s => s.packageId === trade.id).map(s => s.detail ? `${s.title}: ${s.detail}` : s.title);
  const quantities = args.extraction.drafts.flatMap(d => d.kind === "quantity" && d.status === "accepted" && d.packageId === trade.id ? [{ item: d.item, quantity: d.quantity, unit: d.unit, basis: d.basis }] : []);
  const rows = sheetsForTrade(drawingRegister(args.documents), trade).slice(0, 4);
  const sheets: EstimateDraftInput["sheets"] = [];
  for (const row of rows) {
    const [page] = await readStoredText(row.doc, { first: row.page, last: row.page });
    sheets.push({ sheet: row.sheet, title: row.title, text: (page?.text ?? "").slice(0, 6000) });
  }
  const input: EstimateDraftInput = {
    trade: { id: trade.id, name: trade.name, code: trade.code },
    project: { name: project.name, type: project.type, location: project.location, squareFeet: project.squareFeet, workType: project.workType ?? "", stage: project.estimateStage ?? "" },
    scope, quantities, sheets, references: estimateReferences(args.rows, trade, args.concept),
    existing: args.rows.filter(r => r.packageId === trade.id).map(r => ({ item: r.item, quantity: r.quantity, unit: r.unit, rate: r.rate })),
  };
  return (await aiJob<{ lines: EstimateDraftLine[] }>("estimate-draft", input, args.signal)).lines;
}
