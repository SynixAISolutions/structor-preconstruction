// Ask Structor's changes. The AI only proposes one (a propose_* tool): the change is tried on a copy
// of the page's data so its rules are checked, and the user sees what would change. Apply re-runs
// it on the data as it is at that moment, through the same functions the pages use, saves it, and
// tells any open page to reload (writeDraft). Undo puts the data back while nothing else has
// changed it since. Every applied change is logged under the project ("assistant-log").

import { budgetTotals, type BudgetState } from "./budget";
import { BUDGET_VERSION_STAGES, saveBudgetVersion, type BudgetVersion, type BudgetVersionStage } from "./budget-versions";
import { sampleBudget } from "./data/budget";
import { sampleProcurement } from "./data/procurement";
import { sampleSchedule } from "./data/schedule";
import { sampleStructorCheck } from "./data/rfi";
import { usd } from "./format";
import type { Procurement, TradePackage } from "./procurement";
import { addIssue, createRfi, type Severity, type StructorCheckState } from "./rfi";
import { addActivity, scheduleRows, setProgress, type ScheduleState } from "./schedule";
import type { Screen } from "./screens";
import { readDraft, writeDraft } from "./use-local-draft";
import { addVeIdea, EMPTY_VE, nextVeNumber, type VeState } from "./value-engineering";
import { matchesTrade } from "./assistant-data";
import { assistantTool, type AssistantToolCall, type ProposalToolName } from "./assistant-tools";

/** Who changes are recorded as: the signed-in name the pages use, marked as made through Ask Structor. */
export const ASSISTANT_ACTOR = "Marcel Khoury (via Ask Structor)";

export type Proposal = { id: string; name: ProposalToolName; arguments: Record<string, string>; projectId: string; title: string; lines: string[]; screen: Screen };
export type AppliedChange = { proposalId: string; projectId: string; key: string; before: unknown; after: unknown; logId: string };
export type AssistantLogEntry = { id: string; title: string; lines: string[]; at: string; by: string; undoneAt: string | null };

type Args = Record<string, string>;
type Ctx = { projectId: string; at: string };
type Change<T> = {
  key: string; initial: T;
  apply: (state: T, a: Args, ctx: Ctx) => T;
  describe: (before: T, after: T, a: Args, ctx: Ctx) => { title: string; lines: string[] };
};

class ProposalError extends Error {}
const fail = (message: string): never => { throw new ProposalError(message); };
const clip = (s: string, max: number) => s.length > max ? `${s.slice(0, max)}…` : s;

