// Award, Exhibit A, negotiation and subcontract for ONE project (demo, browser-only).
//
// Marcel (20 Sep, 17:15–19:21): per trade, see the lowest and lowest-leveled bids, CHOOSE the
// subcontractor, generate Exhibit A (the trade's scope), send it to the sub, go back and forth
// on comments until a final version is agreed, then generate the subcontract (Exhibit A is
// one of its exhibits), send it for signature, countersign, keep the final copy.
//
// Nothing here chooses or awards on anyone's behalf: createAward needs an explicit leveled
// bidder AND an explicit value basis. Customer templates are not decided, so documents come
// from clearly labelled SAMPLE templates through replaceable generator functions.
// Notifications are recorded, never sent. Signatures are typed demo signatures, not a legal
// e-signature. Pure functions; rule violations throw AwardRuleError with field-level errors.

import type { BudgetState, LevelingBasis, LevelingCandidate } from "./budget";
import type { DirectoryCompany, Procurement } from "./procurement";
import type { Alternate, ScopeAnswer, Submission } from "./submissions";
import type { ClarificationLine, ClarificationRequest } from "./clarifications";
import { MCN_EXHIBIT_TEMPLATE, MCN_SUBCONTRACT_TEMPLATE } from "./data/templates";
import { contractFileLines, missingContractFiles, type ContractFiles } from "./contract-files";

// ── Templates (samples until the customer's own are configured) ─────────────

/**
 * A customer's document template. Without `layout` the built-in sample layout is used. With it,
 * the document follows the customer's own structure: blocks in order, fixed text with
 * {placeholders}, and generated parts (scope, exclusions, ...) where the customer puts them.
 */
export type DocumentTemplate = { id: string; name: string; version: string; sample: boolean; notice: string; layout?: TemplateLayout };

/** Placeholders a template may use; a missing value shows as "[name]" so reviewers see the gap. */
export type TemplateField =
  | "owner" | "project" | "projectAddress" | "trade" | "tradeCode" | "contractor" | "subcontractor" | "subcontractorContact" | "subcontractorEmail"
  | "amount" | "basis" | "formVersion" | "bidRevision" | "exhibitRevision" | "start" | "finish" | "template";

export type TemplateBlock =
  /** Fixed text; `numbered` prefixes 1., 2., ... */
  | { kind: "text"; heading: string; lines: string[]; numbered?: boolean }
  /** Included scope items (Y and P answers), after an optional intro and before optional fixed lines. */
  | { kind: "scope"; heading: string; intro?: string; append?: string[] }
  /** N answers plus the bidder's exclusions. */
  | { kind: "exclusions"; heading: string }
  | { kind: "not-applicable"; heading: string }
  | { kind: "clarifications"; heading: string }
  | { kind: "alternates"; heading: string }
  | { kind: "allowances"; heading: string };

export type TemplateLayout = { title: string; blocks: TemplateBlock[] };
export const SAMPLE_EXHIBIT_TEMPLATE: DocumentTemplate = {
  id: "sample-exhibit-a", name: "Sample Exhibit A", version: "demo-1", sample: true,
  notice: "Sample layout for the demo. It is not the customer's Exhibit A template.",
};
export const SAMPLE_SUBCONTRACT_TEMPLATE: DocumentTemplate = {
  id: "sample-subcontract", name: "Sample subcontract agreement", version: "demo-1", sample: true,
  notice: "Sample agreement for the demo. It is not the customer's subcontract and is not legal advice.",
};

// ── Records ─────────────────────────────────────────────────────────────────

export type DocumentSection = { heading: string; lines: string[] };
export type DocumentContent = { title: string; sections: DocumentSection[] };

export type Party = "contractor" | "subcontractor";
export type ExhibitStatus = "draft" | "shared" | "changes-requested" | "agreed";
export type ExhibitRevision = { number: number; content: DocumentContent; template: DocumentTemplate; createdAt: string; createdBy: string; note: string };
export type ExhibitComment = {
  id: string; revisionNumber: number; author: string; party: Party; text: string; at: string;
  resolved: boolean; resolvedBy: string | null; resolvedAt: string | null;
};
export type ExhibitA = { status: ExhibitStatus; revisions: ExhibitRevision[]; comments: ExhibitComment[]; agreement: { by: string; party: Party; at: string; revisionNumber: number } | null };

