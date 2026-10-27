import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const R = await import("../lib/leveling-refresh.ts");
const G = await import("../lib/bid-gap-cost.ts");

// Refresh says what came in (Marcel, 24 Oct: pressing refresh looked like it did nothing).
const names = { a: "Bidder A", b: "Bidder B", c: "Bidder C" };
const before = { a: { revisionNumber: 1 }, b: { revisionNumber: 2 } };
assert.deepEqual(R.refreshChanges(before, before, names), [], "Same revisions: nothing changed");
const changes = R.refreshChanges(before, { a: { revisionNumber: 1 }, b: { revisionNumber: 3 }, c: { revisionNumber: 1 } }, names);
assert.deepEqual(changes, [
  { bidderId: "b", name: "Bidder B", kind: "revised", revision: 3 },
  { bidderId: "c", name: "Bidder C", kind: "new", revision: 1 },
]);
assert.deepEqual(R.refreshChanges({}, { a: { revisionNumber: 2 } }, {}).map(c => [c.kind, c.name]), [["new", "A bidder"]], "A bidder with no name still counts");

assert.match(R.refreshMessage([], "2026-10-27T12:01:00", "Concrete"), /^No new bids for Concrete since 12:01 PM\.$/);
assert.equal(R.refreshMessage([], null, "Concrete"), "No new bids for Concrete.");
assert.equal(R.refreshMessage(changes, null, "Concrete"), "1 new bid from Bidder C; 1 revised bid from Bidder B (revision 3). Review them before ranking.");
const three = ["a", "b", "c"].map(id => ({ bidderId: id, name: names[id], kind: "new", revision: 1 }));
assert.equal(R.refreshMessage(three, null, "Concrete"), "3 new bids from Bidder A, Bidder B and Bidder C. Review them before ranking.");

// A plug is an adjustment priced from a quantity and unit rate, which the plug dialog writes into the note.
const plugged = G.approveGapCost({ status: "N", note: "Excludes curbs", adjustment: 0 }, { quantity: 120, unit: "LF", rate: 18.5, source: "Takeoff T-3" }, true);
assert(R.isPlug(plugged), "The plug dialog's adjustment is a plug");
assert.equal(R.plugBasis(plugged.note), "120 LF × $18.5 = $2220.00. Takeoff T-3", "The basis line, without the bidder's own note");
assert(!R.isPlug({ adjustment: 500, note: "Allowance per phone call" }), "A typed adjustment is not a plug");
assert(!R.isPlug({ adjustment: 0, note: "Cost basis: 1 EA × $0 = $0" }), "No amount, no plug");
assert.equal(R.plugBasis("No basis here"), "");

console.log("Leveling refresh checked: new and revised bids by name, \"no new bids since\" wording, plugs told apart from typed adjustments.");
