# Atlas Stage A4: expanded numerical terrain

Status: **local technical PASS recommendation** for optional 2048 World terrain and 2048/advanced 4096 refinements. Native workflows and all 36 unchanged serial CPU gates pass. Publication and exact hosted CI are recorded separately below; owner/Ember acceptance and deployment remain separate.

Starting checkpoint: `6e00a946fb94679bf0532ab6d4e6e98a4eaa350e`. Owner briefs: `d11322d7-d7f5-415f-991a-d6a7ee062b55` and advanced-resolution supplement `8dfd0e60-f424-4a1f-8156-6ae6127a1dfc`. These supersede A2's migration prohibition only for A4 source development and newly owned disposable databases. A3 had read-only auditing only and remains paused pending separate authorization after A4 review.

## Architecture and preservation audit

The [A2 assessment](atlas-graphics-a2-numerical-resolution.md) supplies the existing dependency inventory. A4 changes numerical capacity, while preserving default World dimensions, 32-by-32 whole-metre Int16 tiles, immutable object checksums, accepted identities and revisions, all published migrations, native authoring engines, protection rules, operation work budgets, existing request/cache/output limits and all 36 original CPU metrics/thresholds.

The new additive `0161_atlas_expanded_numerical_terrain` extends World dimension/coordinate CHECKs to 2048/63 and refinement dimension/coordinate/LOD CHECKs to 4096/127/7. Existing containment, completeness, history and parent/child triggers calculate their bounds from accepted dimensions; their code and original migration bytes remain unchanged. Two preparation tables retain bounded transfer manifests and immutable staged tile references. Native terrain/version tables remain the sole acceptance authority. Existing columns and saved data are not converted.

Transfers reuse private tile staging, the current World/session/lease guards and the original native writers. Duplicate and out-of-order chunks are reconciled against the original byte-checksummed manifest; incomplete preparation cannot publish a native revision. Historical transfer context is retained explicitly and accepted through the existing dated writer. Concurrent expensive transfer acceptance is bounded. Browser IndexedDB retains the original logical command and request ID across interruption.

The original Stage 7C version 1 schemas retain their numerical bounds. An explicit version 2 capability admits larger numerical resources, while preserving bounded manifests, per-resource bytes, authorization, ordinary-content privacy and 32-tile delivery batches. Unsupported consumers receive a refusal; no overview is substituted for full editable terrain. The existing export client negotiates this capability while image/PDF/page geometry and size limits remain unchanged.

The native inherited-sample kernel is shared by synchronous execution and cooperative row scheduling. Worker progress, safe pre-acceptance cancellation and a yielding worker-disabled path use the same values. Advanced 4096 selection requires a plain-language warning and deliberate confirmation, including a server-validated acceptance field. Slow advanced processing is measured separately from ordinary-resolution CPU gates.

Only source files and newly owned synthetic fixtures are used. No clean/original DEV, private recovery point, owner account, Ubuntu/Production/Render service, external geography, Earth, Canon activation or Tabletop work is authorized here.

## Verification and delivery receipt

The final application is the exact source-only production build identified below. Creation, native editing, protections, save/reopen, original-request recovery, immutable history, explicit consumption capability, native PNG/PDF and independent paired restoration pass in newly owned synthetic environments. Existing-resolution, permission, keyboard, rendering and all 36 matched CPU regressions pass. The exact reviewed inventory and preservation proof are recorded below. No owner database migration or deployment is performed. Hosted publication/CI are pending until the publication receipt is appended.

## Numerical capacity and bounded work

| Source | Numerical dimensions | Persistent representation |
| --- | --- | --- |
| Existing World | Existing sizes; default 640 × 384 remains exact | Original format 1, 32 × 32 Int16 tiles |
| Optional World | Up to 2048 per axis, in valid multiples of 32 | At most 4096 base tiles; 8 MiB of logical samples for a dense square |
| Regional/local refinement | Existing powers of two through 2048, including rectangles | Original independently editable source and immutable numerical overviews |
| Advanced local refinement | Optional 4096 per axis, with deliberate confirmation | 16,777,216 editable samples for a square; eight numerical levels, 44,738,560 logical bytes including overviews |
| Whole-World 4096 | Not exposed | World creation remains bounded at 2048; no experimental array is advertised as a saved World |

