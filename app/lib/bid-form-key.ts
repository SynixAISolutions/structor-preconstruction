// An MCN bid form, read from its PDF text into an answer key for checking what the AI proposes for
// a trade (C9). The form lists the trade's specification sections (A), the numbered scope lines it
// must include (B), what it excludes (C), and its cost and quantity breakdown. Only the layout is
// encoded here; the forms themselves are client documents and stay outside the repository.

export type KeyItemKind = "scope" | "reference" | "header" | "general";
export type KeyItem = {
  /** "B-46", "C-1"; unnumbered lines get "B-*1", "B-*2", … */
  id: string;
  part: "inclusion" | "exclusion";
  kind: KeyItemKind;
  /** The line as printed (a "- " list entry without its dash). */
  text: string;
  /** What matching compares: the line, or for a "- " entry, its parent line plus the entry. */
  matchText: string;
  /** The heading the line sits under ("Gypsum Board"), or "". */
  group: string;
  /** The form's desired response: Y, N, or "" when none is printed. */
  response: "Y" | "N" | "";
  /** Text after the response, e.g. "By Others". */
  note: string;
};
export type KeySection = { number: string; title: string; response: "Y" | "" };
export type BreakdownLine = { kind: "cost" | "quantity"; label: string; unit: string };
export type BidFormKey = { trade: string; divisions: { number: string; title: string }[]; sections: KeySection[]; items: KeyItem[]; breakdown: BreakdownLine[] };

const NOISE = [/^Project:/i, /^Bid Date:/i, /^Trade:/i, /^Rev\/Date:/i, /^Contact:/i, /^Email:/i, /^Phone:/i, /^Subcontractor:\s*_*/i,
  /^Scope Items to include,?$/i, /^but not necessarily limi?t?ed to the following:?$/i, /^(Desired|Scope|Response|\/ ?Comment)$/i];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const title = (s: string) => clean(s.replace(/\(as applicable to this Bid Package\)/i, ""));

/** Reads the form's text (all pages, in order). */
export function parseBidForm(text: string): BidFormKey {
  const lines = text.split(/\r?\n/).map(clean).filter(l => l && !NOISE.some(n => n.test(l)));
  const key: BidFormKey = { trade: "", divisions: [], sections: [], items: [], breakdown: [] };
  const tradeLine = text.match(/Trade:\s*(.+)/i);
  key.trade = tradeLine ? clean(tradeLine[1]) : "";

  let part: "general" | "breakdown" | "specifications" | "inclusions" | "exclusions" | "other" = "general";
  // An open numbered line: its number, and text gathered until its response or the next number.
  let open: { id: string; text: string[] } | null = null;
  let group = "", parent = "", unnumbered = 0;

  const close = (response: "Y" | "N" | "" = "", note = "") => {
    if (!open || (part !== "inclusions" && part !== "exclusions")) { open = null; return; }
    const raw = clean(open.text.join(" "));
    const id = open.id;
    open = null;
    if (!raw) return;
    const isChild = raw.startsWith("- ");
    const text = isChild ? clean(raw.slice(2)) : raw;
    const headerLike = /:$/.test(text) || (!response && !isChild);
    const kind: KeyItemKind = /^refer to\b/i.test(text) ? "reference"
      : headerLike || /^[A-Z][A-Z ]+$/.test(text) ? "header"
      : /^furnish and install all items/i.test(text) ? "general" : "scope";
    // A short heading ("Gypsum Board:") names the group. A long lead-in ("Wood or sheet metal in-wall
    // blocking, including … the following:") is the context its lines need: "At toilet accessories"
    // means nothing alone, so those lines are matched with the lead-in in front of them.
    if (kind === "header") {
      if (text.split(" ").length <= 5) { group = text.replace(/:$/, ""); parent = ""; } else parent = text.replace(/:$/, "");
    }
    key.items.push({
      id, part: part === "exclusions" ? "exclusion" : "inclusion", kind, text,
      matchText: kind === "scope" && parent ? `${parent} ${text}` : text,
      group, response, note,
    });
  };

  for (const line of lines) {
    if (/^Section \d+\s*-\s*Bid Breakdown/i.test(line)) { close(); part = "breakdown"; continue; }
    if (/^Section \d+\s*-/i.test(line)) { close(); part = "other"; continue; }
    const marker = line.match(/^([A-D])\s+(Specifications|Inclusions|Exclusions|Schedule)$/i);
    if (marker) {
      close();
      const name = marker[2].toLowerCase();
      part = name === "specifications" || name === "inclusions" || name === "exclusions" ? name : "other";
      group = ""; parent = "";
      continue;
    }
    if (/^(Allowances|Alternates|Unit Prices)$/i.test(line)) { close(); part = "other"; continue; }

    if (part === "breakdown") {
      const m = line.match(/^\d+\s+(.+?)\s+#\s+(\$|[A-Z]{1,3}(?:\/[A-Z]{1,3})?)$/);
      if (m && !/^base bid$/i.test(m[1])) key.breakdown.push({ kind: m[2] === "$" ? "cost" : "quantity", label: clean(m[1]), unit: m[2] === "$" ? "USD" : m[2] });
      continue;
    }
    if (part === "specifications") {
      const division = line.match(/^Division (\d{2})\s*-\s*(.+?)(?:\s+Y)?$/i);
      if (division) { key.divisions.push({ number: division[1], title: title(division[2]) }); continue; }
      const section = line.match(/^(\d{2}) ?(\d{2}) ?(\d{2})\s*-\s*(.+?)(\s+Y)?$/);
      if (section) key.sections.push({ number: `${section[1]} ${section[2]} ${section[3]}`, title: title(section[4]), response: section[5] ? "Y" : "" });
      continue;
    }
    if (part !== "inclusions" && part !== "exclusions") continue;

    const numbered = line.match(/^(\d+)(?:\s+(.*))?$/);
    const starred = line.match(/^\*\*\s*(.*)$/);
    if (numbered || starred) {
      close();
      open = { id: numbered ? `${part === "exclusions" ? "C" : "B"}-${numbered[1]}` : `B-*${++unnumbered}`, text: [] };
    } else if (!open) {
      open = { id: `${part === "exclusions" ? "C" : "B"}-*${++unnumbered}`, text: [] };
    }
    let body = numbered ? numbered[2] ?? "" : starred ? starred[1] : line;
    const exclusion = part === "exclusions" ? body.match(/^(.*?)\s+N(?:\s+(.+))?$/) : null;
    if (exclusion) { open!.text.push(exclusion[1]); close("N", clean(exclusion[2] ?? "")); continue; }
    if (body === "Y" || /\s+Y$/.test(body)) { body = body.replace(/\s*Y$/, ""); open!.text.push(body); close("Y"); continue; }
    open!.text.push(body);
  }
  close();
  return key;
}

/** The lines a trade must cover: scope lines with a Y, not drawing references, headings or the "furnish all" preamble. */
export const scopeLines = (key: BidFormKey): KeyItem[] => key.items.filter(i => i.part === "inclusion" && i.kind === "scope" && i.response === "Y");
/** The form's explicit exclusions ("N By Others"). */
export const exclusionLines = (key: BidFormKey): KeyItem[] => key.items.filter(i => i.part === "exclusion" && i.response === "N");