/** "-25,000", "$25000", "(25,000)" → a number of dollars. */
function dollars(text: string, what: string): number {
  const n = Number(text.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : fail(`The ${what} must be a dollar amount.`);
}

/** The trade package a trade name means. `strict`: a name with no package is refused rather than kept as text. */
function tradePackage(projectId: string, trade?: string, strict = true): TradePackage | null {
  if (!trade) return null;
  const procurement = readDraft<Procurement>(projectId, "procurement", sampleProcurement);
  return procurement.packages.find(p => matchesTrade(p, trade)) ?? (strict ? fail(`No trade package matches "${trade}".`) : null);
}

const SEVERITIES: Severity[] = ["high", "medium", "low"];
const STAGE_WORDS: Record<string, BudgetVersionStage> = { concept: "concept", schematic: "schematic", sd: "schematic", "schematic design": "schematic", dd: "dd", "design development": "dd", cd: "cd", "construction documents": "cd" };

const CHANGES: { [K in ProposalToolName]: Change<any> } = {
  propose_ve_idea: {
    key: "value-engineering", initial: EMPTY_VE,
    apply: (state: VeState, a, ctx) => {
      const pkg = tradePackage(ctx.projectId, a.trade);
      return addVeIdea(state, { description: a.description, costImpact: dollars(a.costImpact, "cost impact"), category: a.category, packageId: pkg?.id ?? null, csiCode: pkg?.code ?? null, source: a.source, origin: "ai", notes: a.notes }, ASSISTANT_ACTOR, ctx.at);
    },
    describe: (before: VeState, after: VeState) => {
      const idea = after.ideas.at(-1)!;
      return { title: `Add ${nextVeNumber(before)} to value engineering`, lines: [clip(idea.description, 200), `Cost impact: ${usd(idea.costImpact)}${idea.costImpact < 0 ? " (saving)" : idea.costImpact > 0 ? " (added cost)" : ""}`, idea.category ? `Category: ${idea.category}` : "", idea.csiCode ? `Trade section: ${idea.csiCode}` : "", idea.source ? `Source: ${idea.source}` : "", "Starts as an idea, to price and decide on the Value engineering page."].filter(Boolean) };
    },
  },
  propose_issue: {
    key: "structor-check-state", initial: sampleStructorCheck,
    apply: (state: StructorCheckState, a, ctx) => {
      const severity = a.severity.toLowerCase() as Severity;
      if (!SEVERITIES.includes(severity)) fail("Severity must be high, medium or low.");
      // An issue's trade is a label people read: kept as written when no package matches it.
      const pkg = tradePackage(ctx.projectId, a.trade, false);
      return addIssue(state, { title: a.title, detail: a.detail, category: a.category, severity, trade: pkg ? `${pkg.division} · ${pkg.name}` : a.trade, packageId: pkg?.id ?? null, source: a.source, origin: "ai", raisedBy: ASSISTANT_ACTOR }, ASSISTANT_ACTOR, ctx.at);
    },
    describe: (_before: StructorCheckState, after: StructorCheckState) => {
      const issue = after.issues.at(-1)!;
      return { title: `Raise issue ${issue.number}: ${clip(issue.title, 80)}`, lines: [issue.detail ? clip(issue.detail, 240) : "", `Severity: ${issue.severity}`, issue.trade ? `Trade: ${issue.trade}` : "", issue.source ? `Found at: ${issue.source}` : "", `Status once raised: ${issue.status.replace("-", " ")}`].filter(Boolean) };
    },
  },
  propose_rfi: {
    key: "structor-check-state", initial: sampleStructorCheck,
    apply: (state: StructorCheckState, a, ctx) => {
      const key = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]+)0*/, "$1");
      const issueIds = a.issues.split(/[,;\s]+/).filter(Boolean).map(n => state.issues.find(i => key(i.number) === key(n))?.id ?? fail(`There is no issue ${n}.`));
      if (!state.designTeam) fail("No design team contact is saved yet: add it once on the Structor Check & RFIs page, then ask again.");
      return createRfi(state, { issueIds, subject: a.subject, question: a.question, to: state.designTeam!, due: a.due }, ASSISTANT_ACTOR, ctx.at);
    },
    describe: (_before: StructorCheckState, after: StructorCheckState) => {
      const rfi = after.rfis.at(-1)!;
      const numbers = rfi.issueIds.map(id => after.issues.find(i => i.id === id)?.number ?? id);
      return { title: `Draft ${rfi.number}: ${clip(rfi.subject, 80)}`, lines: [`Question: ${clip(rfi.question, 300)}`, `To: ${[rfi.to.name, rfi.to.company].filter(Boolean).join(", ")}`, `About: ${numbers.join(", ")}`, rfi.due ? `Answer wanted by ${rfi.due}` : "", "Saved as an internal draft. Nothing is emailed."].filter(Boolean) };
    },
  },
  propose_schedule_activity: {
    key: "schedule-plan", initial: sampleSchedule,
    apply: (state: ScheduleState, a, ctx) => {
      const pkg = tradePackage(ctx.projectId, a.trade);
      return addActivity(state, { name: a.name, start: a.start, duration: Number(a.workingDays), phase: a.phase, owner: a.owner, packageId: pkg?.id ?? null }, ASSISTANT_ACTOR, ctx.at);
    },
    describe: (before: ScheduleState, after: ScheduleState, _a, ctx) => {
      const added = after.activities.find(x => !before.activities.some(b => b.id === x.id))!;
      const row = scheduleRows(after, ctx.at.slice(0, 10)).find(r => r.id === added.id)!;
      return { title: `Add schedule activity ${added.code}: ${clip(added.name, 80)}`, lines: [`${row.start} → ${row.finish} (${added.duration} working days)`, added.phase ? `Phase: ${added.phase}` : "", added.owner ? `Owner: ${added.owner}` : ""].filter(Boolean) };
    },
  },
  propose_activity_progress: {
    key: "schedule-plan", initial: sampleSchedule,
    apply: (state: ScheduleState, a, ctx) => setProgress(state, findActivity(state, a.activity).id, Number(a.progress), ASSISTANT_ACTOR, ctx.at),
    describe: (before: ScheduleState, after: ScheduleState, a) => {
      const was = findActivity(before, a.activity), now = after.activities.find(x => x.id === was.id)!;
      return { title: `Update progress on ${was.code}: ${clip(was.name, 80)}`, lines: [`Progress: ${was.progress}% → ${now.progress}%`] };
    },
  },
  propose_budget_version: {
    key: "budget-versions", initial: [],
    apply: (versions: BudgetVersion[], a, ctx) => {
      const stage = STAGE_WORDS[a.stage.toLowerCase().trim()] ?? fail("Stage must be concept, schematic, dd or cd.");
      return saveBudgetVersion(versions, readDraft<BudgetState>(ctx.projectId, "budget-state-v2", sampleBudget), { projectId: ctx.projectId, name: a.name, stage, reason: a.reason, by: ASSISTANT_ACTOR, at: ctx.at });
    },
    describe: (_before: BudgetVersion[], after: BudgetVersion[]) => {
      const v = after.at(-1)!;
      return { title: `Save budget version "${clip(v.name, 60)}"`, lines: [`Stage: ${BUDGET_VERSION_STAGES.find(s => s.value === v.stage)?.label ?? v.stage}`, `Total budget saved: ${usd(budgetTotals(v.budget).totalBudget)}`, `Why: ${clip(v.reason, 240)}`] };
    },
  },
};

