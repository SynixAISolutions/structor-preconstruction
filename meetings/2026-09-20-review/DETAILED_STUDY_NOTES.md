# Structor V1 — Marcel Khoury review: detailed study notes

**Source:** `C:\Users\ADMIN\Downloads\Video Project 9.mp4`  
**Duration:** 45 minutes 43 seconds  
**Primary speaker:** Marcel Khoury, speaking to Daniel  
**Purpose:** Marcel reviews the Structor V1 interface and explains how he wants the product organized around a real general-contractor workflow.

The timestamped machine transcript is in `video-project-9-transcript.txt`. These notes correct obvious construction terms and explain the intent behind Marcel's comments. They are an interpretation of the recording, not a replacement for confirming ambiguous requirements with Marcel.

## Central message

Marcel likes the design and is especially enthusiastic about the interactive 3D model. His main criticism is architectural: the current navigation presents many good screens as separate modules, but he wants them connected in the order a general contractor actually works.

His intended flow is:

```text
Create project and record its characteristics
  → upload the RFP, drawings, and specifications
  → AI creates draft scopes, bid forms, takeoffs, checks, and registers
  → estimators review and publish bid forms
  → invite and communicate with subcontractors
  → subcontractors complete scope coverage and submit proposals
  → level bids and estimate missing-scope costs
  → build the budget and select subcontractors
  → generate Exhibit A and subcontract agreements
  → manage submittals, RFIs, schedule, and later operations
```

Marcel is asking for one connected project system in which information produced early in the workflow is reused later. A scope item should feed bidding, bid leveling, the detailed budget, the contract, submittals, and the 3D/source views instead of being re-entered in disconnected screens.

## Part 1 — Product architecture and project creation (00:00–05:45)

### What Marcel says

- The opening page should primarily show **all projects**.
- Opening a project should reveal that project's own modules.
- He initially describes three broad areas: **Preconstruction**, **Subcontractor Procurement**, and **Operations**. As the review continues, he simplifies this toward **Preconstruction and Operations**, with subcontractor work grouped inside a large **Subcontractor Outreach** workflow.
- He does not want a separate top-level **Bid & Award** section. Its tools should sit where they occur in the workflow.
- The new-project form should collect far more information than the current preview.

### Requested project fields

- Project name
- RFP document
- Plain-language description of what is being built
- Internal project value
- Location
- Project size in square feet
- Project type
- Renovation, addition, or both
- If both, separate renovation and addition square footage
- Taxable or non-taxable status
- Local certification/program requirements, such as Washington, DC CBE, MBE, or First Source requirements
- Project team

### Why this matters

Marcel is not asking for extra fields only for recordkeeping. He wants those characteristics to become a historical estimating dataset. Later, a user with an early schematic project could find comparable past jobs by location, building type, size, renovation/addition status, certification rules, and year, adjust the old values for inflation, and generate a rough preliminary budget.

### Project documents and AI outputs

After project creation, the user uploads the drawings, specifications/project manual, RFP, and related files. Marcel expects this ingestion step eventually to create or populate:

- Scopes and bid forms
- Quantity takeoffs
- Structor Check issues/RFIs
- Specification information
- Drawing and specification registers
- Revision comparison data

This is the point where the product starts turning documents into project records.

## Part 2 — Subcontractor outreach, bid packages, and bid forms (05:45–10:14)

### BuildingConnected is the workflow reference

Marcel opens BuildingConnected to explain the interaction he wants. Structor should create trade-based bid packages, list the invited subcontractors, and track the outreach history.

The proposed **Subcontractor Outreach** area should contain:

- Trade/bid packages
- Invite-bidder controls
- A list of invited companies and contacts
- Notes such as “called Mark's Demolition — no response”
- Private messages
- Bid forms/scopes
- Proposal submission
- Bid leveling
- Later, automated follow-up for companies that have not confirmed whether they will bid

### Scopes and bid forms

Marcel explicitly says that, in this context, the **scope** and **bid form** are effectively the same checklist. The AI drafts it from the project documents; estimators review it before anyone outside the company sees it.

He requests:

- A way to move a scope item to another trade or owner when it was classified incorrectly.
- An estimator approval step.
- A **Publish to subcontractors** action.
- Automatic notification to the invited subcontractors when the bid form becomes available.

### Intended outcome

