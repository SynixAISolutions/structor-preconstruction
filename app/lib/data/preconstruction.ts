// Sample data and record shapes for the preconstruction screens (documents, takeoffs,
// specs, drawings, revisions). Scopes live in lib/procurement.ts, Structor Check in lib/rfi.ts.
//
// This is illustrative preview content, not data read from drawings or specifications.

export const trades = ["02 · Existing conditions", "03 · Concrete", "04 · Masonry", "05 · Metals", "07 · Thermal & moisture", "08 · Openings", "09 · Finishes", "22 · Plumbing", "23 · HVAC", "26 · Electrical"];

export type LibraryFile = { id: string; name: string; category: string; type: string; size: string; date: string; sample?: boolean; revision: string };
// No "Bid scopes" folder (Marcel, 7 Oct): it existed in BuildingConnected only because scopes were
// exported to PDF and uploaded; Structor's bid forms live in Scopes & bid forms.
export const categories = ["All files", "Drawings", "Specifications", "Reports", "RFP", "Contracts"];
export const sampleFiles: LibraryFile[] = [
  // The real GMP permit set and project manual, stored in Project files (private Blob, not in git).
  { id: "jrc-drawings-251209", name: "JRC_GMP-Permit_Drawings_251209.pdf", category: "Drawings", type: "PDF", size: "166.5 MB", date: "2025-12-09", sample: true, revision: "GMP 12-09-2025" },
  { id: "jrc-manual-251209", name: "JRC_GMP-Permit_Project-Manual_251209.pdf", category: "Specifications", type: "PDF", size: "110.5 MB", date: "2025-12-09", sample: true, revision: "GMP 12-09-2025" },
  { id: "d5", name: "Geotechnical investigation report.pdf", category: "Reports", type: "PDF", size: "4.1 MB", date: "2026-08-29", sample: true, revision: "Final" },
  { id: "d6", name: "Invitation to bid — Jelleff.pdf", category: "RFP", type: "PDF", size: "1.2 MB", date: "2026-08-28", sample: true, revision: "Original" },
  { id: "d7", name: "Subcontract agreement template.docx", category: "Contracts", type: "DOCX", size: "268 KB", date: "2026-08-28", sample: true, revision: "Template" },
];

/** Where an estimate line's quantity came from, when not typed in: a model quantity row or an accepted AI finding. */
export type TakeoffOrigin = { kind: "model"; rowId: string; measured: number } | { kind: "ai"; draftId: string } | { kind: "scope"; draftId: string; scopeId: string };
/**
 * One line of the contractor's own estimate (Quantity takeoffs → Manual quantities). `packageId` is the trade it
 * belongs to (Marcel, 7 Oct: takeoffs by trade, like Scopes & bid forms); rows saved before it existed
 * are placed by lib/estimate.ts. `division` is the older trade label, kept for those rows.
 */
