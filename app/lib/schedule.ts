// Project schedule for ONE project (Operations; demo, browser-only).
//
// Marcel (20 Sep, 23:45): keep the schedule screen. Earlier (17 Sep) he asked to exchange it with
// Primavera P6 and Microsoft Project. This is the schedule behind that screen: activities with
// working-day durations, logic links between them, the date-shift rule, the critical path, and
// Microsoft Project XML in and out (P6 imports and exports the same format), plus CSV out.
//
// CALENDAR: Monday–Friday working days, no holidays. Dates are yyyy-mm-dd. A duration counts
// working days including the start day; 0 makes a milestone (finish = start).
//
// DATE-SHIFT RULE (push only): when an activity moves later or gets longer, every successor that
// would now break its link moves later just enough to satisfy it, and so on down the chain.
// Successors never move earlier on their own — pulling work in is a decision, not a side effect.
// Activities that have started (progress > 0) keep their start date; finished ones don't move.
//
// Pure functions; rule violations throw ScheduleRuleError with field-level errors.

export type LinkType = "FS" | "SS" | "FF" | "SF";
/** `lag` in working days (negative = lead). */
export type Dependency = { activityId: string; type: LinkType; lag: number };

export type Activity = {
  id: string;
  /** Activity ID as P6 shows it, "A1010". */
  code: string;
  name: string;
  /** Grouping for the screen, e.g. "Design", "Preconstruction", "Construction". */
  phase: string;
  owner: string;
  /** The trade package it belongs to, when there is one. */
  packageId: string | null;
  /** First working day. */
  start: string;
  /** Working days; 0 = milestone. */
  duration: number;
  /** 0–100. */
  progress: number;
  /** Predecessors of this activity. */
  predecessors: Dependency[];
};

export type ScheduleLogEntry = { at: string; by: string; action: string; shifted: { id: string; code: string; from: string; to: string }[] };
export type ScheduleState = {
  activities: Activity[];
  /** What each change did, newest last, including activities pushed by the date-shift rule. */
  log: ScheduleLogEntry[];
  /** File the schedule was last imported from, if any. */
  importedFrom: string | null;
};
export const EMPTY_SCHEDULE: ScheduleState = { activities: [], log: [], importedFrom: null };

export type ActivityInput = { name: string; phase?: string; owner?: string; packageId?: string | null; start: string; duration: number; code?: string };
export type ScheduleErrors = Partial<Record<"activity" | "name" | "start" | "duration" | "progress" | "code" | "link" | "lag" | "type" | "file" | "by", string>>;

export class ScheduleRuleError extends Error {
  readonly errors: ScheduleErrors;
  constructor(errors: ScheduleErrors) {
    super(Object.values(errors).join(" "));
    this.name = "ScheduleRuleError";
    this.errors = errors;
  }
}

export const LINK_TYPES: LinkType[] = ["FS", "SS", "FF", "SF"];
const MAX_DURATION = 2000, MAX_LAG = 250, MAX_ACTIVITIES = 2000;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: ScheduleErrors): never => { throw new ScheduleRuleError(errors); };
const check = (errors: ScheduleErrors) => { if (Object.keys(errors).length) fail(errors); };

// ── Working days ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const EPOCH = Date.UTC(2000, 0, 3); // a Monday
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date (Date.parse rolls 2026-02-30 over to March, so it must round-trip). */
export const isDate = (d: unknown): d is string =>
  typeof d === "string" && ISO.test(d) && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;
