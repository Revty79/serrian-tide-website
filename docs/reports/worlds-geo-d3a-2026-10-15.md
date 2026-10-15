# Geo D3-A completion - 2026-10-15

Approved base: `c4c4f67cead798b1ef72660049c4ee39d3ce594e`. This report belongs to the single local D3-A review commit; resolve its exact SHA with `git log -1 --format=%H -- docs/reports/worlds-geo-d3a-2026-10-15.md`. Ember's independent technical review and owner visual acceptance remain pending. No push or deployment was performed.

## Delivered generation and actual editing

Creators can associate an existing supported fictional surface using D2, configure seeded continents/islands or archipelagos, adjust approximate coverage/size and coastline shape/complexity, preview new geometry, regenerate with another seed, explicitly accept the batch, reopen any saved coastline in D2 and move/insert/remove vertices. Four practical presets include a continental coast with offshore islands, separated landmasses, island chains and a single irregular island. A preview never writes source records.

The new `serrian-geography-v1` adapter reuses Atlas V2's existing asymmetric silhouettes, bays/peninsulas, multi-scale coastal variation, unequal land placement and coherent island chains. The only change to the old generator is exporting its existing land function. V1/V2 dispatch, saved recipes, description interpretation, decorative terrain and old source artwork are unchanged. Both old algorithms were separately previewed and saved in the actual browser. A golden digest pins the new normalized recipe/geometry; browser results also matched Node 22 reproduction exactly.

Every complete coastline becomes an authoritative Polygon source with its own stable feature/place identity, immutable original version and derived display parts. Batch membership retains the shared creation context. No baked image, mass decorative conversion or parallel map engine is used. Manual D2 revisions retain the original recipe, members and original geometry; retrying generation cannot overwrite a later edit.

Screenshot inspection found that 192-point coastlines need local editing focus. The existing D2 workspace now offers an exact vertex selector and focus around that point/neighbors. Selection and focus do not mark a source dirty or save a revision. Mouse/keyboard editing and insertion/removal were exercised after generation. Full-resolution data is retained; no simplification is hidden behind the control.

## Architecture, saves and published limits

The [architecture record](../architecture/worlds-geo-d3a.md) details implementation and field guidance.

- `geographic-generation.ts` normalizes a versioned recipe, adapts retained V2 land algorithms, maps through the existing coordinate convention, canonicalizes complete rings and validates every source plus aggregate separation.
- `geographic-generation.worker.ts` runs bounded preview computation. Cancellation terminates the worker/aborts context loading; job identities reject late results. Stale settings disable acceptance and clear the candidate overlay. A separate preview and overlay on the actual Atlas let creators inspect proposed additions.
- `geographic-generation-service.ts` and the private endpoint reauthorize the owner, active generic map/timeline and surface. A metadata-only source-head/map stamp detects concurrent changes without reading worldwide geometry. The server reproduces and checks the output digest before an atomic World writer transaction.
- Existing JSON version properties retain algorithm/base algorithm, complete recipe, seed, surface/reference, map/timeline, creator, request/digest and generated feature/place/original-version roster. Creation time remains in the immutable row. Creator-authored provenance asserts no external license/provider.
- Failed saves keep the preview and frozen request for idempotent retry. Context conflicts require refreshing saved geography and a subsequent explicit additive acceptance. Existing heads, places, artwork, historical states and raster settings are never replaced.
- Combined discard/navigation protection includes generation. Geographic source, generated batch, artwork and raster preference saves retain their own dirty boundaries; a preview alone does not enable an unrelated source or map save.

| Limit | Behavior |
|---|---|
| Batch size | Up to four major landmasses plus twenty islands: 24 complete sources, at most 2,208 vertices |
| Per source | Major coastline 192 vertices; island 72; both stay below D2-B's 256-vertex limit and can later gain supported holes/components |
| Coordinates | Creator-declared `AUTHORED:` planes retain their own units, origins, bounds and existing Atlas orientation; `AUTHORED:angular` spheres retain longitude/latitude |
| Spherical extent | Local longitude span below 120 degrees, vertex latitude within 75 degrees; geodesic topology validated together in a common gnomonic plane |
| Coverage | Requested coverage/size are tendencies. Actual planar-design coverage is reported; this is not spherical surface-area coverage. Tight fitting and a seed can reduce it substantially. |
| Runtime | One cancellable browser worker, bounded rejection attempts, 64,000-byte request ceiling and server reproduction; no GPU/commercial provider/raster storage |
| Unsupported | Imported Earth references, seams/poles, wider spherical areas and other topologies are unavailable for generation; originals remain intact. No terrain/hydrology/biome simulation is claimed. |

