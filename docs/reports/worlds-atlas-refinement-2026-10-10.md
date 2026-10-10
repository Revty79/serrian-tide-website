# Atlas naturalism and performance refinement

Starting release: `f66b484f9a2487947020d6fb6d5532ba139efad7` (approved full 3C). This pass refines native continent cartography and stops before 3D. It adds no city, building, dungeon, canon, climate simulation or connected-scale authoring. The homepage change `86be939` and existing application systems remain intact.

## Naturalism

The original generator used grid slots for continents, similar radial coast amplitudes, serpentine rectangular woodland sweeps and round-robin water placement. These produced recognizable balance and repetition across maps.

The new `serrian-atlas-v2` uses unequal continent weights and irregular, separated positions; rotation, lobes, folds and variable local roughness broaden coastline character. Bays vary in width/depth, while directional instructions remain authoritative. Islands form loose clusters and broken chains with isolated outliers. Mountain lengths, bends and spurs vary and gain smaller foothills. Woodland groups have irregular spiral cores and sparse fringes; mixed terrain can leave intentional open spaces. Area-weighted water placement, varying river meanders/widths and short lake strokes reduce repeated arrangements.

Everything remains ordinary editable polygons, source strokes, paths and linked labels. Counts and supported description instructions still pass the same validation. Decorative terrain creates no location records. The untouched v1 engine remains available and has fixed seed/description reproduction receipts; saved maps always open their saved source. Manual edits, duplicates and variations preserve the existing identity/provenance rules.

## Performance

Identified repeated work: synchronous main-thread generation, repeated polygon/range-distance calculations in routing, multi-path SVG trees per terrain mark, rebuilding editor initial data and draft strings during navigation, pointer-event updates faster than display frames, and rendering every library thumbnail.

Changes: local cancellable generation Worker; cached grid elevation/range distances; reusable original SVG symbols with memoized mark/scene artwork; one-time editor initialization and draft fingerprints cached until source changes; animation-frame pointer batching with final-event flush/cancellation restoration; thumbnails mount only near the visible library viewport. Resolution-aware bitmap caches retain every original mark while avoiding expensive SVG repainting. At rest, a cache is used only above actual screen resolution; navigation may reuse it temporarily. Deep zoom and the selected drawing use live vectors, and export always uses the complete vector scene. Caches invalidate with source/style/shared-theme changes and release their object URLs on replacement/unmount. No terrain source or mark is deleted for performance. The Atlas API still returns the complete authorized World bundle.

Measured acceptance results are recorded in the committed screenshot directory's `performance.json`. The dense case is a saved generated rugged chart with additional ordinary editable terrain strokes near the existing 6,000-mark limit. It checks full-detail rendering, zoom/pan, terrain editing, undo/redo, save/reopen, stable source IDs, immutable creation metadata and full-map PNG export. The final case has **5,460 marks, 107 drawings, 88 prepared/displayed terrain caches and 6,294 DOM elements**, including retained vector source. The committed baseline and final measurements use the same stress recipe/source count and local production Chromium 134 at 1440x1100.

| Measured interaction | Before terrain caching | Final | Result |
| --- | --- | --- | --- |
| Zoom, 95th-percentile frame | 851.1 ms | 36.1 ms | Twelve alternating zoom clicks: 11,919.53 ms -> 1,268.28 ms overall; final worst frame 163.2 ms. |
| Pan, 95th-percentile frame | 700.6 ms | 18.1 ms | Final worst frame also 18.1 ms, with no recorded main-thread long tasks. |
| Dense edit, click/read completion | 665.45 ms | 241.96 ms | Selected source remains a live vector; final worst sampled frame 54.2 ms. |

Final continental/archipelago/northern previews took 880.21/267.54/247.94 ms end to end, with respective 95th-percentile frames 18.1/36.0/18.1 ms and no recorded main-thread long tasks. Pure v1/v2 generator timings for small/medium/dense recipes are also retained; different algorithms produce different source counts and v2 is not faster for every recipe. The responsiveness gain comes from background work and cheaper rendering rather than a promise of universally shorter computation. Measurements exclude repeated automation accessibility-tree searches by resolving navigation controls before the timed interaction and include two subsequent animation frames. They are local-machine observations, not guarantees for every device.

## Controls and remaining limits

One clear Landscape generation choice exposes Natural landscapes or Original 3C landscapes, with shared field guidance. Existing presets/settings remain available; no numeric chaos knobs or additional recipe fields were added. Description interpretation keeps its original supported vocabulary, review and warning acknowledgment and records the chosen engine version.

This remains artistic generation, not tectonics, erosion or climate simulation. Some seeds can still produce pointed bays, short ranges or narrow river corridors. Requested coverage remains a tendency and rejection packing can reduce it. True tributary networks/lake-connected drainage are not added. Very dense scenes still have an initial vector/cache preparation cost, and deep zoom/complex selected strokes can cause occasional longer frames. Older phones and very large World libraries may need future renderer/pagination work; caching does not raise the existing source limits. Generation can reject configurations that cannot fit valid land/terrain/routes; errors retain the recipe and any prior preview. Browser-worker startup can be affected by a deployment's restrictive content-security policy; self-hosted worker scripts must be allowed.

## Changed files

