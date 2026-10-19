// Clarification requests: closing a bid's scope gaps with the subcontractor, in writing (ideas 20 Oct,
// "gap letters"). Marcel's pain is subs leaving things out; leveling already finds the gaps (an
// excluded, partial or unanswered required item) and can plug them with a cost. This asks the sub
// first: one request per bidder, one line per gap, each quoting the bid's answer and the requirement.
// The sub answers each line Included / Add $ / Excluded; applying the answers updates leveling, and the
// written answer is what Exhibit A and the award can quote. The letter is built from the data, not by
// AI, so it never says anything the bid and the documents don't. Pure functions.

import type { LevelingBidder, LevelingResponse, LevelingScopeItem } from "./leveling-import";

export type ClarificationAnswer = { kind: "included" | "add" | "excluded"; amount: number | null; note: string; by: string; at: string };
export type ClarificationLine = {
  scopeItemId: string; number: string; item: string; section: string;
  /** Where the bid documents require it (the scope item's source). */
  requirement: string;
  /** What the bid said: its Y/N/P answer and note. */
  bid: { status: LevelingResponse["status"]; note: string };
  answer: ClarificationAnswer | null;
};
export type ClarificationStatus = "draft" | "sent" | "answered" | "applied";
export type ClarificationRequest = {
  id: string; packageId: string; bidderId: string; bidder: string; trade: string;
  lines: ClarificationLine[]; status: ClarificationStatus;
  createdAt: string; sentAt: string | null; dueAt: string | null; appliedAt: string | null;
};

export class ClarificationError extends Error {}
const fail = (message: string): never => { throw new ClarificationError(message); };

/** A gap worth asking about: a required item the bid excludes, prices partly or doesn't answer, not already resolved. */
export const isGap = (item: LevelingScopeItem, response: LevelingResponse | undefined) =>
  item.required && !response?.resolved && (!response || response.status === "" || response.status === "N" || response.status === "P");

/**
 * One draft request per bidder with gaps, skipping gaps already asked of that bidder in any request: a
 * confirmed exclusion is not asked again by itself. Bidders without a base bid haven't bid yet and are left out.
 */
export function draftClarifications(input: { packageId: string; trade: string; items: LevelingScopeItem[]; bidders: LevelingBidder[]; open: ClarificationRequest[]; at: string; newId: () => string }): ClarificationRequest[] {
  const asked = new Set(input.open.filter(r => r.packageId === input.packageId).flatMap(r => r.lines.map(l => `${r.bidderId}|${l.scopeItemId}`)));
  return input.bidders.filter(b => b.baseBid !== null).flatMap(bidder => {
    const lines = input.items.filter(item => isGap(item, bidder.responses[item.id]) && !asked.has(`${bidder.id}|${item.id}`)).map(item => {
      const r = bidder.responses[item.id];
      return { scopeItemId: item.id, number: item.number, item: item.description, section: item.section, requirement: item.source, bid: { status: r?.status ?? "", note: r?.note ?? "" }, answer: null };
    });
    return lines.length ? [{ id: input.newId(), packageId: input.packageId, bidderId: bidder.id, bidder: bidder.name, trade: input.trade, lines, status: "draft" as const, createdAt: input.at, sentAt: null, dueAt: null, appliedAt: null }] : [];
  });
}

const BID_SAID: Record<string, string> = { "": "does not say whether it is included", N: "excludes it", P: "includes it only in part" };

/** The letter, from the data only: each line quotes the bid's answer and where the documents require the work. */
export function clarificationLetter(request: ClarificationRequest, project: string): string {
  const due = request.dueAt ? ` by ${request.dueAt.slice(0, 10)}` : "";
  return [
    `${project}: ${request.trade}. Clarification of your proposal`,
    `To ${request.bidder},`,
    `Before we can compare proposals on the same basis, please confirm each item below${due}: Included in your price, Add (with the amount), or Excluded.`,
    ...request.lines.map((l, i) => `${i + 1}. ${l.number ? `${l.number} ` : ""}${l.item}${l.section ? ` (${l.section})` : ""}. Your proposal ${BID_SAID[l.bid.status] ?? "does not say"}${l.bid.note ? `: "${l.bid.note}"` : ""}. The bid documents require it: ${l.requirement || "see the bid form"}.`),
    "Answer each line in the bid portal; your answers become part of your proposal.",
  ].join("\n\n");
}

