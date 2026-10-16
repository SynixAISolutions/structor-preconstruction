// Preconstruction to-do: derived, never checked by hand.
//
// Marcel (20 Sep, 25:19–26:16): the old "Project turnover" checklist is really a preconstruction
// to-do / percent-complete list — "stuff that we have to do", e.g. "approve scopes that AI
// generated". So every task here is WORKED OUT from the project's real state: scope reviews,
// published bid forms, invitations, submitted bids, leveling, budget, allowances, awards,
// Exhibit A and the subcontract. Nothing is stored; finishing the work removes the task.
//
// Progress: each trade package has 8 milestones (scope approved → subcontract executed); the
// project adds setup and budget milestones. Percent complete = milestones done / milestones.

import { awardStage, activeAward, unresolvedComments, type AwardState } from "./award";
import type { BudgetState } from "./budget";
import { bidderTotals } from "./leveling.mjs";
import type { BidProvenance, LevelingBidder, LevelingScopeItem } from "./leveling-import";
import { bidForm, packageStatus, type Procurement } from "./procurement";
import type { Project } from "./projects";
import type { Screen } from "./screens";
import { lookahead, type ScheduleRow } from "./schedule";
import { isStale, type Submission } from "./submissions";

export type TodoGroup = "setup" | "scopes" | "outreach" | "leveling" | "budget" | "award" | "schedule";
/** todo: the team must act · waiting: someone else must act (a subcontractor, usually). */
export type TodoStatus = "todo" | "waiting";
export type TodoPriority = "high" | "normal" | "low";

export type TodoTask = {
  /** Stable while the underlying situation lasts, e.g. "publish:demolition". */
  id: string;
  group: TodoGroup;
  title: string;
  detail: string;
  status: TodoStatus;
  priority: TodoPriority;
  /** Where the work is done. */
  screen: Screen;
  packageId: string | null;
  /** Records the task is about, for deep links. */
  refs: { submissionIds?: string[]; invitationIds?: string[]; awardId?: string; budgetLineIds?: string[]; allowanceIds?: string[] };
  /** How many things the task covers (items to approve, bids to load, …). */
  count: number;
};

export type MilestoneKey = "scope-approved" | "bid-form-published" | "bidders-invited" | "bids-received" | "bids-leveled" | "awarded" | "exhibit-agreed" | "subcontract-executed";
export type Milestone = { key: MilestoneKey; label: string; done: boolean };
export type ProjectMilestoneKey = "project-facts" | "project-files" | "budget-approved" | "allowances-decided";
export type ProjectMilestone = { key: ProjectMilestoneKey; label: string; done: boolean };
export type PackageProgress = { packageId: string; name: string; code: string; owner: string; milestones: Milestone[]; done: number; total: number; percent: number };
export type Progress = { done: number; total: number; percent: number };

export type TodoSummary = {
  /** Open work, most urgent first: team actions before waiting, then high → low, then workflow order. */
  tasks: TodoTask[];
  groups: { group: TodoGroup; label: string; screen: Screen; todo: number; waiting: number }[];
  packages: PackageProgress[];
  /** Project-level milestones (setup and budget) that are not tied to one package. */
  project: ProjectMilestone[];
  progress: Progress;
};

/** The current Bid leveling workspace, when one is loaded (its package, grid and portal provenance). */
export type LevelingSnapshot = { packageId: string | null; items: LevelingScopeItem[]; bidders: LevelingBidder[]; provenance?: Record<string, BidProvenance> };

export type TodoInput = {
  project: Project | null;
  /** The project's files (Project files screen). */
  documents: unknown[];
  procurement: Procurement;
  submissions: Submission[];
  leveling: LevelingSnapshot | null;
  budget: BudgetState;
  awards: AwardState;
  /** Project schedule rows (scheduleRows) and today (yyyy-mm-dd): late and next-3-week activities become tasks. */
  schedule?: { rows: ScheduleRow[]; today: string };
};

