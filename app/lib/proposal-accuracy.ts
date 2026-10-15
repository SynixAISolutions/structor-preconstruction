// How well the AI read a subcontractor's proposal, against the contractor's own leveling of the
// same proposal (C9, second half). The leveled bid sheet records, for every scope line, the answer an
// estimator gave that bidder (Y / N / P / N/A) and the base bid; the AI's reading gives its own.
//
// The disagreements that matter are not equal: the AI saying Y where the estimator found an N hides
// an exclusion, which is how a low bid looks complete. Those are counted apart as "hidden exclusions".
// A line the estimator left blank can't confirm the AI either way, so it is reported, not scored.

import type { ScopeAnswer } from "./submissions";

export type LeveledAnswer = { lineId: string; text: string; answer: ScopeAnswer | null; note: string };
export type ReadAnswer = { lineId: string; answer: ScopeAnswer | null; note: string };
export type LineOutcome = "agree" | "disagree" | "hidden-exclusion" | "unanswered" | "unverifiable" | "both-blank";

export type ProposalAccuracy = {
  lines: { lineId: string; text: string; expected: ScopeAnswer | null; read: ScopeAnswer | null; outcome: LineOutcome; expectedNote: string; readNote: string }[];
  baseBid: { expected: number | null; read: number | null; matches: boolean | null };
  summary: {
    /** Lines the estimator answered. */
    leveled: number;
    agree: number; disagree: number; hiddenExclusions: number; unanswered: number; unverifiable: number;
    /** agree / (agree + every kind of disagreement): of the lines both answered, how many match.
     *  null when there is nothing to compare: an empty reading is unassessed, not 0% accurate. */
    agreement: number | null;
    /** (agree + disagreements) / leveled: how many of the estimator's lines the AI answered at all. */
    coverage: number;
  };
};

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);

export function scoreReading(expected: LeveledAnswer[], read: ReadAnswer[], baseBid: { expected: number | null; read: number | null }): ProposalAccuracy {
  const byId = new Map(read.map(r => [r.lineId, r]));
  const lines = expected.map(e => {
    const r = byId.get(e.lineId);
    const got = r?.answer ?? null;
    const outcome: LineOutcome = e.answer === null ? (got === null ? "both-blank" : "unverifiable")
      : got === null ? "unanswered"
      : got === e.answer ? "agree"
      : e.answer === "N" && got === "Y" ? "hidden-exclusion" : "disagree";
    return { lineId: e.lineId, text: e.text, expected: e.answer, read: got, outcome, expectedNote: e.note, readNote: r?.note ?? "" };
  });
  const count = (o: LineOutcome) => lines.filter(l => l.outcome === o).length;
  const agree = count("agree"), disagree = count("disagree"), hidden = count("hidden-exclusion"), unanswered = count("unanswered");
  const leveled = lines.filter(l => l.expected !== null).length;
  const matches = baseBid.expected === null || baseBid.read === null ? null : Math.abs(baseBid.expected - baseBid.read) < 0.005;
  return {
    lines,
    baseBid: { ...baseBid, matches },
    summary: {
      leveled, agree, disagree, hiddenExclusions: hidden, unanswered, unverifiable: count("unverifiable"),
      agreement: agree + disagree + hidden ? ratio(agree, agree + disagree + hidden) : null, coverage: ratio(agree + disagree + hidden, leveled),
    },
  };
}
