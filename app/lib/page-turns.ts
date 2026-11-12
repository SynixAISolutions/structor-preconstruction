// Drawing PDF pages a few at a time (12 Nov). Marcel's Chrome tab ran out of memory ("Aw, Snap!", Out of Memory) as the
// automatic scope run began on his 217 MB, 241-sheet drawing set: six trades each drew three sheets at once, eighteen
// 42" × 30" sheets in one go, and the title blocks of an upload drew six. pdf.js works through a document's pages on one
// thread, so drawing many at once is no faster; but every page being drawn holds its decoded images and its drawing
// instructions until it is done. Measured on that set in the app's browser engine, 54 sheets at 2,000 px: eighteen at once
// peaked at 5.0 GB of committed memory, three at 2.5 GB, two at 1.7 GB and one at 1.5 GB, in the same 80 seconds each.
// So every page drawn in the tab takes a turn here, whoever asks for it.
// Tried and left out (12 Nov): cleaning the document (pdf.cleanup()) every few pages. It lowered the peak by about a quarter
// (Vol 1 2.4 → 1.85 GB, Vol 2's heaviest sheets 3.6 → 2.7 GB) but drew Vol 2's line-heavy sheets 2.5 times slower, as their
// fonts were read again after each cleanup; memory falls back to about 0.5 GB within seconds of a burst anyway.

/** Pages being drawn at once in the whole tab: the automatic run's trades, OCR, an upload's title blocks, a viewer. */
export const PAGES_AT_ONCE = 2;

let busy = 0;
/** Waiting for a turn: pages a person asked to see, then the readers working through many sheets. */
const asked: (() => void)[] = [], line: (() => void)[] = [];

/**
 * Runs `draw` (one page drawn, or its drawing read) once one of the tab's PAGES_AT_ONCE turns is free, and gives the turn
 * up when it ends or fails. A reader working through many sheets (the automatic run, OCR, a model build) passes `behind`:
 * it waits behind any page a person has asked to see, which goes next.
 */
export async function pageTurn<T>(draw: () => Promise<T>, behind = false): Promise<T> {
  if (busy < PAGES_AT_ONCE) busy++;
  else await new Promise<void>(resolve => { (behind ? line : asked).push(resolve); });
  try { return await draw(); }
  finally { const next = asked.shift() ?? line.shift(); if (next) next(); else busy--; } // the turn passes straight on
}

/** Pages being drawn and waiting, for the checks. */
export const pageTurns = () => ({ busy, waiting: asked.length + line.length });
