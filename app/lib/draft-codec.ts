// Drafts kept in this browser, packed when large (19 Nov: Whittier's full run saved 6.15 million characters of scope
// items and AI findings for one project; Chrome keeps about 5.2 million a site, so Danial's Chrome showed "No bid
// packages yet" while the team's shared copy had all 2,603 items). A large draft is stored deflated, one byte a
// character behind a marker JSON can't start with; small ones stay plain JSON, as every older copy is. Pure and
// synchronous: screens read their drafts as they render.

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

const PACKED = "\u0000z1:";
/** Drafts this long (characters) and longer are packed; scope items and findings shrink about tenfold. */
export const PACK_OVER = 32_000;

/** The text to store for a draft's JSON. */
export function packDraft(json: string): string {
  if (json.length < PACK_OVER) return json;
  const bytes = deflateSync(strToU8(json), { level: 6 });
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  return PACKED + parts.join("");
}

/** A stored draft's JSON, packed or not; null stays null. */
export function unpackDraft(stored: string | null): string | null {
  if (stored === null || !stored.startsWith(PACKED)) return stored;
  const bytes = new Uint8Array(stored.length - PACKED.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = stored.charCodeAt(i + PACKED.length);
  return strFromU8(inflateSync(bytes));
}
