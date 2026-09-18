# Jelleff model studio

Open http://localhost:3010/#model or choose **3D model studio** in the sidebar.

## What works

- Drag to orbit, scroll/pinch to zoom, right-drag to pan. Arrow keys pan when the canvas is focused.
- Top view, reset view, focus on selection, isolate an element, and expanded workspace.
- 77 selectable elements: 40 wall segments, 12 glazing segments, 9 schematic open door leaves, 16 floor-finish zones.
- Cutaway/full-height modes, wall visibility, material colours and room labels.
- Element picker provides keyboard access to the same information as clicking the model.
- Compare the model with original drawing images; A1.1 shows an approximate selected-element overlay.
- Source-sheet zoom and full-resolution sheet links.
- Geometry checks and existing bid-leveling/workbook preservation checks.

## Short walkthrough

1. Rotate the model and point out the gym, angled wing and open mechanical yard.
2. Click **Inspect the gym floor**. Show FAF-01, poured sports flooring, and its evidence.
3. Open **A12.1** from the source links and zoom into the finish schedule.
4. Select an office partition from **Find an element**, then inspect the SA3.20 assembly and A8.1.
5. Use **Compare**, choose A1.1, and show the highlighted approximate location.
6. Toggle **Cutaway**, **Material colours**, **Room labels**, then reset the view.

## Truthful scope

This is a prepared reconstruction of the supplied Jelleff drawings, not an automatic PDF-to-model converter. No upload control simulates conversion. Coordinates are manually approximated from A1.1, calibrated to its 177 ft 4 in overall dimension. This is not a survey or a quantity takeoff.

Materials distinguish a documented assembly/product from an illustrative assignment. Even documented materials require review of their model placement. Door materials and envelope assemblies are schematic. Gym markings are illustrative. The gym uses a poured sports-floor appearance, not timber flooring.

The model is first-floor only. It omits the second floor, roof, detailed structure, MEP, small wet-area partitions and exact building assemblies. A5.1 documents level datums of 0, 14 and 28 ft; these are references, not confirmation of every wall top. Cutaway mode lowers visible walls to 5 ft for viewing. No prices or measured quantities are generated.

## Source pages

From `JRC_GMP-Permit_Drawings_251209.pdf`, PDF pages counted from 1:

| Sheet | PDF page | Purpose |
| --- | --- | --- |
| A1.1 | 46 | First-floor layout |
| A5.1 | 57 | Building sections and height references |
| A8.1 | 64 | Partition types |
| A12.1 | 79 | Finish schedule |
| A12.2 | 80 | Finish locations |

Only these selected source-sheet images are served by the demo. The original PDFs are unchanged. Source drawings are client material; do not publish this demo publicly without permission.

## Implementation and checks

In `app`, run `pnpm dev` to serve port 3010 locally. For the compiled demo, run `pnpm build` then `pnpm start`. Both bind to loopback only because the source drawings are client material. `pnpm check` runs leveling, workbook and model checks; `pnpm exec tsc --noEmit` checks types. The model check requires Node 22 with experimental type stripping or newer.

- `app/ui/model-studio.tsx`: Three.js viewer, camera, selection, source viewer, inspector.
- `app/ui/model-studio.css`: responsive workspace, quiet green palette, warm material colours, restrained transitions.
- `lib/jelleff-model.ts`: prepared geometry, material definitions and evidence references.
- `public/models/jelleff/`: original-sheet PNG renderings.

Uses the existing React/Next application and one rendering dependency, Three.js. No reconstruction service, database, cloud upload, API subscription or email permissions are added.
