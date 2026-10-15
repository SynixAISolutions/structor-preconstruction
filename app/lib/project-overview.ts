import { bidForm, packageStatus, type Procurement } from "./procurement";
import type { StructorCheckState } from "./rfi";
import type { Submission } from "./submissions";

export function projectOverview(procurement: Procurement, submissions: Submission[], check: StructorCheckState, projectId: string) {
  const bids = submissions.filter(s => s.projectId === projectId && s.revisions.length > 0);
  const issues = check.issues.filter(i => ["pending-review", "open", "in-rfi"].includes(i.status));
  const published = procurement.packages.filter(p => packageStatus(procurement, p.id) === "published").length;
  const drafts = procurement.scopes.filter(s => s.status !== "approved").length;
  const packages = procurement.packages.map(pkg => ({ ...pkg, status: packageStatus(procurement, pkg.id), requirements: bidForm(procurement, pkg.id).length,
    invited: procurement.invitations.filter(i => i.packageId === pkg.id).length,
    bids: bids.filter(s => s.packageId === pkg.id).length }));
  const activity = [
    ...procurement.scopes.flatMap(s => s.history.map(h => ({ id: `${s.id}-${h.at}-${h.kind}`, title: `Scope ${h.kind}`, detail: s.title, at: h.at, screen: "scopes" as const }))),
    ...bids.flatMap(s => s.revisions.map(r => ({ id: `${s.id}-${r.number}`, title: `Bid revision ${r.number} submitted`, detail: procurement.packages.find(p => p.id === s.packageId)?.name ?? "Trade package", at: r.submittedAt, screen: "packages" as const }))),
    ...check.issues.map(i => ({ id: i.id, title: i.title, detail: `${i.number} · ${i.status.replaceAll("-", " ")}`, at: i.updatedAt, screen: "checks" as const })),
  ].filter(a => Number.isFinite(Date.parse(a.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
  return { scopeCount: procurement.scopes.length, drafts, bidCount: bids.length, issueCount: issues.length,
    highIssues: issues.filter(i => i.severity === "high").length, published, packageCount: packages.length, packages, activity };
}
