"use client";

// Writing a trade's general scope with the AI (lib/general-scope): from Scopes & bid forms, and at the end of each trade in
// the automatic scope run. One request per trade: its detailed items go out, a few general lines come back; a second, short
// one places any items the first answer left out.

import { aiJob } from "./ai-more-client";
import { sampleProcurement } from "./data/procurement";
import { applyGeneralScope, generalBasis, generalItems, generalScopeInput, leftoverInput, mergeLeftovers } from "./general-scope";
import type { Procurement } from "./procurement";
import { readDraft, writeDraft } from "./use-local-draft";

/** Writes (or rewrites) one trade's general scope and saves it on the package. Throws with a message to show. */
export async function writeGeneralScope(projectId: string, packageId: string, by: string, signal?: AbortSignal): Promise<number> {
  const before = readDraft<Procurement>(projectId, "procurement", sampleProcurement);
  const pkg = before.packages.find(p => p.id === packageId);
  if (!pkg) throw new Error("That trade package no longer exists.");
  const items = generalItems(before, packageId);
  if (!items.length) throw new Error(`${pkg.name} has no detailed scope items to summarize yet.`);
  type Reply = { lines: { text: string; members: number[] }[]; model: string };
  const input = generalScopeInput(pkg, items);
  const reply = await aiJob<Reply>("general-scope", input, signal);
  let lines = reply.lines;
  const left = leftoverInput(input, lines);
  if (left) {
    const more = await aiJob<Reply>("general-scope", left.input, signal).catch(() => null);
    if (more) lines = mergeLeftovers(lines, more.lines, left.index);
  }
  // The items may have changed while the AI wrote: its numbers would then point at the wrong ones.
  const now = readDraft<Procurement>(projectId, "procurement", sampleProcurement);
  if (generalBasis(generalItems(now, packageId)) !== generalBasis(items)) throw new Error(`${pkg.name}'s items changed while the general scope was written. Write it again.`);
  const next = applyGeneralScope(now, packageId, lines, reply.model, by);
  writeDraft(projectId, "procurement", next);
  return next.packages.find(p => p.id === packageId)?.general?.lines.length ?? 0;
}
