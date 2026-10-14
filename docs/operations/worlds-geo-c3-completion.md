# Geo C3 completion and controlled deployment

Starting independently approved checkpoint: `6224fb6beaf71b552d504f7bd49373e8c27d529e`. This report belongs to the local Geo C3 review commit. Its full SHA is supplied with the handoff. Independent technical inspection and owner visual acceptance remain pending; push, deployment, shared-service restart, Production changes and Geo D remain unauthorized.

## Delivered behavior

Changed files cover these focused areas:

- Categorical model/integrity/service: `categorical-raster.ts`, `categorical-original.ts`, `categorical-service.ts`, `categorical-raster.test.ts` and the `/api/worlds/[worldId]/land-cover` route.
- Integrated viewer: `land-cover-workspace.tsx`, `geographic-workspace.tsx`, `geographic.module.css`, plus shared `raster.ts`, `raster-screen.ts`, `raster-storage.ts` and the numerical service's manifest-domain guard.
- Persistence/lifecycle: `world-raster-schema.ts`, additive migration/snapshot 0131, migration journal and the retained-authorship account-plan label.
- Reproducible acquisition/preparation and guarded validation: `fetch-worldcover-overview.mjs`, `prepare-land-cover.ts`, and `worlds-geo-c3-{harness,checks,browser,legacy,numerical-regressions,recovery,linked-browser,apply}.ts`.
- Handoff: frozen WorldCover receipt, Geo C3 architecture/completion documents, shared scientific-theme exception, AGENTS authorization entry and two application screenshots with metadata.

The existing Earth viewer displays actual dated land-cover codes above independently controlled numerical relief and below preserved rivers, lakes, boundaries, cities and labels. Creator controls show/hide classifications, change opacity, save map presentation, read original retained class cells, select immutable revisions, and record protection/archive/restore decisions. Revision accounts are readable in author/Administrator contexts and withheld from ordinary serialization. Ordinary previews and Administrator review cannot save changes.

Privacy remains enforced on every metadata, original-cell and tile request. Both ordinary aliases are equivalent. Current protection also controls retained versions; context changes and failed/superseded requests cannot recover an old protected image or label. Independent failures leave working relief and vectors usable. Planar and authored-angular fixtures demonstrate original references, class names, uncertain classes and NoData without assuming Earth or a terrestrial datum.

## Source and scientific limits

