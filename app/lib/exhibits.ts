// The subcontract's other exhibits (Marcel, 15 Oct): Exhibit A is the scope written in Structor;
// Exhibit B, the list of documents, is generated from Project files; the contracts department uploads
// C to I, and they are carried into the subcontract with A and B.

import { latestDocuments, type StoredDocument } from "./project-files";

export type ExhibitSlot = { letter: string; title: string; source: "scope" | "generated" | "upload" };

/** As listed in the contractor's Exhibit A shell (section 2.1). */
export const SUBCONTRACT_EXHIBITS: ExhibitSlot[] = [
  { letter: "A", title: "Scope of Work", source: "scope" },
  { letter: "B", title: "List of Documents", source: "generated" },
  { letter: "C", title: "Insurance Requirements", source: "upload" },
  { letter: "D", title: "Safety Plan", source: "upload" },
  { letter: "E", title: "Schedule", source: "upload" },
  { letter: "F", title: "Billing Package (Wage Scale)", source: "upload" },
  { letter: "G", title: "Quality Control Plan", source: "upload" },
  { letter: "H", title: "Project Closeout Requirements", source: "upload" },
  { letter: "I", title: "Compliance Requirements (LEED)", source: "upload" },
];

/** An uploaded exhibit is a stored project file named "Exhibit C - …" (any case, any dash). */
export const exhibitFileName = (letter: string, original: string) => /^exhibit\s+[a-z]\b/i.test(original) ? original : `Exhibit ${letter} - ${original}`;

export function exhibitDocument(docs: StoredDocument[], letter: string): StoredDocument | null {
  const pattern = new RegExp(`^exhibit\\s+${letter}\\b`, "i");
  return latestDocuments(docs).find(d => pattern.test(d.name.trim())) ?? null;
}

/** What the subcontract carries: each slot and whether it is ready. */
export function exhibitStatus(docs: StoredDocument[], hasScope: boolean, hasDocumentList: boolean) {
  return SUBCONTRACT_EXHIBITS.map(slot => ({
    ...slot,
    doc: slot.source === "upload" ? exhibitDocument(docs, slot.letter) : null,
    ready: slot.source === "scope" ? hasScope : slot.source === "generated" ? hasDocumentList : !!exhibitDocument(docs, slot.letter),
  }));
}