export type TakeoffRow = { id: string; division: string; item: string; unit: string; quantity: number; rate: number; source: string; reviewed: boolean; packageId?: string | null; origin?: TakeoffOrigin };
export const initialTakeoffs: TakeoffRow[] = [
  ...[
    { id: "demo-flatness", packageId: "concrete", division: "03 · Concrete", item: "Concrete slab surface preparation and floor-flatness finishing", quantity: 22500, rate: 1.85, unit: "SF" },
    { id: "demo-hardware", packageId: "openings", division: "08 · Openings", item: "Electrified door hardware installation and access-control interface coordination", quantity: 24, rate: 625, unit: "EA" },
    { id: "demo-roofing", packageId: "thermal", division: "07 · Thermal & moisture", item: "Roof insulation and membrane flashings excluded from partial roofing scope", quantity: 22500, rate: 4.85, unit: "SF" },
    { id: "demo-finish", packageId: "drywall", division: "09 · Finishes", item: "Upgrade back-of-house gypsum board finishing from Level 3 to Level 4", quantity: 4200, rate: 1.4, unit: "SF" },
  ].map(r => ({ ...r, reviewed: true, source: "Illustrative demo quantity and unit rate · 16 Oct 2026 · estimator must confirm the missing portion" })),
  { id: "q1", division: trades[0], packageId: "demolition", item: "Existing building demolition (perimeter)", unit: "LF", quantity: 1240, rate: 14, source: "CIV0102", reviewed: true },
  { id: "q2", division: trades[0], packageId: "demolition", item: "Asphalt pavement removal, full depth", unit: "SF", quantity: 18650, rate: 2.75, source: "CIV0102", reviewed: true },
  { id: "q3", division: trades[0], packageId: "demolition", item: "Site items removed (signs, light poles, fixtures)", unit: "EA", quantity: 38, rate: 185, source: "CIV0102", reviewed: false },
  { id: "q4", division: trades[1], packageId: "concrete", item: "Cast-in-place concrete slab", unit: "CY", quantity: 286, rate: 265, source: "S101", reviewed: false },
  { id: "q5", division: trades[2], packageId: "masonry", item: "8-inch reinforced CMU wall", unit: "SF", quantity: 4280, rate: 32, source: "A1.1", reviewed: false },
  { id: "q6", division: trades[3], packageId: "steel", item: "Structural steel framing", unit: "TON", quantity: 46.5, rate: 3800, source: "S101", reviewed: true },
  { id: "q7", division: trades[4], packageId: "thermal", item: "Single-ply membrane roofing", unit: "SF", quantity: 22500, rate: 12.5, source: "A1.3", reviewed: false },
  { id: "q8", division: trades[5], packageId: "openings", item: "Hollow metal door assemblies", unit: "EA", quantity: 42, rate: 1650, source: "A8.2", reviewed: false },
  { id: "q9", division: trades[6], packageId: "drywall", item: "Painted gypsum wall finish", unit: "SF", quantity: 32400, rate: 2.2, source: "A1.1", reviewed: false },
  // The contractor's illustrative drywall estimate (Marcel's pilot trade): direct cost only, quantities and rates invented.
  { id: "q10", division: trades[6], packageId: "drywall", item: "Metal stud framing, interior partitions", unit: "SF", quantity: 21400, rate: 9.5, source: "A8.1 · Partition types", reviewed: true },
  { id: "q11", division: trades[6], packageId: "drywall", item: "Gypsum board, both faces", unit: "SF", quantity: 42800, rate: 4.1, source: "A8.1 · Partition types", reviewed: true },
  { id: "q12", division: trades[6], packageId: "drywall", item: "Taping and finishing, Level 4", unit: "SF", quantity: 42800, rate: 2.4, source: "09 29 00 · §3.6", reviewed: false },
  { id: "q13", division: trades[6], packageId: "drywall", item: "Sound attenuation blankets", unit: "SF", quantity: 18900, rate: 1.85, source: "09 29 00 · §2.5", reviewed: false },
  { id: "q14", division: trades[6], packageId: "drywall", item: "Shaft wall at elevator and stairs", unit: "SF", quantity: 2300, rate: 16.5, source: "A1.1 · Elevator / stair", reviewed: false },
  { id: "q15", division: trades[6], packageId: "drywall", item: "Acoustical panel ceilings", unit: "SF", quantity: 14600, rate: 7.25, source: "A3.1 · Ceiling legend", reviewed: true },
  { id: "q16", division: trades[6], packageId: "drywall", item: "Gypsum board ceilings and soffits", unit: "SF", quantity: 6200, rate: 14, source: "A3.1 · Ceiling legend", reviewed: false },
];

export type SpecItem = { id: string; section: string; title: string; product: string; manufacturer: string; submittal: string; source: string; reviewed: boolean };
export const initialSpecs: SpecItem[] = [
  { id: "p1", section: "03 30 00", title: "Cast-in-place concrete", product: "4,000 PSI normal-weight concrete", manufacturer: "Approved ready-mix supplier", submittal: "Mix design · Test reports", source: "Project manual · p. 126", reviewed: true },
  { id: "p2", section: "04 22 00", title: "Concrete unit masonry", product: "8-inch normal-weight CMU", manufacturer: "Basis of design: standard ASTM C90", submittal: "Product data · Samples", source: "Project manual · p. 164", reviewed: false },
  { id: "p3", section: "07 54 23", title: "TPO roofing", product: "60-mil reinforced TPO membrane", manufacturer: "Carlisle / Firestone / GAF", submittal: "Shop drawings · Warranty", source: "Project manual · p. 248", reviewed: false },
  { id: "p4", section: "08 11 13", title: "Hollow metal doors & frames", product: "Level 3 · 16-gauge galvanized", manufacturer: "Steelcraft / Ceco / Curries", submittal: "Door schedule · Product data", source: "Project manual · p. 292", reviewed: true },
  { id: "p5", section: "09 29 00", title: "Gypsum board", product: "5/8-inch Type X gypsum board", manufacturer: "USG / National Gypsum / CertainTeed", submittal: "Product data · Assembly ratings", source: "Project manual · p. 346", reviewed: true },
  { id: "p6", section: "09 65 19", title: "Resilient tile flooring", product: "Luxury vinyl tile · Type LVT-1", manufacturer: "To be selected by architect", submittal: "Finish samples · Maintenance", source: "Project manual · p. 368", reviewed: false },
  { id: "p7", section: "23 73 13", title: "Air handling units", product: "Packaged rooftop air handling unit", manufacturer: "Trane / Carrier / Daikin", submittal: "Equipment data · Controls diagram", source: "Project manual · p. 564", reviewed: false },
];

