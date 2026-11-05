// Contract comparison (Marcel's process doc: "Allow for previous contract upload with same client, and current
// contract, and have AI go through and determine if there were any changes from the previous contract, and list what
// these changes are"; contract terms are "always changing even if same client"). The differences come from plain code
// over the two files' text, so none can be invented or skipped and finding them costs nothing. The AI only explains a
// difference already found (lib/ai-jobs-more "contract-changes"); a person decides. Pure.

export type ContractPage = { page: number; text: string };
export type Clause = { number: string | null; heading: string; text: string; page: number };
export type DiffPart = { op: "same" | "add" | "del"; text: string };
export type ChangeKind = "changed" | "added" | "removed";
export type ContractChange = {
  /** The same two wordings get the same id in every browser, so explanations and decisions stay with the change. */
  id: string; kind: ChangeKind; heading: string;
  previous: Clause | null; current: Clause | null;
  /** Word by word for a changed clause; empty for an added or removed one, which is shown whole. */
  diff: DiffPart[];
  /** Money, percentages and durations only one side holds: the terms worth seeing first. */
  figures: { was: string[]; now: string[] };
};
export type ContractComparison = {
  changes: ContractChange[]; same: number;
  /** Word for word the same but numbered differently, as happens to everything after an inserted clause. */
  renumbered: { from: string; to: string; heading: string; page: number }[];
  clauses: { previous: number; current: number };
  /** Enough clauses line up for these to be two versions of one contract rather than two different documents. */
  similar: boolean;
};

export type ContractRisk = "adds" | "reduces" | "neutral";
export const CONTRACT_RISKS: { value: ContractRisk; label: string }[] = [{ value: "adds", label: "Adds risk" }, { value: "reduces", label: "Reduces risk" }, { value: "neutral", label: "Neutral" }];
export type ContractExplanation = { summary: string; risk: ContractRisk };
export const CHANGE_DECISIONS = [{ value: "open", label: "To review" }, { value: "accepted", label: "Accepted" }, { value: "negotiate", label: "To negotiate" }] as const;
export type ChangeDecision = (typeof CHANGE_DECISIONS)[number]["value"];
export type ChangeReview = { decision: ChangeDecision; note: string };
export type ComparisonState = { previousId: string; currentId: string; explanations: Record<string, ContractExplanation>; reviews: Record<string, ChangeReview>; model: string; cost: number; at: string };
export const EMPTY_COMPARISON: ComparisonState = { previousId: "", currentId: "", explanations: {}, reviews: {}, model: "", cost: 0, at: "" };
export const CONTRACT_COMPARISON_KEY = "contract-comparison";

/** How many changes go in one AI request, how much of a clause it sees, and how many a comparison explains at most. */
export const CHANGE_BATCH = 12, MAX_CHANGE_CHARS = 3000, MAX_EXPLAINED = 200;

const squeeze = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const hashOf = (text: string) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
};

// ── The two files as clauses ──

/** The text lines of a contract, without the running headers, footers and page numbers that would read as changes. */
export function contractLines(pages: ContractPage[]): { page: number; text: string }[] {
  const shape = (line: string) => line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
  const byPage = pages.map(p => ({ page: p.page, lines: p.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).flatMap(unwrapClauses) }));
  const edge = (lines: string[]) => [...lines.slice(0, 3), ...lines.slice(-3)];
  const seen = new Map<string, number>();
  for (const { lines } of byPage) for (const s of new Set(edge(lines).map(shape))) seen.set(s, (seen.get(s) ?? 0) + 1);
  const repeated = Math.max(3, pages.length * 0.4);
  return byPage.flatMap(({ page, lines }) => lines
    .filter((line, i) => !/^(page\s*)?#(\s*(of|\/)\s*#)?$/.test(shape(line)) && !((i < 3 || i >= lines.length - 3) && (seen.get(shape(line)) ?? 0) >= repeated))
    .map(text => ({ page, text })));
}
/** A page whose text came out as one long line: cut it where a numbered clause starts. */
function unwrapClauses(line: string): string[] {
  return line.length > 400 ? line.split(/(?<=[.;:])\s+(?=(?:§\s*)?\d{1,3}(?:\.\d{1,3})+\.?\s+[A-Z])/) : [line];
}

/** The clause number a line starts with, and the rest of the line; null for a line inside a clause. A wrapped
 * reference ("Section 5.1 of this Agreement") goes on in lower case, so it doesn't start one. */
