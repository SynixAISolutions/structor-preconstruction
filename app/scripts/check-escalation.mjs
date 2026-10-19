import assert from "node:assert/strict";
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
const E = await import("../lib/escalation.ts");

assert.equal(E.seriesFor("09 29 00").id, "WPU1371");
assert.equal(E.seriesFor("03300").id, "WPU1333");
assert.equal(E.seriesFor("31 00 00"), E.GENERAL_SERIES, "No material series: the general construction-inputs index");
assert.equal(E.seriesFor(null), E.GENERAL_SERIES);
assert.equal(E.midpoint("2027-01-15", "2028-01-15"), "2027-07");
assert.equal(E.midpoint("2028-01-15", "2027-01-15"), null);
assert.equal(E.midpoint("", "2027-01-15"), null);

// 33 months, +1% a month from 100 (Jan 2024 → Sep 2026).
const points = Array.from({ length: 33 }, (_, i) => ({ month: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`, value: Math.round(100 * 1.01 ** i * 1000) / 1000 }));
const gypsum = E.seriesFor("09 29 00");
const toLatest = E.escalation(gypsum, points, "2024-03-10", "2026-09-30");
assert.equal(toLatest.from.month, "2024-03");
assert.ok(Math.abs(toLatest.measured - (1.01 ** 30 - 1)) < 1e-4, "Measured from the cost's month to the latest published month");
assert.equal(toLatest.projected, 0);
assert.match(toLatest.note, /^Gypsum products \(BLS WPU1371\): Mar 2024 102\.01 → Sep 2026 [\d.]+ \(\+34\.8%\)\.$/);
const toMidpoint = E.escalation(gypsum, points, "2024-03-10", "2027-06-15");
assert.ok(Math.abs(toMidpoint.annualRate - (1.01 ** 12 - 1)) < 1e-4, "Trailing 12-month rate");
assert.ok(Math.abs(toMidpoint.projected - ((1.01 ** 12) ** (9 / 12) - 1)) < 1e-4, "9 months past the latest at that rate");
assert.equal(toMidpoint.factor, Math.round((1 + toMidpoint.measured) * (1 + toMidpoint.projected) * 10000) / 10000);
assert.match(toMidpoint.note, /Jun 2027 projected at the trailing 12-month rate \+12\.7%\/yr: \+9\.4% more \(an assumption\)\.$/);
const earlier = E.escalation(gypsum, points, "2024-03-10", "2025-03-01");
assert.ok(Math.abs(earlier.measured - (1.01 ** 12 - 1)) < 1e-4, "A target before the latest month is measured to that month");
assert.equal(E.escalation(gypsum, points, "2023-05-01", "2026-09-01"), null, "No index for the cost's month");
assert.equal(E.escalation(gypsum, [], "2024-03-01", "2026-09-01"), null);
const short = E.escalation(gypsum, points.slice(0, 6), "2024-01-01", "2024-12-01");
assert.equal(short.projected, 0);
assert.match(short.note, /nothing projected past Jun 2024 \(no 12-month history\)/);

// BLS v1 payload: monthly values kept, annual averages (M13) and bad values dropped.
const parsed = E.parseBls({ status: "REQUEST_SUCCEEDED", Results: { series: [{ seriesID: "WPU1371", data: [{ year: "2026", period: "M09", value: "488.936" }, { year: "2025", period: "M13", value: "470" }, { year: "2026", period: "M08", value: "-" }] }] } });
assert.deepEqual(parsed, { WPU1371: [{ month: "2026-09", value: 488.936 }] });
assert.deepEqual(E.parseBls(null), {});

console.log("Escalation checked: series by division, midpoint, measured change, trailing-rate projection labelled as an assumption, no data, BLS parsing.");
