# Marcel's partly-done items: progress log (read this first)

Danial, 26 Nov 2026: "work on all these", meaning the five items from Marcel's running list that were only partly done.
Branch `core/marcel-open-items` (worktree `.claude/worktrees/core-marcel-open-items`, from main @ 29e7e6f): items #5, #17, #28 and #19, in one PR.
#11 lives on its own PR, #146 (`core/ai-scope-quantities`, worktree `.claude/worktrees/ai-scope-quantities`).
Rules (memory): test on Project 1's real data, put related work in one PR, ask once to merge, no AI runs without need, never enter API keys (Danial adds them in Vercel), commit as tools@synixsolutions.io, never merge to main without Danial's OK.

## Status
- [x] **#11 automatic quantity takeoff (PR #146).** It conflicted with main (about 20 PRs behind). Merged origin/main (c3a79d6), resolved `lib/ai-jobs-more.ts` (kept main's memory-check / drawing-notes / repeated-lines jobs and registered `scope-quantities`) and `procurement.tsx` (the toolbar keeps main's Repeated lines and #146's Find quantities). Gate green. Pushed.
  **Still pending: a live test.** It needs the preview, signed in, on Project 1, one trade, a few sheets, on the LIVE database (it writes Not-checked quantities), and it costs a few cents of Haiku. Ask Danial which trade.
- [x] **#5 suggested subs by project type and certifications.** `lib/bidder-suggestions.ts` (pure): rankBidders, suggestionReasons, stateOf, cleanProjectTypes. Weights: certification 3, project type 2, Qualified 1, Review required -1, local state 1. `Bidder.projectTypes?` was added to `lib/data/commercial.ts`. The Invite bidders dialog (procurement.tsx `BidderInvite`) now receives `project` (PackagesWorkspace ← ProcurementPackagesView ← CommercialView's props), ranks the trade's companies when there's no search, and shows reason chips (`.proc-fit`). The directory form (commercial.tsx BiddersView) has "Project types" checkboxes (fieldset `.cm-type-picks`), and cards show them. Check: `scripts/check-bidder-suggestions.mjs`, in `pnpm check`. Real-data notes: every starting-directory company has an @example.com email, so it counts as a placeholder and is offered only on the sample project (Project 1); Drywall there has 5 companies (3 named and 2 "(sample)").
- [ ] #17 standard general scope under every trade
- [ ] #28 Textura into aggregate limits
- [ ] #19 Google Maps around the exterior model
