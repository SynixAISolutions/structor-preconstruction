// The bid documents (Danial, 27 Oct, from Marcel's 24 Oct meeting: a project starts with its drawings and its
// specifications, two volumes of each on Project 1's GMP set, "sometimes they might upload them not stacked").
// The drawing sets and project-manual volumes the bid is based on, and what was issued after them: revised
// sheets, a new revision of a volume, addenda. The AI reads the current set whatever folder it is in
// (lib/auto-scopes); this only sorts the files for the Bid documents panel in Project files. Pure.

import { drawingLog, latestDocuments, revisionLabel, revisionsOf, type StoredDocument } from "./project-files";

/** A drawing set or project-manual volume: its current revision, how many there are, and what it holds. */
export type BidVolume = { doc: StoredDocument; revisions: number; sheets: number; sections: number };
/** Something issued after the bid documents, and what it changed in words. */
export type LaterIssue = { doc: StoredDocument; what: string };
export type BidDocuments = { drawings: BidVolume[]; manual: BidVolume[]; later: LaterIssue[] };

const byName = (a: StoredDocument, b: StoredDocument) => a.name.localeCompare(b.name, undefined, { numeric: true });
const listed = (sheets: string[]) => `${sheets.slice(0, 4).join(", ")}${sheets.length > 4 ? ` and ${sheets.length - 4} more` : ""}`;

/**
 * The project's bid documents: drawing volumes and project-manual volumes (Vol 1 before Vol 2), and what came
 * later, newest first. A drawing upload whose sheets are all already in the set is a reissue of those sheets
 * (an addendum), not another volume; a later revision of a volume and a file filed as Addenda are later issues.
 */
export function bidDocuments(docs: StoredDocument[]): BidDocuments {
  const log = drawingLog(docs);
  const setOf = (doc: StoredDocument) => log.sets.find(s => s.doc === doc);
  const reissue = (series: string) => { const set = setOf(revisionsOf(docs, series)[0]); return !!set && !set.added.length && set.revised.length > 0; };
  const volume = (doc: StoredDocument): BidVolume => ({ doc, revisions: revisionsOf(docs, doc.series).length, sheets: doc.sheets.filter(s => s.sheet).length, sections: doc.sections.length });
  const latest = latestDocuments(docs);
  const later: LaterIssue[] = [
    ...latest.filter(d => d.kind === "drawings" && reissue(d.series)).map(doc => ({ doc, what: `Reissued sheets: ${listed(setOf(doc)?.revised ?? [])}` })),
    ...docs.filter(d => (d.kind === "manual" || (d.kind === "drawings" && !reissue(d.series))) && d.revision > 1).map(doc => ({ doc, what: `${revisionLabel(doc)}, replacing ${revisionLabel({ revision: doc.revision - 1 })}` })),
    ...latest.filter(d => d.category === "Addenda").map(doc => ({ doc, what: "Addendum" })),
  ];
  return {
    drawings: latest.filter(d => d.kind === "drawings" && !reissue(d.series)).sort(byName).map(volume),
    manual: latest.filter(d => d.kind === "manual").sort(byName).map(volume),
    later: later.sort((a, b) => b.doc.uploadedAt.localeCompare(a.doc.uploadedAt)),
  };
}
