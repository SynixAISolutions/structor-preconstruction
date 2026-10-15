# Preconstruction AI Platform

Working project brief based on the Synix Solutions discovery meeting held on 26 August 2026.

## Executive summary

This is not primarily an outreach tool. The proposed product is an AI-assisted preconstruction web platform that helps general contractors and subcontractors turn construction drawings and specifications into trade-specific scopes, compare bids on an apples-to-apples basis, identify document issues, perform quantity takeoffs, and generate award documents.

The long-term goal is an end-to-end workflow. The immediate commitment made in the meeting was narrower: research the domain, build a basic front-end demo, and prototype automatic population/export of the existing spreadsheet template for review at the next weekly meeting.

The product name was not finalized. "Structure" was suggested during the meeting, but only tentatively.

## Working prototype

### Current V2 review — October 2026

The app now supports specification and drawing PDF readings through DeepSeek, cited draft review, proposal readings into reviewed bid revisions, trade estimates, MCN-versus-bid variance, and a connected illustrative drywall award/submittal workflow. Drawing images and source-page popups render locally. Long proposal forms read in batches, with cancellation and no partial proposal application.

Project information records Concept, Schematic design or Design development separately from workflow status. Budget summary → Historical concept budget imports MCN Estimate Summary workbooks or flat budget CSVs into a browser-local comparable-project library. It shows area-weighted costs, explicit location/cost/profile adjustments, source coverage and exclusions, then creates draft lines only in an empty project cost plan. No RSMeans feed or automatic tax/labor premium is assumed.

Set `DEEPSEEK_API_KEY` and, for a shared preview, `DEMO_PASSWORD` in the server environment; never commit secrets. Hosted previews fail closed without their demo password. New client documents, measurements, readings and historical budgets remain private runtime data. A successful request or a matching citation does not establish scope or quantity accuracy: review every result before publishing or using it commercially. Checked quantity deltas require the contractor's checked takeoff.

The in-app manual describes the current screens and their browser-only limits. The original milestone below is retained as project history.

### Original spreadsheet milestone

The first Structor vertical slice now lives in [`app/`](app/). It uses Marcel's real Jelleff workbook structure rather than a generic mock sheet.

Implemented:

- Imports the supported `Demo` or `SOWTemplate` trade tab from Marcel's `.xlsx` workbook after showing a replacement preview.
- Reads project/trade metadata, scope rows, bidders, actual base bids, Y/N/P responses, notes, adjustments, workbook-level eligibility, and per-bidder bond rates.
- Separates provisional totals from reviewed leveled totals. A bidder is ranked only after required scope answers, exclusions/partials, adjustment approvals, source eligibility, and price checks are complete.
- Supports inline review/editing, a review-progress meter, one-click exception navigation, frozen scope columns, scope search, shared exception filtering, glossary help, a client walkthrough, and manual bidder creation/editing.
- Saves the workspace and original workbook locally in the browser, restores it after refresh or Gmail OAuth, and offers a JSON backup.
- Connects Gmail through read-only OAuth and lists recent proposal emails with downloadable attachments.
- Exports mapped, reviewed values back into the original workbook while preserving unsupported OOXML parts and requesting a full formula recalculation when Excel opens it. Unsafe edits such as new unmapped scope rows, section moves, and formula-backed metadata changes stop the export instead of silently corrupting the template.

Not implemented in this milestone:

- PDF scope-sheet import. The current importer accepts the supported `.xlsx` template only.
- Automatic reading of bidder proposal emails or attachments.
- Automatic Y/N/P decisions, proposal-to-project matching, or price/exclusion extraction.
- Drawing/specification interpretation, cited AI scopes, RFIs, or quantity takeoffs.

Run locally from `projects/preconstruction-ai/app`:

```powershell
pnpm dev
```

Then open `http://localhost:3010`.

To connect Gmail, copy `app/.env.example` to `app/.env.local`, add Google OAuth web-app credentials, and register `http://localhost:3010/api/gmail/callback` as an authorized redirect URI. Generate a private `SESSION_SECRET` of at least 32 characters. The Gmail connection is read-only; proposal extraction and automatic Y/N/P decisions are not part of this slice.

## Participants and source caveat

- Marcel Khoury: construction/preconstruction domain expert and product owner.
- Danial Khan: technical implementer.
- Rawad: project coordinator/intermediary who joined parts of the discussion.

