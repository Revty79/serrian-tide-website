# Stage 3 Pass 2F: rendering corrections and optimization

Status: renderer corrections technically complete. Exact implementation: **`2cb9c8adeba1b48f6f33fa2163b0076d3c2d39b1`**. The complete unfiltered production/browser run passes against 1,563 byte-exact runtime/source/asset files, source SHA-256 `a70bc25379c935f1bdb42d4a362d467faa305a490e6edacafbca78b041aefa46`, build `NQTONe1uOPxUOSoOCoDsN`. Owner-map parity and artistic acceptance remain outstanding. This pass does not authorize hydrology or deployment.

## What was diagnosed

The starting main checkout was clean at `a31ceed2afba7020a87ab3409624e228b644cd7d`. No later code corrections existed to overwrite. The owner's earlier server restart changed no tracked implementation and did not resolve the reported flat rendering.

The local application at `http://localhost:3000` is Next development running from this main repository. All twelve photographic diffuse/normal files return HTTP 200 and their complete bytes match the repository; see [local asset checks](../screenshots/worlds-atlas-s32f/diagnosis/local-static-assets.json). Missing static files therefore do not explain the reported discrepancy on this local URL. This does not prove that the owner's browser decoded them, selected the intended appearance/refinement, or loaded the same geography as a fixture.

The current local environment targets **`serrian_tide_prod` at `10.0.0.218:5432`**, rather than the local DEV target in the prior delivery receipt. A guard refused the proposed database inspection **before constructing or connecting a PostgreSQL client**. The owner browser is not connected to this session. No direct Production database connection, terrain/ledger inspection, shared database write, configuration edit or owner-service restart was performed. Read-only target authorization and the actual World/map selection were requested; neither is inferred from elapsed time. Public local-app HTTP diagnostics are separate from a direct database inspection.

Consequently, **the owner's specific flat map is not verified fixed**. It could contain little stored relief or use a different source/settings/runtime; those are possibilities, not established causes. The in-app diagnostic download below makes the remaining comparison concrete.

## Renderer changes

Canvas2D remains the display architecture. Bounded artwork preparation moves to a dedicated worker when Worker/OffscreenCanvas are available. Workers receive cloned derived snapshots; the host retains authoritative terrain and persistence. One tile is in flight per painter, no obsolete result is displayed, latest snapshots coalesce, and errors or a 45-second timeout fall back to the bounded main-thread path. At most two painters use workers per document, including previews. Workers fetch only bundled generic artwork and cannot save terrain.

The physical sampler caches bicubic coefficients and evaluates them without per-pixel arrays/closures. Complete fine interiors avoid reconstructing hidden parents; coverage edges still blend parents. Diffuse and normal filtering share footprints/weights. Reusable work buffers remove repeated allocation. Visible tile crops omit offscreen pixels while retaining the original sampling lattice, full device-pixel density and one-pixel halo. A pixel-by-pixel crop test includes wrapping. Focus-near jobs prepare first. No final image is an enlarged low-resolution placeholder.

Automatic material classification uses gradual physical slope, height and ruggedness exposure, nearby cliff support for loose material, and deterministic ground-scale variation. The conspicuous eastern boundary in the fixture follows saved heights dropping from 443 m through 221 m onto a flat 30 m shelf; [source measurements](../screenshots/worlds-atlas-s32f/diagnosis/material-source.json) distinguish it from a texture or render-tile seam. The shelf remains. Full-strength creator strokes retain their material and boundaries. Snow remains explicit. No numerical height, river, forest, climate or terrain feature is fabricated.

At broad scales, lighting emphasizes actual stored slopes and ground exposure. The three-continent fixture contains rounded high plateaus and simple authored ridges, so its World view remains correspondingly simple and often brown. This pass improves legibility; it does not turn that source into detailed mountain geography.

## Measured CPU performance

Same Windows x64 development computer: AMD Ryzen 5 5600G, 12 logical processors, approximately 32 GiB RAM; installed Chrome `134.0.6998.166`, headless, `--disable-gpu`, 1728 x 1000 viewport, DPR 1. These are software Canvas2D/browser results, not physical-device certification.

The controlled baseline is the published algorithm with optional sampled instrumentation. Baseline and corrected journeys use the same retained accepted revision 10 and material layer, source checksum `7aca10b239a10fd05f00ff81c39dcf1278d7df1ce86a913794f349575a02caf6`, 19.53125 m numerical spacing, camera, actual artwork readiness and locally decoded photographic materials. Each unprofiled journey starts in a fresh browser context. Close-up artwork tiles are cold; numerical data and the 16 MiB texture collection are loaded earlier in that journey. These are not cold HTTP-download measurements or hardware-independent guarantees.