function clauseStart(line: string): { number: string; rest: string } | null {
  const named = /^(article|section)\s+(\d{1,3}(?:\.\d{1,3})*|[ivxlc]+)\b[.:\s–—-]*(.*)$/i.exec(line);
  const nested = /^(?:§\s*)?(\d{1,3}(?:\.\d{1,3})+)\.?(?:\s+(.*))?$/.exec(line);
  const top = /^(?:§\s*)?(\d{1,3})\.\s+(.*)$/.exec(line);
  const found = named ? { number: `${named[1][0].toUpperCase()}${named[1].slice(1).toLowerCase()} ${named[2].toUpperCase()}`, rest: named[3] } : nested ? { number: nested[1], rest: nested[2] ?? "" } : top ? { number: top[1], rest: top[2] } : null;
  return found && !/^[a-z]/.test(found.rest) ? found : null;
}
const headingOf = (text: string) => {
  const first = /^(.{3,70}?)(?:[.:]\s|[.:]$|$)/.exec(text)?.[1] ?? "";
  return first || text.slice(0, 70);
};

/** The clauses of a contract, by its own numbering; sentence by sentence when it has too little numbering to go by. */
export function contractClauses(pages: ContractPage[]): Clause[] {
  const lines = contractLines(pages), clauses: Clause[] = [];
  let open: Clause | null = null;
  for (const line of lines) {
    const start = clauseStart(line.text);
    if (start || !open) {
      if (open) clauses.push(open);
      open = { number: start?.number ?? null, heading: "", text: start ? start.rest : line.text, page: line.page };
    } else open.text += ` ${line.text}`;
  }
  if (open) clauses.push(open);
  const numbered = clauses.filter(c => c.number);
  const list = numbered.length >= Math.max(3, pages.length / 3) ? clauses : sentences(lines);
  return list.filter(c => squeeze(c.text) || c.number).map(c => ({ ...c, text: c.text.replace(/\s+/g, " ").trim(), heading: headingOf(c.text.replace(/\s+/g, " ").trim()) }));
}
function sentences(lines: { page: number; text: string }[]): Clause[] {
  const out: Clause[] = [];
  let carry = "", page = lines[0]?.page ?? 1;
  for (const line of lines) {
    if (!carry) page = line.page;
    const parts = `${carry} ${line.text}`.trim().split(/(?<=[.;:])\s+(?=[A-Z(])/);
    carry = parts.pop() ?? "";
    for (const text of parts) if (wordsOf(text).length >= 4) { out.push({ number: null, heading: "", text, page }); page = line.page; }
  }
  if (carry) out.push({ number: null, heading: "", text: carry, page });
  return out;
}

// ── What changed ──

/** The two wordings, word by word. Case and punctuation alone are no change. */
export function wordDiff(previous: string, current: string): DiffPart[] {
  const a = wordsOf(previous), b = wordsOf(current), same = (x: string, y: string) => (squeeze(x) || x) === (squeeze(y) || y);
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && same(a[start], b[start])) start++;
  while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) { endA--; endB--; }
  const n = endA - start, m = endB - start, steps: DiffPart[] = [];
  const push = (op: DiffPart["op"], word: string) => {
    const last = steps.at(-1);
    if (last?.op === op) last.text += ` ${word}`; else steps.push({ op, text: word });
  };
  b.slice(0, start).forEach(w => push("same", w));
  if (n * m > 4_000_000) {
    a.slice(start, endA).forEach(w => push("del", w));
    b.slice(start, endB).forEach(w => push("add", w));
  } else {
    // Longest common run of words; walking it gives the deletions and additions around it.
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = same(a[start + i], b[start + j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && same(a[start + i], b[start + j])) { push("same", b[start + j]); i++; j++; }
      else if (i < n && (j >= m || table[i + 1][j] >= table[i][j + 1])) push("del", a[start + i++]);
      else push("add", b[start + j++]);
    }
  }
  b.slice(endB).forEach(w => push("same", w));
  return steps;
}

/** A diff with long unchanged runs cut down to the words around each change. */
export function clipDiff(parts: DiffPart[], around = 14): DiffPart[] {
  return parts.map((part, i) => {
    if (part.op !== "same") return part;
    const words = wordsOf(part.text);
    const head = i === 0 ? [] : words.slice(0, around), tail = i === parts.length - 1 ? [] : words.slice(-around);
    return words.length <= head.length + tail.length + 3 ? part : { ...part, text: [...head, "…", ...tail].join(" ") };
  });
}

