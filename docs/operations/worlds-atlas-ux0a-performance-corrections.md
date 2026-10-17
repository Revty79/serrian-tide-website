# UX-0A SVG selection runtime and performance corrections

Continuation of draft [PR #7](https://github.com/Revty79/serrian-tide-website/pull/7) from `8a3b1a12315b1e78c82b0f800367dd006cc29684`, responding to Ember’s [performance review](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6226789220) and [owner-runtime crash report](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6227385447). PR #6 remains discussion only. This report does not authorize merge, deployment, or a later Map Studio phase.

## Changes and diagnosis

- SVG geometry fill, stroke, tolerance-offset, and retained coastline tests now obtain an actual `SVGPoint` from the owning SVG, then assign geometry-local coordinates. The inverse screen transform, drawing scale/rotation, projected geometry, and clip semantics remain intact. No type assertion substitutes for browser compatibility.
- A missing or throwing SVG hit API produces an accessible “Use Items to select safely” status and stops that canvas operation without selecting the land below, creating history, or writing content. The existing visible Items button opens the named list deliberately. Opening that list during the original touch gesture was tested and rejected because the browser could retarget its subsequent click to a newly positioned item.
- Retained v1 painted marks are hit-tested against their original symbol geometry at deterministic projected positions, including when the display uses a terrain bitmap. Selection returns the owning stroke group.
- Default full-fit spherical bounds are memoized, and unchanged authorized layer/reference objects retain their identity on refresh. This avoids needless projection/cache invalidation while keeping geographic access/status requests and clearing the layer on denied access. The benchmark’s planar reference already retains its full-fit bounds; its UI-toggle cache-retention check passes before and after this correction.
- Transient geographic pan/pinch feedback updates one SVG group per animation frame. It no longer rerenders the entire editor for each pointer update. Gesture matrices are read at gesture start and refreshed on actual layout/scroll changes. Cancel, source/draft coordinates, history, and final extent commits retain their existing boundaries.
- Terrain drawings share one identical layer land mask/clip instead of each compositing a separate full-map mask. Individual editable drawing groups, draw order, holes/overlap union, original vectors, and land clipping remain. The unfinished paint preview keeps a separate sibling with the identical mask, above terrain and below waterways, so painting does not deliberately invalidate the retained terrain’s shared composition. The explorer retains its live pinch matrix lookup because it mounts its canvas after loading.
- Superseded display-cache raster jobs are aborted where possible and release temporary image/canvas/object-URL resources. Export still uses the original vector artwork and original resolution/credits; no bitmap substitution or artwork downsampling was shipped.
- Performance/pinch runners retain per-case failures and continue collecting the remaining cases. Named output folders preserve previous checkpoint evidence. Existing thresholds are retained; missing cases cannot count as passes.

## Browser compatibility evidence

The owner confirmed that the crash occurred in **Chrome in the local DEV preview**; its exact browser version is unknown. The installed Linux Chromium **154.0.8037.57** accepts both `DOMPoint` and SVG-created `SVGPoint` in its native implementation. The owner’s exact native exception could therefore **not** be reproduced on this installed browser. Production compilation alone is not evidence that the owner’s browser is fixed.

The real-browser regression also runs an explicitly labeled strict compatibility shim that enforces the older SVGPoint argument contract from the owner report. At exact `8a3b1a`, that test raises the reported `isPointInFill` TypeError and fails selection. This is compatibility fault injection, **not a claim of native reproduction on the owner’s browser**. The corrected runtime must pass native, strict-contract, and missing-API modes on saved mixed-v1/v2 maps, with normal/geographic views and mouse/emulated touch. The owner’s actual DEV-browser retest remains required.

The fixture is technical test content created through existing services in a newly owned empty database clone. Each map has an underlying landmass, scaled/rotated v1 symbols, curved strokes, v1/v2 painted groups, a pinned v2 stamp, a wide label and river, plus an immutable historical appearance. Save/reopen verifies exact drawing content and IDs; source versions, historical payloads and migration ledger remain exact.

The owner also noted that the affected map predates these corrections and may have been built as one object. Its actual saved representation has **not** been inspected from Cloud. Existing grouped artwork must remain one honest selectable object where that is how it was saved; this fix does not split or regenerate it, or promise individually editable marks that were never saved separately. The Items fallback operates on the actual retained drawing/feature records. Any owner-map-specific remainder should be reproduced from an explicitly supplied disposable reproduction after the browser retest, without accessing the owner’s DEV database.

## Performance method and fixed requirements

Same owned 100-drawing/1,500-derived-mark full-library fixture, Linux production Next.js, Node 22.23.3, Chromium 154, a four-CPU quota, and ANGLE SwiftShader software graphics. The old `5b842aa` and starting `8a3b1a` runtime source/package/config files were independently compared with their Git archives before comparison. Benchmark runs are sequential, without concurrent builds or other browser suites. Cold readiness is reported separately from warm gestures. These are local Cloud observations, not hosted-network or physical-phone measurements.

The unchanged requirements are ≥30 fps in a five-second, 100-update pan/pinch; input sequence <5.5 seconds; brush p95 ≤100 ms desktop/≤150 ms at 6× touch CPU throttle; generation/cancel/save/PNG ≤5 seconds desktop/≤10 seconds throttled touch; checkpoint ≤2 seconds; compressed library/thumbnail transfer ≤5 MiB; JS heap growth ≤64 MiB above loaded empty Studio; no external asset download or canvas-page overflow. Total browser process memory is separate from JS heap. Passing a longer diagnostic deadline does not pass the export budget.

Controlled investigation distinguished source cost from the environment:

- The repeated-mask probe on a 1440×900 intermediate runtime changed pan from **11.2 to 56.8 fps**, with the same artwork and input sequence. This is causal diagnostic evidence, not the final acceptance run.
- Exact `8a3b1a` phone export diagnostics took **43.67 seconds**; native SVG painting accounted for most of that time, while computed-style work was small. The same-source shared-mask probe reduced export to **10.55 seconds**, still over the ten-second limit. Faster does not mean passed.
- The Cloud host uses software SVG/compositing/rasterization, and an environment transition interrupted an earlier matrix after two desktop cases. That interrupted run is explicitly incomplete and cannot stand in for the final six-device/four-pinch results.
- A later intermediate runtime passed both desktop cases (58.4/59.2 fps and 1.62/1.99-second PNGs), but phone brush p95 was 292.7 ms. Its collection was deliberately stopped for live-preview isolation and explorer resize preservation. That interruption was an operator/code correction, **not** a Cloud outage; those measurements are diagnostic and do not substitute for the rebuilt runtime’s final matrix.

## Validation results

This is a reviewable **correction checkpoint, not release readiness**. Runtime fingerprint: `79abdebfc3fa421abdcdc624b1e79a782a018ed68abca4f592cacdaeaa3fa1bd`. [Indexed evidence](../screenshots/worlds-geo-ux0a/performance-corrections/README.md) retains red results as well as passes.

- Production build, TypeScript, changed-file lint, 2,259 unit tests (280 files), and three raster regressions passed. Root lint retains one pre-existing unused-type warning in `worlds-stories-checks.ts`.
- All 24 native/strict/missing-API SVG selection cases passed, plus actual city-highlight captures. The strict-contract failure on `8a3b1a` is retained. Four fresh website island journeys, four retained saved-map editing journeys, selection/privacy guards, cancellation/resize, explorer pinch/resize, original artwork exports, and idle authorization passed. Nonempty historical appearances were verified in those functional fixtures; the stress fixture itself has no historical rows.
- All four native-emulated pinch cases passed: 390px **32.6 fps**, 360px **48.4**, landscape 844px **51.2**, and 1024px **37.2**, at 6× CPU throttle. These are emulation, not physical-device results.

| Full workload | Pan fps | Brush p95 | PNG | Outcome |
| --- | ---: | ---: | ---: | --- |
| 1440×900 mouse | 57.2 | 37.1 ms | 2.03 s | Collector error after operations; retained as incomplete |
| 1024×768 mouse | 60.0 | 40.2 ms | 1.61 s | All collected budgets passed |
| 390×844 touch, 6× | 55.6 | **324.2 ms** | **11.14 s** | Brush/export fail |
| 360×800 touch, 6× | 49.4 | **308.0 ms** | Not collected | Export menu covered by footer |
| 844×390 touch, 6× | Not collected | Not collected | Not collected | Empty canvas collapses before fixture load |
| 1024×768 touch, 6× | 51.8 | **228.6 ms** | **12.53 s** | Brush/export fail |

The 1440px collector error concerned a canceled, compiler-declared generation-worker response whose body Chrome discarded. The collector now uses a conservative compressed bound from the entire exact emitted file for only those verified same-origin worker-graph URLs; other body errors remain fatal. One disclosed repeat passed all collected budgets: **58.2 fps, 45.3 ms brush, 2.01 s PNG**, five edit/undo/reopen cycles, 105.8 ms checkpoint, 494.4 ms save and 649.3 ms generation. This does not rewrite the original failed receipt.

Two responsive failures are confirmed code problems and remain open at this checkpoint: the 360px tools-menu height overlaps the footer, and toolbar/starter height can consume the empty landscape canvas. Brush/export deficits remain real failures on this Cloud host. Software graphics plausibly contributes, but does not prove that the residual cost is exclusively environmental or excuse the limits. No passing desktop result substitutes for the failed throttled cases.

Ember's [new owner coastline-usability blocker](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6227834440) is also open. The next bounded correction reproduces artwork/drawn-geographic/generated-geographic journeys through visible UI and exposes existing coast editing beside selection. Existing geographic point editing and immutable source saves are supported; authoritative carve/extend is not implemented by this checkpoint. Owner Chrome, uncoached coastline usability, physical-device and visual acceptance remain outstanding.

## Safe alternative validation if Cloud remains blocked

This is a **proposal requiring separate owner approval**, not work performed against owner DEV:

1. Use an isolated temporary directory, a separate browser profile, Node 22 and the locked dependencies on a representative owner-approved computer. Record OS, CPU, browser version, graphics renderer and actual acceleration status. Use the exact pushed implementation SHA and the same old/start SHAs for matched comparisons.
2. Start a newly owned PostgreSQL 17 cluster on an unused loopback port and unique data directory, with no shared service restart, owner `.env.local`, DEV/Production URL or credentials. Restore only an archive of this task’s verified empty disposable fixture schema/access accounts; run no migrations. Positively verify actual database name, server port and data directory before each setup or test. Clone only the zero-World baseline and use the existing technical/application journeys to create test content.
3. Build each exact revision in a separate runtime copy. Run the same 100/1,500 workload and unchanged budgets sequentially; preserve failed cases. Collect all six device cases, four native-emulated pinch cases, repeated save/undo/reopen/recovery, idle authorization, heap/process memory, transfers and normal downloaded PNGs. Report cold and warm measurements separately. Do not substitute an unthrottled desktop pass for throttled touch.
4. Separately record the owner’s normal-browser SVG-crash retest and, if approved/available, physical-phone selection/navigation/export observations. Physical/uncoached acceptance and artistic acceptance are distinct from emulation. Do not expose the disposable app or database publicly or connect it to owner data.
5. Publish the exact SHA, complete receipts and limitations for independent Ember review. Shut down only the positively identified test-owned processes/cluster. Main integration and the existing `git pull --ff-only`/Docker release remain separate owner-authorized steps after independent and owner approval.

## Preservation and release boundary

Saved-map choice, Select/Items, Undo/Redo, Pan/Space/middle-drag, Remove/Restore, saved stroke groups, locked/hidden/read-only protections, persistent places, geographic identities and historical data remain part of the regression boundary. Original cartography files, pinned asset catalog, finalized migrations and PR #8’s World Overview implementation are unchanged. The professional 2D roadmap remains planning only; no numerical heightmaps or subsequent phase was started.

All database work in this pass uses positively verified task-owned disposable targets. No owner DEV/Production access, migration, deployment, main merge, new paid service or force push occurred. Rollback is a code-only return to the prior feature checkpoint; no data rollback or migration reversal is required. The prior checkpoint itself retains the known SVG/performance blockers, so rollback is not a readiness claim.
