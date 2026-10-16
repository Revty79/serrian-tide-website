# UX-0A resource and compatibility review

This checkpoint uses a separate technical benchmark, not a completed artwork composition or an empty-World beginner acceptance journey. The six-case core performance matrix passes for the retained three-subject library. Final full-library resources and readiness remain gated. The independent artwork gate is still pending for `f71c170`.

## Delivered corrections

The geographic workspace reauthorizes its current reader, World/timeline/map/surface and all eligible source heads with a metadata-only check every 30 seconds. Unchanged authorized geometry stays loaded. Changed source heads, access, reader or surface invalidate the view and rebuild it through the existing authorized reader. Empty display extents use the same eligibility stamp as the full source domain. Paginated readers cannot cross reader identities.

Retained v1 charts with their own editable land outlines keep their original artwork clip when geography is attached. A geographic reference without land cannot erase the chart's existing illustrated terrain. New island-style maps still use their authorized geographic source masks. No coordinates or editable coastline copies are rewritten.

Temporary terrain display images now support the exact pinned illustrations and projected frames. They retain full stroke/asset sources, use bounded image sizes, preserve vectors for selected drawings and deep zoom, rebuild only after gestures, and release replaced images. Cache keys include drawing, exact frame, style/version and appearance state. PNG export uses a separate full-vector scene. A cursor render boundary, an isolated unfinished-stroke preview and immutable per-frame projection derivatives keep pointer feedback independent of the full inspector. The preview uses the actual terrain-layer clip and commits once on completion; Escape cancels it after the canvas receives focus. Hidden derived SVG instances are removed while a valid bitmap is used; the complete editable model stays retained. Exact SVG definition subtrees remain mounted across unchanged revisions.

Short visual viewports use a compact workspace so landscape and keyboard-reduced windows retain a canvas. The map library remains reachable; tool settings scroll and expand separately. Normal pages retain their existing navigation outside this workspace.

Authored-only PNG and dated views explicitly retain the complete original artwork without borrowing current geographic sources or their mask. Live composed views still require their authorized source mask. Export guidance explains the distinction. Wide v1 lake/snow paint keeps its full projected stroke margin in temporary images.

## Reproducible target and checks

`scripts/worlds-geo-ux0a-performance-setup.ts` creates a new owned disposable database and a service-authored technical World/map. It has a main island with an opening, two offshore sources, a separate island inside the opening, 100 drawings and 1,500 derived terrain marks, including river/city/label. It uses the retained three-subject revision-1 library. Saved source identities/strokes remain complete; the intentionally crowded benchmark is not an artwork-quality sample.

`scripts/worlds-geo-ux0a-performance-browser.ts` runs production Chrome at 1440x900 and 1024x768 desktop, 390x844 and 360x800 native-touch emulation, tablet and landscape. Touch cases use the recorded CDP sixfold renderer CPU throttle. Input/feedback measurements include native event timestamps and coalesced feedback frames; the 100-update pan is scheduled over five seconds. Operation timing distinguishes completed Apply/submitted requests from test-driver scrolling. Local checkpoint timing records a successful native storage write. It records JS heap separately from task-owned browser process working sets and sampled server working set/CPU. Physical-phone and hosted-network performance are not claimed.

`scripts/worlds-geo-ux0a-view-compatibility.ts` passes the actual v1 reference/reload/PNG check, automatic ordinary-view removal after source protection, current metadata privacy, exact original coordinate/version preservation, foreign denial and explicit read-only Admin review. Its new compatibility fixtures establish no permanent fictional canon. Cody inspected the retained-v1 PNG; its forest is visible again. Existing immutable histories and prior compatibility receipts remain retained.

The read-only resource receipt records map/source/drawing/history bytes, exact drawing identities, original geometry digests, pinned-asset hashes and gzip sizes. The three-subject catalog remains far below the 5-MiB bound; final 12-16-asset transfer and unused-material loading remain required after art approval and expansion. Tiny current-library measurements cannot substitute for that gate.

## Measured representative scene

Chrome 134.0.6998.166; Node 22.23.3; AMD Ryzen 5 5600G, 12 logical CPUs, 32 GiB RAM, Windows. Fresh browser contexts, warm gestures after loading; local loopback production application. The touch cases use sixfold renderer CPU throttling. All cases include five real edit/undo/library-reopen cycles.

