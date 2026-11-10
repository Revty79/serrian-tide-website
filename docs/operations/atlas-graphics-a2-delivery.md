# Atlas Stage A2: CPU graphics and numerical-detail assessment

**Local technical recommendation: PASS for the bounded A2 implementation, with the explicit stress and visual limits below.** Main publication and exact CI are recorded in the publication receipt. Owner artistic/usability acceptance and physical-device/printer acceptance remain deferred. No later milestone is started.

Starting reviewed main: `37291c8a78c7f084018b9a45984e8f1bccf989cc`. Owner brief: `4b46f78e-7c19-45e2-80a1-a2643c27e847`, plus the numerical-resolution supplement. Ending implementation commit: **pending the publication receipt**. All work remains on the normal local main checkout.

Final production input SHA-256: `dccac8ff4331a23a109593d7a485a8843336ce5dc761dde4e0ae32687b4d9bdd`; build `08XT3YBerqP1WKc59wf0E`; 2,140 exact inputs. The frozen A1 control has SHA-256 `04ec7e8ff1a3cb7a64a7d2d9da6f9c8f7f073d7ecdf97ddfb252428047a6ad91`, build `Tyid5D9VC_nB1ZwfwmAPw`. Runtime copies contain no Git repository or owner environment. The complete earlier tested build 2 remains separately frozen; its receipts are earlier-candidate evidence.

## Scope and initial audit

Validation uses original mathematical terrain in newly owned PostgreSQL/storage fixtures and GPU-disabled installed Chrome 134 on Windows, Ryzen 5 5600G, 12 logical CPUs and about 32 GiB RAM. Tests ran serially without concurrent agent builds/tests during benchmarks. This does not establish a quiesced operating system or physical low-end-device performance.

The owner DEV database, its recovery points/private storage, owner accounts, Ubuntu/Production/port-3003 deployment and Render resources were not accessed or modified. No Earth, external geography/assets, Canon promotion, licensing implementation, deployment or Tabletop work is included.

Before implementation, the frozen A1 application was verified against all 2,137 original inputs and matched synthetic baseline images were captured. The audit found:

- Native roots accept 32–1024 samples per axis, multiples of 32; the World default remains 640×384. Refinements use the original allowed sizes through 1024, depth/containment/protection rules and immutable histories. The fixture has a 256×128 root over 6,400×3,200 km, a saved 512 regional source and a saved 1024 local source over 64 km: **62.5 m per local sample**.
- Accepted numerical LOD selection was independent of richer device density. Plans retain the original 1,024-tile request budget, two concurrent batches and 2,048-tile validated cache.
- Scalar preparation spent its 8 MiB raster allowance on hidden parents as well as the visible finer source. Measured Balanced/DPR1 effective density was 0.702 in the local view and 0.476 at close scale. Bicubic Realistic reconstruction, scalar interpolation, band-limited materials and progressively loaded native data already existed; inventing another engine or more heights was unwarranted.
- Changed artwork footprints/LOD did not retain the previous Realistic picture. Repeated long pinned-cache keys in numerical sampling and repeated environment dependency/job planning also consumed CPU. These were reproduced before correction.

## Implemented correction

Presentation work is pruned only when a complete pinned finer source covers the view safely inside its reconstruction collar, including wrapped copies. Scalar edges feather only temporary pixels over the inherited collar. Accepted heights, coast facts, frame coordinates and authoring/protection algorithms are unchanged.

Scalar and cartographic painters borrow validated tile arrays through integer indexes, cull offscreen work and retain compatible source/revision pictures during visual LOD replacement. Working-array replacement and root/revision/style/sea changes invalidate incompatible pictures. Realistic fallback is clipped to unfinished current footprints; completed current tiles are excluded from that fallback pass, and late replies still require the exact current job key. Existing numerical reconstruction formulas and frozen field/pixel goldens remain authoritative.

