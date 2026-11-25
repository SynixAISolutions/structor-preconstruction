// What a trade writes from a section it reads only for its part (lib/memory rememberedSections "partial": on Marcel's
// bid forms Drywall installs the doors, hardware, toilet accessories and fire extinguisher cabinets that other trades
// furnish, so it reads 08 11 13, 08 71 00, 10 28 00 and 10 44 13 for that part). The AI is told so, and still wrote
// "Furnish and install toilet accessories and grab bars" and, from a checklist's boilerplate, "Factory priming of the
// hollow-metal Work" (Whittier Drywall, 25 Nov). In such a section the trade's lines are install lines:
//   - "Furnish and install X" (or provide/supply and install) becomes "Install X", furnished by others;
//   - a line to furnish or supply only, or to fabricate, manufacture or factory/shop finish, is the supplier's: left out.
// Coordination, examination and preparation lines stay as written. Pure; lib/scope-reading applies it to every line.

import type { Dropped } from "./ai-jobs";
import type { DraftInput } from "./extraction";

const SECTION = /^(\d{2}) ?(\d{2}) ?(\d{2})/;
/** The specification section a line was read from: its source's section number ("08 11 13 · §3.2", "10 28 00 · your bid forms"). */
const sectionOf = (source: string) => { const m = SECTION.exec(source.trim()); return m ? `${m[1]} ${m[2]} ${m[3]}` : null; };
const FURNISH_AND_INSTALL = /^(?:furnish|provide|supply)\s+(?:and|&)\s+install\b\s*/i;
const SUPPLY_ONLY = /^(?:furnish|supply)\b(?!\s+(?:and|&)\s+install)/i;
const SUPPLIERS_WORK = /\b(?:factory|shop)[- ]?(?:prim|finish|paint|appl)\w*|\bfabricat\w*|\bmanufactur\w*/i;
/**
 * The trade's own work at an item (run 14: "Furnish and install in-wall blocking at toilet accessories" became "Install
 * … Furnished by others"): blocking, backing, framing, recesses and openings stay as written, whoever furnishes the item.
 */
const OWN_WORK_AT = /\b(?:blocking|backing|grounds?|nailers?|reinforc\w*|framing|framed|studs?|recess\w*|openings?|cut-?outs?|supports?)\b/i;

/**
 * The trade's lines from sections it reads only in part (`partOnly`, section numbers), kept to install work, as described
 * at the top. A line left out takes its highlights and quantity with it. `rewritten`: the lines turned into install lines.
 */
export function keepToPart(drafts: DraftInput[], pkg: { id: string; name: string }, partOnly: string[]): { drafts: DraftInput[]; dropped: Dropped[]; rewritten: number } {
  const part = new Set(partOnly.map(s => sectionOf(s)).filter(Boolean));
  if (!part.size) return { drafts, dropped: [], rewritten: 0 };
  const dropped: Dropped[] = [], gone = new Set<string>();
  let rewritten = 0;
  const kept = drafts.map(d => {
    if (d.kind !== "scope" || d.packageId !== pkg.id) return d;
    const section = sectionOf(d.source);
    if (!section || !part.has(section) || OWN_WORK_AT.test(d.title)) return d;
    if (SUPPLIERS_WORK.test(d.title) || SUPPLY_ONLY.test(d.title)) {
      gone.add(d.key);
      dropped.push({ what: d.title, reason: `${pkg.name} reads ${section} only for its part (installing what others furnish), so supplying, fabricating or factory finishing is left to the supplier.` });
      return d;
    }
    if (!FURNISH_AND_INSTALL.test(d.title)) return d;
    rewritten++;
    const rest = d.title.replace(FURNISH_AND_INSTALL, "");
    return { ...d, title: `Install ${rest}`, detail: [d.detail.trim(), "Furnished by others."].filter(Boolean).join(" ") };
  });
  return {
    drafts: kept.filter(d => !gone.has(d.key) && !(d.kind === "region" && d.scopeKeys?.some(k => gone.has(k))) && !(d.kind === "quantity" && d.scopeKey && gone.has(d.scopeKey))),
    dropped, rewritten,
  };
}
