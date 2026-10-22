// Ask Structor's tools: what the assistant may read from the open project, and the changes it may
// propose. The server offers these to the AI and the browser runs them (most project data lives in
// the browser until a server database exists), so this list is shared by both. Reading tools run at
// once; a proposal tool only prepares a change, which happens when the user clicks Apply
// (assistant-actions.ts).

import type { Screen } from "./screens";

export type ReadToolName =
  | "all_projects" | "project_overview" | "trade_packages" | "bid_leveling" | "bid_package_summary" | "bid_submissions" | "budget"
  | "value_engineering" | "issues_and_rfis" | "schedule" | "search_project_files" | "structor_guide";
export type ProposalToolName =
  | "propose_ve_idea" | "propose_issue" | "propose_rfi" | "propose_schedule_activity" | "propose_activity_progress" | "propose_budget_version";
export type AssistantToolName = ReadToolName | ProposalToolName;

/** A tool call as the AI asked for it, after checking the name and arguments. */
export type AssistantToolCall = { id: string; name: AssistantToolName; arguments: Record<string, string> };
export type AssistantToolResult = { id: string; content: string };

type ToolDef = {
  name: AssistantToolName;
  description: string;
  /** Optional string arguments, by name, with their descriptions. */
  args: Record<string, string>;
  required?: string[];
  /** The page the facts come from, offered as an "Open" link under the answer. */
  screen: Screen | null;
  /** What the panel shows while the tool runs. */
  label: (args: Record<string, string>) => string;
};

const TRADE = "Trade name, CSI division or section to narrow to, e.g. \"Drywall\" or \"09 29 00\". Leave out for every trade.";

