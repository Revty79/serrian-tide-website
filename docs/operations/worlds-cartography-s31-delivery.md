# Stage 3 Pass 1: cartography delivery

Status: S3-1A through S3-1E implemented and technically validated at **`62eb4a47a4e5442aac45bafe0f1cdd28750f010d`**. The following delivery commit adds this report and indexed evidence without changing the tested implementation. Stage 2 was explicitly owner-approved before this work began. This delivery does not record owner artistic acceptance of Stage 3 or authorize its next pass.

## Using the appearances

Open a World, choose Atlas and open or create numerical terrain. In the map settings' **World** tab, choose **Map Appearance**:

- **Classic Elevation** retains the original scientific colors and Classic lighting.
- **Physical Relief** retains Natural, Enhanced, Dramatic and custom exaggeration.
- **Topographic** uses coordinated hypsometric colors, physical illumination, actual elevation contours with heavier fifth contours, a sea-level coastline and optional bathymetry.
- **Illustrated Fantasy** uses original ivory/parchment materials, ink coastlines, connected numerical ridge/valley interpretation and fine terrain-following slope strokes. Contours and bathymetry initially stay off in this presentation; they remain optional.

The existing relief preset/intensity controls remain available. **Cartographic appearance settings** contains contour visibility and interval, coastline emphasis, decoration, contrast, depth coloring and illustrated paper. Vertical intervals use the selected height unit and remain stored as physical metres. Zero selects an automatic interval. The on-map legend reports the base interval, fifth-contour emphasis, numerical overview spacing and dense-slope generalization.

Changing appearance previews it in this browser and retains the same canvas, pose, measurements, source and tool. **Save map appearance** separately saves this map's default for another browser/device. **Load saved appearance** explicitly restores that default. Local viewing preferences may differ from the shared default. A lost accepted save retains its original request, including through reload; retry confirms the same appearance revision. Read-only Admin review can change the local view but cannot save a default.

Both new styles also work in Describe Your World and procedural previews, accepted root terrain, expanded editing, local refinement, painting and zooming. Preview appearance never publishes terrain. Markers and editing overlays compose above the map; rulers/grids retain their contrast, and styled brush cursors receive an additional contrasting outline.

## Appearance engine

See the [implementation architecture](../architecture/worlds-cartography-s31.md). Modules separate strict versioned appearance, material colors, physical illumination, sea-level/height linework, smoothed numerical crease interpretation, visible texture scheduling, controls and persistence. The height field remains read-only to the renderer.

Contours use interpolated numerical cell-edge crossings and actual centre-height saddle decisions. Per-cell contour work and per-tile pen strokes are bounded. Automatic intervals use the viewport's physical extent consistently across refinements. Dense steep cells generalize linework instead of inventing finer samples. Illustrated slope strokes follow saved gradients and connect to smoothed numerical relief; they are neither mountain sprites nor randomly stamped icons. Original procedural materials/linework require no external assets, renderer, AI service, paid subscription or new dependency.

The CPU Canvas2D presentation cache renders visible root/refinement tiles and retains at most **2,304 textures / 64 MiB of texture pixels**. Texture sizes adapt within 64-256 pixels per tile. Numerical-halo preparation yields between rows; texture work uses a small painting budget. Only the current job allocates its halo. Cache keys include material settings, sea level, view interval/detail and numerical content. Active working tiles retain their cache across accepted saves; affected tiles/halos are invalidated. Passive unchanged numerical content can reuse presentation through a revision change.

The original World frame, wrapping, sparse numerical detail cache and exact rounded overview hierarchy remain intact. Rectangular roots use only integral, complete-tile overview levels. Numerical colors remain consistent at coverage boundaries, with explicit source spacing rather than fictitious extra detail. The original relief is a temporary loading fallback while visible cartography is prepared.

## Visual and numerical review

Evidence is in [the Stage 3 Pass 1 directory](../screenshots/worlds-atlas-s31/). Compare the same accepted terrain in [Classic](../screenshots/worlds-atlas-s31/world-classic-elevation.png), [Physical](../screenshots/worlds-atlas-s31/world-physical-relief.png), [Topographic](../screenshots/worlds-atlas-s31/world-topographic.png) and [Illustrated Fantasy](../screenshots/worlds-atlas-s31/world-illustrated-fantasy.png).

