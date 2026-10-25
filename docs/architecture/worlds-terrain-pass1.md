# Integrated lightweight Atlas: heightmap foundation

Owner direction: October 24, 2026, including the supplemental database and persistence directive. This supersedes the October 17 separation decision and conflicting historical roadmaps. Scope is this website's Worlds workspace, not the standalone Studio repository. No remote publication, deployment, Production changes, builder relocation or later construction phase is included.

## Audit and decisions

The clean starting checkout was `main` at `ce60eb7f79a2926e27a777738aa05d8973b879ae`. GitHub's live `main` was independently read through the GitHub connector at the same SHA. There were no local-only commits or working-tree changes. The published retrieval checkpoint and every earlier implementation remain retained.

| Existing structure | Decision |
| --- | --- |
| `world`, roles and Worlds services | Reuse owner-based G.O.D./Admin authoring, World lifecycle and explicit read-only Admin review. Ordinary-knowledge views cannot read creator terrain. |
| `world_atlas_map` | Retain stable map identity and its existing relationships. A new map receives a compatible identity row. Its legacy width, height, kind and vector payload are not the new editor's dimensions or model. |
| `world_geography`, lore and their relationships | Preserve semantic location identities independently of map artwork. Future appearances can reference one place from many canvases. Removing a future marker must not delete that place. No Campaign Town/Shop/NPC record is created here. |
| Geographic surface/dataset/feature/version tables | Retain imported coordinate references, provenance, revisions and source geometry. They are reference material; authored terrain does not modify those originals. |
| Numerical/categorical raster tables and private bundles | Retain immutable imported assets. Reuse the verified immutable file-publication primitive; do not assume import readers implement authored writes. |
| Map states, historical connections and branch pins | Preserve exact existing identities and sources. Terrain revisions have independent stable references for future historical appearances; old drawing payloads are not silently converted into heightmaps. |
| Legacy Atlas HTTP routes | Keep their protective boundary in `atlas-availability.ts`/`http.ts`. Only `/api/worlds/:worldId/terrain` provides the newly authorized functionality. Legacy bookmarks still normalize safely. |

## New durable structures

Forward migration `0133_worlds_editable_terrain.sql` adds four tables. No migration or snapshot through 0132 changes. The initial unapplied 0133 draft was revised before DEV application to incorporate the supplemental directive.

* `world_map_canvas`: a representation attached to the existing map identity, with its own planar purpose, terrain reference and versioned rendering settings. Many representations can reference one terrain without duplicating geography. The first interface creates world-scale canvases only.
* `world_terrain`: independent numerical geography, World ownership, grid format, physical coordinate frame, fixed/wrapped east/west edges, elevation bounds, base height, sea level and current accepted revision. These settings belong to terrain, not legacy vector drawing coordinates.
* `world_terrain_version`: append-only accepted revisions with parent revision, exact request identity, content checksum, author and time. Sea level is part of the accepted version.
* `world_terrain_tile`: immutable changed-tile references for each revision, keyed by terrain/detail level/column/row/revision. References contain encoding, byte count and SHA-256, not a heightmap JSON document. Unchanged tiles inherit their latest previous reference; untouched space uses the stored numerical base height.

Foreign keys keep references inside the selected World. Constraints validate supported formats, dimensions, bounds and checksums. Deferred head validation requires a complete matching accepted revision. Triggers reject modification/deletion/truncation of accepted history and out-of-grid tile references. The service validates every sample against the selected terrain's elevation range.

The first format supports 32–1024 columns and rows in multiples of 32, 32×32 signed 16-bit integer tiles and independently chosen height bounds within −30000 to 30000 metres. Physical extents range from 0.1 to 1,000,000 km on each axis, in a local planar metre reference. This permits custom proportions independent of grid proportions. Coordinates start at the upper left; rows increase downward. North/south edges are fixed; optional east/west wrapping joins brush and smoothing neighborhoods. Settings are stable after creation. There are at most 64 terrain maps per World in this slice.

## Files, save and recovery

Private numerical objects live below `SERRIAN_TERRAIN_ROOT`, default `storage/world-terrain`, outside public static files. An object is `objects/<first-two-hash-characters>/<sha256>.i16`, exactly 2048 bytes of little-endian signed 16-bit samples in row order. Blank space is represented by the database base elevation; it does not require duplicate flat files. Generated Canvas2D display pixels are disposable derived data.

An authenticated owner save locks its World and selected terrain, checks the expected revision, validates and sorts changed tiles, then stages and fsyncs numerical bytes. The retained raster publication primitive verifies and atomically publishes immutable objects without replacing an existing checksum key. Only after all objects exist does one PostgreSQL transaction insert the accepted revision, tile references and head update. A failed transaction cannot publish a partial saved map. Files published by a rolled-back transaction remain harmless unreferenced objects.

Every reopen validates referenced file sizes and checksums. Missing or damaged accepted tiles fail visibly; they are never replaced with blank terrain. `scripts/terrain-storage-audit.ts` is a read-only integrity and staging inventory: it identifies committed request manifests, abandoned/in-flight stages, incomplete stages, partial files and unreferenced objects. It never deletes files; in-flight status must be reconciled while writers are stopped before any separately reviewed cleanup.

Save request identities make a lost-response retry idempotent. The same identity with different content is rejected. A competing newer revision produces a conflict rather than replacing terrain. Browser IndexedDB recovery retains local tile deltas and a pending request, namespaced by World/map. Restoring is explicit; it never silently accepts terrain. Reopen recognizes an already accepted pending request. Stale drafts remain downloadable and cannot overwrite newer revisions. Undo/redo applies local numerical patches, including sea-level changes, with a bounded session history; accepted historical revisions remain unchanged.

Brush operations visit their bounded rectangle and smoothing halo. Painting refreshes affected tiles and illumination neighbors in animation-frame batches with a 6 ms work target. Initial display and sea-level changes progressively repaint tiles. Canvas2D uses CPU calculations and requires no dedicated GPU. The bounded first grid does not justify introducing worker synchronization; measurements and limits accompany the acceptance report. Larger grids and regional refinement must preserve this tile/update boundary rather than synchronously recomputing a whole world per dab.

## Extension points and boundaries

Rendering settings and future artwork belong to map representations/layers, while terrain stays numerical and reusable. Future regional grids can link an exact parent terrain revision and a coordinate transform; aligned floors can share a coordinate frame. Detail-level/encoding discriminators are explicitly validated for format 1; enabling new detail formats requires a forward migration and compatible readers. Do not reinterpret old bytes in place.

Future place appearances should join `world_geography` to the new canvas coordinates. A save transaction can create a semantic location and its appearance under one idempotent operation, without coupling to Campaign-owned gameplay builders. Town/shop world-building definitions, placement queues and builder relocation are later work. Existing semantic identities and lore are preserved now.

Canon reuse can create a creator-owned terrain branch with an exact protected source terrain/revision reference and independently accepted deltas. World ownership of current working terrain remains distinct from future source provenance and collaboration grants. Cross-owner source reads and invited editors require their own authorization model; no broad permission is added by preparing this foundation. Historical appearances can pin terrain revisions alongside existing map/place/timeline identities. No canon publishing, map layers, generators, water simulation, regional authoring or Tabletop integration is activated by this pass.

See the pass completion record for measured checks, DEV migration/backup evidence, screenshots, limitations and controlled deployment/recovery instructions.
