# Working feature demo — 15 October 2026

These four features work with illustrative inputs. They do not require new client data or document uploads. State belongs to the selected project and saves in this browser; it is not a shared team database.

## Overview — R24

Open a project → Overview. Scope requirements, submitted bids, open document issues and published forms come from the project's saved workflow. The trade table uses package owners, invitations, submissions and form status. Activity shows saved scope, bid-revision and issue events; the cover uses the project's saved team and deadline.

Demo: open Jelleff for the prepared workflow, then Whittier to show an empty project's zero counts. Approve a sample draft scope and return to Overview to see its pending count decrease. Reopen it to restore the sample state. No inbox or delivery status is implied.

## Approved scope to estimate — R14

Scopes & bid forms → choose a trade → select an approved requirement → Add to estimate → Open estimate drafts → Open that trade's drafts → Price scope item.

The draft retains the requirement and source. Quantity, unit and rate begin blank, and the queue adds nothing to the estimate total. Enter illustrative values such as 100 SF at $2/SF, then Add priced item. The $200 line appears in Estimate items needing review. A duplicate is blocked; a moved, reopened or changed source blocks stale draft pricing. A zero rate stays visibly unpriced.

## Budget versions — R22

Budget summary → Budget versions → Save budget version. Enter a name, stage and baseline/change explanation. Concept, Schematic design, Design development and Construction documents are available for version labels.

Demo: add a line explicitly labelled as illustrative, budget $1,000, and save a Concept baseline. Edit the working line to $1,200 and save a DD version with an explanation. Compare the two: $200 increase and the changed line. Earlier values remain $1,000. Reload and reopen Budget versions to show persistence; switching projects keeps their versions separate. CSV history and comparison exports are available. Versions do not restore or overwrite the working budget.

## Bid-gap cost suggestions — R15

Bid leveling → load a sample trade → Cost suggestions. Choose the bidder and an excluded/partial scope response. Pick an estimate trade and a reviewed estimate reference, or enter a missing quantity, unit, rate and supporting basis manually.

Demo: use the sample 100 SF at $2/SF estimate, label the basis as illustrative and explicitly approve it. Apply approved adjustment writes $200 into the selected bidder's scope cell, with the calculation and basis in its note. Changing an input resets approval. The amount replaces that cell's previous adjustment; it does not add it twice. The provisional total recalculates, while the scope exception stays open until its coverage is resolved separately. The saved comparison retains the amount on reload.

Download Backup JSON before replacing an existing comparison. Loading portal submissions for another trade replaces the active comparison, as in the existing workflow.

## Validation

- All 27 application check scripts passed, including new budget retention/reconciliation, scope draft, bid-cost and dashboard assertions.
- TypeScript passed and the production build completed.
- All 47 existing UI tests passed.
- Browser checks exercised both new flows, immutable budget comparison, reload persistence, project separation, cost-approval reset and mobile layout without page-level overflow.

These close the four feature implementation gaps for the review build. They do not certify client quantities/rates, publish scope, send messages, execute contracts or replace the separate production-release review.
