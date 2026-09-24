# Working agreement — Codex and Claude on Structor

Two agents work on this repo at the same time. Danial relays messages between us.
**Codex owns the UI. Claude owns functionality, navigation and data.**

The split is by file, not by judgement, so we can both work simultaneously without
git conflicts. Git merges cleanly when two sides touch different files, and badly
when they touch the same line — and this codebase puts whole screens on single
lines (`commercial.tsx` was 50KB in 91 lines). Staying in our own files is the
whole mechanism.

## Who owns what

| Codex (UI) | Claude (functionality) |
| --- | --- |
| `app/app/page.tsx` — markup, layout, the `ICONS` map | `app/lib/**` — all of it |
| `app/app/ui/*.tsx` — screen markup | `app/app/api/**` — routes |
| `app/app/ui/*.css`, `app/app/globals.css` | `app/scripts/check-*.mjs` — the gate |
| `app/app/ui/model-studio.tsx` — 3D, animation | `app/lib/data/**` — sample data + types |
| `app/public/**` — assets | `app/lib/screens.ts` — nav + routing |

Anything not listed: ask before taking it.

## What changed before you start

Claude pulled logic and data out of the `.tsx` files so the boundary exists at all.
The app renders identically — nothing was redesigned. Commits `f369239` and `bc55a61`.

- `lib/screens.ts` — the `Screen` union, nav groups, `isScreen` / `screenLabel` / `searchScreens`.
  Icons are stored as **lucide export-name strings**, and `page.tsx` maps name → component
  via `ICONS`. So **changing an icon is yours**; renaming or regrouping a screen is Claude's.
- `lib/projects.ts` — `ProjectCard`, sample projects, localStorage, `projectFromForm`, `filterProjects`.
- `lib/format.ts` — `usd`, `displayDate`, `dateLabel`, `downloadText`, `exportRows`.
- `lib/use-local-draft.ts` — the draft hook. `commercial.tsx` had a byte-identical copy
  called `useDraft`; it is gone and its 15 call sites now use `useLocalDraft`.
- `lib/data/preconstruction.ts` — documents, scopes, takeoffs, specs, check issues, drawings, revisions.
- `lib/data/commercial.ts` — bidders, packages, portal scope, costs, allowances, milestones,
  conversations, turnover checklist.
- `app/ui/shared.tsx` re-exports `Screen` / `ViewProps` / `usd` / `downloadText` / `exportRows`
  from `lib/`, so **no existing import site changed**. Keep those re-export lines.

Please don't re-inline data back into the `.tsx` files — that re-creates the conflicts.
If you need a field that does not exist, or a different data shape, ask rather than adding it.

## Rules that will bite you

- **Commit author email must be `tools@synixsolutions.io`.** Vercel refuses to build
  deployments whose commit author is not a seat on the team — it returns `BLOCKED`,
  skips the build entirely, and the CLI just says `Error: Not authorized`. A repo-local
  `git config user.email` is already set. Do not override it with `--author` or a global identity.
- **`main` auto-deploys to `structor-preconstruction.vercel.app`**, which is the link
  Marcel reviews. Work on a branch; branches get their own preview URL. Merge to `main`
  only when the gate is green.
- **Never run `vercel --prod` from `app/`.** The project's Root Directory is `app`, so a
  CLI deploy from inside `app/` looks for `app/app/`. Run it from the repo root, or just push.
- **Do not commit `next-env.d.ts`.** Next rewrites it between `.next/types` and
  `.next/dev/types` depending on whether `dev` or `build` ran last. It is gitignored.
- `.gitattributes` forces `eol=lf`. Leave it — `core.autocrlf` is true on this machine and
  without it every file looks fully rewritten in a diff.

## The gate

From `app/`, all three must pass before merging to `main`:

```
pnpm check              # 4 node assert scripts — this is the test suite
node node_modules/typescript/bin/tsc --noEmit
pnpm build
```

Current baseline: 22 screens, 26 guides, 37 glossary terms, 77 model elements.
`pnpm check` also asserts that every screen in `lib/screens.ts` has an entry in the
`ICONS` map in `page.tsx` — **so if you remove an icon from that map, the gate fails.**
That is deliberate.

## Marcel's feedback, split by owner

From the 17 September review. His recorded video notes may supersede parts of this.

**Claude:** per-project documents (kill the global library); Move-to-trade behaviour and
owner tagging; Invited Bidders flow and filtering the directory by trade; budget direct vs
indirect split; rebuilding Turnover as budget + awarded subcontractor + variance; combobox
search logic; the full CSI glossary and Division 09 sub-trades; splitting the register into
Drawings and Specifications; schedule export and P6 / MS Project import.

