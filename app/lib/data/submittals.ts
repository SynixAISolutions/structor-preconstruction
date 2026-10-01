// Sample submittal log for the Jelleff project, built by running the real actions (so it follows
// every rule) and then given fixed ids. Illustrative: the spec-matrix requirements come from
// initialSpecs, and the demo assumes Concrete was awarded to District Concrete and Electrical to
// Precision Electric — neither award exists in the award records, so `awardId` is null.

import { sampleProcurement } from "./procurement";
import { initialSpecs } from "./preconstruction";
import {
  EMPTY_SUBMITTALS, addRequirement, assignSubcontractor, recordArchitectResponse, requestSubmittal, requirementsFromSpecs,
  returnResponse, reviewSubmittal, sendReminder, sendToArchitect, submitRevision, type SubmittalState,
} from "../submittals";

const at = (date: string, time = "14:00") => `${date}T${time}:00.000Z`;
const MB = 1024 * 1024;
const architect = { name: "Project architect", company: "Design team (sample)", email: "architect@example.com" };
const procurement = sampleProcurement;

let s: SubmittalState = requirementsFromSpecs(EMPTY_SUBMITTALS, procurement, initialSpecs, "Vijay", at("2026-09-12"));
s = addRequirement(s, procurement, { specSection: "26 51 00", title: "Product data", packageId: "electrical", description: "Interior lighting: fixture cut sheets" }, "Naija", at("2026-09-12"));
s = addRequirement(s, procurement, { specSection: "26 51 00", title: "Shop drawings", packageId: "electrical", description: "Interior lighting: lighting control riser and wiring" }, "Naija", at("2026-09-12"));
const id = (number: string) => s.submittals.find(x => x.number === number)!.id;

// Concrete: the mix design went round once with the architect; the test reports are late.
s = assignSubcontractor(s, "concrete", { bidderId: "b2", company: "District Concrete", contact: "Sarah Chen", email: "sarah@example.com", awardId: null }, "Vijay", at("2026-09-15"));
s = requestSubmittal(s, id("03 30 00-01"), "2026-09-22", "Vijay", at("2026-09-15"));
s = requestSubmittal(s, id("03 30 00-02"), "2026-09-29", "Vijay", at("2026-09-15", "14:05"));
s = submitRevision(s, id("03 30 00-01"), { files: [{ name: "Slab mix design 4000 psi.pdf", size: 1.2 * MB, type: "application/pdf" }], note: "Mix 4000-S for slabs and footings." }, "Sarah Chen", at("2026-09-20"));
s = reviewSubmittal(s, id("03 30 00-01"), "approve", { note: "Complete; matches 03 30 00." }, "Vijay", at("2026-09-21", "13:00"));
s = sendToArchitect(s, id("03 30 00-01"), { to: architect, due: "2026-10-05" }, "Vijay", at("2026-09-21"));
s = recordArchitectResponse(s, id("03 30 00-01"), { action: "revise-and-resubmit", comments: "Provide the fly-ash content and slump range for the slab mix." }, "Vijay", at("2026-09-26", "13:00"));
s = returnResponse(s, id("03 30 00-01"), { due: "2026-10-03" }, "Vijay", at("2026-09-26"));
s = submitRevision(s, id("03 30 00-01"), { files: [{ name: "Slab mix design 4000 psi rev 1.pdf", size: 1.3 * MB, type: "application/pdf" }], note: "Added fly-ash content and slump range." }, "Sarah Chen", at("2026-09-30"));
s = sendReminder(s, id("03 30 00-02"), "Vijay", at("2026-09-30"));

// Electrical: fixtures are with the architect; the controls shop drawings are closed.
s = assignSubcontractor(s, "electrical", { bidderId: "b5", company: "Precision Electric", contact: "Taylor Reed", email: "taylor@example.com", awardId: null }, "Naija", at("2026-09-16"));
s = requestSubmittal(s, id("26 51 00-01"), "2026-09-23", "Naija", at("2026-09-16"));
s = requestSubmittal(s, id("26 51 00-02"), "2026-09-25", "Naija", at("2026-09-16", "14:05"));
s = submitRevision(s, id("26 51 00-02"), { files: [{ name: "Lighting control riser.pdf", size: 0.8 * MB, type: "application/pdf" }] }, "Taylor Reed", at("2026-09-22"));
s = reviewSubmittal(s, id("26 51 00-02"), "approve", {}, "Naija", at("2026-09-23", "13:00"));
s = sendToArchitect(s, id("26 51 00-02"), { due: "2026-10-01" }, "Naija", at("2026-09-23"));
s = submitRevision(s, id("26 51 00-01"), { files: [{ name: "Fixture cut sheets HB-1 DL-1.pdf", size: 3.4 * MB, type: "application/pdf" }] }, "Taylor Reed", at("2026-09-23"));
s = reviewSubmittal(s, id("26 51 00-01"), "approve", { note: "Fixture types match the lighting plan." }, "Naija", at("2026-09-24", "13:00"));
s = sendToArchitect(s, id("26 51 00-01"), { due: "2026-10-09" }, "Naija", at("2026-09-25"));
s = recordArchitectResponse(s, id("26 51 00-02"), { action: "approved-as-noted", comments: "Add an occupancy sensor in storage 120." }, "Naija", at("2026-09-29"));
s = returnResponse(s, id("26 51 00-02"), {}, "Naija", at("2026-09-30"));

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
