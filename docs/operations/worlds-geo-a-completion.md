# Geo A completion and deployment readiness

Starting commit: `8bfb381b97b84d9fa85f8563a4cabf673bf73991`, initially clean and synchronized with origin/main. Release identity: the local commit containing this report; the full resulting SHA is supplied in the delivery response and `artifacts/guidance/geo-a/completion-receipt.json`. Stop for Ember's independent technical review and the owner's visual acceptance. No remote push/sync, deployment, Production access, shared-service restart, extraction or Geo B work was performed.

## Delivered architecture and experience

The [architecture inspection and decision record](../architecture/worlds-geographic-engine.md) records the existing 2000 x 1200 Atlas model and bounded feature/vertex/draft limits before implementation. Those formats, the original cartography renderer, World/map/place identities, settlements, political overlays, map appearances, historical connections, exact retained sources and Calendar/Chronology remain intact.

Seven additive tables distinguish a World-owned coordinate surface, an existing Atlas map's view association, an immutable import manifest, geographic feature identity, immutable authoritative versions, current heads and independently replaceable spatial caches. Imported features reference the existing `world_geography` registry. Realm references use the existing same-World lore registry and selected timeline. Administrative outlines do not create polities or declare historical control.

Owners open **Atlas → Geographic sources** to create coordinate surfaces, prepare/import the real or fictional sample, upload bounded source bundles, inspect provenance, pan/zoom, change projections/detail, inspect existing saved places, read original revisions, author a validated JSON geometry revision, and archive/restore sources. Failed saves retain drafts; acknowledged saves with failed readback have a separate recovery action. Shared navigation preserves unsaved changes. Progressive viewport pages retain all dataset attribution credits.

Supported now: EPSG:4326 WGS 84 or original authored angular coordinates; bounded original planar coordinates/units; points, lines, multipart lines, polygons with holes, disconnected multipolygons; antimeridian-aware spatial bounds and crossing viewports; spherical geodesic display; equirectangular, Mercator and planar presentation; source precision, immutable revisions, optimistic conflicts, deterministic import/request retries, native PostgreSQL GiST box indexing, validated LOD with fallback and cursor paging. Projection changes never save pixel positions into authoritative geometry.

Explicit limits: 32 records/8 MB per atomic import; 32,768 coordinates per feature; 8,192 coordinates per ring; up to 256 components; 64 intersecting components and 500,000 SVG path characters per viewport page. Mercator clips near 85.05 degrees. Pole-encircling rings are rejected by the current adapter. Source revision selection includes the latest 100, the original and a directly requested retained version. This is a source-coordinate workshop with JSON editing, not the later professional vertex/artwork studio.

Cylindrical, hollow, ring, connected polyhedral/custom surfaces and triangular/nonrectangular domain masks require future versioned reference adapters. Ellipsoidal distance/area measurement, cross-surface coordinate conversion, full global/high-resolution ingestion, dated geographic-source heads, historical Earth reconstruction and planetary 3D rendering are not implemented. New spatial sources are explicitly shared baseline references; selecting a historical year does not invent dated coverage. Realm-coordinate sources are author/explicit-review-only in Geo A, because older ordinary readers do not all carry an exact Realm context.

## Real source and original World

