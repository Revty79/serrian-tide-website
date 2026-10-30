# Atlas Stage 4 Pass 2 — regional visual quality and precision

Starting checkpoint: `4cdfbaa0ca1a1119906cea470a92c8344a78a0fe`. Application checkpoint: 79a2119fca51560ab46414d2015edd0c8557a992. Technical verification is complete across the explicitly separated receipts below; owner artistic/usability acceptance remains separate.

## Diagnosis and changes

Initial accepted-production comparisons were captured before implementation. The owner subsequently clarified that all six appearances require appropriate clarity improvements and World/regional/extreme verification; the immutable accepted build was then used to supplement the all-six baseline. The saved winding catchments, environmental mountains/forest, linked views and a 741 m island on a 19.53125 m numerical grid were examined at World/regional/medium/close/extreme scales, at DPR 1 and 2. Baseline runtime `35aa026b42a892211ccc3e5e01a75df5ac6b18ad12fc36c4b725af52906165cd`, build `JPDteHuNIlKK-GrS4Ommc`, contains 1,716 runtime files.

Four separate limitations were found:

| Cause | Finding and response |
|---|---|
| Numerical | Zoom does not add samples. The million-km parent remains extremely coarse; its accepted 20 km refinement supplies the island. Spacing and display LOD remain visible. Use the existing explicit refinement preview/accept workflow for smaller geographic features. |
| Raster | Illustrated/Topographic numerical-tile bitmaps were enlarged at close range. Existing painters now prepare visible canonical visual subdivisions, at most 256 × 256 per bitmap, with native coastline masks/vector ink and separately interpolated continuous colors. No new elevation values are accepted. |
| Illustration | Repeated conifer/canopy vocabulary and uniformly weighted relief strokes became conspicuous close up. Existing deterministic forest silhouettes, canopy grouping and relief stroke hierarchy were refined. Vocabulary remains finite; these changes do not constitute owner artistic acceptance. |
| Loading/cache | Viewport-sensitive edge crops, whole-painter invalidation and a full Atlas redraw on every worker reply increased preparation churn. Realistic edge crops now use canonical 32-pixel windows; local dirty World-metre rectangles retain unrelated images; compatible coarse images remain only while source-valid finer images prepare. Worker replies dispatch the next bounded job immediately and coalesce background redraws, while explicit input draws remain immediate. |

Classic Elevation and Physical Relief now use the existing numerical-tile painter with the same shared visible-window planner. Close pixels reconstruct bilinear accepted heights before applying the original scientific palette and Classic/physical illumination, rather than enlarging a 32-pixel texture. Integer sample positions match every legacy pixel in fixed/wrapped tests. A separable horizontal-row cache reuses the same accepted interpolation probes without changing any finished pixel; 16 frozen pixel hashes and a sample-read budget cover wrapped/fixed, Classic/Physical, close/clamped and legacy-node cases. Its transient numeric rows are bounded to 35 × 3 × 256 Float64 values (about 210 KiB), with only one partial scalar job retained. Native row yields retain bounded main-thread work, and the original 2,048-image / 8 MiB payload budget is explicit. Loaded fine coverage excludes the coarse parent; offscreen halo tiles do not consume visible raster budget. A constant numerical area reuses its exact color. These are source-derived shading/boundary improvements, not merely larger Canvas buffers.

Realistic Terrain retains the original licensed materials, numerical shader and smooth continuous relief/water transitions. Fine supported sources additionally reveal restrained mineral variation using existing broad noise, without extra per-pixel noise calls. Surface preparation remains capped at 64 MiB, 1,024 images, 972 visible unique tiles and an 8 Mi-pixel viewport work target; oversized plans generalize safely. Original assets and material authority are unchanged.