## Validation

The established receipt-verified Node 22.23.3 / PostgreSQL 18 / Chrome production environment was resumed. All new writes used disposable Worlds or an additional exact Glass Sea copy. Persistent DEV, Production and shared services were not contacted or restarted; existing raster bundles were borrowed read-only.

| Check | Result |
|---|---|
| Node 22 build / TypeScript | Pass; fingerprint `72ef610bc5ceb16339584a9f69740ad9485fea670a0a7a0da4c47454d3ac3219` |
| Feature tests | 2,201/2,201 across 265 files; seven new generation and 20 existing authoring tests |
| ESLint | Zero errors; one existing Stories warning; final changed files have no warnings |
| Generation services | 6/6: identities/retries through manual edits, privacy, stale/digest/surface rejection, forced second-source rollback, roles and measurements |
| D3-A browser | 10/10: seeds, preview/acceptance/reopen, D2 edits, failed saves/retries, conflicts, cancellation, stale/blank bounds, spheres, phone, privacy and V1/V2 generation |
| Glass Sea copy browser | 2/2: three reproducible candidates; isolated save/edit with originals retained |
| D2-B / D2-A browser | 11/11 multipart and 13/13 original polygon/river journeys |
| Map/export compatibility | 12/12: Earth, rasters, projections, history, exports/failures/authorization, ordinary/Admin and local maps |
| Services / migrations | 8/8; fresh 132-entry schema and populated no-op upgrade |
| Preservation | 160,852 original rows across 118 World tables retained; ledger exact; 16 raster versions/six bundles verify |
| Repository | No schema, migration, dependency, Docker, data or asset-provisioning changes; diff checks pass |

Native touch evidence uses Chrome mobile emulation and browser touch events/CDP, not a physical phone. Local Windows Node 22 verification does not substitute for Linux CI or owner visual acceptance. The pre-existing unused `LoreFamily` warning in `scripts/worlds-stories-checks.ts:6` remains unchanged.

## Glass Sea proposals and preservation

The [short Glass Sea proposal](worlds-geo-d3a-glass-sea-proposals.md) records three seeds, complete settings, extents, source counts and screenshots. None is established canon. All three were previewed through creator controls without writes. One was accepted and manually revised only in the additional disposable copy. No hidden developer import created the candidate geometry.

Every original Glass Sea row, including heads, versions, artwork, Glass Channel and the original surface/map association, remained exact. The existing Glass Island and Copper Isles were not altered. The owner's separate DEV drop-and-restore did not contain any work from this pass: implementation/recipes/evidence are local files and all geographic writes were in isolated databases.

D3-B/later terrain, waterways, hydrology, climate and biomes remain future work. D4 connects detailed regions/settlements/buildings/interiors/dungeons, D5 adds art/assets, and E validates a substantial Glass Sea alongside Earth accuracy. New geography, settlements or lore still need owner approval; D4/E historical layout review and D5 settlement/interior/dungeon visual assets remain scheduled. No postponed interface/navigation/language overhaul was begun.

## Performance, storage and before/after evidence

Ten seed samples per configuration measured Node generation including validation:

| Configuration | Sources / vertices | Median ms | Maximum ms | Maximum result JSON bytes |
|---|---|---|---|---|
| continent | 6 / 552 | 36.22 | 44.23 | 13,548 |
| separated | 10 / 1080 | 141.50 | 195.90 | 25,585 |
| archipelago | 16 / 1152 | 46.63 | 49.93 | 27,594 |
| island | 1 / 72 | 1.91 | 2.75 | 2,545 |
| maximum | 24 / 2208 | 344.83 | 560.33 | 52,022 |

Browser worker preview/transfer/digest measured **91.0 ms** for six sources / 552 vertices and **118.3 ms** for sixteen sources / 1,152 vertices. These are local samples, not concurrency or physical-device guarantees. Frozen inherited settings are retained in the result/recipe. A complete service request was **790 bytes**; the server reproduces geometry from settings instead of accepting a replacement image or unchecked coordinates.

