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

// A concept budget's history escalates trade by trade, weighted by cost: steel-heavy follows steel.
const flat = (id, v0, v1) => ({ [id]: [{ month: "2022-07", value: v0 }, { month: "2026-09", value: v1 }] });
const pts = { ...flat("WPU101", 100, 150), ...flat("WPU1371", 100, 110) }; // steel +50%, gypsum +10%
const hist = E.historyEscalation([{ name: "School 2022", year: 2022, lines: [{ csiCode: "05 12 00", amount: 300 }, { csiCode: "09 29 00", amount: 100 }, { csiCode: "11 00 00", amount: 50 }, { csiCode: null, amount: 0 }] }], pts, "2026-09");
assert.deepEqual([hist.factor, hist.rows.map(r => [r.division, r.amount, r.escalation.factor]), hist.missing], [1.4, [["05", 300, 1.5], ["09", 100, 1.1]], ["School 2022 · division 11"]], "(300 × 1.5 + 100 × 1.1) / 400; a division with no index data is listed, not guessed");
assert.equal(E.historyEscalation([], pts, "2026-09").factor, null);

// Applying it: each record keeps its own factor (an older record escalates more), with the target and a basis naming the indexes.
const two = E.historyEscalation([{ id: "a", name: "School 2022", year: 2022, lines: [{ csiCode: "05", amount: 300 }, { csiCode: "09", amount: 100 }] }, { id: "b", name: "Gym", year: 2022, lines: [{ csiCode: "09", amount: 100 }, { csiCode: "11", amount: 50 }] }], pts, "2026-09");
const applied = E.conceptEscalation(two);
assert.deepEqual([applied.byRecord, applied.target], [{ a: 1.4, b: 1.1 }, "2026-09"]);
assert.match(applied.basis, /WPU101, WPU1371.*an assumption.*no index data: Gym · division 11/);
assert.equal(E.conceptEscalation({ rows: [], missing: [] }), null);

console.log("Escalation checked: series by division, midpoint, measured change, trailing-rate projection labelled as an assumption, no data, BLS parsing, cost-weighted history escalation, per-record factors to apply.");