The draft produced by AI is an internal working document. It becomes a live bid form only after an estimator reviews and publishes it. This approval boundary is important because scope errors can affect price, award, and contract language.

## Part 3 — Quantity takeoffs, submittals, and document registers (10:14–12:58)

### Quantity takeoffs

Marcel wants takeoffs grouped by trade or division, such as demolition, waterproofing, and air barrier. Opening a trade should reveal its individual measured items, quantities, units, rates, and sources.

The core idea is a hierarchical workbook:

```text
Trade/division
  → measured item
  → quantity and unit
  → source drawing/detail
  → optional unit rate and extended amount
```

### “Spec matrix” should become an operational submittal workflow

The current Spec Matrix screen is closer to what Marcel calls a **submittal package/log**. He wants it moved into Operations.

The specification sections identify what an awarded subcontractor must submit, for example:

- Mix designs
- Product data
- Test reports
- Samples
- Shop drawings
- Warranties

After award, Structor should send those requirements to the subcontractor. The subcontractor uploads each item, the architect reviews and comments, and Structor sends notifications between the parties. When Marcel says AI should be the “middleman,” he means coordinating, routing, reminding, and summarizing the exchange; the architect and contractor still make the approvals.

### Separate drawing and specification registers

Marcel wants:

- **List of Drawings**: discipline, sheet number/name, date, and revision information.
- **List of Specifications**: equivalent structured list for the project-manual/specification sections.
- **Revision Comparison** to remain in Preconstruction; he likes this screen.

## Part 4 — Navigation consolidation (12:58–14:51)

Marcel repeats that the existing Bid Packages, Bidder Directory, and Bid Leveling screens should not remain as isolated items under Bid & Award.

- Bid packages and leveling belong inside **Subcontractor Outreach**.
- The project-specific invited-bidder list belongs inside its packages.
- The general directory of subcontractor companies may remain separate, but he later clarifies that it should be a global company resource rather than part of one project.
- Exported bid-leveling workbooks may need company-specific formatting because every general contractor has its own template.

The broader point is to organize navigation by the user's goal, not by independent technical features.

## Part 5 — Budget, allowances, and detailed cost planning (14:51–17:15)

### Budget summary

Marcel likes the concepts of forecast and variance, but wants the displayed values to come from real inputs.

Requested behavior:

- The user can enter a budget manually or import an Excel budget.
- The current `Forecast` label may become **Lowest Sub** or the lowest reviewed/leveled subcontractor amount.
- Variance compares that current expected cost with the entered budget.
- The budget should distinguish **direct construction costs** from **indirect costs** such as insurance, contingency, and general-contractor fees.

### Detailed budget

The summary should lead to a more detailed budget. Marcel suggests reusing language from the approved scopes to build the line-item detail, creating continuity from scope writing through budgeting.

### Allowances

Allowances are placeholder amounts for work or selections that are not fully defined. Marcel wants a simple list showing the allowance description and amount, ideally extracted from the drawings/specifications but editable by the user.

He says he will upload a real budget and detailed budget to OneDrive so the interface can match the real format.

## Part 6 — Contracts, Exhibit A, negotiation, and award (17:15–19:21)

Marcel wants contract generation organized by trade. For each trade, the screen should show the bid/leveling result and allow the contractor to select the subcontractor to award.

The workflow he describes is:

1. Review the lowest submitted and lowest leveled bidders.
2. Choose the subcontractor to award.
3. Generate **Exhibit A**, the trade-specific scope attached to the subcontract.
4. Send it to the subcontractor's contact.
5. Receive and resolve comments in Structor.
6. When Exhibit A is agreed, generate the complete subcontract agreement using the general contractor's template.
7. Send for signature, countersign, save the final copy, and allow download.

Each customer may provide its own subcontract and Exhibit A templates. Structor should populate those templates rather than force every company into a generic document.

## Part 7 — Bid leveling and cost suggestions (19:21–22:38)

Marcel likes the existing bid-leveling layout and the ability to add a scope item or bidder. His preferred future input is the subcontractor portal rather than relying mainly on an email inbox.

### Proposed bidder flow

- A subcontractor enters its price.
- It completes the bid form by marking every scope requirement as included, excluded, or partial.
- Structor highlights exclusions and incomplete answers.
- Leveling updates automatically.
- For missing work, Structor suggests an adjustment using historical cost information, quantity takeoff data, and/or unit prices.
- The system can show the measured quantity in the note so the estimator can understand or override the suggested cost.