The three-continent comparison includes numerical ranges, plains, highlands, a valley and sea-gap islands. [Local Topographic](../screenshots/worlds-atlas-s31/local-topographic.png) and [local Illustrated Fantasy](../screenshots/worlds-atlas-s31/local-illustrated-fantasy.png) use the accepted 20 km refinement and its roughly 1 km mountainous island, bay and low eastern coast at 19.53125 m spacing. [Million-km Topographic](../screenshots/worlds-atlas-s31/million-km-topographic.png) and [Illustrated Fantasy](../screenshots/worlds-atlas-s31/million-km-illustrated-fantasy.png) verify the wrapped 1,000,000 km square case.

[Regional Topographic](../screenshots/worlds-atlas-s31/regional-topographic.png) demonstrates 500 m minor / 2,500 m emphasized contours on the same northern landmass. [Regional Illustrated Fantasy](../screenshots/worlds-atlas-s31/regional-illustrated-fantasy.png) demonstrates the connected ridge and slope engraving at the same physical view. All these are actual application captures, not concept artwork.

Review also includes actual description/procedural preview screenshots, [phone](../screenshots/worlds-atlas-s31/cartography-390-map.png) and [tablet](../screenshots/worlds-atlas-s31/cartography-820-map.png) workflows, and adjacent/nested/wrapped coverage. GPU acceleration is disabled. Native touch/pen protocol input exercises navigation and rulers; this is emulation, not physical-device certification.

The first artistic review rejected a predominantly tinted-relief result. The revised illustration adds connected crease interpretation and tapered slope linework, removes irrelevant lowland ink, reduces water contour clutter and preserves a coherent paper/ink presentation. Technical checks do not decide whether this engraving language meets the owner's final artistic preference.

Numerical checksums and terrain revisions before/after style and control changes are identical. The browser verifies complete fine samples, then sculpts with Topographic, saves and exactly undoes the numerical change. New-route tests cover original request recovery after a lost response/reload, shared defaults in a clean browser, concurrency, owner/foreign/Admin/Player/anonymous access, ordinary privacy, CSRF, validation and bounded request bodies. Appearance writes leave numerical versions/tiles, map identities and Town/Shop relationships unchanged.

## Validation receipt

