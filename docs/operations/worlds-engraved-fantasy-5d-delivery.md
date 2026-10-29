# Atlas Stage 3 Pass 5D — Engraved Fantasy Atlas

Starting checkpoint: `d8fc41a9428fb7aa9c5211ec544d68007b3937a2`. Verified application checkpoint: `9af47ca01a1e5a23d7b21f84b1330ed9f344b946` (2026-10-29). Technical verification is complete. Owner artistic acceptance, physical-device acceptance and deployment remain separate.

**MIGRATION 0146 IS REQUIRED before saving the new engraved appearance or named styles. It has only been rehearsed in owned disposable databases. Shared DEV and Production have not been accessed or migrated.**

## Implementation

The sixth appearance is selected through **World → Map Appearance → Engraved Fantasy Atlas**. **Open style settings** provides four ink/paper palettes, four detail levels and collapsed controls for stroke, relief, forests, environmental linework, shorelines, water, parchment and ornament. Preview, cancel, accept, named presets and the separate appearance save retain their established meanings. Existing maps keep their previous appearance.

The renderer uses the existing immutable heightmap/refinement sampler, environmental classification, protected vegetation coverage, ordered manual materials and accepted hydrology. It produces no new elevations, rivers, vegetation classifications, settlements or gameplay records. Sources and creator artwork remain authoritative after style changes. Existing automatic symbol placements remain saved; this appearance substitutes its connected geographic interpretation while retaining deliberate manual artwork.

- Relief uses numerical slopes, curvature-derived ridge spines, descending face strokes, directional light/shadow, restrained contour lines and three ridge-weight tiers. Valleys remain open; a flat high plateau receives no invented mountain peaks. This is a plan-view engraving rather than a new oblique terrain engine.
- Forest masses use accepted coverage, irregular physical clusters, openings, overlapping varied crowns and branching conifer/broadleaf/tropical/open-savanna treatments. World views use restrained canopy marks; regional and close views expose foliage detail. Unknown environmental coverage stays unknown.
- Sea contours use the existing reconstructed sea surface. Existing river paths, classes, widths, lakes and wetlands receive coordinated ink/paper styling. Shore accents and sparse ocean marks do not create water geometry. Dry ground, rocks, grass/reeds and cold terrain use different line motifs; volcanic landmarks are never inferred.
- Original optional neatline/double/vine/botanical borders, scroll/plaque/ornate/illuminated cartouches and rose/mariner compasses use existing **Labels & Layout** visibility, positions and title/subtitle fields. Screen composition stays separate from geographic artwork. Narrow canvases constrain cartouches and compasses to the page. The engraved mobile style inspector reuses the compact label inspector treatment.
- Existing anchored labels and paths retain wording, associations, priorities, visibility and custom typography. Automatic engraved text uses installed serif families with coordinated ink/halos; it adds no font downloads. Existing manual artwork is re-inked for this appearance without modifying its source assets or saved placements.

The five previous appearances and their old document versions remain supported. Engraved appearance documents use version 3; engraving settings have their own version 1 and `geographic-engraving-1` renderer identity. New UI saves and named snapshots explicitly capture all engraving choices. Named snapshot canonicalization also corrects an exact-retry failure caused by PostgreSQL JSONB property ordering.

## Persistence and deployment

`0146_world_engraved_appearance.sql` widens the two existing appearance/style CHECK constraints. It adds **zero tables and zero columns**, changes no rows and preserves old allowed values. All historical SQL and snapshots through 0145 remain frozen. SQL SHA-256: `64b4dddb36fdae3e0d62f9708c216ed855128c3fd638588500d25e5d5bddbd42`.

The service checks for the new validators before accepting an engraved save. Without 0146 it returns an explicit migration-required response while retaining the preview and original retry command. Authorization, optimistic concurrency, immutable named styles, labels/artwork history and browser recovery reuse existing services.

For a separately authorized deployment: verify the actual target, take verified database/private-asset backups, apply pending numbered migrations in ledger order through 0146, build/publish the matching application and smoke-test old/new maps. This pass performs none of those shared-target actions. No new environment variables, packages, image assets, fonts or external rendering services are required. Code rollback does not reverse a database migration; once v3 documents exist, retain a compatible reader or prefer a forward correction. Do not delete immutable presets to make older code accept them.

## Rendering budgets and provenance