const FIGURE = /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|thousand))?|\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b|(?:calendar\s+|business\s+|working\s+)?days?\b|months?\b|years?\b|hours?\b)/gi;
const figuresIn = (text: string) => (text.match(FIGURE) ?? []).map(f => f.replace(/\s+/g, " ").trim());
/** The money, percentages and durations only one wording holds. */
export function figureChanges(previous: string, current: string): { was: string[]; now: string[] } {
  const key = (f: string) => f.toLowerCase().replace(/[\s,]/g, "").replace("percent", "%");
  const a = figuresIn(previous), b = figuresIn(current), left = [...b];
  const was = a.filter(f => { const i = left.findIndex(g => key(g) === key(f)); if (i < 0) return true; left.splice(i, 1); return false; });
  return { was, now: left };
}

const SIMILAR = 0.5;
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return (2 * common) / (a.size + b.size);
}

/** Lines the two contracts' clauses up and lists what differs, in the current contract's order. */
export function compareContracts(previousPages: ContractPage[], currentPages: ContractPage[]): ContractComparison {
  const previous = contractClauses(previousPages), current = contractClauses(currentPages);
  const pair = new Map<number, number>(), taken = new Set<number>();
  let same = 0;
  const renumbered: ContractComparison["renumbered"] = [];
  // Word for word the same first, the same number preferred, so a repeated clause pairs with its own.
  const exact = new Map<string, number[]>();
  current.forEach((c, j) => { const k = squeeze(c.text); exact.set(k, [...(exact.get(k) ?? []), j]); });
  for (const pass of ["number", "any"] as const) previous.forEach((c, i) => {
    if (pair.has(i)) return;
    const j = (exact.get(squeeze(c.text)) ?? []).find(x => !taken.has(x) && (pass === "any" || current[x].number === c.number));
    if (j === undefined) return;
    pair.set(i, j); taken.add(j); same++;
    if (c.number && current[j].number && c.number !== current[j].number) renumbered.push({ from: c.number, to: current[j].number!, heading: current[j].heading, page: current[j].page });
  });
  // Then the closest wording: a clause keeps its place in the list even when its number or some of its words moved.
  const bag = (c: Clause) => new Set(wordsOf(c.text.toLowerCase()).map(squeeze).filter(w => w.length > 2));
  const bagsA = previous.map(bag), bagsB = current.map(bag), candidates: { i: number; j: number; score: number }[] = [];
  previous.forEach((a, i) => {
    if (pair.has(i)) return;
    current.forEach((b, j) => {
      if (taken.has(j)) return;
      const sameNumber = !!a.number && a.number === b.number;
      const score = similarity(bagsA[i], bagsB[j]) + (sameNumber ? 0.15 : 0);
      if (score >= SIMILAR) candidates.push({ i, j, score });
    });
  });
  const changedPairs = new Set<number>();
  for (const { i, j } of candidates.sort((x, y) => y.score - x.score)) {
    if (pair.has(i) || taken.has(j)) continue;
    pair.set(i, j); taken.add(j); changedPairs.add(i);
  }

  const reverse = new Map([...pair].map(([i, j]) => [j, i]));
  const make = (kind: ChangeKind, a: Clause | null, b: Clause | null): ContractChange => ({
    id: `chg-${hashOf(`${squeeze(a?.text ?? "")}|${squeeze(b?.text ?? "")}`)}`, kind, heading: (b ?? a)!.heading, previous: a, current: b,
    diff: a && b ? wordDiff(a.text, b.text) : [], figures: figureChanges(a?.text ?? "", b?.text ?? ""),
  });
  // A removed clause sits after the clause it followed in the previous contract.
  const placed: { order: number; change: ContractChange }[] = [];
  current.forEach((b, j) => {
    const i = reverse.get(j);
    if (i === undefined) placed.push({ order: j, change: make("added", null, b) });
    else if (changedPairs.has(i)) placed.push({ order: j, change: make("changed", previous[i], b) });
  });
  let after = -1;
  previous.forEach((a, i) => {
    if (pair.has(i)) after = pair.get(i)!;
    else placed.push({ order: after + 0.5, change: make("removed", a, null) });
  });
  const changes = placed.sort((x, y) => x.order - y.order).map(p => p.change);
  return { changes, same, renumbered, clauses: { previous: previous.length, current: current.length }, similar: pair.size >= 0.4 * Math.max(1, Math.min(previous.length, current.length)) };
}

// ── The AI's explanations ──

