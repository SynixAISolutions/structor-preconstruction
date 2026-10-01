// Navigation contract: which screens exist, what they are called, and how they group.
// Owned by the functionality side. Icons are referenced by lucide export name so that
// changing an icon stays a UI edit in app/page.tsx and never touches this file.
//
// Structure is Marcel's 20 September review: global workspace tools, then two project
// groups — Preconstruction and Operations — with Subcontractor outreach nested inside
// Preconstruction as a section, not a third group.

export type Screen =
  | "overview" | "projects" | "information" | "documents" | "scopes" | "takeoffs"
  | "packages" | "bidders" | "portal" | "leveling" | "budget" | "allowances"
  | "contracts" | "schedule" | "drawings" | "revisions" | "checks" | "specs"
  | "turnover" | "settings" | "model" | "specifications" | "value-engineering"
  | "ratings" | "prequalification" | "drawing-flip" | "model-mep" | "model-structural" | "model-exterior";

export type ViewProps = { navigate: (screen: Screen) => void; notify: (message: string) => void; projectName: string };

/** "global" screens belong to the organization; "project" screens show the selected project. */
export type ScreenScope = "global" | "project";

/**
 * `section` is a sub-heading inside a group; items sharing one are adjacent.
 * `keywords` are extra quick-find terms, including every screen's former names.
 */
export type ScreenDef = { id: Screen; label: string; icon: string; count?: string; section?: string; keywords?: string[] };
export type ScreenGroup = { label: string; scope: ScreenScope; items: ScreenDef[] };

/** The screen the app opens on. Marcel: start from All projects. */
export const DEFAULT_SCREEN: Screen = "projects";

const OUTREACH = "Subcontractor outreach";
const MODEL = "3D model studio";

export const SCREEN_GROUPS: ScreenGroup[] = [
  { label: "WORKSPACE", scope: "global", items: [
    { id: "projects", label: "All projects", icon: "FolderOpen" },
    { id: "bidders", label: "Subcontractor directory", icon: "Users", keywords: ["bidder directory", "companies", "trade partners"] },
    { id: "ratings", label: "Subcontractor ratings", icon: "Gauge", keywords: ["rate subcontractors", "reviews", "scorecard"] },
    { id: "prequalification", label: "Prequalification", icon: "ClipboardCheck", keywords: ["prequal", "qualified subcontractors", "questionnaire"] },
  ]},
  { label: "PRECONSTRUCTION", scope: "project", items: [
    { id: "overview", label: "Overview", icon: "LayoutDashboard", keywords: ["dashboard"] },
    { id: "information", label: "Project information", icon: "Building2" },
    { id: "documents", label: "Project files", icon: "FileStack", keywords: ["documents", "document library", "rfp"] },
    { id: "scopes", label: "Scopes & bid forms", icon: "ListChecks" },
    { id: "drawing-flip", label: "Drawing Flip", icon: "Layers3", keywords: ["drawing review", "trade overlay", "trade colors", "scope on drawings"] },
    { id: "packages", label: "Bid packages", icon: "Box", section: OUTREACH, keywords: ["invited bidders", "invitations", "messages", "conversations"] },
    { id: "portal", label: "Subcontractor portal", icon: "HardHat", section: OUTREACH, keywords: ["proposals"] },
    { id: "leveling", label: "Bid leveling", icon: "Gauge", section: OUTREACH },
    { id: "takeoffs", label: "Quantity takeoffs", icon: "Ruler" },
    { id: "checks", label: "Structor Check & RFIs", icon: "ShieldCheck", keywords: ["rfi", "rfi log", "issues", "questions", "design team"] },
    { id: "drawings", label: "List of drawings", icon: "FileText", keywords: ["drawing register", "sheets"] },
    { id: "specifications", label: "List of specifications", icon: "FileText", keywords: ["spec register", "project manual", "specification sections"] },
    { id: "revisions", label: "Revision comparison", icon: "GitCompareArrows" },
    { id: "model", label: "Interior finishes", icon: "Box", section: MODEL, keywords: ["3d model studio", "3d model", "interiors", "finishes", "doors", "walkthrough"] },
    { id: "model-mep", label: "MEP coordination", icon: "Box", section: MODEL, keywords: ["3d mep", "mechanical", "electrical", "plumbing", "fire protection", "bim", "clash"] },
    { id: "model-structural", label: "Structural model", icon: "Box", section: MODEL, keywords: ["3d structure", "concrete", "steel", "framing", "columns"] },
    { id: "model-exterior", label: "Exterior model", icon: "Box", section: MODEL, keywords: ["3d exterior", "facade", "envelope", "roof", "storefront"] },
    { id: "budget", label: "Budget summary", icon: "Wallet" },
    { id: "allowances", label: "Allowances", icon: "ClipboardList" },
    { id: "value-engineering", label: "Value engineering", icon: "Wallet", keywords: ["VE", "savings", "target reduction", "cost reduction"] },
    { id: "contracts", label: "Contracts & exhibits", icon: "FileCheck2", keywords: ["exhibit a", "award"] },
    { id: "turnover", label: "Preconstruction to-do", icon: "ClipboardCheck", keywords: ["project turnover", "percent complete", "checklist"] },
  ]},
  { label: "OPERATIONS", scope: "project", items: [
    { id: "schedule", label: "Project schedule", icon: "CalendarDays" },
    { id: "specs", label: "Submittal packages", icon: "Layers3", keywords: ["spec matrix", "submittal log", "submittal requirements"] },
  ]},
];

export const SETTINGS_SCREEN: ScreenDef = { id: "settings", label: "Settings", icon: "Settings2" };

export const ALL_SCREENS: ScreenDef[] = [...SCREEN_GROUPS.flatMap(group => group.items), SETTINGS_SCREEN];

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

/** The group a screen sits in; undefined for Settings, which is global and ungrouped. */
export const screenGroup = (id: Screen): ScreenGroup | undefined => SCREEN_GROUPS.find(group => group.items.some(screen => screen.id === id));

/** Screens matching a free-text query, for the quick-find palette. */
export const searchScreens = (query: string): ScreenDef[] => {
  const q = query.trim().toLowerCase();
  return q ? ALL_SCREENS.filter(screen => [screen.label, screen.section ?? "", ...(screen.keywords ?? [])].some(term => term.toLowerCase().includes(q))) : ALL_SCREENS;
};
