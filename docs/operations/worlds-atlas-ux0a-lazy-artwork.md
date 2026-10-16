# UX-0A exact artwork loading checkpoint

Implementation remains in progress. This change uses only the three retained revision-1 subjects; it neither promotes the revised artwork study nor expands the library. Ember's `f71c170` art decision and hill/wetland representation question remain pending.

## Result

The committed generated catalog contains metadata and pinned checksums, with no SVG bodies. The application fetches original self-contained vectors from its own versioned public files only when an illustration is used in the visible scene or selected cursor/paint preview. Hidden layers, archived drawings and unused subjects do not trigger source-body loading. Palette thumbnails retain native lazy loading.

Each loaded file is capped at 1 MiB, times out after ten seconds, rejects redirects, validates normalized UTF-8/LF SHA-256 and rejects unsupported SVG content before insertion. Concurrent uses share one request. A failed request stays failed until explicit Retry illustrations; there is no idle retry loop or substituted revision. Loading/error guidance and retry remain available in Artwork, Export and Explorer. Editable sources, independent save state, inspector fields and undo are not replaced by a load outcome.

Definitions and their uses wait for the exact source. Definition rendering is isolated from changing stroke coordinates, and loading subscriptions belong to scene/preview boundaries rather than every placed symbol. Each stroke retains its own valid display image while an unrelated illustration loads. Display images cannot cache incomplete definitions. Successful source bodies stay immutable for the browser session, and PNG export waits for exact visible references and a committed full-vector scene. It still performs the existing current-access/draft checks before download. An incomplete or mismatched source blocks PNG creation with a visible error.

## Verified evidence

All 2,243 feature tests pass, including exact original/source normalization, no embedded vector bodies, missing/oversize/checksum rejection, deduplication, explicit retry and retained v1/v2 rendering. TypeScript, full lint and the isolated Node 22 production build pass. Runtime fingerprint: `9417ced6e595aa54e28ae7fa89f8052d58f4fe76d45db98b34ae5b8e6b361e84`. Full lint has zero errors and its existing stories-harness unused-type warning.

`scripts/worlds-geo-ux0a-lazy-artwork-browser.ts` creates new technical maps in the previously verified owned performance database. The used map explicitly attaches its existing original technical surface. The browser proof passes zero source-body requests on an empty map, only one mountain source request for two uses, no unused-subject source fetches, one shared definition, and actual live-canvas mountain pixels. Requested page JavaScript contains no original SVG paths. A corrupted reply is rejected, export downloads nothing, no automatic retry occurs, and explicit retry restores the exact illustration while an unapplied title remains. No browser World write occurs during the fault/retry steps. The two PNGs are byte-identical. The unchanged 100-drawing/1,500-mark benchmark also renders 20 temporary images and exports its full-vector composed PNG. Its terrain images retain the same object URLs while an unrelated city source is deliberately delayed, then loaded.

Inspection initially found an empty live canvas in the loading fixture. The fixture had decorative mountains but no known geographic land, so the required mask correctly clipped them. Attaching the owned original technical surface corrected the fixture; no land-mask bypass was introduced. The final proof checks pixels as well as definitions.

The [evidence index](../screenshots/worlds-geo-ux0a/lazy-artwork/README.md) records images, exact hashes, fault proof and resource measurements. These technical maps are not finished compositions, permanent canon or zero-start acceptance journeys. Cody personally inspected their actual images and exports. The first six-case loading matrix had one failed budget: landscape brush p95 150.6 ms versus the unchanged 150 ms limit. That failure is retained. Loading/definition work was then reduced at the preview boundary, and cache readiness made specific to each drawing rather than unrelated city artwork. The corrected complete six-case matrix passes every unchanged budget. Deliberately terminated generation workers can discard their response body during cancel/reopen. The recorder now records the exact emitted chunk path and its full gzip size as a conservative transfer bound; unrelated capture failures remain fatal. This does not change application code or performance budgets.

