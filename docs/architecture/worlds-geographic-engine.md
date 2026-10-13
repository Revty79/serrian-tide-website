# Geo A: universal geographic sources

Approved starting commit: `8bfb381b97b84d9fa85f8563a4cabf673bf73991`, inspected with a clean checkout. Geo A is separately authorized; Geo B, push/sync, Production, deployment and extraction are not. The revised roadmap is Geo A-E before Phases 7-9, then independent Worlds development for Advanced Map Studio and Comprehensive Historical Earth.

## Inspection and compatible extension

Atlas-v1 stores editable drawing positions on a fixed 2000 x 1200 canvas, rounded to two decimal places. Its semantic features are points or single polygons (128 features, 256 vertices per polygon, 8,192 vertices per draft); decorative drawings have separate bounded limits. Twelve-megabyte map requests also contain settlements/interiors/dungeons and complete historical snapshots. These remain useful authoring formats, not geographic source storage. Full-resolution global outlines, holes, disconnected islands and geodetic coordinates exceed these conventions.

Reuse World ownership, shared `world_geography` identities/ancestry, existing `world_atlas_map` identities, Realm lore and explicit links, Map Maker/settlement tools, generation recipes, undo/redo and archive rules. Preserve map states, political overlays, temporal connections, original History/Calendar sources and exact branch pins. Do not rewrite old geometry or turn an imported administrative border into a physical coastline or a historical political claim. Geographic representations link to existing maps and places; they are an additional source layer, not replacement cartography.

## Spatial model and supported adapters

A World owns independent **surfaces**; a surface declares its immutable coordinate reference, domain and topology. A map presents a surface through a display projection. A Realm is an existing narrative identity that may own a separate spatial context and connect through explicit existing Realm/map links. Crossing contexts is navigation, not an invented coordinate conversion.

Geo A implements spherical longitude/latitude sources (explicit EPSG:4326 for WGS 84 data, or an authored angular reference) and bounded planar sources with author-named coordinates/units. Longitude wraps, polar coordinates are validated, crossing extents split at the antimeridian, and source coordinates are never replaced by pixel positions. Planar domains do not wrap. Geographic edges use spherical great-circle presentation, not ellipsoidal distance/area calculations. Pole-encircling polygon rings are explicitly rejected by the current source adapter; use a later polar/domain adapter for those outlines. Hemisphere viewports and polar clipping are display extents, not territorial classifications. Equirectangular and Mercator are display adapters; Mercator has a stated polar limit and neither projection preserves every distance/area. A planar affine adapter supports original non-Earth sources.

The surface/reference boundary is independent of Earth names, radius or country lists. Cylindrical, hollow/interior-facing, ring and connected polyhedral/custom surfaces require later adapters describing orientation, seams, faces and adjacency. They are explicitly unsupported in Geo A; no controls promise otherwise. New adapters extend the versioned reference descriptor rather than reassigning World, map or place identities. Triangular/nonrectangular planar domain masks likewise require explicit later boundary validation.

## Geometry and delivery

Authoritative GeoJSON-like points, polylines, polygons with holes and multipolygons are validated in source space, versioned per feature and retained after edits. Original dataset properties and import manifests are immutable. Representations carry semantic kind (`administrative-boundary`, `physical-geography` or `authored-geography`) separate from historical politics and decorative artwork.

An additive migration after 0127 introduces seven tables: surface, existing-map view association, dataset/import, feature, immutable version, current head and derived spatial-part records. Composite foreign keys enforce same-World surface/map/place relationships. Request/import keys make retries deterministic; all records in one bounded import commit atomically under the existing owner World lock. Authored edits use optimistic revision checks and new immutable versions, including archive/restore. Failed writes leave prior heads intact.

Each multipart source has independently indexed bounding parts and separate overview/regional/detail representations. Native PostgreSQL bounding-box GiST queries need no PostGIS, GPU or paid service. Viewport requests are bounded and paginated; exact source geometry is fetched only for a deliberately selected feature/version. The browser does not request every full-resolution source in a World. Simplification preserves holes/components and falls back to source geometry if validation would change topology. Large imports use deterministic bounded batches; Geo A is not a global high-resolution importer.

The transformation pipeline is authoritative source -> validated component bounds/LOD -> requested spatial extent -> projection/clipping -> bounded SVG presentation. Reprojection and pan/zoom do not save or alter source coordinates. Display geometry is disposable derived data, with a separately versioned cache algorithm and replaceable rows; historical source consumers must pin exact authoritative versions. Each atomic import accepts 1-32 records and up to 8 MB; one feature allows 32,768 coordinates, up to 256 components and rings of at most 8,192 coordinates. Viewports return at most 64 intersecting components and 500,000 SVG path characters, with cursor pagination. These limits preserve the original Atlas limits; later high-resolution adapters must partition source delivery deliberately.

