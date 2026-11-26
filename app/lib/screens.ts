// Navigation contract: which screens exist, what they are called, and how they group.
// Owned by the functionality side. Icons are referenced by lucide export name so that
// changing an icon stays a UI edit in app/page.tsx and never touches this file.
//
// Structure is Marcel's 20 September review as reordered on 7 October: global workspace tools,
// then the project groups — Preconstruction, Contracts & procurement (his issues log, item 18, 18 Nov) and Operations. Inside Preconstruction the to-do
// list comes first and the 3D model studio last; Subcontractor outreach and Preconstruction budget are
// sections (24 Oct: Compliance and contracts folded into outreach, "one flow"). The Subcontractor portal is what an invited company
// sees, so it sits in its own SUBCONTRACTOR VIEW group outside the contractor's sidebar.

export type Screen =
  | "projects" | "information" | "documents" | "scopes" | "takeoffs"
  | "packages" | "bidders" | "portal" | "leveling" | "budget" | "allowances" | "unit-costs"
  | "contracts" | "contract-compare" | "schedule" | "drawings" | "revisions" | "checks" | "specs"
  | "turnover" | "settings" | "model" | "specifications" | "value-engineering"
  | "architect" | "ratings" | "prequalification" | "drawing-flip" | "buyout" | "model-mep" | "model-structural" | "model-exterior"
  | "rfp-requirements" | "compliance" | "assumptions" | "workload" | "exhibits" | "memory";

export type ViewProps = { navigate: (screen: Screen) => void; notify: (message: string) => void; projectName: string };

/**
 * "global" screens belong to the organization; "project" screens show the selected project;
 * "subcontractor" screens are the invited company's view of the selected project.
 */
export type ScreenScope = "global" | "project" | "subcontractor" | "architect";

/**
 * `section` is a sub-heading inside a group; items sharing one are adjacent.
 * `keywords` are extra quick-find terms, including every screen's former names.
 */
/**
 * `availability`: where a screen is offered (Danial, 25 Nov: "clean up the misleading pages"). "hidden": not built yet, so
 * it is off the menu and quick find; "sample": only on the sample project (Project 1), whose MEP, structural and exterior
 * models were traced for it. On any other project those pages showed the same generated model as Interior finishes.
 * A link to a screen that isn't offered opens `fallback`.
 */
export type ScreenDef = { id: Screen; label: string; icon: string; count?: string; section?: string; keywords?: string[]; availability?: "hidden" | "sample"; fallback?: Screen };
export type ScreenGroup = { label: string; scope: ScreenScope; items: ScreenDef[] };

/** The screen the app opens on. Marcel: start from All projects. */
export const DEFAULT_SCREEN: Screen = "projects";

const OUTREACH = "Subcontractor outreach";
const BUDGET = "Preconstruction budget";
const MODEL = "3D model studio";

