// Sample Drawing Flip for the Jelleff project: nine sheets of the real GMP permit drawing set stored in
// Project files (JRC_GMP-Permit_Drawings_251209.pdf) and trade regions placed on those sheets. The
// sheets are real; the regions, reviewers and history are a sample. Package and scope ids are the
// sample procurement's (lib/data/procurement.ts).

import { rectangle, type DrawingFlipState, type DrawingPage, type FlipRegion, type Point, type RegionEvent } from "../drawing-flip";

export const JRC_DRAWINGS = { id: "jrc-drawings-251209", name: "JRC_GMP-Permit_Drawings_251209.pdf" };
const page = (sheet: string, title: string, discipline: string, pageNumber: number): DrawingPage =>
  ({ id: `pg-${sheet.toLowerCase()}`, sheet, title, discipline, revision: "GMP 12-09-2025", documentId: JRC_DRAWINGS.id, documentName: JRC_DRAWINGS.name, pageNumber, aspect: 1.4, image: null });

const pages: DrawingPage[] = [
  page("CIV0102", "Demolition plan", "Civil", 9),
  page("A1.1", "Level 01 - First floor plan", "Architectural", 46),
  page("A1.3", "Roof plan", "Architectural", 48),
  page("A3.1", "Level 01 - Reflected ceiling plan", "Architectural", 53),
  page("A8.2", "Door & frame type & schedule", "Architectural", 65),
  page("S101", "Level 01 - First floor framing plan", "Structural", 111),
  page("M101", "Level 01 - HVAC plan", "Mechanical", 145),
  page("P2.1", "Level 01 - Overall plumbing plan", "Plumbing", 133),
  page("E1.1", "Level 01 - Lighting plan", "Electrical", 178),
];
const proposed = "2026-09-17T13:00:00.000Z";
const reviewed = "2026-09-18T15:00:00.000Z";
type Sample = {
  number: string; sheet: string; label: string; polygon: Point[]; packageId: string; scopeIds: string[]; evidence: string;
  confidence: number | null; review?: string; notes?: string; correctedFrom?: { packageId: string; by: string; reason: string };
};
const region = (s: Sample): FlipRegion => {
  const ai = s.confidence !== null;
  const by = ai ? "Structor AI" : s.review!;
  const history: RegionEvent[] = [
    { kind: "created", at: proposed, by, packageId: s.correctedFrom?.packageId ?? s.packageId },
    ...s.scopeIds.map(scopeId => ({ kind: "linked" as const, at: s.correctedFrom ? reviewed : proposed, by: s.correctedFrom?.by ?? by, scopeId })),
  ];
  if (s.correctedFrom) history.splice(1, 0, { kind: "reassigned", at: reviewed, by: s.correctedFrom.by, from: s.correctedFrom.packageId, to: s.packageId, reason: s.correctedFrom.reason, unlinked: [] });
  else if (ai && s.review) history.push({ kind: "approved", at: reviewed, by: s.review });
  if (s.notes) history.push({ kind: "notes", at: reviewed, by: s.review ?? "Safi", text: s.notes });
  const done = !ai || !!s.review || !!s.correctedFrom;
  return {
    id: s.number.toLowerCase(), number: s.number, pageId: `pg-${s.sheet.toLowerCase()}`, label: s.label, polygon: s.polygon,
    packageId: s.packageId, scopeIds: s.scopeIds, evidence: s.evidence, confidence: s.confidence, origin: ai ? "ai" : "estimator",
    status: done ? "approved" : "pending-review", reviewedBy: done ? s.correctedFrom?.by ?? s.review! : null, reviewedAt: done ? (ai ? reviewed : proposed) : null,
    notes: s.notes ?? "", history, createdAt: proposed, createdBy: by,
  };
};