| Finished view | Controlled baseline | Corrected worker | Reduction |
| --- | ---: | ---: | ---: |
| Initial World | 3.47 s | 2.50 s | 28% |
| Coast, 1.05 km visible | 18.58 s | 1.97 s | 89% |
| Mountainside, 316.66 m visible | 33.98 s | 4.72 s | 86% |

The earlier Pass 2 receipt reported 3.15/9.24/17.51 s. Those remain valid historical measurements of its workload; the matched controlled baseline above includes the later retained authored-material workload and is the basis for the percentages. Do not mix the two baselines. [Before profile](../screenshots/worlds-atlas-s32f/baseline/profile.json), [after profile](../screenshots/worlds-atlas-s32f/final/profile.json).

Finished artwork pixels cover approximately 0.618 m at the coast and 0.186 m at the extreme close-up. They do not claim numerical samples finer than 19.53125 m. At World scale the artwork pixel is approximately 25.13 km. All pending terrain/artwork counts are zero in measured frames; fine assets are ready and all twelve mip pyramids decoded.

Before optimization, sampled texture work accounted for about 42% of pixel time, field reconstruction 35%, and mip filtering 21% nested within texture work. Upload/cache costs were small. Nested sampled stages are inclusive, not additive. Retaining coefficients, sharing filtering and cropping reduce actual CPU work; background preparation removes it from input handling. The final sampled journey recorded 14.2-17.1 ms keyboard response while artwork was pending, a maximum 0.9 ms main-thread artwork batch, and a maximum worker tile around 247 ms. Worker work does not block main-thread navigation. Instrumentation is opt-in with `terrainProfile=1`.

The main-thread compatibility path is slower: 5.06 s coast and 13.46 s extreme. It renders identical whole-canvas pixels, keeps textures enabled and yields between bounded batches. This limitation is explicit rather than claiming worker performance on browsers without worker support.

Image cache limits remain 64 MiB/1,024 images per painter, numerical neighborhood cache 8,192 entries, and retained mip pixels 16,777,200 bytes per loader realm. The measured final image cache was about 31 MiB and the cloned source about 2.59 MiB. Worker heaps and temporary decode allocations are additional; main-page heap measurements do not establish whole-browser memory. No cache capacity was increased to obtain these results.

## Actual visual evidence and parity

| View | Published algorithm, same retained geography | Corrected application |
| --- | --- | --- |
| World | [before](../screenshots/worlds-atlas-s32f/baseline/world.png) | [after](../screenshots/worlds-atlas-s32f/final/world.png) |
| 20 km refinement region | [before](../screenshots/worlds-atlas-s32f/baseline/refinement-20km.png) | [after](../screenshots/worlds-atlas-s32f/final/refinement-20km.png) |
| Local island | [before](../screenshots/worlds-atlas-s32f/baseline/island.png) | [after](../screenshots/worlds-atlas-s32f/final/island.png) |
| Coast | [before](../screenshots/worlds-atlas-s32f/baseline/coastline.png) | [after](../screenshots/worlds-atlas-s32f/final/coastline.png) |
| Mountainside | [before](../screenshots/worlds-atlas-s32f/baseline/mountainside.png) | [after](../screenshots/worlds-atlas-s32f/final/mountainside.png) |

These are actual completed application captures, not mockups. Development, production and main-thread fallback generate **byte-identical complete canvas pixels at all five matched views**, with the same accepted geography and settings. [Whole-canvas parity receipt](../screenshots/worlds-atlas-s32f/development-production-parity.json). This establishes isolated runtime equivalence, **not owner-environment parity**. Profiling enabled/disabled images also match. The original Pass 2 evidence remains unchanged. Intermediate optimization phases are retained for diagnosis; `final`, `development-final`, `main-fallback`, `scale-matrix` and `full` contain final-code results.

The [same-location scale matrix](../screenshots/worlds-atlas-s32f/scale-matrix/profile.json) follows the saved island location through [World](../screenshots/worlds-atlas-s32f/scale-matrix/same-location-world.png), [continental](../screenshots/worlds-atlas-s32f/scale-matrix/same-location-continental.png), [regional](../screenshots/worlds-atlas-s32f/scale-matrix/same-location-regional.png), [local](../screenshots/worlds-atlas-s32f/scale-matrix/island.png), [coast](../screenshots/worlds-atlas-s32f/scale-matrix/coastline.png) and [mountainside](../screenshots/worlds-atlas-s32f/scale-matrix/mountainside.png). The approximately 1 km island is naturally almost invisible in the 476 km regional extent and is surrounded by saved ocean; the separate 20 km refinement view supplies the closer regional comparison. Coarse authored continental contours also remain visible at continental scale. The renderer does not invent intermediate geography to fill these gaps.

