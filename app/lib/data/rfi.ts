// Sample Structor Check issues for the Jelleff project (the ones the earlier preview showed),
// found by Structor's document check. Illustrative, not read from the drawings. Two are reviewed,
// two still wait for the contractor's review, one is resolved.

import type { Severity, StructorCheckState, StructorIssue } from "../rfi";

const at = "2026-09-15T14:00:00.000Z";
type Sample = "reviewed" | "waiting" | "resolved";
const issue = (number: string, title: string, detail: string, category: string, severity: Severity, trade: string, packageId: string | null, source: string, crossReference: string, sample: Sample): StructorIssue => ({
  id: number.toLowerCase(), number, title, detail, category, severity, trade, packageId, source, crossReference, origin: "ai", raisedBy: "Structor Check", bidderId: null,
  status: sample === "waiting" ? "pending-review" : sample === "resolved" ? "resolved" : "open",
  reviewedBy: sample === "waiting" ? null : "Safi", reviewedAt: sample === "waiting" ? null : at, combinedInto: null,
  rfiId: null, resolution: sample === "resolved" ? { note: "Confirmed against the latest drawings.", by: "Safi", at } : null, createdAt: at, updatedAt: at,
});

export const sampleStructorCheck: StructorCheckState = {
  issues: [
    issue("SC-001", "Roof fall-restraint anchors are not detailed", "The roof access notes require fall protection, but the current roof plan does not identify anchor positions, loading, or attachment details. Confirm responsibility and design criteria before issuing the roofing package.", "Missing detail", "high", "07 · Roofing", "thermal", "A1.3 · Roof plan", "07 72 00 · Roof accessories", "reviewed"),
    issue("SC-002", "Door D-104 fire rating does not match the schedule", "The partition plan indicates a rated corridor wall. The door schedule lists D-104 without a rating. Ask the architect to reconcile the door and wall assembly requirements.", "Conflict", "high", "08 · Openings", "openings", "A1.1 · Room 104", "A8.2 · Door schedule", "reviewed"),
    issue("SC-003", "Floor finish is not defined for storage room 118", "Room 118 is shown on the floor plan, but its finish schedule entry is blank. The flooring allowance and scope require confirmation.", "Missing information", "medium", "09 · Finishes", "drywall", "A1.1 · Room 118", "A-701 · Finish schedule", "waiting"),
    issue("SC-004", "Structural opening conflicts with duct routing", "The supply duct route crosses the beam line at grid C without a coordinated penetration detail. Confirm the final route or approved structural opening.", "Coordination", "high", "23 · HVAC", "mechanical", "M101 · Grid C", "S101 · Framing plan", "waiting"),
    issue("SC-005", "Exterior wall air-barrier transition needs confirmation", "The wall section shows an air barrier but does not call out the transition at the storefront head. Confirm the termination and compatible materials.", "Missing detail", "medium", "07 · Envelope", "thermal", "A8.1 · Detail 4", "07 27 00 · Air barriers", "resolved"),
  ],
  rfis: [],
  notifications: [],
  lastIssueNumber: 5,
  lastRfiNumber: 0,
  designTeam: null,
};
