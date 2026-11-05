// The scope matrix (Marcel's process doc). He uses the name for two things. Every scope item on the project in one
// place, where the bid captain checks them, moves them between trades and adds what's missing ("AI already knows where,
// but this allows GC to go through them all in one place and move things around"). And the crossovers estimators agree
// between trades so nobody misses them ("Masonry façade anchors: the misc metals subcontractor will furnish and drywall
// will install rather than have the mason get them and install them because it is cheaper"). Built on the bid forms
// (lib/procurement) and the AI's proposals still waiting (lib/extraction). Pure.

import { addScope, moveScope, ProcurementRuleError, type Procurement, type ProcurementNotification, type ScopeOrigin, type TradePackage } from "./procurement";
import { notOnSheet, type Draft } from "./extraction";

const now = () => new Date().toISOString();
const fail = (message: string): never => { throw new ProcurementRuleError(message); };
// "Façade" and "facade" are the same word to someone typing it.
const plain = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = (text: string) => plain(text).replace(/[^a-z0-9]+/g, " ").trim();

export type MatrixRow = {
  id: string;
  /** A bid-form line, or an AI proposal still waiting for a decision. */
  kind: "line" | "proposal";
  title: string; detail: string; source: string;
  /** The trade that carries it; null for a line every trade carries. */
  packageId: string | null;
  code: string; trade: string; owner: string;
  origin: ScopeOrigin;
  status: "draft" | "approved" | "proposal";
  /** An AI proposal whose quoted words aren't printed on its sheet: a person checks the sheet first. */
  notPrinted: boolean;
  /** Other trades carrying the same words. */
  alsoIn: string[];
};