Numerical dimensions and physical coverage remain separate. Smaller coverage at the same dimensions gives smaller sample spacing; it does not reduce the sample count or its raw memory requirement. Inherited detail begins with the native bilinear parent surface. It becomes additional geographic detail through deliberate editing, rather than automatically inventing geography. Whole-metre vertical storage is unchanged. Display interpolation and Fast/Balanced/Detailed/Maximum quality do not add editable samples.

The existing three inactive source sessions, current editing source, 60-entry/one-million-index undo allowance, viewport plans and bounded tile caches remain in place. New large gestures cannot retain millions of unbounded Map entries: a gesture exceeding 1,048,576 visited/changed samples rolls back completely with an explanation. Selected-area regeneration and ordinary area/path proposals retain a one-million-sample edit bound. Large source buffers are permitted independently of each operation's work budget. Repeated smoothing reuses one scratch buffer and updates only its selected area between passes.

The native inheritance, procedural generators and classic operation kernels share their sample calculations between synchronous and cooperative drivers. Yielding previews provide progress and cancellation when workers are disabled or fail. The legacy generator's quantile ordering has an exact finite IEEE-754 radix ordering in the cooperative driver, with native sorting retained by the synchronous driver. Existing numerical tests and actual accepted sample equality check this scheduling change. This is not a second terrain engine.

Large acceptance has one process-local resource slot, shared by nested native writers, and checks V8 working headroom before allocating. Ordinary small work retains its prior path. Preparation keeps at most two active transfers and sixteen unaccepted retained requests per actor, serialized across Worlds. Each chunk contains at most 64 native tiles; unrelated request, output, cache and operation limits remain unchanged. Setting aside a request is explicit and preserves uploaded objects; browser copies can be downloaded before deliberate discard. These safeguards do not promise unlimited capacity or certify all hardware.

The environment operator's native object inventory includes `world_terrain_transfer_tile` when that additive table exists. Pending objects therefore receive the same reference/format verification as accepted objects; older schemas remain readable. Its existing 250,000-file/reference and 64 MiB manifest bounds remain unchanged. The export layer's existing 24 MiB metadata, 24-megapixel/8192-edge image and 24-page PDF bounds also remain enforced; oversized collections receive refusal rather than truncated sources.

## Lease correction and retained failures

The second real browser attempt exposed a genuine correctness blocker: native 4096 acceptance held the World row while staging its complete source, blocking the regular heartbeat behind that row until its original 120-second lease expired. The final strict native guard refused acceptance, preserving the previously accepted 2048 World. The correction allows only an already valid holder's renewal to lock its lease row independently. Acquisition, release, handoff, revocation and owner management retain the World lock. Session, role, membership, client/token, fence, expiry and post-write checks remain enforced; the deadline is not extended beyond the original 120-second policy.

The owned regression proves renewal while another transaction holds the World row, and rejection of wrong token/fence/tab, expired lease and expired session. Later visible browser runs accept the complete 4096 source through the original native writer. Retained preparation IDs cannot be reused through an ordinary save route, including database-trigger protection of native version/request inserts.

Retained attempts include the initial lifecycle classification and coordinate-bound unit failures; fixture/count and TypeScript corrections; obsolete build 3; browser 1's login selector; browser 2's real lease failure; browser 3's incorrect test tab name; browser 4's test-worker serialization issue; continuation launcher 1's missing assumed stop receipt; and continuation 2's correctly denied post-browser writer while its lease remained live. Continuation 3 uses a new cold copy and respects normal expiry. No original failure receipt is removed or rewritten as a PASS.

The first complete unit rerun under concurrent validation retains two 30-second authentication child-process timeouts. The unchanged official runner subsequently passes all 2,942 tests in 380 feature files when run alone. Original authentication code, test timeouts and all CPU thresholds remain unchanged.

