# Geo C1 final rendering repair

Approved starting checkpoint: `e12877e7a5252c5dac1c596e1e2d3052979ca52f`. The release SHA and push status are supplied in the completion handoff. The owner subsequently authorized pushing this completed repair. Independent review remains pending; no deployment, shared service restart, Geo C2/C3 or Geo D work is authorized by this pass.

## Confirmed failure and repair

An exact protected disposable clone of the fully populated C1 evidence database reproduced HTTP 413 on **page 388**, after 387 successful pages / 24,677 components / 29,671,461 JSON bytes. The request was whole Earth, manually selected Detailed, equirectangular. This was an application failure. The client also had a 256-page stop and hid previously rendered geometry after any page error.

Two existing 1:10m physical-land parts exceeded the path limit. Their stored overview/regional copies were equally large, so simply changing the stored LOD would not reliably solve the problem.

| Source external ID / part | Original coordinates | Previous path characters | Corrected display characters |
| --- | ---: | ---: | ---: |
| `source-0:components:4-6` / `0`, feature `b6039fda-739e-4b9a-8955-ecce190aba85` | 83,900 | 1,320,197 | 47,379 |
| `source-0:components:1-3` / `0`, feature `fb93262b-9d3f-48e9-b09d-7fe2fdfb0f7c` | 66,476 | 1,041,767 | 37,286 |

`geographic-display.ts` simplifies only the clipped projected presentation, after existing winding, antimeridian and polar handling. Screen-space line simplification retains endpoints; closed rings retain separate components and holes, including a third original vertex for subpixel components. Source point markers keep their exact projected location. The initial display tolerance is 0.35 in the normalized 1000 × 600 view; it increases only when necessary to fit the **64,000-character per-component display budget**. The returned tolerance and visible zoom/resolution notice make this reduction explicit. Unexpected pathological presentations produce a recoverable error. No difficult source is silently dropped.

The service keeps the **64-component / 500,000-path-character response limits**, source preference, stable feature/part pagination and established privacy checks. The repaired full Detailed view delivers every independently counted eligible part. The viewer detects duplicate/nonadvancing cursors, permits the required 533 pages and retains successful pages after a later network/server failure. Errors identify incomplete coverage and offer Retry and whole-surface recovery.

Accumulation never starts from an earlier request. World/map/timeline/ordinary/review and other viewport changes abort or invalidate previous results. Retry clears earlier authorization results, and 401/403/404 or changed source/access stamps clear retained geometry and readers. A real protected revision demonstrated that the ordinary stamp changes and earlier source versions become unavailable to ordinary readers. Administrator review remains read-only. The import panel retains its open state through fresh catalog authorization, preserving existing surface/import workflows.

## Executed acceptance

| Check | Result |
| --- | --- |
| Relevant unit tests, including new bounded display/pagination tests | 91 passed, zero failures/skips |
| TypeScript and changed-file ESLint | Passed |
| C1 geographic/privacy service groups | 12 passed |
| Original Geo A / historical service groups | 12 passed |
| Full populated Earth viewport cases | 6 completed: manual Detailed, Automatic, Canada, Himalayas/Ganges, Fiji/antimeridian, Antarctica |
| Focused optimized-production browser groups | 7 passed, desktop and 390-pixel native touch; no application/React/hydration errors |
| Real protection revision and timeline-switch failure/recovery | 2 passed |
| Legacy desktop/phone browser groups | 15 passed, including Atlas edits, source revisions/readers, import UI, drafts, ordinary aliases, review and required credits |
| Isolated optimized production build | Passed, normal Turbopack with private locked dependencies |
| Original evidence, source inventories and shared DEV preservation | Passed |

The resumed completion check reran all 45 geographic unit tests, TypeScript and ESLint for every changed TypeScript file; all passed. All 1,320 application and package/configuration files match the successful isolated production build. Its only TypeScript configuration difference is Next's two generated include paths for the isolated build directory.