| Viewport/input | FPS, 5 seconds | Brush p95 ms | PNG ms | Save ms | Preview/cancel ms | Checkpoint ms | JS heap growth MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440x900 mouse, 1x | 53.8 | 35.4 | 1407 | 357 | 923/77 | 77.4 | 4.58 |
| 1024x768 mouse, 1x | 55.2 | 35.4 | 1432 | 328 | 821/224 | 77.1 | 4.93 |
| 390x844 touch, 6x | 55.2 | 146.3 | 7710 | 2439 | 771/332 | 280.7 | 4.72 |
| 360x800 touch, 6x | 55.0 | 124.0 | 6808 | 1868 | 837/357 | 298.8 | 4.71 |
| 844x390 touch, 6x | 54.2 | 136.4 | 6938 | 2250 | 2891/369 | 293.5 | 4.78 |
| 1024x768 touch, 6x | 54.6 | 131.5 | 6820 | 2071 | 3320/350 | 302.6 | 4.24 |

All six cases satisfy their unchanged budgets. Each brush case records 100 native updates, including native event delay and coalesced rendered feedback; none remain unmatched. Current catalog-containing JS plus requested SVG thumbnails is conservatively estimated at 669-672 KiB gzip, with zero external page requests. That figure includes shared code, not only artwork. The pinned three SVG originals total 2,437 bytes gzip and their generated catalog module 2,926 bytes gzip. The final larger library still requires its own transfer/lazy-loading verification.

Server working set was sampled at 120.7 MiB before and 193.2 MiB after the matrix, with 13.08 accumulated CPU seconds between samples. These are samples, not peaks. Per-process browser working sets are recorded separately from JS heap. Source/map/recovery/history sizes and immutable identities are indexed in the evidence receipt.

The core matrix runtime fingerprint is `ed511ac435df291c93b0edbf810d33f48a3b920eb737eefb8aaedd958d514b1d`. Subsequent retained-v1 stroke-margin and authored-only corrections have separate final-runtime browser evidence; they do not establish final full-library release readiness.

The 65-second idle check replaces two 2,257-byte geometry replies with two 463-byte metadata replies while retaining the actual scene and land-path nodes. Current authorization continues every 30 seconds. Normal save services also pass all existing maximums (512 drawings, 6,000 marks, 16,384 points) and reject each overflow atomically in a separate new technical World.

## Validation and evidence

All 2,240 feature tests pass. TypeScript, full lint (zero errors; the existing `LoreFamily` warning in the stories harness), diff check and the isolated Node 22 production build pass. The final runtime fingerprint is `7f8a66aefc2285ff1fef646a7c0ab0f238ea7a4adcd381eb56fe2c1786c8c6f9`. Its actual authored PNG, dated fallback, viewport/keyboard-space assertions and current-authorization/v1 compatibility proof pass. The original source/generation/device-recovery browser regression also passes on this final runtime, including interruption, partial save, exact original retry, conflicts, quota failure and native-touch bundle review.

The [evidence index](../screenshots/worlds-geo-ux0a/performance/README.md) links the full measurements, images, storage identities and source hashes. Cody personally inspected all six viewport images, cache/vector comparisons, authored/datestamped views and the retained-v1 PNG. Reduced viewports model keyboard space; this is not an actual operating-system keyboard or physical-device claim. The representative map has zero historical map-state payloads; its current geography revisions and original coordinate digests are measured separately. Populated immutable-history coverage remains in the earlier compatibility/foundation receipts.

## Remaining gates and release boundary

The final matrix with the complete art library, unused-material loading verification, separate art-approved zero-start journeys and joint exact-SHA readiness are still required. The current cache/vector comparison passes: mean RGB channel difference 0.79/255, with 0.243% of pixels differing by more than 24 in any channel. Wide v1 lake/snow paint also passes its separate comparison. These tolerate bounded antialiasing differences and do not establish final artistic acceptance. Passing code checks do not establish owner usability or artwork acceptance.

No extra migration or runtime configuration is introduced. Ordered migration/recovery remains the [0132 foundation plan](worlds-atlas-ux0a-foundation.md); published validator migrations are unchanged. Reverting presentation/performance code does not undo database changes or saved v2 content. Display-cache failure falls back to retained vectors; original data is not replaced. Only the owned disposable loopback database/application/assets are used. No main merge, deployment, shared write/restart, Docker, retained-backup/private-asset replacement, deleted-Earth restoration or later Geo scope is included.