The first CPU aggregate passes the nine artwork gates, then fails the label cold-ready and climate-preview gates and stops before the other two groups. That run overlaps an additional 4096 browser recovery check and is retained in `cpu-1.log` with its full comparison files. It is not treated as a completed serial CPU gate. The complete serial repetition (`cpu-2.log`) passes all four groups and all 36 gates with no concurrent agent tests/builds. The first aggregate remains a failed receipt; no metric, baseline rule or threshold is changed.

## Verified evidence

- Production build 5: 2,153 exact application/data/public/config inputs, SHA-256 `70905f7a1614d2815cad12c92c6469c56c5846f4527eff63fd65be3813bb2e61`, build `nFmpQZBWP_OWle6kZGQBX`. The copy has no owner environment or Git repository.
- Final full TypeScript and ESLint pass (`types-final.log`, `lint-final.log`), with zero lint errors and the single inherited unused `LoreFamily` warning in `worlds-stories-checks.ts`. The official unit runner passes 2,942/2,942 in 380 files (`units-3.log`), with original authentication code/timeouts unchanged. Native generation/operation regressions pass all 26 cases (`kernel-regressions-2.log`). The source-only Drizzle configuration passes migration graph checking without loading `.env.local`.
- Owned migration verification passes fresh installation, exact populated 161-to-162 preservation, and injected mid-migration transactional rollback. Original rows and constraint definitions survive interruption exactly; no preparation table remains half-created.
- Real visible GPU-disabled Chrome 134 passes optional 2048 creation, worker-disabled seeded generation, interrupted bounded transfer/IndexedDB retry, every reopened sample, native keyboard/mouse edits, saved undo/redo, advanced warning/confirmation/cancellation, 4096 acceptance, all 16,777,216 inherited samples, true 4.8828125 m keyboard spacing in the selected 20 km source, focus protection, and a nested editable 2048 source.
- The nested 2048 source passes worker-disabled inheritance, exact 2.44140625 m sample spacing, protected collar refusal, interrupted original-request recovery, and a worker-disabled native area preview/apply that changes exactly its intended 64 samples.
- Stage 7C actual immutable readers refuse the larger sources under version 1 and explicitly negotiate version 2. They deliver 4096 root references, 21,845 advanced references and 5,461 nested references while retaining the original 32-tile batch bound and exact public-row equality.
- Continuation 3 independently restores all 402 public tables and three synthetic roots, including 22,224 terrain files/49,491,639 bytes, with triggers enabled in a complete single transaction. Fresh native readers verify every accepted root/refinement sample and available immutable history. Source row/file manifests remain exact.
- The final-build six UI downloads (World, 4096 crop, 2048 crop; PNG/PDF each) pass independent pypdf/Pillow source, size, physical page and scale checks (`independent-exports-2.log`). Poppler renders all three PDF pages; final visual inspection verifies map, scale, creator, accepted revision and extent without clipped furniture. These are technical output checks, not printer or owner/artistic acceptance.

The evidence is deliberately cumulative: earlier candidate receipts establish particular failures/corrections, while final source/build identity and final completion gates are recorded separately. No shared DEV/Production ledger or owner map acceptance is inferred from these synthetic checks.

## Existing-resolution and safety regressions

