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
  | "messages" | "turnover" | "settings" | "model";

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

export const SCREEN_GROUPS: ScreenGroup[] = [
  { label: "WORKSPACE", scope: "global", items: [
    { id: "projects", label: "All projects", icon: "FolderOpen" },
    { id: "bidders", label: "Subcontractor directory", icon: "Users", keywords: ["bidder directory", "companies", "trade partners"] },
  ]},
  { label: "PRECONSTRUCTION", scope: "project", items: [
    { id: "overview", label: "Overview", icon: "LayoutDashboard", keywords: ["dashboard"] },
    { id: "information", label: "Project information", icon: "Building2" },
    { id: "documents", label: "Project files", icon: "FileStack", keywords: ["documents", "document library", "rfp"] },
    { id: "scopes", label: "Scopes & bid forms", icon: "ListChecks" },
    { id: "packages", label: "Bid packages", icon: "Box", section: OUTREACH, keywords: ["invited bidders", "invitations"] },
    { id: "messages", label: "Messages", icon: "MessageSquare", count: "3", section: OUTREACH, keywords: ["conversations"] },
    { id: "portal", label: "Subcontractor portal", icon: "HardHat", section: OUTREACH, keywords: ["proposals"] },
    { id: "leveling", label: "Bid leveling", icon: "Gauge", section: OUTREACH },
    { id: "takeoffs", label: "Quantity takeoffs", icon: "Ruler" },
    { id: "checks", label: "Structor Check", icon: "ShieldCheck", count: "4", keywords: ["rfi", "issues"] },
    { id: "drawings", label: "List of drawings", icon: "FileText", keywords: ["drawing register", "sheets"] },
    { id: "revisions", label: "Revision comparison", icon: "GitCompareArrows" },
    { id: "model", label: "3D model studio", icon: "Box" },
    { id: "budget", label: "Budget summary", icon: "Wallet" },
    { id: "allowances", label: "Allowances", icon: "ClipboardList" },
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

export const isScreen = (value: string): value is Screen => ALL_SCREENS.some(screen => screen.id === value);

export const screenLabel = (id: Screen): string => ALL_SCREENS.find(screen => screen.id === id)?.label ?? "";

/** The group a screen sits in; undefined for Settings, which is global and ungrouped. */
export const screenGroup = (id: Screen): ScreenGroup | undefined => SCREEN_GROUPS.find(group => group.items.some(screen => screen.id === id));

/** Screens matching a free-text query, for the quick-find palette. */
export const searchScreens = (query: string): ScreenDef[] => {
  const q = query.trim().toLowerCase();
  return q ? ALL_SCREENS.filter(screen => [screen.label, screen.section ?? "", ...(screen.keywords ?? [])].some(term => term.toLowerCase().includes(q))) : ALL_SCREENS;
};
