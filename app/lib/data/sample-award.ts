// Concrete, carried from bid to executed subcontract for the Jelleff sample, built by running the
// real actions over the published sample bid form: District Concrete bids in the portal, the bid
// is leveled, awarded against the concrete budget line, Exhibit A is agreed and the subcontract is
// signed and executed. Illustrative amounts and people; ids are fixed (see stable-ids).

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

/** District Concrete's submitted bid for the published concrete form. */
export const sampleSubmissions: Submission[] = stable.submissions;
/** Concrete awarded to District Concrete, Exhibit A agreed, subcontract executed. */
export const sampleAwards: AwardState = stable.awards;