| Check | Result and retained receipt |
| --- | --- |
| Original A1 keyboard desktop | All ten browser groups PASS, including smaller sources, exact coordinates, continuous/cancelled strokes, focus protection, polygon vertices, collars, stale fences, dated/admin read-only and narrow layout; `a1-1.log` |
| Emulated touch | Native touch/pinch/navigation and keyboard-preview cancellation PASS without accepted terrain changes; `touch-1.log`; not physical-device acceptance |
| Original A2 rendering | All 48 captures PASS: six appearances, four matched views, DPR 1/2, GPU disabled, no content writes or browser errors; `atlas-graphics-a2/a4-regression-1/results.json` |
| Collaboration | All ten foundation groups PASS; new restrictive actor FK is classified explicitly, eight cleanup authorities unchanged; `collaboration-2.log` |
| Original Stage 7C | All ten groups/all seven native families PASS: original sources, immutable history, ordinary/protected projections, invitations, blocked concurrent revocation, resource corruption and later-edit independence; `s7c-1.log` |
| Infrastructure integrity | 15/15 PASS; `environment-1.log` |
| Raster portability | 3/3 PASS; `raster-1.log` |
| Resource admission | Constrained 128 MiB V8 heap refuses advanced allocation before callback; concurrent admission denied, nested writers share allowance, success/failure release it; `resources-2.log` |
| Large native correctness | Complete 4096 transfer, all eight numerical levels, eleven native tools, protected regeneration rejection, collars/child overlap, rectangular nesting and north/south wrap PASS; `database-5.log` |
| Upgrade and transfer authority | Exact 161-to-162 upgrade, injected migration rollback, lease renewal under World-row lock, reserved-request denial and unaccepted-only portability reference PASS; `database-6.log` |
| Browser and paired restoration | Final nine browser groups, explicit v2 reads, every accepted sample, 402 tables and all private files PASS; `browser-5.log` |
| Additional advanced interruption | Exact original IndexedDB retry at sample 3000/3000, revision 7-to-8, all old/new 16,777,216 samples PASS; `tail-4.log` |

All log names without an explicit prefix are relative to ignored `artifacts/atlas-resolution-a4/`. Detailed browser/database receipts remain in their corresponding ignored `regions-s43-resolution-a4-*` and `collaboration-s7b-*` directories. These are synthetic test identities, not owner content.

## Final-build numerical observations

These are single observations on Windows with installed GPU-disabled Chrome 134. Browser creation/editing phases ran without concurrent agent builds or numerical benchmarks; later export/restore work overlapped additional correctness validation. Database benchmark 5 therefore is not a quiesced comparative performance baseline. The original 36 matched CPU gates are evaluated separately, with their original inputs, metrics and rules.

| Actual workflow | Observation | What is measured |
| --- | --- | --- |
| 2048 seeded preview, worker construction disabled | 6.658 s | Native generation plus inspectable UI preview |
| 2048 save, interrupted chunk and original IndexedDB retry | 45.522 s | Save/recovery journey, including reload |
| 4096 normal visible acceptance and editing-source load | 118.694 s | Complete native acceptance plus loaded source |
| Separate 4096 database creation | 139.977 s | Inheritance, private objects, overviews and commit |
| Complete 4096 transfer | 163.636 s | 16,384 tiles, 256 bounded chunks, one revision and exact retry |
| 4096 raise/lower/smooth/level/coast brush kernels | 0.076–0.201 ms | Numerical work only; not browser input latency |
| Those actual native brush saves | 244–279 ms | Authoritative storage/history, excluding UI debounce |
| 4096 area/polygon/ridge/valley kernels | 99.8–239.1 ms | Complete native proposals; cooperative UI path yields between bounded batches |
| Those native proposal saves | 249–367 ms | Immutable source saves |
| Browser-run application server peak working set | 1,001,865,216 bytes | OS peak of that owned server process, about 955.5 MiB |
| Combined native database test process peak RSS | 1,513,709,568 bytes | Includes synthetic fixtures, expected arrays and verification; not an isolated browser or whole-host peak |

The final browser World retains revisions 1–4, advanced source 1–7 and nested source 1–6. Its actual immutable contract state/version pins are in `regions-s43-resolution-a4-browser-5/a4-consumption.json`. Database benchmark 5 retains advanced numerical revisions 1–16, including original brush/undo/redo, the complete logical transfer at revision 5 and eleven further native tool saves. Both initial and final complete numerical pyramids are compared exactly. Rectangular nested 2048 × 1024 and wrapped 4096 × 128 north/south boundary sources are independently reopened and compared.

Final-build paired restoration verifies 402 public tables and 22,231 terrain files/49,505,022 bytes, plus both empty prepared synthetic artwork/raster roots. Fresh readers compare every accepted sample and immutable history after a constrained single-transaction restore. Root and source row/file manifests remain unchanged by backup and restore. The file totals describe the entire fixture, not a promise of compression or per-map allocation.

