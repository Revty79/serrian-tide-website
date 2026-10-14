# Geo C2 completion and controlled deployment

Approved starting commit: `b5fe27842dcdb6cd9077fa74cc0797e91e9769c4`. Implementation and guarded DEV import were separately owner-authorized. The exact local review commit is supplied in the completion handoff. This pass stops for Ember's independent technical inspection and owner visual acceptance. No remote push, deployment, Production change, shared service restart, Geo C3 or Geo D was performed.

## Delivered behavior and source

The existing Earth now has genuine worldwide elevation and bathymetry with progressive relief underneath its existing vectors. Shaded relief, elevation tint, visibility and opacity are usable independently of vector detail. Owners can save map presentation and record source protection/archive decisions. Source inspection exposes retained revisions, native cell values and registration. Failed tiles retain valid terrain and vector layers, with explicit retry. Current authorization, source protection, retained-version protection, archive, map/surface/timeline context and read-only Administrator review guard both metadata and every image request. Tiles are outside `public`; responses are private/no-store. Context changes discard decoded imagery; focus and 30-second metadata checks invalidate changed source/access stamps.

The [official NOAA ETOPO 2022 model](https://www.ncei.noaa.gov/products/etopo-global-relief-model) and its [user guide](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf) were checked before download. The selected original is [ETOPO 2022 v1 60-second ice-surface GeoTIFF](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif), **465,969,062 bytes**, with calculated SHA-256 **`9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e`**. Its 21,600 by 10,800 Float32 grid covers [-180,-90,180,90], is area registered, and declares EPSG:4326 horizontally and EGM2008/EPSG:3855 heights in metres. All **233,280,000 original cells** were accounted for; no NoData cells occur. Declared NoData is -99999. Native extrema are **-10,752.08203125 / 8,157.3564453125 metres**. This 60-second product is already a provider downsample; its Everest-area maximum is not a claim about the surveyed summit height.

Negative bathymetry and positive heights remain unchanged. EGM2008 approximates mean sea level and is not a local tidal datum. Ice-surface heights are retained without bedrock inference or datum conversion. Source license/citation, original reference, full file checksum, native-value checksum and every derived asset checksum are committed in [the source manifest](../../data/geography/etopo-2022-surface.json).

## Numerical and display architecture

Five additive tables distinguish source identity, immutable versions, current head, immutable asset inventory and map presentation preferences. Versions retain authorship, request identity, original provenance and protection. Map preference changes never rewrite native numbers. Numerical originals remain in durable content-addressed private storage. TIFF blocks are read locally for bounded native samples; original fictional planar and authored-angular Float32 sources were demonstrated with creator-defined bounds, units, zero reference and horizontal metrics.

Controlled CPU preprocessing reads at most 258 original rows at once. Derived factors 2, 4, 8, 20, 40 and 80 use box averages with Float64 accumulation, Float32 output and explicit NoData propagation; partial edge blocks use their actual cell counts. Numerical levels and lossless 256-pixel shaded/tint WebP tiles are separate assets. Northwest light and threefold display slope exaggeration affect imagery only. Periodic longitude halos and clamped polar source edges avoid independent tile seams.

The browser selects no more than 16 tiles, with four concurrent fetches, independently of vector Detailed. It reprojects derived pixels with the same inverse projection as vector paths, including rotation, aspect-ratio padding, antimeridian wrap and Mercator clipping. Side padding does not repeat the planet; Mercator excludes latitudes beyond approximately 85.051129 degrees. Exact source values remain accessible regardless of the display averaging.

## Executed evidence

| Check | Result |
| --- | --- |
| Optimized isolated production build, TypeScript and changed-file ESLint | Passed |
| Geographic/raster/account-lifecycle unit regressions | 63 passed; no failures or skips |
| C2 source/privacy/immutability/fictional/preservation service groups | 9 passed |
| C2 actual production browser groups | 9 passed; no application errors |
| Original Geo A/Atlas/Living History service groups | 12 passed |
| Legacy desktop/touch browser groups | 15 passed; original evidence and cloned rows preserved |
| Actual dateline, Antarctica, Mercator, timeline failure/retry and World switching | Passed |
| Full manual Detailed vector regression | 533 pages, 34,090 components, no duplicates; largest component 47,379 path characters |
| Fresh installation and populated upgrade to 0130 | Passed in owned disposable databases |
| Full populated database and private-asset backup/restore | Exact rows and 11,188 distinct original/numerical/display files verified |
| Interrupted staging and exact retry | Passed without overwriting the original source |
| Guarded DEV import and no-op replay | Passed; all pre-existing rows and non-raster tables preserved |

Native samples were checked against the original file in the Himalayas/Everest region, Andes/Aconcagua, Rocky Mountains, European Alps, Greenland and Antarctic ice surfaces, Mariana Trench, Pacific basin and low Dutch coast. Geometry/attributes of all 12,468 C1 native records remain exact; Geo B, original samples, Glass Sea, editable Atlas artwork and existing historical sources remain intact. A new retained raster authorship FK is classified as an account-deletion blocker; the complete User closure is now 115 FKs.

Two real [application screenshots and their interpretation](../screenshots/worlds-geo-c2/README.md) are committed. [The measurement receipt](../reports/worlds-geo-c2-acceptance.json) records source values, budgets, viewport cases, restoration and DEV identities.

Initial preparation measured about 380 MiB peak RSS; the corrected display-only rebuild peaked at about 426 MiB. Active original/derived assets plus the bundle manifest occupy **1,030,076,598 bytes**, approximately **982 MiB**, with database metadata measured separately in the receipt. Whole Earth used 15 tiles / **523,580 image bytes**, approximately 511 KiB; four focused projection cases stayed below 2 MiB. The desktop complete-view-and-capture workflow measured about 7.5 seconds. The 390-pixel 6x CPU touch workflow, including load, zoom and pan, measured about 14.7 seconds. These are local acceptance measurements, not production latency guarantees. Manual whole-Earth Detailed remains an extreme vector selection and is not the default; the regression completed in approximately 127 seconds locally. C2 does not multiply its vector requests.

## Migration, configuration and deployment order

The owner applied **0130_worlds_numerical_rasters** during development. Its SHA-256 is **`8bc91829319433f520bc540196a64d80fa80a0450bae533f256688d93fe785d2`** and matches the committed file exactly. It was frozen after that notification; no applied migration was rewritten and no subsequent schema change was required. The current ledger has 131 entries. Fresh and populated rehearsals include the complete ordered ledger. Any later database correction requires a new numbered migration.

Runtime requires the existing Node/PostgreSQL application and the newly locked GeoTIFF 3.0.5/Sharp 0.35.3 packages. There is no GPU, paid API or external runtime tile dependency. **`SERRIAN_RASTER_ROOT`** selects a durable private directory; the default is `storage/world-raster` beneath the application working directory. Mount/preserve this directory across releases, keep it outside public web roots, grant the application read access, and back it up with the database. Native source and derived files are not Git artifacts or disposable deployment output. Next file tracing explicitly excludes this runtime volume.

After independent review and separate deployment authorization: verify the release and target identity; back up the target database and asset volume; run only unapplied committed migrations in journal order with `npx drizzle-kit migrate` (0130 after 0129 where pending); install/build the locked release; provision/restore the checksummed asset volume and corresponding metadata together; activate through the existing controlled release procedure; perform authenticated owner, ordinary and Administrator smoke checks. Geographic content transfer to Production remains separately authorized: the DEV import does not populate Production, and source IDs must be generated by the normal import rather than copied as historical IDs. Do not use schema push or reapply an already logged migration.

Preparation/rehearsal recipes and receipts are retained under ignored `artifacts/guidance/geo-c2/`. Reproduce the source with `download-etopo.mjs`, prepare via `prepare-elevation.ts`, and apply `refresh-relief.ts` for the recorded final periodic display recipe. The complete checksummed inventory is committed; verify it before persistent application. `worlds-geo-c2-harness.ts`, `worlds-geo-c2-checks.ts`, browser/legacy/recovery drivers and the separately gated `worlds-geo-c2-apply.ts` document the acceptance path.

## Recovery and remaining scope

Code rollback does not undo 0130, imported source rows or files. An older C1 reader ignores the additive raster tables and keeps the original vector geography, but retain current compatible code for raster changes and account-deletion handling. Prefer a reviewed forward fix. For database recovery, stop writers under separate operator authority, protect intervening changes, restore the verified database backup and matching complete private asset backup into positively identified targets, then reconcile ledger, release and asset hashes. Keep immutable source files/versions; do not delete ledger entries or rewrite published migrations. An interrupted import leaves only safely unreferenced staged files; exact retry verifies existing hashes and completes metadata atomically.

The 60-second source and screen-dependent averages do not provide street/building precision. Hillshade is visual interpretation, not additional numerical evidence. Modern reference terrain does not adjudicate historical landscapes or sovereignty. C3 classified land cover, Geo D/E optimization, 3D/sculpting and later Worlds/VTT integration remain separate. Technical checks pass; independent review, human visual acceptance, push and deployment remain pending authorization/review boundaries.
