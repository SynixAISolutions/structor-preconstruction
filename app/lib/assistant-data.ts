// Ask Structor's reading tools, run in the browser on the open project's live data. Every reader
// uses the storage key and starting value its page uses (use-*.ts), so the assistant sees what the
// pages show, edits included. Nothing here writes (changes: assistant-actions.ts). Results are
// compact JSON for the AI.

import { activeAward, awardStage, type AwardState } from "./award";
import { bidPackageReport, type BidPackageReport } from "./bid-package-report";
import { levelingCandidates, budgetTotals, type BudgetState } from "./budget";
import { budgetLinesForTrade } from "./estimate";
import { initialBidders, type Bidder } from "./data/commercial";
import { sampleBudget } from "./data/budget";
import { sampleProcurement } from "./data/procurement";
import { sampleSchedule } from "./data/schedule";
import { sampleStructorCheck } from "./data/rfi";
import { sampleAwards, sampleSubmissions } from "./data/sample-award";
import { buildLevelingImport, type BidProvenance, type LevelingBidder, type LevelingProject, type LevelingScopeItem } from "./leveling-import";
import { refreshPortalComparison, type SavedTradeComparison } from "./leveling-sync";
import type { Procurement, TradePackage } from "./procurement";
import { loadProjects, sampleProjectRecords, type Project } from "./projects";
import { getActiveProjectId } from "./project-scope";
import { readDraft } from "./use-local-draft";
import type { StructorCheckState } from "./rfi";
import { scheduleRows, type ScheduleState } from "./schedule";
import type { Screen } from "./screens";
import type { Submission } from "./submissions";
import { guideText, manualGuides } from "./user-manual";
import { EMPTY_VE, type VeState } from "./value-engineering";
import { veLevelingBidders } from "./ve-bids";
import { assistantTool, toolResultText, type AssistantToolCall } from "./assistant-tools";

export const currentProject = (projectId: string): Project | undefined =>
  (loadProjects() ?? sampleProjectRecords).find(p => p.id === projectId);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** A package matches "Drywall", "drywall", "09", "09 29 00" or "092900". */
export function matchesTrade(pkg: Pick<TradePackage, "id" | "name" | "division" | "code">, trade?: string): boolean {
  if (!trade) return true;
  const q = norm(trade), compact = q.replace(/ /g, "");
  return norm(pkg.name).includes(q) || q.includes(norm(pkg.name)) || pkg.division === q || norm(pkg.code) === q || norm(pkg.code).replace(/ /g, "") === compact || pkg.id === trade;
}

const countBy = <T>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((n, item) => { const k = key(item); n[k] = (n[k] ?? 0) + 1; return n; }, {});
const clip = (s: string | null | undefined, max: number) => !s ? "" : s.length > max ? `${s.slice(0, max)}…` : s;
const readable = (code: string) => code.replace(/-/g, " ");

type Context = { projectId: string; today: string; fetchImpl?: typeof fetch };
type Data = {
  project: Project | undefined; procurement: Procurement; submissions: Submission[]; directory: Bidder[];
  budget: BudgetState; ve: VeState; check: StructorCheckState; schedule: ScheduleState;
};

/** The keys and starting values of lib/use-procurement, use-submissions, use-budget and the rest. */
const projectData = (projectId: string): Data => ({
  project: currentProject(projectId),
  procurement: readDraft<Procurement>(projectId, "procurement", sampleProcurement),
  submissions: readDraft<Submission[]>(projectId, "submissions", sampleSubmissions),
  directory: readDraft<Bidder[]>(projectId, "directory", initialBidders),
  budget: readDraft<BudgetState>(projectId, "budget-state-v2", sampleBudget),
  ve: readDraft<VeState>(projectId, "value-engineering", EMPTY_VE),
  check: readDraft<StructorCheckState>(projectId, "structor-check-state", sampleStructorCheck),
  schedule: readDraft<ScheduleState>(projectId, "schedule-plan", sampleSchedule),
});

const companyName = (directory: Bidder[], id: string | null) => directory.find(b => b.id === id)?.company ?? id ?? "";
const packageName = (procurement: Procurement, id: string | null) => procurement.packages.find(p => p.id === id)?.name ?? id ?? "";

