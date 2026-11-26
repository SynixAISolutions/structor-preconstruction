// Which browser tab is reading a project's files (25 Nov: 2626 Penn was read by two browsers at once, so most trades were
// read twice, at twice the cost, with their lines written twice). A tab judged another's reading by its own saved copy of
// the run, and a tab in the background stops bringing in other people's changes, so its copy was minutes old and the
// reading looked abandoned. Now a tab takes a claim, kept apart from the run in a small draft of its own, in three steps:
// bring in the shared copy; stop if someone holds a fresh claim; write its own, wait for it to reach the shared copy, and
// look again. Two tabs that claim at the same moment see the same holder on that second look, and the other one stands
// down. The holder says it is there every 30 s, and looks again before each trade: a tab that lost the claim (it was
// asleep and another took over) stops and writes nothing more. Pure: lib/auto-scopes gives it the shared copy.

export type ReadingClaim = { key: string; tab: string; browser: string; beat: string };
export const CLAIM_KEY = "ai-scope-reading";
export const NO_CLAIM: ReadingClaim = { key: "", tab: "", browser: "", beat: "" };
/** A claim holds this long after its last beat: a background tab's timers may run only once a minute, so it is well over that. */
export const CLAIM_LASTS = 120_000;
/** Another tab of this same browser, which a reload leaves behind: shorter, but still over a minute. */
export const CLAIM_LASTS_HERE = 90_000;
/** A new claim's time to reach the shared copy (lib/shared-sync sends a change 2 s after it). */
export const CLAIM_SETTLE = 6_000;

type Me = { tab: string; browser: string };

/** Whether someone else is reading, said recently enough. */
export function claimHeld(claim: ReadingClaim, me: Me, now = Date.now()): boolean {
  if (!claim.tab || claim.tab === me.tab) return false;
  const since = now - Date.parse(claim.beat);
  return since < (claim.browser === me.browser ? CLAIM_LASTS_HERE : CLAIM_LASTS);
}
export const claimMine = (claim: ReadingClaim, me: Me): boolean => claim.tab === me.tab;

type ClaimIo = {
  me: Me;
  key: string;
  /** Brings in the shared copy; false when it can't be reached (or there is none). */
  sync: () => Promise<boolean>;
  read: () => ReadingClaim;
  write: (claim: ReadingClaim) => void;
  wait: (ms: number) => Promise<void>;
  now?: () => number;
};

/** Takes the reading for this tab, or says it can't. With no shared copy to ask, this browser's own copy decides. */
export async function acquireClaim(io: ClaimIo): Promise<boolean> {
  const now = io.now ?? Date.now;
  const shared = await io.sync();
  if (claimHeld(io.read(), io.me, now())) return false;
  io.write({ key: io.key, tab: io.me.tab, browser: io.me.browser, beat: new Date(now()).toISOString() });
  if (!shared) return true;
  await io.wait(CLAIM_SETTLE);
  await io.sync();
  return claimMine(io.read(), io.me);
}