- `src/features/worlds/map-generator.ts`: version dispatch; new `map-generator-v1.ts` preserves approved source and `map-generator-v2.ts` supplies naturalism/routing refinements.
- `generation-spec.ts`, `description-interpreter.ts`: both algorithm editions accepted; description baseline preserves the explicit edition.
- `atlas-generator.tsx`, new `generation.worker.ts`: guided edition choice, background preview, cancellation and worker lifecycle guards.
- `cartography-scene.tsx`, new `cartography-raster.ts`: reusable original terrain definitions, memoized artwork/scene and resolution-aware display caches; complete source/vector export stays available.
- `atlas-map-editor.tsx`: source initialization/fingerprint caching and pointer batching with final/cancel handling.
- `atlas-workspace.tsx`, new `atlas-thumbnail.tsx`: visible thumbnail lifecycle.
- `drizzle/0107_worlds_atlas_refinement.sql`, `drizzle/meta/0107_snapshot.json`, appended `_journal.json`: new validator migration; previous migrations unchanged.
- New `generation-refinement.test.ts`, new `scripts/worlds-refinement-checks.ts`, updated `scripts/worlds-generation-checks.ts` and `scripts/worlds-pass-one-disposable.test.ts`: old recipe reproduction, naturalism, actual measurements, dense source, v1 upgrade preservation and existing regression coverage.
- `.gitignore`: task diagnostic logs under ignored artifacts; evidence stays committed.
- `docs/architecture/worlds-atlas-generation.md`, this report and `docs/screenshots/worlds-atlas-refinement/`: implementation/release documentation and real desktop/phone/map/export/measurement evidence.

## Verification

- `npm run validate:worlds`: **55/55 passed**, including unchanged v1 reproduction receipts, description parity, varied continents/islands/woodlands and 25 preset/seed geometry, source-limit, separation and river-route combinations.
- Existing navigation, Campaign workflow/membership, appearance, catalog visibility, lifecycle and authorization unit regressions: **148/148 passed**.
- `npm run validate:catalog-visibility-db`: **52/52 across seven suites**, fresh complete migration chain and upgrade/privacy regressions.
- `npm run validate:worlds-disposable`: **passed** with the final production build/TypeScript and real desktop/390x844 touch browser checks. Includes actual v1 pre-0107 source/metadata preservation, private owner/explicit read-only Admin/Player/anonymous authorization, no-store/CSRF, two-tab conflict recovery, historical date/timeline/calendar preservation, unchanged Campaign/combat/Form/Evolution snapshots, native 3A/3B/3C workflows, worker cancellation, interpreted-description/server-forgery protection and the measured dense source edit/save/reopen/export case. No browser runtime errors.
- Standalone TypeScript, full repository lint, Drizzle migration checks, no schema drift and `git diff --check`: **passed**. Previous migration/source/homepage/system preservation checked against the approved starting commit.
- `npm run validate:password-recovery`: **passed**; production build, keyboard show/hide, all-role hashed recovery setup, concurrent consumption/expiry, 390px recovery, password/session/code invalidation, CSRF and rate limiting; no browser runtime errors.

The [committed evidence](../screenshots/worlds-atlas-refinement/README.md) includes 19 real PNGs: five naturalism/before-after comparisons, dense display/native export and twelve existing-workflow captures including desktop and phone. Before/final performance JSON is committed too. Actual desktop, phone, described continent, unequal continents, archipelago and dense artwork have been inspected. The original 3C images are untouched. Early harness-only fixture/probe/cancellation failures were corrected before the final passing suite; raw diagnostic logs remain under ignored task artifacts.

## Migration, deployment and recovery

Only **0107_worlds_atlas_refinement.sql** is new, after unchanged **0106**. It renames/retains the original strict validator, recognizes v2 through the same bounded envelope and explicitly rebinds/revalidates the map constraint. It changes no rows, columns, IDs, geometry or saved metadata. Fresh installations apply the normal journal chain; existing 3C databases apply only pending migrations, ending at 0107. The upgrade rehearsal includes actual generated v1 map/features/drawings/geographies saved before 0107 and compares all rows exactly afterward.

No new package, credentials, SMTP/AI service or environment variable is required. A custom CSP must permit this application's bundled same-origin Worker; default repository configuration needs no change. If a custom CSP restricts images, allow the local blob images used by terrain caches; failure to prepare a cache falls back to complete vector artwork.

For an authorized release: verify the exact commit, target database identity and ledger; protect a restorable backup and current release; stage/build the application, pause conflicting writers, apply pending committed migrations in order with `npx drizzle-kit migrate`, activate the tested release and smoke-test login, legacy/v2 Atlas read/edit/generate/duplicate and owner/explicit Admin review/Player denial on desktop and phone.

A code revert does not undo 0107. Do not drop recipe metadata, downgrade validators, edit published migrations or remove ledger rows to force an older checkout. Pre-refinement code does not support v2 recipe validation for duplication/regeneration; it is not a complete rollback target once v2 maps exist. Prefer a reviewed forward fix or retain a release that reads both editions. If backup restoration is required, stop writers, preserve/reconcile post-backup edits and restore the matching application/database state under operator control. Saved editable source remains authoritative throughout recovery.

## Release checkpoint

The clean local release commit is identified in the completion response. No remote push, server deployment or Production write is performed by this pass. The pass is independently deployable after its migration and ready for an authorized GitHub push and controlled server deployment. No known product blockers remain. Cache preparation/deep zoom and future library pagination limits are documented above; none require 3D to use this release. Development stops here for review before 3D.