/** Working-day number; a Saturday or Sunday counts as the following Monday. */
function index(date: string): number {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - EPOCH) / DAY);
  const week = Math.floor(days / 7), weekday = days - week * 7;
  return week * 5 + Math.min(weekday, 5);
}
function dateOf(i: number): string {
  const week = Math.floor(i / 5);
  return new Date(EPOCH + (week * 7 + (i - week * 5)) * DAY).toISOString().slice(0, 10);
}
export const isWorkday = (date: string): boolean => { const d = new Date(`${date}T00:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; };
/** The date `n` working days after (or before, if negative) `date`. A weekend date counts from the next Monday. */
export const addWorkdays = (date: string, n: number): string => dateOf(index(date) + n);
/** Working days from `a` to `b` (positive when b is later). */
export const workdaysBetween = (a: string, b: string): number => index(b) - index(a);
/** Last working day of an activity (its start, for a milestone). */
export const finishOf = (a: Pick<Activity, "start" | "duration">): string => a.duration === 0 ? a.start : addWorkdays(a.start, a.duration - 1);

// ── Logic ───────────────────────────────────────────────────────────────────

const byId = (state: ScheduleState) => new Map(state.activities.map(a => [a.id, a]));
function findActivity(state: ScheduleState, id: string): Activity {
  return state.activities.find(a => a.id === id) ?? fail({ activity: "That activity no longer exists." });
}

/** The earliest start a link allows `succ` (with its duration) after `pred`. */
function earliestStart(pred: Activity, link: Dependency, succ: Pick<Activity, "duration">): string {
  const ps = index(pred.start), pf = index(finishOf(pred));
  const length = Math.max(succ.duration - 1, 0);
  // A finish-to-start successor starts the next working day; a milestone successor sits on the same day.
  const next = succ.duration === 0 ? 0 : 1;
  switch (link.type) {
    case "FS": return dateOf(pf + next + link.lag);
    case "SS": return dateOf(ps + link.lag);
    case "FF": return dateOf(pf + link.lag - length);
    case "SF": return dateOf(ps + link.lag - length);
  }
}

/** Activities in an order where every predecessor comes before its successors. Throws on a loop. */
function topological(activities: Activity[]): Activity[] {
  const ids = new Set(activities.map(a => a.id));
  const indegree = new Map(activities.map(a => [a.id, a.predecessors.filter(p => ids.has(p.activityId)).length]));
  const successors = new Map<string, string[]>();
  for (const a of activities) for (const p of a.predecessors) if (ids.has(p.activityId)) successors.set(p.activityId, [...(successors.get(p.activityId) ?? []), a.id]);
  const queue = activities.filter(a => indegree.get(a.id) === 0).map(a => a.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of successors.get(id) ?? []) { indegree.set(s, indegree.get(s)! - 1); if (indegree.get(s) === 0) queue.push(s); }
  }
  if (order.length !== activities.length) fail({ link: "That link would make a loop: an activity can't depend on itself." });
  const map = new Map(activities.map(a => [a.id, a]));
  return order.map(id => map.get(id)!);
}

/**
 * Applies the date-shift rule to the whole schedule: each not-yet-started activity starts no earlier
 * than its links allow. Returns the schedule and what moved. Nothing ever moves earlier.
 */
export function reschedule(state: ScheduleState): { state: ScheduleState; shifted: ScheduleLogEntry["shifted"] } {
  const placed = new Map<string, Activity>();
  const shifted: ScheduleLogEntry["shifted"] = [];
  for (const a of topological(state.activities)) {
    let start = addWorkdays(a.start, 0); // a weekend start counts as the Monday
    if (a.progress === 0) {
      for (const link of a.predecessors) {
        const pred = placed.get(link.activityId);
        if (!pred) continue;
        const allowed = earliestStart(pred, link, a);
        if (allowed > start) start = allowed;
      }
    }
    if (start !== a.start) shifted.push({ id: a.id, code: a.code, from: a.start, to: start });
    placed.set(a.id, start === a.start ? a : { ...a, start });
  }
  return { state: { ...state, activities: state.activities.map(a => placed.get(a.id)!) }, shifted };
}

function commit(state: ScheduleState, activities: Activity[], action: string, by: string, at: string): ScheduleState {
  const { state: next, shifted } = reschedule({ ...state, activities });
  return { ...next, log: [...next.log, { at, by, action, shifted }] };
}
const needBy = (by: string) => { if (!by?.trim()) fail({ by: "Say who made the change." }); };

// ── Activities ──────────────────────────────────────────────────────────────

function validActivity(input: Partial<ActivityInput>, errors: ScheduleErrors) {
  if (!input.name?.trim()) errors.name = "Name the activity.";
  if (!isDate(input.start)) errors.start = "Choose a start date.";
  if (!(Number.isInteger(input.duration) && input.duration! >= 0 && input.duration! <= MAX_DURATION)) errors.duration = `Use whole working days from 0 (a milestone) to ${MAX_DURATION}.`;
}

const nextCode = (state: ScheduleState) => `A${Math.max(1000, ...state.activities.map(a => Number(a.code.replace(/\D/g, "")) || 0)) + 10}`;

/** A new activity (duration 0 = milestone). A weekend start moves to the Monday. */
export function addActivity(state: ScheduleState, input: ActivityInput, by: string, at = now()): ScheduleState {
  needBy(by);
  const errors: ScheduleErrors = {};
  validActivity(input, errors);
  const code = input.code?.trim() || nextCode(state);
  if (state.activities.some(a => a.code === code)) errors.code = `${code} is already used.`;
  if (state.activities.length >= MAX_ACTIVITIES) errors.activity = `A schedule holds at most ${MAX_ACTIVITIES} activities.`;
  check(errors);
  const activity: Activity = {
    id: newId(), code, name: input.name.trim(), phase: input.phase?.trim() || "General", owner: input.owner?.trim() ?? "",
    packageId: input.packageId ?? null, start: input.start, duration: input.duration, progress: 0, predecessors: [],
  };
  return commit(state, [...state.activities, activity], `Added ${code} ${activity.name}`, by, at);
}

/** Changes name, phase, owner, package, start or duration; successors shift if they must. */
export function editActivity(state: ScheduleState, id: string, patch: Partial<ActivityInput>, by: string, at = now()): ScheduleState {
  needBy(by);
  const a = findActivity(state, id);
  const merged = { name: a.name, phase: a.phase, owner: a.owner, packageId: a.packageId, start: a.start, duration: a.duration, code: a.code, ...patch };
  const errors: ScheduleErrors = {};
  validActivity(merged, errors);
  if (merged.code !== a.code && state.activities.some(x => x.code === merged.code?.trim())) errors.code = `${merged.code} is already used.`;
  const start = isDate(merged.start) ? addWorkdays(merged.start, 0) : merged.start;
  if (!errors.start && patch.start !== undefined) {
    const blocking = a.predecessors.map(link => ({ link, pred: findActivity(state, link.activityId) }))
      .map(x => ({ ...x, allowed: earliestStart(x.pred, x.link, { duration: merged.duration }) })).find(x => x.allowed > start);
    if (blocking && a.progress === 0) errors.start = `${a.code} can't start before ${blocking.allowed}: it follows ${blocking.pred.code} (${blocking.link.type}${blocking.link.lag ? (blocking.link.lag > 0 ? "+" : "") + blocking.link.lag : ""}).`;
  }
  check(errors);
  const next: Activity = { ...a, name: merged.name.trim(), phase: merged.phase?.trim() || "General", owner: merged.owner?.trim() ?? "", packageId: merged.packageId ?? null, start, duration: merged.duration, code: merged.code?.trim() || a.code };
  return commit(state, state.activities.map(x => x.id === id ? next : x), `Changed ${next.code} ${next.name}`, by, at);
}