export const SCREEN_GROUPS: ScreenGroup[] = [
  { label: "WORKSPACE", scope: "global", items: [
    { id: "projects", label: "All projects", icon: "FolderOpen" },
    { id: "bidders", label: "Subcontractor directory", icon: "Users", keywords: ["bidder directory", "companies", "trade partners"] },
    // A placeholder until the rating criteria are agreed: off the menu, so it doesn't read as a working page.
    { id: "ratings", label: "Subcontractor ratings", icon: "Gauge", keywords: ["rate subcontractors", "reviews", "scorecard"], availability: "hidden", fallback: "bidders" },
    { id: "prequalification", label: "Subcontractor aggregate limits", icon: "ClipboardCheck", keywords: ["aggregate limit", "single project limit", "open contract value", "Textura", "bonding capacity", "Subcontractor prequalification", "prequal"] },
    // Marcel's features list, item 33: "track capacity of all estimators to make sure they are not over or under worked".
    { id: "workload", label: "Estimator workload", icon: "Users", keywords: ["resource tracking", "capacity", "estimators", "workload", "who is free", "over worked"] },
    // Marcel's process doc: rates kept from each job as a benchmark for the next.
    { id: "unit-costs", label: "Unit cost database", icon: "Gauge", keywords: ["unit prices", "benchmark", "cost database", "cost per square foot", "historical rates", "price book"] },
    // Danial, 23 Nov: "an AI agent that keeps context always so for next scan or extract it knows exactly what to extract".
    { id: "memory", label: "AI memory", icon: "BrainCircuit", keywords: ["company memory", "playbook", "rules", "learned", "corrections", "wording examples", "project decisions", "what the ai knows", "training"] },
  ]},
  { label: "PRECONSTRUCTION", scope: "project", items: [
    { id: "turnover", label: "Preconstruction to-do", icon: "ClipboardCheck", keywords: ["project turnover", "percent complete", "checklist", "overview", "dashboard", "project health", "progress", "project setup", "getting started", "onboarding", "missing documents", "upload"] },
    { id: "information", label: "Project information", icon: "Building2" },
    { id: "documents", label: "Project files", icon: "FileStack", keywords: ["documents", "document library", "rfp"] },
    // Marcel's process doc: the RFP divided into one list of what the job requires.
    { id: "rfp-requirements", label: "RFP requirements", icon: "ClipboardList", keywords: ["requirements", "savings clause", "subcontractor qualifications", "submission requirements", "rfp response", "addenda"] },
    { id: "scopes", label: "Scopes & bid forms", icon: "ListChecks" },
    { id: "drawing-flip", label: "Drawing Flip", icon: "Layers3", keywords: ["drawing review", "trade overlay", "trade colors", "scope on drawings"] },
    // Marcel, 15 Oct: "move that up to pre-construction" — beside Drawing Flip, above Subcontractor outreach.
    { id: "revisions", label: "Revision comparison", icon: "GitCompareArrows", keywords: ["compare drawings", "overlay", "changes between revisions"] },
    // Marcel's feedback log, 8 Nov: "Move to Preconstruction under there". It sat after List of specifications, where it
    // read as part of Subcontractor outreach; now it's with the other drawing reviews, above outreach.
    { id: "checks", label: "Structor Check & RFIs", icon: "ShieldCheck", keywords: ["rfi", "rfi log", "issues", "issue review", "questions", "design team"] },
    // Marcel's process doc: what changed since the previous contract with the same client.
    { id: "contract-compare", label: "Contract comparison", icon: "GitCompareArrows", keywords: ["previous contract", "owner contract", "prime contract", "contract changes", "redline", "same client"] },
    { id: "packages", label: "Bid packages", icon: "Box", section: OUTREACH, keywords: ["invited bidders", "invitations", "messages", "conversations"] },
    { id: "leveling", label: "Bid leveling", icon: "Gauge", section: OUTREACH },
    // Marcel's feedback log, 7 Nov: "a section at the end of Subcontractor outreach called compliance".
    { id: "compliance", label: "Compliance", icon: "BadgeCheck", section: OUTREACH, keywords: ["CBE", "MBE", "WBE", "SBE", "First Source", "participation", "certification", "wage scale", "Davis-Bacon", "prevailing wage"] },
    { id: "takeoffs", label: "Quantity takeoffs", icon: "Ruler", section: BUDGET, keywords: ["estimate", "in-house estimate", "mcn estimate"] },
    { id: "budget", label: "Budget summary", icon: "Wallet", section: BUDGET },
    { id: "allowances", label: "Allowances", icon: "ClipboardList", section: BUDGET },
    { id: "value-engineering", label: "Value engineering", icon: "Wallet", section: BUDGET, keywords: ["VE", "savings", "target reduction", "cost reduction"] },
    // Marcel's features list, item 35: "Assumptions and Clarifications or Basis of Estimate under preconstruction budget".
    { id: "assumptions", label: "Assumptions & clarifications", icon: "ListChecks", section: BUDGET, keywords: ["basis of estimate", "qualifications", "clarifications", "assumptions", "exclusions", "proposal clarifications"] },
    { id: "model", label: "Interior finishes", icon: "Box", section: MODEL, keywords: ["3d model studio", "3d model", "interiors", "finishes", "doors", "walkthrough"] },
    { id: "model-mep", label: "MEP coordination", icon: "Box", section: MODEL, keywords: ["3d mep", "mechanical", "electrical", "plumbing", "fire protection", "bim", "clash"], availability: "sample", fallback: "model" },
    { id: "model-structural", label: "Structural model", icon: "Box", section: MODEL, keywords: ["3d structure", "concrete", "steel", "framing", "columns"], availability: "sample", fallback: "model" },
    { id: "model-exterior", label: "Exterior model", icon: "Box", section: MODEL, keywords: ["3d exterior", "facade", "envelope", "roof", "storefront"], availability: "sample", fallback: "model" },
  ]},
  // Marcel's issues log, item 18 (18 Nov): "Create a main header titled contracts and procurement, let scope review and buy
  // out be under there, contracts & exhibits be titled contracts, and have one for exhibits, and have list of drawings and
  // list of specifications under there."
  { label: "CONTRACTS & PROCUREMENT", scope: "project", items: [
    // Marcel, 22 Oct: after leveling, scope reviews, best and final, award and contract, tracked per trade.
    { id: "buyout", label: "Scope review & buyout", icon: "UserCheck", keywords: ["buyout log", "buyout tracker", "scope review", "best and final", "bafo", "meeting minutes", "ball in court", "award"] },
    { id: "contracts", label: "Contracts", icon: "FileCheck2", keywords: ["contracts & exhibits", "subcontract", "exhibit a", "award", "docusign", "signature"] },
    { id: "exhibits", label: "Exhibits", icon: "FileStack", keywords: ["exhibit a", "exhibit b", "list of documents", "insurance requirements", "safety plan", "billing package", "quality control plan", "contract exhibits"] },
    { id: "drawings", label: "List of drawings", icon: "FileText", keywords: ["drawing register", "sheets"] },
    { id: "specifications", label: "List of specifications", icon: "FileText", keywords: ["spec register", "project manual", "specification sections"] },
  ]},
  { label: "OPERATIONS", scope: "project", items: [
    { id: "schedule", label: "Project schedule", icon: "CalendarDays" },
    { id: "specs", label: "Submittal packages", icon: "Layers3", keywords: ["spec matrix", "submittal log", "submittal requirements", "ball in court", "architect review", "shop drawings", "product data"] },
  ]},
];