export const ASSISTANT_TOOLS: ToolDef[] = [
  { name: "all_projects", screen: "projects", args: {},
    description: "Every project in the workspace, not just the open one: name, location, type, status (Preconstruction, Design development, Bidding…), estimate stage, value, size, bid and RFI due dates, start and finish, and for each its trade packages, submitted bids, open issues and RFIs and total budget. Use it for questions across projects; the other tools read only the open project.",
    label: () => "Reading all projects" },
  { name: "project_overview", screen: "overview", args: {},
    description: "The open project's facts (location, size, value, dates, bid and RFI deadlines, architect, team, estimate stage) with counts of its trade packages, invitations, submitted bids, open issues and RFIs, VE ideas and the budget totals. Use it first when unsure where to look.",
    label: () => "Reading the project overview" },
  { name: "trade_packages", screen: "packages", args: { trade: TRADE },
    description: "Trade packages: CSI code, estimator, bid due date, bid form status and version, scope item counts by status, and which subcontractors were invited, are bidding, declined or submitted.",
    label: a => a.trade ? `Reading the ${a.trade} bid package` : "Reading the bid packages" },
  { name: "bid_leveling", screen: "leveling", args: { trade: TRADE },
    description: "Leveled bids by trade: each bidder's base bid, provisional and reviewed (leveled) totals, whether the bid can be ranked and why not, and the scope items a bidder excluded (N) or partly included (P) with notes and adjustments.",
    label: a => a.trade ? `Looking at bid leveling for ${a.trade}` : "Looking at bid leveling" },
  { name: "bid_package_summary", screen: "leveling", args: { trade: "The trade to summarize, e.g. \"Drywall\" or \"09 29 00\". Leave out only when one trade has bids." },
    description: "Saved task: the bid package summary for one trade. The leveled low, the apparent low, the selected bidder, the spread and the trade budget, every bid ranked with its plugs and adjustments, and the scope bidders exclude or cover in part. The user sees its tables and an Excel download under your answer.",
    label: a => `Running the bid package summary${a.trade ? ` for ${a.trade}` : ""}` },
  { name: "bid_submissions", screen: "packages", args: { trade: TRADE },
    description: "Bids subcontractors submitted through the portal: package, company, base bid, revision number and date, exclusions, alternates and clarifications.",
    label: a => a.trade ? `Reading submitted bids for ${a.trade}` : "Reading submitted bids" },
  { name: "budget", screen: "budget", args: { costCenter: "Cost center to narrow to, e.g. \"Modernization\". Leave out for the whole budget." },
    description: "The budget: totals (budget, forecast, committed, remaining, variance where negative is over budget), lines with cost center, CSI code, budget, forecast (and where it comes from), committed and review status, and owner allowances.",
    label: () => "Reading the budget" },
  { name: "value_engineering", screen: "value-engineering", args: {},
    description: "Value engineering: the VE target, and each idea's number, description, trade, cost impact (negative is a saving), status, subcontractor pricing and decision.",
    label: () => "Reading the value engineering log" },
  { name: "issues_and_rfis", screen: "checks", args: { status: "\"open\" (default) for unresolved issues and unanswered RFIs, or \"all\"." },
    description: "Structor Check issues (conflicts and missing information in the drawings and specifications) and RFIs to the design team: number, title, trade, source sheet, severity, status, due date and answer.",
    label: () => "Reading issues and RFIs" },
  { name: "schedule", screen: "schedule", args: { phase: "Phase to narrow to, e.g. \"Procurement\". Leave out for every phase." },
    description: "The project schedule: activities with code, phase, owner, start date, duration in working days, finish, progress and predecessors.",
    label: () => "Reading the schedule" },
  { name: "search_project_files", screen: "documents", args: { query: "Words to look for, e.g. \"fire caulking at rated walls\" or a sheet number.", category: "Optional file category: Drawings, Specifications, Reports, RFP, Contracts, Addenda or Other." }, required: ["query"],
    description: "Searches the text of the project's uploaded drawings, specifications and other files. Returns the best-matching pages with the file, page, sheet or specification section, and a snippet. Drawings whose text is drawn as shapes have little searchable text.",
    label: a => `Searching the project files for "${a.query ?? ""}"` },
  { name: "structor_guide", screen: null, args: { query: "The page or feature the user asks about, in a few words." }, required: ["query"],
    description: "Structor's built-in guide: what a page is for and how to use it, step by step. Use it for how-to questions about Structor itself, not for project facts.",
    label: () => "Checking Structor's guide" },

  // ── Proposals: shown to the user with Apply and Dismiss; nothing changes until they click Apply ──
  { name: "propose_ve_idea", screen: "value-engineering", required: ["description", "costImpact"],
    args: { description: "The idea, e.g. \"Substitute LVT for porcelain tile in corridors\".", costImpact: "The team's estimate of the change in cost, in dollars: negative for a saving, e.g. \"-25000\".", trade: TRADE, category: "Heading it sits under, e.g. \"Finishes\".", source: "Drawing or specification reference it comes from.", notes: "Assumptions or notes." },
    description: "Prepares a new value engineering idea for the user to approve. It is added to the VE log only if they click Apply.",
    label: () => "Preparing a VE idea for your approval" },
  { name: "propose_issue", screen: "checks", required: ["title", "severity"],
    args: { title: "Short title of the problem.", severity: "\"high\", \"medium\" or \"low\".", detail: "What is wrong or missing, and why it matters.", trade: TRADE, source: "Where it was found, e.g. \"A-101 · Room 104\" or \"09 29 00 · 3.2\".", category: "\"Conflict\", \"Missing detail\", \"Coordination\" or \"Question\"." },
    description: "Prepares a new Structor Check issue (a conflict or missing information in the documents) for the user to approve. It is raised only if they click Apply.",
    label: () => "Preparing an issue for your approval" },
  { name: "propose_rfi", screen: "checks", required: ["issues", "question"],
    args: { issues: "Issue numbers the RFI asks about, e.g. \"SC-003, SC-007\". Each must be reviewed and open.", question: "The question for the design team.", subject: "Short subject line.", due: "Answer wanted by, yyyy-mm-dd." },
    description: "Prepares an internal RFI draft to the design team, from open issues, for the user to approve. It is saved as a draft only if they click Apply, and is never sent.",
    label: () => "Preparing an RFI draft for your approval" },
  { name: "propose_schedule_activity", screen: "schedule", required: ["name", "start", "workingDays"],
    args: { name: "Activity name.", start: "Start date, yyyy-mm-dd.", workingDays: "Duration in working days.", phase: "Phase, e.g. \"Procurement\".", owner: "Who is responsible.", trade: TRADE },
    description: "Prepares a new schedule activity for the user to approve. It is added only if they click Apply.",
    label: () => "Preparing a schedule activity for your approval" },
  { name: "propose_activity_progress", screen: "schedule", required: ["activity", "progress"],
    args: { activity: "The activity's code or name.", progress: "Percent complete, 0 to 100." },
    description: "Prepares a progress update for one schedule activity for the user to approve. It changes only if they click Apply.",
    label: () => "Preparing a progress update for your approval" },
  { name: "propose_budget_version", screen: "budget", required: ["name", "stage", "reason"],
    args: { name: "Version name, e.g. \"DD baseline\".", stage: "\"concept\", \"schematic\", \"dd\" or \"cd\".", reason: "What changed since the last version, or why this is the baseline." },
    description: "Prepares saving the current budget as a named version for the user to approve. It is saved only if they click Apply.",
    label: () => "Preparing a budget version for your approval" },
];