The cost suggestion is decision support. The estimator still approves the adjustment before it changes the comparable bid.

## Part 8 — Structor Check and RFI management (22:38–23:31)

Marcel wants Structor Check displayed as a filterable table.

Important fields and actions:

- Trade/division
- Severity such as high, medium, or low
- Description and source
- Filter by trade
- Add human-created issues alongside AI-created issues
- Package issues into RFIs
- Send RFIs to the architect
- Receive responses and notify the relevant subcontractors

Subcontractors should also be able to create RFIs from their portal. If an RFI arrives by email, Marcel suggests that a connected inbox could recognize it and add it to the same log. The product therefore needs one RFI register containing AI findings, contractor questions, and subcontractor questions with clear provenance.

## Part 9 — Operations, schedule, subcontractor portal, and the “to-do list” (23:31–26:15)

- Rename the current Coordination area to **Operations**.
- Remove a standalone Conversations screen and keep messaging inside the workflow where it belongs, especially Subcontractor Outreach.
- Marcel likes the current Schedule screen and wants it kept.
- He confirms the Subcontractor Portal is the external experience he had in mind.

### Subcontractor portal requirements

- Show the invitation and project/package information.
- Show the scope/bid form.
- Let the subcontractor complete scope coverage.
- Let it enter a price and attach a proposal.
- Add an **RFIs** area instead of a generic Questions label.

### “Project Turnover” correction

Marcel says the current Project Turnover screen is not really turnover. Its checklist is a preconstruction completion tracker. He proposes moving it back into Preconstruction and renaming it something simple such as **To-do list** or **Preconstruction percent complete**.

The list should include actions such as approving AI-generated scopes and other incomplete preconstruction work.

## Part 10 — Drawing Flip: visual scope review (26:15–28:16)

Marcel proposes a **Drawing Flip** tool within Scopes & Bid Forms.

The tool would:

- Display the actual drawing pages.
- Color-code drawing regions or elements by responsible trade.
- Highlight the exact location when a scope item is selected, similar to the Wyre AI reference.
- Let Marcel and his estimators flip through the drawings together.
- Allow manual corrections to the AI's trade classification during the review.

Example: concrete could appear in green, masonry in blue, and demolition in another color. This becomes a visual ownership review that helps prevent missing scope and trade overlaps.

## Part 11 — Value engineering (28:16–30:31)

Add a **Value Engineering** section in Preconstruction.

The user enters a target saving, for example reducing a $30 million estimate to a $28 million owner budget. Structor then suggests design, material, or scope alternatives that might save money, based on the project documents.

The user should be able to:

- Add personal ideas.
- See AI suggestions.
- Track the target reduction.
- Send individual ideas to subcontractors for pricing.
- Record the quoted saving and decision.

These should remain proposals until the project team approves them; value engineering can affect design, performance, and contractual scope.

## Part 12 — Global subcontractor directory, ratings, and prequalification (30:31–32:50)

Marcel revises his earlier view and says the bidder directory should exist as a general, non-project-specific area.

He imagines:

- A shared subcontractor directory.
- Ratings from general contractors, with several parameters still to be defined.
- Possible factors such as change-order behavior, bidding responsiveness/efficiency, professionalism, and performance on site.
- A visible number of ratings, similar to marketplace reputation systems.
- Project views that show which invited subcontractors are already prequalified.
- A subcontractor prequalification form and document-upload process for companies that are not yet approved.

He marks prequalification as lower priority, but wants a placeholder so it is not forgotten.

## Part 13 — Historical estimating data, benchmarking, and an AI assistant (32:50–37:14)

The detailed new-project fields support a future comparable-project engine.

Marcel's example:

1. A new project has little design information but has known location, square footage, addition/renovation type, and certification requirements.
2. Structor searches prior similar projects.
3. It adjusts their historical costs for inflation.
4. It creates a rough order-of-magnitude budget by division.
5. It presents that estimate to the client with charts.

He references products heard as **Concentric** and **Join** that visualize budget changes across design stages: concept, schematic design, design development, and construction documents. The exact product names should be confirmed.

He also proposes replacing or supplementing the static glossary with a general AI assistant that can answer:

- Where a feature is located.
- How to perform a task.
- Project-specific questions.
- Preliminary product or material cost questions.

