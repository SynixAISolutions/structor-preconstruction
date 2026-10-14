// Concrete and drywall, carried from bid to executed subcontract for the Jelleff sample, built by
// running the real actions over the published sample bid forms: companies bid in the portal, the
// bids are leveled, awarded against the trade's budget line, Exhibit A is agreed and the subcontract
// is signed and executed. Illustrative amounts and people; ids are fixed (see stable-ids).
//
// Drywall (Marcel's pilot trade): Capitol Wall Systems answers every item Y and is awarded on its
// base bid against budget line nc-09200. Rock Creek Interiors bids lower but excludes the acoustical
// ceilings (N) and offers a partial finish level (P), so it stays open in Bid leveling until an
// estimator resolves it — the reason leveling exists. Anacostia Partitions declined.

import { agreeExhibit, createAward, executeSubcontract, generateSubcontract, sendSubcontract, shareExhibit, signSubcontract, type AwardState } from "../award";
import { levelingCandidates } from "../budget";
import { buildLevelingImport } from "../leveling-import";
import { sampleProjectRecords } from "../projects";
import { addAttachment, openSubmission, setResponse, submitBid, updateDraft, type Submission } from "../submissions";
import { sampleBudget } from "./budget";
import { initialBidders } from "./commercial";
import { sampleProcurement } from "./procurement";
import { stableIds } from "./stable-ids";

const at = (date: string, time = "14:00") => `${date}T${time}:00.000Z`;
const project = sampleProjectRecords[0];
const procurement = sampleProcurement;
const form = procurement.packages.find(p => p.id === "concrete")!.published!;

let submissions: Submission[] = openSubmission([], procurement, { projectId: project.id, invitationId: "inv-2" }, at("2026-09-19"));
const id = submissions[0].id;
submissions = form.items.reduce((next, item) => setResponse(next, id, item.id, "Y", "", at("2026-09-20")), submissions);
submissions = updateDraft(submissions, id, {
  baseBid: 1742000,
  exclusions: ["Winter heat and enclosures", "Testing and inspection (by owner)"],
  clarifications: ["Slab flatness per 03 30 00 §3.9; floor-finish curing compatibility confirmed with the flooring trade."],
}, at("2026-09-20"));
submissions = addAttachment(submissions, id, { name: "District Concrete proposal.pdf", size: 940_000, type: "application/pdf" }, at("2026-09-21", "13:00"));
submissions = submitBid(submissions, procurement, id, { name: "Sarah Chen", email: "sarah@example.com" }, at("2026-09-21", "15:00"));

const imported = buildLevelingImport({ projectId: project.id, projectName: project.name, packageId: "concrete", procurement, submissions, directory: initialBidders });
const candidates = levelingCandidates({ packageId: "concrete", items: imported.items, bidders: imported.bidders, provenance: imported.provenance });

let awards: AwardState = createAward({ awards: [], notifications: [] }, {
  projectId: project.id, projectName: project.name, procurement, submissions, candidates, budget: sampleBudget, directory: initialBidders,
  owner: "DC Department of General Services", projectAddress: project.location, projectStart: project.start,
}, { levelingBidderId: candidates[0].levelingBidderId, basis: "base", budgetLineId: "nc-03000" }, "Vijay", at("2026-09-23"));
const awardId = awards.awards[0].id;
awards = shareExhibit(awards, awardId, at("2026-09-23", "15:00"));
awards = agreeExhibit(awards, awardId, "Sarah Chen", "subcontractor", at("2026-09-24"));
awards = generateSubcontract(awards, awardId, "MCN Build, Inc.", "Vijay", at("2026-09-24", "15:00"));
awards = sendSubcontract(awards, awardId, at("2026-09-24", "16:00"));
awards = signSubcontract(awards, awardId, "subcontractor", { name: "Sarah Chen", title: "Project manager", email: "sarah@example.com" }, at("2026-09-25", "13:00"));
awards = signSubcontract(awards, awardId, "contractor", { name: "Marcel Khoury", title: "Estimator", email: "marcel@example.com" }, at("2026-09-25", "15:00"));
awards = executeSubcontract(awards, awardId, at("2026-09-25", "16:00"));

const stable = stableIds({ submissions, awards }, "s");

