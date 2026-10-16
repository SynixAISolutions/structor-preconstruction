import { get } from "@vercel/blob";
export const runtime = "nodejs";
export async function GET() {
  try { const file = await get("review-assets/contract-forms-v1.json", { access: "private", useCache: false }); if (!file || file.statusCode !== 200) throw new Error("Forms unavailable."); return Response.json(await new Response(file.stream).json(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "The original forms could not be loaded." }, { status: 503 }); }
}
