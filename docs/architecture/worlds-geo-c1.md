# Geo C1: physical vectors and source locations

The owner approved C1 as the first independently usable increment of the [Geo C division](worlds-geo-c-scope-proposal.md). It adds physical vectors and populated-place source locations to the existing Earth. Numerical elevation/relief belongs to C2 and classified land cover to C3. No inactive raster controls are introduced here.

## Source and identity contract

The [pinned manifest](../../data/geography/natural-earth-physical-sources.json) records seven Natural Earth 1:10m archives, downloaded editions, sizes, full SHA-256 values and expected worldwide inventories. The reproducible preparation script verifies each archive and WGS 84 reference before decoding with shapefile 0.6.6 UTF-8. Only trailing DBF NUL/space padding is removed; original coordinates and all decoded attributes remain immutable source data.

Every native row has a dataset namespace and an external identifier containing its native provider ID plus row index. Repeated provider IDs therefore preserve distinct rows. River rows share a World place only when the provider supplies the same positive river number and exactly the same nonempty name. Their separate River/Lake Centerline classifications, geometry and immutable versions remain retained. Primary group members precede linked members in the import plan; retries retain the original input and existing identities.

Cities and capitals receive the existing `settlement` geography context; source-classified stations and historic sites retain `place`. These are World geographic identities, not gameplay Towns, Shops, NPCs or inferred founding/control events. Source country codes and names remain provider context in the exact attributes. No country parent is assigned by guesswork. Aliases and multilingual names remain available in the author/review source reader. Ordinary readers retain the established withholding of detailed provenance and original attributes.

One provider row classified `Dragons-be-here` is explicitly omitted from real Earth. Its native row, geometry hash and reason remain in the coverage receipt; the downloaded archive is preserved. All other 12,468 native rows are imported, including small unnamed water features, stations and named historic sites.

## Generic presentation

Optional descriptors in the existing provenance JSONB declare one of nine themes: land, administrative, rivers, inland water, mountains, landscapes, marine, cities and authored geography. Existing source descriptors retain their semantic fallback, so old imported and creator-authored data remain readable. Themes are independent of the existing physical/administrative/authored distinction and work on planar or authored-angular fictional surfaces.

The server validates and filters theme requests before serializing shapes. Current source and place protection, archived records, Realm context, selected timeline, ownership and read-only Administrator review continue to use the existing access system. Theme selection does not grant access or create a dated reconstruction.

C1 uses the provider's scale rank: ranks 0–2 are available globally, through 5 regionally, and every retained record at detailed level. Projection, simplification, label positions and point sizes are derived presentation only. Exact source readers retain all coordinates and versions. Responses remain limited to 64 components and 500,000 path characters; the client progressively requests further pages.

The final C1 rendering repair fits clipped, projected lines and closed rings to the 1000 × 600 display using a 0.35-unit screen tolerance. A component exceeding the 64,000-character derived-path budget is retried at increasing screen tolerances, with the achieved tolerance returned explicitly. Points retain their exact projected positions. Holes, separate clipping fragments and subpixel closed components are retained; source geometry, stored LODs and original revisions are never rewritten. Detailed still selects the finest declared sources, including every eligible component of the populated Earth. The visible notice explains that display outlines are reduced and zooming reveals more local detail. See [measurements and acceptance](../operations/worlds-geo-c1-rendering-repair.md).

Viewport pages belong to a single request attempt. A later network/server failure keeps that attempt's successful authorized pages visible and marks coverage incomplete. Retry starts a fresh authorization attempt. World, map, timeline, knowledge/review, extent, detail, theme and refresh changes invalidate earlier results. Each server page also includes an opaque stamp of its currently eligible source heads/names; changed source visibility or access invalidates accumulated pages. The stamp is computed once per page. Pagination checks strict cursor progress, duplicate components and a finite 4,096-page recovery boundary, allowing the complete Earth's 533 Detailed pages to finish.

Labels use only readable saved names and projected source positions. A deterministic placement pass favors provider rank, avoids collisions, deduplicates multipart names/place identities and limits theme quotas. Equal-ranked components of the same named place prefer the largest projected polygon area or line length, so a continent's remote islet does not receive its main label. Conservative text bounds reserve room for wider uppercase names. Desktop labels cap at 60; phone labels cap at 20 with a minimum 12-pixel text size. Hidden labels do not remove geometry, source readers or saved identities. Keyboard activation and pointer/touch selection open the same source reader. Theme and reader results remain tied to their current World/map/timeline/knowledge/review request context through loading, failure and retry.

Physical regions are approximate thematic extents rather than precise terrain or land-cover boundaries. Recorded peak attributes remain distinct from a numerical elevation grid. Marine region outlines are naming extents rather than territorial claims or exact coastlines. Populated-place estimates remain source attributes rather than a current census.

## Geometry and persistence

No migration, new table, new foreign key or replacement cartography renderer is required. The additions use existing source JSONB and World geography context. The User deletion inventory remains 114 classified foreign keys, including 107 blocking and seven cleanup relationships.

Source geometry validation uses translated coordinates and relative floating-point error when checking area, preserving valid tiny source triangles at large coordinates. Wrapped hole alignment proves containment across longitude offsets. A water component inside a polygon hole may touch its hole boundary without being misclassified as overlapping the filled outer component. Crossing, retraced, degenerate, overlapping and out-of-domain geometry remain rejected.

Natural Earth's lakes explicitly declare `validation.retainCoincidentVertices`: consecutive coincident source vertices are retained exactly while a validation copy removes them. The default author/import policy continues to reject them. This exception does not admit crossing, retraced or zero-area rings. Later revisions keep their source's declared validation policy. No topology correction rewrites the original arrays.

## Import, operation and recovery

`prepare-natural-earth-physical.mjs` prepares deterministic files and a checksum-frozen plan without a database connection. `worlds-geo-c-import.ts` accepts only the positively verified loopback DEV target or the named owned disposable database, the exact plan checksum and bounded files under its artifact directory. It checks saved geometry and attribute hashes after every atomic batch and never replaces an existing source head.

`worlds-geo-c.test.ts` protects a complete DEV backup, proves an exact disposable restore, rehearses interruption/restart/no-op replay, validates pre-existing rows and the unchanged ledger, builds an isolated production checkout, and gates DEV application on matching build/test/recovery evidence. All browser fixtures belong to disposable databases. Original Geo A/Phase 6 fixtures are cloned for regressions, leaving their evidence database and receipts intact.

Runtime needs PostgreSQL and the existing CPU-only Node application, with no paid geographic API, GPU or permanent third-party tile service. Raw archives/preparation files remain recovery tooling inputs. Controlled release requires the normal reviewed application build and existing ordered migration ledger; no C1 migration is pending. Geographic content transfer to another environment is a separately authorized operation.

An older release may lack the new theme/style descriptors even though the source rows remain intact. Retain compatible C1 readers/writers or use a reviewed forward correction. Reverting application code does not remove imported rows. If a database restore is required, pause writers, preserve intervening changes, restore the verified full backup into the verified target and reconcile newer work; never delete source rows or ledger entries to imitate a code revert.
