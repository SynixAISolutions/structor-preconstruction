// Progress per step of the Preconstruction to-do (Marcel, 24 Oct): how far every step is ("files uploaded
// 90%, scopes approved 0%") and, under each step, what is still open with a link to do it. Project setup is
// step 1. Progress comes from the to-do's milestones and the setup guide; nothing here is stored.

import type { SetupSummary } from "./project-setup";
import type { Screen } from "./screens";
import type { MilestoneKey, PackageProgress, TodoGroup, TodoSummary, TodoTask } from "./todo";

export type TodoStep = {
  group: TodoGroup;
  label: string;
  screen: Screen;
  /** Percent complete, or null where the step has nothing to measure yet (no trades, no RFIs). */
  percent: number | null;
  /** What the percent counts, in words: "3 of 26 trades approved · 1 bid form published". */
  measure: string;
  todo: number;
  waiting: number;
  tasks: TodoTask[];
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : null);
const count = (packages: PackageProgress[], key: MilestoneKey) => packages.filter(p => p.milestones.some(m => m.key === key && m.done)).length;

/** Per trade, which milestones finish each step. */
const STEP_MILESTONES: Partial<Record<TodoGroup, { key: MilestoneKey; words: string }[]>> = {
  scopes: [{ key: "scope-approved", words: "approved" }, { key: "bid-form-published", words: "published" }],
  outreach: [{ key: "bidders-invited", words: "invited" }, { key: "bids-received", words: "with bids in" }],
  leveling: [{ key: "bids-leveled", words: "leveled" }],
  "scope-review": [{ key: "awarded", words: "with a subcontractor selected" }],
  award: [{ key: "exhibit-agreed", words: "with Exhibit A agreed" }, { key: "subcontract-executed", words: "executed" }],
};

function measured(group: TodoGroup, summary: TodoSummary, setup: SetupSummary | null): { percent: number | null; measure: string } {
  const packages = summary.packages, trades = packages.length;
  if (group === "setup") {
    if (setup) {
      const c = setup.completeness;
      const open = [c.missing && `${c.missing} missing`, c.review && `${c.review} to check`, c.waiting && `${c.waiting} waiting`].filter(Boolean).join(" · ");
      return { percent: c.percent, measure: `${c.done} of ${plural(c.total, "item")} in place${open ? ` · ${open}` : ""}` };
    }
    const setupMilestones = summary.project.filter(m => m.key === "project-facts" || m.key === "project-files");
    return { percent: pct(setupMilestones.filter(m => m.done).length, setupMilestones.length), measure: setupMilestones.map(m => `${m.label}: ${m.done ? "yes" : "no"}`).join(" · ") };
  }
  if (group === "budget") {
    const budget = summary.project.filter(m => m.key === "budget-approved" || m.key === "allowances-decided");
    return { percent: pct(budget.filter(m => m.done).length, budget.length), measure: budget.map(m => `${m.label}${m.done ? "" : ": not yet"}`).join(" · ") };
  }
  const milestones = STEP_MILESTONES[group];
  if (milestones) {
    if (!trades) return { percent: null, measure: "No trades yet" };
    const done = milestones.reduce((n, m) => n + count(packages, m.key), 0);
    const [first, ...rest] = milestones;
    return { percent: pct(done, trades * milestones.length), measure: [`${count(packages, first.key)} of ${plural(trades, "trade")} ${first.words}`, ...rest.map(m => `${count(packages, m.key)} ${m.words}`)].join(" · ") };
  }
  return { percent: null, measure: "" };
}

/** Every step of the to-do, in Marcel's order, with its progress and its open tasks. */
export function todoSteps(summary: TodoSummary, setup: SetupSummary | null): TodoStep[] {
  return summary.groups.map(g => {
    const tasks = summary.tasks.filter(t => t.group === g.group);
    const { percent, measure } = measured(g.group, summary, setup);
    const open = tasks.length ? [g.todo && `${plural(g.todo, "action")}`, g.waiting && `${g.waiting} waiting`].filter(Boolean).join(" · ") : "Nothing open";
    return { group: g.group, label: g.label, screen: g.screen, percent, measure: measure || open, todo: g.todo, waiting: g.waiting, tasks };
  });
}

/** The step to open first: the earliest one with work for the team, else the earliest with anything open. */
export const firstOpenStep = (steps: TodoStep[]): TodoGroup | null =>
  (steps.find(s => s.todo > 0) ?? steps.find(s => s.tasks.length > 0))?.group ?? null;
