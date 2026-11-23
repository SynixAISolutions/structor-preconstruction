// The scope scoreboard (Danial, 23 Nov: "will doing that make it more accurate and better at getting scopes and bid
// forms?" → "Build the score and run 3 trades"). It measures the AI's scope lines for a trade against the bid form the
// contractor wrote by hand for the same project, so accuracy is a number rather than an impression:
//
//   found       the contractor's own scope lines (Section 3, B Inclusions) the AI has a line for
//   missed      the ones it has none for
//   excluded    AI lines that match what the contractor's form excludes (Section 3, C Exclusions): wrong-trade work
//   sections    the contractor's specification sections for the trade (Section 3, A Specifications) the AI's lines cite
//   other lines AI lines matching nothing on the form: finer detail of the same work, or work the form doesn't list
//
// Headers ("Sheathing:", "SPECIFIC SCOPE ITEMS"), pointers ("Refer to partition types on Drawing A8.1") and the general
// lines every trade carries ("Provide all equipment, material, labor") are set aside: the AI's General scope covers
// those. Matching is by the words that carry meaning, with the trade's own synonyms (demolish, remove and raze are one
// verb; gypsum board, drywall and GWB one material): a contractor line is found when one AI line holds at least half of
// its meaningful words. Pure; scripts/score-scopes.mjs reads the bid sheet and the AI's run.

export type KeyLine = { n: string; text: string; group: string };
/** `sectionTitles`: each listed section's title as the form gives it ("05 40 00" → "Cold-Formed Metal Framing"). */
export type TradeKey = { tab: string; trade: string; sections: string[]; sectionTitles: Record<string, string>; divisions: string[]; inclusions: KeyLine[]; general: KeyLine[]; references: KeyLine[]; exclusions: KeyLine[] };
export type AiLine = { id: string; title: string; detail: string; source: string };
export type LineMatch = { key: KeyLine; best: AiLine | null; coverage: number; shared: string[] };
export type TradeScore = {
  tab: string; trade: string;
  found: LineMatch[]; missed: LineMatch[];
  /** AI lines matching one of the form's exclusions. */
  excluded: { line: AiLine; exclusion: KeyLine; shared: string[] }[];
  sections: { cited: string[]; missed: string[]; notOnForm: string[] };
  /** AI lines that match no contractor line. */
  other: AiLine[];
  aiLines: number;
};

const cell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * One trade tab of the contractor's bid sheet, as rows of cells (SheetJS header: 1): its Section 3 specification list,
 * inclusions (sorted into scope lines, general lines, pointers and headers) and exclusions.
 */
export function readTradeTab(tab: string, rows: unknown[][]): TradeKey {
  const key: TradeKey = { tab, trade: "", sections: [], sectionTitles: {}, divisions: [], inclusions: [], general: [], references: [], exclusions: [] };
  const tradeRow = rows.find(r => /^trade:?$/i.test(cell(r[0])));
  key.trade = tradeRow ? cell(tradeRow.slice(1).find(c => cell(c))) : tab;
  const start = rows.findIndex(r => r.some(c => /^Section 3\b/i.test(cell(c))));
  if (start < 0) return key;
  let part = "", group = "";
  for (const row of rows.slice(start + 1)) {
    const n = cell(row[0]), text = cell(row[1]);
    if (/^[A-Z]$/.test(n)) { part = text.toLowerCase(); group = ""; continue; }
    if (/^(allowances|alternates|unit prices)$/i.test(text) || part.startsWith("schedule")) break;
    if (!text) continue;
    if (part.startsWith("specification")) {
      const section = text.match(/^(\d{2}) ?(\d{2}) ?(\d{2})\b/);
      const division = text.match(/^Division (\d{1,2})\b/i);
      if (section && `${section[1]}${section[2]}${section[3]}` !== "000000") { const code = `${section[1]} ${section[2]} ${section[3]}`; key.sections.push(code); key.sectionTitles[code] = text.replace(/^\d{2} ?\d{2} ?\d{2}\s*[-–:]?\s*/, "").replace(/\s*\(as applicable[^)]*\)\s*$/i, "").trim(); }
      else if (division) key.divisions.push(division[1].padStart(2, "0"));
      continue;
    }
    if (part.startsWith("exclusion")) { key.exclusions.push({ n, text, group: "" }); continue; }
    if (!part.startsWith("inclusion")) continue;
    const letters = text.replace(/[^A-Za-z]/g, "");
    // Headings: "Sheathing:", "SPECIFIC SCOPE ITEMS", and short Title Case names ("Hollow Metal Doors", "Door Hardware").
    const titleCase = (/^([A-Z][A-Za-z/&-]*\s?){1,4}$/.test(text) && !/[.,;]/.test(text)) || /^(standard\s*\/\s*)?general scope( of work)?$/i.test(text);
    if (text.endsWith(":") || (letters.length >= 3 && letters === letters.toUpperCase()) || titleCase) { group = text.replace(/:$/, ""); continue; }
    if (/^furnish (and|&) install all items/i.test(text) || n === "**") continue;
    const line = { n, text, group };
    if (/^refer to\b/i.test(text) || /manufacturer|basis of design/i.test(group)) key.references.push(line);
    else if (/general scope/i.test(group)) key.general.push(line);
    else key.inclusions.push(line);
  }
  return key;
}

