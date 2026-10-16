# UX-0A full-library implementation and review index

2026-10-16 candidate on `codex/atlas-ux0a`, from `d858c208d051c532dbdbb0900c0659b1f4bfeec8`. The exact pushed review SHA is supplied in [coordination v2 PR #6](https://github.com/Revty79/serrian-tide-website/pull/6) and [draft implementation PR #7](https://github.com/Revty79/serrian-tide-website/pull/7). **Independent final artwork and joint testing-readiness decisions remain pending.** This document does not invite owner testing or authorize merging/deployment.

## Implemented result

The regional catalog now offers the contract's 14 subjects: three mountains, two hills, four woodland subjects, four settlement markers and one wetland. It retains **18 exact entries**, including all three initial revision-1 pins. The runtime promotes the early-approved rounded mountain r3, broadleaf grove r4 with the distinct r3 grove in its explicit mixed paint set, and city r2. Eleven new original SVG subjects complete the bounded collection. Earlier original files and saved references are not upgraded or overwritten.

The [early art approval](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6217538817) permits bounded expansion in the reviewed direction. It is not final full-library approval. [Provenance and rights](../../public/cartography/serrian-atlas-island/1/PROVENANCE.md) and the [catalog](../../public/cartography/serrian-atlas-island/1/catalog.json) retain original methods, exact hashes, tags, behavior and distribution/export scope. No external artwork was downloaded, traced or embedded.

The [accepted compatibility adapter](https://github.com/Revty79/serrian-tide-website/pull/4#issuecomment-6217551093) is declared as `legacySymbolKind` per pinned entry. V2 validation requires the exact catalog reference, role and declared storage slot; hills/wetlands are user-facing hill/wetland subjects on the terrain layer and cannot create or associate a persistent place. All four settlement markers create or reuse a location and may add its linked editable label. V1 validation/rendering stays intact. No published validator migration was edited.

Paint controls allow an explicit compatible one-to-four illustration set. A real browser journey exposed that submitting a name field reordered mixed references into checkbox/catalog order. The inspector now retains the saved reference order, appends only newly selected references and preserves deterministic scatter when unrelated fields change. A regression exercises the actual form-data conversion and compares the resulting marks.

## Actual website journeys and images

Two **separate newly owned acceptance databases** start with zero Worlds and zero maps, after applying all 133 migrations and creating access accounts only. [The journey runner](../../scripts/worlds-geo-ux0a-library-journeys.ts) creates every World, map, surface, source, drawing and place through normal website controls. It does not seed content through application services or direct SQL. Verification queries are read-only.

Each route creates and revises real geographic land, paints all ten decorative subjects, individually places all fourteen subjects, draws an illustrated river and retains four distinct settlement locations with one linked label each. Hills/wetlands undergo archive/restore and undo/redo. The routes save, return to the library, reload/reopen, revise wetland rotation, deliberately fail a save, download and stage recovery, save again, reload and export PNG. Each final head is geographic source revision 2. Mixed grove references remain `[4,3]`; original drawing/place identities and the recovered rotation are checked in PostgreSQL.

The generated route uses the editable single-island settings with seed `morrow-16`, balanced structure and 55% requested coverage. Requested coverage is a tendency, not a claimed measured land percentage. Artwork is composed against actual land. The final visible export focuses the source using the website's source reader. The manual route authors a 52-point original outline. Source labels are deliberately hidden for these downloads; that view choice is not claimed as a persisted preference. Both normal reopened views retain their source names.

| Review evidence | Direct file |
| --- | --- |
| Fourteen-subject board | [Actual Chrome board](../screenshots/worlds-geo-ux0a/full-library/asset-board.png), [grayscale](../screenshots/worlds-geo-ux0a/full-library/asset-board-grayscale.png) |
| Exact subject/size/provenance index | [Artwork proof](../screenshots/worlds-geo-ux0a/full-library/artwork-proof.json), [64/96px thumbnails](../screenshots/worlds-geo-ux0a/full-library/thumbnails) |
| Manual actual saved map | [Visible PNG](../screenshots/worlds-geo-ux0a/full-library/journeys/manual-visible.png), [desktop](../screenshots/worlds-geo-ux0a/full-library/journeys/manual-desktop.png), [phone palette](../screenshots/worlds-geo-ux0a/full-library/journeys/manual-phone.png) |
| Generated actual saved map | [Visible PNG](../screenshots/worlds-geo-ux0a/full-library/journeys/generated-visible.png), [desktop](../screenshots/worlds-geo-ux0a/full-library/journeys/generated-desktop.png), [phone palette](../screenshots/worlds-geo-ux0a/full-library/journeys/generated-phone.png) |
| Unobscured phone canvas and native-tap zoom | [Manual map](../screenshots/worlds-geo-ux0a/full-library/journeys/manual-phone-map.png), [manual detail](../screenshots/worlds-geo-ux0a/full-library/journeys/manual-phone-detail.png), [generated map](../screenshots/worlds-geo-ux0a/full-library/journeys/generated-phone-map.png), [generated detail](../screenshots/worlds-geo-ux0a/full-library/journeys/generated-phone-detail.png), [results](../screenshots/worlds-geo-ux0a/full-library/journeys/phone-results.json) |
| Intended-size, grayscale and native-pixel close-ups | [Visual review brief](../screenshots/worlds-geo-ux0a/full-library/README.md), [image hashes and crops](../screenshots/worlds-geo-ux0a/full-library/journeys/visual-review-index.json) |
| Separate initial targets, source/drawing/place checks | [Journey results](../screenshots/worlds-geo-ux0a/full-library/journeys/journey-results.json) |
| Original rendering preservation | [All-subject and retained-pin comparison](../screenshots/worlds-geo-ux0a/full-library/rendering/original-image-comparison.json) |
| Display-cache fallback, vector export and keyboard palette | [Actual browser results](../screenshots/worlds-geo-ux0a/full-library/rendering/display-browser-results.json) |
| SQL/service/history/privacy | [Service results](../screenshots/worlds-geo-ux0a/full-library/service-results.json) |
| Owned backup/restore rehearsal | [Recovery results](../screenshots/worlds-geo-ux0a/full-library/backup-restore-results.json) |

The board is a standalone study, not application acceptance. The actual PNGs are genuine website downloads. Cody inspected the board, both final whole-map exports, grayscale, native-pixel settlement lettering and unobscured phone views, including the separated river/settlement labels and shoreline clipping. They remain candidates for Ember's independent final visual decision. These small fictional studies are disposable technical/artwork examples, not permanent Serrian Tide canon or the owner-owned DEV demonstration. A 390px touch browser is emulation; no physical-device or uncoached-novice claim is made.

## Full-library rendering and resource correction

Promoting the detailed original groves exposed a real cost that the old three-simple-subject benchmark could not establish: deep SVG use-trees multiplied detailed paths for painted marks and symbols. The original full-library 6× phone attempt recorded approximately 381 ms brush p95 and a later attempt approximately 21.4 seconds export; it did not pass. A transient-brush-only change was insufficient and was replaced. Those failures are retained in the private diagnostic receipts.

The final candidate shares **one isolated original SVG image definition per exact reference**. Its body is the same checksum-verified committed vector source; instances still use the saved transforms and deterministic marks. The browser can reuse decoded artwork without expanding the detailed path subtree for every mark. A padded rendering viewport preserves edge strokes that the former unbounded inline definition exposed. This is neither a substitute illustration nor a new saved bitmap format. Retained source SVGs, metadata, drawing references and history are unchanged.

The interactive canvas additionally uses a bounded PNG display cache derived from each verified original, at no more than a 1024-pixel long edge. It is reused only when its pixel density exceeds the projected displayed size (including device scale and an oversampling margin); deep zoom falls back to the original SVG. Cache failure also falls back without changing source. The separate export scene always requests original SVG definitions, so display caches do not reduce exported artwork resolution. Native image/cache memory is recorded separately from JS heap.

PNG export accepts an embedded SVG image only when its exact catalog reference is valid, its source has already passed checksum/safety validation and its data URL equals the trusted original-source representation. Unknown references, altered images and external image URLs remain rejected. Existing embedded PNG/WebP raster handling and the final authorization recheck remain. The ordinary export origin contains only already-filtered sources. No original vector bodies move into page JavaScript and unused originals remain lazy.

Chrome compares the former inline vector use against the shared original image use for every latest subject plus all three initial pins, including outside the declared intrinsic bounds. Maximum measured channel RMSE is below 0.016 on the 0–255 scale; no channel differs by more than eight. The [comparison runner](../../scripts/worlds-geo-ux0a-original-image-proof.ts) and [loading/fault runner](../../scripts/worlds-geo-ux0a-lazy-artwork-browser.ts) check retained rendering, corrupted-source rejection, explicit retry, preserved pending fields, no accidental writes, held city loading, retained terrain caches and actual PNG download.

Final measurements use the complete latest library in the existing 100-drawing/1500-mark fixture, with all fourteen subjects and explicit mixed grove references. It retains a mainland opening, two offshore sources and an island in the opening. This is a service-authored resource fixture, distinct from both website journeys. The six production-browser cases are 1440×900 and 1024×768 desktop, and 390×844, 360×800, 844×390 and 1024×768 native-touch emulation at 6× CPU throttle. Warm limits remain 30 fps, brush p95 ≤100/150 ms, export/generation/save/cancel ≤5/10 seconds, checkpoint ≤2 seconds and heap growth ≤64 MiB. Every case passes those unchanged limits in the [final performance receipt](../screenshots/worlds-geo-ux0a/full-library/performance-results.json).

| Viewport/input | Pan fps | Brush p95 ms | PNG ms | Cold ready ms |
| --- | ---: | ---: | ---: | ---: |
| 1440×900 mouse, 1× | 60.0 | 32.9 | 1871.9 | 5605.6 |
| 1024×768 mouse, 1× | 59.8 | 33.4 | 1752.4 | 5085.5 |
| 390×844 touch, 6× | 58.0 | 96.1 | 6756.1 | 28029.9 |
| 360×800 touch, 6× | 59.0 | 107.5 | 6710.9 | 23520.8 |
| 844×390 touch, 6× | 60.0 | 105.7 | 6494.5 | 23298.5 |
| 1024×768 touch, 6× | 59.6 | 100.4 | 6620.4 | 24417.4 |

All 600 brush updates matched rendered feedback. Five edit/undo/save/reopen cycles per case give 30 complete cycles. Heap growth ranges from 4.83 to 6.06 MiB; the conservative compressed artwork/catalog-containing chunk bound is 836,289–955,233 bytes, below 5 MiB. External requests and transfer-capture errors are zero. Browser working sets, server process samples, checkpoints and operation timings are recorded separately. Cold readiness is reported without a warm-budget claim: CPU-throttled phone cold loading can take 28 seconds. Localhost timing does not establish hosted latency and emulated touch does not establish physical-phone performance. No earlier failed diagnostic is relabeled as passing.

Additional indexed checks cover [seven viewport/keyboard layouts](../screenshots/worlds-geo-ux0a/full-library/layout-results.json), [four native two-pointer pinch cases](../screenshots/worlds-geo-ux0a/full-library/pinch-results.json), [v1/authorized geography compatibility](../screenshots/worlds-geo-ux0a/full-library/compatibility-results.json), [lazy artwork faults](../screenshots/worlds-geo-ux0a/full-library/loading-results.json), [save/recovery failures](../screenshots/worlds-geo-ux0a/full-library/recovery-results.json), [retained synthetic scientific-source recovery](../screenshots/worlds-geo-ux0a/full-library/scientific-recovery-results.json) and [idle authorization checks without scene reconstruction](../screenshots/worlds-geo-ux0a/full-library/idle-results.json). The [sequential browser receipt](../screenshots/worlds-geo-ux0a/full-library/browser-checks-results.json) identifies the completed final checks.

New [recovery screenshots](../screenshots/worlds-geo-ux0a/full-library/recovery-regression) and [scientific-source screenshots](../screenshots/worlds-geo-ux0a/full-library/scientific-recovery) retain this run separately; the previously committed screenshots stay unchanged.

## Validation and remaining decisions

| Check | Current evidence |
| --- | --- |
| Production build | Passed with Node 22 in the separate task-owned production checkout; source fingerprint `df58a4c6cd65e4cec5a4fe116e1e1e8a18eddf634af65b2e4fe5aed7a2e86a24` |
| Feature tests | **2249 passed**, zero failures/skips, 276 discovered feature files |
| TypeScript | Passed |
| ESLint | Zero errors; one pre-existing unused `LoreFamily` warning in the stories check harness |
| Two initially-zero website journeys | Passed again with the final bounded display-cache renderer |
| Source/asset safety and actual export | Passed; latest mountain checksum failure, no automatic retry, no download until explicit successful retry; 14-subject stress export and unrelated terrain cache retention |
| Full catalog service/SQL/history/roles | Passed; invalid hill/wetland slots/roles/place links/missing revisions reject atomically; immutable full-library historical payload retains exact references after baseline archive/restore; ordinary filtering, foreign/player denial and read-only Admin review |
| Maximum source limits | Normal service saves at 512 drawings, 6000 marks and 16,384 points passed; each overflow rejected without changing saved rows |
| Backup/restore | Passed: 322 public tables, all rows, 133-entry ledger, 139 sequences, validators and matching artwork; full schema matches after PostgreSQL itself reparses 22 CHECK expressions; originals unchanged |
| Final full-library performance | All six cases pass unchanged limits; 30 edit/undo/save/reopen cycles, no unmatched brush update or external request |
| Repeated compatibility/touch/recovery | Passed with the final renderer; native pinch, keyboard/layout, v1, authorization changes, partial saves, lost-success retries and synthetic scientific source preservation |
| Independent final art/technical review and CI at pushed SHA | Pending publication/review |
| Joint readiness and owner artistic/usability acceptance | Pending; owner not invited by this report |

Cody approves this candidate's technical readiness for initial controlled owner testing, subject to Ember's independent approval of the exact pushed SHA and its full-library artwork. The implemented UX-0A scope has no known blocking technical failure in these checks. The cold-load and emulation limitations above remain explicit. This is Cody's review judgment; the joint gate and the owner's final usability/artistic acceptance remain open.

## Deployment, backup and recovery

This checkpoint introduces no new numbered migration or required runtime configuration. Deployment order, **only after separate authorization**, remains committed history through 0131, then unchanged `0132_worlds_atlas_starter_library.sql`, then the matching v2-compatible application/catalog/originals. The tested 0132 SHA-256 remains `a82737d944b8c96f719059131e0d758221129161f7ce054778b8928a3c5c0574`. Target/ledger identity, matched backups, disposable populated rehearsal and authenticated role/export smoke checks are required for any later controlled deployment. The owner's independently reported DEV/Production application of 0132 was not repeated here.

The [fresh owned-fixture recovery runner](../../scripts/worlds-geo-ux0a-library-recovery-rehearsal.ts) dumps only the new benchmark database, copies its matched artwork release/private root and restores to a newly created empty database on the same positively verified disposable cluster. Public table rows, migration ledger, sequences and validator definitions match exactly; all copied asset bytes match; the original database/schema/sequences/files remain unchanged. Full schema dumps match after PostgreSQL itself reparses 22 existing CHECK expressions in empty temporary copies: restore canonically flattens associative conditions/array casts. Every changed definition must equal the server's reparsed original, with identical constraint metadata; no expression difference is ignored. Temporary checks are rolled back. This fixture has **no scientific raster attachments** and its private root is empty. It does not claim restoration of an operator's retained scientific archive, the deleted Earth, or owner data.

The rehearsal found that a plain `pg_restore` session's empty search path makes existing unqualified validator-helper calls fail during COPY. For this controlled restore, generate SQL from the custom dump, verify the single initial `SELECT pg_catalog.set_config('search_path', '', false);` session marker, replace only that session setting with `public, pg_catalog`, and run it against the newly owned empty target using `psql --no-psqlrc --single-transaction --set ON_ERROR_STOP=1`. The runner checks the exact marker count and target identity, and proves restored function definitions/rows unchanged. This is a restoration-session procedure, not a published migration rewrite, constraint bypass or permission to apply an arbitrary dump to a shared database. Keep the dump and generated SQL private because backups contain account/data rows.

Older code/catalogs are not assumed to understand the new saved references. Prefer a compatible forward fix; a rollback requires readers, validators and all exact artwork pins compatible with saved v2 maps, or separately authorized matched database/assets recovery with reconciliation of later writes. Do not down-convert drawings/history, remove new references or reverse database changes by merely reverting code.

The owner-viewed DEV island and its running task-owned 3002 app use their retained separate checkout. This candidate's build and test apps use `runtime-checkout-library` and the verified disposable PostgreSQL cluster. Cody made no shared DEV/Production mutation, shared restart, Docker change, main merge, deployment or heightmap implementation in this finishing checkpoint. The separate [2D-first audit/proposal](../architecture/worlds-professional-2d-studio-proposal.md) is planning for a later approved roadmap amendment.

The former coordination/implementation PRs #4/#5 were merged externally while this work was underway; the old coordination branch no longer exists. Read-only verification found main at `2d563101e5de3a500c5af3f97a5f4fa0cc9e646d`, differing from the implementation parent only by coordination documents. Cody preserves that main. Ember then created the discussion-only draft coordination v2 PR #6 at `5e26bff9083d2c3678754086344e93082bd604d2`; Cody acknowledged it and linked draft implementation PR #7. New review requests go to #6; #4/#5/#3 retain background history. Neither draft is to be merged by implication. The stale status file on main is not updated.