The metadata module is 2,884 bytes raw / 851 bytes gzip, down from 8,349 / 2,926; all original SVG/checksum/catalog pins remain unchanged. Three pinned originals total 2,437 bytes gzip. These small-library results do not establish the final 12-16-asset transfer/resource gate.

## Final measured matrix

| Viewport/input | FPS | Brush p95 ms | PNG ms | Save ms | Preview/cancel ms | Checkpoint ms | Heap growth MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440x900 mouse 1x | 50.4 | 35.0 | 1502 | 365 | 784/71 | 88 | 4.48 |
| 1024x768 mouse 1x | 55.4 | 34.6 | 1528 | 335 | 920/295 | 74 | 5.16 |
| 390x844 touch 6x | 55.6 | 140.0 | 7565 | 2009 | 697/384 | 247 | 4.89 |
| 360x800 touch 6x | 54.6 | 136.4 | 7128 | 1877 | 799/315 | 453 | 4.64 |
| 844x390 touch 6x | 54.0 | 136.2 | 7151 | 2115 | 1896/359 | 270 | 4.71 |
| 1024x768 touch 6x | 52.4 | 125.7 | 7068 | 1919 | 2482/326 | 269 | 4.76 |

All six cases use runtime `9417ced6e595aa54e28ae7fa89f8052d58f4fe76d45db98b34ae5b8e6b361e84`, Chrome 134.0.6998.166 and Node 22.23.3 on AMD Ryzen 5 5600G (12 logical CPUs, 32 GiB RAM), Windows 10.0.26300. Fresh contexts and warm gestures; touch uses sixfold renderer CPU throttling. Each case has 100 native brush updates with no unmatched feedback and five actual edit/undo/library-reopen cycles. Native event timestamps include input delay. No physical-phone or hosted-network claim.

Conservative catalog-containing JavaScript plus requested artwork/thumbnail transfer is 666-671 KiB gzip per case, including the full emitted canceled-worker file where needed; all six are below 5 MiB and have zero external requests. Browser JS heap growth is 4.48-5.16 MiB above its loaded empty Studio. Per-process browser memory is separate in the proof. Server working set samples are 122.9 MiB before / 200.2 MiB after, with 13.36 CPU seconds between samples; these are not peaks. The preceding performance checkpoint indexes metadata-only idle authorization, native pinch, maximum safe rejection and retained-v1/privacy proofs.

The [complete proof and six actual viewport images](../screenshots/worlds-geo-ux0a/lazy-artwork/README.md) preserve the previous failure, the targeted correction check and this final matrix separately. These are current small-library measurements; final full-library checks remain required after art approval.

## Recovery, deployment and remaining gates

No migration, new service or runtime configuration is introduced. The browser uses the application's existing same-origin static assets and secure-context browser capabilities. Deploy the matching code and immutable public files together; do not remove old asset revisions. Failed, missing or mismatched files preserve exact saved references and expose retry/release restoration. Display caching falls back to retained vectors. The [0132 foundation migration/recovery plan](worlds-atlas-ux0a-foundation.md) remains authoritative; its SHA-256 is `a82737d944b8c96f719059131e0d758221129161f7ce054778b8928a3c5c0574`. Code rollback does not undo migrations or saved v2 content.

Task-owned browser/application processes and the disposable PostgreSQL cluster were stopped after testing; receipts and evidence remain retained. Only verified owned disposable loopback database/application targets were used. Prior backup/private-asset and scientific-source originals remain retained. No main merge, deployment, shared DEV/Production write/restart, Docker, deleted-Earth restoration, permanent fictional canon or later Geo scope. Feature-branch review pushes are separately owner-authorized.

Art approval must precede promotion/expansion. The full art library, resolved hill/wetland representation, final complete-library resource matrix, separate art-approved generated/manual zero-World website journeys and same-SHA Cody/Ember readiness remain required before inviting the owner. Current technical results are not final usability/artwork acceptance.