export type Drawing = { id: string; title: string; discipline: string; date: string; received: string; revision: string; status: string };
export const initialDrawings: Drawing[] = [
  { id: "G-001", title: "Cover sheet & drawing index", discipline: "General", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "CIV0102", title: "Demolition plan", discipline: "Civil", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "A1.1", title: "Level 01 - First floor plan", discipline: "Architectural", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "A1.3", title: "Roof plan", discipline: "Architectural", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "A3.1", title: "Level 01 - Reflected ceiling plan", discipline: "Architectural", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "A8.1", title: "Partition types", discipline: "Architectural", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "A8.2", title: "Door & frame type & schedule", discipline: "Architectural", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "S101", title: "Level 01 - First floor framing plan", discipline: "Structural", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "M101", title: "Level 01 - HVAC plan", discipline: "Mechanical", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "P2.1", title: "Level 01 - Overall plumbing plan", discipline: "Plumbing", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
  { id: "E1.1", title: "Level 01 - Lighting plan", discipline: "Electrical", date: "2025-12-09", received: "2025-12-10", revision: "GMP", status: "Current" },
];

/**
 * List of specifications: one row per project-manual section, the written counterpart of
 * the drawing list. `id` is the MasterFormat section number (csiDivision(id) gives its
 * division). Submittal packages (initialSpecs) reference these by `section`. Sample rows.
 */
export type SpecSection = { id: string; title: string; date: string; received: string; revision: string; status: string; pages: string };
export const initialSpecSections: SpecSection[] = [
  { id: "01 10 00", title: "Summary", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 12–18" },
  { id: "01 33 00", title: "Submittal procedures", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 41–49" },
  { id: "02 41 19", title: "Selective demolition", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 102–109" },
  { id: "03 30 00", title: "Cast-in-place concrete", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 126–141" },
  { id: "04 22 00", title: "Concrete unit masonry", date: "2026-08-21", received: "2026-08-22", revision: "01", status: "Current", pages: "pp. 164–175" },
  { id: "05 12 00", title: "Structural steel framing", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 188–199" },
  { id: "07 54 23", title: "Thermoplastic-polyolefin (TPO) roofing", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 248–259" },
  { id: "08 11 13", title: "Hollow metal doors and frames", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 292–301" },
  { id: "09 29 00", title: "Gypsum board", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current", pages: "pp. 346–355" },
  { id: "09 65 19", title: "Resilient tile flooring", date: "2026-08-21", received: "2026-08-22", revision: "01", status: "Current", pages: "pp. 368–373" },
  { id: "23 73 13", title: "Modular indoor central-station air-handling units", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current", pages: "pp. 564–577" },
  { id: "26 51 00", title: "Interior lighting", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current", pages: "pp. 702–711" },
];

export type DrawingChange ={ id: string; title: string; detail: string; division: string; impact: string; reviewed: boolean; kind: string };
export const initialChanges: DrawingChange[] = [
  { id: "01", title: "Community room partition added", detail: "A new partition divides the east community room into two smaller spaces. Review wall, finish, and door scope.", division: "09 · Finishes", impact: "+84 SF wall area", reviewed: false, kind: "Added" },
  { id: "02", title: "Lobby opening relocated", detail: "The opening in the south lobby wall moves 4 feet east. Coordinate framing, egress, and adjacent millwork.", division: "08 · Openings", impact: "1 opening affected", reviewed: false, kind: "Modified" },
  { id: "03", title: "Room finish designation updated", detail: "The finish designation in the community room changes from VCT-1 to LVT-1. Revisit pricing and submittals.", division: "09 · Finishes", impact: "640 SF finish affected", reviewed: true, kind: "Modified" },
];
