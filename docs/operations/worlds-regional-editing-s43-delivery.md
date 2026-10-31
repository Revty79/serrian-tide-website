# Stage 4 Pass 3: regional editing and shared geography

Stage 4 Pass 3 is technically complete across the explicitly separated receipts below. Main publication is authorized; owner artistic/usability acceptance and physical-device certification remain separate.

Application checkpoint: `59dc91b392b5c81d93c3cb53004df13ff496f4f5`. Build-fix baseline: `e1dd2196c3309069296822c84e7fc520a11e4ec7`. Final application source SHA-256: `4e35c7aa605834bc7d86858d3082405955001e87684e7736e32d6365c171d864`; production build ID: `LBDekla4mZipnAtOYnPDY`.

## Result and authority

The original `geographicEditable = editable && !region` and `requireWorldGeographyWrite` restrictions made inherited geographic layers read-only. A separate coarse-source restriction also disabled refinement entry. Regions now expose bounded authoring of shared parent geography through the existing tools and immutable layer histories. They retain their own identities, appearances and screen-relative composition. No terrain, parent layer collection or permanent Town is copied into each region.

A common server context resolves the owner, World, region, parent map, shared terrain, accepted bounds and complete numerical source vector. Strict retained request pins and current layer revisions are required. The server reconstructs and validates eligible differences against accepted snapshots inside the existing World write transaction. It checks previous and proposed geometry, retained record order, complete material radii/end caps, polygons, rotated artwork rectangles, geographic label anchors/paths and Town positions. Removing or shrinking an outside record cannot bypass its original footprint.

Crossing rivers retain their nodes, connections and outside path portions. Interior adjustments require unchanged in-region attachments; wider renaming, width/network changes and bookkeeping-only protection changes are rejected. Local lakes, water features and proposals retain the existing graph and provenance. Regional environmental changes preserve global climate settings/fields, protected outside overrides, terrain and water. Geographic labels remain shared; regional presentation records contain an empty geographic-label collection and store composition independently.

The coarse World source remains read-only. The UI identifies the active numerical source, physical spacing and editability, locates existing detail and offers explicit **Refine Terrain Here** preview/accept. All seven tools support Original/Fine/Single precision on eligible contained refinements, with exact undo/redo/cancel and save/reopen. Partial sources stay protected; opening or zooming a region allocates no grid. Extents below the existing 100 m refinement minimum receive explicit guidance.

Existing Town selection, placement, movement, removal and the full Town Builder use the same permanent Town and parent marker identities. Removing a marker keeps the Town and its relationships. Both the old and new positions must be eligible for the saved region. Whole-World generation, sea level, global climate, parent-wide settings and complete geographic-history restoration remain World operations. Local undo is supported; wider historical restore routes to the parent.

Browser-local revision hints are coalesced into authenticated reads on acceptance and ordinary reactivation. Clean views refresh relevant heads; dirty gestures, previews, unfinished water drawings, pending requests and recovered drafts are retained. Exact old accepted retries can acknowledge their immutable result without creating another version, then a clean probe follows the newest accepted head. Full numerical vectors include sources outside the regional picker. Own delayed acknowledgements clear conflicts only when the complete observed vector matches. Revision reads also tolerate absent optional tables on older schemas.

## Migration and preservation

**New forward migration `0148_world_regional_authoring.sql` is required.** It adds compact immutable, actor/region/parent/terrain-bound retry receipts referencing existing immutable versions; it does not store a second layer snapshot. Local composition reuses existing label tables. All earlier required migrations remain prerequisites. The published SQL SHA-256 is `b0d7ae3c9db9f41d1c3661a2712c25b1c355293949bccbf45fe872fd123ef6e5`. Staging exposed CRLF in the never-published new file; it was normalized to Git's exact LF bytes, then fresh/upgraded/restored ledger checks and service reads were repeated in `regions-s43-database-canonical-13`. Earlier CRLF rehearsals are retained as historical receipts; only line endings changed. No shared DEV/Production target was inspected or migrated; its current status is not inferred from disposable evidence.

Owned checks pass fresh 149-entry replay, populated 0147 upgrade, unchanged old columns, missing-upgrade rejection, paired database/private-asset restoration and fresh restored-service reads, including original accepted retries. Account lifecycle checks preserve immutable author attribution. The older through-0141 production GUI remains usable and revision reads succeed while environmental authoring shows its normal upgrade requirement.

Preservation verification retains 9,875 untouched Git blobs, all 296 old SQL/snapshot files byte-for-byte, the first 148 journal entries, all 119 original asset/data files, numerical/rendering engines and the build fix. Bounded Tailwind `source("../")` scanning and private-storage tracing annotations remain intact. The prerequisite published gate verifies normal Turbopack development, production and styled Worlds/Atlas/Town/Shop/phone pages; all subsequent production builds are serial and use the original cached Geist bytes.

