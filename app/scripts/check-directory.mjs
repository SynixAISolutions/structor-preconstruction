import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);

const { initialBidders, sampleTradeCompanies, trades } = await import("../lib/data/commercial.ts");
const { STANDARD_TRADES, addPackage, inviteBidder, inviteCandidates } = await import("../lib/procurement.ts");
const { newDirectoryCompany, withStartingCompanies } = await import("../lib/directory.ts");

// Every standard trade has companies to invite, on a project that starts with nothing.
const empty = { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] };
for (const trade of STANDARD_TRADES) {
  const state = addPackage(empty, { id: trade.id, name: trade.name, code: trade.code });
  const suggested = inviteCandidates(state, initialBidders, trade.id);
  assert(suggested.length >= 2, `${trade.name}: at least two companies are suggested`);
  assert(trades.includes(trade.name), `${trade.name}: a company can be listed under it`);
}

// Inviting the older sample companies still leaves someone to invite: this is what the Concrete popup showed empty.
let concrete = addPackage(empty, { id: "concrete", name: "Concrete", code: "03 30 00" });
for (const id of ["b2", "demo-c2"]) concrete = inviteBidder(concrete, "concrete", id, "Marcel Khoury");
assert.deepEqual(inviteCandidates(concrete, initialBidders, "concrete").map(c => c.company), ["Concrete Contractor 1 (sample)", "Concrete Contractor 2 (sample)"]);

// The placeholders can't be mistaken for real companies or reach a real inbox.
assert.equal(sampleTradeCompanies.length, STANDARD_TRADES.length * 2);
for (const company of sampleTradeCompanies) {
  assert.match(company.company, /\(sample\)$/);
  assert.match(company.email, /@example\.com$/);
}
assert.equal(new Set(initialBidders.map(c => c.id)).size, initialBidders.length, "Company ids are unique");
assert.equal(new Set(initialBidders.map(c => c.email)).size, initialBidders.length, "Company emails are unique");

// A directory saved earlier gets what it's missing, and keeps what was edited or added.
const edited = { ...initialBidders[1], email: "real@district-concrete.test" };
const own = { id: "own", company: "Real Co", name: "Pat", email: "pat@real.test", trade: "Tile", location: "", status: "Qualified" };
const merged = withStartingCompanies([edited, own]);
assert.deepEqual(merged.slice(0, 2), [edited, own], "Saved companies stay first and unchanged");
assert.equal(merged.filter(c => c.id === edited.id).length, 1, "No company is added twice");
assert.equal(merged.length, initialBidders.length + 1, "Every starting company is there, plus the company's own");
assert.equal(withStartingCompanies([]).length, initialBidders.length, "An emptied directory fills again");
assert.equal(withStartingCompanies(merged), merged, "Nothing missing: the same array, so nothing is saved");

// A company typed in while inviting.
const typed = { company: "  Keystone Concrete ", name: " Sam Reed ", email: " sam@keystone.test ", location: " " };
const added = newDirectoryCompany(initialBidders, typed, "Concrete", "new-1");
assert.deepEqual(added, { id: "new-1", company: "Keystone Concrete", name: "Sam Reed", email: "sam@keystone.test", trade: "Concrete", location: "", status: "Review required" });
assert.deepEqual(inviteCandidates(concrete, [added], "concrete"), [added], "It shows up for that trade from then on");
assert.throws(() => newDirectoryCompany(initialBidders, { ...typed, company: " " }, "Concrete"), /company name/);
assert.throws(() => newDirectoryCompany(initialBidders, { ...typed, name: "" }, "Concrete"), /contact name/);
assert.throws(() => newDirectoryCompany(initialBidders, { ...typed, email: "" }, "Concrete"), /email address/);
assert.throws(() => newDirectoryCompany(initialBidders, { ...typed, company: "district concrete" }, "Concrete"), /already in your directory, under Concrete/);

// A company the team took out stays out when the app opens again; only starting companies need remembering.
const { removedCompanies } = await import("../lib/directory.ts");
assert.deepEqual(removedCompanies([], "sample-tile-1"), ["sample-tile-1"]);
assert.deepEqual(removedCompanies(["sample-tile-1"], "sample-tile-1"), ["sample-tile-1"], "Remembered once");
assert.deepEqual(removedCompanies([], "new-1"), [], "A company someone typed in can't come back by itself");
const without = withStartingCompanies([], ["sample-tile-1"]);
assert(!without.some(c => c.id === "sample-tile-1"), "Removed: not added back");
assert(without.some(c => c.id === "sample-tile-2"), "Others still arrive");
assert.equal(withStartingCompanies(without, ["sample-tile-1"]), without, "Nothing to save on the next open");