Canvas2D remains the renderer. One worker prepares canonical 192-pixel geographic tiles with a 24-pixel sampling halo. The cache is capped at 24 MiB, with at most 160 requested unique tiles and additional coarsening to respect the byte limit. Main-thread fallback runs the identical resumable artist with a 4 ms target, yielding between bounded rows/stages; the largest observed batch was 60.8 ms, below the unchanged 100 ms gate. Paths, input fields and ornament caches are bounded; batching pen paths and caching curvature avoid frame-by-frame vector regeneration. Visible drawing uses cached bitmaps. Physical tile keys, wrapped coordinates and existing refinement dependencies preserve anchoring across camera/source changes. Manual artwork shares each prepared sprite across wrapped copies, caches immutable paths from the fixed installed library and avoids unchanged Canvas transforms; clearing the painter releases both caches.

All new ornament, foliage and relief paths are original code. The owner's photograph was studied as a quality reference; no pixels, traced shapes, layout, lettering or proper names were extracted. The existing versioned SVG and terrain material libraries remain unchanged. Raw captures, failures, logs and database receipts stay in ignored `artifacts/engraved-5d-*` directories; no gallery or owner photograph is committed. Byte estimates describe typed data/bitmaps, not process RSS.

## Validation and receipt boundaries

- All **2,522 units pass**, 308 feature test files, zero failures/skips, including 11 engraving tests. Root TypeScript passes. Full ESLint has zero errors and one pre-existing unused `LoreFamily` warning; all subsequently changed files pass their final lint checks. Offline Drizzle metadata validation passes with a no-dotenv config and unused loopback URL. Portable raster checks pass 2/2 applicable tests; the POSIX permission test is explicitly skipped on Windows.
- Owned PostgreSQL 18 rehearsal passes fresh replay, populated 0145 → 0146 upgrade, actual missing-migration responses, full backup/restore, restored v3 reads, immutable histories and repeated migration. All rows in **352 existing tables** remain exact; the ledger contains 147 entries. No shared database was contacted.
- The **complete inherited production/database/browser aggregate passes** in `artifacts/engraved-5d-full-3`, build `V4EiIiuJZ0I2_ZDRvXDDp`, runtime SHA-256 `9eaa8e206de811b86f0c56694b9acb7c06ef09d0f998c8cd42d2187f668c23f0`. Terrain browser coverage was enabled. It includes generation/import/sculpting/refinements, measurements, Town/Shop workshops, materials, water, climate/vegetation, all appearances, styles/artwork/labels, recovery and permissions, all twelve information destinations, thirteen creator families, lifecycle, History/calendars/Campaign associations and the phone journey. It reports zero page errors, zero retired-map requests, **133 gameplay tables unchanged**, and exact legacy map/Realm relationships.
- Subsequent review reproduced a retained-tint bug: switching from a customized prior appearance could recolor engraved water. The final application skips that older color transform only in the sixth appearance. Its new unit regression checks all four palettes and retained tint behavior in all five older appearances. A fresh production build, `dDmSMHN23DkS4f5Roenp4`, runtime SHA-256 `79870853573aa2ea2988ba79f2a818996a354e56e92bfde292a61c1f193025aa`, passes the **complete engraved workflow** in `artifacts/engraved-5d-final-correction-2`: preview/cancel/accept, named styles, saves, exact lost-response/reload retry, conflict retention, six-style switching, the full gallery, rendering, devices/security, refinement and a new live 5C comparison. These are separate aggregate and final-correction receipts.
- Actual saved waterways produce identical full-canvas RGBA hashes with inherited strong magenta/green tint on or off in **all four engraved palettes**. Saved water remains exact. Panning away/back preserves pixels; toggling older automatic artwork also preserves engraved pixels, retaining connected woodland. Climate/moisture overlays work and release their analytical cache. Simulated native CDP touch/pen at 390/820 px passes without page overflow; anonymous, Player, foreign, ordinary, CSRF/body limits and explicit read-only Admin API/GUI checks pass.
- Genuine million-kilometre World/fine-source validation compares actual Canvas lettering with its physical World projection in both fine and base views. Largest observed positional error is below 0.00002 px (0.2 px tolerance); labels and numerical fingerprint remain exact. The final refinement script was rerun after whitespace cleanup.
- A separate GPU-disabled Chrome comparison bundles approved 5C and optimized artwork painters: **60 cases have identical RGBA pixels, asset sets and draw counts**, covering five prior appearances, default/custom styling, small/large artwork, wrapping, selection and 1x/2x pixel densities.
- Final offline source/build verification passes: **8,561 protected approved Git blobs exact**, 1,707 final runtime/input files and 598 validation scripts byte-exact to the isolated copy. All 146 historical migrations/snapshots, original material/SVG assets, historical evidence, geographic solvers and gameplay sources remain preserved. The navigation correction remains present. Verifier: `scripts/worlds-engraved-source-check.mjs`; detailed final receipt: ignored `artifacts/engraved-5d-final-source-verification.json`.