export function sendClarification(requests: ClarificationRequest[], id: string, dueAt: string, at: string): ClarificationRequest[] {
  const request = requests.find(r => r.id === id) ?? fail("That request no longer exists.");
  if (request.status !== "draft") fail("This request was already sent.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(dueAt) || dueAt < at.slice(0, 10)) fail("Choose a reply date from today on.");
  return requests.map(r => r.id === id ? { ...r, status: "sent", sentAt: at, dueAt } : r);
}

/** The subcontractor's answer to one line (from the portal). Add needs a positive amount; the others none. */
export function answerLine(requests: ClarificationRequest[], id: string, scopeItemId: string, answer: Omit<ClarificationAnswer, "at" | "by">, by: string, at: string): ClarificationRequest[] {
  const request = requests.find(r => r.id === id) ?? fail("That request no longer exists.");
  if (request.status !== "sent" && request.status !== "answered") fail("This request is not open for answers.");
  if (!request.lines.some(l => l.scopeItemId === scopeItemId)) fail("That item is not in this request.");
  if (answer.kind === "add" && !(answer.amount !== null && Number.isFinite(answer.amount) && answer.amount > 0 && answer.amount < 1e9)) fail("Enter the amount to add.");
  if (answer.kind !== "add" && answer.amount !== null) fail("Only an addition has an amount.");
  if (answer.note.length > 1000) fail("Keep the note under 1,000 characters.");
  const lines = request.lines.map(l => l.scopeItemId === scopeItemId ? { ...l, answer: { ...answer, amount: answer.kind === "add" ? Math.round(answer.amount! * 100) / 100 : null, note: answer.note.trim(), by, at } } : l);
  return requests.map(r => r.id === id ? { ...r, lines, status: lines.every(l => l.answer) ? "answered" : "sent" } : r);
}

/** Overdue: sent, the reply date has passed, and some line has no answer. */
export const isOverdue = (r: ClarificationRequest, today: string) => r.status === "sent" && !!r.dueAt && r.dueAt < today;

/**
 * The answered lines written into leveling for that bidder:
 * - included: the item becomes Y and resolved, quoting the answer
 * - add: it stays P, the sub's amount is the approved adjustment, and it is resolved (their price now covers it)
 * - excluded: it becomes N, unresolved, so the plug or another trade must carry it
 * Unanswered lines change nothing. The request is marked applied only when every line is answered.
 */
export function applyClarification(bidders: LevelingBidder[], request: ClarificationRequest, at: string): { bidders: LevelingBidder[]; request: ClarificationRequest } {
  const date = at.slice(0, 10);
  const bidders2 = bidders.map(b => {
    if (b.id !== request.bidderId) return b;
    const responses = { ...b.responses };
    for (const l of request.lines) {
      const a = l.answer;
      if (!a) continue;
      const prior = responses[l.scopeItemId] ?? { status: "", note: "", adjustment: 0 };
      const quote = `Confirmed in writing ${date} by ${a.by}${a.note ? `: "${a.note}"` : ""}`;
      responses[l.scopeItemId] = a.kind === "included" ? { ...prior, status: "Y", note: `Included. ${quote}`, adjustment: 0, resolved: true, adjustmentApproved: false }
        : a.kind === "add" ? { ...prior, status: "P", note: `Adds $${a.amount!.toFixed(2)}. ${quote}`, adjustment: a.amount!, resolved: true, adjustmentApproved: true }
        : { ...prior, status: "N", note: `Excluded. ${quote}`, resolved: false };
    }
    return { ...b, responses };
  });
  const complete = request.lines.every(l => l.answer);
  return { bidders: bidders2, request: complete ? { ...request, status: "applied", appliedAt: at } : request };
}
