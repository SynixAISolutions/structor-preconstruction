import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const {
  ProcurementRuleError, addScope, applyScopeToAllTrades, approveScope, bidForm, editScope, inviteBidder, inviteCandidates,
  logOutreach, markNotificationsRead, moveScope, outreachLog, packageStatus, publishBlockers, publishPackage, reopenScope,
  setInvitationStatus, markInvitationSubmitted, unreadFor,
} = await import("../lib/procurement.ts");
const { sampleProcurement } = await import("../lib/data/procurement.ts");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { startingDraft } = await import("../lib/project-scope.ts");

// Every action must return new state and never mutate its input: freeze the sample.
const freeze = (v) => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const sample = freeze(structuredClone(sampleProcurement));
const rule = (fn, pattern) => assert.throws(fn, e => e instanceof ProcurementRuleError && pattern.test(e.message));
const at = "2026-09-24T12:00:00.000Z";
const pkg = (s, id) => s.packages.find(p => p.id === id);
const scope = (s, title) => s.scopes.find(x => x.title.includes(title));

// Sample integrity.
const uniq = (values, what) => assert.equal(new Set(values).size, values.length, `${what} ids must be unique`);
uniq(sample.packages.map(p => p.id), "Package"); uniq(sample.scopes.map(s => s.id), "Scope"); uniq(sample.invitations.map(i => i.id), "Invitation");
const bidderIds = new Set(initialBidders.map(b => b.id));
for (const s of sample.scopes) assert(pkg(sample, s.packageId), `${s.id}: unknown package ${s.packageId}`);
for (const i of sample.invitations) {
  assert(pkg(sample, i.packageId) && bidderIds.has(i.bidderId), `${i.id}: must reference a package and a directory company`);
  assert.equal(initialBidders.find(b => b.id === i.bidderId).trade, pkg(sample, i.packageId).name, `${i.id}: sample invitee trade must match its package`);
}
for (const e of sample.outreach) assert(sample.invitations.some(i => i.packageId === e.packageId && i.bidderId === e.bidderId), `${e.id}: outreach needs an invitation`);
assert.equal(sample.packages.filter(p => p.division === "09").length, 2, "Division 09 is split into sub-trades");
assert.deepEqual(startingDraft("p2", "procurement", sampleProcurement), { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] }, "A new project starts with no procurement data");

