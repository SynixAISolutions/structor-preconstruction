// The scope dashboard (Marcel, 24 Oct: "a scope dashboard like Wire AI's is optional"): where every bid package's
// review stands, by discipline, with its owner and progress, the way Wyre's Scope Assignments page shows it. Built from
// the bid forms (lib/procurement) and the AI's proposals still waiting for review. Pure.

import { bidForm, packageStatus, type PackageStatus, type Procurement } from "./procurement";

/** The discipline a CSI division belongs to, as an estimator groups trades. */
export function disciplineOf(division: string): string {
  const d = Number(division);
  if (d === 3 || d === 5) return "Structural";
  if (d === 21) return "Fire suppression";
  if (d === 22) return "Plumbing";
  if (d === 23) return "Mechanical";
  if (d === 25) return "Integrated automation";
  if (d === 26) return "Electrical";
  if (d === 27) return "Communications";
  if (d === 28) return "Electronic safety & security";
  if (d >= 31 && d <= 35) return "Site & civil";
  if (d >= 2 && d <= 14) return "Architectural";
  return "Other";
}
const ORDER = ["Architectural", "Structural", "Fire suppression", "Plumbing", "Mechanical", "Integrated automation", "Electrical", "Communications", "Electronic safety & security", "Site & civil", "Other"];

export type DashboardRow = {
  packageId: string; code: string; name: string; owner: string; discipline: string;
  /** Bid-form lines (with the lines every trade carries, as the bid form does), how many are approved, and the AI's
   * proposals still waiting for review. */
  items: number; approved: number; proposed: number;
  /** Share of lines approved, 0 to 1 (0 with no lines). */
  progress: number;
  status: PackageStatus;
};
export type ScopeDashboard = {
  rows: DashboardRow[];
  disciplines: { name: string; packages: number }[];
  /** Packages done (every line approved, or published), under way (some approved or proposed), not started. */
  packages: { total: number; done: number; underway: number; notStarted: number };
  /** Scope lines (each once) and AI proposals, and the share of lines approved. */
  items: { total: number; approved: number; needsReview: number; proposed: number; progress: number };
};

/** Every package's review, grouped by discipline in a fixed order, then by CSI section. `proposed` counts the AI's
 * proposals waiting per package. */
export function scopeDashboard(state: Procurement, proposed: (packageId: string) => number): ScopeDashboard {
  const rows: DashboardRow[] = state.packages.map(pkg => {
    const form = bidForm(state, pkg.id);
    const approved = form.filter(s => s.status === "approved").length;
    return { packageId: pkg.id, code: pkg.code, name: pkg.name, owner: pkg.owner, discipline: disciplineOf(pkg.division), items: form.length, approved, proposed: proposed(pkg.id), progress: form.length ? approved / form.length : 0, status: packageStatus(state, pkg.id) };
  }).sort((a, b) => ORDER.indexOf(a.discipline) - ORDER.indexOf(b.discipline) || a.code.localeCompare(b.code));
  const done = rows.filter(r => r.status !== "draft").length;
  const underway = rows.filter(r => r.status === "draft" && (r.approved > 0 || r.proposed > 0)).length;
  // Each line once, though a line every trade carries is in every bid form.
  const total = state.scopes.length, approved = state.scopes.filter(s => s.status === "approved").length;
  return {
    rows,
    disciplines: ORDER.map(name => ({ name, packages: rows.filter(r => r.discipline === name).length })).filter(d => d.packages),
    packages: { total: rows.length, done, underway, notStarted: rows.length - done - underway },
    items: { total, approved, needsReview: total - approved, proposed: rows.reduce((n, r) => n + r.proposed, 0), progress: total ? approved / total : 0 },
  };
}
