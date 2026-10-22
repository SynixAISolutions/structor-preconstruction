// Schedule activities that follow procurement (Danial, 22 Oct: buyout progress and bid dates from the
// bid packages). An activity tied to a trade package (lib/schedule `procurement`) takes:
//   "bids-due": the package's bid due date (Bid packages), as a milestone reached once that date has
//      come and at least one bid is in.
//   "buyout": its progress from the trade's buyout: up to 50% as the companies still invited submit
//      bids, 75% once the trade is awarded, 100% when its subcontract is executed. A buyout milestone
//      is reached only at the executed subcontract.
// Nothing is written into the schedule: every page reads procurementSchedule, and when a bid due date
// moves later, the activities linked after it move with it (the push-only date-shift rule).

import { activeAward, awardStage, type AwardState } from "./award";
import type { Procurement } from "./procurement";
import { addBuyoutActivities, addWorkdays, isDate, reschedule, type ProcurementLink, type ScheduleState } from "./schedule";

export type ProcurementSource = {
  kind: ProcurementLink;
  /** Where the date or progress comes from, in words. */
  detail: string;
  /** The bid due date the milestone sits on (bids-due), or null. */
  date: string | null;
  progress: number;
};
export type ProcurementSchedule = { state: ScheduleState; sources: Record<string, ProcurementSource> };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Trade packages without a buyout activity and bids-due milestone. */
export const packagesWithoutBuyout = (state: ScheduleState, procurement: Procurement) =>
  procurement.packages.filter(pkg => !(["bids-due", "buyout"] as const).every(kind => state.activities.some(a => a.packageId === pkg.id && a.procurement === kind && (kind === "bids-due" || a.duration > 0))));

/** addBuyoutActivities for every trade package, the buyout starting when its first company was invited. */
export function addProcurementActivities(state: ScheduleState, procurement: Procurement, today: string, by: string, at?: string): ScheduleState {
  const packages = procurement.packages.map(pkg => {
    const invited = procurement.invitations.filter(i => i.packageId === pkg.id).map(i => i.invitedAt.slice(0, 10)).filter(isDate).sort();
    return { ...pkg, bidsFrom: invited[0] ?? null };
  });
  return addBuyoutActivities(state, packages, today, by, at);
}

/** The schedule as every page reads it: activities that follow procurement carry its dates and progress. `today` is yyyy-mm-dd. */
export function procurementSchedule(state: ScheduleState, input: { procurement: Procurement; awards: AwardState }, today: string): ProcurementSchedule {
  const sources: Record<string, ProcurementSource> = {};
  const pinned = new Map<string, string>();
  const activities = state.activities.map(a => {
    const kind = a.procurement;
    if (!kind || !a.packageId) return a;
    const pkg = input.procurement.packages.find(p => p.id === a.packageId);
    if (!pkg) { sources[a.id] = { kind, detail: "Its trade package no longer exists; the activity keeps its own dates and progress.", date: null, progress: a.progress }; return a; }
    const invited = input.procurement.invitations.filter(i => i.packageId === pkg.id && i.status !== "declined");
    const received = invited.filter(i => i.status === "submitted").length;
    if (kind === "bids-due") {
      const due = isDate(pkg.due) ? pkg.due : null;
      const progress = due && due <= today && received > 0 ? 100 : 0;
      sources[a.id] = { kind, date: due, progress, detail: due ? `${pkg.name} bids due ${due} (Bid packages) · ${plural(received, "bid")} in` : `${pkg.name} has no bid due date yet: set it on Bid packages.` };
      if (!due) return { ...a, duration: 0, progress };
      const start = addWorkdays(due, 0);
      pinned.set(a.id, start);
      return { ...a, start, duration: 0, progress };
    }
    const award = activeAward(input.awards, pkg.id);
    const executed = award?.subcontract?.status === "executed";
    const fromBids = invited.length ? Math.round((50 * received) / invited.length) : 0;
    const progress = executed ? 100 : a.duration === 0 ? 0 : award ? 75 : fromBids;
    const detail = executed ? `${pkg.name} subcontract executed · ${award!.leveling.bidderName}`
      : award ? `${pkg.name} awarded to ${award.leveling.bidderName} · ${awardStage(award).replace(/-/g, " ")}`
      : invited.length ? `${received} of ${plural(invited.length, "invited company", "invited companies")} bid on ${pkg.name}`
      : `No companies invited to bid on ${pkg.name} yet`;
    sources[a.id] = { kind, detail, date: null, progress };
    return { ...a, progress };
  });
  // Push what follows a later bid due date, then keep each bids-due milestone on its package's date.
  const pushed = reschedule({ ...state, activities }).state;
  return { state: { ...pushed, activities: pushed.activities.map(a => pinned.has(a.id) ? { ...a, start: pinned.get(a.id)! } : a) }, sources };
}