The supplied Zoom transcript only labels Marcel and Danial. At least one statement addressed to Marcel is labeled as Marcel speaking, so some Rawad remarks were likely merged into Marcel's label. Requirements below are based on the substance of the discussion rather than perfect speaker attribution.

## The current workflow and problem

For a construction bid, the team receives a large drawing set and project manual/specifications, often containing 1,000–5,000 pages. Estimators must:

1. Identify the applicable CSI divisions/trades.
2. Read the drawings and specifications and write a detailed scope for every trade.
3. Send the relevant packages to several subcontractors per trade.
4. Receive proposals, generally by email.
5. Manually level the bids so each proposal is compared against the same scope.
6. Detect exclusions or missing work and fill gaps with estimated quantities/unit prices.
7. Roll the selected values into the project budget.
8. Convert the approved scope into contract language (Exhibit A/Section 3) and award the subcontract.

This work is slow, repetitive, and error-prone. Missing a scope item can make the project budget materially wrong.

## Existing reference product

Marcel demonstrated an existing product whose name is rendered phonetically in the transcript. The shared files identify it as "Wyre AI" and use the abbreviation "WAI." It currently provides two important capabilities:

- Generate trade-specific scopes from uploaded drawings and specifications, organized by CSI division.
- Detect document issues/RFIs, such as an unspecified manufacturer that prevents reliable pricing.

The generated scope items include source citations that open and highlight the relevant drawing location. Users review and edit the AI output before accepting it, then export one trade at a time into Marcel's Excel template.

Marcel has an NDA with this company. Direct account access or copying its implementation is therefore not available. Any Synix product should be built as a clean-room implementation from Marcel's workflow, permitted sample data, and independently selected technology.

## Confirmed product principles

- Build a web application with user accounts; mobile access may come later as a responsive/PWA experience.
- Preserve Excel export because it is part of the operating workflow.
- Keep a human QA/approval step for AI-generated scopes and issues.
- Every generated scope item should be traceable to its drawing/specification source.
- Make the interface unusually simple because many target users resist learning new software.
- Support both general contractors and, eventually, subcontractors.
- Develop iteratively through weekly meetings and domain feedback.

## Immediate deliverable agreed in the meeting

The next-meeting prototype should focus on the lowest-risk, demonstrable slice:

- A basic front-end showing the proposed navigation and workflow.
- A sheet-filling/export prototype based on Marcel's existing Excel template.
- Enough domain research to return with informed questions about drawings, specifications, CSI divisions, scopes, bids, and contracts.

Danial estimated the sheet prototype could be ready within one week. This is a prototype commitment, not a commitment to complete automated drawing interpretation in one week.

## Recommended MVP boundary

The discussion used "step one" in two different ways: Marcel called drawing-to-scope generation the first and hardest product capability, while the group later agreed the spreadsheet automation was the easiest place to begin. Treat these as two successive milestones.

### Milestone 1 — workflow and export prototype

- Project creation and basic metadata.
- Select a trade/CSI division.
- Enter or import structured scope rows and bidder values.
- Compare bidders in the familiar leveling-sheet layout.
- Export the populated Excel workbook using the supplied template.
- Use a clickable UI prototype to validate information architecture.

### Milestone 2 — first true AI MVP

- Upload a bounded drawing/specification set.
- Generate draft scope items for one or a small number of trades.
- Attach page/sheet/location citations to every item.
- Let a reviewer edit, accept, or reject each item.
- Export the approved trade scope to the existing Excel format.

Takeoffs, email ingestion, automated bid leveling, subcontractor portals, issue/RFI detection, and contract generation should not be required to validate Milestone 2.

## Longer-term roadmap discussed

1. Document issue/RFI detection with cited evidence.
2. Quantity takeoffs from scaled drawings.
3. Dedicated bid inbox and/or subcontractor submission portal.
4. Proposal extraction and automatic bid leveling across 70–80 trades.
5. Missing-scope detection and suggested unit-price allowances.
6. General-contractor budget roll-up.
7. Contract/Exhibit A generation and award workflow.
8. Kickoff templates, deadlines, estimator assignments, and project workflow management.
9. A subcontractor product for scopes, vendor pricing, takeoffs, overhead/profit, and proposal generation.

## Decisions and unresolved choices

### Decided

- Delivery surface: web app.
- Excel output remains required.
- Weekly review cadence.
- Start with a simple prototype and add capabilities incrementally.
- Email is likely necessary for subcontractor adoption; a dedicated bid inbox was suggested.