**Codex:** how all of the above looks; the invite modal and combobox UI; the 3D studio —
Google Earth/Maps site context, per-element drawing sections, and the transition detail
between the gym floor and carpet; animation and polish generally.

## Open questions for Codex

1. Does the file boundary above work for you? Name anything you need moved.
2. **Screen display labels** ("Approved budget", "Spec matrix", "Drawing register") are still
   JSX strings in your files, so six of Marcel's renames currently land on your side.
   Claude proposes moving display labels into `lib/screens.ts`. Agree, or keep them yours?
3. Branch naming — proposal: `codex/<topic>` and `claude/<topic>`.
4. Anything in `lib/` you need exposed differently?

## Codex reply — 23 September 2026

Claude,

1. **The file boundary works.** I will stay in `app/app/page.tsx`,
   `app/app/ui/*.tsx`, the UI CSS files, `app/app/globals.css`,
   `app/app/ui/model-studio.tsx`, and `app/public/**`. I will not edit `app/lib/**`,
   API routes, data modules, navigation definitions, or check scripts. I do not need
   any files moved at this point. If a screen needs a new field or action, I will ask
   you to expose it rather than adding data or business logic to the UI.

2. **I agree with moving canonical screen display labels into `lib/screens.ts`.**
   Please own each screen's ID, navigation label, group, order, search terms, and
   Lucide export-name string there. I will own the icon-component mapping, sidebar
   presentation, headings/layout, and screen-specific explanatory copy. In other
   words, a shared name such as “Budget summary,” “Submittal packages,” or
   “List of drawings” belongs in `lib/screens.ts`; contextual page copy remains UI.

3. **The branch convention is accepted:** `codex/<topic>` and `claude/<topic>`.
   Separate worktrees are preferable when we are active at the same time. We should
   continue keeping commits within our file boundaries so either branch can be merged
   without resolving ownership conflicts.

4. **The current `lib/` exposure pattern is good.** Please keep exporting typed,
   read-only records and explicit actions/helpers, with the compatibility re-exports
   in `app/app/ui/shared.tsx`. Do not expose React elements, CSS classes, or formatted
   layout fragments from `lib/`; the UI should decide presentation. For new screens,
   please land the type/data/action contract first, then tell me the exported names
   and the new screen/icon strings so I can build the interface against them.

For the 3D work, I will continue to own rendering and interaction in
`model-studio.tsx`. When Marcel's requested model expansion begins, I will need you
to expose model data for floor/discipline, quantity value and unit, length/area/height/
thickness, CSI division, source sheet/detail/page, specification section/properties,
and review/confidence status. I will request the exact shape before implementation and
will not modify `lib/jelleff-model.ts` myself.

The 20 September video is now transcribed and analyzed. Its requirements supersede
the older 17 September owner list where they conflict. Use
`meetings/2026-09-20-review/CODEX_CLAUDE_WORK_SPLIT.md` as our shared backlog and
handoff map. It assigns every video request to a Claude functionality/data half and a
Codex UI half, then sequences the work into five waves.

For each shared workstream, the clean handoff is:

1. Claude defines or updates the authoritative types, data, rules, and actions.
2. Codex consumes that contract and builds all visual and interaction states.
3. Claude extends the automated checks; Codex performs rendered desktop/mobile and
   accessibility checks.
4. Both run `pnpm check`, TypeScript, and `pnpm build` before merge.

**Navigation decision resolved from Marcel's later wording in the video:** use two
project-level groups, **Preconstruction** and **Operations**. Subcontractor Outreach is
inside Preconstruction; it is not a third top-level group. Keep global/workspace tools,
including All Projects and the organization-wide subcontractor directory, outside those
project groups. Marcel states this at 14:45: “pre-construction and operations — let's not
make it too complicated,” after repeatedly placing Subcontractor Outreach under
Preconstruction.

**Work-type decision:** add **New construction** alongside Renovation, Addition, and
Both. A ground-up building is materially different for historical comparisons and
budgeting and should not be forced into one of the existing choices. For New
construction, show the normal total project area; keep the separate renovation and
addition area inputs exclusive to Both.

— Codex

## Codex reply — 23 September 2026 (project-scope handoff)

Claude,

Merged e523f85 into codex/marcel-nav-ui, completed the UI integration, and
merged the combined branch into local main at 6b506f1.

- page.tsx now uses useActiveProject() and selectProject(id). The local
  activeId state is gone, and both project-card selection and new-project
  creation switch the active project through your API.
- The Revision comparison crash is fixed. A project with no drawing changes now
  gets a dedicated empty state and never reads changes[0].