The all-six alignment review also identified a half-sample cartographic presentation offset. Accepted terrain/refinement coordinates are node-based; the existing contour/silhouette helpers return pixel-centre coordinates. Topographic/Illustrated washes now sample at the canonical node positions, and drawing converts the retained helper output to the same basis. A separate analytic test verifies that a -100 m node at 15 and +100 m node at 16 crosses sea at 15.5 in both the raster mask and transformed vector ink. This corrects presentation alignment without editing numerical geography or changing the helper contracts.

Illustrated Fantasy retains its colored relief and existing geographically anchored artwork. Close coastlines and fine strokes are visibly crisper than the enlarged baseline bitmaps. Native bilinear sea masks preserve the accepted crossing; interpolated land/water color lattices are separate. The shared 64 MiB cache includes prepared color lattices, capped at 32 sources. Contours and principal-curvature fields are reused across adjacent native windows without changing pixels or pen paths. All prepared metadata is separately capped at an estimated 16 MiB inside the existing 64 MiB total. Smooth color filtering remains enabled; vector ink uses screen-relative widths.

Engraved Fantasy Atlas retains the sixth renderer, palette/style authority, labels and ornament. Detailed/Maximum may use intermediate integer tile lattices within the existing 24 MiB budget. Fast/Balanced retain the accepted power-of-two fallback workload. Elliptical canopy groups, varied crowns and relief stroke hierarchy reduce some repeated regularity. Existing geographic hatching and water masks remain authoritative. This is a refinement of the existing illustration engine, not a replacement or parity claim with the owner's reference photograph.

| Appearance | Close-range improvement beyond Canvas size |
|---|---|
| Classic Elevation | Native reconstruction before the original elevation palette; correct bilinear land/water crossing instead of enlarged sample-color blocks. |
| Physical Relief | The same reconstruction with original metre-based gradients, anisotropic spacing and exaggeration. |
| Topographic | Native vector contours/coastline masks in visible windows; continuous washes filtered separately. |
| Illustrated Fantasy | The same shared cartographic path plus varied existing woodland silhouettes and anchored ridge ink. |
| Realistic Terrain | Stable canonical crops, source-valid progressive detail and restrained fine-source surface variation. |
| Engraved Fantasy Atlas | Varied grouped canopies and relief hierarchy, shared seam-free coverage; intermediate close tile lattice is opt-in at Detailed/Maximum. |

All styles retain the shared numerical/refinement selection, exact World coordinates, labels, protected saves and device-local controls. Uniform marine cartography uses its exact color without rerunning irrelevant contour/texture work; shared source loading and selective artwork invalidation avoid stale or unrelated repaint work.

A shared final raster-coverage helper now serves the root texture and all five tile painters, covering all six appearances. The actual forest/desert review exposed faint rectangular lines with the measurement grid off. Software-Canvas readback reproduced fractional clip/overlap coverage gaps: constant opaque tiles varied by 48/74 red-channel levels at DPR 1/2; translucent overlays varied by 13/20. Adjacent device-pixel coverage removes this variation (zero in every case) while retaining smoothing, World frames and source samples. The correction rounds raster edges by at most half a device pixel. Actual matched production forest/desert images were personally inspected afterward: the false tile grid is gone, with the same original artwork and materials.

Dirty-area descriptors are bounded to 64, then safely fall back to global invalidation. Wrapped copies, anisotropic source spacing, reconstruction stencils and engraving halos participate. Cache keys include verified immutable source hashes; missing or changed data cannot authorize reuse of an earlier map's images. Partly prepared scalar pictures are discarded on sea/style changes, root replacement and full source invalidation; four pixel-hash oracles verify equality with a fresh painter. Workers, numerical cache limits and Canvas2D fallback remain in place.

## Device quality and brush behavior

The small Device quality selector is browser-local (`serrian-atlas-device-quality-v1`), with validated Balanced default. It never saves an appearance, changes an authored detail setting or creates geographic history.