## CPU comparison

Installed Chrome **134.0.6998.166**, `--disable-gpu`, same machine, same owned geographic inputs and reconstructed approved `d8fc41a` source. All nine unchanged limits pass on the final application. Rounded milliseconds:

| Journey | Accepted 5C | Final 5D | Limit |
|---|---:|---:|---:|
| Cold application ready | 3,156 | 2,187 | 3,945 |
| Warm navigation, ten keys | 145 | 93 | 500 |
| Regional ready | 2,647 | 1,231 | 3,309 |
| Close ready | 2,430 | 2,464 | 3,037 |
| Repeated pan/zoom | 4,439 | 3,313 | 5,548 |
| Main-thread fallback navigation | 4,022 | 2,571 | 5,027 |
| Far zoom ready | 386 | 380 | 1,000 |
| Input during climate calculation | 14 | 9 | 100 |
| Climate preview | 945 | 930 | 1,181 |

Worker and main-thread fallback pixels are identical. Repeated warm navigation reuses prepared tiles. Peak cached engraving bitmaps: 25,067,520 bytes, below 24 MiB; source estimate: 2,686,978 bytes; largest worker tile: 60.9 ms; final cached-bitmap draw: 0.4 ms. Extreme far zoom plans one tile and restores Fit correctly. Estimates cover typed data/bitmaps, not process RSS; these timings describe this machine and simulated inputs.

The successful full aggregate also passes its inherited live 5A/artwork and 5B/label comparisons. Its 1,024-placement artwork stress records 20 keys in **1,036 ms**, maximum draw **54.2 ms**, 1,680,160 cached bitmap bytes and no repeated preparation. Its 512-label forced-collision stress records **525 ms**, maximum draw **77.4 ms**, 156,820 measurement-cache bytes and no pan relayout/remeasurement. Existing 1,500 ms / 100 ms limits remain unchanged.

## Visual assessment, failures and limits

The final production gallery covers World/regional ridges, close woodland, monochrome/sepia/color, desert, cold ground, marsh/reeds, tropical/savanna foliage, ornament, lettering and prior Illustrated Fantasy on the same numerical terrain. Personally inspected actual World/regional/close forest captures and the final monochrome waterways with retained tint. Initial uniform tree rows and overly even slope marks were rejected during development; clustered crowns, ridge fans, directional shading and clearer dune crests replace them.

Artistic limits remain explicit: plan-view hachures are more diagrammatic than the reference's individually composed mountain illustration; the finite procedural tree vocabulary remains recognizable at close scale; coarse accepted terrain and polygonal creator boundaries constrain smoothness. Reference-level artistic parity and owner artistic/physical-device acceptance are not recorded.

Failed and incomplete evidence remains ignored locally:

- Earlier unit/database/browser iterations caught invalid v3 combinations, JSONB retry ordering, a fieldset selector and the oversized phone inspector. Focused performance setup initially lacked a computed environment field; the owned fixture is now populated and restored explicitly.
- `engraved-5d-full-1` failed inherited 20-key artwork navigation at 1,699.6 ms. `engraved-5d-inherited-stress-3` and `-4` failed the 100 ms artwork batch gate at 102.7 / 101.5 ms. The profiled diagnostic recorded 104.3 ms. Reusing sprites/paths and avoiding unchanged Canvas transforms corrected the cost while retaining approved pixels and thresholds.
- `engraved-5d-full-2` was deliberately stopped after its database/build phase when review found that older automatic symbols could suppress engraved forests. The correction and pixel regression pass in the successful aggregate and final build.
- The new retained-tint regression first reproduced magenta water accents. Its first build also caught missing `this` annotations in the test context; those annotations were corrected. `engraved-5d-final-correction-2` passes after the palette guard. The successful full-3 receipt remains separate and unchanged.

All captures, browser outputs, dumps, profiles, detailed receipts and the reference stay local and ignored. This is the single consolidated delivery report; documentation/evidence additions remain well below 50 KiB. The required generated Drizzle snapshot is schema source, with no duplicate gallery or receipt collection committed. Normal main publication is authorized. Shared migrations, deployment, owner-service restart, artistic acceptance, Studio, export/printing, new map hierarchy, gameplay work and the next pass remain outside this delivery.
