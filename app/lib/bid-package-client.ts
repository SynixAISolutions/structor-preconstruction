"use client";

// Asks the AI for a project's bid packages (lib/bid-package-ai) from its stored files: the sections of every
// current specification volume and the current drawing index.

import type { BidPackagePlan } from "./bid-package-ai";
import { drawingRegister, specificationSections, type StoredDocument } from "./project-files";
import type { TradePackage } from "./procurement";

export async function planBidPackages(documents: StoredDocument[], packages: Pick<TradePackage, "id" | "name" | "code">[], signal?: AbortSignal): Promise<BidPackagePlan & { model: string }> {
  const input = {
    sections: specificationSections(documents).map(s => ({ section: s.section, title: s.title })),
    sheets: drawingRegister(documents).map(r => ({ sheet: r.sheet, title: r.title, discipline: r.discipline })),
    packages: packages.map(p => ({ id: p.id, name: p.name, code: p.code })),
  };
  const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job: "bid-packages", input }), signal });
  const body = await response.json().catch(() => ({ error: `The AI request failed (${response.status}).` }));
  if (!response.ok) throw new Error(body.error ?? `The AI request failed (${response.status}).`);
  return body;
}
