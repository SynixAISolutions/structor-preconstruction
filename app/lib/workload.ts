// Estimator workload (Marcel's features list, item 33: "Resource tracking tool - track capacity of all estimators to make
// sure they are not over or under worked"). Built only from what the app already holds: each project's team, the trade
// packages each person owns (procurement), and the dates bids are due. Who is over capacity is the team's rule, not the
// app's guess: the limits are settings, with defaults the team can change. Pure; the screen renders it.

import type { Project } from "./projects";

export type WorkloadLimits = {
  /** More open trades than this with bids due in the next 14 days is over capacity. */
  tradesDueIn14: number;
  /** More projects than this with their bid due in the next 30 days is over capacity. */
  projectsDueIn30: number;
};
export const DEFAULT_LIMITS: WorkloadLimits = { tradesDueIn14: 6, projectsDueIn30: 2 };

export type OwnedTrade = { projectId: string; projectName: string; packageId: string; trade: string; due: string };
export type PersonLoad = {
  name: string;
  /** Roles on project teams, e.g. Estimator, Project executive. */
  roles: string[];
  /** Projects the person is on (team member or owns a trade), soonest bid first. */
  projects: { id: string; name: string; due: string; status: string }[];
  /** Trades the person owns that aren't bought out yet, soonest due first. */
  trades: OwnedTrade[];
  tradesDueIn14: number;
  projectsDueIn30: number;
  status: "over" | "within" | "room";
  /** Why the status is what it is, in words. */
  reasons: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const within = (date: string, today: string, n: number) => ISO.test(date) && days(today, date) >= 0 && days(today, date) <= n;
const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Limits as saved: whole numbers of at least 0, else the defaults. */
export function normalizeLimits(raw: unknown): WorkloadLimits {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : d;
  return { tradesDueIn14: n(o.tradesDueIn14, DEFAULT_LIMITS.tradesDueIn14), projectsDueIn30: n(o.projectsDueIn30, DEFAULT_LIMITS.projectsDueIn30) };
}

/**
 * Everyone on a project team or owning a trade, with what's on their plate. A trade counts while it isn't awarded
 * (`awarded` holds "projectId:packageId"); a project's bid date counts when the person is on its team or owns one of its
 * trades. Over capacity when either limit is passed; room when there's nothing due in the next 30 days.
 */
export function workload(input: { projects: Project[]; packagesOf: (projectId: string) => { id: string; name: string; owner: string; due: string }[]; awarded?: Set<string>; today: string; limits?: WorkloadLimits }): PersonLoad[] {
  const limits = input.limits ?? DEFAULT_LIMITS;
  const people = new Map<string, { name: string; roles: Set<string>; projects: Map<string, Project>; trades: OwnedTrade[] }>();
  const person = (name: string) => {
    const k = key(name);
    if (!people.has(k)) people.set(k, { name: name.trim().replace(/\s+/g, " "), roles: new Set(), projects: new Map(), trades: [] });
    return people.get(k)!;
  };
  for (const project of input.projects) {
    for (const member of project.team) if (member.name.trim()) { const p = person(member.name); if (member.role) p.roles.add(member.role); p.projects.set(project.id, project); }
    for (const pkg of input.packagesOf(project.id)) {
      if (!pkg.owner.trim() || input.awarded?.has(`${project.id}:${pkg.id}`)) continue;
      const p = person(pkg.owner);
      p.projects.set(project.id, project);
      p.trades.push({ projectId: project.id, projectName: project.name, packageId: pkg.id, trade: pkg.name, due: ISO.test(pkg.due) ? pkg.due : "" });
    }
  }
  const soonest = (a: string, b: string) => (a || "9999").localeCompare(b || "9999");
  return [...people.values()].map(p => {
    const projects = [...p.projects.values()].map(x => ({ id: x.id, name: x.name, due: x.due, status: x.status })).sort((a, b) => soonest(a.due, b.due));
    const trades = [...p.trades].sort((a, b) => soonest(a.due, b.due) || a.trade.localeCompare(b.trade));
    const tradesDueIn14 = trades.filter(t => within(t.due, input.today, 14)).length;
    const projectsDueIn30 = projects.filter(x => within(x.due, input.today, 30)).length;
    const reasons: string[] = [];
    if (tradesDueIn14 > limits.tradesDueIn14) reasons.push(`${tradesDueIn14} trades due in the next 14 days (limit ${limits.tradesDueIn14})`);
    if (projectsDueIn30 > limits.projectsDueIn30) reasons.push(`${projectsDueIn30} project bids due in the next 30 days (limit ${limits.projectsDueIn30})`);
    const status: PersonLoad["status"] = reasons.length ? "over" : !tradesDueIn14 && !projectsDueIn30 ? "room" : "within";
    if (status === "room") reasons.push("Nothing due in the next 30 days");
    if (status === "within") reasons.push(`${tradesDueIn14} of ${limits.tradesDueIn14} trades and ${projectsDueIn30} of ${limits.projectsDueIn30} projects at most`);
    return { name: p.name, roles: [...p.roles].sort(), projects, trades, tradesDueIn14, projectsDueIn30, status, reasons };
  }).sort((a, b) => ({ over: 0, within: 1, room: 2 }[a.status] - { over: 0, within: 1, room: 2 }[b.status]) || b.tradesDueIn14 - a.tradesDueIn14 || a.name.localeCompare(b.name));
}