// Removing an invited company takes its bid, messages and notes, and nothing of anyone else's.
const R = await import("../lib/remove-company.ts");
const invite = (id, packageId, bidderId) => ({ id, packageId, bidderId, status: "submitted", invitedAt: "2026-11-05", by: "Marcel Khoury" });
const note = (recipient, packageId, recipientType = "bidder") => ({ id: `${recipient}-${packageId}`, kind: "invited", recipientType, recipient, packageId, text: "", at: "", read: false });
const log = (bidderId, packageId) => ({ id: `${bidderId}-${packageId}`, packageId, bidderId, kind: "note", text: "", at: "", by: "" });
const before = {
  packages: [], scopes: [],
  invitations: [invite("i1", "concrete", "x"), invite("i2", "tile", "x"), invite("i3", "concrete", "y")],
  outreach: [log("x", "concrete"), log("x", "tile"), log("y", "concrete")],
  notifications: [note("x", "concrete"), note("x", "tile"), note("y", "concrete"), note("Victor", "concrete", "team")],
};
const after = R.removeInvitation(before, "i1");
assert.deepEqual(after.invitations.map(i => i.id), ["i2", "i3"]);
assert.deepEqual(after.outreach.map(o => o.id), ["x-tile", "y-concrete"], "Its notes on this trade go; its other trades and other companies stay");
assert.deepEqual(after.notifications.map(n => n.id), ["x-tile", "y-concrete", "Victor-concrete"], "The team's own record of the trade stays");
assert.equal(R.removeInvitation(before, "nope"), before, "Already gone: nothing changes");

const bids = [{ id: "s1", invitationId: "i1" }, { id: "s3", invitationId: "i3" }];
assert.deepEqual(R.withoutBid(bids, "i1").map(s => s.id), ["s3"]);
assert.equal(R.withoutBid(bids, "i9"), bids, "No bid: nothing to save");
const thread = [{ id: "m1", invitationId: "i1" }, { id: "m3", invitationId: "i3" }];
assert.deepEqual(R.withoutThread(thread, "i1").map(m => m.id), ["m3"]);
assert.equal(R.withoutThread(thread, "i9"), thread);

// Its row leaves Bid leveling too.
const saved = { concrete: { project: {}, items: [], bidders: [{ id: "a" }, { id: "b" }], provenance: { a: { submissionId: "s1" }, b: { submissionId: "s3" } } } };
const stripped = R.withoutComparisonBid(saved, "concrete", "s1");
assert.deepEqual([stripped.concrete.bidders.map(b => b.id), Object.keys(stripped.concrete.provenance)], [["b"], ["b"]]);
assert.equal(R.withoutComparisonBid(saved, "concrete", "s9"), saved, "Not loaded: nothing to save");
assert.equal(R.withoutComparisonBid(saved, "tile", "s1"), saved, "No saved comparison for that trade");
assert.deepEqual(Object.keys(R.withoutProvenance(saved.concrete.provenance, "s1")), ["b"]);

// An awarded company stays until the award is cancelled.
const concreteX = before.invitations[0];
assert.match(R.removalBlocker(concreteX, [{ packageId: "concrete", bidderId: "x", cancelled: null }]), /awarded/);
assert.equal(R.removalBlocker(concreteX, [{ packageId: "concrete", bidderId: "x", cancelled: { by: "Marcel" } }]), null, "A cancelled award doesn't block");
assert.equal(R.removalBlocker(concreteX, [{ packageId: "tile", bidderId: "x", cancelled: null }, { packageId: "concrete", bidderId: "y", cancelled: null }]), null, "Another trade's or company's award doesn't block");

// A company still invited anywhere stays in the directory, because screens find its name by id.
const projects = [{ name: "Project 1", procurement: before }, { name: "Project 2", procurement: { invitations: [] } }, { name: "Project 1", procurement: before }];
assert.deepEqual(R.projectsInviting("x", projects), ["Project 1"], "Each project named once");
assert.deepEqual(R.projectsInviting("z", projects), []);

console.log("check-directory: every trade has companies, saved directories keep their edits, companies can be added while inviting, and removing one takes only what's its own");