## Preservation, migration and checks

**NO NEW DATABASE MIGRATION IS REQUIRED FOR PASS 2F.** Existing `0140_world_terrain_materials.sql` remains the prerequisite for the Stage 3 Pass 2 material system. Its previously reported owner-applied DEV status is historical. The current Production ledger was not inspected and must not be inferred from that receipt. No historical migration, database schema, licensed asset, generator, numerical save service, material persistence service or previous artistic renderer changed. [Source preservation check](../screenshots/worlds-atlas-s32f/source-verification.json).

Final validation: root TypeScript passes; lint has zero errors and one retained unrelated `LoreFamily` warning; Drizzle offline migration checks pass; the Turbopack production build and complete unfiltered GPU-disabled browser/database suite pass. [Full receipt](../screenshots/worlds-atlas-s32f/full/results.json), [build/source binding](../screenshots/worlds-atlas-s32f/full/run-build.json). All 141 historical migrations replayed, the populated upgrade and backup restoration passed with 341 existing tables exact, and all 133 gameplay tables remain unchanged. The retained Pass 2 runner reports one migration under its historical `newMigrations` field (0140); **2F introduces zero migrations**. Unit suite: **2,395/2,395, 300 feature files**. Eight focused correction tests preserve published texture/field samples, nested/edge/wrapped sampling, scratch-buffer equivalence, flat/slope lighting, cliff interpretation, full-strength paint and cropped RGBA alignment. The unfiltered retained suite covers Passes 2-8, Stage 3 Passes 1-2, populated forward upgrade/backup restoration, immutable history, material save/reopen/conflicts/recovery, all materials, sculpt interaction, roles/privacy, desktop/tablet/phone and unrelated gameplay data.

The final full run also verifies twelve repeated close-up navigation cycles return to the exact image, with about 134 KiB additional main-page heap after collection; this excludes worker heaps. [Material workflows](../screenshots/worlds-atlas-s32f/full/surface-workflows.json), [adjacent/nested/wrapped imagery](../screenshots/worlds-atlas-s32f/full/realistic-adjacent-nested-wrapped.png), [phone/tablet input](../screenshots/worlds-atlas-s32f/full/surface-devices.json).

The [consolidated validation record](../screenshots/worlds-atlas-s32f/validation.json) includes source/build binding, root-check log hashes, matched timings and hashes for 189 actual application captures. Reproduction uses `scripts/worlds-surface-disposable.test.ts` with `SERRIAN_S32_EVIDENCE_DIR` set to a new evidence directory and no focused/visual-only flags. The profile harness uses the resulting guarded owned fixture; set `SERRIAN_S32F_PHASE` to a new name, `SERRIAN_S32F_REUSE_BUILD=1` and optionally `SERRIAN_S32F_SCALE_MATRIX=1`. Run it with `node --conditions=react-server --import tsx scripts/worlds-surface-profile-browser.ts`. Its source checksum, accepted data checksums and complete-image readiness are part of the result. It never loads `.env.local`.

## Owner comparison and deployment

Open the intended running release, **Worlds -> your World -> Atlas**, choose the same saved map and numerical editing source, expand the editor and select **World -> Map Appearance -> Realistic Terrain**. Check the elevation under the pointer, active numerical spacing, sea level, visible physical extent, Terrain Materials visibility/opacity/automatic interpretation, and artwork status. Changing appearance does not generate new mountains. Do not regenerate or replace an old map just to diagnose presentation.

Open **World -> Sea level & generation -> Rendering diagnostics -> Download rendering diagnostics**. The JSON includes renderer `stage3-2f-1`, development/production mode, map/refinement IDs and revision, current numerical-grid SHA-256/range, physical scale, appearance/material settings, asset status, worker/fallback backend and pending artwork. It excludes credentials, database configuration and raw elevation arrays and makes no map save. Compare this with the tested [production](../screenshots/worlds-atlas-s32f/final/downloaded-diagnostics.json) and [development](../screenshots/worlds-atlas-s32f/development-final/downloaded-diagnostics.json) files. Different data hashes/settings cannot be treated as a parity test. A flat saved field will remain flat.

Publishing Git does not update the home server. Deployment remains a separate owner-authorized operation: verify target and ledger read-only, back up database/private assets, apply any missing existing migrations in order, build this exact release with the complete bundled material directory, then verify the actual map in its browser. No new configuration or external asset host is required by 2F. Code rollback restores the previous renderer without altering accepted numerical/material data or reversing existing database migrations. No shared environment was migrated or restarted here.
