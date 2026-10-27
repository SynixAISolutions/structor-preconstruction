import type { Citation, Draft } from "../../lib/extraction";
import type { DrawingFlipState } from "../../lib/drawing-flip";
import type { SpecSection } from "../../lib/data/preconstruction";
import { scopeSources, type ScopeSources } from "../../lib/scope-sources";

export const findingTitle = (draft: Draft): string => draft.kind === "scope" ? draft.title : draft.kind === "region" ? draft.label : draft.item;

/** What the check of a quote the AI read from a sheet image found (lib/text-anchor checkImageQuotes). */
export const IMAGE_CHECK_NOTES: Record<NonNullable<Citation["verification"]>, string> = {
  image: "Read from the sheet image and not checked on it: verify the wording, location and dimensions on the sheet.",
  printed: "Read from the sheet image. Structor found these words printed on the sheet.",
  "not-printed": "Not printed on the sheet: Structor read the whole sheet image and these words aren't on it. Check this finding against the sheet before accepting it.",
};

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