// ── Drywall ──
const drywallForm = procurement.packages.find(p => p.id === "drywall")!.published!;
type Answer = { item: string; answer: "Y" | "N" | "P"; note?: string };
function bid(state: Submission[], invitationId: string, answers: Answer[], content: { baseBid: number; exclusions: string[]; clarifications: string[] }, file: string, who: { name: string; email: string }, day: string): Submission[] {
  let next = openSubmission(state, procurement, { projectId: project.id, invitationId }, at(day, "10:00"));
  const sid = next.find(x => x.invitationId === invitationId)!.id;
  next = drywallForm.items.reduce((acc, item) => {
    const a = answers.find(x => x.item === item.id);
    return setResponse(acc, sid, item.id, a?.answer ?? "Y", a?.note ?? "", at(day, "11:00"));
  }, next);
  next = updateDraft(next, sid, content, at(day, "11:30"));
  next = addAttachment(next, sid, { name: file, size: 1_120_000, type: "application/pdf" }, at(day, "12:00"));
  return submitBid(next, procurement, sid, who, at(day, "15:00"));
}
let drywallSubmissions = bid(stable.submissions, "inv-6", [], {
  baseBid: 1012400,
  exclusions: ["Painting of gypsum board (by the painting trade)", "Firestopping of penetrations made by other trades"],
  clarifications: ["Level 4 finish throughout; Level 5 only where the finish schedule calls for it.", "Acoustical ceilings included per the reflected ceiling plans."],
}, "Capitol Wall Systems proposal.pdf", { name: "Avery Morgan", email: "avery@example.com" }, "2026-10-07");
drywallSubmissions = bid(drywallSubmissions, "inv-7", [
  { item: "scope-20", answer: "N", note: "Acoustical ceilings by a separate ceiling contractor." },
  { item: "scope-12", answer: "P", note: "Level 4 in public areas; Level 3 in back-of-house rooms." },
], {
  baseBid: 968750,
  exclusions: ["Acoustical panel ceilings", "Painting", "Bond"],
  clarifications: ["Price holds for 30 days."],
}, "Rock Creek Interiors proposal.pdf", { name: "Dana Brooks", email: "dana@example.com" }, "2026-10-08");

const drywallImport = buildLevelingImport({ projectId: project.id, projectName: project.name, packageId: "drywall", procurement, submissions: drywallSubmissions, directory: initialBidders });
const drywallCandidates = levelingCandidates({ packageId: "drywall", items: drywallImport.items, bidders: drywallImport.bidders, provenance: drywallImport.provenance });
const capitol = drywallCandidates.find(c => c.bidderName === "Capitol Wall Systems")!;
let drywallAwards: AwardState = createAward(stable.awards, {
  projectId: project.id, projectName: project.name, procurement, submissions: drywallSubmissions, candidates: drywallCandidates, budget: sampleBudget, directory: initialBidders,
  owner: "DC Department of General Services", projectAddress: project.location, projectStart: project.start,
}, { levelingBidderId: capitol.levelingBidderId, basis: "base", budgetLineId: "nc-09200" }, "Safi", at("2026-10-09"));
const drywallAwardId = drywallAwards.awards.at(-1)!.id;
drywallAwards = shareExhibit(drywallAwards, drywallAwardId, at("2026-10-09", "15:00"));
drywallAwards = agreeExhibit(drywallAwards, drywallAwardId, "Avery Morgan", "subcontractor", at("2026-10-10"));
drywallAwards = generateSubcontract(drywallAwards, drywallAwardId, "MCN Build, Inc.", "Safi", at("2026-10-10", "15:00"));
drywallAwards = sendSubcontract(drywallAwards, drywallAwardId, at("2026-10-10", "16:00"));
drywallAwards = signSubcontract(drywallAwards, drywallAwardId, "subcontractor", { name: "Avery Morgan", title: "Owner", email: "avery@example.com" }, at("2026-10-12", "13:00"));
drywallAwards = signSubcontract(drywallAwards, drywallAwardId, "contractor", { name: "Marcel Khoury", title: "Estimator", email: "marcel@example.com" }, at("2026-10-12", "15:00"));
drywallAwards = executeSubcontract(drywallAwards, drywallAwardId, at("2026-10-12", "16:00"));

// Concrete keeps its "s-" ids; everything drywall added gets "dw-" ids.
const withDrywall = stableIds({ submissions: drywallSubmissions, awards: drywallAwards }, "dw");

/** Every submitted bid: District Concrete for concrete; Capitol Wall Systems and Rock Creek Interiors for drywall. */
export const sampleSubmissions: Submission[] = withDrywall.submissions;
/** Concrete to District Concrete and drywall to Capitol Wall Systems: Exhibit A agreed, subcontracts executed. */
export const sampleAwards: AwardState = withDrywall.awards;
