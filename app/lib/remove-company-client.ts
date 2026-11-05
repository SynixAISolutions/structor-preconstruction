"use client";

import { sampleProcurement } from "./data/procurement";
import type { Procurement } from "./procurement";
import { loadProjects, sampleProjectRecords } from "./projects";
import { projectsInviting } from "./remove-company";
import { readDraft } from "./use-local-draft";

/**
 * Which projects still invite a company: what this browser holds, plus the team's shared copy of every project, since
 * someone else's project may not be in this browser. Without a shared copy, this browser's projects are all it can check.
 */
export async function projectsUsingCompany(companyId: string): Promise<string[]> {
  const known = loadProjects() ?? sampleProjectRecords;
  const here = known.map(p => ({ name: p.name, procurement: readDraft<Procurement>(p.id, "procurement", sampleProcurement) }));
  let shared: { name: string; procurement: Procurement }[] = [];
  try {
    const response = await fetch("/api/shared?every=procurement", { cache: "no-store" });
    if (response.ok) {
      const rows: { scope: string; value: Procurement }[] = (await response.json()).rows;
      shared = rows.map(row => ({ name: known.find(p => p.id === row.scope)?.name ?? "another project", procurement: row.value }));
    }
  } catch { /* Offline: fall back to this browser's projects. */ }
  return projectsInviting(companyId, [...here, ...shared]);
}