function budgetSummary(state: BudgetState, costCenter?: string) {
  const t = budgetTotals(state, costCenter);
  return { budget: t.budget, forecast: t.forecast, committed: t.committed, remaining: t.remaining, variance: t.variance, linesWithoutForecast: t.unforecastLines, allowancesAdded: t.allowancesAdded, allowancesPending: t.allowancesPending, totalBudget: t.totalBudget, totalForecast: t.totalForecast };
}

const openIssue = (status: string) => !["resolved", "dismissed", "combined"].includes(status);

// ── The tools ──

/** Every project's record, with a few counts read from its own saved data (projects are stored per project). */
function allProjects(openProjectId: string) {
  const projects = loadProjects() ?? sampleProjectRecords;
  return {
    openProject: projects.find(p => p.id === openProjectId)?.name ?? openProjectId,
    projects: projects.map(p => {
      const d = projectData(p.id);
      return {
        name: p.name, location: p.location, type: p.type, status: p.status, estimateStage: p.estimateStage, value: p.value, squareFeet: p.squareFeet,
        architect: p.architect, bidDue: p.due, rfiDue: p.rfi, start: p.start, finish: p.finish,
        tradePackages: d.procurement.packages.length, submittedBids: d.submissions.filter(s => s.revisions.length).length,
        openIssues: d.check.issues.filter(i => openIssue(i.status)).length, openRfis: d.check.rfis.filter(r => r.status !== "closed").length,
        totalBudget: budgetTotals(d.budget).totalBudget,
      };
    }),
  };
}

function projectOverview(d: Data) {
  const p = d.project;
  return {
    project: p ? {
      name: p.name, location: p.location, type: p.type, status: p.status, workType: p.workType, estimateStage: p.estimateStage,
      squareFeet: p.squareFeet, renovationSquareFeet: p.renovationSquareFeet, additionSquareFeet: p.additionSquareFeet,
      value: p.value, architect: p.architect, bidDue: p.due, rfiDue: p.rfi, start: p.start, finish: p.finish,
      description: clip(p.description, 600), team: p.team,
    } : "No project record is saved for the open project.",
    counts: {
      tradePackages: d.procurement.packages.length,
      scopeItems: d.procurement.scopes.length,
      invitations: countBy(d.procurement.invitations, i => i.status),
      submittedBids: d.submissions.filter(s => s.revisions.length).length,
      openIssues: d.check.issues.filter(i => openIssue(i.status)).length,
      openRfis: d.check.rfis.filter(r => r.status !== "closed").length,
      veIdeas: countBy(d.ve.ideas, i => i.status),
      scheduleActivities: d.schedule.activities.length,
    },
    budget: budgetSummary(d.budget),
  };
}

function tradePackages(d: Data, trade?: string) {
  const packages = d.procurement.packages.filter(p => matchesTrade(p, trade));
  if (!packages.length) return { packages: [], note: trade ? `No trade package matches "${trade}".` : "The project has no trade packages yet." };
  return {
    packages: packages.map(p => ({
      id: p.id, trade: p.name, division: p.division, specSection: p.code, estimator: p.owner, bidsDue: p.due,
      bidForm: p.published ? `version ${p.published.version}, published ${p.published.at.slice(0, 10)} by ${p.published.by}, ${p.published.items.length} items` : "not published",
      scopeItems: countBy(d.procurement.scopes.filter(s => s.packageId === p.id), s => s.status),
      invitations: d.procurement.invitations.filter(i => i.packageId === p.id).map(i => ({ company: companyName(d.directory, i.bidderId), status: i.status, invited: i.invitedAt.slice(0, 10) })),
    })),
  };
}

/** One trade's comparison as Bid leveling and the budget read it (use-leveling-comparison, portalComparisonCandidates). */
export type LevelingPackage = {
  /** "" for an imported workbook not tied to a trade package. */
  packageId: string; trade: string; code: string;
  items: LevelingScopeItem[]; bidders: LevelingBidder[]; provenance: Record<string, BidProvenance>;
  /** Portal bids nobody has loaded into Bid leveling: built as loading them there would, before any review. */
  unreviewed: boolean;
  /** The trade budget the saved comparison carries, when there is one. */
  savedBudget: number | null;
};

/**
 * Every trade with bids: the open comparison, every saved trade (refreshed from the portal and with
 * accepted VE, as portalComparisonCandidates does), then trades with portal bids not yet loaded.
 */
