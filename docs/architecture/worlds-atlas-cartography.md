# Atlas Pass 3B cartography

Pass 3B extends the [3A foundation](worlds-atlas.md), preserving saved polygon/point geometry and geography IDs. Logical coordinates remain 2000 × 1200, X rightward and Y downward, with two-decimal positions and no physical-distance assumption.

## Visual reference study

The supplied references are visual and interaction direction, not source artwork:

- [Usean parchment continent](https://inkarnate.com/m/aedVDM): warm paper, dark coast ink, framing and geographical hierarchy.
- [Nordiclândia](https://inkarnate.com/m/LR8vVz-nordiclandia/): irregular coastlines, water/land contrast, mountain ranges and grouped vegetation.
- [Wonderdraft](https://wonderdraft.net/): coastline brushing, grouped mountain/tree marks, artistic paths and text styling.
- [Parchment city](https://inkarnate.com/m/2OwxLq/), [Watabou city layouts](https://watabou.github.io/arcana/city.html) and [Dungeon Scrawl gallery](https://www.dungeonscrawl.com/showcase/tags/Dungeon): future settlement scale, editable structural layouts and readable room/corridor presentation.

Public pages were opened in a real browser and local reference screenshots inspected. Inkarnate displayed an error dialog while public preview artwork was visible; full editable map access was not available. Watabou's city preview and Dungeon Scrawl's gallery were inspected. No reference artwork, private assets or third-party symbol packs were incorporated. All rendered symbols and textures are original SVG code, using the shared semantic map-color roles in `globals.css`. Controls keep the ordinary screen theme. Parchment, Illuminated and Night use the same editable data.

## Source representation

`world_atlas_feature` remains unchanged: real continent/island polygon and location marker identities. `world_atlas_drawing` adds World/map ownership, optional same-World geography linkage, retained archive metadata and a strict version-1 discriminated source object:

- Terrain: terrain kind, named group, stable source-point UUIDs, brush radius, spacing, density and persistent seed. A deterministic renderer derives illustrated marks; these marks are decorative parts of a stroke, not independent geography records. Lakes and snow add source-based coverage. Terrain clips to existing land, including subsequent coastline edits; with no land it can fill the blank chart.
- Path: river/stream/road/trail, stable source-point UUIDs, width and curvature. Curves interpolate editable points; zero curvature gives straight joins. Source controls, movement and restyling retain drawing identity. Within each layer, drawing stack order is persisted separately from the source JSON; Send backward and Bring forward rearrange overlapping drawings without changing their IDs.
- Symbol: original symbol kind, position, scale, rotation and colored/ink appearance. Settlements and landmarks require a location record. Mountain/tree decoration may be unlinked.
- Label: text, position, size, rotation and place/region/water appearance. Link named geography when appropriate; free annotation is supported. Text is rendered as escaped SVG text, with no injected SVG/HTML or external images.

Map presentation stores version, style, optional grid and visibility/lock state for land, terrain, waterways, paths, symbols and labels. Hidden/locked layers retain all source records. Layer controls organize editing; they grant no sharing or read permissions.

## Editing and safeguards

Smoothing changes actual boundary coordinates while retaining vertex IDs. Detail inserts editable vertices with controlled irregularity. Sculpting prepares a local boundary section, then applies a distance-weighted drag to carve bays/coves or extend peninsulas. Existing feature/geography IDs remain stable. Topology validation refuses self-intersections, touching/doubled-back boundaries and degenerate geometry, retaining the previous draft. Freehand tracing simplifies pointer samples into editable boundary vertices; Close outline validates and persists the same polygon representation.

Pointer capture unifies mouse/touch. Painting commits a whole stroke as one undo action; movement, point edits, style changes and archiving are meaningful actions. Pointer cancellation/Escape restores the previous draft. Numeric source-point controls, insertion/removal and direction buttons provide phone alternatives to dragging. Saves retain undo history and archive persisted records when undoing their creation; redo restores the same IDs.

Explicit save, unapplied-field guards, navigation protection, failed-draft retention, revision conflicts, saved-art comparison and draft JSON downloads extend to all drawings and presentation settings. Acknowledged-save/readback recovery remains intact. Decorative terrain never creates a place record. Named landmarks create/link existing World locations, and linked geography renames retain shared revision protection.

Existing land limits remain 128 features, 256 vertices/polygon and 8192 land/marker points. Separate drawing limits are 512 records including archives, 128 points/stroke or path, 16384 total source points, 600 derived terrain marks/stroke and 6000 marks/map. Adjust spacing/density rather than creating database rows for every rendered tree. Memoized terrain groups avoid regenerating unchanged artwork during navigation and selection. POST size remains bounded by the existing private endpoint.

Automatic polygon titles use the actual area centroid, so inserting collinear coast vertices does not move a title. Interactive labels have a readable minimum screen size on phones; saved text sizes stay in fixed map units.

PNG export renders the current full 2000 × 1200 vector scene using resolved theme styles, excluding editing handles/hit regions. A temporary offscreen scene uses fixed map units so exports are identical across desktop/phone viewports, zoom and selection. The working source remains editable and unchanged. No remote service, filesystem upload storage, raster background, external package or asset license is required. The export is a local image download, not public sharing.

## Migration and compatibility

New migration `0104_worlds_atlas_cartography.sql` adds `world_atlas_drawing`, strict JSON/coordinate/content validators, same-World restrictive FKs and defaulted map presentation. Published 0102 and 0103 are unchanged. Existing maps obtain a visual default without altering any feature geometry, geography identity, revision, historical date or timestamp. Migration `0105_worlds_atlas_drawing_order.sql` adds bounded `sort_order`, with zero as a default for any drawing already saved under 0104. Existing equal-order drawings retain their prior ID order until explicitly saved/reordered. 0104 was frozen before this addition and is not rewritten. Migration order is 0101 -> 0102 -> 0103 -> 0104 -> 0105. Disposable rehearsal verifies upgrades over maps saved under 0103, painted source saved under 0104, and fresh full-chain installation.

Incomplete old drafts cannot omit retained drawings. Reverting code does not reverse the migration: earlier 3A code cannot display new artwork and does not understand all new safeguards. Pause Atlas writers during rollback and retain rows, identities and ledger; prefer a forward fix. A backup restore requires stopped writers, verified target/backup and reconciliation of post-backup edits.

No canon controls, generation, Campaign mechanics, city/interior/dungeon authoring or nested map navigation are implemented. [Dedicated future tools](worlds-atlas-roadmap.md) preserve the permanent requirements.
