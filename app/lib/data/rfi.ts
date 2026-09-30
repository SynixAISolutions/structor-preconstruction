// Sample Structor Check issues for the Jelleff project (the ones the earlier preview showed),
// found by Structor's document check. Illustrative, not read from the drawings.

import type { Severity, StructorCheckState, StructorIssue } from "../rfi";

const at = "2026-09-15T14:00:00.000Z";
const issue = (number: string, title: string, detail: string, category: string, severity: Severity, trade: string, packageId: string | null, source: string, crossReference: string, resolved = false): StructorIssue => ({
  id: number.toLowerCase(), number, title, detail, category, severity, trade, packageId, source, crossReference, origin: "ai", raisedBy: "Structor Check", bidderId: null,
  status: resolved ? "resolved" : "open", rfiId: null, resolution: resolved ? { note: "Confirmed against the latest drawings.", by: "Safi", at } : null, createdAt: at, updatedAt: at,
});

export const sampleStructorCheck: StructorCheckState = {
  issues: [
    issue("SC-001", "Roof fall-restraint anchors are not detailed", "The roof access notes require fall protection, but the current roof plan does not identify anchor positions, loading, or attachment details. Confirm responsibility and design criteria before issuing the roofing package.", "Missing detail", "high", "07 · Roofing", "thermal", "A-102 · Roof plan", "07 72 00 · Roof accessories"),
    issue("SC-002", "Door D-104 fire rating does not match the schedule", "The partition plan indicates a rated corridor wall. The door schedule lists D-104 without a rating. Ask the architect to reconcile the door and wall assembly requirements.", "Conflict", "high", "08 · Openings", "openings", "A-101 · Room 104", "A-601 · Door schedule"),
    issue("SC-003", "Floor finish is not defined for storage room 118", "Room 118 is shown on the floor plan, but its finish schedule entry is blank. The flooring allowance and scope require confirmation.", "Missing information", "medium", "09 · Finishes", "drywall", "A-101 · Room 118", "A-701 · Finish schedule"),
    issue("SC-004", "Structural opening conflicts with duct routing", "The supply duct route crosses the beam line at grid C without a coordinated penetration detail. Confirm the final route or approved structural opening.", "Coordination", "high", "23 · HVAC", "mechanical", "M-101 · Grid C", "S-101 · Framing plan"),
    issue("SC-005", "Exterior wall air-barrier transition needs confirmation", "The wall section shows an air barrier but does not call out the transition at the storefront head. Confirm the termination and compatible materials.", "Missing detail", "medium", "07 · Envelope", "thermal", "A-501 · Detail 4", "07 27 00 · Air barriers", true),
  ],
  rfis: [],
  notifications: [],
  lastIssueNumber: 5,
  lastRfiNumber: 0,
  designTeam: null,
};