| Mode | Preparation tradeoff |
|---|---|
| Fast | 0.75 × device ratio, capped at 0.75 artwork density; normal bounded environmental workload. |
| Balanced | Device ratio capped at 1 artwork density; accepted environmental workload. |
| Detailed | 1.25 × device ratio, capped at 1.5, and smaller close environmental tiles. |
| Maximum | 1.5 × device ratio, capped at 2, and the finest bounded environmental plan. |

Surface viewport and bitmap budgets may reduce artwork density further. Labels/UI retain the normal Canvas backing DPR and its existing cap of 2. The high-DPR review exposed 40–54 s Balanced journeys with automatic 2× artwork density; Fast/Balanced now bound default CPU preparation instead of silently quadrupling pixel work. Detailed/Maximum explicitly retain the larger high-DPR workloads. DPR 1 returns exactly the prior four mode values. This CPU tradeoff is not itself a graphics-clarity improvement; the shared and appearance-specific reconstruction, artwork and seam corrections remain the visual changes. Actual mode timings are recorded separately from the nine unchanged Balanced performance gates.

Original brush precision remains the default and preserves the historical output tests/hashes. Fine stroke uses sparse gesture-local residuals, including interpolative Level/Smooth/coast behavior, so repeated sub-metre influences may accumulate to a whole accepted metre. The accepted grid, saves and CAS encoding remain Int16 whole metres. Residuals and visited samples clear on finish/cancel; the worst-case residual bound is the active grid's sample count, not a permanent floating-point World grid. Smoothing uses only a local Float64 halo in precision mode. Processing retains the existing frame-time budget and 64-dab maximum per advance.

Single sample snaps independently on each axis and affects each targeted sample once per gesture, including seams and last valid edge samples. Its visible footprint identifies the actual sample spacing. It ignores the radius controls because the applied footprint is one sample. It does not continuously paint while held stationary. All seven tools retain protection, physical extent and elevation bounds, exact patch undo/redo and cancellation.

Previously a gentle dab could round away before later influence arrived. Fine stroke preserves that influence only within the current gesture. Single sample intentionally applies once, so very low strength can still yield zero accepted change. Feedback explains no whole-metre result, protected/outside extent, already-level/smooth terrain or unsupported physical footprint. Empty patches create no undo item or save revision. Unsupported original physical requests are caught at the Canvas boundary. **Refine Terrain Here** opens the established preview/accept path; it never silently creates numerical detail.

The 1,024² pure numerical benchmark exercises all seven Fine tools with 160 queued points, exact undo/redo/cancel and bounded residuals. Final native GPU-disabled Chrome proof records Single sample input at 41.3 ms, one surface tile refreshed, stationary one-dab behavior, no-op Level and touch painting. A strength-0.2 Fine gesture changed 13 samples in 3.418 s end to end (including 192 native move events), then saved/reopened with every posted whole-metre sample exact. Three coarse-root edits also refreshed while 56/23/17 surface jobs were pending; each final texture count advanced by nine. These are separate checks, not one uninterrupted aggregate.

Warm ordered quality-mode checks (Fast/Balanced/Detailed/Maximum): DPR 1 input 8.0/10.3/8.0/6.5 ms, ready 942/191/2162/2993 ms; DPR 2 input 19.1/24.4/19.2/16.0 ms, ready 936/257/3184/3699 ms. Actual DPR-2 artwork densities were 0.75/1/1.5/2 while labels/backing retained DPR 2. Every mode retained exact authored appearance/source and caused no geographic POST. These warm mode journeys are not cold, matched performance comparisons.

## GPU-disabled CPU comparison

Current production Chrome, Balanced, same-session exact `4cdfbaa` source controls, identical geographic/layer inputs and unchanged nine limits. Values are milliseconds: before -> after (limit). Artwork pixels intentionally change; numerical and geographic documents remain exact.