## Validation and receipt boundaries

Coverage is complete across the following separate receipts. No single uninterrupted aggregate of every check is claimed. Large evidence stays ignored locally under `artifacts/regions-s43-*`.

| Coverage | Local receipt |
| --- | --- |
| 2,571 units across 316 files | `regions-s43-workbench/unit-security-final.log` |
| Final TypeScript and changed-helper lint; earlier full lint has no errors and one existing unused `LoreFamily` warning | `regions-s43-workbench/{typecheck-publication,lint-publication,lint-final-direct}.log` |
| Final production, owned upgrade/restore, native editing, recovery, security and devices | `regions-s43-browser-production-12/` |
| Actual full Town Builder, marker lost-response recovery, final timings and unchanged non-overlap Canvas pixels | `regions-s43-native-timings-6/` |
| First inherited database/browser portion through surface imagery, followed by the retained failed old conflict scenario | `regions-s43-inherited-full-7/` and `regions-s43-workbench/inherited-full-7.log` |
| Final-source continuation from material workflows through hydrology/environment/artwork/labels/engraving/regions and four matched CPU suites | `regions-s43-inherited-continuation-2/` |
| Fresh information-site/database tail; all 133 gameplay tables and retired map records unchanged | `regions-s43-information-tail-1/results.json` |
| Lifecycle 5/5; portable raster 2 pass and 1 Windows-inapplicable permission case skipped; Drizzle consistency | `regions-s43-workbench/{lifecycle-final,portable-raster-final,drizzle-final}.log` |
| Exact published LF SQL bytes: fresh/upgrade/restored ledger hashes and actual restored-service reads | `regions-s43-database-canonical-13/` |
| Final preservation and bounded source comparison | `regions-s43-workbench/{preservation,final-bounded-source}.json` |

The earlier inherited snapshot is bounded against the final source across 1,770 source/config/asset files: only three runtime files and one regression test differ. These corrections cover repeated revision dispatch after old retries, optional-table-compatible probes and the crossing-river bookkeeping guard. Final native/HTTP regressions and all four CPU comparisons use the final build. The information tail uses the preceding observer build; these bounded corrections do not change information or gameplay code.

Final native coverage includes material/vegetation/artwork/label/Town/lake/river actions; exact parent/overlap identities; independent layout; all 21 terrain tool/precision combinations; exact accepted undo/redo, Single changing one sample and pointer cancellation; unfinished water-draft conflicts; clean-tab refresh and dirty-tab 409 retention; lost responses and actual Chrome restart recovery; wrong-context/role/reviewer/CSRF boundaries; and 390 px DPR-2 armed/unarmed/two-finger touch with worker fallback. Wrapped edits and exact fractional coordinates in a 25 m region on a million-kilometre unequal-spacing World pass. A forced late regeneration acknowledgement verifies exact Undo/Redo and numerical import. All six appearances have final World/regional/extreme imagery; final inherited DPR-1/2 capture and precision tail: 192 verified captures across all six appearances, four accepted scenes and DPR 1/2; precision, quality settings, exact save/reopen and native touch pass in `visual-baseline.json` / `precision-browser.json`.

## CPU and workflow measurements

All four matched production Chrome suites pass all nine existing limits against the exact build-fix application, with GPU disabled and identical accepted geographic inputs. No thresholds were increased. The regional comparison also retains exact parent World pixels. Times below are baseline -> candidate seconds; warm navigation is milliseconds.

| Suite | Cold application | Regional | Close | Fallback navigation | Warm 10 keys |
| --- | --- | --- | --- | --- | --- |
| Artwork | 3.160 -> 2.267 | 1.882 -> 1.797 | 4.400 -> 4.402 | 4.170 -> 4.355 | 256 -> 327 |
| Labels | 2.973 -> 2.264 | 1.880 -> 1.796 | 4.381 -> 4.258 | 4.302 -> 4.404 | 315 -> 347 |
| Engraved | 2.619 -> 2.418 | 1.265 -> 1.298 | 2.682 -> 2.481 | 2.668 -> 2.484 | 146 -> 139 |
| Regions | 2.905 -> 2.583 | 1.265 -> 1.265 | 2.498 -> 2.499 | 2.438 -> 2.507 | 140 -> 138 |

The remaining limits cover repeated pan/zoom, far zoom, input during climate work and preview completion. Results vary in both directions; passing gates do not mean every measurement became faster. Exact comparisons are in the four `*-comparison.json` receipts and `regions-s43-workbench/final-performance-summary.json`.

