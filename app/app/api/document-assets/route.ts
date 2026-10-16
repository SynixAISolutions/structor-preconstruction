import { del, get, put } from "@vercel/blob";
import { ASSET_LIMIT, assetId, documentFormat, type DocumentAsset } from "../../../lib/document-assets";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) { try { const url = new URL(origin); if (!["http:", "https:"].includes(url.protocol) || url.host !== (request.headers.get("host") || new URL(request.url).host)) throw new Error(); } catch { return json({ error: "Upload from the Structor page." }, 403); } }
  if (Number(request.headers.get("content-length")) > ASSET_LIMIT) return json({ error: "Choose a file under 3 MB." }, 413);
  const name = new URL(request.url).searchParams.get("name")?.replace(/[\x00-\x1f/\\]/g, "").slice(0, 180);
  if (!name) return json({ error: "The file needs a name." }, 400);
  let bytes: Uint8Array, extension: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Choose a file.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > ASSET_LIMIT) { await reader.cancel(); return json({ error: "Choose a file under 3 MB." }, 413); } chunks.push(value); }
    bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    extension = documentFormat(request.headers.get("content-type") || "", bytes);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "The file could not be read." }, 400); }
  const id = crypto.randomUUID(), path = `document-assets/${id}.${extension}`;
  const asset: DocumentAsset = { id, name, type: request.headers.get("content-type")!, size: bytes.length };
  try {
    await put(path, Buffer.from(bytes), { access: "private", addRandomSuffix: false, contentType: asset.type });
    await put(`document-assets/${id}.json`, JSON.stringify({ ...asset, path }), { access: "private", addRandomSuffix: false, contentType: "application/json" });
    return json({ asset }, 201);
  } catch { await del(path).catch(() => {}); return json({ error: "The file was not saved. Try again." }, 503); }
}
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!assetId(id)) return json({ error: "Invalid file." }, 400);
  try {
    const meta = await get(`document-assets/${id}.json`, { access: "private", useCache: false });
    if (!meta || meta.statusCode !== 200) return json({ error: "File not found." }, 404);
    const saved = await new Response(meta.stream).json() as DocumentAsset & { path: string };
    if (saved.id !== id || !new RegExp(`^document-assets/${id}\\.(pdf|docx|png|jpg)$`).test(saved.path)) throw new Error("Invalid file record.");
    const file = await get(saved.path, { access: "private", useCache: false });
    if (!file || file.statusCode !== 200) return json({ error: "File not found." }, 404);
    return new Response(file.stream, { headers: { "Content-Type": saved.type, "Content-Disposition": `${saved.type === "application/pdf" || saved.type.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(saved.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return json({ error: "The private file could not be opened." }, 503); }
}
