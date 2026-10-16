// Navigation contract: which screens exist, what they are called, and how they group.
// Owned by the functionality side. Icons are referenced by lucide export name so that
// changing an icon stays a UI edit in app/page.tsx and never touches this file.
//
// Structure is Marcel's 20 September review as reordered on 7 October: global workspace tools,
// then two project groups — Preconstruction and Operations. Inside Preconstruction the to-do
// list comes first and the 3D model studio last; Subcontractor outreach, Preconstruction budget
// and Compliance and contracts are sections. The Subcontractor portal is what an invited company
// sees, so it sits in its own SUBCONTRACTOR VIEW group outside the contractor's sidebar.

export type Screen =
  | "overview" | "projects" | "information" | "documents" | "scopes" | "takeoffs"
  | "packages" | "bidders" | "portal" | "leveling" | "budget" | "allowances"
  | "contracts" | "schedule" | "drawings" | "revisions" | "checks" | "specs"
  | "turnover" | "settings" | "model" | "specifications" | "value-engineering"
  | "ratings" | "prequalification" | "drawing-flip" | "model-mep" | "model-structural" | "model-exterior";

export type ViewProps = { navigate: (screen: Screen) => void; notify: (message: string) => void; projectName: string };

/**
 * "global" screens belong to the organization; "project" screens show the selected project;
 * "subcontractor" screens are the invited company's view of the selected project.
 */
export type ScreenScope = "global" | "project" | "subcontractor";

/**
 * `section` is a sub-heading inside a group; items sharing one are adjacent.
 * `keywords` are extra quick-find terms, including every screen's former names.
 */
export type ScreenDef = { id: Screen; label: string; icon: string; count?: string; section?: string; keywords?: string[] };
export type ScreenGroup = { label: string; scope: ScreenScope; items: ScreenDef[] };

/** The screen the app opens on. Marcel: start from All projects. */
export const DEFAULT_SCREEN: Screen = "projects";

const OUTREACH = "Subcontractor outreach";
const BUDGET = "Preconstruction budget";
const COMPLIANCE = "Compliance and contracts";
const MODEL = "3D model studio";