function findActivity(state: ScheduleState, codeOrName: string) {
  const q = codeOrName.trim().toLowerCase();
  const byCode = state.activities.find(x => x.code.toLowerCase() === q);
  if (byCode) return byCode;
  const byName = state.activities.filter(x => x.name.toLowerCase().includes(q));
  if (byName.length === 1) return byName[0];
  return fail(byName.length ? `"${codeOrName}" matches ${byName.length} activities (${byName.slice(0, 5).map(x => x.code).join(", ")}): name one by its code.` : `No schedule activity matches "${codeOrName}".`);
}

const errorText = (error: unknown) => error instanceof Error ? error.message : "The change could not be prepared.";

/** Tries a proposed change on a copy of the current data: what would change, or why it can't. */
export function prepareProposal(call: AssistantToolCall & { name: ProposalToolName }, projectId: string, at = new Date().toISOString()): { proposal: Proposal } | { error: string } {
  const change = CHANGES[call.name];
  const ctx = { projectId, at };
  try {
    const before = readDraft(projectId, change.key, change.initial);
    const after = change.apply(structuredClone(before), call.arguments, ctx);
    const { title, lines } = change.describe(before, after, call.arguments, ctx);
    return { proposal: { id: call.id, name: call.name, arguments: call.arguments, projectId, title, lines, screen: assistantTool(call.name).screen! } };
  } catch (error) { return { error: errorText(error) }; }
}

/** Makes an approved change on the data as it is now, saves it, and logs it. Throws if a rule now refuses it. */
export function applyProposal(proposal: Proposal, at = new Date().toISOString()): AppliedChange {
  const change = CHANGES[proposal.name];
  const before = readDraft(proposal.projectId, change.key, change.initial);
  const after = change.apply(structuredClone(before), proposal.arguments, { projectId: proposal.projectId, at });
  writeDraft(proposal.projectId, change.key, after);
  const entry: AssistantLogEntry = { id: `${proposal.id}-${at}`, title: proposal.title, lines: proposal.lines, at, by: ASSISTANT_ACTOR, undoneAt: null };
  writeDraft(proposal.projectId, "assistant-log", [...readDraft<AssistantLogEntry[]>(proposal.projectId, "assistant-log", []), entry].slice(-100));
  return { proposalId: proposal.id, projectId: proposal.projectId, key: change.key, before, after, logId: entry.id };
}

/** Puts the data back as it was before the change, unless something else has changed it since. */
export function undoChange(applied: AppliedChange, at = new Date().toISOString()): boolean {
  const current = readDraft<unknown>(applied.projectId, applied.key, undefined);
  if (JSON.stringify(current) !== JSON.stringify(applied.after)) return false;
  writeDraft(applied.projectId, applied.key, applied.before);
  writeDraft(applied.projectId, "assistant-log", readDraft<AssistantLogEntry[]>(applied.projectId, "assistant-log", []).map(e => e.id === applied.logId ? { ...e, undoneAt: at } : e));
  return true;
}