Browser heap figures are snapshots rather than peak RSS. The application does not infer exact CPU suitability or available physical RAM from browser metadata. A 128 MiB V8 test refuses the advanced operation before its callback allocates; concurrent large acceptance is refused and the process-local slot recovers after success and injected failure. Fleet-wide admission, weak physical devices and deployment/proxy time limits are not certified by these local tests. Long atomic confirmation may require exact retry after an upstream interruption; preview cancellation and pre-confirmation transfer pause remain distinct from cancelling a committed operation.

The additional 4096 recovery run uses a new cold copy of the final synthetic fixture. A real browser save at sample 3000/3000 (tile 93/93, outside the original 32-tile bounds) is interrupted before acceptance, recovered through Pending Work after reload, and replayed with the exact original IndexedDB body. All 16,777,216 resulting samples and the complete prior revision compare exactly. Its source fixture is never started or modified, and the new owned services are stopped.

## Exact reviewed file inventory

The following source/test/documentation paths belong to A4. Generated maps, private profiles, dumps, keys, screenshots, PDFs and other receipts remain ignored. The lifecycle change classifies the new restrictive actor foreign key; its original eight cleanup authorities are unchanged. Existing test-fixture ledger counts are updated for the single additive migration, without weakening the original preservation or permission assertions.

```text
.gitignore
AGENTS.md
docs/operations/atlas-resolution-a4-delivery.md
drizzle.config.ts
drizzle/0161_atlas_expanded_numerical_terrain.sql
drizzle/meta/0161_snapshot.json
drizzle/meta/_journal.json
package.json
scripts/environment-disposable.test.ts
scripts/environment/database.ts
scripts/worlds-collaboration-cpu.test.ts
scripts/worlds-collaboration-fixture.ts
scripts/worlds-collaboration-foundation.test.ts
scripts/worlds-regional-editing-fixture.ts
scripts/worlds-resolution-a4-browser-details.ts
scripts/worlds-resolution-a4-browser-exports.ts
scripts/worlds-resolution-a4-browser.test.ts
scripts/worlds-resolution-a4-browser.ts
scripts/worlds-resolution-a4-build.ts
scripts/worlds-resolution-a4-consumption-checks.ts
scripts/worlds-resolution-a4-disposable.test.ts
scripts/worlds-resolution-a4-full-detail-transfer.ts
scripts/worlds-resolution-a4-graphics.test.ts
scripts/worlds-resolution-a4-lease-checks.ts
scripts/worlds-resolution-a4-metrics.ts
scripts/worlds-resolution-a4-migration-checks.ts
scripts/worlds-resolution-a4-portability-checks.ts
scripts/worlds-resolution-a4-recovery-checks.ts
scripts/worlds-resolution-a4-refinement-checks.ts
scripts/worlds-resolution-a4-resources.test.ts
scripts/worlds-resolution-a4-restore.ts
scripts/worlds-resolution-a4-restored.ts
scripts/worlds-resolution-a4-resume.test.ts
scripts/worlds-resolution-a4-tools-checks.ts
src/app/api/worlds/[worldId]/terrain/transfers/route.ts
src/db/world-terrain-refinement-schema.ts
src/db/world-terrain-schema.ts
src/db/world-terrain-transfer-schema.ts
src/features/lifecycle/admin-account-lifecycle.test.ts
src/features/lifecycle/user-account-delete-plan.ts
src/features/worlds/atlas-export-client.ts
src/features/worlds/atlas-export-source.ts
src/features/worlds/atlas-export.ts
src/features/worlds/atlas-map-consumption-service.ts
src/features/worlds/atlas-map-consumption.ts
src/features/worlds/http.ts
src/features/worlds/native-map-history-terrain-read.ts
src/features/worlds/native-map-history-terrain-write.ts
src/features/worlds/terrain-advanced.ts
src/features/worlds/terrain-editor.tsx
src/features/worlds/terrain-generation-acceptance.ts
src/features/worlds/terrain-generation-steps.ts
src/features/worlds/terrain-generation-v1.ts
src/features/worlds/terrain-generation-v2.ts
src/features/worlds/terrain-generation-v3.ts
src/features/worlds/terrain-generation.ts
src/features/worlds/terrain-generation.worker.ts
src/features/worlds/terrain-hydrology.ts
src/features/worlds/terrain-operation-engine.ts
src/features/worlds/terrain-operation-workshop.tsx
src/features/worlds/terrain-operation.worker.ts
src/features/worlds/terrain-operations.ts
src/features/worlds/terrain-preview-engine.ts
src/features/worlds/terrain-refinement-controls.tsx
src/features/worlds/terrain-refinement-service.ts
src/features/worlds/terrain-refinement.ts
src/features/worlds/terrain-refinement.worker.ts
src/features/worlds/terrain-resolution-service.ts
src/features/worlds/terrain-resolution.test.ts
src/features/worlds/terrain-resolution.ts
src/features/worlds/terrain-resource-budget.ts
src/features/worlds/terrain-service.ts
src/features/worlds/terrain-source-controls.tsx
src/features/worlds/terrain-source-workshop.tsx
src/features/worlds/terrain-stroke.ts
src/features/worlds/terrain-transfer-authority.ts
src/features/worlds/terrain-transfer-client.ts
src/features/worlds/terrain-transfer-service.ts
src/features/worlds/terrain-transfer.ts
src/features/worlds/terrain-water-feature-schema.ts
src/features/worlds/terrain.test.ts
src/features/worlds/terrain.ts
src/features/worlds/world-collaboration-service.ts
```