export type SubcontractStatus = "draft" | "signature-pending" | "subcontractor-signed" | "countersigned" | "executed";
export type Signer = { name: string; title: string; email: string };
export type Signature = Signer & { party: Party; signedAt: string; method: "typed-demo" };
export type Subcontract = {
  attachments?: ContractFiles;
  status: SubcontractStatus;
  content: DocumentContent;
  template: DocumentTemplate;
  contractorName: string;
  /** The agreed Exhibit A revision it incorporates. */
  exhibitRevision: number;
  amount: number;
  createdAt: string; createdBy: string;
  sentAt: string | null;
  subcontractorSignature: Signature | null;
  contractorSignature: Signature | null;
  executedAt: string | null;
  /** Plain-text final copy frozen at execution; later template changes never alter it. */
  executedCopy: string | null;
};

/** What was awarded, frozen at award time. */
export type AwardSnapshot = {
  projectName: string; packageName: string; packageCode: string; packageOwner: string; formVersion: number;
  /** For customer templates; empty when not supplied. */
  owner?: string; projectAddress?: string; projectStart?: string; projectFinish?: string;
  scope: { id: string; title: string; detail: string; source: string; answer: ScopeAnswer | null; note: string }[];
  exclusions: string[]; alternates: Alternate[]; clarifications: string[];
  allowances: { id: string; name: string; amount: number; source: string; status: string }[];
  company: { name: string; contact: string; email: string };
};

export type Award = {
  contractFiles?: ContractFiles;
  id: string; projectId: string; packageId: string; invitationId: string; bidderId: string; submissionId: string; revisionNumber: number;
  budgetLineId: string | null;
  basis: LevelingBasis;
  /** The selected value: the leveled bidder's base bid, provisional or reviewed total, per `basis`. */
  amount: number;
  leveling: { levelingBidderId: string; bidderName: string; baseBid: number | null; provisionalTotal: number | null; reviewedTotal: number | null };
  snapshot: AwardSnapshot;
  exhibit: ExhibitA;
  subcontract: Subcontract | null;
  cancelled: { by: string; at: string; reason: string } | null;
  createdAt: string; createdBy: string; updatedAt: string;
};

export type AwardNotificationKind = "exhibit-shared" | "exhibit-changes-requested" | "exhibit-agreed" | "subcontract-sent" | "subcontract-signed" | "subcontract-countersigned" | "subcontract-executed" | "award-cancelled";
/** `recipient` is a team member's name ("team") or a directory bidder id ("bidder"). */
export type AwardNotification = { id: string; awardId: string; kind: AwardNotificationKind; recipientType: "team" | "bidder"; recipient: string; text: string; at: string; read: boolean };

export type AwardState = { awards: Award[]; notifications: AwardNotification[] };

/** Everything createAward reads. Nothing in it is changed. */
export type AwardContext = {
  projectId: string; projectName: string;
  procurement: Procurement; submissions: Submission[];
  /** From levelingCandidates() over the CURRENT reviewed leveling workspace. */
  candidates: LevelingCandidate[];
  budget: BudgetState;
  directory: DirectoryCompany[];
  /** Optional, for customer templates (owner name, street address, schedule dates). */
  owner?: string; projectAddress?: string; projectStart?: string; projectFinish?: string;
  /** The project's clarification requests. Written answers applied in leveling are carried into Exhibit A. */
  clarifications?: ClarificationRequest[];
};

export type AwardErrors = Partial<Record<"candidate" | "basis" | "budgetLineId" | "allowanceIds" | "award" | "exhibit" | "comment" | "subcontract" | "contractorName" | "signature" | "name" | "email" | "reason", string>>;

export class AwardRuleError extends Error {
  readonly errors: AwardErrors;
  constructor(errors: AwardErrors) {
    super(Object.values(errors).join(" "));
    this.name = "AwardRuleError";
    this.errors = errors;
  }
}

