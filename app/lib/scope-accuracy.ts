// How well the AI's scope findings for a trade cover the contractor's own bid form (C9).
//
// Exact where it can be: which of the form's specification sections the findings cite. Cautious
// where it can't: whether a finding covers a scope line is decided by shared distinctive words
// (construction synonyms folded together, common bid-form words ignored, rarer words weighted
// more). Word overlap can pair unrelated lines, so a line counts as "matched" only with two or more
// distinctive words in common and a high score; a weaker pairing is "possible" and needs a person
// to confirm it; the rest is "missed". Findings that pair with no line are "extra" (not
// necessarily wrong: the form is not the whole specification), and findings that pair with one of
// the form's exclusions are "conflicts". The numbers are for comparing runs and prompts; the line
// list is for a person to check.

import { exclusionLines, scopeLines, type BidFormKey, type KeyItem } from "./bid-form-key";

export type FindingLike = { id: string; title: string; detail: string; source: string; status?: string };
export type Verdict = "matched" | "possible" | "missed";
/** `shared`: the distinctive words both say; `of`: how many distinctive words the line has. */
export type Pairing = { lineId: string; findingId: string; score: number; shared: string[]; of: number };

/** The score and evidence rules, exported so a run can be re-scored with others. */
export const THRESHOLDS = { matched: 0.4, possible: 0.2, matchedShared: 2, possibleShared: 1, distinctiveShare: 0.25 };

// Phrases for the same thing, folded to one token before words are split.
const SYNONYMS: [RegExp, string][] = [
  [/\bgyp(?:sum)?\.? ?(?:wall ?)?board\b|\bgwb\b|\bdrywall\b/g, " gypsumboard "],
  [/\bacoustic(?:al)? (?:panel |tile )?ceilings?\b|\bacoustic(?:al)? (?:ceiling )?(?:tiles?|panels?)\b|\bceiling tiles?\b|\bact\b|\bacp-?\d*\b/g, " acousticalceiling "],
  [/\bfrp(?:-\d+)?\b|\bfiberglass[- ]reinforced (?:plastic|panels?)\b|\bplastic panel(?:ing|s)?\b/g, " frp "],
  [/\bsound[- ]absorbing (?:wall )?(?:units?|panels?)\b|\bsaw-?\d+\b/g, " soundpanel "],
  [/\bcorner guards?\b|\bcgd-?\d*\b/g, " cornerguard "],
  [/\bcold[- ]formed metal framing\b|\bcfmf\b|\bnon[- ]structural (?:metal|steel) framing\b|\b(?:metal|steel) studs?\b|\bstud framing\b|\bmetal framing\b/g, " metalframing "],
  [/\bfire[- ]?stopping\b|\bfirestops?\b/g, " firestopping "],
  [/\bsound attenuation (?:blankets?|batts?|insulation)\b/g, " soundblanket "],
  [/\bshaft ?walls?\b/g, " shaftwall "],
  [/\bin[- ]wall blocking\b/g, " blocking "],
  [/\bjoint (?:compound|treatment)\b|\btape(?:d)?,? (?:and |& )?(?:spackle|finish|sand)\b/g, " jointtreatment "],
  [/\blevel ([0-5])\b/g, " level$1 "],
  [/\bhollow metal\b/g, " hollowmetal "],
  [/\bvapor (?:barrier|retarder)\b/g, " vaporbarrier "],
];
const STOP = new Set((
  "a an the and or of to for in on at by with as per all any be is are shall will from into this that these those each such other others " +
  "work include includes including included provide provided provides furnish furnished install installed installation installing " +
  "required require requirements requirement indicated shown noted scheduled schedule where contract document documents drawing drawings " +
  "specification specifications section sections item items etc system systems complete necessary applicable accordance comply following " +
  "unless otherwise uno uon also not but limited only proper properly bod basis design type types " +
  // Pointers to where the requirement is drawn, not the requirement itself.
  "rcp rcps plan plans elevation elevations detail details"
).split(" "));

const stem = (w: string) => w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;

/** Lower-cased, synonyms folded, common words dropped, simple plurals singular; each word once. */
export function terms(text: string): string[] {
  let t = ` ${text.normalize("NFKC").toLowerCase()} `;
  for (const [pattern, token] of SYNONYMS) t = t.replace(pattern, token);
  return [...new Set(t.split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem))];
}

const findingText = (f: FindingLike) => `${f.title} ${f.detail}`;
/** "09 29 00 · §3.6" → "09 29 00"; null when the source names no section. */
export const sectionOf = (source: string): string | null => source.match(/^(\d{2} \d{2} \d{2})/)?.[1] ?? null;

/** Pairs every key line with every finding; idf and distinctiveness come from all of them together. */
function scorer(lines: KeyItem[], findings: FindingLike[]) {
  const lineTerms = new Map(lines.map(l => [l.id, terms(l.matchText)]));
  const findingTerms = new Map(findings.map(f => [f.id, terms(findingText(f))]));
  const docs = [...lineTerms.values(), ...findingTerms.values()];
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => Math.log(1 + docs.length / (df.get(t) ?? 1));
  const distinctive = (t: string) => (df.get(t) ?? 0) <= Math.max(2, THRESHOLDS.distinctiveShare * docs.length);
  const weight = (ts: string[]) => ts.reduce((s, t) => s + idf(t), 0);
  return (line: KeyItem, finding: FindingLike): Pairing => {
    const a = lineTerms.get(line.id)!, b = findingTerms.get(finding.id)!;
    const shared = a.filter(t => b.includes(t));
    const wa = weight(a), wb = weight(b), ws = weight(shared);
    const recall = wa ? ws / wa : 0, precision = wb ? ws / wb : 0;
    // F2: covering the line's words matters more than the finding saying nothing else.
    const score = recall + precision ? (5 * precision * recall) / (4 * precision + recall) : 0;
    return { lineId: line.id, findingId: finding.id, score: Math.round(score * 1000) / 1000, shared: shared.filter(distinctive), of: a.filter(distinctive).length };
  };
}