export async function levelingPackages(projectId: string, d: Data = projectData(projectId)): Promise<LevelingPackage[]> {
  // The open comparison lives in IndexedDB, which only the browser has: loaded when this runs.
  const workspace = await import("./workspace-storage").then(m => m.loadWorkspace<LevelingProject, LevelingScopeItem, LevelingBidder>()).catch(() => null);
  const comparisons = readDraft<Record<string, SavedTradeComparison>>(projectId, "leveling-trades", {});
  const provenance = readDraft<Record<string, BidProvenance>>(projectId, "leveling-submission-provenance", {});
  const activePackage = readDraft(projectId, "leveling-submission-package", "");
  const current = workspace && activePackage && !Object.values(provenance).some(p => p.superseded) ? { [activePackage]: { ...workspace, provenance } } : {};
  const projectName = workspace?.project.name ?? "";
  const pkgOf = (id: string) => d.procurement.packages.find(p => p.id === id);
  const open: Record<string, SavedTradeComparison> = { ...comparisons, ...current };
  const packages: LevelingPackage[] = Object.entries(open).map(([packageId, saved]) => {
    const fresh = refreshPortalComparison(buildLevelingImport({ projectId, projectName, packageId, procurement: d.procurement, submissions: d.submissions, directory: d.directory }), saved);
    return { packageId, trade: pkgOf(packageId)?.name ?? saved.project.trade, code: pkgOf(packageId)?.code ?? "", items: fresh.items, bidders: veLevelingBidders(fresh.bidders, fresh.provenance, d.ve, d.submissions), provenance: fresh.provenance, unreviewed: false, savedBudget: saved.project.budget || null };
  });
  if (workspace && !activePackage) packages.push({ packageId: "", trade: workspace.project.trade || "Imported workbook", code: "", items: workspace.items, bidders: veLevelingBidders(workspace.bidders, provenance, d.ve, d.submissions), provenance, unreviewed: false, savedBudget: workspace.project.budget || null });
  for (const pkg of d.procurement.packages) {
    if (packages.some(p => p.packageId === pkg.id) || !d.submissions.some(s => s.packageId === pkg.id && s.revisions.length)) continue;
    const built = buildLevelingImport({ projectId, projectName: d.project?.name ?? "", packageId: pkg.id, procurement: d.procurement, submissions: d.submissions, directory: d.directory });
    if (built.bidders.length) packages.push({ packageId: pkg.id, trade: pkg.name, code: pkg.code, items: built.items, bidders: veLevelingBidders(built.bidders, built.provenance, d.ve, d.submissions), provenance: built.provenance, unreviewed: true, savedBudget: null });
  }
  return packages;
}

const packagesForTrade = (d: Data, packages: LevelingPackage[], trade?: string) => packages.filter(p => {
  const pkg = d.procurement.packages.find(x => x.id === p.packageId);
  return pkg ? matchesTrade(pkg, trade) : !trade || norm(p.trade).includes(norm(trade));
});

async function bidLeveling(d: Data, ctx: Context, trade?: string) {
  const packages = packagesForTrade(d, await levelingPackages(ctx.projectId, d), trade);
  if (!packages.length) return { trades: [], note: trade ? `No leveled bids for "${trade}". Bids are leveled in Bid leveling after they're submitted or imported.` : "No bids have been leveled yet. Load or import bids in Bid leveling first." };
  return {
    trades: packages.map(p => {
      const list = levelingCandidates({ packageId: p.packageId || null, items: p.items, bidders: p.bidders, provenance: p.provenance });
      const bidders = [...list].sort((a, b) => (a.eligible === b.eligible ? 0 : a.eligible ? -1 : 1) || (a.reviewedTotal ?? a.provisionalTotal ?? Infinity) - (b.reviewedTotal ?? b.provisionalTotal ?? Infinity));
      const exceptions = p.items.flatMap(item => p.bidders.flatMap(b => {
        const r = b.responses[item.id];
        return r && (r.status === "N" || r.status === "P") ? [{ item: `${item.number} ${clip(item.description, 90)}`, required: item.required, company: b.name, answer: r.status, note: clip(r.note, 160), adjustment: r.adjustment || 0, adjustmentApproved: !!r.adjustmentApproved, resolved: !!r.resolved }] : [];
      })).slice(0, 30);
      return {
        trade: p.trade,
        reviewState: p.unreviewed ? "Not loaded into Bid leveling yet: totals are the bids as submitted, with no estimator review, so none is a leveled total." : "Leveled in Bid leveling with the estimator's review.",
        tradeBudget: p.savedBudget,
        scopeItems: p.items.length,
        bidders: bidders.map(c => ({
          company: c.bidderName, baseBid: c.baseBid, provisionalTotal: c.provisionalTotal, reviewedTotal: c.reviewedTotal,
          rankable: c.eligible, notRankableBecause: c.eligibilityReasons.map(readable), bidRevision: c.revisionNumber, outdatedForm: c.stale,
        })),
        excludedOrPartial: exceptions,
      };
    }),
  };
}