const regions: FlipRegion[] = [
  region({ number: "R-001", sheet: "CIV0102", label: "Existing recreation center building to be removed", polygon: rectangle(0.19, 0.31, 0.09, 0.16), packageId: "demolition", scopeIds: ["scope-1"], evidence: "Demolition keynote 1: existing building to be removed.", confidence: 0.93, review: "Safi" }),
  region({ number: "R-002", sheet: "CIV0102", label: "Asphalt pavement to be removed", polygon: rectangle(0.23, 0.5, 0.08, 0.25), packageId: "demolition", scopeIds: ["scope-2"], evidence: "Keynote 6 and the hatched area per the demolition legend: asphalt pavement, full depth.", confidence: 0.88 }),
  region({ number: "R-003", sheet: "CIV0102", label: "Concrete sidewalk, curb and gutter to be removed", polygon: rectangle(0.28, 0.855, 0.14, 0.05), packageId: "demolition", scopeIds: ["scope-4"], evidence: "Keynotes 2 and 8 along S Street: existing sidewalk, curb and gutter to be removed.", confidence: 0.64, correctedFrom: { packageId: "concrete", by: "Safi", reason: "Removing the existing sidewalk and curb is demolition; the concrete package carries the new paving." } }),
  region({ number: "R-004", sheet: "A1.1", label: "CMU walls around the gym", polygon: rectangle(0.19, 0.415, 0.215, 0.435), packageId: "masonry", scopeIds: ["scope-7"], evidence: "Gym 103 enclosure; general note 2: interior CMU walls 8 inches nominal unless noted.", confidence: 0.9 }),
  region({ number: "R-005", sheet: "A1.1", label: "Gypsum board partitions, locker rooms and toilets", polygon: rectangle(0.565, 0.41, 0.15, 0.175), packageId: "drywall", scopeIds: ["scope-12"], evidence: "Partition tags at lockers/change 117B, toilet/shower 117A and the restroom core.", confidence: 0.86, review: "Safi" }),
  region({ number: "R-006", sheet: "A1.1", label: "Fitness center flooring", polygon: rectangle(0.58, 0.66, 0.1, 0.09), packageId: "flooring", scopeIds: ["scope-13"], evidence: "Fitness Center 106; floor finish per the A12.2 finish plan and A12.1 schedule.", confidence: 0.77 }),
  region({ number: "R-007", sheet: "A1.3", label: "Gym roof with PV array", polygon: rectangle(0.193, 0.408, 0.215, 0.43), packageId: "thermal", scopeIds: [], evidence: "Roof plan: 1/4\" per foot slope to crickets, PV panels typical, metal copper coping.", confidence: 0.91 }),
  region({ number: "R-008", sheet: "A8.2", label: "Door and frame schedule", polygon: rectangle(0.033, 0.02, 0.385, 0.35), packageId: "openings", scopeIds: ["scope-11"], evidence: "Door and frame schedule, doors 101A to S202: HM, wood and aluminum with hardware set numbers.", confidence: 0.72 }),
  region({ number: "R-009", sheet: "S101", label: "Level 01 slab on grade and spread footings", polygon: rectangle(0.143, 0.15, 0.56, 0.44), packageId: "concrete", scopeIds: ["scope-5"], evidence: "5\" slab on grade, foundation plan notes and the spread footing schedule (3000 psf).", confidence: 0.95, review: "Vijay" }),
  region({ number: "R-010", sheet: "M101", label: "HVAC duct mains through the core", polygon: rectangle(0.47, 0.3, 0.15, 0.25), packageId: "mechanical", scopeIds: ["scope-15"], evidence: "Level 01 HVAC plan: supply, return and exhaust mains from DOAS-1 through the core.", confidence: 0.83 }),
  region({ number: "R-011", sheet: "P2.1", label: "Locker room and toilet plumbing", polygon: rectangle(0.357, 0.167, 0.113, 0.133), packageId: "plumbing", scopeIds: ["scope-14"], evidence: "Fixtures and piping at the toilet/shower and locker rooms.", confidence: 0.69 }),
  region({ number: "R-012", sheet: "E1.1", label: "Gym lighting", polygon: rectangle(0.133, 0.133, 0.213, 0.425), packageId: "electrical", scopeIds: ["scope-16"], evidence: "", confidence: null, review: "Naija", notes: "Override switch for the main gym; confirm the gym lighting controls with the architect." }),
  // Drywall, Marcel's pilot trade: framing and shaft wall on the plan, ceilings on the reflected ceiling plan.
  region({ number: "R-013", sheet: "A1.1", label: "Metal stud partitions, offices and circulation", polygon: rectangle(0.43, 0.57, 0.13, 0.1), packageId: "drywall", scopeIds: ["scope-17", "scope-18"], evidence: "Partition type tags at offices 104 and 105 and circulation 102B.", confidence: 0.81, review: "Safi" }),
  region({ number: "R-014", sheet: "A1.1", label: "Shaft wall at the elevator", polygon: rectangle(0.6, 0.575, 0.04, 0.055), packageId: "drywall", scopeIds: ["scope-19"], evidence: "Elevator 114 hoistway enclosure.", confidence: 0.74 }),
  region({ number: "R-015", sheet: "A3.1", label: "Acoustical panel ceilings (APC-1), fitness wing", polygon: [{ x: 0.518, y: 0.692 }, { x: 0.679, y: 0.583 }, { x: 0.729, y: 0.683 }, { x: 0.56, y: 0.833 }], packageId: "drywall", scopeIds: ["scope-20"], evidence: "APC-1 ceiling tags at Fitness Center 106, offices and circulation, 10'-0\".", confidence: 0.88, review: "Safi" }),
  region({ number: "R-016", sheet: "A3.1", label: "Gypsum board ceilings, locker rooms and toilets", polygon: rectangle(0.555, 0.43, 0.155, 0.145), packageId: "drywall", scopeIds: ["scope-21"], evidence: "GWB-1 ceiling tags at the locker/change and toilet/shower rooms, 9'-0\".", confidence: 0.67 }),
];
export const sampleDrawingFlip: DrawingFlipState = { pages, regions, lastRegionNumber: 16 };
