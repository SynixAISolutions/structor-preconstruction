// How long the automatic scope run has left (Danial, 2 Nov: "CAN THIS GIVE ME AN ACCURATE TIME LEFT"). Two things
// the whole tab shares hold a run up: the AI request pool (lib/ai-pool, 18 requests at once) and the OCR workers that
// check the quotes the AI read off sheet images (lib/sheet-ocr). On the 2 Nov run (Project 1: 32 trades, 129 sheets)
// a trade took about 55 s plus 27 s a sheet whatever its specification's length, and the pool was rarely full: the
// sheets' OCR set the pace. So the time left is the longer of the two queues: what the pool still has to answer at
// the speed its requests take, and what the OCR workers still have to read at the speed they read on this computer.
// Both speeds are measured as the run goes (measurePace) and the last run's are kept for the next (lib/auto-scopes);
// a first run starts from the 2 Nov run's. Pure.

/** How fast the AI and this computer work: seconds a request takes, by kind; worker seconds per OCR tile; tiles per
 * quote check and per scanned sheet; and the share of sheets whose quotes need an OCR check. */
export type Pace = { setup: number; scope: number; lines: number; drawing: number; references: number; tile: number; tilesPerCheck: number; sheetTiles: number; checkShare: number };

/** The 2 Nov run's, on Project 1 with Claude Haiku 5.5: 36 s for the bid packages, 24 s a specification request,
 * 10 s for bid-form lines, 6 s a sheet, 52 drawing-search requests in two minutes six at a time; a whole sheet is
 * 15 to 24 OCR tiles, about a minute for one worker. */
export const FIRST_PACE: Pace = { setup: 40, scope: 24, lines: 10, drawing: 6, references: 14, tile: 3.5, tilesPerCheck: 9, sheetTiles: 18, checkShare: 0.75 };

/** What a run still has to do. `setup` is the seconds spent so far setting the bid packages, or null once they're set. */
export type WorkLeft = { setup: number | null; scope: number; lines: number; drawing: number; references: number; checks: number; scannedTiles: number };

/** How many of each run at once: the pool's slots, the OCR workers, the drawing search's requests. */
export type Lanes = { pool: number; ocr: number; references: number };

/** One trade's reading so far, as lib/scope-reading counts it; null fields aren't known yet. */
export type TradeCounts = { parts: number | null; partsDone: number; lines: number | null; linesDone: number; specDone: boolean; sheetsRead: number; sheetsSettled: number; checks: number; checksDone: number };
export const NO_COUNTS: TradeCounts = { parts: null, partsDone: 0, lines: null, linesDone: 0, specDone: false, sheetsRead: 0, sheetsSettled: 0, checks: 0, checksDone: 0 };
/** A trade of the run: what its files suggest before it starts (specification requests, sections, sheets), what it has done since. */
export type TradeLeft = { estimate: { parts: number; sections: number; sheets: number }; counts: TradeCounts | null; done: boolean };

/** About one bid-form line request for every 0.7 specification sections of a trade with three requests or more (2 Nov: 81 for 21 trades). */
const LINES_PER_SECTION = 0.7;

/** The checks still to come from the sheets the AI hasn't answered yet, measured as the trades settle them. */
export const checkShare = (trades: TradeLeft[]): { n: number; value: number } => {
  const settled = trades.reduce((n, t) => n + (t.counts?.sheetsSettled ?? 0), 0);
  return { n: settled, value: settled ? trades.reduce((n, t) => n + (t.counts?.checks ?? 0), 0) / settled : 0 };
};

/** The requests and checks the trades still have. Trades not started count their files' estimate, scaled by how the
 * started trades' real request counts compared with theirs (blank pages aren't sent). */
export function tradesLeft(trades: TradeLeft[], pace: Pace): Pick<WorkLeft, "scope" | "lines" | "drawing" | "checks"> {
  const known = trades.filter(t => t.counts?.parts != null);
  const estimated = known.reduce((n, t) => n + t.estimate.parts, 0);
  const ratio = estimated ? known.reduce((n, t) => n + t.counts!.parts!, 0) / estimated : 1;
  const out = { scope: 0, lines: 0, drawing: 0, checks: 0 };
  for (const t of trades) {
    if (t.done) continue;
    const c = t.counts ?? NO_COUNTS;
    const parts = c.parts ?? Math.round(t.estimate.parts * ratio);
    out.scope += Math.max(0, parts - c.partsDone);
    out.lines += c.specDone ? 0 : c.lines != null ? Math.max(0, c.lines - c.linesDone) : parts >= 3 ? t.estimate.sections * LINES_PER_SECTION : 0;
    out.drawing += Math.max(0, t.estimate.sheets - c.sheetsRead);
    out.checks += Math.max(0, t.estimate.sheets - c.sheetsSettled) * pace.checkShare + Math.max(0, c.checks - c.checksDone);
  }
  return out;
}