| Journey | Surface/artwork | Engraved |
|---|---:|---:|
| Cold application ready | 2537.6 -> 2554.2 (3500.0) | 2407.3 -> 2383.9 (3500.0) |
| Ten warm navigation keys | 176.4 -> 297.0 (500.0) | 108.9 -> 148.9 (500.0) |
| Regional ready | 1663.9 -> 1781.2 (2079.8) | 1115.2 -> 1265.3 (1394.0) |
| Close ready | 4059.6 -> 4346.3 (5074.6) | 2110.2 -> 2434.4 (2637.8) |
| Repeated pan/zoom | 5272.2 -> 6141.1 (6590.3) | 3073.0 -> 3392.3 (3841.3) |
| Complete fallback navigation | 3688.1 -> 4252.7 (4610.2) | 2288.7 -> 2556.4 (2860.9) |
| Far zoom | 271.9 -> 296.9 (1000.0) | 372.9 -> 345.9 (1000.0) |
| Input during climate work | 16.2 -> 53.1 (100.0) | 8.5 -> 24.4 (100.0) |
| Climate preview | 939.6 -> 1100.8 (1174.5) | 917.5 -> 991.2 (1146.9) |

Both exact-baseline suites pass all nine. The inherited label-loaded and accepted-5C Engraved controls also pass all nine on this final runtime. Earlier failed limits remain listed below; these results do not turn those aggregates into passes. Higher device-quality settings deliberately prepare more artwork and are measured separately.

The visual-gallery timer includes Fit/active-source navigation, camera establishment, all preparation/stable frames and a screenshot. It is not an isolated renderer benchmark. The final two-style replay starts directly in Classic, whereas earlier six-style galleries traversed other appearances first; their preceding cache/work history differs. These are descriptive costs, not controlled speedup ratios. Maximum observed seconds across four scenes (DPR 1 / DPR 2) are shown to keep the cost of finer artwork visible:

| Appearance | Accepted 4cdf maximum | Candidate maximum |
|---|---:|---:|
| Classic Elevation | 3.05 / 16.64 | 4.51 / 24.92 |
| Physical Relief | 3.05 / 17.16 | 5.47 / 26.94 |
| Topographic | 4.13 / 30.45 | 6.68 / 29.09 |
| Illustrated Fantasy | 5.17 / 31.21 | 8.25 / 46.67 |
| Realistic Terrain | 4.31 / 25.73 | 4.45 / 16.56 |
| Engraved Fantasy Atlas | 4.27 / 6.24 | 4.76 / 11.34 |

High-DPR close illustration preparation can still take tens of seconds; this pass does not claim that all appearances are faster. Compatible existing pictures remain available while finer images prepare, with bounded input/background work. Classic/Physical candidate figures are from the final row-cache correction; the other four paths are byte-exact to the inspected dded gallery.

## Storage findings

Region creation adds relationship/map/canvas rows and shares the existing terrain, layers and refinement identities. It creates no numerical objects or tile references. The independent browser reopen and second overlapping region likewise create no terrain payload. Region access retains base/layer write protections, contained-refinement editing and partial-overlap read-only rules; Town and placement identities remain shared.

Initialized refinements still materialize the accepted grid and all overview levels. Their logical payloads are:

| Grid | Tile references at creation | Logical Int16 bytes, including overviews |
|---|---:|---:|
| 256² | 85 | 174,080 |
| 512² | 341 | 698,368 |
| 1,024² | 1,365 | 2,795,520 |

These are estimates of logical numerical payload, not disk predictions. The creation interface explains that deduplication, history and filesystem allocation vary. Cold and already-populated CAS measurements are kept distinct. The cold fixture was measured on runtime `149bd6f`; complete manifest reconstructions prove that only the density preference/test and pixel-identical scalar row cache/test subsequently changed. The storage/numerical backend is byte-exact across all three runtimes. The dded runtime repeats storage/restore against the already-populated CAS: zero additional CAS objects/bytes at all three creation sizes and all three edits, with the same required references/versions and exact retry/mtime preservation. This warm result is reported separately from cold cost. Its browser cache accounting shows 48 raw tiles and 1,617,472 detail-bitmap bytes; this is not process RSS.

