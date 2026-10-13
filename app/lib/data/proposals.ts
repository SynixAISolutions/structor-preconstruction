// Sample proposal reading for the Jelleff project: District Concrete emails a revised concrete
// proposal after its first bid, and Structor's reading of it waits for the estimator. ILLUSTRATIVE —
// the file, wording, prices and pages are invented for the demo; nothing was read. Applying it makes
// District Concrete's revision 2; the concrete award stays on revision 1. Built by running the real
// action, then given fixed ids.

import { recordReading, EMPTY_PROPOSALS, type ProposalState } from "../proposal-extraction";
import { sampleProcurement } from "./procurement";
import { stableIds } from "./stable-ids";

const FILE = "District Concrete revised proposal.pdf";
const page = (n: number, quote: string) => [{ document: FILE, page: n, sheet: null, quote }];

export const sampleProposals: ProposalState = stableIds(recordReading(EMPTY_PROPOSALS, sampleProcurement, {
  invitationId: "inv-2",
  formVersion: 1,
  document: { name: FILE, pages: 3, size: 412_000 },
  engine: { mode: "sample", model: "Illustrative sample (nothing was read)" },
  readAt: "2026-10-13T14:00:00.000Z",
  baseBid: 1768000, baseBidCitations: page(1, "Revised base bid: $1,768,000, including winter heat and enclosures."),
  responses: [
    { scopeItemId: "scope-5", answer: "Y", citations: page(2, "Foundations, slabs on grade, elevated slabs and housekeeping pads: included.") },
    { scopeItemId: "scope-6", answer: "P", note: "States FF35/FL25 for the gym slab only; other areas to standard tolerance.", citations: page(2, "Floor flatness FF35/FL25 at gymnasium slab. Standard tolerance elsewhere.") },
  ],
  exclusions: [{ text: "Testing and inspection (by owner)", citations: page(3, "Exclusions: testing and inspection by owner.") }],
  clarifications: [{ text: "Winter heat and enclosures now included through March 2027.", citations: page(1, "Winter heat and enclosures are now included through March 2027.") }],
  alternates: [{ kind: "deduct", description: "Delete housekeeping pads (by mechanical)", amount: 18500, citations: page(3, "Deduct alternate: delete housekeeping pads, ($18,500).") }],
  submitter: { name: "Sarah Chen", email: "sarah@example.com" },
}), "prop");
