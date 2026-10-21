import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/revision-ripple.ts");
const { publishPackage } = await import("../lib/procurement.ts");
const { isStale } = await import("../lib/submissions.ts");

const pkg = (id, name, code) => ({ id, name, division: code.slice(0, 2), code, owner: "", due: "" });
const packages = [pkg("drywall", "Drywall & ceilings", "09 29 00"), pkg("doors", "Doors, frames & hardware", "08 11 13"), pkg("concrete", "Concrete", "03 30 00")];
assert.equal(R.packageForTrade("Drywall", packages), "drywall");
assert.equal(R.packageForTrade("Acoustical ceilings", packages), "drywall", "Alias");
assert.equal(R.packageForTrade("Door hardware", packages), "doors");
assert.equal(R.packageForTrade("Cast-in-place concrete", packages), "concrete");
assert.equal(R.packageForTrade("Plumbing", packages), null);
assert.equal(R.packageForTrade("", packages), null);

// The two-issue test from 19 Oct: a new storage room drawn on A1.1 in V2.
const sheets = [{ sheet: "A1.1", revision: "V2", changes: [
  { title: "New storage room enclosure in gym", detail: "Partitions added at grid C/4", kind: "Added", trade: "Drywall" },
  { title: "New door to storage room", detail: "", kind: "Added", trade: "Doors" },
  { title: "Ceiling at storage room", detail: "ACT added", kind: "Added", trade: "Ceilings" },
  { title: "Floor drain relocated", detail: "", kind: "Revised", trade: "Plumbing" },
] }];
const scope = (id, packageId) => ({ id, packageId, title: "Existing line", detail: "", source: "A8.1", origin: "ai", status: "approved", allTrades: false, history: [] });
let procurement = { packages, scopes: [scope("s1", "drywall"), scope("s2", "doors")], invitations: [], outreach: [], notifications: [] };
procurement = publishPackage(procurement, "drywall", "Marcel", "2026-10-15T10:00:00Z");
const submission = { id: "sub1", projectId: "p", packageId: "drywall", invitationId: "i1", bidderId: "b1", status: "submitted", draft: {}, revisions: [{ formVersion: 1, revisionNumber: 1 }], updatedAt: "" };
const ripple = R.revisionRipple(sheets, procurement, [submission]);
assert.deepEqual(ripple.trades.map(t => [t.packageId, t.changes.map(c => c.title), t.published, t.bids]), [
  ["drywall", ["New storage room enclosure in gym", "Ceiling at storage room"], true, 1],
  ["doors", ["New door to storage room"], false, 0],
]);
assert.deepEqual(ripple.unmatched.map(c => c.trade), ["Plumbing"], "No plumbing package: listed apart, not dropped");

// Applying adds draft lines citing the sheet and revision, once; publishing the revised form makes the earlier bid stale.
const applied = R.applyRipple(procurement, ripple.trades[0], "Marcel", "2026-10-20T10:00:00Z");
const added = applied.scopes.filter(s => s.source === "A1.1 · V2");
assert.deepEqual(added.map(s => [s.packageId, s.title, s.detail, s.status, s.origin]), [
  ["drywall", "New storage room enclosure in gym", "Added in V2: Partitions added at grid C/4", "draft", "drawing"],
  ["drywall", "Ceiling at storage room", "Added in V2: ACT added", "draft", "drawing"],
]);
assert.equal(R.applyRipple(applied, ripple.trades[0], "Marcel"), applied, "Applying twice adds nothing");
assert.equal(isStale(submission, applied), false, "Not stale until the revised form is published");
const republished = publishPackage({ ...applied, scopes: applied.scopes.map(s => ({ ...s, status: "approved" })) }, "drywall", "Marcel", "2026-10-20T11:00:00Z");
assert.equal(isStale(submission, republished), true, "Priced on version 1; the form is now version 2");

console.log("Revision ripple checked: AI trade names to packages (names, aliases), changes grouped by trade with existing bids, unmatched kept, draft lines once, stale after republishing.");