Natural Earth **Admin 0 Countries 1:110m, edition 5.1.1**, EPSG:4326, from the [official download](https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip). The [provider's terms](https://www.naturalearthdata.com/about/terms-of-use/) specify public domain; attribution is optional, and the workshop displays “Made with Natural Earth.” These are overview administrative source interpretations, not historical claims or a global Earth completion.

| Source | Natural Earth identity | Coordinates | Geometry |
| --- | --- | ---: | --- |
| Fiji | 1159320625 | 22 | Three polygon components around the antimeridian |
| New Zealand | 1159321135 | 66 | Two disconnected polygon components |
| South Africa | 1159321431 | 94 | Polygon with the enclosed Lesotho hole |

Original ZIP: 214,976 bytes; SHA-256 `0f243aeac8ac6cf26f0417285b0bd33ac47f1b5bdb719fd3e0df37d03ea37110`.

Committed JSON sample: 17,987 bytes; SHA-256 `db9bcbd2796496d8449b8fada91e1fa5e175acb848e10e8d013b7315ead5ab4b`. The reproducible converter selects ADM0_A3 FJI/NZL/ZAF, verifies edition/CRS, preserves source coordinates and decoded attributes, and removes trailing DBF NUL/space text padding. The raw downloaded archive is retained separately under ignored artifacts. Manifests save edition, original URL/CRS, license/credit, file integrity, import parameters/date, canonical content checksum and associated identities. Upload manifests record the creator-supplied integrity statement; they do not independently authenticate an arbitrary remote file.

The **Glass Sea** is wholly original project-authored content: a bounded planar island with an enclosed void, two Copper Isles and a channel. It reuses an authored Map Maker polygon and its stable saved place identity, while the new source representation supports holes, multipart geometry and a retained authored revision through the same services/viewer as Earth. No Earth radius, country list, simulated event, settlement runtime or VTT dependency enters the universal engine.

## Dependencies

Pinned `d3-geo 3.1.1` provides server-side clipping/projection (ISC, retaining its MIT GeographicLib notice); d3-array/internmap are its runtime dependencies. Their combined installed files measure 401,265 bytes. This is installed package size, not a client bundle claim; the viewer imports no d3 runtime and receives derived SVG paths. `@types/d3-geo 3.1.1` and BSD-3-Clause `shapefile 0.6.6` are development-only. The older converter's text-encoding dependency is confined to preparation. The decision record evaluates MIT Proj4js and Turf and defers them. No PostGIS, GPU, paid service or additional data provider is required. Future providers require independent license verification.

## Migrations, DEV application and recovery

Apply existing committed migrations in journal order through `0127`, then:

1. `0128_worlds_geographic_sources`: seven new tables, same-World composite foreign keys, retry keys, immutable-source guards and spatial index. Normalized SQL SHA-256 `04aed0fe1d12fed415981e63d4a35b546bde61b529e3e62ec8c3eba0275674c8`.
2. `0129_worlds_atlas_restore_context`: fixed lookup context for ten existing validators, preserving their bodies and permission/validation decisions. Normalized SQL SHA-256 `73b1296796bec7e9d2a05baec5ca2100862b3212b2129c01fab4301a01f16377`.

Fresh full installation, populated 0127 upgrade and migration no-op passed with 130 ledger entries. All 128 earlier migrations and every row in the completed evidence database's 105 World tables were preserved. `0128` was also frozen after its first DEV application; the observed restore defect was corrected with a new migration.

DEV was positively verified as `serrian_tide_dev`, loopback port 5432; the selected owner is verified as Revty79 with G.O.D./Administrator roles. No Production target was connected. Before the initial write, a 2,629,587-byte custom backup was listed and restored into a disposable database, and all 309 pre-existing public tables matched. Original backup SHA-256: `e0e0d8375c7cefecb41a0a7c784e4c27e3953ab72152f7bbbe316ca9dd182dd4`.

Two scoped DEV Worlds are saved:

| World | World ID | Source map ID |
| --- | --- | --- |
| Earth — Geo A geographic sample | 981b883d-17a1-4603-b003-1053968e4f6c | dd7cdb89-e5c1-4553-a8d1-0934f36f6c8c |
| Glass Sea — Geo A original World | df7be692-6307-4921-a6eb-dfe6ef79290e | 8c775bc6-da4a-4761-9649-452d3f4834bc |

DEV now has both migrations and 130 ledger entries. The final import replay reused the same identities and created no additional Worlds. All previously existing rows across the resulting 316 public tables and all prior migration rows were unchanged. The final read-only backup verification used a 2,672,460-byte backup, SHA-256 `8e44cde13c0a5290d4e69be9b816d289ba0208b3be08cd71d7a7bbd39bc9c838`; it restored normally without the earlier bootstrap and passed an additional standard pg_dump/pg_restore round trip. Backups, exact IDs/request keys and detailed receipts remain locally under `artifacts/guidance/geo-a/dev/`; no database dump is committed.

The genuine pre-existing restore defect is documented in the architecture record. Recovery of a pre-0129 map-bearing backup requires the staged, rehearsed function-context correction before its data section. Post-0129 backups restore normally. No CHECK constraint, foreign key or immutable-source guard was suppressed.

For a future authorized production release: verify exact code/target/ledger and protect a verified backup; install locked dependencies; apply ordered migrations before code activation; build and perform authenticated owner/ordinary/review smoke checks. No new configuration is required. DEV sample creation is a separate scoped operation, not an automatic Production migration or DEV-to-Production promotion.

A code revert does not remove geographic data or reverse either migration. Pre-Geo A readers lack the new protected-place filtering; preserve that filtering or keep ordinary viewing unavailable during such recovery. Prefer a reviewed forward fix. Any backup restoration must preserve/reconcile post-backup changes and requires separate target authorization; do not drop source tables or migration ledger rows to simulate rollback.

## Executed validation and performance

- **52/52 focused unit checks**, including 15 new geographic checks, across geometry/reference/projection, Atlas/navigation, historical map states, territory holes, linking and History. The comprehensive Phase 9 suite was not run.
- **12 service regression groups**, plus the 512-source progressive benchmark: original source retention, concurrent retries, duplicate/bad/forged references, atomic rollback after earlier staged records, optimistic saves, source archive/restore, database immutability/cross-World constraints, mutable derived caches, privacy/roles, old lore/History/milestone paths, protected historical selections, four-period settlements/territories/connections, and valid/invalid validators under an empty restore path.
- **15 production-browser groups**: nine core, five supplements and one attribution-pagination regression. Real-data/fictional viewing, actual surface/import controls, authored Natural Earth revision with original retained, failed save/read recovery, both ordinary aliases, delayed/failed knowledge transitions, author recovery, keyboard/help/draft protection, actual legacy Atlas save with artwork intact, Administrator read-only view and phone/native-touch use passed. No uncaught application page errors or detected React prop/hydration failures remain.
- TypeScript, changed-file ESLint, Next route type generation, Drizzle check and `git diff --check` passed. The final optimized production build passed on an isolated task server/database; all task servers/clusters were stopped. Shared servers were not restarted.

| Original imported feature | Stored geometry bytes | Stored decoded attributes | Cached display geometries |
| --- | ---: | ---: | ---: |
| Fiji | 564 | 1,639 | 3,080 |
| New Zealand | 1,747 | 1,843 | 4,709 |
| South Africa | 2,438 | 1,991 | 5,896 |

These are PostgreSQL column-size measurements of original DEV source versions, not whole-row/index overhead. Cache measurements include stored overview/regional/detail parts. The 512-point benchmark returned eight unique 64-component pages; a 4 x 4 local extent returned one feature, used the bounding-box GiST index, and needed seven SQL statements including transaction setup/commit. Its viewport was 926 bytes. The ordinary three-country viewport was 3,979 JSON bytes; the recorded 20-call server/query/projection sample was 6.06-19.95 ms per request. Timings are local measurements, not a hosting SLA.

Desktop initial view measured about 902 ms; geographic catalog/view transfers were 1,390 and 4,279 bytes including HTTP timing overhead. Recorded JS heap rose from approximately 27.1 to 35.4 MB across that navigation; server heap measurements were sampled without forced GC and are not steady-state guarantees. The 390 x 844 native-touch browser with 6x CPU throttling measured about 3.49 seconds through load/source focus and no horizontal document overflow. This is weaker-device emulation, not physical handset or owner visual acceptance.

Evidence: `migration-results.json`, `service-results.json`, `preservation-results.json`, `performance-results.json`, `progressive-results.json`, `browser-results.json`, `supplement-browser-results.json`, `license-browser-results.json`, desktop/mobile performance receipts, production log and screenshots under `artifacts/guidance/geo-a/`. Ordinary detailed New Zealand/South Africa, fictional planar, desktop Fiji and phone Fiji screenshots are available for review.

Harness-only failures were corrected separately: Windows inherited PostgreSQL output pipes, collation-dependent digest ordering, text/UUID comparison in preservation queries, parent-view remount assumptions, late response listeners and selecting a country outside a local viewport. The Atlas restore failure was an application persistence defect and received migration 0129. There are no remaining failing executed checks.

## Changed files and next boundary

New engine/UI: `src/db/world-geographic-schema.ts`; `src/features/worlds/geographic.ts`, `geographic-geometry.ts`, `geographic-projection.ts`, `geographic-privacy.ts`, `geographic-samples.ts`, `geographic-service.ts`, `geographic-workspace.tsx`, `geographic.module.css`, `geographic.test.ts`; `src/app/api/worlds/[worldId]/geography/route.ts`.

Integration/privacy: `atlas-service.ts`, `atlas-workspace.tsx`, `map-state-service.ts`, `history-index-service.ts`, `linking-service.ts`, `milestone-service.ts`, `ordinary-knowledge.ts`, `ordinary-source-graph.ts`, `peoples-geography-service.ts` in `src/features/worlds/`.

Content/tooling/documentation: `data/geography/natural-earth-110m-sample.json`; `scripts/prepare-natural-earth-sample.mjs`, `worlds-geo-a.test.ts`, `worlds-geo-a-checks.ts`, `worlds-geo-a-dev.ts`; both new SQL migrations/snapshots and appended journal; `drizzle.config.ts`, scoped LF checksum rules in `.gitattributes`, locked package files, `AGENTS.md`, the architecture record and this report.

The increment is functional independently of Geo B. Remaining acceptance is Ember's independent technical review and the owner's visual approval; no push/deployment is authorized. **Geo B's exact next scope is accurate global modern Earth coastlines, countries and islands**, with reviewed free source editions/licenses, stable geographic identities, deterministic partitioned imports, source preservation, spatial/LOD delivery, privacy and measured scale. Geo C physical geography, Geo D detailed subdivisions/navigation, Geo E integration/performance/privacy, Phases 7-9, extraction, Advanced Map Studio and Historical Earth remain later separately authorized work.
