// Navigation contract: which screens exist, what they are called, and how they group.
// Owned by the functionality side. Icons are referenced by lucide export name so that
// changing an icon stays a UI edit in app/page.tsx and never touches this file.

export type Screen =
  | "overview" | "projects" | "information" | "documents" | "scopes" | "takeoffs"
  | "packages" | "bidders" | "portal" | "leveling" | "budget" | "allowances"
  | "contracts" | "schedule" | "drawings" | "revisions" | "checks" | "specs"
  | "messages" | "turnover" | "settings" | "model";

export type ViewProps = { navigate: (screen: Screen) => void; notify: (message: string) => void; projectName: string };

export type ScreenDef = { id: Screen; label: string; icon: string; count?: string };
export type ScreenGroup = { label: string; items: ScreenDef[] };

export const SCREEN_GROUPS: ScreenGroup[] = [
  { label: "WORKSPACE", items: [
    { id: "overview", label: "Overview", icon: "LayoutDashboard" },
    { id: "model", label: "3D model studio", icon: "Box" },
    { id: "projects", label: "All projects", icon: "FolderOpen" },
    { id: "information", label: "Project information", icon: "Building2" },
  ]},
  { label: "PRECONSTRUCTION", items: [
    { id: "documents", label: "Documents", icon: "FileStack" },
    { id: "scopes", label: "Scopes & bid forms", icon: "ListChecks" },
    { id: "takeoffs", label: "Quantity takeoffs", icon: "Ruler" },
    { id: "specs", label: "Spec matrix", icon: "Layers3" },
    { id: "checks", label: "Structor Check", icon: "ShieldCheck", count: "4" },
    { id: "drawings", label: "Drawing register", icon: "FileText" },
    { id: "revisions", label: "Revision comparison", icon: "GitCompareArrows" },
  ]},
  { label: "BID & AWARD", items: [
    { id: "packages", label: "Bid packages", icon: "Box" },
    { id: "bidders", label: "Bidder directory", icon: "Users" },
    { id: "leveling", label: "Bid leveling", icon: "Gauge" },
    { id: "budget", label: "Budget summary", icon: "Wallet" },
    { id: "allowances", label: "Allowances", icon: "ClipboardList" },
    { id: "contracts", label: "Contracts & exhibits", icon: "FileCheck2" },
  ]},
  { label: "COORDINATION", items: [
    { id: "schedule", label: "Project schedule", icon: "CalendarDays" },
    { id: "messages", label: "Conversations", icon: "MessageSquare", count: "3" },
    { id: "turnover", label: "Project turnover", icon: "ClipboardCheck" },
    { id: "portal", label: "Subcontractor portal", icon: "HardHat" },
  ]},
];

export const SETTINGS_SCREEN: ScreenDef = { id: "settings", label: "Settings", icon: "Settings2" };

export const ALL_SCREENS: ScreenDef[] = [...SCREEN_GROUPS.flatMap(group => group.items), SETTINGS_SCREEN];

export const isScreen = (value: string): value is Screen => ALL_SCREENS.some(screen => screen.id === value);

export const screenLabel = (id: Screen): string => ALL_SCREENS.find(screen => screen.id === id)?.label ?? "";

/** Screens matching a free-text query, for the quick-find palette. */
export const searchScreens = (query: string): ScreenDef[] => {
  const q = query.trim().toLowerCase();
  return q ? ALL_SCREENS.filter(screen => screen.label.toLowerCase().includes(q)) : ALL_SCREENS;
};