Across complete D3-A journeys, 8 successful browser generation responses used **769-828 request bytes**, with **13.712 / 27.311 / 159.856 ms** minimum/median/maximum local response timing. Glass Sea acceptance used **801 request bytes / 103.329 ms**. Successful browser geographic GETs totaled **290,376 decoded bytes / 43 responses** for D3-A and **19,197 / 9** for Glass Sea across reads, contexts, reloads and previews. Direct harness checks and aborted responses are excluded; these are not initial-load benchmarks. Context checks read scoped head/map metadata, never worldwide originals.

Representative six-source generation stored **22,196 version-row bytes + 24,408 display-part bytes = 46,604 bytes**. A manual revision added **4,970 + 7,800 = 12,770 bytes**, retaining originals/recipes. The disposable Glass Sea candidate plus manual revision added **13,598 version/part-row bytes**. These pg_column_size measurements exclude other identity rows, index/page allocation and WAL; they are not whole-database growth estimates. Validation-history totals include repeated disposable fixtures. No raster was generated or copied.

Before/after hashes retain all **160,852 original World rows across 118 tables**, including C1-C3, coordinate registrations, identities/versions/heads/provenance, Atlas artwork, Glass Sea and Living History. All 132 migration rows, including 0130/0131, remain exact. Six private bundles and 16 raster versions verify. Every original row/head in the additional Glass Sea copy stayed exact; only candidate records and their immutable revision were added. This pass performed no persistent DEV or Production writes.

The committed [evidence receipt](worlds-geo-d3a-evidence.json) retains check totals, build identity, measured summaries, full candidate recipes/digests and screenshot hashes. Raw JSON requests/downloads, detailed snapshots, PNG composition proof and logs remain in ignored `artifacts/guidance/geo-d3a` and the established isolated D1/D2 evidence directories. Compatibility screenshots are archived separately; original committed D2 screenshots are retained unchanged.

## Actual screenshots and findings

Final production-browser captures were visually inspected:

- [Continental candidate on the actual map](../screenshots/worlds-geo-d3a/authoring/continent-preview-context.png), [continent preview](../screenshots/worlds-geo-d3a/authoring/continent-preview.png), [archipelago preview](../screenshots/worlds-geo-d3a/authoring/archipelago-preview.png).
- [Saved generated coast at exact vertex focus](../screenshots/worlds-geo-d3a/authoring/generated-coast-edited.png), [spherical source](../screenshots/worlds-geo-d3a/authoring/spherical-generated-coast.png), [phone preview](../screenshots/worlds-geo-d3a/authoring/phone-preview.png), [phone source](../screenshots/worlds-geo-d3a/authoring/phone-generated-coast.png).
- [Retained V1 generator](../screenshots/worlds-geo-d3a/authoring/serrian-atlas-v1.png), [retained V2 generator](../screenshots/worlds-geo-d3a/authoring/serrian-atlas-v2.png), [Glass Sea candidate edited in D2](../screenshots/worlds-geo-d3a/glass-sea/glass-generated-coast-edited.png).

Planar generation was explicitly aligned with the retained Atlas adapter rather than inferring Earth orientation. Fine edits use local vertex focus so one keyboard step does not jump across a tiny island. A test-harness overlap briefly collided on the owned app port; only its exact owned process was stopped, and the new harness now verifies exclusive port availability and enabled save validation before waiting for responses. Final journeys ran separately to completion. No shared service was restarted.

## Controlled release and recovery

Ready for independent review as a complete D3-A increment; push and deployment require separate owner authorization. No new migration, schema, dependency, environment setting, Docker change or provisioned asset. Existing migrations remain in journal order through 0131. Before any authorized deployment, verify target identity/ledger, protect database/private-asset backups and the running release, build the approved commit and perform owner/ordinary/Admin, generation/retry, D2-edit and export smoke checks through the existing controlled release process. No Production operation was performed here.

A code rollback does not undo saved geography. D2-B-compatible readers can retain/read/edit the generated Polygon sources and their JSON recipes. Preserve those properties, original versions and all post-backup changes; do not flatten data, delete batches or rewrite the migration ledger to match an older checkout. Prefer a compatible forward fix. The new generator never regenerates saved geography automatically, and recipe download is a recovery record rather than an advertised automatic re-import feature.
