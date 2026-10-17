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

## Beginner toolbar, coast and responsive follow-up

Final runtime source fingerprint: `b2801dcb44a2c10e5bf04e0c0425b507eb95e85f024c128e30fff5ba6db635a6`. The section above describes the separately pushed `a003e8b` checkpoint and its retained failures. The follow-up uses the [owner-confirmed basic/advanced toolbar contract](../architecture/worlds-atlas-basic-toolbar.md); [final evidence is indexed separately](../screenshots/worlds-geo-ux0a/performance-corrections/toolbar-coast/README.md).

The basic vocabulary is now visible near the canvas: Select & Edit, Move Map, Land & Coast, Water & Roads, Paint Terrain, Place Objects, Text & Labels. Existing Items, Undo/Redo, zoom/Fit, Save, Export and selection actions remain. Water/road choice and new printed text have simple inline inputs; their specialist settings remain available. Land & Coast offers initial land creation or routes an existing selected coast to its real editor. Existing drawings remain groups where saved that way.

The normal website baseline journeys reproduced three retained representations: a v1 ordinary artwork continent, a manually drawn geographic island, and generated geographic land, on desktop and 390px touch. Known controls were used, not model-ID selection. This establishes technical behavior, not uncoached success or a diagnosis of what the owner's "both ways" meant. The owner's actual old map and exact Chrome version remain unknown and were not inspected from Cloud. The baseline touch recording also exposed Select reopening an inspector over the canvas; that obstruction was closed through its visible control to continue the baseline and is preserved as a failed capture.

The owner's [priority reset](https://github.com/Revty79/serrian-tide-website/pull/6#issuecomment-6228289503) governs this checkpoint: finish one minimum usable mapmaker with existing systems, rather than pursue professional polish. The 14-subject library remains unchanged. Routine workflow results are distinct from the published 100-drawing/1,500-mark stress gate; no release exception or main consent is assumed.

A native touch reproduction found one additional basic-use defect: clicking inside the current unsaved coast preview tried to read its transient ID as a saved source and showed **Invalid UUID**. The renderer now leaves previews visible and masked while removing saved-source targets/keyboard actions from transient geometry. Actual retained sources keep their targets and first keyboard entry. The negative before-case is reproducible from the final source with only `geographic-scene.tsx` restored from `a003e8b`; packaging verifies the exact reconstructed `8e07207…` fingerprint. Its two complete desktop timing cases (59.4/56.6 fps) were deliberately stopped for this correction; the partial run is retained privately as an operator stop, not a Cloud failure or final matrix.

Confirmed changes:

- Selecting ordinary polygon land or a geographic shoreline exposes **Edit coastline** in primary controls. Original artwork uses its existing move/add-point/smooth/sculpt functions, map undo and map save. A geographic coast uses complete retained boundary coordinates, its existing point/add editor, permissions and additive source-version save. No decorative clone substitutes for a geographic edit.
- Save coastline and Done remain visible beside the coast heading on phones. Unsaved state, selected coast/points, drag intent and Undo/Redo are explicit. Done waits for save or undo; existing advanced fields, independent domains and recovery remain retained.
- Geographic source brush shaping/smoothing is truthfully unavailable. [The bounded source-safe sculpt proposal and estimate](../architecture/worlds-atlas-basic-toolbar.md#separate-decision-authoritative-brush-shaping) is planning only and needs separate approval before coding; existing point editing provides the safe reshape path now.
- Real touch testing found that a visible geographic shoreline could miss after reopening. Selection now checks actual rendered fill/stroke with a small screen-space tolerance (22px touch/4px mouse), through the owning SVG's point factory and inverse transform. Paint order/other drawing precedence remains; source bounding boxes never substitute for holes, disconnected parts or coast geometry.
- Select closes the optional inspector; first-map invitations no longer automatically cover saved geographic/artwork land. The 360px tools menu expands above the footer while open. Short landscape uses bounded horizontal navigation/starter rows, retaining tools and status while keeping a nonzero canvas.

Final build, TypeScript, 2,259 unit tests (280 files), and changed-file lint passed. The existing preview unit regression now requires both visible land/matching masks and no fake saved-source targets. Root lint retains one pre-existing unused-type warning; portable raster checks are recorded separately.

All six final visible-UI coast journeys passed, including native draft-preview misclicks, source-safe point changes, retained geometry matching the deliberate save, Undo/Redo, save/reopen and edit again. The drawn desktop case creates a second island through visible UI and verifies its source head remains exact. Fresh coast fixtures have zero historical appearances; nonempty retained appearances and privacy are covered separately by the 24 SVG cases and saved-map/selection suites, not claimed from an empty history table. Four full beginner website journeys, four retained-map editing journeys, restrictions/privacy, gesture/cache/cancel/resize and retained artwork exports passed. All receipts identify the exact runtime fingerprint where applicable.

| Final 100-drawing / 1,500-mark workload | Pan fps | Brush p95 | PNG | Unchanged budget outcome |
| --- | ---: | ---: | ---: | --- |
| 1440×900 mouse | 58.6 | 31.1 ms | 1.74 s | Pass; global error log unavailable after interruption |
| 1024×768 mouse | 60.0 | 30.4 ms | 1.29 s | Pass |
| 390×844 touch 6× | 53.6 | 222.5 ms | 11.40 s | **Fail: brush, export** |
| 360×800 touch 6× | 55.2 | 262.9 ms | 9.42 s | **Fail: brush** |
| 844×390 touch 6× | 55.6 | 306.4 ms | 9.57 s | **Fail: brush** |
| 1024×768 touch 6× | 51.0 | 235.5 ms | 9.04 s | **Fail: brush** |

Per-case metric collection complete: **true**. Overall stress pass: **false**. All four pinch cases collected: **true**; overall pinch pass: **true** (390×844: 42.8 fps, 360×800: 44.2 fps, 844×390: 47.6 fps, 1024×768: 42.6 fps). This collection resumed after an execution-session disappearance: the complete 1440px metrics were durable, but its process-global browser-error/hardware summary was lost. Remaining cases ran once in fresh independent browser/app processes against the same frozen source and workload. It is not a single uninterrupted full-suite pass. The original partial 1024px attempt and the interruption are retained. Missing/incomplete cases cannot count as passes. PNG download/export times include normal website work; no deadlines or quality requirements were weakened.

The exact final software-rendered Cloud run is evidence of measured behavior on this host. Earlier bounded optimization fixed confirmed code costs, but any remaining brush/export or gesture deficits are unresolved requirements. The diagnostic brush CPU sample was mostly native/program time and does not isolate all residual cost as exclusively environmental. No physical phone is attached, and the owner's Chrome DEV version/map is unavailable here: emulation/strict-contract tests do not replace those observations. The separately owner-approved isolated hardware-accelerated target-machine plan above remains the safe alternative for attribution/validation.

Routine website studies and small fresh maps complete the basic drawing/editing/save/export paths; they do not waive the published stress gate or establish uncoached human acceptance. This is an exact-source draft checkpoint for independent review. If routine usability is independently accepted while stress failures remain, the owner must explicitly decide on any narrow release exception; no exception, merge or deployment permission is assumed.


Owner uncoached use, actual DEV Chrome retest, physical-device observations and visual acceptance remain separate gates. No owner testing invitation, merge, deployment, authoritative sculpt algorithm, new phase, migration or DEV/Production access is authorized by this report. The legacy build receipt’s `migrated: 133` field is the observed existing schema-ledger count: this continuation clones the verified empty baseline and runs no migrators.
