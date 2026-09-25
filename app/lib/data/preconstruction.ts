// Sample data and record shapes for the preconstruction screens (documents, takeoffs,
// specs, Structor Check, drawings, revisions). Scopes live in lib/procurement.ts.
//
// This is illustrative preview content, not data read from drawings or specifications.

export const trades = ["02 · Existing conditions", "03 · Concrete", "04 · Masonry", "05 · Metals", "07 · Thermal & moisture", "08 · Openings", "09 · Finishes", "22 · Plumbing", "23 · HVAC", "26 · Electrical"];

export type LibraryFile = { id: string; name: string; category: string; type: string; size: string; date: string; sample?: boolean; revision: string };
export const categories = ["All files", "Drawings", "Specifications", "Reports", "RFP", "Contracts", "Bid scopes"];
export const sampleFiles: LibraryFile[] = [
  { id: "d1", name: "Architectural drawing set.pdf", category: "Drawings", type: "PDF", size: "24.8 MB", date: "2026-09-08", sample: true, revision: "Rev 02" },
  { id: "d2", name: "Structural drawing set.pdf", category: "Drawings", type: "PDF", size: "12.4 MB", date: "2026-09-08", sample: true, revision: "Rev 02" },
  { id: "d3", name: "MEP drawing set.pdf", category: "Drawings", type: "PDF", size: "18.6 MB", date: "2026-09-06", sample: true, revision: "Rev 01" },
  { id: "d4", name: "Project manual & specifications.pdf", category: "Specifications", type: "PDF", size: "8.2 MB", date: "2026-09-05", sample: true, revision: "Rev 01" },
  { id: "d5", name: "Geotechnical investigation report.pdf", category: "Reports", type: "PDF", size: "4.1 MB", date: "2026-08-29", sample: true, revision: "Final" },
  { id: "d6", name: "Invitation to bid — Jelleff.pdf", category: "RFP", type: "PDF", size: "1.2 MB", date: "2026-08-28", sample: true, revision: "Original" },
  { id: "d7", name: "Subcontract agreement template.docx", category: "Contracts", type: "DOCX", size: "268 KB", date: "2026-08-28", sample: true, revision: "Template" },
  { id: "d8", name: "02 41 00 — Demolition scope.xlsx", category: "Bid scopes", type: "XLSX", size: "86 KB", date: "2026-09-09", sample: true, revision: "Draft 03" },
];

export type TakeoffRow = { id: string; division: string; item: string; unit: string; quantity: number; rate: number; source: string; reviewed: boolean };
export const initialTakeoffs: TakeoffRow[] = [
  { id: "q1", division: trades[0], item: "Interior partition demolition", unit: "LF", quantity: 1240, rate: 14, source: "AD-101", reviewed: true },
  { id: "q2", division: trades[0], item: "Floor finish removal", unit: "SF", quantity: 18650, rate: 2.75, source: "AD-101", reviewed: true },
  { id: "q3", division: trades[0], item: "Door & frame removal", unit: "EA", quantity: 38, rate: 185, source: "AD-101", reviewed: false },
  { id: "q4", division: trades[1], item: "Cast-in-place concrete slab", unit: "CY", quantity: 286, rate: 265, source: "S-101", reviewed: false },
  { id: "q5", division: trades[2], item: "8-inch reinforced CMU wall", unit: "SF", quantity: 4280, rate: 32, source: "A-101", reviewed: false },
  { id: "q6", division: trades[3], item: "Structural steel framing", unit: "TON", quantity: 46.5, rate: 3800, source: "S-101", reviewed: true },
  { id: "q7", division: trades[4], item: "Single-ply membrane roofing", unit: "SF", quantity: 22500, rate: 12.5, source: "A-102", reviewed: false },
  { id: "q8", division: trades[5], item: "Hollow metal door assemblies", unit: "EA", quantity: 42, rate: 1650, source: "A-601", reviewed: false },
  { id: "q9", division: trades[6], item: "Painted gypsum wall finish", unit: "SF", quantity: 32400, rate: 2.2, source: "A-101", reviewed: false },
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

export type CheckIssue = { id: string; title: string; detail: string; type: string; priority: string; trade: string; source: string; crossReference: string; status: string; rfi?: string; question?: string; assignee?: string; due?: string };
export const initialIssues: CheckIssue[] = [
  { id: "SC-001", title: "Roof fall-restraint anchors are not detailed", detail: "The roof access notes require fall protection, but the current roof plan does not identify anchor positions, loading, or attachment details. Confirm responsibility and design criteria before issuing the roofing package.", type: "Missing detail", priority: "High", trade: "07 · Roofing", source: "A-102 · Roof plan", crossReference: "07 72 00 · Roof accessories", status: "Open" },
  { id: "SC-002", title: "Door D-104 fire rating does not match the schedule", detail: "The partition plan indicates a rated corridor wall. The door schedule lists D-104 without a rating. Ask the architect to reconcile the door and wall assembly requirements.", type: "Conflict", priority: "High", trade: "08 · Openings", source: "A-101 · Room 104", crossReference: "A-601 · Door schedule", status: "Open" },
  { id: "SC-003", title: "Floor finish is not defined for storage room 118", detail: "Room 118 is shown on the floor plan, but its finish schedule entry is blank. The flooring allowance and scope require confirmation.", type: "Missing information", priority: "Medium", trade: "09 · Finishes", source: "A-101 · Room 118", crossReference: "A-701 · Finish schedule", status: "Open" },
  { id: "SC-004", title: "Structural opening conflicts with duct routing", detail: "The supply duct route crosses the beam line at grid C without a coordinated penetration detail. Confirm the final route or approved structural opening.", type: "Coordination", priority: "High", trade: "23 · HVAC", source: "M-101 · Grid C", crossReference: "S-101 · Framing plan", status: "Open" },
  { id: "SC-005", title: "Exterior wall air-barrier transition needs confirmation", detail: "The wall section shows an air barrier but does not call out the transition at the storefront head. Confirm the termination and compatible materials.", type: "Missing detail", priority: "Medium", trade: "07 · Envelope", source: "A-501 · Detail 4", crossReference: "07 27 00 · Air barriers", status: "Resolved" },
];

export type Drawing = { id: string; title: string; discipline: string; date: string; received: string; revision: string; status: string };
export const initialDrawings: Drawing[] = [
  { id: "G-001", title: "Cover sheet & drawing index", discipline: "General", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "AD-101", title: "First floor demolition plan", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "A-101", title: "First floor plan", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "A-102", title: "Roof plan", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "A-501", title: "Wall sections & details", discipline: "Architectural", date: "2026-08-21", received: "2026-08-22", revision: "01", status: "Current" },
  { id: "A-601", title: "Door & frame schedules", discipline: "Architectural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "S-101", title: "Foundation & framing plan", discipline: "Structural", date: "2026-09-08", received: "2026-09-09", revision: "02", status: "Current" },
  { id: "M-101", title: "First floor mechanical plan", discipline: "Mechanical", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current" },
  { id: "P-101", title: "First floor plumbing plan", discipline: "Plumbing", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current" },
  { id: "E-101", title: "Lighting & power plan", discipline: "Electrical", date: "2026-09-06", received: "2026-09-07", revision: "01", status: "Current" },
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