export type ExhibitGenerator = (snapshot: AwardSnapshot, award: Pick<Award, "amount" | "basis" | "revisionNumber">, template: DocumentTemplate) => DocumentContent;
export type SubcontractGenerator = (award: Award, exhibit: ExhibitRevision, contractorName: string, template: DocumentTemplate) => DocumentContent;

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const fail = (errors: AwardErrors): never => { throw new AwardRuleError(errors); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const BASIS_LABEL: Record<LevelingBasis, string> = { base: "base bid", provisional: "provisional leveled total", reviewed: "reviewed leveled total" };

// ── Reading ─────────────────────────────────────────────────────────────────

/** Every leveled bidder, with whether it can be awarded and why not. */
export function awardCandidates(candidates: LevelingCandidate[]): { candidate: LevelingCandidate; awardable: boolean; reasons: string[] }[] {
  return candidates.map(candidate => {
    const reasons: string[] = [];
    if (!candidate.submissionId) reasons.push("Not a portal submission (Excel or demo bidder), so there is no invitation or scope response to award from.");
    if (candidate.stale) reasons.push("Priced an older bid form.");
    if (!candidate.eligible) reasons.push(`Leveling review is not complete (${candidate.eligibilityReasons.join(", ") || "not eligible"}).`);
    return { candidate, awardable: reasons.length === 0, reasons };
  });
}

export const activeAward = (state: AwardState, packageId: string) => state.awards.find(a => a.packageId === packageId && !a.cancelled);
export const latestExhibit = (award: Award): ExhibitRevision => award.exhibit.revisions[award.exhibit.revisions.length - 1];
export const unresolvedComments = (award: Award): ExhibitComment[] => award.exhibit.comments.filter(c => !c.resolved);

export type AwardStage =
  | "cancelled" | "exhibit-draft" | "exhibit-shared" | "exhibit-changes-requested" | "exhibit-agreed"
  | "subcontract-draft" | "signature-pending" | "subcontractor-signed" | "countersigned" | "executed";

/** One label for where an award stands. */
export function awardStage(award: Award): AwardStage {
  if (award.cancelled) return "cancelled";
  if (award.subcontract) return award.subcontract.status === "draft" ? "subcontract-draft" : award.subcontract.status;
  return `exhibit-${award.exhibit.status}` as AwardStage;
}

// ── Sample document generators (replaceable) ────────────────────────────────

const fill = (text: string, values: Partial<Record<TemplateField, string>>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => values[key as TemplateField]?.trim() || `[${key}]`);

const scopeLine = (item: AwardSnapshot["scope"][number], index: number) =>
  `${index + 1}. ${item.title}${item.detail ? ` ${item.detail}` : ""}${item.source ? ` (${item.source})` : ""}${item.answer === "P" ? ` Partial per bid: ${item.note}` : ""}`;
const alternateLine = (a: Alternate) => `${a.kind === "add" ? "Add" : "Deduct"} ${usd(a.amount)}: ${a.description}`;
const allowanceLine = (a: AwardSnapshot["allowances"][number]) => `${a.name}: ${usd(a.amount)}${a.source ? ` (${a.source})` : ""}`;
const exclusionLines = (snapshot: AwardSnapshot) => [...snapshot.scope.filter(i => i.answer === "N").map(i => `${i.title}${i.note ? ` (${i.note})` : ""}`), ...snapshot.exclusions];

/** Renders a customer layout. Sections that end up with no lines are dropped. */
function renderLayout(layout: TemplateLayout, values: Partial<Record<TemplateField, string>>, snapshot: AwardSnapshot): DocumentContent {
  const included = snapshot.scope.filter(item => item.answer === "Y" || item.answer === "P");
  const sections = layout.blocks.map((block): DocumentSection => {
    const heading = fill(block.heading, values);
    switch (block.kind) {
      case "text": return { heading, lines: block.lines.map((l, i) => `${block.numbered ? `${i + 1}. ` : ""}${fill(l, values)}`) };
      case "scope": return { heading, lines: [...(block.intro ? [fill(block.intro, values)] : []), ...(included.length ? included.map(scopeLine) : ["No scope items were included in the bid."]), ...(block.append ?? []).map(l => fill(l, values))] };
      case "exclusions": return { heading, lines: exclusionLines(snapshot) };
      case "not-applicable": return { heading, lines: snapshot.scope.filter(i => i.answer === "N/A").map(i => `${i.title}: ${i.note}`) };
      case "clarifications": return { heading, lines: snapshot.clarifications };
      case "alternates": return { heading, lines: snapshot.alternates.map(alternateLine) };
      case "allowances": return { heading, lines: snapshot.allowances.map(allowanceLine) };
    }
  });
  return { title: fill(layout.title, values), sections: sections.filter(s => s.lines.length) };
}

function fieldValues(snapshot: AwardSnapshot, award: Pick<Award, "amount" | "basis" | "revisionNumber">, template: DocumentTemplate, extra: Partial<Record<TemplateField, string>> = {}): Partial<Record<TemplateField, string>> {
  return {
    owner: snapshot.owner, project: snapshot.projectName, projectAddress: snapshot.projectAddress, trade: snapshot.packageName, tradeCode: snapshot.packageCode,
    subcontractor: snapshot.company.name, subcontractorContact: snapshot.company.contact, subcontractorEmail: snapshot.company.email,
    amount: usd(award.amount), basis: BASIS_LABEL[award.basis], formVersion: String(snapshot.formVersion), bidRevision: String(award.revisionNumber),
    start: snapshot.projectStart, finish: snapshot.projectFinish, template: `${template.name} (${template.version})`, ...extra,
  };
}

/** Exhibit A: the customer's layout when the template has one, otherwise the built-in sample layout. */
export const generateSampleExhibit: ExhibitGenerator = (snapshot, award, template) => {
  if (template.layout) return renderLayout(template.layout, fieldValues(snapshot, award, template), snapshot);
  const included = snapshot.scope.filter(item => item.answer === "Y" || item.answer === "P");
  const sections: DocumentSection[] = [
    { heading: "Project and parties", lines: [`Project: ${snapshot.projectName}`, `Trade: ${snapshot.packageCode} · ${snapshot.packageName}`, `Subcontractor: ${snapshot.company.name}`, `Bid form version ${snapshot.formVersion}; bid revision ${award.revisionNumber}.`] },
    { heading: "Scope of work", lines: included.length ? included.map(scopeLine) : ["No scope items were included in the bid."] },
    { heading: "Excluded from this subcontract", lines: exclusionLines(snapshot) },
    { heading: "Not applicable", lines: snapshot.scope.filter(i => i.answer === "N/A").map(i => `${i.title}: ${i.note}`) },
    { heading: "Clarifications", lines: snapshot.clarifications },
    { heading: "Alternates offered (not included unless accepted in writing)", lines: snapshot.alternates.map(alternateLine) },
    { heading: "Allowances", lines: snapshot.allowances.map(allowanceLine) },
    { heading: "Subcontract amount", lines: [`${usd(award.amount)}, the ${BASIS_LABEL[award.basis]} from bid leveling.`] },
    { heading: "Template", lines: [`${template.name} (${template.version}). ${template.notice}`] },
  ];
  return { title: `Exhibit A — Scope of Work · ${snapshot.packageCode} ${snapshot.packageName}`, sections: sections.filter(s => s.lines.length) };
};

/** The subcontract: the customer's layout when the template has one, otherwise the built-in sample layout. */
export const generateSampleSubcontract: SubcontractGenerator = (award, exhibit, contractorName, template) => {
  if (template.layout) return renderLayout(template.layout, fieldValues(award.snapshot, award, template, { contractor: contractorName, exhibitRevision: String(exhibit.number) }), award.snapshot);
  return {
    title: `Subcontract agreement · ${award.snapshot.packageName}`,
    sections: [
      { heading: "Parties", lines: [`Contractor: ${contractorName}`, `Subcontractor: ${award.snapshot.company.name}`, `Project: ${award.snapshot.projectName}`] },
      { heading: "Work", lines: [`The Subcontractor performs the work described in Exhibit A, revision ${exhibit.number}, which forms part of this agreement.`] },
      { heading: "Subcontract sum", lines: [usd(award.amount)] },
      { heading: "Exhibits", lines: [`Exhibit A — ${exhibit.content.title} (revision ${exhibit.number})`] },
      { heading: "Template", lines: [`${template.name} (${template.version}). ${template.notice}`] },
    ],
  };
};

/** The templates documents use unless another is passed: this workspace's customer (Contractor). */
export const DEFAULT_EXHIBIT_TEMPLATE: DocumentTemplate = MCN_EXHIBIT_TEMPLATE;
export const DEFAULT_SUBCONTRACT_TEMPLATE: DocumentTemplate = MCN_SUBCONTRACT_TEMPLATE;

/** Plain text of a document, for download. */
export const renderDocumentText = (content: DocumentContent): string =>
  [content.title, "", ...content.sections.flatMap(s => [s.heading.toUpperCase(), ...s.lines.map(line => `  ${line}`), ""])].join("\n").trimEnd() + "\n";

// ── Helpers ─────────────────────────────────────────────────────────────────

type Note = Omit<AwardNotification, "id" | "read" | "awardId">;
function findAward(state: AwardState, id: string): Award {
  return state.awards.find(a => a.id === id) ?? fail({ award: "That award no longer exists." });
}
const live = (award: Award): Award => (award.cancelled ? fail({ award: "This award was cancelled." }) : award);
const replace = (state: AwardState, award: Award, notes: Note[] = []): AwardState => ({
  awards: state.awards.map(a => a.id === award.id ? award : a),
  notifications: [...state.notifications, ...notes.map(n => ({ ...n, id: newId(), awardId: award.id, read: false }))],
});
const toTeam = (award: Award, kind: AwardNotificationKind, text: string, at: string): Note => ({ kind, recipientType: "team", recipient: award.snapshot.packageOwner, text, at });
const toBidder = (award: Award, kind: AwardNotificationKind, text: string, at: string): Note => ({ kind, recipientType: "bidder", recipient: award.bidderId, text, at });

function validContent(content: DocumentContent): DocumentContent {
  const title = typeof content?.title === "string" ? content.title.trim() : "";
  const sections = Array.isArray(content?.sections) ? content.sections.map(s => ({
    heading: typeof s?.heading === "string" ? s.heading.trim() : "",
    lines: Array.isArray(s?.lines) ? s.lines.filter((l): l is string => typeof l === "string").map(l => l.trim()).filter(Boolean) : [],
  })) : [];
  if (!title) fail({ exhibit: "The document needs a title." });
  if (!sections.length || sections.some(s => !s.heading)) fail({ exhibit: "Every section needs a heading." });
  return { title, sections };
}

// ── Award ───────────────────────────────────────────────────────────────────

/**
 * Awards a package to the chosen leveled bidder at the chosen value basis, freezes what was
 * awarded, and drafts Exhibit A revision 1. One live award per package.
 */
const writtenAnswer = (a: NonNullable<ClarificationLine["answer"]>) =>
  `${a.kind === "included" ? "Included at no added cost" : a.kind === "add" ? `Included for an added ${usd(a.amount!)}` : "Excluded"}, confirmed in writing ${a.at.slice(0, 10)} by ${a.by}${a.note ? `: "${a.note}"` : ""}`;

export function createAward(
  state: AwardState, ctx: AwardContext,
  input: { levelingBidderId: string; basis: LevelingBasis; budgetLineId?: string | null; allowanceIds?: string[] },
  by: string, at = now(), generate: ExhibitGenerator = generateSampleExhibit, template: DocumentTemplate = DEFAULT_EXHIBIT_TEMPLATE,
): AwardState {
  const candidate = ctx.candidates.find(c => c.levelingBidderId === input.levelingBidderId) ?? fail({ candidate: "Choose a bidder from the current leveling comparison." });
  const check = awardCandidates([candidate])[0];
  if (!check.awardable) fail({ candidate: `${candidate.bidderName} cannot be awarded: ${check.reasons.join(" ")}` });
  if (!(input.basis in BASIS_LABEL)) fail({ basis: "Choose base bid, provisional total, or reviewed total." });
  const amount = input.basis === "base" ? candidate.baseBid : input.basis === "provisional" ? candidate.provisionalTotal : candidate.reviewedTotal;
  if (amount === null || !(amount > 0)) fail({ basis: `${candidate.bidderName} has no ${BASIS_LABEL[input.basis]}.` });

  const submission = ctx.submissions.find(s => s.id === candidate.submissionId) ?? fail({ candidate: "That bid's submission no longer exists." });
  if (submission.projectId !== ctx.projectId) fail({ candidate: "That bid belongs to another project." });
  const revision = submission.revisions.find(r => r.number === candidate.revisionNumber) ?? fail({ candidate: "That bid revision no longer exists." });
  const invitation = ctx.procurement.invitations.find(i => i.id === submission.invitationId);
  if (!invitation || invitation.bidderId !== submission.bidderId || invitation.packageId !== submission.packageId || invitation.status === "declined") fail({ candidate: "That bid no longer matches an active invitation." });
  const pkg = ctx.procurement.packages.find(p => p.id === submission.packageId);
  const form = pkg?.published ?? fail({ candidate: "That trade package no longer has a published bid form." });
  if (revision.formVersion !== form.version) fail({ candidate: "That bid answers an older bid form." });
  if (activeAward(state, pkg!.id)) fail({ award: `${pkg!.name} is already awarded. Cancel that award first.` });

  const budgetLineId = input.budgetLineId || null;
  if (budgetLineId) {
    const line = ctx.budget.lines.find(l => l.id === budgetLineId) ?? fail({ budgetLineId: "That budget line no longer exists." });
    if (line.classification !== "direct") fail({ budgetLineId: "Link a direct construction line." });
  }
  const allowances = [...new Set(input.allowanceIds ?? [])].map(id => ctx.budget.allowances.find(a => a.id === id) ?? fail({ allowanceIds: "An allowance no longer exists." }));
  if (allowances.some(a => a.status === "excluded")) fail({ allowanceIds: "Excluded allowances cannot be part of an award." });

  const answers = new Map(revision.responses.map(r => [r.scopeItemId, r]));
  // Written answers applied in leveling, if they answer this revision's own response (a newer revision makes them moot).
  // They override the bid's answer, so an item the sub agreed to add is in the scope of work, not excluded.
  const clarified = new Map((ctx.clarifications ?? [])
    .filter(r => r.bidderId === candidate.levelingBidderId && r.packageId === pkg!.id && r.status !== "cancelled")
    .flatMap(r => r.lines.filter(l => l.appliedAt && l.answer && (answers.get(l.scopeItemId)?.answer ?? "") === l.bid.status && (answers.get(l.scopeItemId)?.note ?? "") === l.bid.note))
    .sort((a, b) => a.appliedAt!.localeCompare(b.appliedAt!))
    .map(l => [l.scopeItemId, l]));
  const company = ctx.directory.find(c => c.id === submission.bidderId);
  const snapshot: AwardSnapshot = {
    projectName: ctx.projectName, packageName: pkg!.name, packageCode: pkg!.code, packageOwner: pkg!.owner, formVersion: revision.formVersion,
    owner: ctx.owner?.trim() ?? "", projectAddress: ctx.projectAddress?.trim() ?? "", projectStart: ctx.projectStart ?? "", projectFinish: ctx.projectFinish ?? "",
    scope: form.items.map(item => {
      const c = clarified.get(item.id)?.answer;
      return { ...item, answer: c ? (c.kind === "excluded" ? "N" : "Y") : answers.get(item.id)?.answer ?? null, note: c ? writtenAnswer(c) : answers.get(item.id)?.note ?? "" };
    }),
    exclusions: [...revision.exclusions], alternates: structuredClone(revision.alternates),
    clarifications: [...revision.clarifications, ...[...clarified.values()].map(l => `${l.item}: ${writtenAnswer(l.answer!)}.`)],
    allowances: allowances.map(a => ({ id: a.id, name: a.name, amount: a.amount, source: a.source, status: a.status })),
    company: { name: company?.company ?? submission.bidderId, contact: revision.submitter.name, email: revision.submitter.email },
  };
  const terms = { amount: amount!, basis: input.basis, revisionNumber: revision.number };
  const award: Award = {
    id: newId(), projectId: ctx.projectId, packageId: pkg!.id, invitationId: invitation!.id, bidderId: submission.bidderId, submissionId: submission.id,
    budgetLineId, ...terms,
    leveling: { levelingBidderId: candidate.levelingBidderId, bidderName: candidate.bidderName, baseBid: candidate.baseBid, provisionalTotal: candidate.provisionalTotal, reviewedTotal: candidate.reviewedTotal },
    snapshot,
    exhibit: { status: "draft", revisions: [{ number: 1, content: validContent(generate(snapshot, terms, template)), template, createdAt: at, createdBy: by, note: "Generated from the awarded scope." }], comments: [], agreement: null },
    subcontract: null, cancelled: null, createdAt: at, createdBy: by, updatedAt: at,
  };
  return { ...state, awards: [...state.awards, award] };
}

/** Allowed until the subcontract is executed. Frees the package for a new award. */
export function cancelAward(state: AwardState, id: string, reason: string, by: string, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.subcontract?.status === "executed") fail({ award: "An executed subcontract cannot be cancelled here." });
  if (!reason?.trim()) fail({ reason: "Say why the award is cancelled." });
  return replace(state, { ...award, cancelled: { by, at, reason: reason.trim() }, updatedAt: at },
    [toBidder(award, "award-cancelled", `The award of ${award.snapshot.packageName} was cancelled.`, at)]);
}