/** The bid package summary (bid-package-report.ts) for one trade: its budget, selected bidder and leveled bids. */
export async function bidPackageSummary(projectId: string, trade: string | undefined, today: string, d: Data = projectData(projectId)): Promise<{ report: BidPackageReport } | { error: string; trades: string[] }> {
  const all = await levelingPackages(projectId, d);
  const matches = packagesForTrade(d, all, trade);
  if (matches.length !== 1) return { error: !all.length ? "No trade has bids yet. Bids are leveled in Bid leveling after they're submitted or imported." : !trade ? "Name the trade to summarize." : matches.length ? `"${trade}" matches several trades: name one.` : `No trade with bids matches "${trade}".`, trades: all.map(p => p.trade) };
  const p = matches[0];
  // The trade budget as Quantity takeoffs finds it: the linked lines, else the line with the nearest CSI code.
  const pkg = d.procurement.packages.find(x => x.id === p.packageId);
  const tb = pkg ? budgetLinesForTrade(d.budget, pkg) : null;
  const award = p.packageId ? activeAward(readDraft<AwardState>(projectId, "awards", sampleAwards), p.packageId) : undefined;
  return {
    report: bidPackageReport({
      projectName: d.project?.name ?? "", trade: p.trade, code: p.code, packageId: p.packageId, asOf: today,
      items: p.items, bidders: p.bidders, asSubmitted: p.unreviewed,
      budget: tb?.lines.length ? tb.lines.reduce((n, l) => n + l.budget, 0) : p.savedBudget,
      budgetBasis: tb?.lines.length ? (tb.basis === "linked" ? "the linked budget line" : `budget line ${tb.codes.join(", ")}, matched by CSI code`) : p.savedBudget ? "the saved comparison's trade budget" : null,
      selected: award ? { company: award.leveling.bidderName, amount: award.amount, stage: awardStage(award).replace(/-/g, " ") } : null,
    }),
  };
}

/** What the AI is told about a report: the figures that matter, not every line (the panel shows the tables). */
function reportBrief(r: BidPackageReport) {
  return {
    shownToUser: "The report's tables and its Excel download are shown to the user under your answer.",
    summary: r.summary, asSubmitted: r.asSubmitted, budget: r.budget, selected: r.selected,
    ranked: r.ranked.map(b => ({ rank: b.rank, company: b.company, status: b.status, baseBid: b.baseBid, adjustments: b.adjustments, leveledTotal: b.leveledTotal, provisionalTotal: b.provisionalTotal })),
    adjustments: r.adjustments.length, gaps: r.gaps.slice(0, 12).map(g => `${g.company}: ${g.answer} ${clip(g.item, 90)}${g.note ? ` (${clip(g.note, 100)})` : ""}`),
  };
}

function bidSubmissions(d: Data, trade?: string) {
  const packages = new Set(d.procurement.packages.filter(p => matchesTrade(p, trade)).map(p => p.id));
  const title = (id: string) => d.procurement.scopes.find(s => s.id === id)?.title ?? d.procurement.packages.flatMap(p => p.published?.items ?? []).find(i => i.id === id)?.title ?? id;
  const bids = d.submissions.filter(s => packages.has(s.packageId) && s.revisions.length).map(s => {
    const latest = s.revisions[s.revisions.length - 1];
    return {
      company: companyName(d.directory, s.bidderId), trade: packageName(d.procurement, s.packageId), illustrative: !!s.illustrative,
      revision: latest.number, submitted: latest.submittedAt.slice(0, 10), formVersion: latest.formVersion, baseBid: latest.baseBid,
      notIncluded: latest.responses.filter(r => r.answer === "N" || r.answer === "P").map(r => ({ item: clip(title(r.scopeItemId), 120), answer: r.answer, note: clip(r.note, 200) })),
      exclusions: latest.exclusions.map(e => clip(e, 200)),
      alternates: latest.alternates.map(a => ({ kind: a.kind, description: clip(a.description, 160), amount: a.amount })),
      clarifications: latest.clarifications.map(c => clip(c, 200)),
    };
  });
  return bids.length ? { bids } : { bids: [], note: trade ? `No submitted bids for "${trade}".` : "No bids have been submitted through the portal." };
}

