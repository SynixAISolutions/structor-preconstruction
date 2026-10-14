// Sample Drawing Flip for the Jelleff project: nine sheets from the drawing sets in Project files
// and the regions Structor proposed on them. Illustrative demo data — nothing was read from the
// drawings. Package and scope ids are the sample procurement's (lib/data/procurement.ts).

import { rectangle, type DrawingFlipState, type DrawingPage, type FlipRegion, type Point, type RegionEvent } from "../drawing-flip";

const page = (sheet: string, title: string, discipline: string, documentId: string, documentName: string, pageNumber: number, revision: string): DrawingPage =>
  ({ id: `pg-${sheet.toLowerCase()}`, sheet, title, discipline, revision, documentId, documentName, pageNumber, aspect: 1.5, image: null });

const ARCH = "Architectural drawing set.pdf", STRUCT = "Structural drawing set.pdf", MEP = "MEP drawing set.pdf";
const pages: DrawingPage[] = [
  page("AD-101", "First floor demolition plan", "Architectural", "d1", ARCH, 2, "02"),
  page("A-101", "First floor plan", "Architectural", "d1", ARCH, 3, "02"),
  page("A-102", "Roof plan", "Architectural", "d1", ARCH, 4, "02"),
  page("A-121", "First floor reflected ceiling plan", "Architectural", "d1", ARCH, 5, "02"),
  page("A-601", "Door & frame schedules", "Architectural", "d1", ARCH, 6, "02"),
  page("S-101", "Foundation & framing plan", "Structural", "d2", STRUCT, 1, "02"),
  page("M-101", "First floor mechanical plan", "Mechanical", "d3", MEP, 1, "01"),
  page("P-101", "First floor plumbing plan", "Plumbing", "d3", MEP, 2, "01"),
  page("E-101", "Lighting & power plan", "Electrical", "d3", MEP, 3, "01"),
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
  region({ number: "R-001", sheet: "AD-101", label: "Interior partitions to be removed", polygon: [{ x: 0.12, y: 0.18 }, { x: 0.46, y: 0.18 }, { x: 0.46, y: 0.34 }, { x: 0.3, y: 0.34 }, { x: 0.3, y: 0.52 }, { x: 0.12, y: 0.52 }], packageId: "demolition", scopeIds: ["scope-1"], evidence: "Dashed walls per the demolition legend; keynote 01 “Remove partition”.", confidence: 0.93, review: "Safi" }),
  region({ number: "R-002", sheet: "AD-101", label: "Resilient flooring removal area", polygon: rectangle(0.5, 0.2, 0.32, 0.36), packageId: "demolition", scopeIds: ["scope-2"], evidence: "Hatched area with keynote 04 “Remove flooring and base”.", confidence: 0.88 }),
  region({ number: "R-003", sheet: "AD-101", label: "Doors and frames to be removed", polygon: rectangle(0.14, 0.6, 0.2, 0.12), packageId: "demolition", scopeIds: ["scope-4"], evidence: "Door symbols with keynote 07 “Remove door, frame and hardware”.", confidence: 0.64, correctedFrom: { packageId: "openings", by: "Safi", reason: "Removing existing doors is demolition; the new doors are the openings package." } }),
  region({ number: "R-004", sheet: "A-101", label: "Reinforced CMU partitions", polygon: rectangle(0.1, 0.22, 0.24, 0.3), packageId: "masonry", scopeIds: ["scope-7"], evidence: "Wall type 4 tag and CMU hatch on the floor plan.", confidence: 0.9 }),
  region({ number: "R-005", sheet: "A-101", label: "Gypsum board partitions", polygon: rectangle(0.38, 0.22, 0.3, 0.3), packageId: "drywall", scopeIds: ["scope-12"], evidence: "Wall types 1 and 2 (metal stud and gypsum board).", confidence: 0.86, review: "Safi" }),
  region({ number: "R-006", sheet: "A-101", label: "Community room LVT flooring", polygon: rectangle(0.62, 0.58, 0.26, 0.28), packageId: "flooring", scopeIds: ["scope-13"], evidence: "Finish tag LVT-1 in rooms 110–112.", confidence: 0.77 }),
  region({ number: "R-007", sheet: "A-102", label: "TPO roof membrane", polygon: rectangle(0.08, 0.1, 0.84, 0.72), packageId: "thermal", scopeIds: [], evidence: "Roof plan note “60-mil TPO over tapered insulation”.", confidence: 0.91 }),
  region({ number: "R-008", sheet: "A-601", label: "Scheduled hollow metal doors", polygon: rectangle(0.06, 0.12, 0.58, 0.5), packageId: "openings", scopeIds: ["scope-11"], evidence: "Door schedule rows D-101 to D-142, type HM.", confidence: 0.72 }),
  region({ number: "R-009", sheet: "S-101", label: "Slab on grade and foundations", polygon: rectangle(0.06, 0.1, 0.86, 0.76), packageId: "concrete", scopeIds: ["scope-5"], evidence: "Foundation plan with slab-on-grade notes and footing schedule.", confidence: 0.95, review: "Vijay" }),
  region({ number: "R-010", sheet: "M-101", label: "Main supply duct run", polygon: [{ x: 0.1, y: 0.4 }, { x: 0.86, y: 0.4 }, { x: 0.86, y: 0.46 }, { x: 0.52, y: 0.46 }, { x: 0.52, y: 0.8 }, { x: 0.46, y: 0.8 }, { x: 0.46, y: 0.46 }, { x: 0.1, y: 0.46 }], packageId: "mechanical", scopeIds: ["scope-15"], evidence: "Supply duct from RTU-1, sized 24×14 to 12×10.", confidence: 0.83 }),
  region({ number: "R-011", sheet: "P-101", label: "Restroom plumbing fixtures", polygon: rectangle(0.58, 0.16, 0.22, 0.2), packageId: "plumbing", scopeIds: ["scope-14"], evidence: "Fixture tags WC-1, LAV-1 and UR-1 in restrooms 104 and 105.", confidence: 0.69 }),
  region({ number: "R-012", sheet: "E-101", label: "Gym lighting", polygon: rectangle(0.16, 0.18, 0.4, 0.46), packageId: "electrical", scopeIds: ["scope-16"], evidence: "", confidence: null, review: "Naija", notes: "High-bay fixtures; confirm the gym lighting controls with the architect." }),
  // Drywall, Marcel's pilot trade: framing and shaft wall on the plan, ceilings on the reflected ceiling plan.
  region({ number: "R-013", sheet: "A-101", label: "Metal stud partitions, community wing", polygon: rectangle(0.38, 0.56, 0.22, 0.26), packageId: "drywall", scopeIds: ["scope-17", "scope-18"], evidence: "Partition type tags on the community room walls; sound-rated types around rooms 110–112.", confidence: 0.81, review: "Safi" }),
  region({ number: "R-014", sheet: "A-101", label: "Shaft walls at elevator and stair", polygon: rectangle(0.72, 0.18, 0.12, 0.16), packageId: "drywall", scopeIds: ["scope-19"], evidence: "Shaft wall type at the elevator hoistway and stair B enclosure.", confidence: 0.74 }),
  region({ number: "R-015", sheet: "A-121", label: "Acoustical panel ceilings", polygon: rectangle(0.36, 0.2, 0.42, 0.34), packageId: "drywall", scopeIds: ["scope-20"], evidence: "Ceiling tag ACT-1 (2x2 lay-in) in the community rooms and corridors.", confidence: 0.88, review: "Safi" }),
  region({ number: "R-016", sheet: "A-121", label: "Gypsum board ceilings and soffits", polygon: rectangle(0.1, 0.6, 0.3, 0.22), packageId: "drywall", scopeIds: ["scope-21"], evidence: "Ceiling tag GWB-1 in restrooms and the lobby soffit.", confidence: 0.67 }),
];

export const sampleDrawingFlip: DrawingFlipState = { pages, regions, lastRegionNumber: 16 };
