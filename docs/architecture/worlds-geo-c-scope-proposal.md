# Geo C scope assessment and proposed subpasses

Status: owner approved the C1/C2/C3 division and authorized C1 first, with a local review commit and no push. C2 and C3 remain separate subsequent work. The complete Geo C brief is authorized, following technically approved `1a3793877094eed31d0fdf53004ad5fdbc608b3a`. Section 13 asks for approval before dividing an oversized Geo C into subpasses. This proposal retains every required content family; it does not declare vectors alone to be completed Geo C.

## Verified starting state

The initial checkout was clean at the approved SHA and synchronized with its local `origin/main` reference. Geo A/B architecture, source manifests, import/recovery tooling, immutable source/version/head model, spatial caching, ordinary/review filtering and current Atlas integration were inspected. Existing test evidence and committed Geo B screenshots remain intact.

Read-only inspection positively identified loopback `serrian_tide_dev:5432`, Earth World `981b883d-17a1-4603-b003-1053968e4f6c`, map `dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c`, surface `964f24cd-7a7b-45dd-9d0e-c37fce26149a` and Primary timeline `f364f134-8f75-423b-be5c-bdd9a5da3a41`. The original sample identities/provenance and Glass Sea are present. All 130 ledger entries match committed migrations through 0129. The complete Geo B source inventory still matches: 2,863 saved records and 258 country/territory identities, with all expected source components and coordinates preserved.

Current total DEV database size: **172,103,359 bytes**. Geographic tables plus shared places: **128,933,888 bytes**, approximately **123 MiB**, matching Geo B. Geo B's retained measurements are 879,220 JSON bytes over 15 global pages, 626 ms service delivery, approximately 1.15 seconds desktop load and 3.37 seconds touch-phone load under 6× CPU throttling. These browser timings are existing Geo B evidence, not newly executed Geo C benchmarks.

At this starting inspection, only inspection and source metadata requests had run. Application code, schemas, migrations and DEV content were unchanged. No large geographic grid had been downloaded. Private inspection receipts are under ignored `artifacts/guidance/geo-c/`; subsequent C1 implementation and validation are recorded in its completion report.

## Why divide the work

The existing universal vector model already supports the geometries needed for rivers, lakes, physical regions, peaks and cities. It needs bounded thematic selection, source classification and readable labels, rather than replacement cartography.

Elevation introduces the first numerical raster source model. The current seven-table source system stores supported vector geometry, not grid values, vertical references or authenticated imagery tiles. Elevation requires separately retained numerical data, derived imagery, progressive delivery, version/protection checks and backup/restore proof for the new data types.

Land cover adds categorical data, a class legend and a separate generalization policy. It must retain the meaning of forest, cropland, bare/sparse ground, wetlands and other classes; interpolating numeric class codes or presenting climate as land cover would be incorrect. Native ESA WorldCover ingestion would exceed the intended hosting budget.

These are three distinct persistence, source-accuracy and rendering acceptance units. Dividing them gives each a complete working checkpoint and keeps an unvalidated raster pipeline out of the vector release. Each subpass will work without a later subpass. Geo C as a whole remains incomplete until all three are delivered and reviewed.

## C1 — Worldwide physical vectors and major cities

Deliver worldwide rivers/important tributaries, lakes/reservoirs/inland waters, mountain/landscape regions, prominent peaks, marine names and major populated places into the existing Earth. Keep each theme independently selectable. Reuse bounded immutable imports, existing source geometry, World places, ownership, retained readers, surfaces and geographic projections.

