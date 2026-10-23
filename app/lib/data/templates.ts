// Customer document templates. Marcel (20 Sep, 17:28–17:52): each GC gives us its subcontract
// and Exhibit A templates and the documents should "look exactly like that".
//
// Contractor (Marcel's company): structure and wording from "Exhibit A Shell Template Shell All
// Trades 25_0314" and "00 Subcontract Agreement". Project facts are {placeholders}. Shell notes
// that vary by project (tax-exempt, wage scale, SBE/CBE, LEED) are kept as the shell has them;
// edit them per project in an Exhibit A revision. The subcontract's full legal text (articles
// 1–29) is referenced, not reproduced.

import type { DocumentTemplate } from "../award";

const EXHIBIT_SHELL: DocumentTemplate = {
  id: "mcn-exhibit-a", name: "Contractor Exhibit A (all trades shell)", version: "25_0314", sample: false,
  notice: "The contractor's Exhibit A shell. Check the project-specific general notes before sharing.",
  layout: {
    title: "Exhibit A — Scope of Work · {tradeCode} {trade}",
    blocks: [
      { kind: "text", heading: "Exhibit A — Scope of Work", lines: ["{trade}", "{owner}", "{project}", "{projectAddress}"] },
      { kind: "text", heading: "Purpose", lines: [
        "The following is a part of this bid package and will be attached to the successful bidder's subcontract agreement or purchase order as Exhibit A – Scope of Work.",
        "It is the intent of this Scope of Work to define the parameters to establish a Lump Sum Price to furnish and install all scope as shown, described, and / or implied by the Contract Documents. This scope of work is NOT intended to supplement and / or supersede requirements of the Contract Documents. If conflicts between this document and the Contract Documents occur; it shall be brought to the attention of Contractor a minimum of three (3) days prior to bid and will be resolved by Contractor amendment or Bid Addendum.",
      ] },
      { kind: "text", heading: "Instructions to bidders", lines: ["Subcontractor acknowledges latest Instructions to Bidders document. Latest version is: Revision 1 - May 1, 2019."] },
      { kind: "text", heading: "General notes for scope of work — this scope of the work includes, but is not limited to, the following notes", numbered: true, lines: [
        "It is the intent of this bid package to competitively select the most qualified subcontractor to complete the work for this project. The selection will incorporate an evaluation of cost, schedule, staff commitment, safety record, and safety plan.",
        "Bidders are to familiarize themselves with the site conditions and access to the project site prior to submission of bid.",
        "Bidders certify they have familiarized themselves with the Project Schedule and Phasing Plans and have accounted for any and all overtime, demobilization, remobilization to meet the required schedule.",
        "Subcontractor will be responsible for protecting existing structures and property, personnel and the work of other subcontractors in carrying out his work. Damage caused by this subcontractor or his work forces shall be repaired and/or replaced at this subcontractor's expense.",
        "Subcontractor shall be responsible to properly coordinate his portion of work with both Contractor and other subcontractors. No extra compensation will be paid to this subcontractor for relocating any material or equipment that has been installed or mobilized without proper coordination between all subcontractors.",
        "All bids must include an Add Alternate for Payment and Performance Bond Costs. The bond costs shall be stated separately on the bid form in the space provided below.",
        "This is a tax-exempt project for all materials put in place.",
        "This project is subject to wage scale requirements – SEE ATTACHED WAGE DECISION",
        "This project required SBE/CBE participation and compliance with First Source 2011. See Section 4.0 Labor Requirements Participation for further details.",
        "Safety and the health and welfare of all on-site employees are of the utmost concern for this project. In such, all on-site activities will be performed in complete conformance with federal, state and local governing authorities including OSHA requirements and the Contractor Safety Plan referenced in Exhibit D.",
        "Include all layout costs associated with this scope of work. Contractor will provide one set of control points / benchmarks for this Subcontractor's work. All other engineering, surveying, and layout requirements are the responsibility of this Subcontractor for his Work.",
        "Subcontractor is responsible for all hoisting, placing, scaffolding, lifts, and setting required of their material and equipment. Subcontractor is not to assume the use of other trades equipment or means of access, unless specifically noted in Section 2.0 Specific Notes for Scope of Work below.",
        "All trade subcontractors shall provide any and all flagmen and traffic control measures as required for the safe operations of their work.",
        "This Subcontractor shall be responsible for all temporary power cords and boxes, and task lighting necessary for the execution of this scope of work. Temporary field provided power and lighting are limited to small hand tools (120V) and general low-level lighting per OSHA requirements.",
        "Coordination, preparation, and application of all testing and inspections required by the authorities having jurisdiction over this project.",
        "Include all coordination, engineering, submittals, pricing, etc. associated with LEED certification and any other project sustainability goals as it relates to your Scope of Work. This project is targeting LEED Gold.",
        "Street cleaning of any/all public roads will be required and as further indicated here is included in this scope of work. Any soil or debris on all public and/or adjacent roads will be removed on a daily basis by this subcontractor or as deemed necessary by Contractor Supervision or Local governing agencies.",
        "Daily cleanup of all trash and debris resulting from the Work and placement in dumpsters provided by the Contractor.",
        "This Subcontractor is responsible for a weekly, full day, composite clean-up crew for the duration of the Project while onsite. The composite crew consists of one (1) man for one (1) to seven (7) men onsite, two (2) men for eight (8) to 16 men onsite, or three (3) men for 17 or more men onsite. Provide breakout for composite clean-up crew in bid form.",
        "Management and control of dust and debris for the Work.",
        "Provide all necessary penetrations, sleeves, cores, etc. required for this work, unless specifically shown on the Demolition and Structural drawings. Seal all penetrations to the same rating as the construction that they penetrate and as noted on the drawings. Caulking and sealant required for your trade must be included in your base bid. Fire-safing and fire-rated sealant of penetrations through rated walls, floors and ceiling shall be included in the base bid of the trade, which requires the penetration. Contractor or other trades will not be furnishing or installing this work. Temporary covering and making safe of the penetrations are the responsibility of this subcontractor.",
        "Subcontractor is responsible for all X-ray and GPR costs necessary for the Work.",
        "Subcontractor is required to obtain and pay for all permits (state, federal, county, local, environmental, and government) required for this Work.",
        "Warranties and guarantees for the Work.",
        "Shop drawings and submittals for the Work.",
        "Subcontractor to provide two hard copies of shop drawings to the field.",
        "This Subcontractor will present to Contractor as-built drawings that certifies the Work was installed as shown and/or documenting any approved variation from the Contract Documents. Locations of lines must be dimensioned from column lines or other permanent features. Subcontractor shall update and maintain weekly red-lined as-built drawings subject to Contractor review.",
        "Licenses, tests, fees, and inspections per Contract Documents required by the Work and applicable codes.",
        "Subcontractor to provide MSDS in a printed binder.",
        "Maintenance for this Subcontractor's Work as required by the Contract Documents.",
        "Mock-ups for the Work as required by the Contract Documents or directed by Contractor.",
        "All work hours and noise control will conform to local and county ordinances.",
      ] },
      { kind: "text", heading: "Subcontractor is bound to all Subcontract Agreement Exhibits", lines: [
        "Exhibit A: Scope of Work", "Exhibit B: List of Documents", "Exhibit C: Insurance Requirements", "Exhibit D: Safety Plan", "Exhibit E: Schedule",
        "Exhibit F: Billing Package (Wage Scale)", "Exhibit G: Quality Control Plan", "Exhibit H: Project Closeout Requirements", "Exhibit I: Compliance Requirements (LEED)",
        "Exhibit TBD: Prime Contract with Owner", "Exhibit TBD2: BIM Plan",
      ] },
      { kind: "scope", heading: "Scope of work",
        intro: "The scope of work of this Subcontract includes, but is not necessarily limited to, providing all labor, materials, equipment, and supervision required to complete the above-referenced scope of work in strict accordance with the Contract Documents and as more specifically defined and as reasonably inferred for a complete and operable scope in the sections listed above and as clarified below:",
        append: ["Provide an ADD ALTERNATE Payment and Performance Bond."],
        // MCN's Exhibit As open section 3 with the documents the trade is priced on, with dates (the drawing set,
        // the trade's spec sections, reports), from the project's files; these lines when it has none.
        documents: [
          "Division 00 — Procurement and Contracting Requirements (as applies to this Bid Package)",
          "Division 01 — General Requirements (as applies to this Bid Package)",
          "{tradeCode} — {trade}",
        ] },
      { kind: "exclusions", heading: "Scope exclusions" },
      { kind: "not-applicable", heading: "Not applicable" },
      { kind: "clarifications", heading: "Clarifications" },
      { kind: "alternates", heading: "Alternates offered (not included unless accepted in writing)" },
      { kind: "allowances", heading: "Allowances" },
      { kind: "text", heading: "Phasing & schedule highlights", lines: [
        "See Exhibit E for project schedule. This is a high-level overview of the schedule as it pertains to this work.",
        "Project Commencement – {start}",
        "Project Substantial Completion – {finish}",
        "Include in your base bid the cost for all overtime and premium time work associated with completion of your trade's scope of work per the contractor's project schedule (Exhibit E).",
      ] },
      { kind: "text", heading: "Economic inclusion requirements", lines: [
        "This project includes a subcontracting goal that promotes participation of local and small business concerns. If your company is a Certified Business Enterprise (CBE) that is self-performing all of the Work please provide your CBE Certification number and all applicable CBE categories (LBE, SBE, etc.):",
        "CBE Certification Number: ____________",
        "If the above section is complete, Subcontractor does not need to complete the 2nd Tier Subcontractor following.",
        "If Subcontractor intends to subcontract a portion of the Work included under this Subcontract, the Subcontractor warrants the performance and participation of the below listed sub-subcontractors/suppliers for the duration of the project. The Subcontractor shall not replace or re-assign the listed sub-subcontractors/suppliers or portions of the Work without prior notification to and approval by the construction manager.",
        "2nd tier subcontractor · CBE certification number · scope of work · anticipated start/end date · 2nd tier subcontract value: ____________",
        "Subcontractors with awards exceeding $250,000 will provide the following participation and the corresponding percentage of final Subcontract Amount:",
        "Local Business Enterprise (LBE): $________ ____%",
        "Small Business Enterprise (SBE): $________ ____%",
        "Disadvantaged Business Enterprise (DBE): $________ ____%",
        "Development Enterprise Zone (DEZ): $________ ____%",
        "Resident Owned Business Enterprise (ROB): $________ ____%",
        "Longtime Resident Owned (LRO): $________ ____%",
        "Veteran Owned Business Enterprise (VBE): $________ ____%",
        "Local Manufacturing Business (LMB): $________ ____%",
      ] },
      { kind: "text", heading: "Subcontract amount", lines: ["{amount}, the {basis} from bid leveling (bid revision {bidRevision}, bid form version {formVersion})."] },
      { kind: "text", heading: "- End of Exhibit A -", lines: ["{template}"] },
    ],
  },
};