export type ChangeForAi = { id: string; number: string; heading: string; previous: string; current: string };
const clip = (text: string) => text.length > MAX_CHANGE_CHARS ? `${text.slice(0, MAX_CHANGE_CHARS)}…` : text;

/** The changes still to explain, in requests of a few: the most it explains for one comparison, in reading order. */
export function explanationBatches(changes: ContractChange[], state: Pick<ComparisonState, "explanations">, size = CHANGE_BATCH): ChangeForAi[][] {
  const waiting = changes.filter(c => !state.explanations[c.id]).slice(0, Math.max(0, MAX_EXPLAINED - Object.keys(state.explanations).length));
  const payload = waiting.map(c => ({ id: c.id, number: c.current?.number ?? c.previous?.number ?? "", heading: c.heading, previous: clip(c.previous?.text ?? ""), current: clip(c.current?.text ?? "") }));
  return Array.from({ length: Math.ceil(payload.length / size) }, (_, i) => payload.slice(i * size, (i + 1) * size));
}

/** The AI's answer, only for the changes it was sent, once each, with a known risk. */
export function screenExplanations(output: unknown, ids: string[]): Record<string, ContractExplanation> {
  const list = (output as { explanations?: unknown })?.explanations, out: Record<string, ContractExplanation> = {};
  for (const entry of Array.isArray(list) ? list : []) {
    const o = (entry ?? {}) as Record<string, unknown>, id = typeof o.id === "string" ? o.id : "";
    const summary = typeof o.summary === "string" ? o.summary.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    const risk = CONTRACT_RISKS.find(r => r.value === o.risk)?.value;
    if (ids.includes(id) && !out[id] && summary && risk) out[id] = { summary, risk };
  }
  return out;
}

// ── Working through the list ──

export const reviewOf = (state: Pick<ComparisonState, "reviews">, id: string): ChangeReview => state.reviews[id] ?? { decision: "open", note: "" };

export type ChangeFilter = { query?: string; kind?: ChangeKind | ""; risk?: ContractRisk | "figures" | ""; decision?: ChangeDecision | "" };
export function filterChanges(changes: ContractChange[], state: Pick<ComparisonState, "explanations" | "reviews">, { query = "", kind = "", risk = "", decision = "" }: ChangeFilter): ContractChange[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return changes.filter(c => {
    const explained = state.explanations[c.id], review = reviewOf(state, c.id);
    const text = `${c.previous?.number ?? ""} ${c.current?.number ?? ""} ${c.previous?.text ?? ""} ${c.current?.text ?? ""} ${explained?.summary ?? ""} ${review.note}`.toLowerCase();
    return (!kind || c.kind === kind) && (!decision || review.decision === decision)
      && (!risk || (risk === "figures" ? c.figures.was.length + c.figures.now.length > 0 : explained?.risk === risk))
      && words.every(w => text.includes(w));
  });
}

export function comparisonSummary(changes: ContractChange[], state: Pick<ComparisonState, "explanations" | "reviews">) {
  const count = (test: (c: ContractChange) => boolean) => changes.filter(test).length;
  return {
    changed: count(c => c.kind === "changed"), added: count(c => c.kind === "added"), removed: count(c => c.kind === "removed"),
    figures: count(c => c.figures.was.length + c.figures.now.length > 0), addsRisk: count(c => state.explanations[c.id]?.risk === "adds"),
    open: count(c => reviewOf(state, c.id).decision === "open"), negotiate: count(c => reviewOf(state, c.id).decision === "negotiate"),
    explained: count(c => !!state.explanations[c.id]),
  };
}

export function comparisonRows(changes: ContractChange[], state: Pick<ComparisonState, "explanations" | "reviews">): (string | number)[][] {
  return [["Clause", "Change", "Previous wording", "Previous page", "Current wording", "Current page", "Figures before", "Figures now", "What changed (AI)", "Risk (AI)", "Decision", "Note"],
    ...changes.map(c => {
      const explained = state.explanations[c.id], review = reviewOf(state, c.id);
      return [c.current?.number ?? c.previous?.number ?? "", c.kind, c.previous?.text ?? "", c.previous?.page ?? "", c.current?.text ?? "", c.current?.page ?? "", c.figures.was.join("; "), c.figures.now.join("; "), explained?.summary ?? "", CONTRACT_RISKS.find(r => r.value === explained?.risk)?.label ?? "", CHANGE_DECISIONS.find(d => d.value === review.decision)!.label, review.note];
    })];
}
