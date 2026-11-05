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

console.log("check-directory: every trade has companies, saved directories keep their edits, and companies can be added while inviting");