Marcel calls this useful but says the team should continue focusing on the more important core workflows first.

## Part 14 — 3D Model Studio expansion (37:14–45:23)

This is the most enthusiastic section of the review. Marcel repeatedly says he loves the model's ability to select an element, show its assembly, and trace it to the drawing source.

### Add measurable quantities

For each selectable element, show the quantities available from the model and takeoff:

- Floor area/square footage
- Wall length
- Height
- Thickness
- Area or other derived quantity
- Type/assembly
- Source sheet/detail
- Relevant specification properties

### Expand the building model

- Add the second floor.
- Add basketball-court details, wall pads, bleachers, fitness equipment, furniture, and other plan content.
- Add doors, frames, and hardware with door-type information.
- Show exact flooring types and transitions between different floor materials.
- Show storefront, windows, interior finishes, toilet accessories, signage, operable partitions, kitchens/appliances, athletic equipment, FF&E, window treatments, entrance floor grilles, elevators, fixtures, and visible equipment.
- Add an exterior view using the documented masonry, metal panels, storefront, and other façade materials.
- Provide show/hide controls grouped by trade or CSI division.

### Proposed model modes

1. **Interior finishes/design** — architectural finishes, doors, furnishings, specialties, and equipment.
2. **MEP/BIM coordination** — mechanical ducts, electrical systems, plumbing, and fire-suppression piping so clashes can be understood.
3. **Structural model** — concrete and steel, showing the structural “bones” of the building.
4. **Exterior model** — the finished exterior appearance and assemblies.

### Specification depth and walkthrough

When a user hovers or clicks an element, Marcel wants detailed specification data, including niche properties such as insulation R-values when documented.

He also wants a first-person virtual walkthrough similar to a hotel or real-estate tour so owners can experience the building before construction.

### Practical interpretation

The current model is a successful visual proof of concept. Marcel's requested expansion spans several distinct products: quantity takeoff, material/spec inspection, visualization, MEP clash coordination, structural BIM, and owner presentation. These should be planned as separate milestones even if they share the same viewer.

## Part 15 — Closing and next inputs (45:23–45:43)

Marcel says he will:

- Upload the budget and detailed budget to OneDrive.
- Answer questions through WhatsApp.
- Meet again after Daniel has worked through the comments.

His closing tone is positive and collaborative. He considers the review sufficient to guide the next iteration.

## Proposed final information architecture

This is a synthesis of Marcel's comments; he changed some groupings while speaking, so confirm the final labels before a full navigation rewrite.

### Global/workspace level

- All Projects
- Subcontractors / Bidder Directory
- Ratings
- Prequalification
- Organization settings
- AI assistant/help

### Inside a project — Preconstruction

- Project Information
- Project Files
- Scopes & Bid Forms
- Drawing Flip
- Subcontractor Outreach
  - Bid packages
  - Invitations and notes
  - Messages
  - Published bid forms
  - Proposals
  - Bid leveling
  - RFIs
- Quantity Takeoffs
- Structor Check / RFI Register
- List of Drawings
- List of Specifications
- Revision Comparison
- Budget Summary
- Detailed Budget
- Allowances
- Value Engineering
- Contracts & Exhibits
- Preconstruction To-do / Percent Complete

### Inside a project — Operations

- Project Schedule
- Submittal Packages / Log
- Architect and subcontractor review workflow
- True project turnover/handover features, to be defined separately

### External subcontractor experience

- Invitations
- Project/package information
- Bid form completion
- Price and proposal upload
- RFIs
- Award/contract comments
- Submittal uploads after award

## High-confidence decisions from the video

- Make All Projects the initial workspace view.
- Remove the separate Bid & Award concept.
- Put bid packages, proposal intake, and bid leveling into Subcontractor Outreach.
- Treat scope and bid form as the same reviewed checklist in this workflow.
- Require estimator review before publishing AI-created bid forms.
- Rename Coordination to Operations.
- Convert Spec Matrix into an operational submittal package/log.
- Maintain separate drawing and specification registers.
- Keep Revision Comparison and the Project Schedule.
- Reframe the current Project Turnover screen as a preconstruction to-do/progress list.
- Build budget values from user entry/import and real leveling results.
- Use customer-provided Exhibit A and subcontract templates.
- Keep a global subcontractor directory with future ratings and prequalification.
- Add Drawing Flip and Value Engineering.
- Expand the 3D studio with quantities, source/spec data, floors, disciplines, systems, and walkthroughs.