Candidate [Natural Earth physical vectors](https://www.naturalearthdata.com/downloads/10m-physical-vectors/) and [physical labels](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-physical-labels/) provide the initial foundation. [Populated places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) provide source locations, names, available aliases, classifications and provider ranks. Current public source headers for the seven detailed archives total **10,546,989 bytes**:

| Source stem | Download bytes from HEAD |
| --- | ---: |
| `ne_10m_rivers_lake_centerlines` | 2,079,507 |
| `ne_10m_lakes` | 2,349,685 |
| `ne_10m_geography_regions_polys` | 2,038,519 |
| `ne_10m_geography_regions_points` | 87,372 |
| `ne_10m_geography_regions_elevation_points` | 240,144 |
| `ne_10m_geography_marine_polys` | 940,563 |
| `ne_10m_populated_places` | 2,811,199 |

These are transfer metadata, not downloaded-file checksums or accepted editions. Pin each downloaded VERSION file and SHA-256 before importing. Retain [Natural Earth's public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/) and visible credit. Evaluate coarser river/lake representations and source ranks for the global viewport; importing detailed source data does not require displaying it all at once.

Extend generic source presentation/classification descriptors so fictional rivers, lakes, regions and settlements can use them on planar and authored angular surfaces. Preserve the existing location identity model; a modern city source does not create a gameplay settlement, Shop, NPC or historical control record.

Use bounded ranked labels with collision avoidance and keyboard/source-reader access. Labels come from saved readable identities and source locations. Peaks' recorded elevations remain distinct from an eventual gridded elevation model. Natural Earth's physical-region polygons are approximate thematic extents, not survey boundaries. Cities retain source estimates as provider attributes; do not invent populations, founding dates or allegiances.

Country/context relationships require explicit matching evidence, including unambiguous source identifiers and any appropriate geometric validation. Uncertain or disputed relationships remain explicit source accounts. Never infer them from nearest neighbours or names alone. [GeoNames](https://www.geonames.org/export/) is evaluated as an attribution-required supplemental naming source, with bulk expansion deferred to the more detailed naming/navigation work unless a specific verified gap warrants inclusion.

C1 completion: existing Earth has usable physical vector themes and cities, two real global/regional screenshots, focused source/fictional/privacy regressions, backup/rehearsal/import/retry evidence, measured budgets and a clean local commit. Elevation shading and classified land cover are explicitly outstanding C2/C3 work; no inactive controls will advertise them.

## C2 — Global numerical elevation and relief

Use [NOAA ETOPO 2022](https://www.ncei.noaa.gov/products/etopo-global-relief-model), initially the **v1 60-arc-second ice-surface GeoTIFF**. Its current download header is **465,969,062 bytes**. NOAA supplies coarser global grids derived from the 15-arc-second dataset; 60 seconds is a practical initial regional/planetary foundation, not terrain suitable for street or building detail.

The [NOAA user guide](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/docs/1.2%20ETOPO%202022%20User%20Guide.pdf) specifies EPSG:4326 horizontally and heights in metres relative to the EGM2008 geoid. Preserve those references, float values, native grid registration, nodata policy, edition, download checksum and required citation. The surface version represents ice-sheet tops; do not claim it reveals Antarctic/Greenland sub-ice bedrock.

Introduce a universal retained raster source/version model with bounded numerical chunks and independently derived display tiles. Authenticate tiles and metadata through World/map/surface/timeline and ordinary/review context. Protected data must never be exposed through an unguarded public asset directory or a stale browser image. Preserve source versions and current protection during retry, archive and exact-source reading. Update account-deletion plans if new direct User foreign keys are introduced.

Prepare relief and detail levels once during ingestion on CPU. Keep negative bathymetry, shelves, lowlands and high terrain source-backed; any display aggregation must be documented. Serve bounded imagery, not native global arrays. Reproject imagery consistently with vectors, including antimeridian and polar handling. Relief remains beneath readable water, administrative and city layers. Numerical values remain separate from visual hillshade.

Prove the raster model using a small original planar and/or authored-angular fixture with non-Earth bounds and explicit elevation units. No Earth radius, country list, climate convention or vertical datum belongs in generic services.

C2 completion: usable global relief plus progressively finer regional viewing, source inspection/legend, unchanged C1/B content, authenticated privacy and recovery proof, screenshots and a clean local commit. Full 3D/sculpting remains Advanced Map Studio work.

## C3 — Classified land-cover overview

Complete the brief's land-cover requirement with a genuine categorical overview and documented regional limits. [ESA WorldCover](https://esa-worldcover.org/en/data-access) is evaluated: 2021 v200 offers 11 land-cover classes under CC BY 4.0, but its 2,651 native map tiles total approximately **117 GB**. Do not import that entire archive or substitute satellite RGB imagery for classification data.

Prefer an appropriately licensed, manageable provider-supplied overview or a validated generalized categorical representation. [Copernicus global land cover 2015–2019 collection 3](https://land.copernicus.eu/en/products/global-dynamic-land-cover/copernicus-global-land-service-land-cover-100m-collection-3-epoch-2015-2019-globe) is another candidate requiring exact source/edition/license and transfer-size verification before selection. Its catalogue/download access has not yet been accepted; current Zenodo metadata access returned HTTP 403/429. That is an external catalogue-access limitation, not an application failure.

Retain class codes/definitions, source dates, original checksums, attribution and the precise generalization method. Use categorical aggregation/selection; never average class codes into invented classes. Distinguish tree cover, grassland, cultivated ground, bare/sparse ground, wetlands, built areas, water and snow/ice according to the chosen provider. A bare-ground class is not automatically a climatic desert, and vegetation is not a weather model.

Reuse C2's universal raster/source/asset guards where appropriate, with a separate categorical schema and accessible legend. Preserve independent theme selection and ordering with terrain and vector overlays. A sound worldwide overview fulfills this subpass; finer regional classes remain an explicit limitation, as the brief permits. Exact worldwide 10-metre precision is not a completion claim.

C3 completion: functioning classified worldwide overview, combined physical Earth screenshots, documented resolution/limitations, privacy/recovery/performance evidence and a clean local commit. This completes the intended Geo C foundation; Geo D remains subdivisions and connected map navigation.

## Proposed operational budgets

These are acceptance targets to verify during preparation and rehearsal, not measured Geo C results. If they require a materially reduced coverage or increased operating budget, report that before persistent ingestion.

| Area | Target |
| --- | --- |
| C1 additional database storage | At most 256 MiB initially, measured with source versions and indexes |
| C2 authoritative raster plus display storage | At most 1 GiB initially; immutable numerical data separated from derived tiles |
| C3 deployed overview plus display storage | At most 256 MiB initially; native regional archive excluded |
| Total initial geographic runtime storage | Approximately 1.6 GiB ceiling including existing B data |
| Vector response | Preserve at most 64 components and 500,000 path characters per request |
| Raster delivery | 256-pixel tiles, at most 16 concurrent/present viewport tiles and 2 MiB tile-transfer target per viewport |
| Initial combined view | Target at most 3 MiB geographic transfer; progressively load richer detail |
| Global labels | Target at most 60 readable non-overlapping labels, fewer on phone |
| Preprocessing working memory | Stream/partition source data; target at most 512 MiB rather than whole native grids |
| Measured browser acceptance | Desktop plus 390-pixel native-touch emulation at 6× CPU throttling, no horizontal overflow; report actual load/heap/transfer |

Raw input archives are preparation/recovery material, not payloads inside Atlas map JSON or permanently hosted third-party tiles. Runtime requires neither a dedicated GPU nor paid map APIs. No remote tiles are a permanent runtime dependency. UI controls/legends follow shared appearance roles and plain-language field guidance; scientific data representation must retain its meaning.

## Preservation and completion gates

Before each persistent DEV increment: positively verify the target/current identities and ledger; protect a fresh full backup; restore and rehearse in an owned disposable cluster; freeze source/plan checksums; test interruptions, failures and exact retries; recheck the current DEV baseline before applying. Preserve all pre-existing rows, authored heads, country/coastline sources, Glass Sea and historical sources. Any migrations are new numbered additive files after the actual current journal; never rewrite 0128/0129 or other applied migrations.

Each completed subpass includes TypeScript, lint, relevant units/services, affected A/B/Phase 6 regressions, authenticated desktop/phone checks, production build, real application screenshots in `docs/screenshots/worlds-geo-c/`, coverage/performance receipts and release/recovery notes. Keep test-harness, provider-access and application failures distinct. Phase 9 remains separate.

Proposed review boundary: implement C1 after approval of this division, create its complete local review commit and stop for Ember/owner review. Begin C2/C3 only under the owner's subsequent direction. All three remain part of the complete Geo C mission. No push, deployment, shared-service restart, Production change or Geo D work is authorized by this proposal.