/**
 * Seconds until the run is done: the bid packages, then the longer of the pool's queue, the OCR workers' queue, and
 * the drawing search (which waits for the scanned sheets, then reads a few requests at a time). Never under one
 * request or check while work remains: the last one takes that long however empty the queues are.
 */
export function secondsLeft(work: WorkLeft, pace: Pace, lanes: Lanes): number {
  const ocrScanned = work.scannedTiles * pace.tile / lanes.ocr;
  const pool = (work.scope * pace.scope + work.lines * pace.lines + work.drawing * pace.drawing + work.references * pace.references) / lanes.pool;
  const ocr = work.checks * pace.tilesPerCheck * pace.tile / lanes.ocr + ocrScanned;
  const references = work.references ? ocrScanned + Math.ceil(work.references / lanes.references) * pace.references : 0;
  const last = Math.max(work.scope > 0 ? pace.scope : 0, work.lines > 0 ? pace.lines : 0, work.drawing > 0 ? pace.drawing : 0, work.checks > 0 ? pace.tilesPerCheck * pace.tile : 0, work.references > 0 ? pace.references : 0);
  const setup = work.setup === null ? 0 : Math.max(5, pace.setup - work.setup);
  return setup + Math.max(pool, ocr, references, last);
}

/** Running totals the pool and OCR keep (lib/ai-pool aiTimes, lib/sheet-ocr ocrWork); the pace is their change since the run began. */
export type RequestTimes = Record<string, { n: number; ms: number }>;
export type OcrWork = { tiles: number; busyMs: number; checks: number; checkTiles: number; sheets: number; sheetTiles: number };
export type Measured = Partial<Record<keyof Pace, { n: number; value: number }>>;

/** What this run has measured so far: mean seconds by request kind, OCR worker seconds a tile, tiles a check and a scanned sheet. */
export function measurePace(before: { requests: RequestTimes; ocr: OcrWork }, now: { requests: RequestTimes; ocr: OcrWork }): Measured {
  const mean = (job: string) => {
    const n = (now.requests[job]?.n ?? 0) - (before.requests[job]?.n ?? 0), ms = (now.requests[job]?.ms ?? 0) - (before.requests[job]?.ms ?? 0);
    return n > 0 ? { n, value: ms / n / 1000 } : undefined;
  };
  const d = (k: keyof OcrWork) => now.ocr[k] - before.ocr[k];
  const out: Measured = { setup: mean("bid-packages"), scope: mean("scope"), lines: mean("scope-consolidate"), drawing: mean("drawing"), references: mean("sheet-references") };
  if (d("tiles") > 0) out.tile = { n: d("tiles"), value: d("busyMs") / d("tiles") / 1000 };
  if (d("checks") > 0) out.tilesPerCheck = { n: d("checks"), value: d("checkTiles") / d("checks") };
  if (d("sheets") > 0) out.sheetTiles = { n: d("sheets"), value: d("sheetTiles") / d("sheets") };
  return out;
}

/** How many measurements it takes to outweigh the starting pace, by kind. */
const TRUST: Pace = { setup: 1, scope: 12, lines: 12, drawing: 12, references: 8, tile: 40, tilesPerCheck: 8, sheetTiles: 3, checkShare: 10 };
/** The starting pace moved toward this run's measurements as they add up. */
export const blendPace = (start: Pace, measured: Measured): Pace => {
  const out = { ...start };
  for (const key of Object.keys(start) as (keyof Pace)[]) {
    const m = measured[key];
    if (m && m.n > 0 && Number.isFinite(m.value)) out[key] = (start[key] * TRUST[key] + m.value * m.n) / (TRUST[key] + m.n);
  }
  return out;
};

/** The time left as shown: it counts down by itself and moves a third of the way toward each new estimate, unless
 * that is within a tenth of it, so the minutes don't jump about between estimates. */
export function steadyLeft(shown: { seconds: number; at: number } | null, estimate: number, now: number): { seconds: number; at: number } {
  if (!shown) return { seconds: estimate, at: now };
  const counted = Math.max(0, shown.seconds - (now - shown.at) / 1000);
  const off = estimate - counted;
  return { seconds: Math.abs(off) <= counted / 10 ? counted : counted + off / 3, at: now };
}

/** "About 12 min left", as the progress card says it. */
export function timeLeftLabel(seconds: number): string {
  if (seconds < 45) return "Less than a minute left";
  if (seconds < 90) return "About a minute left";
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `About ${minutes} min left` : `About ${Math.floor(minutes / 60)} h ${minutes % 60} min left`;
}