// ── Exhibit A ───────────────────────────────────────────────────────────────

/** A new Exhibit A revision with edited content. Returns to draft; not allowed once agreed. */
export function reviseExhibit(state: AwardState, id: string, content: DocumentContent, note: string, by: string, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.exhibit.status === "agreed") fail({ exhibit: "Exhibit A is agreed and locked." });
  const revision: ExhibitRevision = { number: award.exhibit.revisions.length + 1, content: validContent(content), template: latestExhibit(award).template, createdAt: at, createdBy: by, note: (note ?? "").trim() };
  return replace(state, { ...award, exhibit: { ...award.exhibit, status: "draft", revisions: [...award.exhibit.revisions, revision] }, updatedAt: at });
}

/** draft or changes-requested → shared; the subcontractor is told. */
export function shareExhibit(state: AwardState, id: string, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.exhibit.status === "agreed") fail({ exhibit: "Exhibit A is already agreed." });
  if (award.exhibit.status === "shared") fail({ exhibit: "This revision is already shared." });
  const n = latestExhibit(award).number;
  return replace(state, { ...award, exhibit: { ...award.exhibit, status: "shared" }, updatedAt: at },
    [toBidder(award, "exhibit-shared", `Exhibit A revision ${n} for ${award.snapshot.packageName} is ready for your review.`, at)]);
}

