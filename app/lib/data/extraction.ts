// Sample extraction run for the Jelleff project: what the drywall review queue looks like before
// the real AI reads anything. ILLUSTRATIVE — written for the demo, not read from any document; the
// wording, pages and quotes are invented, on the sample sheets and manual pages the other sample
// screens use. Built by running the real actions, then given fixed ids.

import { recordRun, editDraft, rejectDraft, EMPTY_EXTRACTION, type ExtractionState, type RunInput } from "../extraction";
import { rectangle } from "../drawing-flip";
import { sampleProcurement } from "./procurement";
import { stableIds } from "./stable-ids";

const ARCH = "JRC_GMP-Permit_Drawings_251209.pdf", MANUAL = "JRC_GMP-Permit_Project-Manual_251209.pdf";

const input: RunInput = {
  packageIds: ["drywall"],
  engine: { mode: "sample", model: "Sample review of the real documents" },
  documents: [{ name: ARCH, pages: 205 }, { name: MANUAL, pages: 2074 }],
  startedAt: "2026-10-13T09:00:00.000Z",
  finishedAt: "2026-10-13T09:06:00.000Z",
  drafts: [
    { kind: "scope", key: "framing", packageId: "drywall", title: "Provide metal stud framing for interior partitions, full height to the underside of structure.",
      detail: "Include deflection track, bracing and blocking for the partition types shown on the plans.", source: "09 22 16 · §3.3",
      citations: [{ document: MANUAL, page: 431, sheet: null, quote: "Extend framing full height to structural supports or substrates above suspended ceilings" }] },
    { kind: "scope", key: "finish", packageId: "drywall", title: "Finish all gypsum board to Level 5.",
      detail: "Tape, fill and sand joints, fasteners and trim.", source: "09 29 00 · §3.6",
      citations: [{ document: MANUAL, page: 441, sheet: null, quote: "Level 4: At panel surfaces that will be exposed to view unless otherwise indicated." }] },
    { kind: "scope", key: "ceilings", packageId: "drywall", title: "Provide acoustical panel ceilings where shown on the reflected ceiling plans.",
      detail: "Include suspension system, edge trim and hold-down clips.", source: "09 51 13 · §3.2",
      citations: [{ document: MANUAL, page: 457, sheet: null, quote: "Install acoustical panels with undamaged edges and fit accurately into suspension-system runners and edge moldings." }] },
    { kind: "scope", key: "doors", packageId: "drywall", title: "Provide flush wood doors for transparent finish.",
      detail: "Five-ply flush wood veneer-faced doors, factory finished and machined for hardware.", source: "08 14 16 · §1.1",
      citations: [{ document: MANUAL, page: 345, sheet: null, quote: "Five-ply flush wood veneer-faced doors for transparent finish." }] },
    { kind: "region", key: "partitions-east", packageId: "drywall", sheet: "A1.1", label: "Gypsum board partitions at the locker rooms and toilets",
      polygon: rectangle(0.565, 0.41, 0.15, 0.175), confidence: 0.7, scopeKeys: ["framing"],
      citations: [{ document: ARCH, page: 46, sheet: "A1.1", quote: "LOCKERS / CHANGE" }] },
    { kind: "quantity", key: "partition-area", packageId: "drywall", item: "Interior partitions, metal stud and gypsum board", quantity: 6840, unit: "SF",
      basis: "Partition length on the plan × height to the underside of structure", scopeKey: "framing",
      citations: [{ document: ARCH, page: 46, sheet: "A1.1", quote: "LOCKERS / CHANGE" }] },
  ],
};

const reviewed = "2026-10-13T10:00:00.000Z";
const recorded = recordRun(EMPTY_EXTRACTION, sampleProcurement, input);
const idOf = (title: string) => recorded.drafts.find(d => d.kind === "scope" && d.title.startsWith(title))!.id;
const corrected = editDraft(recorded, sampleProcurement, idOf("Finish all gypsum board"), { title: "Finish gypsum board to Level 4 where exposed to view." }, "Safi", reviewed);
const rejected = rejectDraft(corrected, idOf("Provide flush wood doors"), "wrong-trade", "Doors are in the Openings package; drywall only frames the opening.", "Safi", reviewed);

export const sampleExtraction: ExtractionState = stableIds(rejected, "ext");