export const isProposalTool = (name: AssistantToolName): name is ProposalToolName => name.startsWith("propose_");

/**
 * Saved tasks: repeatable jobs with a fixed output (Concntric calls them Skills). The panel lists them to
 * run at once, without the AI, and the AI runs the same tool when asked in words. `choose`: what the
 * user picks before it runs.
 */
export type SavedTask = { id: string; title: string; description: string; tool: ReadToolName; choose: "trade" };
export const SAVED_TASKS: SavedTask[] = [
  { id: "bid-package-summary", title: "Bid package summary", tool: "bid_package_summary", choose: "trade",
    description: "One trade's bids side by side: leveled and apparent low, spread, budget, plugs and gaps, with an Excel file." },
];

/** Most tool rounds before the AI must answer with what it has. */
export const MAX_STEPS = 5;
/** Tool calls run per round; further calls in one round are dropped. */
export const MAX_CALLS_PER_STEP = 4;
/** Characters of one tool result sent back to the AI. */
export const MAX_TOOL_RESULT = 12_000;

const byName = new Map(ASSISTANT_TOOLS.map(t => [t.name, t]));
export const assistantTool = (name: AssistantToolName): ToolDef => byName.get(name)!;

/** The tools in the chat API's function format. */
export const toolDefinitions = () => ASSISTANT_TOOLS.map(t => ({
  type: "function" as const,
  function: {
    name: t.name, description: t.description,
    parameters: { type: "object", properties: Object.fromEntries(Object.entries(t.args).map(([k, d]) => [k, { type: "string", description: d }])), required: t.required ?? [], additionalProperties: false },
  },
}));

/**
 * A tool call from the AI, checked: a known tool, and only that tool's arguments as short strings.
 * The AI's arguments may be invalid JSON or name arguments that don't exist; those are dropped.
 */
export function parseToolCall(raw: { id?: unknown; name?: unknown; arguments?: unknown }): AssistantToolCall | null {
  const def = typeof raw.name === "string" ? byName.get(raw.name as AssistantToolName) : undefined;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 80) : "";
  if (!def || !id) return null;
  let parsed: unknown = raw.arguments;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed || "{}"); } catch { parsed = {}; } }
  const given = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const args: Record<string, string> = {};
  for (const key of Object.keys(def.args)) {
    const value = given[key];
    if (typeof value === "string" && value.trim()) args[key] = value.trim().slice(0, 200);
  }
  if ((def.required ?? []).some(key => !args[key])) return null;
  return { id, name: def.name, arguments: args };
}

/** A tool's result as JSON. Past MAX_TOOL_RESULT the start is kept as text, with a note, so it stays valid JSON. */
export function toolResultText(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length <= MAX_TOOL_RESULT ? text : JSON.stringify({ partial: text.slice(0, MAX_TOOL_RESULT - 200), note: "Cut short: ask about one trade, cost center or phase for the rest." });
}