The optimized production build, root TypeScript, offline Drizzle metadata check and all **2,367 unit tests across 297 feature files** pass, without unit failures or skips. Nine new domain tests cover strict appearances, numerical contours/saddles, continuity, bounded work, rectangular overviews and numerical illustrated creases. Full lint has zero errors and one pre-existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts`.

The complete unfiltered production/browser/database chain passes at `a3dd0a7dd2367dc9682d3255b503cada94d248ae`. Final review identified and corrected one first-default recovery issue: when another tab creates the first saved appearance, **Load saved appearance** now remains available after the conflict. A fresh optimized production build at `62eb4a47a4e5442aac45bafe0f1cdd28750f010d` passes all new cartographic workflows, including the real concurrent-first-save case, regional captures, retained Pass 8 creation/device workflows and database regressions. Root TypeScript, the nine cartographic domain tests and lint of both changed files pass again. The broader unit/lint/metadata results precede this two-file correction; no schema, renderer or generation code changed in it.

Across 1,529 checked runtime/data/configuration files, the final validation copy matches the main workspace byte for byte. Next adds only its isolated build-directory type includes to the validation copy's TypeScript configuration. V1/V2/V3 generation, shared physical noise and both retained relief renderer implementations are unchanged. All 139 prior migration contents and their journal entries remain unchanged. See `source-verification.json`, `full-source-verification.json` and `delivery-validation.json`.

Measured with GPU acceleration disabled on this computer in the final run: first three-continent Topographic preparation took about **1.28 s**, Illustrated Fantasy **1.57 s**. The million-km case took about **0.35 / 0.41 s**, respectively, using 2 MiB of cached textures and a 7.5 ms maximum painting batch. Twenty-four fine-terrain navigation cycles took about **2.14 s**, with 44 MiB of retained textures, a 45.1 ms maximum batch and no stationary-pointer repaint; collected JavaScript heap decreased rather than growing in that run. The small 100 m brush plus exact undo repainted **32 visual tiles**. These are observations from this run, not hardware guarantees. The phone/tablet runs retained approximately 528 / 899 px of map height and recorded maximum batches of 8.7 / 22.1 ms.

Matching uniform numerical water produces exactly equal sampled RGBA values across adjacent coverage, nested coverage and the wrapped seam in each new style. Refinement metadata remains unchanged. The final review also verifies original appearance retry after reload, a clean-browser saved default, actual styled painting/undo, both creation previews, the 2 km shortest wrapped ruler, and native touch/pen input. Technical receipts distinguish emulation from physical-device certification.

`delivery-validation.json` indexes production, TypeScript, lint, unit, source/migration preservation, database, browser and performance evidence. Raw logs and unsuccessful intermediate captures remain separately in ignored local artifacts. Validation creates only newly owned loopback PostgreSQL clusters, private numerical directories and a production application copy; it does not use shared DEV as a test target.

The complete disposable chain is reproducible with `node --conditions=react-server --import tsx scripts/worlds-cartography-disposable.test.ts`. Setting `SERRIAN_S31_FOCUSED=1` runs the final cartographic/Pass 8 review without repeating the complete information-workspace journey. The runner builds its own application copy and requires a local PostgreSQL binary installation; it never loads `.env.local`.

The retained unfiltered chain covers Passes 2-8, blank/generated/described/imported creation, V1/V2/V3 preservation, physical units, all sculpt/landform tools, refinement protection/history/recovery, pointer input, full Town/Shop/Individual workshops, thirteen information creator families, lifecycle, History/calendars/timelines/Campaign associations, bookmarks, privacy and CSRF. The existing 133 Campaign/runtime tables, historical map rows and Realm-map versions remain unchanged. The user-account deletion inventory includes the new appearance attribution FK and retains fail-closed protection.

## Migration and controlled deployment

**MIGRATION REQUIRED: `0139_world_cartographic_appearance.sql`. It has NOT been applied by this pass to shared DEV or Production.**

The new table stores the map default, its separate revision, spec, retry identity and editor attribution. The original constrained `world_map_canvas.rendering` JSON remains unchanged. Existing maps require no data conversion and start without an appearance row. Without 0139, numerical editing and local style previews remain functional; map-default saves display an explicit migration requirement.

The starting and final read-only DEV checks confirmed localhost `serrian_tide_dev`, role `serrian_tide_app`, **139 entries through 0138**. The final check confirms the appearance table is absent and **0139 is still pending in DEV**. Production was not contacted. Disposable tests include fresh replay through all 140 entries, upgrade of a real 0138 schema populated with accepted Stage 2 root/refinement data, **340 existing tables unchanged**, appearance persistence, paired retained numerical-object verification, complete backup/restore and repeat migration. No historical migration is rewritten. Migration 0139 SHA-256: `09b90083e4a92321f559b85931b6ba0a1186cdd35f4a62dfa97c4659deaa7dab`.

No new configuration or package dependency is required. The existing PostgreSQL, authentication and private terrain storage configuration remain necessary. Git publication does not deploy code, data or private assets.

For separately authorized deployment:

1. Independently verify the exact release, target identity and current migration ledger, particularly Production.
2. Back up the database and corresponding private numerical objects and verify restoration in an owned disposable environment.
3. Apply all pending journal entries in order. A target at 0136 needs 0137, then 0138, then 0139; an up-to-date Stage 2 target needs only 0139. Use the normal migration runner, never schema push or manual ledger edits.
4. Activate compatible code only under deployment authorization. Verify old-map reopen, all four appearances, a separate map-default save/reopen, owner editing, read-only Admin review and a disposable refined-terrain save.
5. Retain the paired backup and Git checkpoints through owner acceptance. Follow the [pass deployment standard](pass-deployment-standard.md).

Reverting Git does not reverse schema or data. The previous Stage 2 renderer ignores appearance records and keeps numerical data intact, but it lacks the new appearance UI and FK inventory. Prefer a compatible forward repair and retain compatible administrative writers. For restoration, pause writers, preserve later work and restore database/private objects together. Do not drop metadata, immutable versions, numerical objects or ledger entries as a rollback shortcut.

## Deliberate bounds and next decision

This is numerical topography and engraved fantasy interpretation. Smooth saved ranges produce smooth continuous formations; the styles do not invent individual peaks or replace landforms with stock artwork. Finer illustration depends on real accepted numerical coverage. Dense contour suppression and interpolated line presentation are explicit, and fractional measurements do not create fractional-height samples. Optional bathymetry reflects depth differences already present in saved terrain. First-use style preparation may briefly show the retained relief fallback.

No forests, vegetation, simulated rivers, climate, biomes, political simulation, Town Maps, interiors, dungeons, gameplay changes, Studio work, shared-service restart, Ubuntu change or deployment is included. Owner hands-on visual acceptance remains pending. Do not start the next Stage 3 pass automatically.