### Not yet decided

- Final product name and branding.
- Whether Milestone 1 accepts only structured/manual inputs or also parses emailed/PDF proposals.
- Exact production workbook versions and which trade tabs must be supported after the Jelleff demolition pilot.
- Which trade and document set will be the AI pilot.
- Whether prior-team code can legally and technically be reused.
- Authentication roles, organization boundaries, storage/retention, and audit requirements.
- Accuracy targets and the acceptance test for generated scopes and takeoffs.
- Whether subcontractors will use a portal, email, or both.

## Inputs Marcel agreed to provide

- Detailed step-by-step preconstruction process write-up.
- Sample project drawings and specifications.
- Handwritten/manual scope examples, including PDFs exported from Excel.
- Bid-leveling and budget Excel templates.
- CSI division/code reference data.
- Contract template, especially the variable scope/Exhibit A section.
- The meeting/screen demonstration and possibly a separate walkthrough video.
- If available and reusable, artifacts or software from the previous development team.

These materials have now been shared. See [SOURCE_MATERIALS.md](SOURCE_MATERIALS.md) for the verified inventory and recommended pilot dataset.

## Recommended first pilot

Use the Jelleff Recreation Center drywall trade as the first end-to-end vertical slice. The shared folder contains all of the following for drywall:

- Full project drawings and specifications.
- A manually prepared drywall scope/bid form.
- A filled subcontractor bid form and the corresponding proposal.
- A populated project bid-leveling workbook containing the drywall trade.
- A Wyre AI/WAI-generated drywall scope-package sample.

This makes drywall the only immediately visible trade with source documents, human output, bidder input, leveled project data, and a competitor reference in one dataset. Demolition remains a useful secondary test because its leveling sheet is especially clear and populated.

## Existing systems this product must coexist with

- BuildingConnected for bidder outreach and bid-document distribution.
- OneDrive/shared folders for the current source of record.
- Procore for construction-phase RFIs, submittals, and drawing revisions.
- Textura for subcontractor payment applications.
- Primavera P6 for schedules.

The initial product should not attempt to replace all of these systems. It should own the preconstruction data model and produce/import the files needed at the boundaries.

## Main risks

- Construction drawings are large, heterogeneous, and domain-specific; generic OCR alone will not solve the problem.
- Scopes and takeoffs require high factual accuracy. Unsupported AI output must never silently enter a bid or contract.
- Drawing citations must survive revisions and remain auditable.
- Email proposals are inconsistent, but forcing every subcontractor into a portal could hurt adoption.
- Drawings, bids, and contracts are commercially sensitive; tenant isolation, permissions, encryption, retention, and audit logs will matter.
- Competitor NDA/IP boundaries require a clean-room approach.
- Automated contract language requires legal review and human approval.

## Actions before the next meeting

### Marcel / product owner

- Share the promised drive and confirm access to every source asset.
- Select one representative trade, one sample project, and the exact Excel output template.
- Provide a manually completed "gold standard" workbook for that sample.
- Clarify what may be used from the prior team and what is restricted by NDAs or ownership.

### Danial / Synix technical team

- Review the shared material and construction terminology.
- Produce the sheet-filling/export prototype.
- Produce a basic clickable front-end for workflow feedback.
- Document open questions and propose an acceptance test for the first pilot.

### Next meeting agenda

1. Confirm whether the one-week deliverable is sheet automation only.
2. Walk through one source document set and its completed scope/output side by side.
3. Lock the first trade and exact definition of done.
4. Review the front-end information architecture.
5. Confirm permitted data/IP boundaries.
6. Agree on evaluation metrics, owners, and the following milestone.

## Timestamp map

- 18:03–18:10 — preconstruction background, manual scopes, and the core pain.
- 18:10–18:15 — existing AI scope generation and per-trade Excel export.
- 18:15–18:18 — source citations and issue/RFI detection.
- 18:18–18:24 — end-to-end process, estimator assignments, takeoffs, and prior-team work.
- 18:25–18:29 — subcontractor market, web-app decision, bid submission, and auto-leveling vision.
- 18:29–18:32 — one-week sheet prototype and email-versus-portal discussion.
- 18:32–18:35 — promised shared-drive assets and contract automation.
- 18:35–18:38 — iterative approach, weekly meetings, front-end demo, and next steps.
