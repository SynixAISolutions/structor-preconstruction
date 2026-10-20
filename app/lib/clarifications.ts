// Clarification requests: closing a bid's scope gaps with the subcontractor, in writing ("Close the
// gap", 20 Oct). Marcel's pain is subs leaving things out; leveling already finds the gaps (an excluded,
// partial or unanswered required item) and can plug them with a cost. This asks the sub first: one
// request per bidder, one line per gap, each quoting the bid's answer and the requirement. The sub
// answers each line Included / Add $ / Excluded through a signed portal link (app/api/portal/
// clarification); applying the answers updates leveling, and the written answer is what Exhibit A
// and the award can quote. The letter is built from the data, not by AI, so it never says anything
// the bid and the documents don't. Pure functions; every change returns a new request with its
// version raised, so the server store can refuse a write made from an older copy.

import type { LevelingBidder, LevelingResponse, LevelingScopeItem } from "./leveling-import";

export type ClarificationAnswer = { kind: "included" | "add" | "excluded"; amount: number | null; note: string; by: string; at: string };
export type ClarificationLine = {
  scopeItemId: string; number: string; item: string; section: string;
  /** Where the bid documents require it (the scope item's source). */
  requirement: string;
  /** What the bid said when the request was drafted: its Y/N/P answer and note. */
  bid: { status: LevelingResponse["status"]; note: string };
  answer: ClarificationAnswer | null;
  /** When this line's answer was written into leveling. */
  appliedAt: string | null;
};
export type ClarificationStatus = "draft" | "sent" | "answered" | "applied" | "cancelled";
export type ClarificationEvent = { at: string; by: string; what: string };
export type ClarificationRequest = {
  id: string; projectId: string; projectName: string; packageId: string; trade: string;
  bidderId: string; bidder: string;
  /** The bid's base price when drafted: an answer to a bid that has since changed is not applied blindly. */
  baseBid: number | null;
  recipient: { name: string; email: string } | null;
  lines: ClarificationLine[]; status: ClarificationStatus;
  createdAt: string; sentAt: string | null; dueAt: string | null; appliedAt: string | null;
  /** Raised by every change; the store writes only over the version it was given. */
  version: number;
  history: ClarificationEvent[];
};

export class ClarificationError extends Error {}
const fail = (message: string): never => { throw new ClarificationError(message); };
const next = (r: ClarificationRequest, change: Partial<ClarificationRequest>, event: ClarificationEvent): ClarificationRequest =>
  ({ ...r, ...change, version: r.version + 1, history: [...r.history, event] });

/** A gap worth asking about: a required item the bid excludes, prices partly or doesn't answer, not already resolved. */
export const isGap = (item: LevelingScopeItem, response: LevelingResponse | undefined) =>
  item.required && !response?.resolved && (!response || response.status === "" || response.status === "N" || response.status === "P");

/**
 * One draft request per bidder with gaps, skipping gaps already asked of that bidder in any request
 * that wasn't cancelled: a confirmed exclusion is not asked again by itself. Bidders without a base
 * bid haven't bid yet and are left out.
 */
export function draftClarifications(input: { projectId: string; projectName: string; packageId: string; trade: string; items: LevelingScopeItem[]; bidders: LevelingBidder[]; open: ClarificationRequest[]; at: string; newId: () => string }): ClarificationRequest[] {
  const asked = new Set(input.open.filter(r => r.packageId === input.packageId && r.status !== "cancelled").flatMap(r => r.lines.map(l => `${r.bidderId}|${l.scopeItemId}`)));
  return input.bidders.filter(b => b.baseBid !== null).flatMap(bidder => {
    const lines = input.items.filter(item => isGap(item, bidder.responses[item.id]) && !asked.has(`${bidder.id}|${item.id}`)).map(item => {
      const r = bidder.responses[item.id];
      return { scopeItemId: item.id, number: item.number, item: item.description, section: item.section, requirement: item.source, bid: { status: r?.status ?? "", note: r?.note ?? "" }, answer: null, appliedAt: null };
    });
    return lines.length ? [{
      id: input.newId(), projectId: input.projectId, projectName: input.projectName, packageId: input.packageId, trade: input.trade,
      bidderId: bidder.id, bidder: bidder.name, baseBid: bidder.baseBid, recipient: null, lines, status: "draft" as const,
      createdAt: input.at, sentAt: null, dueAt: null, appliedAt: null, version: 0, history: [],
    }] : [];
  });
}

const BID_SAID: Record<string, string> = { "": "does not say whether it is included", N: "excludes it", P: "includes it only in part" };

