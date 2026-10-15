import { get } from "@vercel/blob";
import { parseGeneralScopes } from "../../../lib/scope-review";

export const runtime = "nodejs";
export async function GET() {
  try {
    const file = await get("review-assets/standard-general-scopes-v1.json", { access: "private", useCache: false });
    if (!file || file.statusCode !== 200) throw new Error("Missing standard scope list.");
    return Response.json({ items: parseGeneralScopes(await new Response(file.stream).json()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Standard general scopes could not be loaded. Please try again." }, { status: 503 }); }
}
