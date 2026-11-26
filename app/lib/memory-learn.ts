// What the AI memory learns from the estimators' corrections (lib/memory). Every correction a person makes while
// reviewing scopes becomes a proposed entry, waiting for an estimator to approve it before any scan reads it:
//
//   a line moved to another trade          rule      Put "<line>" in <trade>, not <other trade>.
//   an AI proposal moved to another trade  rule      the same, from the proposal's history
//   an AI proposal rejected as wrong trade rule      "<line>" is not <trade> work.
//   an AI proposal rejected as not needed  rule      for that project only: Leave out "<line>" unless ...
//   an AI proposal reworded, then accepted example   the estimator's wording, the AI's in the detail
//   a section assigned to a trade          assignment  <trade> carries <section> (Section coverage, Assign to a trade)
//   a section split between trades         rule      Section <n> is split: <trade> carries <portion>; ...
//
// Moves and decisions by Structor AI itself teach nothing, and neither do moves made by combining two trades (the old
// trade is gone), duplicates, or the built-in illustrative run of the sample project. Each correction has a fixed id, so sending the same ones again changes nothing.
// Pure: the Scopes screen runs it on its records (lib/use-memory-learner) and the server stores what comes back.

import { AI_ACTOR, type ExtractionState } from "./extraction";
import type { MemoryInput } from "./memory";
import { tradeTags } from "./memory";
import type { Procurement, TradePackage } from "./procurement";
import type { CoverageDecisions } from "./section-coverage";

export type Correction = MemoryInput & { events: [string] };

const quoted = (title: string) => `"${title.replace(/\s+/g, " ").trim().replace(/[.;:]+$/, "").slice(0, 200)}"`;
const by = (who: string) => !!who.trim() && who.trim() !== AI_ACTOR;

/** `decisions`: the project's Section coverage decisions (its recorded splits). */
export function correctionsFrom(projectId: string, procurement: Procurement, extraction: ExtractionState, decisions: CoverageDecisions = {}): Correction[] {
  const pkg = (id: string): TradePackage | undefined => procurement.packages.find(p => p.id === id);
  const out: Correction[] = [];

  // Sections an estimator gave a trade in Section coverage (Assign to a trade adds "<title> (Section 07 27 26)").
  for (const item of procurement.scopes) {
    const m = item.origin === "specification" && !item.allTrades ? item.title.match(/^(.*) \(Section (\d{2} \d{2} \d{2}(?:\.\d{1,2})?)\)$/) : null;
    const there = pkg(item.packageId), made = item.history[0];
    if (!m || !there || !made || made.kind !== "created" || !by(made.by)) continue;
    out.push({ kind: "assignment", origin: "correction", text: `${there.name} carries ${m[2]} ${m[1]}.`, section: m[2], trades: tradeTags(there), projectId: null,
      events: [`assign:${projectId}:${item.id}`], source: { projectId, line: item.id, trade: there.name } });
  }
  // Sections split between trades, with each trade's part.
  for (const decision of Object.values(decisions)) {
    if (decision.kind !== "split" || !by(decision.by)) continue;
    const parts = decision.parts.map(p => ({ pkg: pkg(p.packageId), portion: p.portion.trim() })).filter((p): p is { pkg: TradePackage; portion: string } => !!p.pkg && !!p.portion);
    if (parts.length < 2) continue;
    out.push({ kind: "rule", origin: "correction", text: `Section ${decision.section} is split: ${parts.map(p => `${p.pkg.name} carries ${p.portion}`).join("; ")}.`, section: decision.section,
      trades: parts.flatMap(p => tradeTags(p.pkg)), projectId: null, events: [`split:${projectId}:${decision.section}:${decision.at}`], source: { projectId } });
  }
  const moved = (title: string, from: TradePackage, to: TradePackage, event: string, source: Record<string, string>) => out.push({
    kind: "rule", origin: "correction", text: `Put ${quoted(title)} in ${to.name}, not ${from.name}.`,
    trades: [...tradeTags(to), ...tradeTags(from)], projectId: null, events: [event],
    source: { projectId, from: `${from.code} ${from.name}`, to: `${to.code} ${to.name}`, ...source },
  });

  // Bid-form lines moved between trades: the net move, from where the line first was to where it is now, once a
  // person made the last move. A move undone teaches nothing.
  for (const item of procurement.scopes) {
    const moves = item.history.filter(e => e.kind === "moved");
    const first = moves[0], last = moves.at(-1);
    if (!first || !last || first.kind !== "moved" || last.kind !== "moved" || !by(last.by) || last.to !== item.packageId || item.allTrades) continue;
    const from = pkg(first.from), to = pkg(item.packageId);
    if (!from || !to || from.id === to.id) continue; // back where it started, or from a combined trade that is gone
    moved(item.title, from, to, `move:${projectId}:${item.id}:${last.at}`, { line: item.id });
  }

  const sample = new Set(extraction.runs.filter(r => r.engine.mode === "sample").map(r => r.id));
  for (const draft of extraction.drafts) {
    if (draft.kind !== "scope" || sample.has(draft.runId)) continue;
    const there = pkg(draft.packageId);
    if (!there) continue;
    // An AI proposal moved to another trade during review: from the trade the AI put it in to where it is now.
    const moves = draft.history.filter(e => e.kind === "edited" && e.fields.includes("packageId") && e.fromPackage);
    const firstMove = moves[0], lastMove = moves.at(-1);
    if (firstMove?.kind === "edited" && lastMove?.kind === "edited" && by(lastMove.by) && draft.status !== "rejected") {
      const from = pkg(firstMove.fromPackage ?? "");
      if (from && from.id !== there.id) moved(draft.title, from, there, `proposal-move:${projectId}:${draft.id}:${lastMove.at}`, { finding: draft.id });
    }
    // Rejected proposals that say something about the trade or the documents.
    if (draft.status === "rejected" && draft.rejection && draft.reviewedBy && by(draft.reviewedBy) && !draft.removed) {
      const note = draft.rejection.note.trim();
      if (draft.rejection.reason === "wrong-trade") out.push({
        kind: "rule", origin: "correction", text: `${quoted(draft.title)} is not ${there.name} work.`, detail: note,
        trades: tradeTags(there), projectId: null, events: [`reject:${projectId}:${draft.id}`], source: { projectId, finding: draft.id, reason: "Belongs to another trade" },
      });
      if (draft.rejection.reason === "not-required") out.push({
        kind: "rule", origin: "correction", text: `Leave out ${quoted(draft.title)} unless this project's documents call for it.`, detail: note,
        trades: tradeTags(there), projectId, events: [`reject:${projectId}:${draft.id}`], source: { projectId, finding: draft.id, reason: "Not required by the documents" },
      });
    }
    // An AI line reworded by an estimator and accepted: how this contractor words it.
    if (draft.status === "accepted" && draft.original && draft.original.title.trim() !== draft.title.trim()) {
      const edit = [...draft.history].reverse().find(e => e.kind === "edited" && e.fields.includes("title"));
      if (edit && by(edit.by)) out.push({
        kind: "example", origin: "correction", text: draft.title.replace(/\s+/g, " ").trim(), detail: `Instead of the AI's: ${draft.original.title.replace(/\s+/g, " ").trim()}`,
        trades: tradeTags(there), projectId: null, events: [`reword:${projectId}:${draft.id}`], source: { projectId, finding: draft.id },
      });
    }
  }
  return out;
}