/** The letter, from the data only: each line quotes the bid's answer and where the documents require the work. */
export function clarificationLetter(request: ClarificationRequest): string {
  const due = request.dueAt ? ` by ${request.dueAt.slice(0, 10)}` : "";
  return [
    `${request.projectName}: ${request.trade}. Clarification of your proposal`,
    `To ${request.recipient?.name || request.bidder},`,
    `Before we can compare proposals on the same basis, please confirm each item below${due}: Included in your price, Add (with the amount), or Excluded.`,
    ...request.lines.map((l, i) => `${i + 1}. ${l.number ? `${l.number} ` : ""}${l.item}${l.section ? ` (${l.section})` : ""}. Your proposal ${BID_SAID[l.bid.status] ?? "does not say"}${l.bid.note ? `: "${l.bid.note}"` : ""}. The bid documents require it: ${l.requirement || "see the bid form"}.`),
    "Answer each line through the link you received; your answers become part of your proposal.",
  ].join("\n\n");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sends a draft: who receives it and the reply date (today or later). */
export function sendClarification(request: ClarificationRequest, recipient: { name: string; email: string }, dueAt: string, by: string, at: string): ClarificationRequest {
  if (request.status !== "draft") fail("This request was already sent.");
  const name = String(recipient?.name ?? "").trim().slice(0, 120), email = String(recipient?.email ?? "").trim().slice(0, 200);
  if (!EMAIL.test(email)) fail("Enter the recipient's email address.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || dueAt < at.slice(0, 10)) fail("Choose a reply date from today on.");
  return next(request, { status: "sent", sentAt: at, dueAt, recipient: { name: name || request.bidder, email } }, { at, by, what: `Sent to ${email}, reply by ${dueAt}` });
}

export type AnswerInput = { scopeItemId: string; kind: ClarificationAnswer["kind"]; amount: number | null; note: string };

/** The subcontractor's answers (from the portal), several lines at once. Add needs a positive amount; the others none. */
export function answerClarification(request: ClarificationRequest, answers: AnswerInput[], by: string, at: string): ClarificationRequest {
  if (request.status !== "sent" && request.status !== "answered") fail("This request is not open for answers.");
  if (!Array.isArray(answers) || !answers.length) fail("Answer at least one item.");
  const who = String(by ?? "").trim().slice(0, 120) || "Subcontractor";
  const byLine = new Map<string, ClarificationAnswer>();
  for (const a of answers) {
    const line = request.lines.find(l => l.scopeItemId === a?.scopeItemId) ?? fail("That item is not in this request.");
    if (line.appliedAt) fail("An answer already applied to leveling can't be changed here; ask the estimator.");
    if (!["included", "add", "excluded"].includes(a.kind)) fail("Choose Included, Add or Excluded.");
    const amount = a.amount === null || a.amount === undefined ? null : Number(a.amount);
    if (a.kind === "add" && !(amount !== null && Number.isFinite(amount) && amount > 0 && amount < 1e9)) fail("Enter the amount to add.");
    if (a.kind !== "add" && amount !== null) fail("Only an addition has an amount.");
    const note = String(a.note ?? "").trim();
    if (note.length > 1000) fail("Keep each note under 1,000 characters.");
    byLine.set(line.scopeItemId, { kind: a.kind, amount: a.kind === "add" ? Math.round(amount! * 100) / 100 : null, note, by: who, at });
  }
  const lines = request.lines.map(l => byLine.has(l.scopeItemId) ? { ...l, answer: byLine.get(l.scopeItemId)! } : l);
  return next(request, { lines, status: lines.every(l => l.answer) ? "answered" : "sent" }, { at, by: who, what: `Answered ${byLine.size} item${byLine.size === 1 ? "" : "s"}` });
}

export function cancelClarification(request: ClarificationRequest, by: string, at: string): ClarificationRequest {
  if (request.status === "applied" || request.status === "cancelled") fail("This request is already closed.");
  return next(request, { status: "cancelled" }, { at, by, what: "Cancelled" });
}

/** Overdue: sent, the reply date has passed, and some line has no answer. */
export const isOverdue = (r: ClarificationRequest, today: string) => r.status === "sent" && !!r.dueAt && r.dueAt < today;

/**
 * Lines whose bid answer has changed in leveling since the request was drafted (a new bid revision or
 * an estimator's edit), and whether the base price moved: their answers are not applied blindly.
 * Lines already applied are not stale; they changed because of this request.
 */
export function staleLines(request: ClarificationRequest, bidders: LevelingBidder[]): { lines: string[]; baseBidChanged: boolean } {
  const bidder = bidders.find(b => b.id === request.bidderId);
  if (!bidder) return { lines: request.lines.filter(l => !l.appliedAt).map(l => l.scopeItemId), baseBidChanged: true };
  const lines = request.lines.filter(l => { if (l.appliedAt) return false; const r = bidder.responses[l.scopeItemId]; return (r?.status ?? "") !== l.bid.status || (r?.note ?? "") !== l.bid.note; }).map(l => l.scopeItemId);
  return { lines, baseBidChanged: bidder.baseBid !== request.baseBid };
}

/**
 * The answered, current lines written into leveling for that bidder:
 * - included: the item becomes Y and resolved, quoting the answer; any plug on it is dropped
 * - add: it stays P, the sub's amount replaces the plug as the approved adjustment, and it is resolved
 * - excluded: it becomes N and stays unresolved, keeping its plug, so the GC or another trade carries it
 * Lines already applied are left alone, so a second click changes nothing. Unanswered lines and lines
 * whose bid answer changed since drafting (stale) are returned in `skipped`. The request becomes
 * "applied" when every line has been applied.
 */
export function applyClarification(bidders: LevelingBidder[], request: ClarificationRequest, by: string, at: string): { bidders: LevelingBidder[]; request: ClarificationRequest; applied: string[]; skipped: string[] } {
  if (request.status === "cancelled") fail("This request was cancelled.");
  const stale = new Set(staleLines(request, bidders).lines);
  const date = at.slice(0, 10), applied: string[] = [], skipped: string[] = [];
  const bidders2 = bidders.map(b => {
    if (b.id !== request.bidderId) return b;
    const responses = { ...b.responses };
    for (const l of request.lines) {
      const a = l.answer;
      if (l.appliedAt) continue;
      if (!a || stale.has(l.scopeItemId)) { skipped.push(l.scopeItemId); continue; }
      const prior = responses[l.scopeItemId] ?? { status: "", note: "", adjustment: 0 };
      const quote = `Confirmed in writing ${date} by ${a.by}${a.note ? `: "${a.note}"` : ""}`;
      responses[l.scopeItemId] = a.kind === "included" ? { ...prior, status: "Y", note: `Included. ${quote}`, adjustment: 0, resolved: true, adjustmentApproved: false }
        : a.kind === "add" ? { ...prior, status: "P", note: `Adds $${a.amount!.toFixed(2)}. ${quote}`, adjustment: a.amount!, resolved: true, adjustmentApproved: true }
        : { ...prior, status: "N", note: `Excluded. ${quote}`, resolved: false };
      applied.push(l.scopeItemId);
    }
    return { ...b, responses };
  });
  if (!applied.length) return { bidders, request, applied, skipped };
  const lines = request.lines.map(l => applied.includes(l.scopeItemId) ? { ...l, appliedAt: at } : l);
  const all = lines.every(l => l.appliedAt);
  return { bidders: bidders2, applied, skipped, request: next(request, { lines, ...(all ? { status: "applied" as const, appliedAt: at } : {}) }, { at, by, what: `Applied ${applied.length} item${applied.length === 1 ? "" : "s"} to leveling` }) };
}

/**
 * The server's record of an apply done in the estimator's browser (leveling lives there today): the
 * listed lines are marked applied, if answered and not already applied. Repeating it changes nothing.
 */
export function markLinesApplied(request: ClarificationRequest, scopeItemIds: string[], by: string, at: string): ClarificationRequest {
  if (request.status === "cancelled") fail("This request was cancelled.");
  const ids = new Set(scopeItemIds.filter(id => request.lines.some(l => l.scopeItemId === id && l.answer && !l.appliedAt)));
  if (!ids.size) return request;
  const lines = request.lines.map(l => ids.has(l.scopeItemId) ? { ...l, appliedAt: at } : l);
  const all = lines.every(l => l.appliedAt);
  return next(request, { lines, ...(all ? { status: "applied" as const, appliedAt: at } : {}) }, { at, by, what: `Applied ${ids.size} item${ids.size === 1 ? "" : "s"} to leveling` });
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v : "").trim().slice(0, max);

/** A draft sent from the browser, checked field by field: ids safe, text bounded, no answers or history carried in. */
export function parseDraftRequest(raw: unknown): ClarificationRequest {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = text(o.id, 100), projectId = text(o.projectId, 100), packageId = text(o.packageId, 100), bidderId = text(o.bidderId, 100);
  if (![id, projectId, packageId, bidderId].every(v => SAFE_ID.test(v))) fail("The request has an invalid id.");
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 100).map((l): ClarificationLine => {
    const x = (l ?? {}) as Record<string, unknown>, bid = (x.bid ?? {}) as Record<string, unknown>;
    const scopeItemId = text(x.scopeItemId, 100);
    if (!scopeItemId) fail("A line has no scope item.");
    const status = (["", "Y", "N", "P", "N/A"] as const).find(s => s === bid.status) ?? "";
    return { scopeItemId, number: text(x.number, 20), item: text(x.item, 400), section: text(x.section, 40), requirement: text(x.requirement, 400), bid: { status, note: text(bid.note, 1000) }, answer: null, appliedAt: null };
  });
  if (!lines.length) fail("The request has no items.");
  if (new Set(lines.map(l => l.scopeItemId)).size !== lines.length) fail("An item appears twice.");
  const baseBid = typeof o.baseBid === "number" && Number.isFinite(o.baseBid) ? Math.round(o.baseBid * 100) / 100 : null;
  return {
    id, projectId, projectName: text(o.projectName, 160) || "Project", packageId, trade: text(o.trade, 120) || "Trade", bidderId, bidder: text(o.bidder, 160) || "Bidder",
    baseBid, recipient: null, lines, status: "draft", createdAt: text(o.createdAt, 40) || new Date(0).toISOString(), sentAt: null, dueAt: null, appliedAt: null, version: 0, history: [],
  };
}

/** What the subcontractor's portal page may see: the request without the GC's internal history. */
export function portalView(request: ClarificationRequest) {
  const { history: _history, ...rest } = request;
  return rest;
}
export type PortalClarification = ReturnType<typeof portalView>;