export const TODO_GROUPS: { group: TodoGroup; label: string; screen: Screen }[] = [
  { group: "setup", label: "Project setup", screen: "information" },
  { group: "scopes", label: "Scopes & bid forms", screen: "scopes" },
  { group: "outreach", label: "Subcontractor outreach", screen: "packages" },
  { group: "leveling", label: "Bid leveling", screen: "leveling" },
  { group: "budget", label: "Budget & allowances", screen: "budget" },
  { group: "award", label: "Award & contracts", screen: "contracts" },
  { group: "schedule", label: "Project schedule", screen: "schedule" },
];

const MILESTONES: { key: MilestoneKey; label: string }[] = [
  { key: "scope-approved", label: "Scope approved" },
  { key: "bid-form-published", label: "Bid form published" },
  { key: "bidders-invited", label: "Bidders invited" },
  { key: "bids-received", label: "Bids received" },
  { key: "bids-leveled", label: "Bids leveled" },
  { key: "awarded", label: "Subcontractor selected" },
  { key: "exhibit-agreed", label: "Exhibit A agreed" },
  { key: "subcontract-executed", label: "Subcontract executed" },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const percent = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** Missing project facts Marcel wants on every project (for comparisons later). */
export function missingProjectFacts(project: Project | null): string[] {
  if (!project) return ["project"];
  const missing: string[] = [];
  if (!project.location.trim()) missing.push("location");
  if (!project.type.trim()) missing.push("project type");
  if (!(project.squareFeet > 0)) missing.push("square footage");
  if (!project.workType) missing.push("work type");
  if (!project.taxStatus) missing.push("tax status");
  if (!project.estimateStage) missing.push("estimate stage");
  if (!project.due) missing.push("bid due date");
  return missing;
}

export function deriveTodo(input: TodoInput): TodoSummary {
  const { procurement, submissions, leveling, budget, awards } = input;
  const tasks: TodoTask[] = [];
  const add = (t: Omit<TodoTask, "refs" | "count"> & Partial<Pick<TodoTask, "refs" | "count">>) => tasks.push({ refs: {}, count: 1, ...t });

  // ── Setup ──
  const missing = missingProjectFacts(input.project);
  if (missing.length) add({ id: "setup:facts", group: "setup", title: "Complete the project information", detail: `Missing: ${missing.join(", ")}.`, status: "todo", priority: "normal", screen: "information", packageId: null, count: missing.length });
  if (!input.documents.length) add({ id: "setup:files", group: "setup", title: "Upload the project files", detail: "Add the drawings, specifications and RFP.", status: "todo", priority: "high", screen: "documents", packageId: null, count: 0 });
  if (!procurement.packages.length) add({ id: "setup:packages", group: "setup", title: "Set up trade packages", detail: "No trade packages exist yet, so there is nothing to scope or bid.", status: "todo", priority: "high", screen: "scopes", packageId: null, count: 0 });

  // ── Per package ──
  const packages: PackageProgress[] = procurement.packages.map(pkg => {
    const form = bidForm(procurement, pkg.id);
    const status = packageStatus(procurement, pkg.id);
    const drafts = form.filter(s => s.status !== "approved");
    const invitations = procurement.invitations.filter(i => i.packageId === pkg.id && i.status !== "declined");
    const submitted = submissions.filter(s => s.packageId === pkg.id && s.revisions.length > 0);
    const award = activeAward(awards, pkg.id);
    const stage = award ? awardStage(award) : null;
    const levelingHere = leveling && leveling.packageId === pkg.id ? leveling : null;
    const leveled = levelingHere ? levelingHere.bidders.map(b => ({ bidder: b, totals: bidderTotals(b, levelingHere.items) })) : [];
    const anyEligible = leveled.some(l => l.totals.eligible);
    const p = { packageId: pkg.id } as const;

    if (form.length && drafts.length) add({ ...p, id: `scopes:approve:${pkg.id}`, group: "scopes", title: `Approve ${plural(drafts.length, "scope item")} in ${pkg.name}`, detail: `${form.length - drafts.length} of ${form.length} approved. Owner: ${pkg.owner || "unassigned"}.`, status: "todo", priority: "normal", screen: "scopes", count: drafts.length });
    if (!form.length) add({ ...p, id: `scopes:empty:${pkg.id}`, group: "scopes", title: `Write the ${pkg.name} scope`, detail: "The bid form has no items yet.", status: "todo", priority: "normal", screen: "scopes", count: 0 });
    if (status === "ready") add({ ...p, id: `scopes:publish:${pkg.id}`, group: "scopes", title: `Publish the ${pkg.name} bid form`, detail: "Every item is approved; invited bidders can price it once it is published.", status: "todo", priority: "high", screen: "scopes" });
    if (status === "revised" && !drafts.length) add({ ...p, id: `scopes:republish:${pkg.id}`, group: "scopes", title: `Publish the revised ${pkg.name} bid form`, detail: `Bidders still have version ${pkg.published!.version}.`, status: "todo", priority: "high", screen: "scopes" });

    if (pkg.published) {
      if (!invitations.length) add({ ...p, id: `outreach:invite:${pkg.id}`, group: "outreach", title: `Invite bidders to ${pkg.name}`, detail: "The bid form is published but nobody is invited.", status: "todo", priority: "high", screen: "packages", count: 0 });
      const pending = invitations.filter(i => !submitted.some(s => s.invitationId === i.id) && i.status !== "submitted");
      const quiet = pending.filter(i => !procurement.outreach.some(o => o.packageId === pkg.id && o.bidderId === i.bidderId));
      if (quiet.length) add({ ...p, id: `outreach:follow-up:${pkg.id}`, group: "outreach", title: `Follow up with ${plural(quiet.length, "invited company", "invited companies")} for ${pkg.name}`, detail: "No call, note or message is logged for them yet.", status: "todo", priority: "normal", screen: "packages", refs: { invitationIds: quiet.map(i => i.id) }, count: quiet.length });
      if (pending.length && !award) add({ ...p, id: `outreach:waiting:${pkg.id}`, group: "outreach", title: `Waiting on ${plural(pending.length, "bid")} for ${pkg.name}`, detail: pkg.due ? `Bids are due ${pkg.due}.` : "No due date is set.", status: "waiting", priority: "low", screen: "packages", refs: { invitationIds: pending.map(i => i.id) }, count: pending.length });
    }

    const stale = submitted.filter(s => isStale(s, procurement));
    if (stale.length) add({ ...p, id: `leveling:stale:${pkg.id}`, group: "leveling", title: `Ask ${plural(stale.length, "bidder")} to resubmit for ${pkg.name}`, detail: "They priced an older bid form; their bids cannot be ranked.", status: "todo", priority: "normal", screen: "packages", refs: { submissionIds: stale.map(s => s.id) }, count: stale.length });
    if (submitted.length && !award) {
      const loaded = new Set(Object.values(levelingHere?.provenance ?? {}).map(pv => pv.submissionId));
      const notLoaded = submitted.filter(s => !loaded.has(s.id));
      if (notLoaded.length) add({ ...p, id: `leveling:load:${pkg.id}`, group: "leveling", title: `Load ${plural(notLoaded.length, "submitted bid")} into leveling for ${pkg.name}`, detail: "Submitted in the portal, not yet in the comparison.", status: "todo", priority: "high", screen: "leveling", refs: { submissionIds: notLoaded.map(s => s.id) }, count: notLoaded.length });
      const open = leveled.reduce((n, l) => n + l.totals.exceptions, 0);
      if (open) add({ ...p, id: `leveling:exceptions:${pkg.id}`, group: "leveling", title: `Resolve ${plural(open, "leveling exception")} for ${pkg.name}`, detail: "Exclusions, partial answers and unanswered rows keep bids out of the ranking.", status: "todo", priority: "high", screen: "leveling", count: open });
      if (anyEligible) add({ ...p, id: `award:select:${pkg.id}`, group: "award", title: `Choose the ${pkg.name} subcontractor`, detail: "At least one bid is fully leveled and can be awarded.", status: "todo", priority: "high", screen: "contracts" });
    }

    if (award && stage) {
      const company = award.snapshot.company.name;
      const r = { refs: { awardId: award.id } };
      const byStage: Partial<Record<typeof stage, Omit<TodoTask, "id" | "group" | "screen" | "packageId" | "refs" | "count">>> = {
        "exhibit-draft": { title: `Share Exhibit A with ${company}`, detail: `${pkg.name}: revision ${award.exhibit.revisions.length} is ready to send.`, status: "todo", priority: "high" },
        "exhibit-shared": { title: `Waiting for ${company} to review Exhibit A`, detail: `${pkg.name}: shared, no answer yet.`, status: "waiting", priority: "low" },
        "exhibit-changes-requested": { title: `Answer ${company}'s Exhibit A comments`, detail: `${pkg.name}: ${plural(unresolvedComments(award).length, "comment")} unresolved.`, status: "todo", priority: "high" },
        "exhibit-agreed": { title: `Generate the ${pkg.name} subcontract`, detail: "Exhibit A is agreed.", status: "todo", priority: "high" },
        "subcontract-draft": { title: `Send the ${pkg.name} subcontract for signature`, detail: `To ${company}.`, status: "todo", priority: "normal" },
        "signature-pending": { title: `Waiting for ${company} to sign the subcontract`, detail: pkg.name, status: "waiting", priority: "low" },
        "subcontractor-signed": { title: `Countersign the ${pkg.name} subcontract`, detail: `${company} has signed.`, status: "todo", priority: "high" },
        "countersigned": { title: `Execute the ${pkg.name} subcontract`, detail: "Both parties have signed.", status: "todo", priority: "normal" },
      };
      const task = byStage[stage];
      if (task) add({ ...task, ...p, ...r, id: `award:${stage}:${pkg.id}`, group: "award", screen: "contracts", count: 1 });
    }

    const done: Record<MilestoneKey, boolean> = {
      "scope-approved": form.length > 0 && drafts.length === 0,
      "bid-form-published": !!pkg.published && status === "published",
      "bidders-invited": invitations.length > 0,
      "bids-received": submitted.length > 0,
      "bids-leveled": anyEligible || !!award,
      "awarded": !!award,
      "exhibit-agreed": !!award && award.exhibit.status === "agreed",
      "subcontract-executed": award?.subcontract?.status === "executed",
    };
    const milestones = MILESTONES.map(m => ({ ...m, done: done[m.key] }));
    const count = milestones.filter(m => m.done).length;
    return { packageId: pkg.id, name: pkg.name, code: pkg.code, owner: pkg.owner, milestones, done: count, total: milestones.length, percent: percent(count, milestones.length) };
  });

  // ── Budget ──
  // Lines carried by the owner (when the budget marks them) are not the team's to approve or forecast.
  const counted = budget.lines.filter(l => !(l as { byOwner?: boolean }).byOwner);
  const draftLines = counted.filter(l => l.status !== "approved");
  const unforecast = counted.filter(l => l.classification === "direct" && l.forecast === null);
  const reviewAllowances = budget.allowances.filter(a => a.status === "review");
  const over = counted.filter(l => l.forecast !== null && l.forecast > l.budget);
  if (!counted.length) add({ id: "budget:empty", group: "budget", title: "Enter the project budget", detail: "No budget lines yet.", status: "todo", priority: "normal", screen: "budget", packageId: null, count: 0 });
  if (draftLines.length) add({ id: "budget:approve", group: "budget", title: `Approve ${plural(draftLines.length, "budget line")}`, detail: "Draft lines are not approved yet.", status: "todo", priority: "normal", screen: "budget", packageId: null, refs: { budgetLineIds: draftLines.map(l => l.id) }, count: draftLines.length });
  if (over.length) add({ id: "budget:over", group: "budget", title: `${plural(over.length, "budget line")} forecast over budget`, detail: over.map(l => `${l.description} (${l.costCenter})`).slice(0, 3).join(", ") + (over.length > 3 ? ", …" : ""), status: "todo", priority: "high", screen: "budget", packageId: null, refs: { budgetLineIds: over.map(l => l.id) }, count: over.length });
  if (unforecast.length) add({ id: "budget:forecast", group: "budget", title: `Set forecasts for ${plural(unforecast.length, "direct line")}`, detail: "Apply a leveled value or enter the expected cost.", status: "todo", priority: "low", screen: "budget", packageId: null, refs: { budgetLineIds: unforecast.map(l => l.id) }, count: unforecast.length });
  if (reviewAllowances.length) add({ id: "budget:allowances", group: "budget", title: `Decide ${plural(reviewAllowances.length, "allowance")}`, detail: "Include or exclude each one, and link it to the budget line that carries it.", status: "todo", priority: "normal", screen: "allowances", packageId: null, refs: { allowanceIds: reviewAllowances.map(a => a.id) }, count: reviewAllowances.length });

  // ── Schedule ── (15 Oct: unfinished activities of the next 3 weeks belong on the to-do list)
  if (input.schedule) {
    const { rows, today } = input.schedule;
    const soon = new Set(lookahead(rows, today).map(r => r.id));
    for (const r of rows) {
      if (r.status === "complete") continue;
      const who = r.owner ? ` Owner: ${r.owner}.` : "";
      const progress = `${r.progress}% complete.`;
      if (r.late) add({ id: `schedule:late:${r.id}`, group: "schedule", title: `${r.code} ${r.name} is past its finish`, detail: `Planned finish ${r.finish}; ${progress}${who}`, status: "todo", priority: "high", screen: "schedule", packageId: r.packageId });
      else if (r.notStartedOnTime) add({ id: `schedule:start:${r.id}`, group: "schedule", title: `Start ${r.code} ${r.name}`, detail: `Planned to start ${r.start}.${who}`, status: "todo", priority: "high", screen: "schedule", packageId: r.packageId });
      else if (soon.has(r.id)) add({ id: `schedule:soon:${r.id}`, group: "schedule", title: `${r.code} ${r.name}`, detail: `${r.milestone ? `Due ${r.start}` : `${r.start} to ${r.finish}`}; ${progress}${who}`, status: "todo", priority: r.critical ? "normal" : "low", screen: "schedule", packageId: r.packageId });
    }
  }

  const project: ProjectMilestone[] = [
    { key: "project-facts", label: "Project information complete", done: !missing.length },
    { key: "project-files", label: "Project files uploaded", done: input.documents.length > 0 },
    { key: "budget-approved", label: "Budget approved", done: counted.length > 0 && !draftLines.length },
    { key: "allowances-decided", label: "Allowances decided", done: !reviewAllowances.length },
  ];

  const groupRank = new Map(TODO_GROUPS.map((g, i) => [g.group, i]));
  const rank = { high: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => (a.status === b.status ? 0 : a.status === "todo" ? -1 : 1) || rank[a.priority] - rank[b.priority] || groupRank.get(a.group)! - groupRank.get(b.group)!);

  const done = packages.reduce((n, p) => n + p.done, 0) + project.filter(m => m.done).length;
  const total = packages.reduce((n, p) => n + p.total, 0) + project.length;
  return {
    tasks,
    groups: TODO_GROUPS.map(g => ({ ...g, todo: tasks.filter(t => t.group === g.group && t.status === "todo").length, waiting: tasks.filter(t => t.group === g.group && t.status === "waiting").length })),
    packages, project, progress: { done, total, percent: percent(done, total) },
  };
}