// ── Words that carry meaning ──

const STOP = new Set(("a an the and or of to for in on at as per all any each with by be is are this that these those from into its their your our " +
  "shown indicated required requirements specified specification specifications drawing drawings document documents contract plans plan " +
  "work works provide provided providing furnish furnished install installed installing installation include includes included including " +
  "perform conduct ensure assure etc uon uno unless otherwise noted where as necessary needed per applicable item items scope trade subcontractor " +
  "new existing complete completed full fully proper properly appropriate similar such other others also only within throughout").split(/\s+/));
/** One word for each family of words a scope line uses for the same thing. */
const SAME: [RegExp, string][] = [
  [/^(demolish|demolished|demolishing|demolition|demo|raze|razed|razing|remove|removed|removal|removing|haul|hauled|hauling|dispose|disposal)$/, "remove"],
  [/^(gypsum|gwb|drywall|gyp|sheetrock)$/, "gypsum"],
  [/^(stud|studs|framing|frame|frames|framed)$/, "frame"],
  [/^(door|doors)$/, "door"], [/^(window|windows|glazing|glazed)$/, "window"],
  [/^(hm|hollow)$/, "hollow"], [/^(hardware|hdw)$/, "hardware"],
  [/^(salvage|salvaged|salvaging|reuse|reusable)$/, "salvage"],
  [/^(protect|protection|protecting|protected)$/, "protect"],
  [/^(insulation|insulate|insulated|batt|batts)$/, "insulation"],
  [/^(sealant|sealants|seal|sealing|caulk|caulking)$/, "sealant"],
  [/^(mep|mechanical|electrical|plumbing)$/, "mep"],
  [/^(ceiling|ceilings|soffit|soffits|bulkhead|bulkheads)$/, "ceiling"],
  [/^(finish|finishes|finishing|finished)$/, "finish"],
];
const stem = (w: string) => w.length > 4 ? w.replace(/ies$/, "y").replace(/(sses|ches|shes|xes)$/, m => m.slice(0, -2)).replace(/([^s])s$/, "$1") : w;

/** The meaningful words of a line, in their family form. */
export function words(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/&/g, " and ").match(/[a-z0-9]+/g) ?? []) {
    if (STOP.has(raw) || /^\d+$/.test(raw) || raw.length < 2) continue;
    const family = SAME.find(([re]) => re.test(raw))?.[1] ?? stem(raw);
    if (!STOP.has(family)) out.add(family);
  }
  return [...out];
}

/** How much of a contractor line one AI line holds: the share of the contractor line's meaningful words it has. */
export function coverage(keyText: string, ai: AiLine): { coverage: number; shared: string[] } {
  const k = words(keyText), a = new Set(words(`${ai.title} ${ai.detail}`));
  const shared = k.filter(w => a.has(w));
  return { coverage: k.length ? shared.length / k.length : 0, shared };
}

/** A contractor line counts as found when one AI line holds at least half its meaningful words, and at least two of them (one for a line of two words or fewer). */
export const FOUND_AT = 0.5;
const enough = (keyText: string, c: { coverage: number; shared: string[] }) => c.coverage >= FOUND_AT && c.shared.length >= Math.min(2, words(keyText).length);

const SECTION_IN = /\b(\d{2}) ?(\d{2}) ?(\d{2})\b/;

