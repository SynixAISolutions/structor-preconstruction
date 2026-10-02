// Sample schedule for the Jelleff project: the milestones the schedule screen has always shown,
// as linked activities, built by running the real actions (so the dates follow the date-shift
// rule) and given fixed ids. Illustrative dates; the Concrete subcontract milestone matches the
// sample award (executed 2026-09-25).

import { addActivity, addDependency, setProgress, EMPTY_SCHEDULE, type ActivityInput, type Dependency, type ScheduleState } from "../schedule";
import { stableIds } from "./stable-ids";

const at = "2026-09-01T12:00:00.000Z";
const by = "Safi";
type Row = ActivityInput & { code: string; after?: [string, Dependency["type"], number][]; progress?: number };

const rows: Row[] = [
  { code: "A1000", name: "Design development review", phase: "Design", owner: "Safi", start: "2026-09-01", duration: 19, progress: 80 },
  { code: "A1010", name: "Scope packages & bid invitations", phase: "Preconstruction", owner: "Vijay", start: "2026-09-14", duration: 15, progress: 55, after: [["A1000", "SS", 9]] },
  { code: "A1020", name: "Concrete subcontract executed", phase: "Preconstruction", owner: "Vijay", packageId: "concrete", start: "2026-09-25", duration: 0, progress: 100 },
  { code: "A1030", name: "Bid leveling & owner approval", phase: "Preconstruction", owner: "Safi", start: "2026-10-05", duration: 15, after: [["A1010", "FS", 0]] },
  { code: "A1040", name: "GMP approved", phase: "Preconstruction", owner: "Safi", start: "2026-10-23", duration: 0, after: [["A1030", "FS", 0]] },
  { code: "A1050", name: "Award remaining trades", phase: "Procurement", owner: "Vijay", start: "2026-10-26", duration: 10, after: [["A1040", "FS", 0]] },
  { code: "A1060", name: "Long-lead procurement", phase: "Procurement", owner: "Naija", start: "2026-10-26", duration: 40, after: [["A1040", "FS", 0]] },
  { code: "A1070", name: "Mobilization & selective demolition", phase: "Construction", owner: "Vijay", packageId: "demolition", start: "2026-11-09", duration: 25, after: [["A1050", "FS", 0]] },
  { code: "A1080", name: "Foundations & structure", phase: "Construction", owner: "Naija", packageId: "concrete", start: "2026-12-07", duration: 60, after: [["A1070", "SS", 20]] },
  { code: "A1090", name: "Enclosure & interior buildout", phase: "Construction", owner: "Safi", start: "2027-02-01", duration: 100, after: [["A1080", "SS", 40], ["A1060", "FS", 0]] },
  { code: "A1100", name: "Commissioning & turnover", phase: "Construction", owner: "Vijay", start: "2027-06-01", duration: 44, after: [["A1090", "FF", 30]] },
  { code: "A1110", name: "Substantial completion", phase: "Construction", owner: "Safi", start: "2027-07-30", duration: 0, after: [["A1100", "FS", 0]] },
];

let s: ScheduleState = rows.reduce((next, { after: _a, progress: _p, ...input }) => addActivity(next, input, by, at), EMPTY_SCHEDULE);
const idOf = (code: string) => s.activities.find(a => a.code === code)!.id;
for (const row of rows) for (const [pred, type, lag] of row.after ?? []) s = addDependency(s, idOf(row.code), { activityId: idOf(pred), type, lag }, by, at);
for (const row of rows) if (row.progress) s = setProgress(s, idOf(row.code), row.progress, by, at);

/** Jelleff's schedule, with an empty change log (the building steps aren't history). */
export const sampleSchedule: ScheduleState = stableIds({ ...s, log: [] }, "act");