The existing surface sampler now pins borrowed immutable tile arrays once per synchronization, including cached halos and the worker's peek-only contract. Its regression reproduces 80 pinned lookups where four suffice, checks exact reconstructed fields, and distinguishes missing, arriving and revised snapshots. The environment painter retains its job plan across unchanged frames: the regression removes 32,800 redundant lookups over 100 frames while still observing source ticks, edits, navigation and sea changes. No second terrain store or engine is introduced.

Fast/Balanced keep the original **8 MiB** scalar raster cap. Detailed/Maximum opt into **16/24 MiB**, appropriate existing accepted LOD and bounded sharper imagery. Other original surface/cartographic/environment/engraved budgets remain unchanged. The four existing choices gain plain-language help and a transient loading/drawing/failure message. Imagery density is explicitly separate from editable sample precision.

## Matched visual evidence

Private evidence is under ignored `artifacts/atlas-graphics-a2/`; no geography, screenshots, exports or backups are published to Git.

| Coverage | Final captures | Exact successful before/after pairs |
| --- | ---: | ---: |
| Six appearances × World/regional/local/close × DPR1/2 | 48 | 48 |
| Classic/Realistic/Illustrated × wrap/north pole/linked region/maximum zoom × DPR1/2 | 24 | 24 |
| Separate Balanced performance views | 4 | 4 |
| Maximum World and lake-shore views, Classic/Realistic, DPR2 | 4 | 4 |
| Fine Realistic worker/main-thread output parity | 1 | 1, zero interior pixel difference |

The primary pairs combine 42 successful frames from the retained incomplete `baseline-6` with six successful isolated tails. The failed baseline aggregate is not relabeled passing. Comparisons require identical actual camera transforms, CSS/backing sizes, map/source identity, requested location/scale, quality and the **complete appearance specification**. Every final pair is exact, with no near-camera substitution. Interior pixel comparisons exclude UI furniture. Complete root/regional/local grids and water/environment are independently reread, with zero content POSTs or page errors in the final capture matrices.

All six `review-final-<style>-dpr1.png` contact sheets and original-resolution captures were visually inspected. Native coasts, islands, periodic ridges, river, lake, contour/ink styles and linked frames remain consistent. The World Maximum Classic comparison increases effective scalar density 1.169→2, changes about 10.8% of interior channels and reaches a 108/255 channel difference in affected pixels. Local Balanced Classic density increases 0.702→1 within the same default cap. Changes in broad smooth close gradients are much smaller: the close Maximum Classic comparison averages only 0.018/255 and peaks at 2/255. Those frames do not justify a blanket dramatic-sharpness claim.

Much settled Balanced imagery, particularly Realistic, remains close or pixel-identical to A1. The substantive gains are bounded visible density where useful, retained imagery during transitions and preparation efficiency. The synthetic periodic hills are deliberately artificial. Existing steep-relief saturation, visible authored regional profile changes and flat close palettes remain; no fake height noise hides them. Maximum zoom in the approximately 1,423-pixel viewport spans about **14.23 m**, below the local 62.5-m sample spacing. It reconstructs existing values and cannot reveal unrecorded geographic detail.

## Separate matched CPU measurements

`performance-baseline-1` and `performance-candidate-2` use the same saved fixture, exact camera/specification, Balanced/DPR1 and GPU-disabled Chrome, without concurrent agent test/build work. These are single serial observations, not percentiles. Readiness is the complete Fit/pan/zoom/settle journey, excluding initial page/server navigation. CDP main-task time excludes worker CPU. Heap is a post-capture JavaScript snapshot, not peak browser RSS.

