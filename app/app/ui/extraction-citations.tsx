import type { Citation, Draft } from "../../lib/extraction";
import type { DrawingFlipState } from "../../lib/drawing-flip";
import type { SpecSection } from "../../lib/data/preconstruction";
import { scopeSources, type ScopeSources } from "../../lib/scope-sources";

export const findingTitle = (draft: Draft): string => draft.kind === "scope" ? draft.title : draft.kind === "region" ? draft.label : draft.item;

export function findingCitationSources(draft: Draft, citation: Citation, flip: DrawingFlipState, sections: SpecSection[]): ScopeSources {
  const source = draft.kind === "scope" ? draft.source : citation.sheet ?? "";
  const scopeId = draft.kind === "scope" ? draft.acceptedId ?? draft.id : draft.id;
  const references = scopeSources({ id: scopeId, source }, flip, sections);
  const page = flip.pages.find(page => page.documentName === citation.document && page.pageNumber === citation.page && (!citation.sheet || page.sheet === citation.sheet));
  const regions = page ? draft.kind === "region"
    ? flip.regions.filter(region => region.pageId === page.id && region.id === draft.acceptedId)
    : references.drawings.find(drawing => drawing.page.id === page.id)?.regions ?? [] : [];
  return { ...references, drawings: page ? [{ page, regions }] : [], unresolved: page || references.spec ? null : `${citation.document} · page ${citation.page}` };
}