Separate final native diagnostics: regional opening 2.20 s; material interaction plus autosave 1.23 s; Town save/close 127 ms; water acceptance/save 102 ms; parent/overlap/region switching 0.87/1.14/1.21 s; close zoom 182 ms; phone fallback opening/pan 1.71 s/372 ms. Layer selection is 57-127 ms and HTTP save round trips 18-74 ms. A reactivated overlapping view reaches the accepted material revision in 198 ms, including tab activation. These are candidate workflow diagnostics alongside another native run; the old baseline did not permit these regional authoring operations. They are separate from the quiet matched gates.

## Permanent storage and browser memory

The final inherited storage receipt separates PostgreSQL pages, immutable references, exact private-file payload/allocation, staging manifests and browser caches. Cold refinement deltas on accepted nonuniform geography are:

| Grid | Added PostgreSQL allocation | Added references / unique objects | Added private payload | Added private allocation |
| --- | --- | --- | --- | --- |
| 256 | 49,152 B | 85 / 85 | 174,080 B | 348,160 B |
| 512 | 221,184 B | 341 / 341 | 698,368 B | 1,396,736 B |
| 1024 | 851,968 B | 1,365 / 1,365 | 2,795,520 B | 5,591,040 B |

Each adds one refinement identity/version; exact retries add no allocation or objects. Three later one-tile edits add three versions/references but only two new 2,048-byte private objects; the third reuses prior content. Staging manifests still grow. Creating another overlapping regional relationship or reopening adds no numerical copy or private payload. Complete database/private-file restore and restored reads pass. Local screenshots, profiles, dumps and temporary clusters are excluded from these permanent-store figures.

The separate repeated-brush receipt (`regions-s43-browser-production-8/editing-storage.json`, before the bounded final corrections and without supplemental large generation) records database allocation 33,822,399 -> 34,305,727 B; compact receipts 9 -> 20 with their relation remaining 49,152 B; numerical versions 3 -> 67; references 107 -> 363; private files 127 -> 235; and private payload 268,510 -> 404,318 B. Immutable versions/manifests still grow. No permanent rendered tiles or regional copies of parent collections are introduced.

Browser memory is separate: that isolated Chrome snapshot reports 20,947,928 B used JS heap and 96,149,504 B capacity. Per-appearance Canvas cache counters remain bounded estimates, not process RSS. These numbers are not added to database allocation or private payload. No private-storage cleanup/GC occurred; inherited browser heap probes may collect JavaScript garbage.

## Retained failures and remaining limits

Failed/interrupted receipts remain local. Early fixture errors included water-version setup, an artwork constant typo, restore search-path handling, stale lifecycle counts and JSX lint. Development run 4 exposed the incomplete full-source-vector refresh bug; run 5 passed refresh/conflicts but stopped on a duplicate harness dialog handler. The first inherited database run rejected a source change during rehearsal. Inherited full run 2 used the obsolete clean-tab-stays-stale scenario; replacement tests hold real dirty requests. Full run 3 exposed an own-regeneration acknowledgement/Undo race; full run 4 was deliberately interrupted for refinement-entry review; run 5 exposed the remaining modal-guard timing; run 6 rejected changed sources; full run 7 reached the analogous old material conflict assumption. Those runs are not relabeled as passing aggregates.

Continuation 1 attempted an appearance already saved in the retained fixture. Resumed checks now verify that accepted default and create actual material differences relative to retained state. Production run 9 lacked TypeScript support scripts in its new checkout and failed before serving; runs 10/11 passed their corrections, and run 12 adds the final crossing-river rejection. The first native timing run compared a real pointer coordinate with a nominal value; corrected checks retain the exact original request. Review-found water bookkeeping and draft/proposal edge cases have dedicated unit/service/compiled-HTTP or native regressions.

Full-layer regional history restore remains restricted to the parent. New detail creation remains explicit. Balanced high-DPR softness remains an inherited limitation. The final DPR-2 sweep has maximum per-view waits of 15.4 s Realistic, 46.6 s Illustrated, 11.1 s Engraved, 25.8 s Classic/Physical and 30.0 s Topographic. These unmatched capture diagnostics are separate from the nine-limit matched CPU gates. Rendering source is unchanged and these costs remain unresolved. This pass preserves the painters without claiming a new artistic improvement. Technical imagery and emulated native input do not establish owner artistic/usability acceptance or physical-device certification.

No shared database access/migration, deployment, owner-service restart, destructive cleanup, renderer/storage replacement, new hierarchy, Studio, detailed Town maps, new map export/printing features or later pass occurred. Stop after this pass.