const verdictOf = (p: Pairing | null): Verdict =>
  !p ? "missed"
  // Two distinctive words in common, or every one a short line has ("acoustical ceilings").
  : p.score >= THRESHOLDS.matched && p.shared.length >= Math.min(THRESHOLDS.matchedShared, Math.max(1, p.of)) ? "matched"
  : p.score >= THRESHOLDS.possible && p.shared.length >= THRESHOLDS.possibleShared ? "possible" : "missed";

export type LineResult = { item: KeyItem; verdict: Verdict; best: Pairing | null };
export type SectionResult = { number: string; title: string; listedWithY: boolean; read: boolean | null; findings: number };
export type AccuracyReport = {
  sections: SectionResult[];
  /** Sections the findings cite that the form does not list. */
  otherSections: { number: string; findings: number }[];
  lines: LineResult[];
  groups: { group: string; lines: number; matched: number; possible: number }[];
  extras: { finding: FindingLike; best: Pairing | null }[];
  conflicts: { finding: FindingLike; exclusion: KeyItem; pairing: Pairing }[];
  summary: {
    scopeLines: number; matched: number; possible: number; missed: number;
    /** matched / lines, and (matched + possible) / lines: the confirmed and the most the run can claim. */
    recall: number; recallIfPossibleConfirmed: number;
    findings: number; findingsPaired: number; extras: number; conflicts: number;
    sectionsListed: number; sectionsCited: number; sectionsRead: number | null;
  };
};

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);

/**
 * Scores findings against a bid form. `readSections`: the sections the run was given, if known, so a
 * section with no findings can be told apart from one never read. Rejected findings are left out
 * unless `includeRejected` (to score the AI's raw output rather than what survived review).
 */
export function scoreScope(key: BidFormKey, allFindings: FindingLike[], options: { readSections?: string[]; includeRejected?: boolean } = {}): AccuracyReport {
  const findings = options.includeRejected ? allFindings : allFindings.filter(f => f.status !== "rejected");
  const lines = scopeLines(key), exclusions = exclusionLines(key);
  const score = scorer([...lines, ...exclusions], findings);
  const best = (line: KeyItem): Pairing | null => findings.map(f => score(line, f)).sort((a, b) => b.score - a.score || b.shared.length - a.shared.length)[0] ?? null;

  const lineResults: LineResult[] = lines.map(item => { const b = best(item); return { item, best: b, verdict: verdictOf(b) }; });
  // A finding is paired when it covers any line well enough, even if another finding covers that line better.
  const topLine = (finding: FindingLike): Pairing | null =>
    lines.map(l => score(l, finding)).sort((a, b) => Number(verdictOf(b) !== "missed") - Number(verdictOf(a) !== "missed") || b.score - a.score)[0] ?? null;
  const tops = new Map(findings.map(f => [f.id, topLine(f)]));
  const paired = new Set(findings.filter(f => verdictOf(tops.get(f.id)!) !== "missed").map(f => f.id));
  const extras = findings.filter(f => !paired.has(f.id)).map(finding => ({ finding, best: tops.get(finding.id)! }));
  const conflicts = findings.flatMap(finding => exclusions.flatMap(exclusion => {
    const pairing = score(exclusion, finding);
    return verdictOf(pairing) === "matched" ? [{ finding, exclusion, pairing }] : [];
  }));

  const cited = new Map<string, number>();
  for (const f of findings) { const s = sectionOf(f.source); if (s) cited.set(s, (cited.get(s) ?? 0) + 1); }
  const read = options.readSections ? new Set(options.readSections) : null;
  const sections = key.sections.map(s => ({ number: s.number, title: s.title, listedWithY: s.response === "Y", read: read ? read.has(s.number) : null, findings: cited.get(s.number) ?? 0 }));
  const otherSections = [...cited.entries()].filter(([n]) => !key.sections.some(s => s.number === n)).map(([number, n]) => ({ number, findings: n })).sort((a, b) => a.number.localeCompare(b.number));

  const groupNames = [...new Set(lines.map(l => l.group))];
  const groups = groupNames.map(group => {
    const inGroup = lineResults.filter(l => l.item.group === group);
    return { group, lines: inGroup.length, matched: inGroup.filter(l => l.verdict === "matched").length, possible: inGroup.filter(l => l.verdict === "possible").length };
  });
  const matched = lineResults.filter(l => l.verdict === "matched").length, possible = lineResults.filter(l => l.verdict === "possible").length;
  return {
    sections, otherSections, lines: lineResults, groups, extras, conflicts,
    summary: {
      scopeLines: lines.length, matched, possible, missed: lines.length - matched - possible,
      recall: ratio(matched, lines.length), recallIfPossibleConfirmed: ratio(matched + possible, lines.length),
      findings: findings.length, findingsPaired: paired.size, extras: extras.length, conflicts: conflicts.length,
      sectionsListed: key.sections.length, sectionsCited: sections.filter(s => s.findings > 0).length,
      sectionsRead: read ? sections.filter(s => s.read).length : null,
    },
  };
}