The production desktop and native-touch phone each completed **34,094 drawn components / 13,367 source identities** with all relevant themes enabled. Desktop took **182,567 ms**, phone **183,681 ms**, with progressive useful rendering during loading. Both actual application captures are committed in [the screenshot directory](../screenshots/worlds-geo-c/README.md). Ordinary alias switching was tested on the same mounted workspace through delayed failures, successful retry and author recovery. Changed-map/superseded requests, access rejection, changed-source stamps and an actual alternate-timeline switch were exercised separately. Glass Sea displayed in its original planar frame; fictional planar and authored-angular service fixtures retained their original units and coordinates. Historical regressions read all four existing settlement/territory/connection periods and filtered protected source links.

The [committed measurement receipt](../reports/worlds-geo-c1-rendering-repair.json) gives individual viewport sizes, page counts, tolerances and component inventories. Detailed whole Earth transferred **18,778,751 uncompressed JSON bytes** across 533 bounded service pages; the largest page was 85,551 bytes. Automatic used 42 pages / 1,856,685 JSON bytes / 5,210 ms in the final service measurement. Canada used 50 pages / 2,397,292 bytes / 16,927 ms; its largest required tolerance was 0.7. Regional Himalayas/Ganges took 5,469 ms, Fiji 1,398 ms and Antarctica 3,499 ms. These local measurements include concurrent validation activity and are not production latency guarantees. Desktop browser Resource Timing retained only 250 entries because of its default buffer; that sample is not represented as the full network-request count or complete compressed transfer.

Full Detailed remains a large progressive selection, approximately three minutes locally. Automatic and focused extents are faster. Whole-planet screen outlines cannot show every original vertex; zoom recomputes the projection at the same screen budget, while exact coordinates remain readable. The display is generalized vector geography, without new relief, elevation raster, land cover or inferred history. Very large future selections can reach the explicit 4,096-page recovery boundary; partial authorized coverage remains visible.

## Preservation and test-harness findings

All **12,468 C1 native records** and **2,863 prior Geo B source records** retain exact geometry, attributes and identities. The original fully populated C1 database matches its before snapshot across all **316 public tables**. Every pre-existing record in the test copy was retained; writes added or revised only disposable fixtures/sessions. The original Geo A/Living History evidence database is also exact. Read-only shared DEV comparison found no content changes and allowed only concurrent new authentication sessions. Glass Sea, original map artwork, source manifests, immutable revisions, heads and Living History remain preserved.

No migration, schema, source import, stored LOD/cache rebuild, dependency or privacy-permission change was made. The 130-entry migration ledger through 0129 is unchanged. Prior accepted migration/import/recovery evidence remains valid.

Regression-harness corrections are separate from application defects: an already populated fixture attempted to recreate an overlapping Year 100 appearance; its existing appearance is now reused. A repeated Atlas edit used its already saved description; the test now supplies a fresh description. Synthetic credit pages now deliver an ordered single component with a matching cursor. Resume support preserved completed groups. A supplemental context driver initially encountered a test server that had just shut down; it was rerun with its own owned server. The new context-stamp query initially recalculated its aggregate per regional component; profiling led to explicit once-per-page materialization. Browser acceptance also caught the missing visible notice and catalog-refresh panel closure; both application issues were corrected and affected checks refreshed.

## Changed files and controlled release

- `src/features/worlds/geographic-display.ts` and its tests: bounded derived screen paths.
- `src/features/worlds/geographic-pages.ts` and its tests: strict accumulation and source/access invalidation.
- `src/features/worlds/geographic-service.ts`, `geographic.ts`, `geographic-workspace.tsx`: viewport DTO/stamp, bounded service projection, failure retention, notice and import continuity.
- `scripts/worlds-geo-c-rendering-checks.ts`, `worlds-geo-c-rendering-contexts.ts`, `worlds-geo-a-checks.ts`: focused acceptance and reusable valid fixtures.
- Architecture/report/screenshot documentation and the two actual Detailed PNG captures.

No new configuration or ordered migration is required. Following independent review and separate deployment authorization, use the existing controlled application release process and existing database/configuration; do not reimport Earth or rebuild geographic caches. Deployment has not been performed. Application rollback does not require a database rollback, but reverting to the starting checkpoint restores the known oversized Detailed failure. Prefer a reviewed forward correction if recovery is needed. Source originals remain intact throughout.