export function scoreTrade(key: TradeKey, ai: AiLine[]): TradeScore {
  const best = (text: string): LineMatch["best"] extends infer B ? { best: AiLine | null; coverage: number; shared: string[] } : never => {
    let top = { best: null as AiLine | null, coverage: 0, shared: [] as string[] };
    for (const line of ai) { const c = coverage(text, line); if (c.coverage > top.coverage || (c.coverage === top.coverage && c.shared.length > top.shared.length)) top = { best: line, ...c }; }
    return top;
  };
  const matches = key.inclusions.map(k => ({ key: k, ...best(k.text) }));
  const found = matches.filter(m => m.best && enough(m.key.text, m)), missed = matches.filter(m => !found.includes(m));
  // An exclusion about installing ("Installation of doors, frames and hardware": the trade furnishes only) holds against a
  // line only when that line installs; the filler-word list would otherwise drop the one word that matters.
  const installs = (text: string) => /\binstall/i.test(text);
  const excluded = ai.flatMap(line => {
    const hit = key.exclusions.map(e => ({ exclusion: e, ...coverage(e.text, line) }))
      .filter(e => enough(e.exclusion.text, e) && (!installs(e.exclusion.text) || installs(`${line.title} ${line.detail}`))).sort((a, b) => b.coverage - a.coverage)[0];
    return hit ? [{ line, exclusion: hit.exclusion, shared: hit.shared }] : [];
  });
  const supported = new Set(found.map(m => m.best!.id));
  // Also count an AI line as on the form when it holds half of any contractor line's words, even if another line was that line's best.
  for (const line of ai) if (key.inclusions.some(k => enough(k.text, coverage(k.text, line)))) supported.add(line.id);
  const cited = [...new Set(ai.flatMap(l => { const m = l.source.match(SECTION_IN); return m ? [`${m[1]} ${m[2]} ${m[3]}`] : []; }))].sort();
  const onForm = (s: string) => key.sections.includes(s) || key.divisions.includes(s.slice(0, 2));
  return {
    tab: key.tab, trade: key.trade, found, missed, excluded,
    sections: { cited: cited.filter(onForm), missed: key.sections.filter(s => !cited.includes(s)), notOnForm: cited.filter(s => !onForm(s)) },
    other: ai.filter(l => !supported.has(l.id) && !excluded.some(e => e.line.id === l.id)), aiLines: ai.length,
  };
}

const pct = (a: number, b: number) => b ? `${a} of ${b} (${Math.round((100 * a) / b)}%)` : "none on the form";

/** The scoreboard as Markdown: a summary table, then each trade's found, missed and excluded lines. */
export function scoreReport(scores: TradeScore[], title: string): string {
  const total = (pick: (s: TradeScore) => number) => scores.reduce((n, s) => n + pick(s), 0);
  const lines = [
    `# ${title}`, "",
    "| Trade | Contractor's lines found | AI lines on excluded work | Spec sections cited | AI lines | AI lines not on the form |",
    "|---|---|---|---|---|---|",
    ...scores.map(s => `| ${s.trade} | ${pct(s.found.length, s.found.length + s.missed.length)} | ${s.excluded.length} | ${pct(s.sections.cited.length, s.sections.cited.length + s.sections.missed.length)} | ${s.aiLines} | ${s.other.length} |`),
    `| **All** | **${pct(total(s => s.found.length), total(s => s.found.length + s.missed.length))}** | **${total(s => s.excluded.length)}** | | **${total(s => s.aiLines)}** | **${total(s => s.other.length)}** |`,
    "",
  ];
  for (const s of scores) {
    lines.push(`## ${s.trade} (${s.tab})`, "");
    lines.push(`### Found (${s.found.length})`, ...s.found.map(m => `- ${m.key.text}\n  - AI: ${m.best!.title} [${Math.round(m.coverage * 100)}%: ${m.shared.join(", ")}]`), "");
    lines.push(`### Missed (${s.missed.length})`, ...s.missed.map(m => `- ${m.key.text}${m.best ? `\n  - closest AI line: ${m.best.title} [${Math.round(m.coverage * 100)}%]` : ""}`), "");
    if (s.excluded.length) lines.push(`### On excluded work (${s.excluded.length})`, ...s.excluded.map(e => `- AI: ${e.line.title}\n  - excluded on the form: ${e.exclusion.text}`), "");
    lines.push(`### Specification sections`, `- cited and on the form: ${s.sections.cited.join(", ") || "none"}`, `- on the form, not cited: ${s.sections.missed.join(", ") || "none"}`, `- cited, not on the form: ${s.sections.notOnForm.join(", ") || "none"}`, "");
    lines.push(`### AI lines not on the form (${s.other.length})`, ...s.other.map(l => `- ${l.title}${l.source ? ` (${l.source})` : ""}`), "");
  }
  return lines.join("\n");
}