function budget(d: Data, costCenter?: string) {
  const center = costCenter ? d.budget.costCenters.find(c => norm(c.name) === norm(costCenter))?.name : undefined;
  if (costCenter && !center) return { note: `No cost center named "${costCenter}". Cost centers: ${d.budget.costCenters.map(c => c.name).join(", ") || "none"}.` };
  const lines = d.budget.lines.filter(l => !center || l.costCenter === center).sort((a, b) => b.budget - a.budget);
  // One line of text per budget line: a large budget still fits one result.
  const line = (l: BudgetState["lines"][number]) => [l.description, l.costCenter, l.csiCode ?? "no code", `budget ${l.budget}`, `forecast ${l.forecast ?? "none"}`, `committed ${l.committed}`,
    l.forecast !== null && l.forecast > l.budget ? `over by ${Math.round((l.forecast - l.budget) * 100) / 100}` : "", l.status, l.byOwner ? "carried by owner, not in totals" : ""].filter(Boolean).join(" · ");
  return {
    costCenters: d.budget.costCenters,
    totals: budgetSummary(d.budget, center),
    lines: lines.slice(0, 70).map(line),
    moreLines: Math.max(0, lines.length - 70),
    allowances: d.budget.allowances.filter(a => !center || a.costCenter === center).map(a => `${a.name} · ${a.costCenter} · ${a.amount} · ${a.status}`),
  };
}

function valueEngineering(d: Data) {
  const ve = d.ve;
  return {
    target: ve.target, markupFactor: ve.markupFactor,
    moreIdeas: Math.max(0, ve.ideas.length - 40),
    ideas: ve.ideas.slice(0, 40).map(i => ({
      number: i.number, category: i.category, description: clip(i.description, 200), trade: packageName(d.procurement, i.packageId), csiCode: i.csiCode, source: i.source,
      costImpact: i.costImpact, status: i.status,
      pricing: i.pricing.map(p => ({ company: p.company, status: p.status, quotedImpact: p.quotedImpact })),
      decision: i.decision ? { outcome: i.decision.outcome, by: i.decision.by, on: i.decision.at.slice(0, 10), acceptedImpact: i.decision.acceptedImpact, ownerApproved: !!i.decision.ownerApproved } : null,
    })),
  };
}

function issuesAndRfis(d: Data, status?: string) {
  const all = status === "all";
  const numbers = new Map(d.check.issues.map(i => [i.id, i.number]));
  return {
    // What an RFI draft needs (rfi.ts validRfi): an addressee, and issues that are reviewed, open and in no RFI yet.
    designTeamContact: d.check.designTeam ? [d.check.designTeam.name, d.check.designTeam.company].filter(Boolean).join(", ") : "none saved yet: add it on the Structor Check & RFIs page before any RFI can be drafted",
    issues: d.check.issues.filter(i => all || openIssue(i.status)).slice(0, 30).map(i => ({ number: i.number, title: i.title, category: i.category, severity: i.severity, trade: i.trade, source: i.source, status: i.status, raisedBy: i.raisedBy, detail: clip(i.detail, 200),
      canGoInAnRfi: i.status === "open" && (!["ai", "subcontractor"].includes(i.origin) || !!i.reviewedBy) ? "yes" : i.status === "pending-review" ? "no: needs contractor review first" : `no: ${i.status.replace("-", " ")}` })),
    rfis: d.check.rfis.filter(r => all || r.status !== "closed").slice(0, 25).map(r => ({ number: r.number, subject: r.subject, discipline: r.discipline, status: r.status, due: r.due, to: r.to?.name ?? "", question: clip(r.question, 300), answer: r.response ? clip(r.response.text, 300) : null, issues: r.issueIds.map(id => numbers.get(id) ?? id) })),
  };
}