/** Records progress (0–100). */
export function setProgress(state: ScheduleState, id: string, progress: number, by: string, at = now()): ScheduleState {
  needBy(by);
  const a = findActivity(state, id);
  if (!(Number.isInteger(progress) && progress >= 0 && progress <= 100)) fail({ progress: "Use a whole percent from 0 to 100." });
  if (a.duration === 0 && progress !== 0 && progress !== 100) fail({ progress: "A milestone is either reached (100) or not (0)." });
  return commit(state, state.activities.map(x => x.id === id ? { ...a, progress } : x), `${a.code} ${progress}% complete`, by, at);
}

/** Deletes an activity and every link to it. */
export function removeActivity(state: ScheduleState, id: string, by: string, at = now()): ScheduleState {
  needBy(by);
  const a = findActivity(state, id);
  const rest = state.activities.filter(x => x.id !== id).map(x => ({ ...x, predecessors: x.predecessors.filter(p => p.activityId !== id) }));
  return commit(state, rest, `Removed ${a.code} ${a.name}`, by, at);
}

/** Makes `successorId` depend on `predecessorId`. Successors shift if they must. */
export function addDependency(state: ScheduleState, successorId: string, link: Dependency, by: string, at = now()): ScheduleState {
  needBy(by);
  const succ = findActivity(state, successorId);
  const pred = findActivity(state, link.activityId);
  const errors: ScheduleErrors = {};
  if (pred.id === succ.id) errors.link = "An activity can't follow itself.";
  else if (succ.predecessors.some(p => p.activityId === pred.id)) errors.link = `${succ.code} already follows ${pred.code}.`;
  if (!LINK_TYPES.includes(link.type)) errors.type = "Choose FS, SS, FF or SF.";
  if (!(Number.isInteger(link.lag) && Math.abs(link.lag) <= MAX_LAG)) errors.lag = `Use whole working days between -${MAX_LAG} and ${MAX_LAG}.`;
  check(errors);
  const activities = state.activities.map(x => x.id === succ.id ? { ...succ, predecessors: [...succ.predecessors, { activityId: pred.id, type: link.type, lag: link.lag }] } : x);
  topological(activities);
  return commit(state, activities, `${succ.code} now follows ${pred.code} (${link.type}${link.lag ? (link.lag > 0 ? "+" : "") + link.lag : ""})`, by, at);
}