// Marcel's brick-anchor case: masonry's estimator moves the item to carpentry; carpentry's owner is tagged.
const anchor = scope(sample, "brick anchors");
const moved = moveScope(approveScope(sample, anchor.id, "Naija", at), anchor.id, "carpentry", "Naija", at);
const movedItem = moved.scopes.find(s => s.id === anchor.id);
assert.deepEqual([movedItem.packageId, movedItem.status, movedItem.history.at(-1).kind], ["carpentry", "draft", "moved"], "A moved item goes back to draft even if it was approved, so the receiving estimator reviews it");
assert.deepEqual(unreadFor(moved, "Vijay").map(n => [n.kind, n.packageId]), [["scope-moved", "carpentry"]]);
assert.match(unreadFor(moved, "Vijay")[0].text, /Naija moved "Furnish and install brick anchors.*from Masonry to Carpentry/);
assert.equal(moveScope(sample, anchor.id, "carpentry", "Vijay", at).notifications.length, sample.notifications.length, "Moving into your own trade tags nobody");
rule(() => moveScope(sample, anchor.id, "masonry", "Naija", at), /already in Masonry/);
rule(() => moveScope(sample, anchor.id, "nope", "Naija", at), /no longer exists/);
assert(!bidForm(moved, "masonry").some(s => s.id === anchor.id) && bidForm(moved, "carpentry").some(s => s.id === anchor.id));

// Apply to all trades: one item, in every bid form, each other owner tagged once.
const dust = scope(sample, "dust-control");
const everywhere = applyScopeToAllTrades(sample, dust.id, "Safi", at);
for (const p of everywhere.packages) assert(bidForm(everywhere, p.id).some(s => s.id === dust.id), `${p.id}: must carry the all-trades item`);
assert.equal(everywhere.scopes.length, sample.scopes.length, "Applying to all trades must not duplicate the item");
assert.deepEqual(everywhere.notifications.slice(sample.notifications.length).map(n => n.recipient).sort(), ["Naija", "Vijay"]);
assert.equal(applyScopeToAllTrades(everywhere, dust.id, "Safi", at), everywhere, "Applying twice is a no-op");
const backToOne = moveScope(everywhere, dust.id, "demolition", "Safi", at);
assert(!backToOne.scopes.find(s => s.id === dust.id).allTrades && !bidForm(backToOne, "concrete").some(s => s.id === dust.id), "Moving an all-trades item returns it to one trade");

// Review → publish → invite, the Wave 2 acceptance path.
assert.equal(packageStatus(sample, "demolition"), "draft");
assert.match(publishBlockers(sample, "demolition").join(" "), /2 scope items are not approved/);
rule(() => publishPackage(sample, "demolition", "Safi", at), /not approved/);
let s = sample;
for (const item of bidForm(s, "demolition")) s = approveScope(s, item.id, "Safi", at);
assert.equal(packageStatus(s, "demolition"), "ready");
s = publishPackage(s, "demolition", "Safi", at);
const demo = pkg(s, "demolition");
assert.deepEqual([demo.published.version, demo.published.items.length, packageStatus(s, "demolition")], [1, 4, "published"]);
assert.deepEqual(s.notifications.slice(sample.notifications.length).map(n => [n.kind, n.recipientType, n.recipient]), [["bid-form-published", "bidder", "b1"]], "Invited bidders are told the bid form is ready");
rule(() => publishPackage(s, "demolition", "Safi", at), /already published/);

// Changing a published form: item goes back to draft, package is "revised", and version 2 re-notifies.
const firstItem = bidForm(s, "demolition")[0];
assert.equal(editScope(s, firstItem.id, { title: `  ${firstItem.title} ` }, "Safi", at), s, "Whitespace-only edits change nothing");
let r = editScope(s, firstItem.id, { detail: "Include the mezzanine partitions." }, "Safi", at);
assert.deepEqual([r.scopes.find(x => x.id === firstItem.id).status, packageStatus(r, "demolition")], ["draft", "revised"]);
rule(() => publishPackage(r, "demolition", "Safi", at), /not approved/);
r = publishPackage(approveScope(r, firstItem.id, "Safi", at), "demolition", "Safi", at);
assert.equal(pkg(r, "demolition").published.version, 2);
assert.match(r.notifications.at(-1).text, /revised \(version 2\)/);
assert.equal(packageStatus(moveScope(s, firstItem.id, "concrete", "Safi", at), "demolition"), "revised", "Moving an item out of a published form revises it");
assert.equal(reopenScope(s, firstItem.id, "Safi", at).scopes.find(x => x.id === firstItem.id).status, "draft");

// Declined companies are not notified; late invitees to a published package are told immediately.
let m = sample;
for (const item of bidForm(m, "mechanical")) m = approveScope(m, item.id, "Vijay", at);
assert.equal(publishPackage(m, "mechanical", "Vijay", at).notifications.length, m.notifications.length, "A declined company is not notified");
rule(() => inviteBidder(s, "demolition", "b1", "Safi", at), /already invited/);
const late = inviteBidder(s, "demolition", "b6", "Safi", at);
assert.equal(late.notifications.at(-1).kind, "invited");
assert.equal(inviteBidder(sample, "masonry", "b6", "Naija", at).notifications.length, sample.notifications.length, "Unpublished package: invitation is recorded, nobody notified yet");

// Invite candidates: trade match by default; a search widens to the whole directory; invited ones drop out.
const withMason = [...initialBidders, { id: "b9", company: "Brick & Block Co.", name: "Dana Ortiz", trade: " masonry " }];
assert.deepEqual(inviteCandidates(sample, withMason, "masonry").map(c => c.id), ["b9"], "Default list is the package's trade, case- and space-insensitive");
assert.deepEqual(inviteCandidates(sample, initialBidders, "concrete").map(c => c.id), [], "District Concrete is already invited");
assert.deepEqual(inviteCandidates(sample, initialBidders, "concrete", "greenline").map(c => c.id), ["b6"]);
assert.deepEqual(inviteCandidates(sample, initialBidders, "steel", "summit").map(c => c.id), [], "Already invited companies never reappear");

// Outreach log and invitation status.
rule(() => logOutreach(sample, { packageId: "masonry", bidderId: "b1", kind: "call", text: "Hi" }, "Naija", at), /Invite this company/);
rule(() => logOutreach(sample, { packageId: "demolition", bidderId: "b1", kind: "note", text: "  " }, "Safi", at), /Write what happened/);
const logged = logOutreach(sample, { packageId: "demolition", bidderId: "b1", kind: "message", text: "Sent the site-visit time." }, "Safi", at);
assert.deepEqual(outreachLog(logged, "demolition", "b1").map(e => e.text), ["Sent the site-visit time.", "Called Michael — confirmed they will bid. Asked about slab removal."], "Newest first");
assert.equal(setInvitationStatus(sample, "inv-3", "declined").invitations.find(i => i.id === "inv-3").status, "declined");
rule(() => setInvitationStatus(sample, "inv-3", "submitted"), /when the company submits it in the portal/);
rule(() => setInvitationStatus(sample, "inv-2", "bidding"), /has submitted a bid/);
assert.equal(markInvitationSubmitted(sample, "inv-3").invitations.find(i => i.id === "inv-3").status, "submitted", "Submitting in the portal marks it");
rule(() => markInvitationSubmitted(sample, "inv-4"), /declined company cannot submit/);
rule(() => markInvitationSubmitted(sample, "inv-x"), /no longer exists/);
rule(() => setInvitationStatus(sample, "inv-x", "declined"), /no longer exists/);

// New items, notifications.
const added = addScope(sample, { packageId: "flooring", title: "  Floor transition strips at every material change. ", source: "A1.1" }, "Vijay", at);
assert.deepEqual([added.scopes.at(-1).title, added.scopes.at(-1).status, added.scopes.at(-1).origin], ["Floor transition strips at every material change.", "draft", "estimator"]);
rule(() => addScope(sample, { packageId: "flooring", title: " " }, "Vijay", at), /Describe/);
assert.equal(unreadFor(markNotificationsRead(moved, moved.notifications.map(n => n.id)), "Vijay").length, 0);

console.log(`Procurement checked: ${sample.packages.length} packages, ${sample.scopes.length} scope items; move, all-trades, review, publish/revise, invitations, outreach.`);
