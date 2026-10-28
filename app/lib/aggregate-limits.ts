// Subcontractor aggregate limits (Marcel, 24 Oct: renamed from Subcontractor prequalification). The contracts team
// sets each subcontractor's single-project limit and aggregate limit by hand; Structor adds up the open value of the
// subcontractor's awarded contracts on every project and flags who is over. A contract's open value is its amount
// less the share already complete. Percent complete is meant to come from Textura; until that API is connected it
// is typed per contract, and each figure says where it came from. Pure; the page reads the awards of every project.

import { awardStage, type AwardState } from "./award";

/** One subcontractor's limits, as entered by the contracts team. null = no limit set. */
export type SubLimit = { companyId: string; singleProject: number | null; aggregate: number | null; note: string; updatedBy: string; updatedAt: string };
/** How far one awarded contract is billed: typed by hand until Textura is connected. */
export type ContractProgress = { awardId: string; percent: number; source: "manual" | "textura"; updatedBy: string; updatedAt: string };
export type LimitsState = { limits: SubLimit[]; progress: ContractProgress[] };
export const NO_LIMITS: LimitsState = { limits: [], progress: [] };

export type LimitErrors = Partial<Record<"singleProject" | "aggregate" | "percent" | "company", string>>;
export class LimitRuleError extends Error {
  readonly errors: LimitErrors;
  constructor(errors: LimitErrors) { super(Object.values(errors).join(" ")); this.name = "LimitRuleError"; this.errors = errors; }
}

const cents = (n: number) => Math.round(n * 100);
const dollars = (c: number) => c / 100;
const amountError = (value: number | null, label: string) =>
  value === null ? undefined : !Number.isFinite(value) || value < 0 ? `Enter the ${label} as a positive amount, or leave it empty.` : undefined;

/** Sets a subcontractor's limits. The aggregate limit can't be below the single-project limit. */
export function setSubLimit(state: LimitsState, companyId: string, input: { singleProject: number | null; aggregate: number | null; note?: string }, by: string, at = new Date().toISOString()): LimitsState {
  const errors: LimitErrors = {};
  if (!companyId) errors.company = "Choose the subcontractor.";
  const single = amountError(input.singleProject, "single-project limit"), aggregate = amountError(input.aggregate, "aggregate limit");
  if (single) errors.singleProject = single;
  if (aggregate) errors.aggregate = aggregate;
  if (!single && !aggregate && input.singleProject !== null && input.aggregate !== null && input.aggregate < input.singleProject) errors.aggregate = "The aggregate limit covers every project, so it can't be lower than the single-project limit.";
  if (Object.keys(errors).length) throw new LimitRuleError(errors);
  const limit: SubLimit = { companyId, singleProject: input.singleProject, aggregate: input.aggregate, note: input.note?.trim() ?? "", updatedBy: by, updatedAt: at };
  return { ...state, limits: [...state.limits.filter(l => l.companyId !== companyId), limit] };
}

/** Records how complete an awarded contract is (0–100), by hand until Textura is connected. */
export function setPercentComplete(state: LimitsState, awardId: string, percent: number, by: string, at = new Date().toISOString()): LimitsState {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new LimitRuleError({ percent: "Enter a percent complete from 0 to 100." });
  const entry: ContractProgress = { awardId, percent: Math.round(percent * 10) / 10, source: "manual", updatedBy: by, updatedAt: at };
  return { ...state, progress: [...state.progress.filter(p => p.awardId !== awardId), entry] };
}

/** One awarded contract and what is still open on it. `percent` is null until someone records it (counted as 0%). */
export type OpenContract = { awardId: string; projectId: string; projectName: string; trade: string; amount: number; percent: number | null; open: number; executed: boolean };
/** A subcontractor's open value against its limits. `headroom` is the aggregate limit less the open value. */
export type Exposure = {
  companyId: string; company: string; limit: SubLimit | null; contracts: OpenContract[];
  open: number; largest: { projectId: string; projectName: string; open: number } | null;
  overSingle: boolean; overAggregate: boolean; headroom: number | null;
};

export type ExposureInput = {
  directory: { id: string; company: string }[];
  projects: { id: string; name: string; awards: AwardState; packages: { id: string; name: string }[] }[];
  state: LimitsState;
};

/**
 * Every subcontractor with a limit or an awarded contract: its open value on every project (cancelled awards don't
 * count), its largest single project, and whether either limit is exceeded. Over a limit first, then by open value.
 */
export function exposures({ directory, projects, state }: ExposureInput): Exposure[] {
  const byCompany = new Map<string, OpenContract[]>();
  for (const project of projects) {
    for (const award of project.awards.awards) {
      if (award.cancelled) continue;
      const percent = state.progress.find(p => p.awardId === award.id)?.percent ?? null;
      const open = dollars(cents(award.amount) - Math.round(cents(award.amount) * (percent ?? 0) / 100));
      const contract: OpenContract = { awardId: award.id, projectId: project.id, projectName: project.name, trade: project.packages.find(p => p.id === award.packageId)?.name ?? award.packageId, amount: award.amount, percent, open, executed: awardStage(award) === "executed" };
      byCompany.set(award.bidderId, [...(byCompany.get(award.bidderId) ?? []), contract]);
    }
  }
  const ids = [...new Set([...state.limits.map(l => l.companyId), ...byCompany.keys()])];
  const rows = ids.map((companyId): Exposure => {
    const contracts = byCompany.get(companyId) ?? [], limit = state.limits.find(l => l.companyId === companyId) ?? null;
    const open = dollars(contracts.reduce((n, c) => n + cents(c.open), 0));
    const perProject = new Map<string, { projectId: string; projectName: string; open: number }>();
    for (const c of contracts) { const p = perProject.get(c.projectId) ?? { projectId: c.projectId, projectName: c.projectName, open: 0 }; perProject.set(c.projectId, { ...p, open: dollars(cents(p.open) + cents(c.open)) }); }
    const largest = [...perProject.values()].sort((a, b) => b.open - a.open)[0] ?? null;
    return {
      companyId, company: directory.find(d => d.id === companyId)?.company ?? companyId, limit, contracts, open, largest,
      overSingle: !!(limit?.singleProject !== null && limit?.singleProject !== undefined && largest && largest.open > limit.singleProject),
      overAggregate: !!(limit?.aggregate !== null && limit?.aggregate !== undefined && open > limit.aggregate),
      headroom: limit?.aggregate === null || limit?.aggregate === undefined ? null : dollars(cents(limit.aggregate) - cents(open)),
    };
  });
  const over = (e: Exposure) => (e.overAggregate || e.overSingle ? 1 : 0);
  return rows.sort((a, b) => over(b) - over(a) || b.open - a.open || a.company.localeCompare(b.company));
}
