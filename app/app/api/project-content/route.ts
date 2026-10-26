import { renameDemoNamesDeep } from "../../../lib/demo-names";
import { validId } from "../../../lib/project-files";
import type { ContentOp } from "../../../lib/project-content";
import { changeContent, readContent } from "../../../lib/project-content-store";

// Content management: a project's tags, file descriptions and links, and the markups on its pages.
// GET reads them; POST applies a list of changes, all or none. The demo password (proxy.ts) guards this like every route.
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => Response.json(renameDemoNamesDeep(body), { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("project");
  if (!validId(projectId)) return json({ error: "Name the project." }, 400);
  return json((await readContent(projectId)).content);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "The request isn't valid JSON." }, 400); }
  if (!validId(body?.projectId)) return json({ error: "Name the project." }, 400);
  const ops = Array.isArray(body.ops) ? body.ops as ContentOp[] : [];
  if (!ops.length || ops.length > 50) return json({ error: "Send between 1 and 50 changes." }, 400);
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 80) : "Unknown";
  try {
    return json(await changeContent(body.projectId as string, ops, by));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The change could not be saved." }, 400);
  }
}