export function removeDependency(state: ScheduleState, successorId: string, predecessorId: string, by: string, at = now()): ScheduleState {
  needBy(by);
  const succ = findActivity(state, successorId);
  if (!succ.predecessors.some(p => p.activityId === predecessorId)) return state;
  const pred = findActivity(state, predecessorId);
  return commit(state, state.activities.map(x => x.id === succ.id ? { ...succ, predecessors: succ.predecessors.filter(p => p.activityId !== predecessorId) } : x), `${succ.code} no longer follows ${pred.code}`, by, at);
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type ActivityStatus = "not-started" | "in-progress" | "complete";
export type ScheduleRow = Activity & {
  finish: string; milestone: boolean; status: ActivityStatus;
  /** Latest start and finish that don't delay the project finish. */
  lateStart: string; lateFinish: string;
  /** Total float in working days; 0 or less = critical. */
  float: number; critical: boolean;
  /** Past its finish date and not complete. */
  late: boolean;
  /** Should have started by today and hasn't. */
  notStartedOnTime: boolean;
};

/** Latest dates a predecessor can have without delaying a successor at its latest dates. */
function latestFinishFor(pred: Activity, link: Dependency, succ: Activity, lateStart: number): number {
  const length = Math.max(pred.duration - 1, 0);
  const succLength = Math.max(succ.duration - 1, 0);
  const next = succ.duration === 0 ? 0 : 1;
  switch (link.type) {
    case "FS": return lateStart - next - link.lag;
    case "SS": return lateStart - link.lag + length;
    case "FF": return lateStart + succLength - link.lag;
    case "SF": return lateStart + succLength - link.lag + length;
  }
}

/** Every activity with its finish, float, critical flag and status, by start then code. `today` is yyyy-mm-dd. */
export function scheduleRows(state: ScheduleState, today: string): ScheduleRow[] {
  const acts = state.activities;
  if (!acts.length) return [];
  const order = topological(acts);
  const projectFinish = Math.max(...acts.map(a => index(finishOf(a))));
  const lateStart = new Map<string, number>();
  for (const a of [...order].reverse()) {
    const length = Math.max(a.duration - 1, 0);
    let lf = projectFinish;
    for (const s of acts) for (const link of s.predecessors) if (link.activityId === a.id) {
      lf = Math.min(lf, latestFinishFor(a, link, s, lateStart.get(s.id)!));
    }
    lateStart.set(a.id, lf - length);
  }
  return acts.map(a => {
    const finish = finishOf(a);
    const ls = lateStart.get(a.id)!;
    const float = ls - index(a.start);
    const status: ActivityStatus = a.progress >= 100 ? "complete" : a.progress > 0 ? "in-progress" : "not-started";
    return {
      ...a, finish, milestone: a.duration === 0, status, lateStart: dateOf(ls), lateFinish: dateOf(ls + Math.max(a.duration - 1, 0)),
      float, critical: status !== "complete" && float <= 0, late: status !== "complete" && finish < today, notStartedOnTime: status === "not-started" && a.start < today,
    };
  }).sort((x, y) => x.start.localeCompare(y.start) || x.code.localeCompare(y.code));
}

export type ScheduleFilter = { phase?: string; owner?: string; packageId?: string; status?: ActivityStatus; critical?: boolean; late?: boolean; query?: string };
export function filterSchedule(rows: ScheduleRow[], filter: ScheduleFilter = {}): ScheduleRow[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return rows.filter(r => (!filter.phase || r.phase === filter.phase) && (!filter.owner || r.owner === filter.owner)
    && (!filter.packageId || r.packageId === filter.packageId) && (!filter.status || r.status === filter.status)
    && (filter.critical === undefined || r.critical === filter.critical) && (filter.late === undefined || r.late === filter.late)
    && (!q || `${r.code} ${r.name} ${r.phase} ${r.owner}`.toLowerCase().includes(q)));
}

/** Activities happening in the `weeks` from `today` (a look-ahead), unfinished ones only. */
export const lookahead = (rows: ScheduleRow[], today: string, weeks = 3): ScheduleRow[] => {
  const end = addWorkdays(today, weeks * 5 - 1);
  return rows.filter(r => r.status !== "complete" && r.start <= end && r.finish >= today);
};

export type PhaseSummary = { phase: string; start: string; finish: string; activities: number; progress: number; critical: number; late: number };
/** One line per phase, in schedule order. Progress is weighted by duration (milestones count as one day). */
export function phaseSummary(rows: ScheduleRow[]): PhaseSummary[] {
  const phases = [...new Set(rows.map(r => r.phase))];
  return phases.map(phase => {
    const list = rows.filter(r => r.phase === phase);
    const weight = (r: ScheduleRow) => Math.max(r.duration, 1);
    const total = list.reduce((s, r) => s + weight(r), 0);
    return {
      phase, start: list.map(r => r.start).sort()[0], finish: list.map(r => r.finish).sort().at(-1)!, activities: list.length,
      progress: Math.round(list.reduce((s, r) => s + weight(r) * r.progress, 0) / total), critical: list.filter(r => r.critical).length, late: list.filter(r => r.late).length,
    };
  });
}

/** First start, last finish and working days of the whole schedule, or null when empty. */
export function projectSpan(state: ScheduleState): { start: string; finish: string; workdays: number } | null {
  if (!state.activities.length) return null;
  const start = state.activities.map(a => a.start).sort()[0];
  const finish = state.activities.map(finishOf).sort().at(-1)!;
  return { start, finish, workdays: workdaysBetween(start, finish) + 1 };
}

// ── Microsoft Project XML (also read and written by Primavera P6) and CSV ────

const MSP_TYPE: Record<string, LinkType> = { "0": "FF", "1": "FS", "2": "SF", "3": "SS" };
const MSP_CODE: Record<LinkType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
/** One working day of lag in MS Project's tenths of a minute (8-hour day). */
const LAG_UNIT = 4800;
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unescapeXml = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (xml: string, name: string): string | null => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? unescapeXml(m[1].trim()) : null; };

