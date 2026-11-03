// When two people change the same saved draft at once (lib/shared-sync), both changes are kept where they don't
// touch the same thing. A three-way merge of JSON: what this browser changed since the copy it started from (`base`)
// wins, everything else comes from the other person's newer copy (`theirs`). Records are matched by their id, so one
// person approving a scope item and another adding one both stand. Without a base (the browser was reloaded since
// it last saved), this browser's values win where both have one, and records only the other side has are kept. Pure.

/** Whose data a shared row is when it belongs to the organization, not a project (the subcontractor directory…). */
export const ORG_SCOPE = "_org";

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOf = (v: unknown): string | null => isObject(v) ? (typeof v.id === "string" ? v.id : typeof v.key === "string" ? v.key : null) : null;
/** An array of records with ids (every item has one, none repeated): merged record by record. */
const isRecordList = (v: unknown): v is Record<string, unknown>[] => {
  if (!Array.isArray(v) || !v.length) return false;
  const ids = v.map(idOf);
  return ids.every(id => id !== null) && new Set(ids).size === ids.length;
};

export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => k in b && sameJson(a[k], b[k]));
  }
  return false;
}

const MISSING = Symbol("missing");
type Maybe = unknown | typeof MISSING;

function mergeValue(base: Maybe, ours: Maybe, theirs: Maybe): Maybe {
  if (ours === MISSING) return theirs === MISSING || (base !== MISSING && sameJson(theirs, base)) ? MISSING : theirs;
  if (theirs === MISSING) return base !== MISSING && sameJson(ours, base) ? MISSING : ours;
  if (sameJson(ours, theirs)) return ours;
  if (base !== MISSING) {
    if (sameJson(ours, base)) return theirs;
    if (sameJson(theirs, base)) return ours;
  }
  if (isObject(ours) && isObject(theirs)) {
    const b = isObject(base) ? base : null;
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const merged = mergeValue(b && key in b ? b[key] : MISSING, key in ours ? ours[key] : MISSING, key in theirs ? theirs[key] : MISSING);
      if (merged !== MISSING) out[key] = merged;
    }
    return out;
  }
  if ((isRecordList(ours) || isRecordList(theirs)) && Array.isArray(ours) && Array.isArray(theirs) && [...ours, ...theirs].every(x => idOf(x) !== null)) {
    const byId = (list: unknown) => new Map((Array.isArray(list) ? list : []).filter(x => idOf(x) !== null).map(x => [idOf(x)!, x]));
    const b = base === MISSING ? null : byId(base), o = byId(ours), t = byId(theirs);
    const out: unknown[] = [];
    // Our order first, then the records only the other side has, in their order.
    for (const id of [...o.keys(), ...[...t.keys()].filter(id => !o.has(id))]) {
      const merged = mergeValue(b?.has(id) ? b.get(id) : MISSING, o.has(id) ? o.get(id) : MISSING, t.has(id) ? t.get(id) : MISSING);
      if (merged !== MISSING) out.push(merged);
    }
    return out;
  }
  return ours;
}

/** `ours` and `theirs` merged over `base` (undefined when it isn't known). */
export function mergeJson(base: unknown, ours: unknown, theirs: unknown): unknown {
  const merged = mergeValue(base === undefined ? MISSING : base, ours, theirs);
  return merged === MISSING ? ours : merged;
}
