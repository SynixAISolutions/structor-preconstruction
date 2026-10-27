// What a bid leveling refresh changed (Marcel, 24 Oct: pressing refresh looked like it did nothing, because the
// sheet said the same thing whether or not new bids had come in). Pure: compares the portal revisions loaded
// before and after, by leveling bidder.

import type { BidProvenance } from "./leveling-import";

export type RefreshChange = { bidderId: string; name: string; kind: "new" | "revised"; revision: number };

export function refreshChanges(before: Record<string, Pick<BidProvenance, "revisionNumber">>, after: Record<string, Pick<BidProvenance, "revisionNumber">>, names: Record<string, string>): RefreshChange[] {
  return Object.entries(after).flatMap(([bidderId, now]): RefreshChange[] => {
    const was = before[bidderId];
    const name = names[bidderId] ?? "A bidder";
    if (!was) return [{ bidderId, name, kind: "new", revision: now.revisionNumber }];
    return now.revisionNumber !== was.revisionNumber ? [{ bidderId, name, kind: "revised", revision: now.revisionNumber }] : [];
  });
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const list = (names: string[]) => names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** The line the sheet shows after a refresh: what came in, or that nothing did since the last check. */
export function refreshMessage(changes: RefreshChange[], lastCheck: string | null, trade: string): string {
  if (!changes.length) return `No new bids for ${trade}${lastCheck ? ` since ${time(lastCheck)}` : ""}.`;
  const added = changes.filter(c => c.kind === "new"), revised = changes.filter(c => c.kind === "revised");
  return [
    added.length ? `${added.length} new bid${added.length === 1 ? "" : "s"} from ${list(added.map(c => c.name))}` : "",
    revised.length ? `${revised.length} revised bid${revised.length === 1 ? "" : "s"} from ${list(revised.map(c => `${c.name} (revision ${c.revision})`))}` : "",
  ].filter(Boolean).join("; ") + ". Review them before ranking.";
}

/** A plug: an adjustment applied from a quantity and unit price (lib/bid-gap-cost writes its "Cost basis"). */
export const isPlug = (response: { adjustment: number; note: string }) => response.adjustment !== 0 && /Cost basis: /.test(response.note);
export const plugBasis = (note: string) => note.match(/Cost basis: ([^\n]*)/)?.[1] ?? "";