| Appearance / scene | A1 journey (s) | A2 journey (s) | A1 / A2 main-task (s) | A2 settled key input (ms) | A1 / A2 JS heap (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| classic-elevation / world | 3.67 | 2.33 | 2.94 / 1.65 | 33.80 | 38.96 / 37.75 |
| classic-elevation / local-water-relief | 17.00 | 9.48 | 15.90 / 7.59 | 47.02 | 38.56 / 49.43 |
| realistic-terrain / world | 1.69 | 1.39 | 0.91 / 0.63 | 28.05 | 84.36 / 75.94 |
| realistic-terrain / local-water-relief | 11.17 | 6.52 | 7.48 / 4.04 | 55.97 | 109.91 / 45.41 |

The separate warm Topographic/DPR2 four-view sequence also passes the original 180-second helper limit. Earlier candidate performance had a Realistic local CPU increase; it is retained and superseded by the final sampler/planning/composition corrections, not omitted.

### Device-quality costs

These are ordered quality-navigation observations, with ordinary cache/JIT effects; they are not independent cold-quality benchmarks or a speed ranking. Maximum before/after comparisons above establish matched imagery, not a cold-time speed claim across different quality sequences.

| World, DPR2 | Artwork ratio | Scalar cap (MiB) | Classic journey (s) | Realistic journey (s) | Actual Classic cache (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| fast | 0.75 | 8.00 | 4.62 | 3.41 | 4.34 |
| balanced | 1 | 8.00 | 10.83 | 7.67 | 6.81 |
| detailed | 1.5 | 16.00 | 32.55 | 11.71 | 13.66 |
| maximum | 2 | 24.00 | 23.47 | 7.03 | 23.97 |

| Lake-shore quality | Classic DPR1 / DPR2 (s) | Realistic DPR1 / DPR2 (s) | Effective Classic DPR1 / DPR2 |
| --- | ---: | ---: | ---: |
| fast | 3.74 / 20.62 | 4.57 / 9.23 | 0.75 / 0.75 |
| balanced | 7.55 / 44.27 | 7.38 / 26.09 | 0.80 / 0.80 |
| detailed | 8.73 / 69.28 | 10.22 / 36.42 | 1.25 / 1.20 |
| maximum | 17.35 / 67.02 | 13.54 / 42.17 | 1.50 / 1.53 |

All 24 quality cases preserve exact saved geography. Higher settings can require tens of seconds; the maximum close Classic case reaches about 67 seconds and nearly the optional 24 MiB cap. Balanced remains the default. The normal numerical cache and all other painter limits retain their original bounds.

### Workers, input and lower-resource limit

| Final fallback case | Journey (s) | Settled key input (ms) | Backend | Surface assets |
| --- | ---: | ---: | --- | --- |
| final-fallback-disabled-1 / world | 2.62 | 89.16 | main-thread | unloaded |
| final-fallback-disabled-1 / local-water-relief | 23.07 | 80.10 | main-thread | unloaded |
| final-fallback-failed-1 / world | 2.74 | 90.63 | main-thread | unloaded |
| final-fallback-failed-1 / local-water-relief | 22.75 | 82.05 | main-thread | unloaded |
| final-fallback-close-1 / lake-shore-close | 35.21 | 125.53 | main-thread | ready |

Both actual worker unavailability and a constructor failure select the native main-thread path. Fine bundled artwork loads successfully there; its matched lake-shore pixels are exactly equal to the worker output. No page errors or saved terrain changes occur.

The final **4× page-CPU throttle with normal workers** passes World/local journeys at 10.67/35.86 seconds and settled input at 218/301 ms. Worker CPUs are unthrottled: this is not a physical weak-computer pass. Combining **4× throttle and disabled workers** still times out at 180 seconds for the detailed local view, both Balanced and Fast. Frozen A1 and earlier candidates also fail that condition. Every failure remains retained; no timeout or tested quality was reduced. Fast is not presented as a cure. Very slow or worker-restricted browsers are not certified for this heavy Realistic view.

Four pointer-event/next-frame probes genuinely overlap 50+ pending surface jobs. A1 latencies are 62–129 ms; final A2 is 93–111 ms. This small sample does not prove a universal input-latency improvement. Final A2 retains 2–7 visible compatible pictures during those probes (observed maximum 10) while current tiles finish; separate busy images preserve the visible result. Original climate-input gates remain independently unchanged.

## All 36 original CPU limits

Final complete receipt: `artifacts/collaboration-s7b-graphics-a2-cpu-3/results.json`, exact final production input hash. Four original groups, nine limits each, original baseline `88cfa27c682b5b339e7f672d8c98b1f0289b2191`. All original metric producers, helpers and threshold rules remain byte-exact. The artwork control is an actual same-session baseline with identical artwork/geography and no archival fallback. Values below are rounded only for display; assertions use full precision.

| Group | Original metric | Before (ms) | A2 (ms) | Unchanged limit (ms) | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Artwork | coldApplicationReadyMs | 2941.79 | 3339.76 | 3677.24 | Pass |
| Artwork | warmNavigationTenKeysMs | 186.18 | 232.22 | 500.00 | Pass |
| Artwork | regionalReadyMs | 1213.28 | 1280.07 | 1516.61 | Pass |
| Artwork | closeReadyMs | 3313.42 | 3288.54 | 4141.77 | Pass |
| Artwork | repeatedPanZoomMs | 4538.80 | 4646.68 | 5673.49 | Pass |
| Artwork | fallbackNavigationReadyMs | 4119.15 | 4525.15 | 5148.94 | Pass |
| Artwork | farZoomReadyMs | 290.50 | 281.06 | 1000.00 | Pass |
| Artwork | inputDuringClimateMs | 16.58 | 21.91 | 100.00 | Pass |
| Artwork | climatePreviewMs | 979.44 | 989.42 | 1224.30 | Pass |
| Labels | coldApplicationReadyMs | 2835.26 | 2780.37 | 3544.08 | Pass |
| Labels | warmNavigationTenKeysMs | 204.62 | 248.42 | 500.00 | Pass |
| Labels | regionalReadyMs | 1229.98 | 1163.04 | 1537.47 | Pass |
| Labels | closeReadyMs | 3258.85 | 3263.30 | 4073.57 | Pass |
| Labels | repeatedPanZoomMs | 4655.14 | 4884.64 | 5818.92 | Pass |
| Labels | fallbackNavigationReadyMs | 4452.47 | 4692.68 | 5565.58 | Pass |
| Labels | farZoomReadyMs | 271.91 | 276.28 | 1000.00 | Pass |
| Labels | inputDuringClimateMs | 18.35 | 22.33 | 100.00 | Pass |
| Labels | climatePreviewMs | 1017.32 | 1039.13 | 1271.66 | Pass |
| Engraved | coldApplicationReadyMs | 2625.70 | 2862.31 | 3500.00 | Pass |
| Engraved | warmNavigationTenKeysMs | 114.34 | 126.83 | 500.00 | Pass |
| Engraved | regionalReadyMs | 2596.97 | 2480.65 | 3246.22 | Pass |
| Engraved | closeReadyMs | 1964.77 | 2114.92 | 2455.96 | Pass |
| Engraved | repeatedPanZoomMs | 3542.56 | 3494.54 | 4428.20 | Pass |
| Engraved | fallbackNavigationReadyMs | 2596.93 | 2960.30 | 3246.16 | Pass |
| Engraved | farZoomReadyMs | 332.78 | 366.77 | 1000.00 | Pass |
| Engraved | inputDuringClimateMs | 26.59 | 20.29 | 100.00 | Pass |
| Engraved | climatePreviewMs | 1024.85 | 993.91 | 1281.07 | Pass |
| Regional | coldApplicationReadyMs | 2723.63 | 2776.20 | 3500.00 | Pass |
| Regional | warmNavigationTenKeysMs | 112.84 | 118.30 | 500.00 | Pass |
| Regional | regionalReadyMs | 2498.26 | 2364.00 | 3122.83 | Pass |
| Regional | closeReadyMs | 2062.38 | 2054.24 | 2577.97 | Pass |
| Regional | repeatedPanZoomMs | 3469.76 | 3423.86 | 4337.19 | Pass |
| Regional | fallbackNavigationReadyMs | 2539.92 | 2792.65 | 3174.89 | Pass |
| Regional | farZoomReadyMs | 308.54 | 354.49 | 1000.00 | Pass |
| Regional | inputDuringClimateMs | 20.80 | 21.08 | 100.00 | Pass |
| Regional | climatePreviewMs | 951.74 | 992.61 | 1189.68 | Pass |


Retained final-source timing failures are material evidence. The preceding complete attempt `graphics-a2-cpu-2` passed 35/36 but failed regional fallback, **3692.10 > 3313.84 ms** (control 2651.07). A regional-only cold-server investigation passed fallback, **2943.79 <= 3274.37**, but failed cold navigation, **5154.49 > 4578.50**. Neither aggregate is passing or declared invalid. No speculative rendering or test change was made to conceal those observations. The subsequent complete original four-suite protocol passes 36/36; its regional fallback is **2792.65 <= 3174.89** (control 2539.92). Single-run timing variability and the absence of a physical-device acceptance claim remain explicit.

## Functional, numerical and source verification

- Production build and root TypeScript pass. Full ESLint has zero errors and one inherited unused `LoreFamily` warning. All **2,934 feature tests across 379 files** pass, including 13 added renderer/presentation regressions and the unchanged numerical/field/pixel/export/source goldens.
- Final-source native A1 browser passes all ten groups: exact fine/coarse positions, zoom/pan/wrap/poles, stamps and undo/redo, deliberate continuous preview/accept/cancel, form focus, actual mouse/keyboard equivalence, save/reload, interrupted original-request recovery, polygon vertices, inherited protection and 62.5-m selected-source movement, dated history, read-only administrator behavior, narrow layouts and stale-fence refusal. Native touch emulation separately passes cancellation/navigation/pinch and accepted-data equality.
- Independent visible Playwright review uses a fresh isolated context and the normal synthetic-admin login form. All four quality choices, Maximum help/status and Balanced after reload are observed. Read-only map revision 14 remains unchanged. The review tab is closed; owner DEV cookies remain separate. This is not owner or physical-device acceptance.
- The original regional database/paired-restore regression passes: shared identity and outside protection, native geometry/layers, exact retries, roles/stale/forged context, source/version preservation, wrapping and unequal fractional coordinates, no-op receipts and fresh restored service reads.
- Actual supported-resolution assessment passes: **400 public tables**, migration ledger and **3,565 terrain files** match in a newly named database/new terrain root after a real dump/restore. Fresh native readers reconstruct root/regional/1024 local data and **1,706 pinned tiles across every saved refinement overview**, exactly. Source rows/files remain exact. Ten probes against copies of the actual PostgreSQL CHECK constraints reject unsupported 2048/4096 dimensions, oversized tile coordinates and LOD6/7 with 23514. No larger native record is created.
- Normal World and linked-Region controls generate four real PNG/PDF downloads with PDF preview. Independent pypdf/Pillow inspection and Poppler rendering verify source/map/revision pins, dimensions, physical page/scale math and every page. Both rendered pages show map, scale, creator, accepted revision 2 and extent. Raster-page PDF credits are visually checked, not falsely certified by text extraction. There is no physical-printer acceptance claim.
- Final Windows environment/raster integrity has **18 cases: 17 pass, one expected POSIX-permission skip**, zero failures. Exact GitHub Linux results belong to the publication receipt.

Named final evidence: `units-build5.log`, `types-final-{5,6}.log`, `lint-final-5.log`, supplemental `lint-final-compare-6.log`, `integrity-final-5.log`, `final-primary-1`, `final-extras-1`, `final-warm-1`, `performance-candidate-2`, `final-quality-{world,close}-1`, `final-fallback-*`, `ui-exports-1`, `supported-persistence-1`, `regions-s43-graphics-a2-{keyboard,touch,db}-2`. Final comparison metadata is in the separately retained `*-v2.json` files. Private contacts, complete individual images, pixel comparisons, output hashes, restore receipts and visible-review records remain available locally.

## Numerical-resolution supplement

The [dedicated numerical assessment](atlas-graphics-a2-numerical-resolution.md) contains the complete root/refinement/DDL/tile/LOD/API/history/protection/worker/cache/backup/export/Stage7C/future-Tabletop dependency chain, exact logical sizes, six separate World/local 1024²/2048²/4096² measurements and actual diagnostic feature/brush/worker recovery results.

**Shipped native maximum remains 1024 per axis.** No saved map is resampled, upgraded or converted. Whole World stays at its existing 640×384 default; regional and context-sensitive local defaults remain unchanged. Optional 2048 local refinement is a measured future candidate, and 4096 remains experimental. Database constraints, request/recovery admission and consumption contracts require a separately authorized coordinated change. Bigger diagnostic arrays/codec archives are not larger native Atlas saves or migrated environments.

## Preservation and exact changed-file inventory

The guarded final proof accounts for exactly **32** files below. All **2,124** other original application/data/asset/build inputs match the frozen A1 raw bytes; all **2,140** current build inputs match the final runtime and fingerprint. All **322** prior SQL/snapshot files, **161** migration history entries, **114** public assets, schema, authentication, library sources and unlisted tracked content remain exact. Numerical authoring/storage algorithms are preserved; declared presentation lookups/composition are the changes described above. No private owner data is read to manufacture a preservation claim.

Final owned-service audit checks 96 metadata receipts across 64 task output directories, 11 owned data directories and 103 recorded task ports: no task listener or PostgreSQL PID marker remains. Owner ports 3000/3003/5432/5433 are excluded. The audit makes no database query, stops no process and deletes no file. The isolated visible-review tab is closed.

| File | Reviewed A2 purpose |
| --- | --- |
| `.gitignore` | Ignore the complete private A2 evidence/runtime root. |
| `AGENTS.md` | Record the owner boundary and final delivery receipt. |
| `docs/operations/atlas-graphics-a2-delivery.md` | Delivery, exact evidence, failures, limits and review boundary. |
| `docs/operations/atlas-graphics-a2-numerical-resolution.md` | Full resolution audit, six measurements and separate expansion proposal. |
| `package.json` | Add the owned graphics-validation entry point. |
| `scripts/worlds-collaboration-cpu.test.ts` | Admit only the exact owned A2 runtime; original metric producers and gates stay unchanged. |
| `scripts/worlds-graphics-a2-browser.ts` | GPU-disabled Chrome captures, data checks, device/worker/CPU diagnostics. |
| `scripts/worlds-graphics-a2-build.ts` | Exact owned production snapshot, optional local font cache, no owner environment. |
| `scripts/worlds-graphics-a2-compare.ts` | Strict complete appearance/camera/source-frame comparisons and interior pixel differences. |
| `scripts/worlds-graphics-a2-disposable.test.ts` | Fresh owned synthetic graphics-validation entry point. |
| `scripts/worlds-graphics-a2-export.ts` | Normal World/Region PNG/PDF preview and download controls. |
| `scripts/worlds-graphics-a2-fixture.ts` | Original mathematical geography and linked native test records. |
| `scripts/worlds-graphics-a2-native-worker.mjs` | Node transport for the unchanged native inheritance worker. |
| `scripts/worlds-graphics-a2-persistence.ts` | Real supported 1024 dump/new restore and original-constraint rejection checks. |
| `scripts/worlds-graphics-a2-resolution-recovery.ts` | Nonzero smoothing, protection, native worker interruption/restart diagnostics. |
| `scripts/worlds-graphics-a2-resolution.ts` | Separate World/local 1024/2048/4096 feasibility processes. |
| `scripts/worlds-graphics-a2-resume.test.ts` | Positively identified, stopped, owned A2 fixture resumption only. |
| `src/features/worlds/terrain-canvas.tsx` | Integrate bounded quality, pending-work status and existing painter metrics. |
| `src/features/worlds/terrain-cartography-painter.ts` | Prune covered work, index pinned tiles and retain compatible pictures. |
| `src/features/worlds/terrain-detail-presentation.test.ts` | Eight focused native-plan, collar, cache and quality regressions. |
| `src/features/worlds/terrain-detail-presentation.ts` | Shared presentation plan/coverage/identity and read-only tile indexing. |
| `src/features/worlds/terrain-detail-renderer.ts` | Scalar coverage/collars, bounded density, working-source invalidation and retention. |
| `src/features/worlds/terrain-editor.tsx` | Supply existing device density to the accepted-refinement loader. |
| `src/features/worlds/terrain-environment-painter.ts` | Reuse unchanged frame plans; invalidate for changed inputs and edits. |
| `src/features/worlds/terrain-quality-controls.tsx` | Explain the four device choices and resolve display density. |
| `src/features/worlds/terrain-refinement-client.ts` | Optional accepted-LOD density with the original request/cache bounds. |
| `src/features/worlds/terrain-render-quality.ts` | Keep default scalar bounds and cap opt-in richer raster payloads. |
| `src/features/worlds/terrain-surface-corrections.test.ts` | Two pinned-snapshot/halo/arrival regressions; original goldens retained. |
| `src/features/worlds/terrain-surface-field.ts` | Borrow pinned immutable tiles once per sampler; reconstruction math retained. |
| `src/features/worlds/terrain-surface-painter.ts` | Compatible progressive pictures, exact-job guards and bounded fallback composition. |
| `src/features/worlds/terrain-surface-progressive.test.ts` | Progressive/current/late-reply and unchanged-environment-frame regressions. |
| `src/features/worlds/terrain.module.css` | Only the transient, non-interactive rendering-status treatment. |

## Retained failures and review limits

The private receipts retain the incomplete baseline warm Topographic/DPR2 and fresh Illustrated/DPR2 timeouts; later isolated tails complete exact visual coverage without changing the failed aggregates. The first standalone engraved tail has different contour/bathymetry flags and is strictly rejected; a normal visible style-priming replay matches. Early camera-helper wheel normalization and a fixture exponent syntax error are corrected without changing original assertions. The first worker-failure injection contains a TS-loader `__name` error and is invalid; raw startup-failure injection with an explicit backend assertion passes. A native-worker transport shim initially supplied an incomplete `self`; the corrected global transport passes without changing the native worker.

The npm/PowerShell stderr wrapper and a manual unit command without the project's CSS hook retain failed exits; the official final runner passes. A new comparison-helper implicit-array type is corrected. Its unmatched-subset count initially omitted map/quality dimensions; corrected `v2` metadata reruns all nine comparisons, preserving their strict matching and pixel assertions (the one worker-parity pair leaves 15 of 16 input quality records unmatched). Original receipts remain retained. Intentionally failing sampler/planning/composition regressions demonstrate the corrected costs. The first independent export inspector lacks PyMuPDF; the successful inspection uses already installed pypdf/Pillow plus Poppler, preserving all source/scale checks. No dependency is added for that correction. The original CPU failures and every 4×/worker-disabled failure remain explicit above.

Technical PASS applies to the implemented, tested A2 correction and its unchanged native contracts. It does not certify every slow computer, eliminate the documented 180-second stress failure, invent missing geography, approve the synthetic art, authorize 2048/4096 persistence or grant owner acceptance. Stop for Ember/owner review; no licensing/deployment, Earth rebuilding, Tabletop or subsequent milestone follows from this receipt.

## Publication receipt

Local implementation, source/evidence review and required checks are complete. Ending implementation commit, exact CI runs and final clean local/origin/official-main parity are filled after authorized publication with `[skip render]`. No deployment is authorized.
