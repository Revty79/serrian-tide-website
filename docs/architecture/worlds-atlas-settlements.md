# Standalone settlement maps

Pass 3E-A extends the existing Atlas renderer and World authorization, rather than introducing another map engine or gameplay integration. Worlds remains standalone. A future dashboard Virtual Tabletop will integrate separate applications; it is outside Worlds and Paths. No Campaign connections, movement rules, Heavens Towns, Shops, NPCs or integration placeholders are created here.

## Place, entity and representation

`world_geography.id` remains the semantic identity. A settlement is an existing location with context settlement. A new dedicated map can atomically create that location, or reuse it. `world_atlas_map.map_kind` explicitly distinguishes generic and settlement authoring, independently of scope, geographic ancestry or physical distance. All pre-existing maps migrate to generic. Deliberate adoption associates a generic map with an existing settlement without changing IDs, recipes, editable source or incoming connections.

`world_settlement_entity` uses the geography ID as its stable key, with same-World settlement identity, immutable category, optional free-text classification and revision. Categories are street, district, building, wall, waterway, space and landmark. The underlying geography stores the shared name and detailed description. Buildings use location/building-site context; districts and other authored places use locations/local-area, never coastline polygons. Each has its settlement as geographic parent. All useful categories are optional; authors may leave a settlement empty or unconventional.

`world_atlas_settlement_shape.id` identifies one version-1 editable representation. It refers to the entity and settlement through composite foreign keys matching the map subject. Areas have editable polygon vertices, lines have width/curve/vertices and markers have point/size/rotation. Representation IDs and vertex IDs survive movement, rotation, reshaping and save/reload. Named building IDs are geography IDs independent of footprints: later interior/floor or dungeon maps can associate with that same existing geography through Pass 3D, including multiple maps without a one-building/one-floor assumption. No interior or dungeon tools exist in this pass.

`world_settlement_membership` provides many-to-many district membership separately from geographic ancestry. Both member and district must belong to the same World and settlement; a relational kind constraint restricts destinations to districts. Overlapping areas and multiple memberships are permitted. Boundaries do not imply automated membership or political simulation.

Duplicating a map creates new representations and vertices, preserving all semantic places, memberships and preferred connections. Duplicate object creates a new entity/geography and representation, retaining descriptive information and chosen memberships. Archiving a representation retains its full source and semantic identity; restore recovers the same shape. Referenced places cannot be destructively archived/deleted through the generic geography interface. Map archive/restore retains all sources and relationships. There is no destructive settlement-object delete control.

## Editing, rendering and browsing

The dedicated editor implements streets, roads, lanes, trails, bridges, irregular/rectangular buildings, districts, physical boundaries, gates/tower landmarks, waterways, plazas/parks/harbor areas and custom landmarks. Existing terrain, coastlines, symbols, lakes and labels remain in Terrain and artwork. Shape geometry remains separate from continent/island rules. A shared standalone geometry validator preserves the original legacy polygon rules unchanged.

A separate version-1 settlement layer state controls waterways, roads, districts/spaces, buildings, walls, landmarks and labels. The published cartographic presentation-v1 contract is unchanged; it continues to control the background. Layers retain source, and locking prevents drawing and editing. Layer hiding is presentation only, never secret-content authorization.

Explore renders the same settlement source through the existing scene, selects shape-linked geography, shows descriptions/classifications/memberships and keeps breadcrumbs, deep links, browser history and multiple chart choices. All reads use World owner authorization or explicit read-only Administrator review. Foreign G.O.D.s, Players and anonymous visitors cannot gain private access by guessing any ID. No new sharing or canon model is introduced.

Map CAS revisions protect all saves and connection writes. Geography/entity revisions also detect changes made from another representation. Failed saves and conflicts retain drafts for download and explicit comparison/reload. Shape edits commit one undo action per gesture; pointer previews use animation frames, memoized source and per-object rendering. Saved history reconciles new retained shapes and current semantic revisions.

## Scale and loading

Each settlement draft supports 4,000 representations, 4,000 semantic entities, up to 256 points per object and 64,000 total settlement points, including archived source. Linked geography drafts allow 4,128 records; legacy features still cap at 128 and cartographic drawings at 512. Native terrain budgets remain unchanged. Requests have a 12 MB maximum; many long descriptions may reach this before the object cap. These are payload/source bounds rather than mandatory city sizes.

Opening a map uses the targeted Atlas read and loads only that map's shapes and artwork, plus shared World context and entity metadata for its settlement. Header reads omit settlement source. Library thumbnails request source only as they enter view; they never mount full editors. Selection uses indexed entity/name lookups. The object list displays 200 matches at a time with name search; every source object is retained and rendered. Existing terrain caching, lazy thumbnails, background generation and frozen generator v1/v2 are preserved.

## Migration and recovery

Apply additive `0109_worlds_atlas_settlements.sql` after 0108, in journal order. It adds map classification/layer state and the entity, membership and representation tables. New JSON validators and same-World/settlement FKs are versioned in this migration. Earlier migrations/snapshots are immutable. No new environment or external service is needed.

Use the normal verified backup, staged production build, paused writes and committed migration process. A Git revert does not reverse schema or ledger changes. Older application writers do not understand settlement identities or shape retention and must remain paused during fallback. Prefer a forward fix; protect post-backup changes and reconcile application/schema versions before any controlled restore.
