"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { contractLanguage } from "../../lib/ai-more-client";
import type { DocumentContent } from "../../lib/award";
import { Button } from "./shared";

const NUMBERED = /^(\d+)\.\s+/;

/**
 * Marcel, 15 Oct: Section 3 of Exhibit A is the trade's scope, written in contract language, not in
 * the bid form's shorthand. Rewrites the numbered lines of the scope section (3.1, or the section
 * headed "Scope of work") with the AI; intro and closing lines stay as the template has them. The
 * result goes into this draft revision for the user to read and save.
 */
export function ContractLanguageButton({ content, trade, onChange, notify }: { content: DocumentContent; trade: string; onChange: (content: DocumentContent) => void; notify: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const index = content.sections.findIndex(s => s.number === "3.1" || /^scope of work$/i.test(s.heading.trim()));
  const section = index >= 0 ? content.sections[index] : null;
  const numbered = section ? section.lines.map((line, i) => ({ i, text: line.replace(NUMBERED, ""), numbered: NUMBERED.test(line) })).filter(l => l.numbered) : [];
  async function rewrite() {
    if (!section || !numbered.length) return;
    setBusy(true);
    try {
      const clauses = await contractLanguage(trade, numbered.map(l => l.text));
      const lines = [...section.lines];
      numbered.forEach((l, n) => { lines[l.i] = `${n + 1}. ${clauses[n]}`; });
      onChange({ ...content, sections: content.sections.map((s, i) => i === index ? { ...s, lines } : s) });
      notify(`${numbered.length} scope lines rewritten in contract language. Read them, then create the revision.`);
    } catch (error) { notify(error instanceof Error ? error.message : "The AI could not rewrite the scope."); }
    finally { setBusy(false); }
  }
  if (!section) return null;
  return <Button disabled={busy || !numbered.length} onClick={() => void rewrite()}><Sparkles size={14}/>{busy ? "Writing contract language…" : `Write ${section.number ?? "scope"} in contract language`}</Button>;
}
