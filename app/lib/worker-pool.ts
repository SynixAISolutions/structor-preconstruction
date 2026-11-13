// A few workers shared in turn (lib/sheet-ocr's Tesseract workers): each is made on first use, and all of them end
// together once none has been needed for `idleMs`, so the memory they grew to while working is given back (13 Nov).

type Ending = { terminate: () => Promise<unknown> };

export type WorkerPool<W> = {
  /** A worker for one job and its slot; the job gives it back with `release` when it ends, failed or not. */
  claim: () => { slot: number; worker: Promise<W> };
  release: () => void;
  /** Workers made and not ended. */
  alive: () => number;
};

export function workerPool<W extends Ending>(make: () => Promise<W>, size: number, idleMs: number): WorkerPool<W> {
  const slots: (Promise<W> | undefined)[] = [];
  let turn = 0, claimed = 0, idle: ReturnType<typeof setTimeout> | undefined;
  return {
    claim() {
      claimed++;
      clearTimeout(idle);
      const i = turn++ % size;
      if (!slots[i]) {
        const made = make();
        made.catch(() => { if (slots[i] === made) slots[i] = undefined; }); // a worker that failed to start is made again next time
        slots[i] = made;
      }
      return { slot: i, worker: slots[i]! };
    },
    release() {
      if (--claimed > 0) return;
      idle = setTimeout(() => {
        const ending = slots.splice(0);
        turn = 0;
        for (const worker of ending) worker?.then(w => w.terminate()).catch(() => {});
      }, idleMs);
    },
    alive: () => slots.filter(Boolean).length,
  };
}