/** The schedule as Microsoft Project XML (MSPDI): phases become summary tasks; owners go in Notes. */
export function toMsProjectXml(state: ScheduleState, projectName: string): string {
  const rows = [...state.activities].sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code));
  const phases = [...new Set(rows.map(a => a.phase))];
  const uid = new Map<string, number>();
  let next = phases.length + 1;
  for (const a of rows) uid.set(a.id, next++);
  const hours = (d: number) => `PT${d * 8}H0M0S`;
  const tasks: string[] = [];
  let id = 1;
  phases.forEach((phase, i) => {
    const list = rows.filter(a => a.phase === phase);
    const start = list.map(a => a.start).sort()[0], finish = list.map(finishOf).sort().at(-1)!;
    tasks.push(`<Task><UID>${i + 1}</UID><ID>${id++}</ID><Name>${escapeXml(phase)}</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary><Start>${start}T08:00:00</Start><Finish>${finish}T17:00:00</Finish></Task>`);
    for (const a of list) {
      const links = a.predecessors.filter(p => uid.has(p.activityId)).map(p =>
        `<PredecessorLink><PredecessorUID>${uid.get(p.activityId)}</PredecessorUID><Type>${MSP_CODE[p.type]}</Type><LinkLag>${p.lag * LAG_UNIT}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`).join("");
      tasks.push(`<Task><UID>${uid.get(a.id)}</UID><ID>${id++}</ID><Name>${escapeXml(a.name)}</Name><WBS>${escapeXml(a.code)}</WBS><OutlineLevel>2</OutlineLevel><Summary>0</Summary>`
        + `<Milestone>${a.duration === 0 ? 1 : 0}</Milestone><Start>${a.start}T08:00:00</Start><Finish>${finishOf(a)}T17:00:00</Finish><Duration>${hours(a.duration)}</Duration><DurationFormat>7</DurationFormat>`
        + `<PercentComplete>${a.progress}</PercentComplete>${a.owner ? `<Notes>Owner: ${escapeXml(a.owner)}</Notes>` : ""}${links}</Task>`);
    }
  });
  const start = rows.length ? rows.map(a => a.start).sort()[0] : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><Name>${escapeXml(projectName)}</Name>`
    + `${start ? `<StartDate>${start}T08:00:00</StartDate>` : ""}<MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><Tasks>\n${tasks.join("\n")}\n</Tasks></Project>\n`;
}

export type ImportResult = { activities: Activity[]; warnings: string[] };

/**
 * Reads a Microsoft Project XML file (as saved by MS Project or exported from P6). Summary tasks
 * become phases; leaf tasks become activities with their links. Untrusted input: size and count are
 * capped, and anything unusable is skipped with a warning rather than guessed.
 */
export function parseMsProjectXml(xml: string): ImportResult {
  if (typeof xml !== "string" || xml.length > 10 * 1024 * 1024) fail({ file: "The file is too large (10 MB at most)." });
  if (!/<Project[\s>]/.test(xml) || !/<Tasks>/.test(xml)) fail({ file: "This is not a Microsoft Project XML file. In P6 or MS Project, save or export as XML." });
  const blocks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
  if (blocks.length > MAX_ACTIVITIES) fail({ file: `The file has ${blocks.length} tasks; at most ${MAX_ACTIVITIES} can be imported.` });
  const warnings: string[] = [];
  const phaseAt: string[] = [];
  const pending: { uid: string; activity: Activity; links: { uid: string; type: LinkType; lag: number }[] }[] = [];
  const summaries = new Set<string>();
  const codes = new Set<string>();
  for (const block of blocks) {
    const uid = tag(block, "UID") ?? "";
    const name = tag(block, "Name") ?? "";
    const level = Number(tag(block, "OutlineLevel") ?? "1");
    if (tag(block, "Summary") === "1" || level === 0) {
      summaries.add(uid);
      if (level >= 1) { phaseAt[level] = name || "Imported"; phaseAt.length = level + 1; }
      continue;
    }
    const start = (tag(block, "Start") ?? "").slice(0, 10), finish = (tag(block, "Finish") ?? "").slice(0, 10);
    if (!name || !isDate(start)) { warnings.push(`Skipped a task without a name or start date${name ? ` (${name})` : ""}.`); continue; }
    const milestone = tag(block, "Milestone") === "1";
    const hoursMatch = (tag(block, "Duration") ?? "").match(/^PT(\d+)H(\d+)M/);
    let duration = milestone ? 0 : hoursMatch ? Math.round((Number(hoursMatch[1]) + Number(hoursMatch[2]) / 60) / 8) : isDate(finish) ? workdaysBetween(start, finish) + 1 : 1;
    if (!milestone && duration < 1) duration = 1;
    if (duration > MAX_DURATION) { warnings.push(`${name}: duration capped at ${MAX_DURATION} working days.`); duration = MAX_DURATION; }
    const progress = Math.min(100, Math.max(0, Math.round(Number(tag(block, "PercentComplete") ?? 0) || 0)));
    let code = (tag(block, "WBS") ?? "").trim().slice(0, 40);
    if (!code || codes.has(code)) code = `A${1000 + (pending.length + 1) * 10}`;
    codes.add(code);
    const owner = (tag(block, "Notes") ?? "").match(/^Owner:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const links = (block.match(/<PredecessorLink>[\s\S]*?<\/PredecessorLink>/g) ?? []).map(l => ({
      uid: tag(l, "PredecessorUID") ?? "", type: MSP_TYPE[tag(l, "Type") ?? "1"] ?? "FS", lag: Math.max(-MAX_LAG, Math.min(MAX_LAG, Math.round(Number(tag(l, "LinkLag") ?? 0) / LAG_UNIT) || 0)),
    }));
    pending.push({
      uid, links,
      activity: { id: newId(), code, name: name.slice(0, 200), phase: (phaseAt.slice(1).filter(Boolean).at(-1) ?? "Imported").slice(0, 80), owner: owner.slice(0, 80), packageId: null, start: addWorkdays(start, 0), duration, progress: milestone && progress > 0 ? 100 : progress, predecessors: [] },
    });
  }
  if (!pending.length) fail({ file: "The file has no tasks to import." });
  const byUid = new Map(pending.map(p => [p.uid, p.activity.id]));
  const activities = pending.map(p => ({
    ...p.activity,
    predecessors: p.links.flatMap(l => {
      if (summaries.has(l.uid)) { warnings.push(`${p.activity.code}: a link to a summary task was dropped.`); return []; }
      const id = byUid.get(l.uid);
      if (!id || id === p.activity.id) { warnings.push(`${p.activity.code}: a link to a missing task was dropped.`); return []; }
      return [{ activityId: id, type: l.type, lag: l.lag }];
    }),
  }));
  try { topological(activities); } catch { fail({ file: "The file's links form a loop; fix it in P6 or MS Project and export again." }); }
  return { activities, warnings };
}

/** Replaces the schedule with imported activities, applying the date-shift rule. */
export function replaceSchedule(state: ScheduleState, imported: ImportResult, fileName: string, by: string, at = now()): ScheduleState {
  needBy(by);
  if (!imported.activities.length) fail({ file: "Nothing to import." });
  const { state: next, shifted } = reschedule({ ...state, activities: imported.activities });
  return { ...next, importedFrom: fileName.trim() || "schedule.xml", log: [...state.log, { at, by, action: `Imported ${imported.activities.length} activities from ${fileName.trim() || "schedule.xml"}`, shifted }] };
}

/** The schedule as CSV for Excel: one row per activity, predecessors as "A1010 FS+2". */
export function toCsv(state: ScheduleState, today: string): string {
  const rows = scheduleRows(state, today);
  const codeOf = new Map(state.activities.map(a => [a.id, a.code]));
  const cell = (v: string | number | boolean) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const header = ["Activity ID", "Activity", "Phase", "Owner", "Start", "Finish", "Working days", "Progress %", "Predecessors", "Total float", "Critical"];
  const lines = rows.map(r => [r.code, r.name, r.phase, r.owner, r.start, r.finish, r.duration, r.progress,
    r.predecessors.map(p => `${codeOf.get(p.activityId)} ${p.type}${p.lag ? (p.lag > 0 ? "+" : "") + p.lag : ""}`).join("; "), r.float, r.critical ? "Yes" : "No"].map(cell).join(","));
  return [header.join(","), ...lines].join("\n") + "\n";
}