Cold, nonuniform creation measurements (bytes; OS file allocation excludes directory/MFT metadata):

| Grid | New CAS objects / tile references | CAS payload | OS CAS allocation | PostgreSQL database allocation delta |
|---|---:|---:|---:|---:|
| 256 squared | 85 / 85 | 174,080 | 348,160 | 57,344 |
| 512 squared | 341 / 341 | 698,368 | 1,396,736 | 212,992 |
| 1,024 squared | 1,365 / 1,365 | 2,795,520 | 5,591,040 | 860,160 |

Each creation adds one refinement identity and one immutable version, besides the listed tile rows. Staging manifests are separate retained files: 10,839 / 43,031 / 172,439 payload bytes and 12,288 / 45,056 / 176,128 allocated bytes respectively. Database deltas include indexes, free pages and background activity; they are observed allocation, not a per-row formula.

| Accepted edit | New CAS objects | Payload / OS allocation | New tile references | PostgreSQL allocation delta |
|---|---:|---:|---:|---:|
| Original +1 m | 1 | 2,048 / 4,096 | 1 | 49,152 |
| Original +2 m | 1 | 2,048 / 4,096 | 1 | 0 |
| Return to original +1 m | 0 | 0 / 0 | 1 | 0 |

Every edit still adds an immutable version and a 966-byte staging manifest (4,096 allocated bytes). Reusing CAS content therefore does **not** mean zero total permanent growth. All exact retries add zero rows, objects, manifest bytes or allocation and retain existing file modification times.

The first region adds one Atlas map, Canvas and region relationship; its observed database allocation delta is 0. A second overlapping region adds the same three core rows and 16,384 allocated database bytes. Both add zero numerical files/references/staging data. Independent browser reopening adds zero tracked rows or files. These are the explicitly counted core tables; request receipts and other database overhead are included in the database size measurement.

Two low-risk savings are implemented. A retained immutable object is checked for regular-file identity, exact size and exact bytes before reuse, avoiding another temporary write/fsync; corrupt or linked keys fail closed. Refinement publication still calculates/stages/verifies every required overview, but adds a new immutable reference only when its hash, byte count, encoding or protection mask changed. Historical reads already resolve the latest reference at or before the pinned revision. Measured one-tile edits use one new reference rather than six when all overviews remain identical; returning to previously accepted bytes reuses the existing CAS object. Exact retries add no allocation.

Paired `pg_dump` plus private-root backup/restore is verified through a fresh service against four immutable revisions × six LODs: 24 exact pinned reads, including protection masks and inherited overview references. No revisions or files were deleted. Sparse inherited initialization and garbage collection are deferred: either requires a separate design preserving source pins, manual protection, historical replay, backup consistency and deterministic reconstruction.

