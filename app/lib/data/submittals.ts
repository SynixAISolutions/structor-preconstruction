// Sample submittal log for the Jelleff project, built by running the real actions (so it follows
// every rule) and then given fixed ids. The spec-matrix requirements come from initialSpecs; the
// concrete submittals belong to District Concrete (subcontract executed 2026-09-25) and the drywall
// ones to Capitol Wall Systems (executed 2026-10-12), both in lib/data/sample-award.ts. Every other
// trade waits for its award.

import { sampleProcurement } from "./procurement";
import { initialSpecs } from "./preconstruction";
import { sampleAwards } from "./sample-award";
import {
  EMPTY_SUBMITTALS, addRequirement, assignFromAward, recordArchitectResponse, requestSubmittal, requirementsFromSpecs,
  returnResponse, reviewSubmittal, sendReminder, sendToArchitect, submitRevision, type SubmittalState,
} from "../submittals";

const at = (date: string, time = "14:00") => `${date}T${time}:00.000Z`;
const MB = 1024 * 1024;
const architect = { name: "Project architect", company: "Architect of record", email: "architect@example.com" };
const procurement = sampleProcurement;

let s: SubmittalState = requirementsFromSpecs(EMPTY_SUBMITTALS, procurement, initialSpecs, "Vijay", at("2026-09-12"));
s = addRequirement(s, procurement, { specSection: "03 30 00", title: "Shop drawings", packageId: "concrete", description: "Cast-in-place concrete: reinforcing steel placement drawings" }, "Vijay", at("2026-09-25", "17:00"));
s = addRequirement(s, procurement, { specSection: "03 30 00", title: "Product data", packageId: "concrete", description: "Cast-in-place concrete: curing compound" }, "Vijay", at("2026-09-25", "17:00"));
const id = (number: string) => s.submittals.find(x => x.number === number)!.id;
const pdf = (name: string, size: number) => ({ name, size, type: "application/pdf" });

s = assignFromAward(s, sampleAwards.awards[0], "Vijay", at("2026-09-25", "17:05"));
s = requestSubmittal(s, id("03 30 00-01"), "2026-09-30", "Vijay", at("2026-09-26"));
s = requestSubmittal(s, id("03 30 00-02"), "2026-09-30", "Vijay", at("2026-09-26", "14:01"));
s = requestSubmittal(s, id("03 30 00-03"), "2026-10-01", "Vijay", at("2026-09-26", "14:02"));
s = requestSubmittal(s, id("03 30 00-04"), "2026-09-30", "Vijay", at("2026-09-26", "14:03"));

// Curing compound: approved as noted and returned (closed).
s = submitRevision(s, id("03 30 00-04"), { files: [pdf("Curing compound data.pdf", 0.6 * MB)] }, "Sarah Chen", at("2026-09-28"));
s = reviewSubmittal(s, id("03 30 00-04"), "approve", {}, "Vijay", at("2026-09-28", "15:00"));
s = sendToArchitect(s, id("03 30 00-04"), { to: architect, due: "2026-10-05" }, "Vijay", at("2026-09-28", "16:00"));
s = recordArchitectResponse(s, id("03 30 00-04"), { action: "approved-as-noted", comments: "Use the dissipating type under resilient flooring." }, "Vijay", at("2026-09-30", "15:00"));
s = returnResponse(s, id("03 30 00-04"), {}, "Vijay", at("2026-10-01", "13:00"));

