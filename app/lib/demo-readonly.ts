// The new-look demo (branch demo/new-look, NEW_LOOK_DEMO.md): its own copy of the database, but the same file
// store (Vercel Blob) as the live site. STRUCTOR_DEMO_READONLY=1, set in Vercel for that branch only, turns away
// every request that would change stored files, so nothing clicked in the demo can change or delete the live
// site's drawings, page text, notes or uploads (Delete project removes a project's files: removeProject).
// Unset, as on the live site, nothing changes.

export const DEMO_READONLY_MESSAGE = "This is the Structor demo: files can't be uploaded, changed or deleted here.";

/** Whether this server is the read-only demo. */
export const demoReadOnly = (env: Record<string, string | undefined> = process.env) =>
  /^(1|true|yes|on)$/i.test(env.STRUCTOR_DEMO_READONLY?.trim() ?? "");

/** A 403 for a route that writes to the file store when this server is the read-only demo; null otherwise. */
export function demoGuard(env: Record<string, string | undefined> = process.env): Response | null {
  return demoReadOnly(env) ? Response.json({ error: DEMO_READONLY_MESSAGE, demo: true }, { status: 403 }) : null;
}