## Original 36 matched CPU gates

The complete serial run uses the exact final application build, installed GPU-disabled Chrome and baseline `88cfa27c682b5b339e7f672d8c98b1f0289b2191`. Original four metric producers are byte-exact. Artwork regenerates its identical-input control in the same session; the original other baseline rules and all nine rules per group remain unchanged. Values below are milliseconds, rounded only for display. The original JSON retains full precision and all input/cache/fallback evidence.

| Group | Original metric | Before | A4 | Original limit | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Artwork | coldApplicationReadyMs | 3077.62 | 3589.82 | 3847.03 | PASS |
| Artwork | warmNavigationTenKeysMs | 243.81 | 271.25 | 500.00 | PASS |
| Artwork | regionalReadyMs | 1463.67 | 1445.99 | 1829.58 | PASS |
| Artwork | closeReadyMs | 3989.24 | 4163.96 | 4986.55 | PASS |
| Artwork | repeatedPanZoomMs | 5754.75 | 5837.39 | 7193.44 | PASS |
| Artwork | fallbackNavigationReadyMs | 4961.16 | 5082.29 | 6201.45 | PASS |
| Artwork | farZoomReadyMs | 337.42 | 300.44 | 1000.00 | PASS |
| Artwork | inputDuringClimateMs | 22.68 | 37.94 | 100.00 | PASS |
| Artwork | climatePreviewMs | 987.69 | 1101.65 | 1234.61 | PASS |
| Labels | coldApplicationReadyMs | 2780.49 | 3165.20 | 3500.00 | PASS |
| Labels | warmNavigationTenKeysMs | 277.87 | 271.78 | 500.00 | PASS |
| Labels | regionalReadyMs | 1561.77 | 1579.10 | 1952.21 | PASS |
| Labels | closeReadyMs | 3901.97 | 4047.42 | 4877.47 | PASS |
| Labels | repeatedPanZoomMs | 5806.48 | 6130.41 | 7258.10 | PASS |
| Labels | fallbackNavigationReadyMs | 5145.54 | 5276.23 | 6431.92 | PASS |
| Labels | farZoomReadyMs | 297.10 | 321.36 | 1000.00 | PASS |
| Labels | inputDuringClimateMs | 25.03 | 30.97 | 100.00 | PASS |
| Labels | climatePreviewMs | 992.46 | 1104.91 | 1240.58 | PASS |
| Engraved | coldApplicationReadyMs | 2812.71 | 2748.10 | 3515.89 | PASS |
| Engraved | warmNavigationTenKeysMs | 148.38 | 147.98 | 500.00 | PASS |
| Engraved | regionalReadyMs | 3160.99 | 3180.72 | 3951.23 | PASS |
| Engraved | closeReadyMs | 2636.59 | 2653.33 | 3295.74 | PASS |
| Engraved | repeatedPanZoomMs | 3796.23 | 3766.37 | 4745.29 | PASS |
| Engraved | fallbackNavigationReadyMs | 3146.82 | 3537.74 | 3933.52 | PASS |
| Engraved | farZoomReadyMs | 441.01 | 421.16 | 1000.00 | PASS |
| Engraved | inputDuringClimateMs | 26.67 | 25.73 | 100.00 | PASS |
| Engraved | climatePreviewMs | 1021.78 | 1017.55 | 1277.23 | PASS |
| Regions | coldApplicationReadyMs | 2645.52 | 2785.63 | 3500.00 | PASS |
| Regions | warmNavigationTenKeysMs | 133.40 | 131.29 | 500.00 | PASS |
| Regions | regionalReadyMs | 3346.69 | 3063.50 | 4183.36 | PASS |
| Regions | closeReadyMs | 2504.24 | 2366.51 | 3130.30 | PASS |
| Regions | repeatedPanZoomMs | 3891.15 | 3900.27 | 4863.93 | PASS |
| Regions | fallbackNavigationReadyMs | 2994.75 | 3230.85 | 3743.43 | PASS |
| Regions | farZoomReadyMs | 394.78 | 401.88 | 1000.00 | PASS |
| Regions | inputDuringClimateMs | 25.22 | 30.66 | 100.00 | PASS |
| Regions | climatePreviewMs | 1019.35 | 995.00 | 1274.18 | PASS |

