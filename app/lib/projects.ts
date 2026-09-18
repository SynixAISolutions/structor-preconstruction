// Project records: shape, sample data, browser persistence and list filtering.
// These are illustrative sample projects, not data from a real system of record.

export type ProjectCard = {
  id: string; name: string; location: string; type: string; status: string;
  value: number; size: string; architect: string; description: string;
  due: string; rfi: string; start: string; finish: string;
};

export const PROJECTS_STORAGE_KEY = "structor-ui-projects";

export const PROJECT_TABS = ["All projects", "Preconstruction", "Design development", "Bidding"];

export const sampleProjects: ProjectCard[] = [
  { id: "jelleff", name: "Jelleff Recreation Center", location: "Washington, DC", type: "Community & recreation", status: "Preconstruction", value: 18400000, size: "42,500 SF", architect: "Project design team", description: "Modernization of the existing recreation center, a new community addition, and improvements to the surrounding site. A coordinated approach to scopes, trade procurement, and cost planning.", due: "2026-10-02", rfi: "2026-09-25", start: "2027-01-11", finish: "2028-04-28" },
  { id: "whittier", name: "Whittier Campus", location: "Washington, DC", type: "Education", status: "Design development", value: 26800000, size: "68,200 SF", architect: "Campus design team", description: "A school modernization, classroom addition, and associated site work.", due: "2026-11-06", rfi: "2026-10-23", start: "2027-03-01", finish: "2028-08-18" },
  { id: "riverside", name: "Riverside Commons", location: "Arlington, VA", type: "Mixed-use", status: "Bidding", value: 12300000, size: "31,800 SF", architect: "Project architect", description: "A mixed-use community space with new retail and public gathering areas.", due: "2026-10-16", rfi: "2026-10-02", start: "2027-02-01", finish: "2028-02-25" },
];

/** Saved projects for this browser, or null when there is nothing usable stored. */
export function loadProjects(): ProjectCard[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length && saved.every(p => p.id && p.name)) return saved as ProjectCard[];
  } catch { /* An unreadable store falls back to the sample projects. */ }
  return null;
}

export function saveProjects(projects: ProjectCard[]): void {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch { /* Keep the session editable when storage is full. */ }
}

/** Builds a new project record from the create-project form, defaulting the fields it does not collect. */
export function projectFromForm(form: FormData): ProjectCard {
  return {
    ...sampleProjects[0],
    id: crypto.randomUUID(),
    name: String(form.get("name")).trim(),
    location: String(form.get("location")),
    type: String(form.get("type")),
    value: Number(form.get("value")) || 0,
    description: String(form.get("description")),
    status: "Preconstruction",
  };
}

export function filterProjects(projects: ProjectCard[], query: string, tab: string): ProjectCard[] {
  const q = query.trim().toLowerCase();
  return projects.filter(p =>
    p.name.toLowerCase().includes(q) && (tab === PROJECT_TABS[0] || p.status === tab));
}