/** Either side may comment on the latest revision until agreement. */
export function addExhibitComment(state: AwardState, id: string, input: { author: string; party: Party; text: string }, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.exhibit.status === "agreed") fail({ comment: "Exhibit A is agreed and locked." });
  if (input.party !== "contractor" && input.party !== "subcontractor") fail({ comment: "Say which side is commenting." });
  if (!input.author?.trim()) fail({ name: "Enter who is commenting." });
  if (!input.text?.trim()) fail({ comment: "Write the comment." });
  const comment: ExhibitComment = { id: newId(), revisionNumber: latestExhibit(award).number, author: input.author.trim(), party: input.party, text: input.text.trim(), at, resolved: false, resolvedBy: null, resolvedAt: null };
  return replace(state, { ...award, exhibit: { ...award.exhibit, comments: [...award.exhibit.comments, comment] }, updatedAt: at });
}

export function setCommentResolved(state: AwardState, id: string, commentId: string, resolved: boolean, by: string, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.exhibit.status === "agreed") fail({ comment: "Exhibit A is agreed and locked." });
  if (!award.exhibit.comments.some(c => c.id === commentId)) fail({ comment: "That comment no longer exists." });
  const comments = award.exhibit.comments.map(c => c.id === commentId ? { ...c, resolved, resolvedBy: resolved ? by : null, resolvedAt: resolved ? at : null } : c);
  return replace(state, { ...award, exhibit: { ...award.exhibit, comments }, updatedAt: at });
}