export const SCREEN_GROUPS: ScreenGroup[] = [
  { label: "WORKSPACE", scope: "global", items: [
    { id: "projects", label: "All projects", icon: "FolderOpen" },
    { id: "bidders", label: "Subcontractor directory", icon: "Users", keywords: ["bidder directory", "companies", "trade partners"] },
    { id: "ratings", label: "Subcontractor ratings", icon: "Gauge", keywords: ["rate subcontractors", "reviews", "scorecard"] },
    { id: "prequalification", label: "Subcontractor prequalification", icon: "ClipboardCheck", keywords: ["prequal", "qualified subcontractors", "questionnaire"] },
  ]},
  { label: "PRECONSTRUCTION", scope: "project", items: [
    { id: "turnover", label: "Preconstruction to-do", icon: "ClipboardCheck", keywords: ["project turnover", "percent complete", "checklist"] },
    { id: "overview", label: "Overview", icon: "LayoutDashboard", keywords: ["dashboard"] },
    { id: "information", label: "Project information", icon: "Building2" },
    { id: "documents", label: "Project files", icon: "FileStack", keywords: ["documents", "document library", "rfp"] },
    { id: "scopes", label: "Scopes & bid forms", icon: "ListChecks" },
    { id: "drawing-flip", label: "Drawing Flip", icon: "Layers3", keywords: ["drawing review", "trade overlay", "trade colors", "scope on drawings"] },
    // Marcel, 15 Oct: "move that up to pre-construction" — beside Drawing Flip, above Subcontractor outreach.
    { id: "revisions", label: "Revision comparison", icon: "GitCompareArrows", keywords: ["compare drawings", "overlay", "changes between revisions"] },
    { id: "packages", label: "Bid packages", icon: "Box", section: OUTREACH, keywords: ["invited bidders", "invitations", "messages", "conversations"] },
    { id: "leveling", label: "Bid leveling", icon: "Gauge", section: OUTREACH },
    { id: "checks", label: "Structor Check & RFIs", icon: "ShieldCheck", keywords: ["rfi", "rfi log", "issues", "issue review", "questions", "design team"] },
    { id: "takeoffs", label: "Quantity takeoffs", icon: "Ruler", section: BUDGET, keywords: ["estimate", "in-house estimate", "mcn estimate"] },
    { id: "budget", label: "Budget summary", icon: "Wallet", section: BUDGET },
    { id: "allowances", label: "Allowances", icon: "ClipboardList", section: BUDGET },
    { id: "value-engineering", label: "Value engineering", icon: "Wallet", section: BUDGET, keywords: ["VE", "savings", "target reduction", "cost reduction"] },
    { id: "contracts", label: "Contracts & exhibits", icon: "FileCheck2", section: COMPLIANCE, keywords: ["exhibit a", "award"] },
    { id: "drawings", label: "List of drawings", icon: "FileText", section: COMPLIANCE, keywords: ["drawing register", "sheets"] },
    { id: "specifications", label: "List of specifications", icon: "FileText", section: COMPLIANCE, keywords: ["spec register", "project manual", "specification sections"] },
    { id: "model", label: "Interior finishes", icon: "Box", section: MODEL, keywords: ["3d model studio", "3d model", "interiors", "finishes", "doors", "walkthrough"] },
    { id: "model-mep", label: "MEP coordination", icon: "Box", section: MODEL, keywords: ["3d mep", "mechanical", "electrical", "plumbing", "fire protection", "bim", "clash"] },
    { id: "model-structural", label: "Structural model", icon: "Box", section: MODEL, keywords: ["3d structure", "concrete", "steel", "framing", "columns"] },
    { id: "model-exterior", label: "Exterior model", icon: "Box", section: MODEL, keywords: ["3d exterior", "facade", "envelope", "roof", "storefront"] },
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

/** The contractor's way into the subcontractor view. */
export const PORTAL_PREVIEW_SCREEN: ScreenDef = SUBCONTRACTOR_VIEW.items[0];

export const SETTINGS_SCREEN: ScreenDef = { id: "settings", label: "Settings", icon: "Settings2" };

export const ALL_SCREENS: ScreenDef[] = [...SCREEN_GROUPS.flatMap(group => group.items), ...SUBCONTRACTOR_VIEW.items, SETTINGS_SCREEN];

/**
 * Screens that no longer exist, and where their old links now go. Messages: messaging lives in each Bid package (Marcel,
 * 20 Sep: remove Conversations, keep it inside Subcontractor Outreach).
 */
export const RETIRED_SCREENS: Record<string, Screen> = { messages: "packages" };

/** A hash or link value → the screen to show: current screens as they are, retired ones redirected, anything else null. */
export const resolveScreen = (value: string): Screen | null =>
  isScreen(value) ? value : RETIRED_SCREENS[value] ?? null;

export const isScreen = (value: string): value is Screen => ALL_SCREENS.some(screen => screen.id === value);

export const screenLabel = (id: Screen): string => ALL_SCREENS.find(screen => screen.id === id)?.label ?? "";

/** The group a screen sits in, SUBCONTRACTOR VIEW included; undefined for Settings, which is global and ungrouped. */
export const screenGroup = (id: Screen): ScreenGroup | undefined => [...SCREEN_GROUPS, SUBCONTRACTOR_VIEW].find(group => group.items.some(screen => screen.id === id));

/** Screens matching a free-text query, for the quick-find palette. */
export const searchScreens = (query: string): ScreenDef[] => {
  const q = query.trim().toLowerCase();
  return q ? ALL_SCREENS.filter(screen => [screen.label, screen.section ?? "", ...(screen.keywords ?? [])].some(term => term.toLowerCase().includes(q))) : ALL_SCREENS;
};