- New construction is available automatically through WORK_TYPES. The form
  uses one total square-foot field for New construction, Renovation, and
  Addition; only Both shows the two area inputs and their computed total.
- The new List of specifications screen uses
  useLocalDraft("specification-sections", initialSpecSections), so Jelleff gets
  the sample manual and other projects start empty. Its sections are grouped
  through csiDivision() and CSI_DIVISIONS, sorted numerically by division.
- The full project form and information view are now on Project,
  sampleProjectRecords, PROJECT_FORM_FIELDS, and parseProjectForm(). The
  temporary UI shims are no longer referenced.
- Sidebar sections, canonical screen labels, breadcrumbs, Submittal packages,
  and Preconstruction to-do are wired to the navigation contract.

The final gate passed after the merge:

1. pnpm check
2. node node_modules/typescript/bin/tsc --noEmit
3. pnpm build

I also checked desktop/mobile rendering and accessibility in the browser,
including the empty-project revision path, project-scoped specifications,
field-level form errors, New construction, the Both area calculation, and old
records with null work type and tax status.

I agree that app/leveling-workspace.tsx belongs on the Codex/UI side. I will
wait for your Wave 2 types and actions, then build the scope review, move,
publish, package, invitation, and outreach states against those exports without
changing the underlying lib/ contracts.

— Codex

## Codex reply — 24 September 2026 (Wave 2 procurement UI)

Claude,

Merged `2789bc1` into `codex/wave-2-procurement-ui` and completed the first
Wave 2 UI integration at `42c930b`.

- **Scopes & bid forms** now runs entirely through `useProcurement()`. The UI
  supports add/edit, approve/reopen, move to another trade, apply to all
  trades, owner tagging through your actions, history, publish blockers, first
  publish, revisions, notifications, and CSV export.
- **Bid packages** now derives package status and bid-form counts from the same
  procurement record. It supports trade and owner search, status filters,
  directory-based bidder suggestions, full-directory search, invitations,
  invitation status, and per-company calls, notes, and message history.
- Both screens render dedicated empty states for non-Jelleff projects and do
  not assume that a package, scope item, invitation, or outreach record exists.
- The current actor passed to actions is the app's displayed user,
  `Marcel Khoury`, until an account/session contract provides that name.

The old UI no longer references `ScopeRow`, `initialScopes`, `Package`,
`initialPackages`, or the `scope-builder`, `packages`, and `invitations`
storage keys. You can delete those legacy data exports and storage migrations
now. The organization-wide `directory` draft remains in use as agreed.

Validation passed on the combined branch:

1. `pnpm check`, including `check-procurement.mjs`
2. `node node_modules/typescript/bin/tsc --noEmit`
3. `pnpm build`

I also exercised scope approval and publish readiness, invitation search, the
existing outreach log, desktop and 390 px mobile layouts, keyboard-accessible
dialog controls, and both empty procurement screens. There was no page-level
horizontal overflow and no browser console error. Jelleff is restored as the
open project after the empty-project check.

The combined work is merged into local `main` at `1ee9be7`. It has not been
pushed because pushing `main` triggers the live deployment.

### Next for Claude Code

Start `claude/wave-2-submissions` from local `main` at `1ee9be7`, then do these
in order:

1. **Remove the replaced records.** Delete `ScopeRow` and `initialScopes` from
   `lib/data/preconstruction.ts`, and `Package` and `initialPackages` from
   `lib/data/commercial.ts`. Remove stale manual text that still describes
   Scope builder, Bid packages, and invitations as separate unsynchronized
   previews. Do not remove the shared bidder directory.
2. **Land the subcontractor-submission domain contract before any UI work.**
   Add typed records and pure actions for a bidder's draft/submitted/revised
   response: project, package, invitation and bidder IDs; base bid; line-by-line
   scope answers; exclusions, alternates and clarifications; attachment
   metadata; status; submitter; submitted time; and revision history. Validate
   that the invitation exists and that every required scope item has a response
   before submission. Add an automated contract check and include it in
   `pnpm check`.
3. **Define the server boundary without inventing a database.** No database,
   auth provider, or server file store is configured in this repo. Specify the
   request/response shapes and repository operations the API routes will need,
   then document the one provider decision and credentials required to make
   submissions persistent. Do not add a fake in-memory production backend.
4. **Send the next handoff at the end of this file.** Include the commit hash,
   exported type/action names, validation rules, API/repository shape, the exact
   provider decision needed from Danial, and the full check/build result. That
   will let Codex build the portal submission and estimator review UI without
   guessing.

Do not push `main` or deploy. Keep this work on the Claude branch until the
combined review passes.

— Codex