// Mix design: the architect asked for more; revision 1 is waiting for the contractor's review.
s = submitRevision(s, id("03 30 00-01"), { files: [pdf("Slab mix design 4000 psi.pdf", 1.2 * MB)], note: "Mix 4000-S for slabs and footings." }, "Sarah Chen", at("2026-09-29"));
s = reviewSubmittal(s, id("03 30 00-01"), "approve", { note: "Complete; matches 03 30 00." }, "Vijay", at("2026-09-29", "15:00"));
s = sendToArchitect(s, id("03 30 00-01"), { due: "2026-10-09" }, "Vijay", at("2026-09-29", "16:00"));
s = recordArchitectResponse(s, id("03 30 00-01"), { action: "revise-and-resubmit", comments: "Provide the fly-ash content and slump range for the slab mix." }, "Vijay", at("2026-09-30", "13:00"));
s = returnResponse(s, id("03 30 00-01"), { due: "2026-10-05" }, "Vijay", at("2026-09-30"));
s = submitRevision(s, id("03 30 00-01"), { files: [pdf("Slab mix design 4000 psi rev 1.pdf", 1.3 * MB)], note: "Added fly-ash content and slump range." }, "Sarah Chen", at("2026-10-01", "15:00"));

// Reinforcing shop drawings: with the architect.
s = submitRevision(s, id("03 30 00-03"), { files: [pdf("Rebar placement drawings.pdf", 6.8 * MB)] }, "Sarah Chen", at("2026-09-30"));
s = reviewSubmittal(s, id("03 30 00-03"), "approve", { note: "Bar sizes match S-101." }, "Vijay", at("2026-10-01", "13:00"));
s = sendToArchitect(s, id("03 30 00-03"), { due: "2026-10-13" }, "Vijay", at("2026-10-01", "14:00"));

// Test reports: late, and reminded.
s = sendReminder(s, id("03 30 00-02"), "Vijay", at("2026-10-01", "16:00"));

// Drywall: two more requirements beside the spec matrix's gypsum board ones, assigned from the award.
s = addRequirement(s, procurement, { specSection: "09 22 16", title: "Shop drawings", packageId: "drywall", description: "Non-structural metal framing: partition layout, heights and deflection track" }, "Safi", at("2026-10-12", "17:00"));
s = addRequirement(s, procurement, { specSection: "09 51 13", title: "Samples", packageId: "drywall", description: "Acoustical panel ceilings: panel and grid finish" }, "Safi", at("2026-10-12", "17:00"));
s = assignFromAward(s, sampleAwards.awards.find(a => a.packageId === "drywall")!, "Safi", at("2026-10-12", "17:05"));
s = requestSubmittal(s, id("09 29 00-01"), "2026-10-19", "Safi", at("2026-10-13"));
s = requestSubmittal(s, id("09 29 00-02"), "2026-10-19", "Safi", at("2026-10-13", "14:01"));
s = requestSubmittal(s, id("09 22 16-01"), "2026-10-21", "Safi", at("2026-10-13", "14:02"));
s = requestSubmittal(s, id("09 51 13-01"), "2026-10-23", "Safi", at("2026-10-13", "14:03"));
// Gypsum board product data: in, waiting for the contractor's review.
s = submitRevision(s, id("09 29 00-01"), { files: [pdf("Type X gypsum board data.pdf", 0.9 * MB)], note: "5/8-inch Type X, UL design references attached." }, "Avery Morgan", at("2026-10-14", "10:00"));

/** Fixed ids so the server and browser render the same sample. */
function stable(state: SubmittalState): SubmittalState {
  const ids = new Map(state.submittals.map(x => [x.id, `sub-${x.number.replace(/ /g, "")}`]));
  let file = 0;
  const files = <T extends { id: string }>(list: T[]) => list.map(f => ({ ...f, id: `att-${++file}` }));
  return {
    ...state,
    submittals: state.submittals.map(x => ({
      ...x, id: ids.get(x.id)!,
      revisions: x.revisions.map(r => ({ ...r, files: files(r.files), response: r.response && { ...r.response, files: files(r.response.files) } })),
    })),
    notifications: state.notifications.map((n, i) => ({ ...n, id: `sn-${i + 1}`, submittalId: ids.get(n.submittalId)! })),
  };
}

export const sampleSubmittals: SubmittalState = stable(s);
