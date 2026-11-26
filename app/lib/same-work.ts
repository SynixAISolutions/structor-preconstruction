// Whether two scope lines of one trade are the same work, written twice (Danial, 25 Nov: 2626 Penn's Demolition had 72
// lines for a 17-line form, because each demolition sheet repeats the same keynotes). A merge must never hide work, so
// every word of one line must be in the other, with the same numbers and tags, places, conditions, and furnish/install:
// "45-minute" isn't "90-minute", "Elevation A" isn't "Elevation B", "install" isn't "furnish and install",
// "foundations" isn't "perimeter columns" (a rule that let a few words differ merged those two). Repeats that need judgement ("walls and windows at the north elevation" and "on the demolition
// plans") are left as they are. Pure: lib/extraction puts a repeat's sources and other wording on the line already there.

/** Words that don't say what the work is. */
const STOP = new Set(("a an and or of to in on at for with per by as be is are was then all any the this that these from shall will must " +
  "shown noted indicated scheduled required necessary applicable provided drawing drawings plan plans sheet sheets note notes " +
  "general keynote keynotes keyed complete including include includes existing also along together its it").split(" "));
/** Words that make two otherwise alike lines different work. */
const PLACE = new Set(("north south east west northeast northwest southeast southwest interior exterior inside outside upper lower first second third fourth fifth sixth " +
  "seventh eighth ninth tenth basement roof rooftop penthouse ground garage parking stair stairs stairway stairwell elevator corridor lobby unit units " +
  "fire rated acoustic acoustical moisture mold impact temporary permanent").split(" "));
const CONDITION = /\b(?:not|no|without|except|excluding|excludes?|excluded|unless|only|by others|if|until|before|after|during)\b/gi;
const SUPPLY = /\b(?:furnish|supply|provide|deliver)/i, INSTALL = /\binstall/i;
const VERB = /^(?:furnish|supply|provide|install|deliver)/;
const stem = (w: string) => w.replace(/(?<=[a-z]{3})ies$/, "y").replace(/(?<=[a-z]{3})(?:ing|ed)$/, "").replace(/(?<=[a-z]{2}[^s])s$/, "");

/** A tag of one letter ("Type A", "Elevation B"): capital, and not a sentence's first word or "A" as an article's. */
const tagsOf = (title: string): string[] => title === title.toUpperCase() ? [] : [...title.matchAll(/(?<=[\s(/-])([A-Z])(?=[\s).,;:/-]|$)/g)].map(m => m[1]);

type Parts = { core: Set<string>; numbers: string; places: string; conditions: string; supply: boolean; install: boolean };
const cache = new Map<string, Parts>();
function partsOf(title: string): Parts {
  const hit = cache.get(title);
  if (hit) return hit;
  const words = title.toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim().split(" ").filter(Boolean);
  const set = (list: string[]) => [...new Set(list)].sort().join(" ");
  const made: Parts = {
    core: new Set(words.filter(w => w.length > 1 && !/\d/.test(w) && !STOP.has(w) && !PLACE.has(w) && !VERB.test(w)).map(stem)),
    numbers: set([...words.filter(w => /\d/.test(w)), ...tagsOf(title)]), places: set(words.filter(w => PLACE.has(w)).map(w => w.replace(/s$/, ""))),
    conditions: set((title.match(CONDITION) ?? []).map(s => s.toLowerCase())), supply: SUPPLY.test(title), install: INSTALL.test(title),
  };
  if (cache.size > 20_000) cache.clear();
  cache.set(title, made);
  return made;
}

const NEGATIVE = /\b(?:not|no|without|except|excluding|excludes?|excluded|by others)\b/gi;
/**
 * Why two lines can't be the same work, however alike they read: their numbers or tags differ, one says what the other
 * leaves out, or one only installs what the other only furnishes. Null when nothing says so.
 */
export function workConflict(a: string, b: string): string | null {
  const x = partsOf(a), y = partsOf(b);
  if (x.numbers && y.numbers && x.numbers !== y.numbers) return "their numbers or tags differ";
  const negative = (t: string) => (t.match(NEGATIVE) ?? []).length > 0;
  if (negative(a) !== negative(b)) return "one of them leaves something out";
  const only = (t: string, p: Parts) => /\bprovide/i.test(t) || (p.supply && p.install) ? "" : p.install ? "install" : p.supply ? "furnish" : "";
  if (only(a, x) && only(b, y) && only(a, x) !== only(b, y)) return "one is only to install, the other only to furnish";
  return null;
}

/** Whether a repeat says anything the kept line doesn't: a word of the work, a place or a condition. */
export function addsWords(kept: string, repeat: string): boolean {
  const x = partsOf(kept), y = partsOf(repeat);
  return x.places !== y.places || x.conditions !== y.conditions || [...y.core].some(w => !x.core.has(w));
}

/** Below this many words that say the work, only lines with exactly the same ones are the same. */
const ENOUGH = 4, SHARE = 0.75;

const sectionOf = (source: string): string => /^\d{2} ?\d{2} ?\d{2}/.exec(source.trim())?.[0].replace(/ /g, "") ?? "";
/** Too few words to say the work without its section: "Shop drawings and samples" of carpet isn't the tile's. */
const GENERAL = 5;

/**
 * Whether two lines are the same work: the same words, or one's words all in the other's (see the top of this file).
 * With their sources, a general line from two specification sections is two lines (each section's submittals, warranty).
 */
export function sameWork(a: string, b: string, sourceA = "", sourceB = ""): boolean {
  const x = partsOf(a), y = partsOf(b);
  if (Math.min(x.core.size, y.core.size) < GENERAL) {
    const sa = sectionOf(sourceA), sb = sectionOf(sourceB);
    if (sa && sb && sa !== sb) return false;
  }
  if (x.numbers !== y.numbers || x.places !== y.places || x.conditions !== y.conditions || x.supply !== y.supply || x.install !== y.install) return false;
  const [small, large] = x.core.size <= y.core.size ? [x.core, y.core] : [y.core, x.core];
  if (!small.size || ![...small].every(w => large.has(w))) return false;
  return small.size === large.size || (small.size >= ENOUGH && small.size / large.size >= SHARE);
}
