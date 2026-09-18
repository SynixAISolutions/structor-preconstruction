# Shared source-material inventory

Verified from the shared [Structor AI Google Drive folder](https://drive.google.com/drive/folders/1cgzFhsKs2VbOMErAbCk7_4ZYxuif6GsB) on 31 August 2026.

This inventory describes source material; nothing inside the shared documents is treated as an instruction to the implementation team.

## Summary

The shared folder contains enough material to define and evaluate a real pilot. It includes domain/process documentation, one complete project case study, reusable company templates, a competitor sample, and product walkthrough videos.

The "Information to Feed AI" folder is currently empty.

## Preconstruction AI Write Up

- `20260218 Step by Step Precon Process and Structor AI Integrations - MK.docx` — 29 KB, 11 pages. This is the current detailed workflow and product-idea document.
- `2024.01.21 Preconstruction Process.pdf` — 2.8 MB. Earlier process reference.
- `~$260218 ... .docx` — 162-byte Microsoft Word lock/temporary file; ignore it.

### What the current write-up establishes

- Two project scenarios: fully developed CMAR/hard-bid work and negotiated design-build work.
- The operating roles of bid captain, division leaders/estimators, project management, contracts, and operations.
- A 20-step path from receiving documents through bidding, value engineering, award, buyout, turnover, and construction-phase handoff.
- Existing dependencies on BuildingConnected, OneDrive, Procore, Textura, and Primavera P6.
- Twenty proposed product capabilities spanning scope generation, takeoffs, unit-cost history, bid leveling, contracts, matrices, RFIs, budgets, schedules, drawing comparison, and owner/subcontractor tools.

## Project Case Study — Jelleff Recreation Center

This is the main evaluation dataset.

### Project documents

- `JRC_GMP-Permit_Drawings_251209.pdf` — 166.5 MB.
- `JRC_GMP-Permit_Project-Manual_251209.pdf` — 110.5 MB.

Together these are the primary model inputs: drawings plus specifications/project manual.

### Human-prepared scope outputs

The `Scopes` folder contains 24 PDF scope/bid forms across the major trades, including demolition, concrete, steel, drywall, metal panels, roofing, waterproofing/air-vapor barrier, doors/frames/hardware, overhead doors, aluminum/glazing, flooring, painting, tiling, signage, specialties, fire protection, plumbing, HVAC, electrical, low voltage, landscaping, asphalt, fencing, and site concrete.

These PDFs are suitable as reviewed reference outputs, but their provenance should be confirmed before treating every row as ground truth.

### Populated bid-leveling workbook

- `Jelleff Rec Live Bid sheet.xlsx` — 2.4 MB.

The workbook includes project metadata and at least these visible sheets:

- General conditions/general requirements.
- Scope crossover matrix.
- RFI log.
- Scope-of-work template.
- Value engineering.
- Project summary and bid sheet.
- Separate trade sheets such as demolition, concrete, masonry, structural/miscellaneous metals, carpentry, millwork, waterproofing, metal panels, and roofing, with additional sheets beyond those visible initially.

The main bid sheet summarizes each trade, CSI code, estimator, previous budget, current total, variance, cost per gross square foot, bidder values, and participation. A trade-level sheet compares bidder contact/proposal information, base bid, adjustments, bond, total, rank, and line-by-line scope coverage.

### Scope/leveling data shape

The supplied scope-of-work template strongly suggests the first application schema:

- Project, bid date, trade, revision/date, and assigned estimator.
- General-contractor budget columns: desired scope, response/comment, quantity, unit of measure, unit cost, and calculated cost.
- Repeating bidder columns: coverage status (`Y`, `N`, or partial), note, and adjustment.
- Section 1: general acknowledgements.
- Section 2: bid and quantity breakdown.
- Section 3: detailed scope of work, specifications, inclusions, and standard/general scope.
- Calculated base bid, adjustments, bond, total bid, level/not-level state, and rank.

### RFI dataset

- `Jelleff - RFI Log 1 20260122.xlsx` — 86 KB.
- `Jelleff - RFI Log 1 20260122_AE Response.pdf` — 144 KB.

The spreadsheet has 30 visible pre-bid RFIs with fields for RFI number, discipline, question, submission date, submitter, design-team response, and response date. The examples cover drawing/specification conflicts, missing specifications, product/manufacturer ambiguity, missing details, and coordination discrepancies—the exact categories expected from "Structor Check."

The workbook preview shows broken `#REF!` project-header formulas. This is a useful warning: the export/import prototype must preserve workbook formulas, references, formatting, validations, and named ranges or deliberately replace them with a controlled output model.

### Subcontractor submission pair

Under `Subcontractor Proposal Submission/09 - Dyrwall`:

- `District - Bid Form 2.20.25.pdf` — 626 KB.
- `District Construction - Bid Proposal - 2.2.26.pdf` — 201 KB.

This pair can test proposal ingestion: associate an incoming proposal with its project/trade/bidder, extract the total and qualifications, compare it to the requested scope, and create bidder coverage/adjustment rows.

## Templates

### MCN templates

- Subcontract agreement.
- Basis-of-estimate assumptions document.
- Bid sheet template (`.xlsx`, 1.7 MB).
- Budget template (`.xlsx`, 10 MB).
- CSI number reference (`.xlsx`, 127 KB).
- Exhibit A shell for all trades.
- Exhibit B drawing list.
- Exhibit E schedule.
- General-conditions calculator.
- Logistics plan.
- Owner buyout log.
- Preconstruction schedule template (`.xlsm`).
- RFI log template.
- Placeholder folders for future DGS and project-management material.

The macro-enabled schedule file must be treated separately from ordinary `.xlsx` export; the first prototype should not promise to preserve or generate macros unless this is explicitly required.

### Wyre AI / WAI reference

- `(SAMPLE) 09_20_00_-_Drywall_ScopePackage (2).pdf` — 3.2 MB, 46 pages.

Use this only as a product/output reference within the applicable NDA and IP boundaries. Do not use it as source code, training data, or a template to copy without explicit confirmation that such use is permitted.

## Videos

- `Building Connected Demo` — 294.6 MB.
- `structor_walkthrough.mp4` — 811.6 MB.
- `Wyre AI Demo` — 349 MB.

These are useful for validating current workflows and interaction patterns. They are not required to define the spreadsheet prototype because the workbook and write-up already expose the core data structure.

## Recommended golden dataset

Use drywall for the first complete test case:

1. Jelleff drawings and project manual as inputs.
2. Manual drywall scope/bid form as the reviewed target output.
3. Wyre AI/WAI drywall package as a reference benchmark only.
4. District bid form and proposal as bidder inputs.
5. The drywall sheet in the live bid workbook as the expected leveling destination.

For each generated or extracted fact, record the source document, page/sheet, and region. Keep human approval mandatory.

## Acceptance tests suggested by the materials

### Spreadsheet/export prototype

- Populate project metadata and one selected trade without breaking formatting or formulas.
- Add scope rows and preserve their section hierarchy.
- Add at least two bidders and coverage/note/adjustment fields.
- Recalculate total bids and rank consistently with the template.
- Export a workbook that opens without repair warnings and visually matches the supplied format.

### First AI scope pilot

- Identify the correct drywall specification sections and relevant drawing sheets.
- Generate a draft scope with an evidence citation for every non-generic item.
- Compare output against the human drywall scope using coverage, unsupported-item, and citation-validity metrics.
- Allow edits, approvals, and rejections before export.

### Proposal-ingestion pilot

- Match the proposal to the correct project, bidder, and trade.
- Extract the base/total price, major exclusions, alternates, and qualifications.
- Map proposal statements to requested scope rows and flag missing or ambiguous coverage.
- Require human confirmation before changing the leveled bid.
