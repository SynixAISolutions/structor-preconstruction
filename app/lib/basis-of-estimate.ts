// Basis of estimate and owner qualifications (ideas 20 Oct, #12): the document a GC sends with its
// number, assembled from what the project already holds instead of written by hand in an evening.
// Nothing is invented: every line comes from the stored documents, the budget, its allowances, the
// setup guide's decisions, or a gap the team chose not to carry. Pure; the screen renders `sections`
// and exports `markdown`.

import { usd } from "./format";
import { drawingRegister, latestDocuments, type StoredDocument } from "./project-files";
import type { SetupState } from "./project-setup";
import type { BudgetState } from "./budget";
import { ESTIMATE_STAGES, WORK_TYPES, type Project } from "./projects";

export type NotCarried = { trade: string; item: string; section: string };
export type BasisSection = { heading: string; lines: string[] };

const ITEM_NAMES: Record<string, string> = { geotech: "Geotechnical report", survey: "Site survey", hazmat: "Hazardous materials survey", existing: "Existing conditions survey", rfp: "RFP", manual: "Project manual", drawings: "Drawings", budget: "Budget", schedule: "Schedule", team: "Project team", contracts: "Contract documents", reports: "Site reports" };
const itemName = (target: string) => { const key = target.split(":").pop() ?? target; return ITEM_NAMES[key] ?? key.replace(/[-_]/g, " ").replace(/^./, c => c.toUpperCase()); };
const day = (iso: string) => iso.slice(0, 10);

export function basisOfEstimate(input: { project: Project; documents: StoredDocument[]; budget: BudgetState; setup: SetupState; notCarried?: NotCarried[] }): { sections: BasisSection[]; markdown: string } {
  const { project, budget } = input;
  const latest = latestDocuments(input.documents);
  const counted = budget.lines.filter(l => !l.byOwner);
  const total = (cls: string) => counted.filter(l => l.classification === cls).reduce((s, l) => s + Math.round(l.budget * 100), 0) / 100;
  const sheetsOf = (d: StoredDocument) => drawingRegister([d]).length;
  const basis = [
    `${project.name}${project.location ? `, ${project.location}` : ""}${project.squareFeet ? `: ${project.squareFeet.toLocaleString("en-US")} SF` : ""}${project.workType ? `, ${(WORK_TYPES.find(w => w.value === project.workType)?.label ?? project.workType).toLowerCase()}` : ""}${project.estimateStage ? `, documents at ${(ESTIMATE_STAGES.find(s => s.value === project.estimateStage)?.label ?? project.estimateStage).toLowerCase()}` : ""}.`,
    `Direct cost ${usd(total("direct"))}; indirect cost ${usd(total("indirect"))}.`,
    ...latest.filter(d => d.kind === "drawings").map(d => `Drawings: ${d.name}, ${sheetsOf(d)} sheets, uploaded ${day(d.uploadedAt)}.`),
    ...latest.filter(d => d.kind === "manual").map(d => `Project manual: ${d.name}, ${d.sections.length} section${d.sections.length === 1 ? "" : "s"}, uploaded ${day(d.uploadedAt)}.`),
    ...latest.filter(d => d.category === "Addenda").map(d => `Addendum: ${d.name}, uploaded ${day(d.uploadedAt)}.`),
    ...(budget.conceptSource?.factors.escalation ? [`Concept budget price escalation: ${budget.conceptSource.factors.escalation.basis}`] : []),
  ];
  const allowances = budget.allowances.filter(a => a.status === "included").map(a => `${a.name}: ${usd(a.amount)}${a.source ? ` (${a.source})` : ""}.`);
  const contingencyAndFee = counted.filter(l => /contingenc|\bfee\b/i.test(l.description) && l.budget > 0).map(l => `${l.description}${l.costCenter ? `, ${l.costCenter}` : ""}: ${usd(l.budget)}.`);
  const excluded = [
    ...budget.lines.filter(l => l.byOwner).map(l => `${l.description}: carried by the owner.`),
    ...budget.allowances.filter(a => a.status === "excluded").map(a => `${a.name}${a.source ? ` (${a.source})` : ""}: not included.`),
  ];
  const assumptions = input.setup.decisions.filter(d => d.kind === "not-applicable").map(d => `${itemName(d.target)}: not applicable to this project${d.reason ? `, ${d.reason.replace(/\.$/, "")}` : ""}.`);
  const clarifications = (input.notCarried ?? []).map(g => `${g.item}${g.section ? ` (Section ${g.section})` : ""} is not included in the ${g.trade} price.`);
  const open = [
    ...input.setup.decisions.filter(d => d.kind === "waiting").map(d => `${itemName(d.target)}: waiting on ${d.responsible || "others"}${d.followUp ? `, follow-up ${d.followUp}` : ""}.`),
    ...budget.allowances.filter(a => a.status === "review").map(a => `Allowance to confirm: ${a.name}, ${usd(a.amount)}.`),
  ];
  const sections = [
    { heading: "Basis", lines: basis },
    { heading: "Allowances included", lines: allowances },
    { heading: "Contingency and fee", lines: contingencyAndFee },
    { heading: "Excluded or carried by the owner", lines: excluded },
    { heading: "Assumptions", lines: assumptions },
    { heading: "Clarifications", lines: clarifications },
    { heading: "Open items", lines: open },
  ].filter(s => s.lines.length);
  const markdown = [`# Basis of estimate: ${project.name}`, ...sections.map(s => `## ${s.heading}\n\n${s.lines.map(l => `- ${l}`).join("\n")}`)].join("\n\n");
  return { sections, markdown };
}