Selected source: **ESA WorldCover 2021 v200 publisher categorical overview, GeoTIFF image 6**, all 2,651 published source tiles. License: **Creative Commons Attribution 4.0 International**, with provider attribution in the application. [Provider access](https://esa-worldcover.org/en/data-access), [product manual](https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/docs/WorldCover_PUM_V2.0.pdf), [license](https://creativecommons.org/licenses/by/4.0/).

The retained grid is 67,440 × 33,720 cells, 562 cells per original 3-degree tile, EPSG:4326 area registration: approximately **594 m north–south**, not native 10 m. Observation period: January–December 2021. The eleven original codes, names, definitions, colours and frozen source checksums are in [the source receipt](../../data/geography/worldcover-land-cover.json); processing and semantics are documented in [the architecture](../architecture/worlds-geo-c3.md).

Publisher overview generation is unspecified in TIFF metadata. Six bounded native-window comparisons matched native majority classes, including two differing from the native centre pixel. This supports the selected overview but does not prove its generating algorithm everywhere. C3's own coarser displays use direct original-cell majority area, with angular latitude-band weights, explicit NoData participation and deterministic ties. Codes are never averaged and modes are never recursively averaged into modes.

Antarctica, north of 82.75°N and other unpublished/NoData cells remain unknown. No ocean, snow, vegetation, species, climate or historical coverage is invented. Mixed approximately 600-metre source cells and larger display cells suppress minority cover; narrow wetlands and small settlements may disappear. No overview confidence layer or independently measured overview accuracy is claimed. Modern classifications remain explicitly dated regardless of the selected World year.

The original 117-GB native archive was not downloaded. Original selected UInt8 values are losslessly retained; the source index freezes provider URLs, edition, image index, spatial registration, object sizes/validators and selected payload/value checksums. ETags are not represented as full native-file SHA-256 hashes.

| Frozen item | SHA-256 |
| --- | --- |
| Provider catalogue | `2a1f0e5e5d41563460a12d8ac35bae77ff7e6dcb7ccd105ac2ea9a966a1445a3` |
| Selected original overview index | `5147450d7e8045d62b31b636cf798ceecddce53a1b3901ad60f286e62bb40416` |
| Original selected values, full row-major grid including NoData | `dd1591a11a3ae29c76d1f9bdaf29f55b19739ea275bb513f83717ca4597ad169` |
| Complete frozen source/display manifest | `5136b690d44f0b049b0832995d610e0ebdc3ec4db7259ada605abbe4e3ba83ea` |

## Executed validation

| Check | Result |
| --- | --- |
| TypeScript | Passed, zero diagnostics |
| Changed-file ESLint | Passed, zero errors or warnings |
| Focused categorical, numerical, geographic/projection, historical-map/connection and account-lifecycle units | **38/38 passed** |
| Populated categorical services | **11 groups passed** |
| Existing geographic/Atlas/Living History services in a separate preserved-evidence clone | **12 groups passed** |
| Combined relief/classification desktop and native-touch browser tests | **15 groups passed**, no page errors |
| Legacy desktop/phone and supplement browsers | **9 + 6 groups passed**, no page errors |
| Final production viewer on recovered hardlink assets | Passed, both images, all 15 categorical tiles and original class read; author account readable, ordinary account null |
| Optimized production build | Passed with locked Node 22 dependencies |
| Fresh installation and populated additive migration | Passed: 132 migrations, 322 public tables |
| Original backup/restore | All populated rows exact; **11,143 original private files** restored exactly |
| Post-C3 backup/restore | All populated rows exact; **60,424 referenced assets** bit-identical |
| Interrupted staging, injected transaction failure and exact import retry | Passed; no partial metadata, no overwritten originals, no-op retry exact |

Representative original source samples include Amazon forest (10), Manaus built-up (50), Sahara bare/sparse (60), European cropland (40), Sudd wetland (90) and grass cover (30), tropical Borneo trees (10), Greenland snow/ice (70) and Antarctic NoData. The first test coordinates accidentally selected Manaus and a grass-covered Sudd cell; these were incorrect harness expectations, not application failures, and became explicit additional source checks. Two other harness guards were corrected: a fixture-derived asset count and SQL/error-wrapper handling in the injected failure test. Completed import/test evidence was reused.

Browser proof covers equirectangular and Mercator, dateline/Fiji, Antarctica, zoom/pan, show/hide/styles/opacity, native heights, failed tiles, failed metadata, retry, superseded requests, timeline/World changes, protected old/current versions, both ordinary aliases, foreign/Player rejection, Administrator read-only access, source readers, original Atlas editing and unsaved-draft navigation. C2's null-source path remains functional. Existing C1 full-planet Detailed rendering evidence is retained; the unchanged cartography renderer was not subjected to an unnecessary 533-page rerun or Phase 9 suite.

## Measured costs and screenshots

Source acquisition used **228,655,104 bytes** of conditional bounded HTTP ranges, rather than native-file downloads. The retained source plus its index uses **58,954,632 bytes**. The complete categorical package is **185,508,991 bytes (176.9 MiB)**, including 49,164 logical source/display assets and its manifest. Preparation peak RSS was **319,762,432 bytes (305 MiB)**; preprocessing is CPU-only.

Loose 4-KiB allocation would waste space on identical small tiles. Verified hardlinks retain every key while sharing identical bytes, in groups of at most 512. Earth requires **18,252 physical files**, including the manifest. Measured NTFS data allocation is **208,961,080 bytes**. Including all recovered raster tables (also C2 and test revisions) and a 31,276,288-byte file/directory metadata allowance gives **262,249,272 bytes (250.1 MiB)**, below 256 MiB. The separate conservative 4-KiB recovery model, including both fictional fixtures, totals **263,076,352 bytes (250.9 MiB)**. Hosting volumes must support hardlinks; a flattened copy or larger allocation units must not silently replace this layout.

Each layer selects at most 16 tiles and uses four concurrent fetches; both layers together can use eight. Full Earth categorical delivery uses **15 tiles / 42,640 bytes**. Initial combined desktop rendering measured **8.4 seconds**, with about 31 MiB JS heap. A separate 390-pixel native-touch check at **6× CPU throttling** rendered both layers in **10.3 seconds**, with no horizontal overflow and bounded private transfers. An earlier phone measurement including zoom/pan and concurrent legacy work took 28.2 seconds; timings are local fixture measurements, not hosting guarantees. Everest's original numerical value remained **8157.3564453125 m**, EGM2008.

Actual final production-application screenshots:

- [Worldwide Earth](../screenshots/worlds-geo-c3/global-land-cover-relief.png)
- [Himalayas / Ganges regional Earth](../screenshots/worlds-geo-c3/regional-land-cover-relief.png)
- [Exact source, projection, extent, legend, resolution and screenshot hashes](../screenshots/worlds-geo-c3/metadata.json)

They use an authenticated ordinary projection of a populated disposable restore, existing C2 shaded relief at 0.85 and classifications at 0.45. Human visual acceptance remains separate.

## Preservation, release and recovery

DEV target is positively restricted to loopback `serrian_tide_dev:5432`, owner Revty79, existing Earth World `981b883d-17a1-4603-b003-1053968e4f6c`, map `dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c`, surface `964f24cd-7a7b-45dd-9d0e-c37fce26149a`, Primary `f364f134-8f75-423b-be5c-bdd9a5da3a41`. Glass Sea, Geo B, all 12,468 C1 sources and original attributes/coordinates, C2 source versions/heads/preferences/assets, Atlas artwork, place identities, Realms and Living History remain preserved. All **115 direct User foreign keys** retain their established classifications: 108 blockers, seven cleanup relationships.

Ordered migration: existing migrations through **0130**, then **0131_worlds_categorical_rasters**. No prior migration or snapshot was rewritten. The new table separates categorical map presentation; existing immutable raster sources/versions/heads/assets are reused. No new User foreign key is introduced. The account preview label now covers numerical and categorical authorship without changing deletion policy.

The guarded import script verifies source/manifest hashes, candidate/build equality, all receipts, exact initial DEV preservation, the complete migration ledger and original private files. A fresh full database backup is taken before mutation. Migration 0131 is applied only after these gates, followed by the frozen original source attachment and exact no-op retry. Detailed receipts and backups remain under ignored `artifacts/guidance/geo-c3/`, including `dev-final-backup.json`, `dev-apply.json`, `asset-backup.json`, `post-import-recovery.json`, service/browser results and build logs. Production was not contacted and shared services were not restarted.

Executed DEV result: source `b88787c5-c09a-478d-aa36-49c6eb10a623`, original version `b5dead3e-f887-4078-8e7f-2731fa553176`; retry returned these exact IDs with `created: false`. The ledger now contains 132 entries. Every pre-existing row and original C2 private file remains exact. Final all-raster table allocation is 23,986,176 bytes; the measured data plus metadata allowance and these tables totals **264,223,544 bytes (252.0 MiB)**. The actual 115-User-FK catalogue also matches the retained plan, accounting for PostgreSQL's 63-byte identifier truncation. No policy or schema defect was introduced by those truncated names.

The final pre-import database backup is `artifacts/guidance/geo-c3/dev-final-1791987631029.dump`; its checksum and the paired 11,143-file private-asset inventory are in `dev-final-backup.json` and `asset-backup.json`. The initial exact restore used the verified pre-C3 populated DEV backup; the later populated post-C3 restore verified all 60,424 referenced assets again. These paths are local evidence, excluded from Git.

For controlled deployment after independent approval: verify the target and paired backup; retain existing C2 assets; apply migrations in order; stage the frozen categorical bundle on a durable hardlink-capable private `SERRIAN_RASTER_ROOT`; verify every asset/checksum and allocated budget; deploy the approved application build; verify author, ordinary aliases and Administrator review. Provider credentials, GPU rendering and runtime remote-map subscriptions are unnecessary. The source bundle is not included in Next.js output or Git and must be supplied with the private volume. Geo D is not required for this pass to function.

Code rollback leaves additive tables and retained source records intact. An exact rollback/recovery restores the paired verified database and hardlink-aware private-volume backup; verified restaging reconstructs the linked layout without changing any asset bytes. Do not delete or reimport Earth, Glass Sea or immutable originals. Failed staging leaves only an unreferenced verified bundle; retry verifies existing bytes and completes it. A metadata failure rolls back atomically. Keep the backup until controlled deployment and owner acceptance are complete.