/** shared → changes-requested, with the subcontractor's comment; the package owner is told. */
export function requestExhibitChanges(state: AwardState, id: string, input: { author: string; text: string }, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.exhibit.status !== "shared") fail({ exhibit: "Changes can be requested on a shared revision only." });
  const commented = addExhibitComment(state, id, { ...input, party: "subcontractor" }, at);
  const updated = findAward(commented, id);
  return replace(commented, { ...updated, exhibit: { ...updated.exhibit, status: "changes-requested" } },
    [toTeam(award, "exhibit-changes-requested", `${award.snapshot.company.name} requested changes to Exhibit A for ${award.snapshot.packageName}.`, at)]);
}

/** shared → agreed. Every comment must be resolved first. */
export function agreeExhibit(state: AwardState, id: string, by: string, party: Party, at = now()): AwardState {
  const award = live(findAward(state, id));
  if (award.exhibit.status !== "shared") fail({ exhibit: "Only a shared revision can be agreed." });
  const open = unresolvedComments(award).length;
  if (open) fail({ exhibit: `${open} comment${open === 1 ? " is" : "s are"} still unresolved.` });
  const n = latestExhibit(award).number;
  const text = `Exhibit A revision ${n} for ${award.snapshot.packageName} is agreed.`;
  return replace(state, { ...award, exhibit: { ...award.exhibit, status: "agreed", agreement: { by, party, at, revisionNumber: n } }, updatedAt: at },
    [toTeam(award, "exhibit-agreed", text, at), toBidder(award, "exhibit-agreed", text, at)]);
}