## Preservation, limitations and acceptance boundary

The final source/service audit matches all 2,153 production inputs to build 5, with only the declared Next-generated isolated type include paths. The isolated checkout contains no owner environment or Git repository. Across 24 task output directories, 21 environment receipts and 21 owned PostgreSQL clusters, all recorded cluster PID markers are absent and all 23 recorded task ports admit exclusive loopback binding. No owner database or service is contacted by this audit. All earlier receipts are retained.

The exact file allowlist contains 83 reviewed source/test/documentation files. The original 322 SQL/snapshot files, first 161 journal entries, 114 public assets and four CPU metric producers remain byte-exact. All 10,554 baseline paths outside the reviewed set remain byte-exact (`preservation-proof.json`). Generated geography, exports, private files, profiles, backups and keys remain ignored and are excluded from publication.

**Implemented and tested:** existing sizes/defaults; optional 2048 World; 2048 rectangular/nested refinements; deliberately selected advanced 4096 local/rectangular refinements; normal native saving, editing, history, recovery and bounded consumption/export. **Not exposed:** a 4096 whole-World source. No diagnostic-only array is advertised as a supported saved World. No resolution is automatically selected and old maps are not resampled.

Retained limits include whole-metre Int16 heights, one-million-sample gestures/proposals, bounded source/undo caches, two active/sixteen unaccepted transfers per actor, process-local large acceptance admission, 250,000-file/reference and 64 MiB environment manifests, and existing export metadata/image/page caps. A smaller physical region at the same sample dimensions does not reduce raw sample memory. Manually authored high-resolution detail is additional information; inheritance/display interpolation alone is not.

The local observations do not certify all hardware, fleet-wide resource coordination, deployment/proxy timeouts, physical touch devices, printers or artistic/usability acceptance. A2's previously documented extreme worker-restricted/throttled presentation limits are not declared cured. The 4096 native tool suite is broader than the visible-browser brush/keyboard/2048 area demonstration; not every native tool was separately clicked at every size. Positive 4096 selected-area regeneration is not independently demonstrated; existing native regeneration rules and manual-protection rejection are verified without expanding their work budget.

Migration 0161 has been applied only to newly owned disposable databases. Owner clean/original DEV, retained recovery points, private roots/accounts, Production, Ubuntu, Render and port 3003 remain untouched. The owner's running site has not been restarted. Publishing source is not deployment authorization or proof of a migrated owner ledger. A separate authorized migration/rollout and Ember/owner acceptance remain required before use there.

Stop after A4 technical delivery for Ember/owner review. A3 remains on hold; no Earth, imported geography, Canon activation, Tabletop or later milestone follows from this receipt.