function schedule(d: Data, today: string, phase?: string) {
  const rows = scheduleRows(d.schedule, today).filter(r => !phase || norm(r.phase).includes(norm(phase)));
  const code = (id: string) => d.schedule.activities.find(a => a.id === id)?.code ?? id;
  return {
    phases: [...new Set(d.schedule.activities.map(a => a.phase))],
    // code · name · phase · owner · start → finish (working days) · progress · flags · after predecessors
    activities: rows.slice(0, 90).map(r => [r.code, r.name, r.phase, r.owner, `${r.start} → ${r.finish} (${r.duration} working days)`, `${r.progress}% done`,
      r.milestone ? "milestone" : "", r.critical ? "critical" : "", r.late ? "late" : "", r.predecessors.length ? `after ${r.predecessors.map(p => code(p.activityId)).join(", ")}` : ""].filter(Boolean).join(" · ")),
    moreActivities: Math.max(0, rows.length - 90),
  };
}

async function searchProjectFiles(ctx: Context, query: string, category?: string) {
  const params = new URLSearchParams({ project: ctx.projectId, q: query, ...(category ? { category } : {}) });
  const response = await (ctx.fetchImpl ?? fetch)(`/api/project-files/search?${params}`);
  const body = await response.json().catch(() => ({})) as { results?: unknown[]; files?: number; pages?: number; error?: string };
  if (!response.ok) return { error: body.error ?? `File search failed (${response.status}).` };
  return body.results?.length ? { results: body.results, searched: { files: body.files, pages: body.pages } } : { results: [], note: body.files ? `No page of the ${body.files} uploaded files matched.` : "No files with readable text are uploaded to this project. Upload them in Project files." };
}

function structorGuide(query: string) {
  const words = norm(query).split(" ").filter(w => w.length > 3);
  const scored = manualGuides.map(g => ({ g, n: words.filter(w => norm(`${g.title} ${g.purpose}`).includes(w)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
  return { guides: scored.map(x => clip(guideText(x.g), 3500)), screens: scored.map(x => x.g.id) };
}

/** Runs one tool call on the open project. `screens` are the pages its facts come from. */
export async function runAssistantTool(call: AssistantToolCall, ctx: Partial<Context> = {}): Promise<{ content: string; screens: Screen[]; reports?: BidPackageReport[] }> {
  const context: Context = { projectId: ctx.projectId ?? getActiveProjectId(), today: ctx.today ?? new Date().toISOString().slice(0, 10), fetchImpl: ctx.fetchImpl };
  const d = projectData(context.projectId);
  const a = call.arguments;
  const screen = assistantTool(call.name).screen;
  try {
    switch (call.name) {
      case "all_projects": return { content: toolResultText(allProjects(context.projectId)), screens: [screen!] };
      case "project_overview": return { content: toolResultText(projectOverview(d)), screens: [screen!] };
      case "trade_packages": return { content: toolResultText(tradePackages(d, a.trade)), screens: [screen!] };
      case "bid_leveling": return { content: toolResultText(await bidLeveling(d, context, a.trade)), screens: [screen!] };
      case "bid_package_summary": {
        const r = await bidPackageSummary(context.projectId, a.trade, context.today, d);
        return "report" in r ? { content: toolResultText(reportBrief(r.report)), screens: [screen!], reports: [r.report] } : { content: toolResultText(r), screens: [] };
      }
      case "bid_submissions": return { content: toolResultText(bidSubmissions(d, a.trade)), screens: [screen!] };
      case "budget": return { content: toolResultText(budget(d, a.costCenter)), screens: [screen!] };
      case "value_engineering": return { content: toolResultText(valueEngineering(d)), screens: [screen!] };
      case "issues_and_rfis": return { content: toolResultText(issuesAndRfis(d, a.status)), screens: [screen!] };
      case "schedule": return { content: toolResultText(schedule(d, context.today, a.phase)), screens: [screen!] };
      case "search_project_files": return { content: toolResultText(await searchProjectFiles(context, a.query, a.category)), screens: [screen!] };
      case "structor_guide": { const r = structorGuide(a.query); return { content: toolResultText({ guides: r.guides }), screens: r.screens as Screen[] }; }
      default: return { content: toolResultText({ error: `${call.name} is not a reading tool.` }), screens: [] };
    }
  } catch (error) {
    return { content: toolResultText({ error: error instanceof Error ? error.message : "The tool failed." }), screens: [] };
  }
}
