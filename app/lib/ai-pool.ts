// One pool of AI requests for the whole tab (Danial, 30 Oct: "speed up the tail"). Each trade used to send at most
// three requests at once, so once only the big trades were left (Plumbing, HVAC, Electrical: 170–230 manual pages
// each) most of the tab's requests sat unused for the last eight minutes of the run. Now every scope reading asks
// the pool for a slot before each request and joins the back of the line after it: while six trades read, each gets
// about three slots; the last trade gets them all. The requests, and so the cost, are the same.

/** Requests the tab sends at once across every reading: six trades at three each, as before. */
export const AI_REQUESTS_AT_ONCE = 18;

let busy = 0;
const waiting: (() => void)[] = [];

/** Runs `request` once one of the tab's AI_REQUESTS_AT_ONCE slots is free, first come first served. */
export async function inAiPool<T>(request: () => Promise<T>): Promise<T> {
  if (busy < AI_REQUESTS_AT_ONCE) busy++;
  else await new Promise<void>(resolve => waiting.push(resolve));
  try { return await request(); }
  finally { const next = waiting.shift(); if (next) next(); else busy--; } // the slot passes straight to the next in line
}

/** Requests in flight and waiting, for the checks. */
export const aiPoolLoad = () => ({ busy, waiting: waiting.length });

/** How long each kind of AI request has taken since the tab opened, answered ones only: the automatic run measures
 * its pace from it for the time left (lib/run-time-left). */
const times: Record<string, { n: number; ms: number }> = {};
export async function timed<T>(job: string, request: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const answer = await request();
  const t = (times[job] ??= { n: 0, ms: 0 });
  t.n++; t.ms += Date.now() - start;
  return answer;
}
export const aiTimes = () => Object.fromEntries(Object.entries(times).map(([job, t]) => [job, { ...t }]));
