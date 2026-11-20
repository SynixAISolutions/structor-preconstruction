// Exhibits (Marcel's issues log, item 18, 18 Nov: "Create a main header titled contracts and procurement ... contracts &
// exhibits be titled contracts, and have one for exhibits"). Every trade's exhibits in one list: its Exhibit A (the scope,
// one per award, with its revisions) and Exhibits B to G (the list of documents and the contracts department's files),
// prepared on the trade's contract. Pure: lib/award and lib/contract-files hold the records.

import { activeAward, latestExhibit, type AwardState } from "./award";
import { EXHIBITS, missingContractFiles } from "./contract-files";
import type { TradePackage } from "./procurement";

export type ExhibitMark = { code: string; name: string; ready: boolean };
export type ExhibitRow = {
  packageId: string; code: string; trade: string;
  /** The awarded company, or null before an award. */
  company: string | null;
  /** Exhibit A: its latest revision and where it stands; null before an award. */
  exhibitA: { revision: number; status: "draft" | "shared" | "changes requested" | "agreed" } | null;
  /** Exhibits B to G, each ready or still to prepare; empty before an award. */
  others: ExhibitMark[];
  /** Locked once the subcontract has gone out: its exhibits are frozen into it. */
  locked: boolean;
};

const EXHIBIT_A: Record<string, NonNullable<ExhibitRow["exhibitA"]>["status"]> = { draft: "draft", shared: "shared", "changes-requested": "changes requested", agreed: "agreed" };

/** One row per trade, in the trades' order: awarded trades with their exhibits, the rest waiting for an award. */
export function exhibitRows(packages: Pick<TradePackage, "id" | "code" | "name">[], state: AwardState): ExhibitRow[] {
  return packages.map(pkg => {
    const award = activeAward(state, pkg.id);
    if (!award) return { packageId: pkg.id, code: pkg.code, trade: pkg.name, company: null, exhibitA: null, others: [], locked: false };
    const files = award.subcontract?.attachments ?? award.contractFiles ?? null;
    const missing = new Set(files ? missingContractFiles(files) : ["Exhibit B", ...Object.keys(EXHIBITS).map(code => `Exhibit ${code}`)]);
    return {
      packageId: pkg.id, code: pkg.code, trade: pkg.name, company: award.leveling.bidderName,
      exhibitA: { revision: latestExhibit(award).number, status: EXHIBIT_A[award.exhibit.status] ?? "draft" },
      others: [{ code: "B", name: "List of documents" }, ...Object.entries(EXHIBITS).map(([code, name]) => ({ code, name }))]
        .map(e => ({ ...e, ready: !missing.has(`Exhibit ${e.code}`) })),
      locked: !!award.subcontract && award.subcontract.status !== "draft",
    };
  });
}
