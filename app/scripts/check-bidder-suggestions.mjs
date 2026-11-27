// Suggested bidders (Marcel's Software Features list, item 5): a trade's companies ranked by the project's required
// certifications and type, with the reasons shown. Checked against Project 1's real fields and the real starting directory.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const S = await import("../lib/bidder-suggestions.ts");
const { sampleProjectRecords, PROJECT_TYPES } = await import("../lib/projects.ts");
const { initialBidders } = await import("../lib/data/commercial.ts");
const { companiesToOffer } = await import("../lib/directory.ts");

const p1 = sampleProjectRecords.find(p => p.id === "jelleff");
assert.ok(p1, "Project 1 is a sample project");
const fit = { type: p1.type, certifications: p1.certifications, location: p1.location };
assert.equal(fit.type, "Community & recreation");
assert.deepEqual(fit.certifications, ["First Source"]);

// States from locations as the directory and projects write them.
assert.equal(S.stateOf("Washington, DC"), "DC");
assert.equal(S.stateOf("Arlington, VA"), "VA");
assert.equal(S.stateOf("Somewhere"), "");

// The real starting directory's Drywall companies, offered as the app offers them (lib/directory companiesToOffer):
// on Project 1, the sample project, they are all offered; on a real project none are (every starting company has an
// @example.com email, so it counts as a placeholder) and only companies the team added appear.
const offered = sample => companiesToOffer(initialBidders, sample).filter(b => b.trade === "Drywall").map(b => ({ ...b }));
assert.equal(offered(false).length, 0);
const drywall = offered(true);
assert.equal(drywall.length, 5);
const rock = drywall.find(b => b.company === "Rock Creek Interiors");
rock.certifications = [{ program: "First Source", percent: 100 }];
rock.projectTypes = ["Community & recreation", "Education"];
const ranked = S.rankBidders(drywall, fit);
assert.equal(ranked[0].company.company, "Rock Creek Interiors", "the certified company that does this kind of project comes first, though it isn't local");
assert.deepEqual(ranked[0].reasons, ["First Source 100%", "Does Community & recreation work", "Qualified"]);
// Then the Qualified DC companies (ties alphabetical), then the Qualified Maryland one.
assert.deepEqual(ranked.slice(1).map(r => r.company.company), ["Capitol Wall Systems", "Drywall Contractor 1 (sample)", "Drywall Contractor 2 (sample)", "Anacostia Partitions"]);
assert.deepEqual(ranked[1].reasons, ["Qualified", "Local (DC)"]);
assert.deepEqual(ranked.at(-1).reasons, ["Qualified"]);

// A certification at 0% doesn't count; program names match regardless of case and spacing.
assert.deepEqual(S.suggestionReasons({ id: "x", company: "X", certifications: [{ program: "first  source", percent: 0 }] }, fit).reasons, []);
assert.deepEqual(S.suggestionReasons({ id: "y", company: "Y", certifications: [{ program: "first  source", percent: 35 }] }, fit).reasons, ["first  source 35%"]);
// "Review required" sinks a company below an otherwise equal one.
const review = S.rankBidders([{ id: "a", company: "A", status: "Review required" }, { id: "b", company: "B", status: "Invited" }], fit);
assert.deepEqual(review.map(r => r.company.id), ["b", "a"]);
// A project with no requirements still lists every company, alphabetically by fit.
assert.equal(S.rankBidders(drywall, { type: "", certifications: [], location: "" }).length, 5);

// Directory form values are kept to the app's project types.
assert.deepEqual(S.cleanProjectTypes(["education", "Education", "Spaceport", " Mixed-use "], PROJECT_TYPES), ["Education", "Mixed-use"]);

console.log("Bidder suggestions checked: Project 1's First Source and type on the real Drywall directory, reasons, 0% and spelling, review status, empty projects, directory project types.");