// ── Subcontract ─────────────────────────────────────────────────────────────

/** Only once Exhibit A is agreed; incorporates the agreed revision. Regenerating replaces an unsent draft. */
export function generateSubcontract(
  state: AwardState, id: string, contractorName: string, by: string, at = now(),
  generate: SubcontractGenerator = generateSampleSubcontract, template: DocumentTemplate = DEFAULT_SUBCONTRACT_TEMPLATE,
): AwardState {
  const award = live(findAward(state, id));
  const agreement = award.exhibit.status === "agreed" ? award.exhibit.agreement : null;
  if (!agreement) fail({ subcontract: "Agree Exhibit A before generating the subcontract." });
  if (award.subcontract && award.subcontract.status !== "draft") fail({ subcontract: "The subcontract has already been sent for signature." });
  if (!contractorName?.trim()) fail({ contractorName: "Enter the general contractor's legal name." });
  const exhibit = award.exhibit.revisions.find(r => r.number === agreement!.revisionNumber)!;
  const subcontract: Subcontract = {
    status: "draft", content: validContent(generate(award, exhibit, contractorName.trim(), template)), template, contractorName: contractorName.trim(),
    exhibitRevision: exhibit.number, amount: award.amount, createdAt: at, createdBy: by, sentAt: null,
    subcontractorSignature: null, contractorSignature: null, executedAt: null, executedCopy: null,
  };
  if (award.contractFiles) {
    subcontract.attachments = structuredClone(award.contractFiles);
    subcontract.content.sections.push({ heading: "Attached contract package (frozen at generation)", lines: contractFileLines(subcontract.attachments) });
  }
  return replace(state, { ...award, subcontract, updatedAt: at });
}