/**
 * What an invited subcontractor sees for the selected project. Not part of SCREEN_GROUPS, so it
 * is not in the contractor's sidebar (Marcel, 7 Oct: "it wouldn't be shown for the general
 * contractor"); the contractor opens it as a preview.
 */
export const SUBCONTRACTOR_VIEW: ScreenGroup = { label: "SUBCONTRACTOR VIEW", scope: "subcontractor", items: [
  { id: "portal", label: "Subcontractor portal", icon: "HardHat", keywords: ["proposals", "bidder view", "preview as subcontractor"] },
]};

export const ARCHITECT_VIEW: ScreenGroup = { label: "ARCHITECT VIEW", scope: "architect", items: [{ id: "architect", label: "Architect submittals", icon: "BookOpenText", keywords: ["preview as architect", "design team review"] }] };

/** The contractor's way into the subcontractor view. */
export const PORTAL_PREVIEW_SCREEN: ScreenDef = SUBCONTRACTOR_VIEW.items[0];

export const SETTINGS_SCREEN: ScreenDef = { id: "settings", label: "Settings", icon: "Settings2" };

export const ALL_SCREENS: ScreenDef[] = [...SCREEN_GROUPS.flatMap(group => group.items), ...SUBCONTRACTOR_VIEW.items, ...ARCHITECT_VIEW.items, SETTINGS_SCREEN];

/**
 * Screens that no longer exist, and where their old links now go. Messages: messaging lives in each Bid package (Marcel,
 * 20 Sep: remove Conversations, keep it inside Subcontractor Outreach). Overview: one page with the to-do (Marcel, 22 Oct).
 * Project setup: part of the Preconstruction to-do, as its first step (Marcel, 24 Oct: "these 2 would be one").
 */
export const RETIRED_SCREENS: Record<string, Screen> = { messages: "packages", overview: "turnover", setup: "turnover" };

/** A hash or link value → the screen to show: current screens as they are, retired ones redirected, anything else null. */
export const resolveScreen = (value: string): Screen | null =>
  isScreen(value) ? value : RETIRED_SCREENS[value] ?? null;

export const isScreen = (value: string): value is Screen => ALL_SCREENS.some(screen => screen.id === value);

export const screenLabel = (id: Screen): string => ALL_SCREENS.find(screen => screen.id === id)?.label ?? "";

/** The group a screen sits in, SUBCONTRACTOR VIEW included; undefined for Settings, which is global and ungrouped. */
export const screenGroup = (id: Screen): ScreenGroup | undefined => [...SCREEN_GROUPS, SUBCONTRACTOR_VIEW, ARCHITECT_VIEW].find(group => group.items.some(screen => screen.id === id));

/** Whether a screen is offered (`sample`: the open project is the sample project). */
export const screenOffered = (screen: ScreenDef, sample: boolean): boolean =>
  !screen.availability || (screen.availability === "sample" && sample);

/** The screen to show for `id`: itself where it is offered, otherwise where its links go. */
export const shownScreen = (id: Screen, sample: boolean): Screen => {
  const def = ALL_SCREENS.find(screen => screen.id === id);
  return !def || screenOffered(def, sample) ? id : def.fallback ?? DEFAULT_SCREEN;
};

/** Screens matching a free-text query, for the quick-find palette: only those offered (`sample` as in screenOffered). */
export const searchScreens = (query: string, sample = false): ScreenDef[] => {
  const q = query.trim().toLowerCase();
  const offered = ALL_SCREENS.filter(screen => screenOffered(screen, sample));
  return q ? offered.filter(screen => [screen.label, screen.section ?? "", ...(screen.keywords ?? [])].some(term => term.toLowerCase().includes(q))) : offered;
};
