// Marcel (24 Oct): the case-study projects are proprietary, so the app is demoed with generic names
// (projects, file names, and the people from Marcel's company).
// The code now says Project 1 / 2 / 3; this rewrites what a browser saved before the rename (project
// records, screen drafts, sample backups, the bid-leveling workspace) so the old names never show.

const PHRASES: [string, string][] = [
  ["Modernization of the Jelleff Recreation Center for the DC Department of General Services: ", "Modernization of a recreation center for a public owner: "],
  ["3265 S St NW, Washington, DC 20007", "Washington, DC"],
  ["3265 S Street NW, Washington, DC 20007", "Washington, DC"],
  ["DC Department of General Services", "Public owner"],
  ["DLR Group", "Architect of record"],
  ["Jelleff Recreation Center", "Project 1"],
  ["JELLEFF RECREATION CENTER", "PROJECT 1"],
  ["JELLEFF COMMUNITY CENTER", "PROJECT 1"],
  ["Jelleff project manual", "Project 1 manual"],
  ["Whittier Campus", "Project 2"],
  ["Riverside Commons", "Project 3"],
  ["JRC_GMP-Permit_Drawings_251209.pdf", "Project 1 GMP drawings.pdf"],
  ["JRC_GMP-Permit_Project-Manual_251209.pdf", "Project 1 GMP project manual.pdf"],
  ["Amit Patani", "Chris Taylor"],
  ['"version":"DGS"', '"version":"Public owner"'],
];
// Whole words only, after the phrases: project ids ("jelleff") and code names are lower case and untouched.
// Sadie and Victor stand in for two of Marcel's colleagues who own scopes in the sample.
const WORDS: [RegExp, string][] = [
  [/\bJelleff\b/g, "Project 1"], [/\bJELLEFF\b/g, "PROJECT 1"], [/\bWhittier\b/g, "Project 2"],
  [/\bSafi\b/g, "Sadie"], [/\bVijay\b/g, "Victor"],
];
const ANY = /Jelleff|JELLEFF|Whittier|Riverside Commons|DLR Group|General Services|3265 S St|"version":"DGS"|JRC_GMP|Amit Patani|\bSafi\b|\bVijay\b/;

export function renameDemoNames(text: string): string {
  if (!ANY.test(text)) return text;
  let out = text;
  for (const [from, to] of PHRASES) out = out.split(from).join(to);
  for (const [pattern, to] of WORDS) out = out.replace(pattern, to);
  return out;
}

/** Every string inside plain objects and arrays renamed; anything else is returned as it is. */
export function renameDemoNamesDeep<T>(value: T): T {
  if (typeof value === "string") return renameDemoNames(value) as T;
  if (Array.isArray(value)) return value.map(renameDemoNamesDeep) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameDemoNamesDeep(v)])) as T;
  return value;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

/** Rewrites this app's saved values that still hold the old names. Returns how many were changed. */
export function renameSavedDemoNames(storage: StorageLike): number {
  let changed = 0;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => !!k && k.startsWith("structor"));
  for (const key of keys) {
    const saved = storage.getItem(key);
    if (saved === null) continue;
    const renamed = renameDemoNames(saved);
    if (renamed === saved) continue;
    try { storage.setItem(key, renamed); changed++; } catch { /* Storage full: the value keeps its old text. */ }
  }
  return changed;
}

// Runs on every load in the browser, before any screen reads storage, so a restored backup is renamed too.
if (typeof window !== "undefined") {
  try { renameSavedDemoNames(window.localStorage); } catch { /* Storage unavailable: nothing saved to rename. */ }
}