/** draft → signature-pending; the subcontractor is told. */
export function sendSubcontract(state: AwardState, id: string, at = now()): AwardState {
  const award = live(findAward(state, id));
  const sub = award.subcontract ?? fail({ subcontract: "Generate the subcontract first." });
  if (sub.status !== "draft") fail({ subcontract: "The subcontract was already sent." });
  if (sub.attachments && missingContractFiles(sub.attachments).length) fail({ subcontract: `Complete the contract package first: ${missingContractFiles(sub.attachments).join(", ")}.` });
  return replace(state, { ...award, subcontract: { ...sub, status: "signature-pending", sentAt: at }, updatedAt: at },
    [toBidder(award, "subcontract-sent", `The ${award.snapshot.packageName} subcontract is ready for your signature.`, at)]);
}

function signature(party: Party, signer: Signer, at: string): Signature {
  if (!signer?.name?.trim()) fail({ name: "Enter the signer's name." });
  if (!EMAIL.test(signer.email?.trim() ?? "")) fail({ email: "Enter the signer's email address." });
  return { party, name: signer.name.trim(), title: signer.title?.trim() ?? "", email: signer.email.trim(), signedAt: at, method: "typed-demo" };
}

/** The subcontractor signs first (signature-pending → subcontractor-signed); the contractor countersigns (→ countersigned). */
export function signSubcontract(state: AwardState, id: string, party: Party, signer: Signer, at = now()): AwardState {
  const award = live(findAward(state, id));
  const sub = award.subcontract ?? fail({ subcontract: "Generate the subcontract first." });
  if (party === "subcontractor") {
    if (sub.status !== "signature-pending") fail({ signature: "The subcontract is not waiting for the subcontractor's signature." });
    return replace(state, { ...award, subcontract: { ...sub, status: "subcontractor-signed", subcontractorSignature: signature(party, signer, at) }, updatedAt: at },
      [toTeam(award, "subcontract-signed", `${award.snapshot.company.name} signed the ${award.snapshot.packageName} subcontract. It needs your countersignature.`, at)]);
  }
  if (party !== "contractor") fail({ signature: "Say which side is signing." });
  if (sub.status !== "subcontractor-signed") fail({ signature: "The contractor countersigns after the subcontractor has signed." });
  return replace(state, { ...award, subcontract: { ...sub, status: "countersigned", contractorSignature: signature(party, signer, at) }, updatedAt: at },
    [toBidder(award, "subcontract-countersigned", `The ${award.snapshot.packageName} subcontract was countersigned.`, at)]);
}

/** countersigned → executed. Freezes the final copy: agreement, Exhibit A and both signatures. */
export function executeSubcontract(state: AwardState, id: string, at = now()): AwardState {
  const award = live(findAward(state, id));
  const sub = award.subcontract;
  if (sub?.status !== "countersigned") fail({ subcontract: "Both parties must sign before the subcontract is executed." });
  const exhibit = award.exhibit.revisions.find(r => r.number === sub!.exhibitRevision)!;
  const signed = (s: Signature) => `${s.party === "contractor" ? "Contractor" : "Subcontractor"}: ${s.name}${s.title ? `, ${s.title}` : ""} <${s.email}>, signed ${s.signedAt} (typed demo signature)`;
  const executedCopy = [renderDocumentText(sub!.content), renderDocumentText(exhibit.content), "SIGNATURES", `  ${signed(sub!.subcontractorSignature!)}`, `  ${signed(sub!.contractorSignature!)}`, `  Executed ${at}`, ""].join("\n");
  return replace(state, { ...award, subcontract: { ...sub!, status: "executed", executedAt: at, executedCopy }, updatedAt: at }, [
    toTeam(award, "subcontract-executed", `The ${award.snapshot.packageName} subcontract is executed.`, at),
    toBidder(award, "subcontract-executed", `The ${award.snapshot.packageName} subcontract is executed. A copy is available.`, at),
  ]);
}

export function markAwardNotificationsRead(state: AwardState, ids: string[]): AwardState {
  const read = new Set(ids);
  return { ...state, notifications: state.notifications.map(n => read.has(n.id) ? { ...n, read: true } : n) };
}
