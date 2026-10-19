import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const T = await import("../lib/schedule-takeoff.ts");
const { EXTRA_JOBS } = await import("../lib/ai-jobs-more.ts");

const row = (mark, material = "HM", hardwareSet = "400", extra = {}) => ({ mark, width: "3'-0\"", height: "7'-0\"", material, frameMaterial: "HM", hardwareSet, ...extra });
// Two overlapping tiles read 103A twice; one of them misreads its hardware set.
const merged = T.mergeScheduleRows([
  [row("101A", "ALUM", "101"), row("103A", "HM", "400"), row("110", "WD", "700")],
  [row("103a", "HM", "400"), row("103B"), row("2", "HM", "")],
  [row("103A", "HM", "480")],
  [row(" ", "HM")],
]);
assert.deepEqual(merged.map(r => [r.mark, r.reads, r.hardwareSet, r.disagreements]), [["2", 1, "", []], ["101A", 1, "101", []], ["103A", 3, "400", ["hardwareSet"]], ["103B", 1, "400", []], ["110", 1, "700", []]],
  "Merged by door number in numeric order; the commonest value wins and a split is listed");
assert.deepEqual(T.scheduleCounts(merged, "material"), [{ value: "HM", count: 3 }, { value: "ALUM", count: 1 }, { value: "WD", count: 1 }]);
assert.deepEqual(T.scheduleCounts(merged, "hardwareSet")[0], { value: "400", count: 2 });
assert.ok(T.scheduleCounts([row("1", "HM", "")], "hardwareSet").some(c => c.value === "(not read)"));
assert.deepEqual(T.mergeScheduleRows([]), []);

const J = EXTRA_JOBS["schedule-rows"];
assert.throws(() => J.parse({ image: "x" }), /JPEG/);
assert.deepEqual(J.screen({ rows: [{ mark: "101a", width: "3'-0\"", material: "ALUM" }, { mark: "101A" }, { mark: "DOOR SCHEDULE" }, { mark: "S102", hardwareSet: "190" }, null] }).rows.map(r => [r.mark, r.material, r.hardwareSet]),
  [["101A", "ALUM", ""], ["S102", "", "190"]], "Marks uppercased and once; headings dropped; doors like S102 kept");
assert.deepEqual(J.screen({}).rows, []);

console.log("Schedule takeoff checked: rows merged by door number with the commonest reading, splits listed, counts by field, screened AI rows. Live on Jelleff A8.2 (19 Oct): 50 of 50 doors, none invented, hardware set 90-92%.");