/** Every scope item on the project, in CSI order with the lines every trade carries first. */
export function matrixRows(state: Procurement, drafts: Draft[]): MatrixRow[] {
  const packages = new Map(state.packages.map(p => [p.id, p]));
  const place = (packageId: string) => { const p = packages.get(packageId); return { packageId, code: p?.code ?? "", trade: p?.name ?? "Removed trade", owner: p?.owner ?? "" }; };
  const rows: MatrixRow[] = [
    ...state.scopes.map(s => ({ id: s.id, kind: "line" as const, title: s.title, detail: s.detail, source: s.source, ...(s.allTrades ? { packageId: null, code: "", trade: "Every trade", owner: "" } : place(s.packageId)), origin: s.origin, status: s.status, notPrinted: false, alsoIn: [] })),
    ...drafts.flatMap(d => d.kind === "scope" && d.status === "pending-review" && !d.removed ? [{ id: d.id, kind: "proposal" as const, title: d.title, detail: d.detail, source: d.source, ...place(d.packageId), origin: "ai" as const, status: "proposal" as const, notPrinted: notOnSheet(d), alsoIn: [] }] : []),
  ];
  const tradesWith = new Map<string, Set<string>>();
  for (const r of rows) if (r.packageId) tradesWith.set(words(r.title), (tradesWith.get(words(r.title)) ?? new Set<string>()).add(r.trade));
  return rows.map(r => ({ ...r, alsoIn: r.packageId ? [...tradesWith.get(words(r.title))!].filter(t => t !== r.trade) : [] }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.trade.localeCompare(b.trade));
}

export const MATRIX_VIEWS = ["All", "To review", "Approved", "In more than one trade"] as const;
export type MatrixView = (typeof MATRIX_VIEWS)[number];
export type MatrixFilter = { view: MatrixView; packageId: string; owner: string; query: string };
/** The trade filter's value for the lines every trade carries, and the owner filter's for a trade with no owner. */
export const EVERY_TRADE = "every-trade", NO_OWNER = "no-owner";

export function filterMatrix(rows: MatrixRow[], filter: MatrixFilter): MatrixRow[] {
  const terms = plain(filter.query).split(/\s+/).filter(Boolean);
  return rows.filter(r =>
    (filter.view === "All" || (filter.view === "Approved" ? r.status === "approved" : filter.view === "To review" ? r.status !== "approved" : r.alsoIn.length > 0))
    && (!filter.packageId || (filter.packageId === EVERY_TRADE ? r.packageId === null : r.packageId === filter.packageId))
    && (!filter.owner || (filter.owner === NO_OWNER ? r.packageId !== null && !r.owner : r.owner === filter.owner))
    && terms.every(t => plain(`${r.title} ${r.detail} ${r.source} ${r.trade} ${r.code}`).includes(t)));
}

export function matrixSummary(rows: MatrixRow[]) {
  return { total: rows.length, toReview: rows.filter(r => r.status !== "approved").length, approved: rows.filter(r => r.status === "approved").length, proposals: rows.filter(r => r.kind === "proposal").length, shared: rows.filter(r => r.alsoIn.length).length };
}

const STATUS_WORDS: Record<MatrixRow["status"], string> = { draft: "To review", approved: "Approved", proposal: "AI proposal" };
export const matrixStatus = (row: MatrixRow) => row.notPrinted ? "Check the sheet" : STATUS_WORDS[row.status];

export function matrixCsv(rows: MatrixRow[]): string[][] {
  return [["CSI", "Trade", "Owner", "Scope item", "Detail", "Source", "Origin", "Status", "Also in"],
    ...rows.map(r => [r.code, r.trade, r.owner, r.title, r.detail, r.source, r.origin, matrixStatus(r), r.alsoIn.join("; ")])];
}

/** Tags each trade's owner once, unless they made the change themselves. */
function tagOwners(state: Procurement, packages: TradePackage[], text: string, by: string, at: string): Procurement {
  const tagged = new Set<string>();
  const notifications: ProcurementNotification[] = packages.flatMap(p => {
    if (!p.owner || p.owner === by || tagged.has(p.owner)) return [];
    tagged.add(p.owner);
    return [{ id: crypto.randomUUID(), kind: "scope-moved" as const, recipientType: "team" as const, recipient: p.owner, packageId: p.id, text, at, read: false }];
  });
  return notifications.length ? { ...state, notifications: [...state.notifications, ...notifications] } : state;
}
const findPackage = (state: Procurement, id: string) => state.packages.find(p => p.id === id) ?? fail("That trade package no longer exists.");

/** Moves lines to a trade as lib/procurement moveScope does; the receiving estimator is tagged once, not once a line.
 * A line already in that trade stays as it is. */
export function moveLines(state: Procurement, ids: string[], toPackageId: string, by: string, at = now()): Procurement {
  const to = findPackage(state, toPackageId);
  let next = state, moved = 0;
  for (const id of ids) {
    const item = next.scopes.find(s => s.id === id);
    if (!item || (item.packageId === to.id && !item.allTrades)) continue;
    next = moveScope(next, id, to.id, by, at);
    moved++;
  }
  if (moved < 2) return next;
  return tagOwners({ ...next, notifications: state.notifications }, [to], `${by} moved ${moved} scope items to ${to.name}. They need your review.`, by, at);
}

/** A scope item the bid captain adds (Marcel: "items that are not there", from meetings or easily missed on the drawings).
 * It's a draft in the trade's bid form and the trade's owner is tagged. */
export function addMatrixItem(state: Procurement, input: { packageId: string; title: string; detail?: string; source?: string }, by: string, at = now()): Procurement {
  const to = findPackage(state, input.packageId);
  if (state.scopes.some(s => !s.allTrades && s.packageId === to.id && words(s.title) === words(input.title))) fail(`${to.name} already has this item.`);
  return tagOwners(addScope(state, { ...input, origin: "estimator" }, by, at), [to], `${by} added "${input.title.trim()}" to ${to.name}. It needs your review.`, by, at);
}

// ── Crossovers ──────────────────────────────────────────────────────────────

export type Crossover = {
  id: string;
  item: string;
  /** The trade you'd expect to carry it, whose bid form then excludes it. */
  usualId: string | null;
  furnishId: string;
  installId: string;
  reason: string;
  /** The bid-form lines it added. */
  lineIds: string[];
  by: string; at: string;
};
export type CrossoverInput = { item: string; usualId?: string | null; furnishId: string; installId: string; reason?: string };

/** What each trade's bid form says, so every division leader carries their half. */
export function crossoverLines(item: string, furnish: TradePackage, install: TradePackage, usual: TradePackage | null): { packageId: string; title: string }[] {
  const lines = furnish.id === install.id
    ? [{ packageId: furnish.id, title: `Furnish and install ${item}.` }]
    : [{ packageId: furnish.id, title: `Furnish ${item}; ${install.name} installs.` }, { packageId: install.id, title: `Install ${item}; ${furnish.name} furnishes.` }];
  if (usual && usual.id !== furnish.id && usual.id !== install.id) lines.push({ packageId: usual.id, title: `Excludes ${item}: ${furnish.name} furnishes, ${install.name} installs.` });
  return lines;
}

/** Records a crossover and adds its lines to the trades' bid forms as drafts; each trade's owner is tagged once. */
export function addCrossover(state: Procurement, existing: Crossover[], input: CrossoverInput, by: string, at = now()): { state: Procurement; crossover: Crossover } {
  const item = input.item.trim().replace(/[.;:]+$/, "");
  if (!item) fail("Describe the item.");
  if (!input.furnishId || !input.installId) fail("Choose who furnishes it and who installs it.");
  const furnish = findPackage(state, input.furnishId), install = findPackage(state, input.installId);
  const usual = input.usualId ? findPackage(state, input.usualId) : null;
  if (existing.some(c => words(c.item) === words(item) && c.furnishId === furnish.id && c.installId === install.id)) fail("That crossover is already recorded.");
  const reason = (input.reason ?? "").trim();
  const before = state.scopes.length;
  let next = state;
  for (const line of crossoverLines(item, furnish, install, usual)) next = addScope(next, { ...line, detail: reason, source: "Scope matrix", origin: "estimator" }, by, at);
  const crossover: Crossover = { id: crypto.randomUUID(), item, usualId: usual?.id ?? null, furnishId: furnish.id, installId: install.id, reason, lineIds: next.scopes.slice(before).map(s => s.id), by, at };
  return { state: tagOwners(next, [furnish, install, ...(usual ? [usual] : [])], `${by} added a crossover to your bid forms: ${item}. It needs your review.`, by, at), crossover };
}

/** How far a crossover's lines have come. `gone` lines were removed from their bid forms. */
export function crossoverProgress(crossover: Crossover, state: Procurement) {
  const lines = crossover.lineIds.map(id => state.scopes.find(s => s.id === id));
  return { lines: lines.length, approved: lines.filter(s => s?.status === "approved").length, gone: lines.filter(s => !s).length };
}
