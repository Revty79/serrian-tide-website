# Geo D3-A: authoritative procedural geography

Authorized from independently approved D2-B `c4c4f67cead798b1ef72660049c4ee39d3ce594e`. Extend the existing Atlas and geographic source/version/part architecture. No migration, separate map engine, terrain simulation or new raster asset is introduced.

## Versioned reuse

`serrian-geography-v1` adapts the retained Atlas V2 land placement and silhouette algorithms. The only change to the old V2 generator is exporting its existing land function; its default execution, random stream, V1/V2 dispatch, description interpretation and saved recipes remain unchanged. The adapter records its base algorithm as `serrian-atlas-v2`. Future incompatible changes require a new recipe algorithm, preserving this implementation and its golden geometry digest.

Inherited V2 settings/plan defaults are frozen in this adapter and retained in the preview and source receipt, so later preset changes cannot alter old output. The normalized recipe retains the original seed, all six settings (major landmasses, islands, approximate coverage, size, shape and complexity), target extent and complete surface reference. Seeded asymmetry, multi-scale coastline variation, bays, peninsulas, unequal companions, irregular placement and island chains reuse V2 procedures. Counts, rejection attempts and vertex counts are bounded; insufficient room produces an error, never a truncated result. Requested coverage is a tendency; measured planar-design coverage is reported separately from spherical surface area.

Each complete landmass/island becomes one Polygon source/place with 192/72 original editing vertices, below the D2-B 256-vertex limit. A batch supports four major landmasses and twenty islands, at most 24 complete sources and 2,208 vertices. Sources are never combined into an oversized uneditable feature. D2 may later add holes/components within its existing limits. An exact vertex selector and neighboring-vertex focus make dense generated coastlines usable without changing coordinates or dirty state. No generated PNG or decorative-only polygon substitutes for source geometry.

## Coordinates and preview

Creators use the existing surface association flow before generating. D3-A accepts creator-declared `AUTHORED:` surfaces; imported Earth references are unavailable. Planes retain their own bounds and units, including non-Earth scales/origins and their existing Atlas canvas orientation; planar y follows the retained adapter, while spherical latitude increases north. Supported spherical areas span less than 120 degrees longitude, stay within 75 degrees latitude and avoid seams/poles. Every output passes D2 validation; aggregate polygons also pass separation checks in original coordinates and a common gnomonic plane for spherical topology. Unsupported surface topologies need later versioned adapters.

An isolated browser worker generates previews without writes. Cancellation terminates it and aborts context loading; job identities reject stale responses. Settings changes invalidate acceptance and the candidate overlay. Both a dedicated preview and an overlay on the actual map support comparison before saving. Draft guards include generation but source/artwork/raster saves retain their own dirty boundaries. The preview/download includes recipe, deterministic output digest and timing. Ordinary, dated and Administrator review have no generation controls.

## Atomic acceptance, conflicts and provenance

The owner-only endpoint rechecks ownership, timeline, active generic map, surface and a metadata-only source-head/map context. It reproduces and validates the recipe server-side and checks the preview digest. The request carries settings, not an untrusted replacement geometry. A World writer transaction creates the entire batch or rolls it all back; it never changes existing source heads, places, artwork or historical states.

A request identity and retained request hash make retries idempotent, including after later manual edits. Failed or interrupted saves keep the preview and frozen request for retry; uncertain saves cannot be edited into an accidental second request. Context conflicts require refreshing saved geography and explicit subsequent acceptance as new sources. Regeneration always proposes a new batch; it never overwrites edited geography.

Existing JSON source properties retain the full recipe, base/versioned algorithm, surface/map/timeline/creator context, original digest, request identity and generated feature/place/original-version roster. Creation time uses the immutable version row. Existing creator-authored provenance records the creator/account without inventing external providers/licenses. D2 revisions preserve these properties and original versions; ordinary reads withhold private recipes and protected sources. The retained recipe is visible from the D2 source editor.

## Glass Sea and recovery

Use a receipt-verified additional disposable copy of canonical Glass Sea, preserving its existing World, surface, map and source identities. Preview several seed/extent proposals, then demonstrate save/edit only in that copy. Every original Glass Island/Copper Isles/Glass Channel row, head, version, artwork and association must remain exact. Candidate names/directions are proposals, not established geography; persistent Glass Sea changes require owner approval.

No schema/configuration change is needed. A rollback to D2-B can read/edit saved generated geometry and retain its JSON recipe; it must not strip properties or delete source versions. Code rollback does not undo generated rows. Preserve originals and prefer compatible readers/forward fixes. D3-B terrain, waterways, hydrology/climate/biomes, D4 connections, D5 art/assets and E acceptance remain separately authorized work. The postponed Worlds interface/navigation/language overhaul remains outside D3-A.
