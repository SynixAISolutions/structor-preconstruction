import { DIVISION_SERIES, GENERAL_SERIES, parseBls, type IndexPoint } from "../../../lib/escalation";

// The BLS Producer Price Index series Structor uses for escalation (lib/escalation), monthly values for
// the last 10 years. Public data; the indexes change once a month, so one fetch is kept for 12 hours.
// ponytail: module memory cache; a BLS registration key (500 requests a day) if several projects share it.
export const runtime = "nodejs";
const SERIES = [GENERAL_SERIES, ...Object.values(DIVISION_SERIES)].map(s => s.id);
let cached: { at: number; points: Record<string, IndexPoint[]> } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < 12 * 3600_000) return Response.json({ points: cached.points, fetchedAt: new Date(cached.at).toISOString() });
  try {
    const end = new Date().getUTCFullYear();
    const response = await fetch("https://api.bls.gov/publicAPI/v1/timeseries/data/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: SERIES, startyear: String(end - 9), endyear: String(end) }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = await response.json();
    if (!response.ok || json?.status !== "REQUEST_SUCCEEDED") throw new Error(json?.message?.[0] ?? `BLS ${response.status}`);
    cached = { at: Date.now(), points: parseBls(json) };
    return Response.json({ points: cached.points, fetchedAt: new Date(cached.at).toISOString() });
  } catch {
    return Response.json({ error: "The price indexes could not be loaded from the Bureau of Labor Statistics. Try again later." }, { status: 503 });
  }
}