Measurement separates exact database rows/immutable references, PostgreSQL allocated pages (including indexes/free space/background activity), unique object payload, OS file allocation, staging manifests, browser cache estimates and ignored evidence. Windows file allocation uses [FILE_STANDARD_INFO.AllocationSize](https://learn.microsoft.com/windows/win32/api/winbase/ns-winbase-file_standard_info); directory/MFT metadata is excluded. Browser estimates are bounded cache accounting, not process RSS.

## Verification and retained failures

Final application runtime: `6d9828ac18e474cceb8c989b4a914f0230aba0ab5c2a0828065f35775c897dcb`, 1,727 runtime files, production build `qGOQQNy_siqNtBVW9hiWR`. All required coverage is complete across full run 7, its continuation, the dded delivery/corrected gallery/Maximum/information tail and the bounded final scalar correction. No single uninterrupted passing aggregate is claimed.

- All 2,561 units in 315 files pass; TypeScript passes; lint has no errors and retains the pre-existing `LoreFamily` warning. Immutable object reuse/corruption test passes.
- Source preservation verifies 9,883 protected baseline blobs, all 148 migrations/snapshots/journal entries through 0147, original assets/data/generators and gameplay sources. Migration 0147 remains byte-exact (`17271f0e5790d840b5cb854471485b13648107266f8b114d7c5b18a5b4f3992a`). No new migration is authored.
- Full run 1 completed disposable database work but failed the isolated-checkout path guard. The guard now explicitly admits only the S42 path with the S42 flag and still verifies copied runtime bytes.
- Full run 2 completed owned migration/backup/build and substantial inherited browser coverage, then failed artwork performance. It predates the final raster/cache/scheduling corrections and remains failed evidence.
- Full run 3 was stopped after the owner's all-six clarification; run 4 was stopped for the canonical node-coordinate correction. Both had completed disposable database/build and substantial early inherited browser work. Their interruption receipts remain retained; neither is a passing aggregate.
- Full run 5 passed database/build and inherited browser coverage through artwork, labels and Engraved functionality, but failed the inherited Engraved close gate: 2,830.38 ms against 2,798.75 ms. Its other eight limits, exact-4cdf surface limits and label controls passed. Later focused evidence does not change that failed aggregate result.
- The first quiet shared-seam performance check passed the surface and inherited Engraved controls but failed exact-4cdf Engraved regional readiness: 2,097.87 ms against 1,351.52 ms. Diagnostics showed 220 prepared images/269,778 strokes versus 192/229,598. Balanced now retains the accepted power-of-two tile workload; the richer intermediate lattice is explicit Detailed/Maximum preparation. The a510-runtime focused repeat passes all nine unchanged Engraved limits and regional switching/reuse.
- Full run 6 was stopped after material/terrain browser regressions when review reproduced stale partial scalar pixels after a sea/root change. New regression tests reproduced style, sea, root replacement and full-invalidation differences against fresh painters; the pending-work cancellation correction resolves all four. The interrupted run and failed-before/fixed-after receipts remain retained.
- Full run 7 passed the complete disposable database/build chain, inherited browser coverage through artwork/labels and all nine exact-4cdf surface limits. It failed one inherited label-loaded fallback limit: 4,585.36 ms against 4,567.72 ms; its other eight passed. The identical-runtime repeat passed all nine (fallback 4,502.02 ms against 4,615.90 ms). No code correction is attributed to that repeat, and the failed aggregate remains failed.
- The continuation passed inherited Engraved and exact-4cdf Engraved limits, regional functionality/switching, the seam oracle, cold storage and 24 restored reads. Its gallery was stopped when personal review exposed diagnostic tint/palette settings left by earlier tests. Canonical fixture appearance setup now explicitly matches the baseline through normal owned-fixture APIs and verifies unchanged numerical documents. Later high-DPR images exposed the slow default preparation described above; those superseded images/timings are retained. The dded delivery passes all four unchanged nine-limit suites, regional functional/security/switching checks, the seam oracle, warm storage/24 restored reads and native precision/quality/root/touch checks.
- Focused audits 5–9 exposed real CPU regressions from extra per-pixel noise, excessive full small tiles and repeated full-canvas worker redraws. Those approaches were corrected, not covered by relaxed thresholds. Audit 12 also retained a failed fallback timing during concurrent compiler/unit work; audit 13 on the same application runtime passed all nine exact-4cdf gates. Timing must remain quiet and matched; no slower gate is omitted.
- Earlier native checks incorrectly treated a Whole World source placeholder as the fine source; a later touch attempt hit the open settings drawer. Tests now wait for the named accepted refinement and arm one-finger painting, then close the drawer before a native touch. The focused functional 14 passes both native input paths, storage allocation and paired restore.

Final matched visual coverage uses the untouched accepted 4cdf build and the same owned database. The baseline has 192 captures; the candidate combines 96 corrected catchments/highlands captures with 96 valid linked-region/fine-source captures. All six appearances include World, regional and extreme views at DPR 1/2; the three principal illustration styles also include medium/close views. Appearance specs, points, Canvas CSS/backing and target camera tolerances are verified. The fine source has all 1,365 tile hashes, protection masks, six LODs and initial parent references exact (source digest `8ebb086c992112adc5190419ec55c9e4e977e6b74fb22111932dc011306c2522`). The baseline clone preserves the original historical revision before later native edits.

Personal inspection covered all eight matched overview/native contact sheets, plus actual forest/desert/cartouche imagery. Classic/Physical color blocks become continuous source-derived shading. Topographic/Illustrated ink is thinner and clearer, retaining angular accepted contours. Engraved canopies/relief have more hierarchy, with finite repeated vocabulary still visible. Realistic variation and seam stability improve subtly; Balanced at DPR 2 smooths fine material texture compared with the old automatic density 2. A separate five-scale Maximum proof on the identical fine source retains density 2 and comparable native texture fidelity. This is an explicit CPU/quality choice, not a claim that every pixel became sharper. Coarse geometric terrain/tone patches remain where accepted sources are coarse; decorative detail does not resolve numerical limits or certify artistic parity with the reference photograph.

The first dded catchments/highlands gallery copied browser recovery drafts from prior tint/security tests. Those 96 images are retained as invalid matched evidence. Canonical API setup plus cookies-only browser contexts and post-capture style/palette/tint assertions correct the harness; product recovery behavior was working. The earlier baseline-six-final-9 gallery is historical evidence, not the final matched layer comparison. Earlier interrupted/invalid galleries and failed timings remain retained.

The information-site tail passes on dded in a fresh owned database: all twelve destinations, thirteen creator families, history/calendar/Campaign/timelines, old bookmarks, retired HTTP boundaries, G.O.D./read-only Admin/foreign/Player/anonymous/private/CSRF guards and 390px touch-emulated navigation. All 133 gameplay runtime tables, legacy map rows and Realm map versions remain exact; errors and unintended map requests are empty. That tail explicitly skips the terrain browser chain already covered elsewhere.

The final scalar correction changes only the existing renderer and its golden/read-budget test. In-memory reconstruction reproduces the entire prior dded runtime hash; every other runtime file, including other style paths, storage and numerical authority, is exact. Final production correction results: all four unchanged nine-limit suites and regional switching pass on the final build; all 48 production images across four scenes/three scales/two DPRs are byte-for-byte pixel-identical to the reviewed dded images, as are the 16 independent frozen scalar hashes. Recorded scalar preparation batches peak at 10.4 ms and bitmap payload at 8,382,264 bytes, below the unchanged 8 MiB cap. The replay observes smaller journey maxima than dded (Classic 12.56/41.60 to 4.51/24.92 s at DPR 1/2; Physical 12.80/42.31 to 5.47/26.94 s), qualified by the different preceding style/cache history above.

All screenshots, browser outputs, large receipts, dumps, clusters and profiles remain ignored locally under `artifacts/regions-s42-*`. No gallery, reference photograph, generated asset collection or duplicated historical evidence is committed. At the final measurement, S42-prefixed local workbench files total 6.016 GB of summed file payload, including 2.996 GB of dependency/build files and 1.894 GB in 2,984 PNGs. The two known final owned temporary roots separately contain 1.590 GB and 1.607 GB. These are payload sums, not physical allocation or permanent application growth; links are skipped and older baseline checkouts/other prior clusters are excluded. No cleanup was performed.

## Operational boundary

Existing 0147 is required for regional maps; this pass adds no migration. The earlier DEV-through-0147/Production-through-0146 audit is historical evidence only. Shared databases were not accessed by this pass. No deployment, owner-service restart, destructive cleanup, Studio work or next pass occurred. Main publication is authorized; owner artistic/usability acceptance and physical-device certification remain separate from installed-Chrome technical evidence. Stop after this delivery.
