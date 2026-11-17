// Compliance (Marcel's feedback log, 7 Nov): "We will add a section at the end of Subcontractor outreach called
// compliance - this would list every sub awarded the job and whether they are compliant with the wage scale, and any
// other certifications, it would list what their certification % is vs contract value and we would see if we are in
// compliance." His worked example: "this project needs to have 35% CBE participation - that means that 35% of the total
// project budget should be CBE. ... a budget for a project is $100M, then 35% CBE would mean that $35M of the project
// needs to be CBE. So if a sub says they are 100% CBE and their contract awarded value is 1,000,000 that would all count
// towards the CBE% - that means we would still need to have $34M in CBE from other contracts."
//
// What each company is certified for (and at what percent) is kept on the company in the subcontractor directory, so it
// follows the company from project to project. Whether an awarded company meets the wage scale is kept per project
// under "compliance". Pure: the screen renders the report and calls the actions.

import type { Project } from "./projects";

/** A company's share of its work that counts toward a program: 100 for a certified firm, less for a joint venture. */
export type CompanyCertification = { program: string; percent: number };
export type WageScaleStatus = "compliant" | "not-compliant";
export type ComplianceRecord = { awardId: string; wageScale: WageScaleStatus | null; note: string; updatedAt: string; updatedBy: string };
export type ComplianceState = { records: ComplianceRecord[] };
export const EMPTY_COMPLIANCE: ComplianceState = { records: [] };

/** An award as compliance needs it (lib/award's Award has all of these). */
export type AwardedContract = { id: string; packageId: string; bidderId: string; amount: number; cancelled: unknown; snapshot: { packageName: string; packageCode: string; company: { name: string } } };
export type DirectoryCompany = { id: string; company: string; certifications?: CompanyCertification[] };

export type ProgramShare = { program: string; percent: number | null; counted: number | null };
export type ComplianceRow = {
  awardId: string; packageId: string; trade: string; code: string; company: string; companyId: string | null;
  amount: number; wageScale: WageScaleStatus | null; note: string;
  /** One per project program, in the project's order: the company's percent (null when not recorded) and the dollars it counts. */
  programs: ProgramShare[];
};
export type ProgramTotal = {
  program: string;
  /** The share the project requires, in percent; null when none was set in Project information. */
  target: number | null;
  /** Dollars required: the target share of the base. */
  required: number | null;
  /** Dollars counted so far from awarded contracts. */
  counted: number;
  /** Counted dollars as a share of the base, in percent. */
  share: number | null;
  /** Dollars still to find in contracts not yet awarded; 0 once met. */
  shortfall: number | null;
  met: boolean | null;
  /** Awarded companies whose percent for this program isn't recorded: they may count, but nothing is counted yet. */
  unknown: number;
};
export type ComplianceReport = {
  /** What the targets are a share of: the budget summary's total, else the internal project value. */
  base: number | null; baseSource: "budget" | "project value" | null;
  rows: ComplianceRow[]; programs: ProgramTotal[];
  wageScale: { required: boolean | null; type: string; compliant: number; notCompliant: number; unconfirmed: number };
  awarded: number;
};

export class ComplianceRuleError extends Error {
  constructor(message: string) { super(message); this.name = "ComplianceRuleError"; }
}
const fail = (message: string): never => { throw new ComplianceRuleError(message); };
const cents = (v: number) => Math.round(v * 100) / 100;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** The directory company behind an award: by its id, else by name (a company added before ids were kept). */
export const companyFor = (directory: DirectoryCompany[], award: Pick<AwardedContract, "bidderId" | "snapshot">): DirectoryCompany | null =>
  directory.find(c => c.id === award.bidderId) ?? directory.find(c => sameName(c.company, award.snapshot.company.name)) ?? null;

/** A company's percent for a program, or null when not recorded. */
export const certificationPercent = (company: DirectoryCompany | null, program: string): number | null =>
  company?.certifications?.find(c => sameName(c.program, program))?.percent ?? null;

/**
 * Every awarded (not cancelled) contract against the project's wage scale and certification targets. A program's
 * counted dollars are each contract's amount times the company's percent for it; the targets are shares of the budget
 * summary's total when there is one, else of the internal project value.
 */
