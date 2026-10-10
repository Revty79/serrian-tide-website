# Worlds Atlas foundation

Pass 3A adds a blank vector-map editor to the private World workspace. Atlas never creates Campaign/Tabletop objects or duplicates Heavens Town, Shop or NPC authoring. Historical chronology and mechanical time remain independent.

## Data and coordinate contract

`world_atlas_map` is a visual chart, distinct from a continent's identity. Each chart has an immutable logical extent of 2,000 by 1,200 units. X increases rightward and Y downward from the top-left corner. Coordinates are finite JSON numbers with up to two decimal places, including the edges. They imply no physical distances, geographic projection or Earth coordinates. World/continent/regional/local are library labels; there is no nested map navigation in this pass.

`world_geography` stores a stable World-owned UUID, continent/island/location kind, name, description, optional same-World parent, revision and archive metadata. Records can be named before drawing and referenced by multiple maps/features. Renaming updates that shared place. Saved kinds are stable. Composite foreign keys prevent foreign parents/maps/geography associations; server graph validation and a World-root-serialized PostgreSQL trigger reject parent cycles. Linked geography must be retained; archive its visual features instead.

`world_atlas_feature` stores a separate stable UUID, map/World/geography links, typed JSON geometry and archive metadata. Version 1 supports `{version:1,type:"polygon",points:[{id,x,y},...]}` and `{version:1,type:"point",point:{x,y}}`. Polygons have distinct stable vertex UUIDs, an implicit closing edge and no repeated first point. Continents/islands use polygons; locations use point markers. Moving, reshaping and midpoint insertion preserve existing feature/geography IDs. Removing a feature means reversible archive, retaining all geometry. Existing features cannot be omitted from a save or reassigned to unrelated geography.

This is the future generation contract: later generators create the same feature/geography structures and use the authorized save service. Additional line/border/terrain types require explicit discriminated-schema extensions, corresponding editing tools and any needed migrations. No flattened image replaces editable geometry.

## Rendering and interaction

Native SVG works directly with installed React 19 and Next 16, adding no graphics dependency or third-party package license. [React pointer handlers](https://react.dev/reference/react-dom/components/common#pointer-events) and browser [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) provide mouse/touch input. The inverse [SVG screen transformation matrix](https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getScreenCTM) converts actual client coordinates into logical coordinates, including viewBox zoom, pan, letterboxing, scroll and resize. Production-browser checks verify interaction against the installed stack.

Select and Pan never modify geometry. Move feature and Edit points are deliberate editing modes. Each completed drag is one undoable action; pointer cancellation explicitly restores the prior shape. Translation clamps the whole feature at map edges. Invalid self-crossing edits are refused visibly, retaining the previous geometry; unsuccessful outline closure keeps the unfinished points. Undo/redo covers feature creation, movement, vertex edits/insertion/removal, metadata and archive, with 50 actions in the session. View navigation is outside editing history. Saved geometry persists; session undo history does not persist across browser sessions.

Phone controls include named feature/point selectors, numeric coordinates, midpoint insertion/removal and 10-unit direction buttons. Invisible vertex/marker targets span 44 screen pixels independent of zoom. Zoom/Fit buttons support navigation without pinch gestures. The canvas uses explicit single-pointer tools; the surrounding page remains scrollable.

## Saving and safeguards

Writes reuse `worldWriteTransaction`: fresh G.O.D./Admin authorization and an owned, active World root lock. Map revision checks prevent silent two-tab overwrite; shared geography revisions protect metadata when another map edits the same place. Map metadata, features and geography changes commit atomically. Other map rows/revisions remain untouched. Reads retain explicit read-only Admin review, private/no-store responses and existing Player/anonymous/foreign-ID restrictions. Restrictive descendant FKs preserve the account-deletion block on owned Worlds.

Server validation rejects unknown fields/types, empty/degenerate outlines, fewer than 3 or more than 256 vertices, repeated identities/positions, doubled-back/self-intersecting/touching boundaries, area below one square unit, invalid/out-of-bounds/overprecise coordinates, more than 128 features/geography drafts and more than 8,192 total points. POST requests are limited to two megabytes. Database constraints backstop structure, bounds, numeric precision, point identity, minimum area and same-World associations. Full geometric semantics remain server validated before writes.

Save is explicit. Dirty geometry, unfinished outlines and unapplied information fields protect navigation/closure. Apply information/point fields before saving. Failed saves retain drafts. Conflicts offer a saved-map preview/revision and JSON draft download; replacing the current draft requires confirmation. There is no automatic merge/forced overwrite. The download is a recovery artifact, with no import control in this pass. Successful saves reload authoritative revisions and retain session undo actions. Older undo states retain newly saved features as archived records rather than omitting persisted IDs; undo/save/redo/save keeps the same feature and geography identities.

## Migration and release

Migration order is 0101 → `0102_worlds_atlas_foundation.sql` → `0103_worlds_atlas_geometry_integrity.sql`. 0102 adds three tables, indexes, same-World constraints and hierarchy protection. The user's instruction treats 0102 as published: it must not be rewritten. Further database correction is in 0103, which installs the coordinate/identity/area validator and constraint. Both migrations and their snapshots are now frozen; any later database alteration requires a new migration. Existing invalid geometry causes a visible migration failure rather than silent deletion; correct the data through a reviewed recovery procedure before retrying.

Upgrade rehearsal preserves Checkpoint B evolution/source snapshots and existing World date representations, users/catalog/Campaign/session data; it also applies 0103 over valid geometry already saved under 0102. A fresh full-chain installation is checked separately. No existing columns are changed, no data is backfilled/reinterpreted, and no environment/configuration or seed is required.

Verify the target database, ledger, release and backup before applying pending committed migrations with `npx drizzle-kit migrate` under separate deployment authorization. Reverting code does not reverse migrations. Retain Atlas tables, stable identities and the ledger; earlier code can read its earlier data but cannot present Atlas. Prefer a forward fix. A backup restore needs stopped writers, post-backup reconciliation and matching code/ledger versions.

Raster backgrounds are deferred to the next contained increment, requiring authenticated durable storage, file validation/limits, persistence and recovery tests. No Upload control or temporary production filesystem is introduced. Generation, terrain painting, roads/rivers, political simulation, nested map navigation and Campaign placement remain outside Pass 3A.
