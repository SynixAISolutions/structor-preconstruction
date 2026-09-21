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