export function complianceReport(input: { project: Pick<Project, "certifications" | "certificationTargets" | "kickoff" | "value">; budgetTotal: number | null; awards: AwardedContract[]; directory: DirectoryCompany[]; state: ComplianceState }): ComplianceReport {
  const { project, awards, directory, state } = input;
  const base = input.budgetTotal && input.budgetTotal > 0 ? input.budgetTotal : project.value > 0 ? project.value : null;
  const baseSource = input.budgetTotal && input.budgetTotal > 0 ? "budget" : project.value > 0 ? "project value" : null;
  const programs = project.certifications;
  const rows: ComplianceRow[] = awards.filter(a => !a.cancelled).map(award => {
    const company = companyFor(directory, award);
    const record = state.records.find(r => r.awardId === award.id);
    return {
      awardId: award.id, packageId: award.packageId, trade: award.snapshot.packageName, code: award.snapshot.packageCode,
      company: company?.company ?? award.snapshot.company.name, companyId: company?.id ?? null, amount: award.amount,
      wageScale: record?.wageScale ?? null, note: record?.note ?? "",
      programs: programs.map(program => { const percent = certificationPercent(company, program); return { program, percent, counted: percent === null ? null : cents(award.amount * percent / 100) }; }),
    };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || a.trade.localeCompare(b.trade));
  const totals: ProgramTotal[] = programs.map((program, i) => {
    const target = project.certificationTargets?.[program] ?? null;
    const counted = cents(rows.reduce((t, r) => t + (r.programs[i].counted ?? 0), 0));
    const required = target === null || base === null ? null : cents(base * target / 100);
    return {
      program, target, required, counted,
      share: base === null ? null : Math.round((counted / base) * 10000) / 100,
      shortfall: required === null ? null : Math.max(0, cents(required - counted)),
      met: required === null ? null : counted >= required,
      unknown: rows.filter(r => r.programs[i].percent === null).length,
    };
  });
  const required = project.kickoff?.wageScale ?? null;
  return {
    base, baseSource, rows, programs: totals, awarded: rows.length,
    wageScale: {
      required, type: project.kickoff?.wageScaleType ?? "",
      compliant: rows.filter(r => r.wageScale === "compliant").length,
      notCompliant: rows.filter(r => r.wageScale === "not-compliant").length,
      unconfirmed: rows.filter(r => r.wageScale === null).length,
    },
  };
}

/** Records whether an awarded company meets the project's wage scale (null: not confirmed yet), with an optional note. */
export function setWageScaleCompliance(state: ComplianceState, awardIds: string[], awardId: string, status: WageScaleStatus | null, note: string | undefined, by: string, at = new Date().toISOString()): ComplianceState {
  if (!awardIds.includes(awardId)) fail("That contract isn't awarded on this project.");
  if (status !== null && status !== "compliant" && status !== "not-compliant") fail("Choose compliant, not compliant, or not confirmed.");
  if (note !== undefined && note.length > 1000) fail("Keep the note under 1,000 characters.");
  const current = state.records.find(r => r.awardId === awardId);
  const next: ComplianceRecord = { awardId, wageScale: status, note: note?.trim() ?? current?.note ?? "", updatedAt: at, updatedBy: by };
  return { records: [...state.records.filter(r => r.awardId !== awardId), next] };
}

/**
 * Sets (or with null, clears) a directory company's percent for a program, from 0 to 100. Returns the directory with that
 * company changed; every project reads it from there.
 */
export function setCompanyCertification<C extends DirectoryCompany>(directory: C[], companyId: string, program: string, percent: number | null): C[] {
  const name = program.trim();
  if (!name) fail("Name the certification program.");
  if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) fail(`Enter the company's ${name} share as a percent from 0 to 100.`);
  if (!directory.some(c => c.id === companyId)) fail("That company isn't in the subcontractor directory.");
  return directory.map(c => {
    if (c.id !== companyId) return c;
    const others = (c.certifications ?? []).filter(x => !sameName(x.program, name));
    return { ...c, certifications: percent === null ? others : [...others, { program: name, percent }] };
  });
}

/** A company's certifications in words: "CBE 100%, First Source 51%". */
export const certificationLabel = (certifications: CompanyCertification[] = []): string =>
  certifications.map(c => `${c.program} ${Number.isInteger(c.percent) ? c.percent : c.percent.toFixed(2)}%`).join(", ");

/**
 * Certifications typed as words, as the directory's company form takes them: "CBE 100, First Source 51%". A program
 * without a number is certified in full (100). Throws with a message to show when a percent isn't 0 to 100.
 */
export function parseCertificationText(text: string): CompanyCertification[] {
  const out: CompanyCertification[] = [];
  for (const part of text.split(/[,;\n]/).map(p => p.trim()).filter(Boolean)) {
    const match = part.match(/^(.*?)(?:\s+(\d+(?:\.\d+)?)\s*%?)?$/);
    const program = (match?.[1] ?? part).trim().replace(/[:\-–]\s*$/, "").trim();
    const percent = match?.[2] === undefined ? 100 : Number(match[2]);
    if (!program) fail(`Name the program in "${part}".`);
    if (!(percent >= 0 && percent <= 100)) fail(`${program}: enter a percent from 0 to 100.`);
    if (!out.some(c => sameName(c.program, program))) out.push({ program, percent });
  }
  return out;
}

/** The report as CSV rows for export: one row per contract, then a total per program. */
export function complianceRows(report: ComplianceReport): (string | number)[][] {
  const programs = report.programs.map(p => p.program);
  return [
    ["Trade", "Code", "Subcontractor", "Contract value", "Wage scale", ...programs.flatMap(p => [`${p} %`, `${p} counted`]), "Note"],
    ...report.rows.map(r => [r.trade, r.code, r.company, r.amount, r.wageScale === "compliant" ? "Compliant" : r.wageScale === "not-compliant" ? "Not compliant" : "Not confirmed", ...r.programs.flatMap(p => [p.percent ?? "", p.counted ?? ""]), r.note]),
    [],
    ["Program", "Required %", "Required $", "Counted $", "Counted % of base", "Still needed $"],
    ...report.programs.map(p => [p.program, p.target ?? "", p.required ?? "", p.counted, p.share ?? "", p.shortfall ?? ""]),
  ];
}