## Items that require clarification

1. **True Operations scope:** schedule and submittals are clear, but true project turnover/handover requirements are not defined here.
2. **Budget mapping:** obtain Marcel's promised summary and detailed-budget files and confirm which leveling value becomes the forecast.
3. **Subcontractor ratings:** define the exact rating dimensions, who may rate, moderation, disputes, and visibility.
4. **Prequalification:** obtain the actual questionnaire and required documents.
5. **Template rules:** confirm how each customer's Exhibit A, subcontract, bid-leveling, and export templates are configured.
6. **RFI intake:** decide how AI-created, contractor-created, subcontractor-created, and email-imported RFIs are distinguished.
7. **Historical benchmarking:** define inflation source, comparable-project filters, permissions, and whether data stays company-private.
8. **AI assistant:** separate product help from project-data questions and market-price estimates.
9. **3D expectations:** agree on accuracy and source requirements for visualization, takeoff, BIM coordination, structural modeling, and virtual walkthroughs.
10. **Reference product names:** confirm “Concentric” and “Join,” as well as the exact features Marcel wants to emulate.

**Resolved navigation decision:** use two project-level groups, **Preconstruction** and
**Operations**. Subcontractor Outreach is nested inside Preconstruction. Global tools
such as All Projects and the organization-wide subcontractor directory sit outside the
project groups.

## Suggested implementation order — interpretation, not a direct quote

### First: fix the product structure

- Reorganize navigation and labels.
- Expand the project-creation data model.
- Connect project documents to project-specific records.

### Second: complete the central procurement path

- AI draft scope/bid form → estimator review → publish.
- Subcontractor outreach, invitation history, and portal.
- Direct scope confirmation and proposal upload.
- Bid leveling with reviewed cost suggestions.

### Third: close the preconstruction award loop

- Real budget import and budget roll-up.
- Allowances and detailed budget.
- Trade award, Exhibit A negotiation, and subcontract generation.

### Fourth: operations and collaboration

- Unified RFIs.
- Submittal packages and architect/subcontractor routing.
- Schedule integration and actual turnover requirements.

### Fifth: advanced intelligence and visualization

- Drawing Flip.
- Value engineering.
- Historical project benchmarking.
- Global subcontractor ratings/prequalification.
- 3D model modes, quantities, BIM coordination, exterior visualization, and walkthroughs.

## Study glossary

- **RFP:** Request for Proposal; the owner's/project solicitation and requirements.
- **CBE / MBE:** Certified Business Enterprise / Minority Business Enterprise participation classifications or requirements.
- **First Source:** Local hiring/employment program requirements, particularly relevant in Washington, DC.
- **CSI division:** Standard classification used to organize construction work and specifications by trade/system.
- **Scope of Work / bid form:** Checklist defining what a subcontractor must price and confirm.
- **Bid package:** The documents and instructions sent to subcontractors for one trade.
- **Quantity takeoff:** Measured quantities derived from drawings, such as square feet, linear feet, cubic yards, or counts.
- **Bid leveling:** Adjusting and comparing bids so all bidders are evaluated against the same required scope.
- **Adjustment / plug:** Internal estimated cost added for excluded or incomplete work to make bids comparable.
- **Allowance:** Placeholder amount for work or selections that are not fully defined.
- **Value engineering:** Evaluating alternatives that reduce cost while managing performance and design impacts.
- **Exhibit A:** Trade-specific scope attached to the subcontract agreement.
- **Submittal:** Product data, samples, shop drawings, test reports, or other information an awarded subcontractor submits for review.
- **RFI:** Request for Information used to resolve unclear, conflicting, or missing project information.
- **Prequalification:** Review of a subcontractor's financial, safety, insurance, experience, and operational qualifications before award.
- **FF&E:** Furniture, fixtures, and equipment.
- **MEP:** Mechanical, electrical, and plumbing systems; fire protection is often coordinated alongside them.
- **BIM coordination:** Coordinating 3D building systems to prevent physical clashes before installation.
- **SD / DD / CD:** Schematic Design, Design Development, and Construction Documents—successive design stages.
- **Rough order-of-magnitude budget:** Early approximate cost estimate made before detailed design information is available.