const shellBlocks = EXHIBIT_SHELL.layout!.blocks;
export const MCN_EXHIBIT_TEMPLATE: DocumentTemplate = {
  ...EXHIBIT_SHELL, version: "25_0314-section-3",
  layout: { ...EXHIBIT_SHELL.layout!, blocks: [
    shellBlocks[0],
    { kind: "text", heading: "General requirements", lines: shellBlocks.slice(1, 5).flatMap(b => b.kind === "text" ? [b.heading, ...b.lines.map((line, i) => `${b.numbered ? `${i + 1}. ` : ""}${line}`)] : []) },
    ...shellBlocks.slice(5),
  ] },
};

export const MCN_SUBCONTRACT_TEMPLATE: DocumentTemplate = {
  id: "mcn-subcontract", name: "Contractor Subcontract Agreement", version: "DGS", sample: false,
  notice: "The contractor's subcontract agreement. Articles 1–29 apply as in the contractor's full agreement.",
  layout: {
    title: "Subcontract agreement · {trade}",
    blocks: [
      { kind: "text", heading: "{contractor}", lines: ["1214 28th Street, N.W., Washington, D.C. 20007", "Phone: 202.333.3424 · Fax: 202.333.3425"] },
      { kind: "text", heading: "Subcontract agreement by & between", lines: ["The Contractor: {contractor}", "The Subcontractor: {subcontractor}", "Subcontractor contact: {subcontractorContact} <{subcontractorEmail}>"] },
      { kind: "text", heading: "The project", lines: ["Job Name: {project}", "Location: {projectAddress}", "Owner: {owner}", "Cost Code: {tradeCode}"] },
      { kind: "text", heading: "Agreement", lines: ["THIS SUBCONTRACT is made by and between {contractor} (\"Contractor\") and {subcontractor} (\"Subcontractor\") for the Work described in Exhibit A, revision {exhibitRevision}."] },
      { kind: "text", heading: "3.1 Total Subcontract Price", lines: ["Contractor shall pay Subcontractor for the performance of the Work, subject to additions and deductions by change order, the sum of {amount}."] },
      { kind: "text", heading: "Terms", lines: ["Articles 1 through 29 of the {contractor} Subcontract Agreement apply in full: contract documents, price and payment, schedule and delays, liability and indemnity, insurance, labor requirements (Davis-Bacon, Living Wage, records), taxes, correction of work, changes, claims and disputes, default and termination, and general provisions. The complete legal text is not reproduced in this demo."] },
      { kind: "text", heading: "Exhibits", lines: [
        "Exhibit A: Scope of Work (revision {exhibitRevision})", "Exhibit B: List of Documents", "Exhibit C: Insurance Requirements", "Exhibit D: Safety Plan", "Exhibit E: Schedule",
        "Exhibit F: Billing Package (Wage Scale)", "Exhibit G: Quality Control Plan", "Exhibit H: Project Closeout Requirements", "Exhibit I: Compliance Requirements (LEED)",
      ] },
      { kind: "text", heading: "Template", lines: ["{template}"] },
    ],
  },
};