Geo A spatial sources are shared baseline references, not dated Earth reconstructions or new alternate historical heads.

## Dependency decision before implementation

| Candidate | License and tradeoff | Decision |
| --- | --- | --- |
| [d3-geo](https://github.com/d3/d3-geo) | ISC, with retained MIT GeographicLib notice; established spherical clipping/projection implementation and one d3-array dependency. | Use the focused package on the server for derived SVG paths; no d3 visualization framework or client dependency required. Measure installed size and browser/build impact. |
| [Proj4js](https://github.com/proj4js/proj4js) | MIT; useful for future CRS reprojection, additional definitions and datum policy needed. | Defer arbitrary CRS transformations. Geo A validates explicitly supported references rather than guessing conversions. |
| [Turf](https://github.com/Turfjs/turf) | MIT; broad geospatial operations, full bundle unnecessary; simplification does not guarantee topology. | Do not install the full toolkit. Use bounded source validation and conservative derived simplification with fallback. |
| [shapefile](https://github.com/mbostock/shapefile) | BSD-3-Clause; mature but older converter/transitive dependencies. | Development-only reproducible Natural Earth preparation; no runtime or browser exposure. Pin version and verify converted sample/checksums. |

## Provenance and first content

Natural Earth is the first content adapter, separate from universal services. Its [terms](https://www.naturalearthdata.com/about/terms-of-use/) place vector/raster data in the public domain; attribution is optional, but retain provider/license/source URLs and display credit. Use a small 1:110m sample from the official Admin 0 Countries 5.1.1 distribution: multipart islands/antimeridian geometry and a polygon with a hole. These are administrative source interpretations, not automatically endorsed polity claims. Preserve the download checksum, edition, original CRS, exact source feature/properties, extraction parameters and imported identities. Commit only the small text sample, not the complete archive or artwork.

An original bounded planar fictional sample uses the same import/version/query/view pathway and existing Atlas identities. Authoring supports a deliberate validated source-geometry revision while retaining the original. A professional geographic vertex editor and full procedural fantasy generator are later work.

Future manifests accommodate provider, dataset/edition, source URL, checksum, original CRS, license URL/text and attribution obligations. Geo B-E must independently verify each selected geoBoundaries, GeoNames, NOAA, HydroSHEDS, ESA, NASA or OpenStreetMap dataset's current terms. No other dataset is downloaded or licensed by this pass.

## Privacy, testing and DEV boundaries

Reuse owner access and read-only ordinary/review request handling. Filter geometric sources and names before serialization; current and exact-version protection both apply. Validate selected World/timeline/map/Realm context, source ownership, duplicate IDs, geometry validity and conflicting retries. Realm-coordinate places remain author/explicit-review-only in Geo A, because older ordinary readers do not all carry an exact Realm context; supported author views validate Realm membership in the selected timeline. Shared baseline map names remain separate from private surface metadata. Extend the shared protected-place filtering where new protected source identities can otherwise leak through existing Atlas/lore/History routes. Superseded/loading/failed viewer responses cannot display old-context metadata; draft changes require confirmation before navigation.

First rehearse migration, imports, concurrency, failure recovery and existing-data preservation in fresh/populated disposable PostgreSQL. Retain valid Phase 6 evidence and execute only affected regression suites. Measure stored bytes, bounded queries/payloads, initial viewport, projection/render time and desktop/phone interaction; distinguish emulation from hardware acceptance.

Persistent sample application is authorized only to positively identified `serrian_tide_dev`, after exact ledger verification, verified backup and disposable rehearsal. Snapshot and preserve unrelated DEV records. No schema push, shared-service restart, Production connection, wholesale restore/promotion or automatic next pass. Finish at a clean local review commit with evidence and recovery documentation.

## Verified restore correction

The post-import DEV backup rehearsal exposed an older Atlas persistence defect: pg_restore deliberately empties its search path, while existing CHECK validators resolve their helper functions through that caller path. Valid saved maps can therefore be rejected during restore. New additive migration `0129_worlds_atlas_restore_context` gives ten existing Atlas/connection/historical-payload validators a fixed `pg_catalog, public` search path. It does not change their bodies, grants, validation predicates, geometry or stored sources. Migrations through `0128` remain unchanged. Fresh/populated upgrades, valid/invalid checks under an empty caller path and standard full backup/restore round trips pass.

A pre-0129 backup containing maps may require a staged disposable recovery: restore pre-data, apply the 0129 function-context statements, restore data and post-data, then apply the ordered migrator so its ledger records the correction. Backups taken after 0129 restore normally. The guarded DEV script rehearses this repair without suppressing CHECK constraints, triggers, foreign keys or immutable-source rules.
