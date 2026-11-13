// One byte range of a stored PDF, tried again when the server fails (13 Nov). pdf.js waits for every range it asks for and
// has no way to be told one failed: a single 502 from the file route left a page waiting for ever, and with pages drawn
// one at a time (lib/page-turns) the whole automatic scope run stopped with it, in a test on Marcel's Whittier set.

/** Waits before each new try, about a minute in all: long enough for a busy or restarting server to answer again. */
export const RANGE_RETRY_WAITS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/** Bytes `start` to `stop` (exclusive) of `url`. Server errors (5xx, 429) and dropped connections are tried again after each
 * wait; other answers (signed out, file gone) fail at once, as trying again wouldn't change them. */
export async function fetchRange(url: string, start: number, stop: number, waits: number[] = RANGE_RETRY_WAITS, get: typeof fetch = (...args) => fetch(...args)): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    let failure: Error;
    try {
      const response = await get(url, { headers: { range: `bytes=${start}-${stop - 1}` } });
      if (response.status === 206) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(`The stored file could not be read (${response.status}).`);
      if (response.status < 500 && response.status !== 429) throw Object.assign(failure, { final: true });
    } catch (error) {
      if ((error as { final?: boolean }).final) throw error;
      failure = error instanceof Error ? error : new Error("The stored file could not be read.");
    }
    if (attempt >= waits.length) throw failure;
    await new Promise(resolve => setTimeout(resolve, waits[attempt]));
  }
}
