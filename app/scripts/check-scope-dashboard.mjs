import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const D = await import("../lib/scope-dashboard.ts");
const P = await import("../lib/procurement.ts");

// The scope dashboard (Marcel, 24 Oct: "a scope dashboard like Wire AI's is optional").
assert.deepEqual(["02", "03", "05", "09", "21", "22", "23", "26", "27", "28", "31", "33", "48"].map(D.disciplineOf),
  ["Architectural", "Structural", "Structural", "Architectural", "Fire suppression", "Plumbing", "Mechanical", "Electrical", "Communications", "Electronic safety & security", "Site & civil", "Site & civil", "Other"]);

const by = "Marcel Khoury", at = "2026-11-03T10:00:00.000Z";
let state = { packages: [], scopes: [], invitations: [], outreach: [], notifications: [] };
state = P.addPackage(state, { name: "Electrical", code: "26 00 00", owner: "Walid" });
state = P.addPackage(state, { name: "Concrete", code: "03 30 00" });
state = P.addPackage(state, { name: "Drywall", code: "09 29 00", owner: "Nija" });
const [elec, conc, dry] = state.packages.map(p => p.id);
state = P.addScope(state, { packageId: elec, title: "Feeders" }, by, at);
state = P.addScope(state, { packageId: elec, title: "Lighting" }, by, at);
state = P.addScope(state, { packageId: dry, title: "Partitions" }, by, at);
state = P.approveScope(state, state.scopes[0].id, by, at);
state = P.approveScope(state, state.scopes[2].id, by, at);
state = P.addScope(state, { packageId: conc, title: "General conditions apply" }, by, at);
state = P.applyScopeToAllTrades(state, state.scopes.at(-1).id, by, at);

const board = D.scopeDashboard(state, id => (id === conc ? 4 : 0));
assert.deepEqual(board.rows.map(r => [r.discipline, r.name, r.owner, r.items, r.approved, r.proposed, Math.round(r.progress * 100), r.status]), [
  ["Architectural", "Drywall", "Nija", 2, 1, 0, 50, "draft"],
  ["Structural", "Concrete", "", 1, 0, 4, 0, "draft"],
  ["Electrical", "Electrical", "Walid", 3, 1, 0, 33, "draft"],
], "By discipline then section; each bid form with the line every trade carries, as its status counts it; AI proposals per package");
assert.deepEqual(board.disciplines, [{ name: "Architectural", packages: 1 }, { name: "Structural", packages: 1 }, { name: "Electrical", packages: 1 }]);
assert.deepEqual(board.packages, { total: 3, done: 0, underway: 3, notStarted: 0 }, "Lines approved or proposals waiting in each: all under way, none done while the general line waits");
assert.deepEqual(board.items, { total: 4, approved: 2, needsReview: 2, proposed: 4, progress: 0.5 }, "The general line counted once");
state = P.approveScope(state, state.scopes.at(-1).id, by, at);
assert.deepEqual(D.scopeDashboard(state, () => 0).rows.find(r => r.name === "Drywall").status, "ready", "With the general line approved, Drywall's form is ready");
assert.deepEqual(D.scopeDashboard({ ...state, packages: [], scopes: [] }, () => 0).packages, { total: 0, done: 0, underway: 0, notStarted: 0 }, "No packages yet");

console.log("Scope dashboard checked: disciplines from CSI divisions, every package's progress and status, all-trades lines counted once, AI proposals waiting, the review totals.");
