# Connected Atlas geography

Pass 3D adds navigation to the existing editable Atlas. It uses the original SVG renderer, source data, terrain caches and World access boundary. It introduces no Campaign runtime, canon sharing, Town integration or city/dungeon drawing tools.

## Relationships

`world_geography.id` remains the identity of a place across all representations. Its existing nullable `parent_id` describes one optional geographic ancestry; independent locations remain valid. The existing service validates the entire World parent graph and refuses missing parents and cycles. Administrative and overlapping cultural regions are location records with `context='region'`, not additional coastline polygons. A region can appear on several maps regardless of their ancestry.

Location contexts are place, region, local area, settlement, building site and interior. They classify existing `kind='location'` records and keep the existing point/symbol drawing rules. Continents and islands retain their original kinds and outline geometry. Changing context does not create Heavens Towns, Shops or new drawing tools. Older generators and drafts may omit context; the service retains an existing value and defaults new records to place.

`world_atlas_map.geography_id` associates a representation with one existing place. Null explicitly means the whole World. Existing maps migrate to null without inference or any change to their source, revision or recipe. Many maps can represent the same place; `scope` remains a library label rather than physical distance or a parent relationship.

`world_atlas_connection` records an optional preferred destination for `(source_map_id, geography_id)`. It refers to stable place IDs rather than feature IDs, names or coordinates. Therefore renaming, moving, reshaping or archiving a source feature does not remove the place or its preferred link. A preference can also act as a map-level connection to a place not drawn on the source. Explore lists all available maps associated with that place and identifies the preference; it never arbitrarily overwrites alternatives or automatically chooses among several charts.

Composite foreign keys restrict source, place and destination to one World. The destination may represent the selected place, another level, or a World overview: the author chooses the appropriate connection. Changing a map's represented place retains its incoming links. Self-links are refused. Preference changes use the source map's revision and the existing locked World transaction, so concurrent relationship and artwork edits conflict instead of replacing each other. Duplicating a map retains its represented place and copies its preferred connections, with new map/connection identities and the original shared geography identities.

Map archival retains associations and connections. Exploration refuses archived map IDs on the server, omits their opening controls and explains unavailable charts. Restoration makes the same relationships available again. Geography archival is blocked while any subject map, preferred connection, child or saved representation references it. Restrictive FKs prevent destructive deletion; guarded user deletion still blocks at World ownership.

## Browsing

Library Open retains the established editor. Explore opens a separate viewer with no mutation tools or geometry updates. Editable source rendering, resolution-aware terrain caches and animation-frame pan updates are reused. A tap selects a geography; a drag changes only the viewport. Drawing-layer locks do not prevent exploration of visible places, and decorative terrain cannot intercept place selection. Place-list buttons provide keyboard access without requiring precise artwork taps.

The information panel shows authored names/descriptions, type/context, optional parent, related child locations, every map associated with the selected place plus an authored preferred chart at another level, and retained archived destinations. It makes no assumptions about the origin of a setting. These stable IDs can later serve histories, civilizations, habitats and Town/Campaign references without implementing those systems now.

Breadcrumbs express geographic ancestry; map visit history is separate. Breadcrumb selection opens the relevant place information and explicit chart choices. World maps remain explicit choices too, including when several charts represent the World. Previous map follows a bounded visit trail, truncating a revisit instead of building a navigation cycle. Explore URLs use the existing authorized World route with `atlas=<map UUID>` and optional `place=<geography UUID>`, preserving explicit `review=1`. Native history integrates with the installed Next router. Browser back/forward and direct reload work; the selected World remains in the URL. Viewports are remembered per map during an exploration session.

Every new map opening uses a fresh authorized, no-store read. `GET /api/worlds/:worldId/atlas?map=:mapId` returns artwork for only the requested active map, plus the World's map headers, geographies and connections. It does not load destination editors or all their drawings. Failed reads retain the last displayed chart and viewport, with Retry and a way to return to its URL. The library retains its existing full Atlas API and lazy thumbnails.

## Access and future scales

Owners with G.O.D./Admin access author their own Worlds. Foreign Administrators must enter explicit read-only review; other G.O.D.s, Players and anonymous visitors cannot gain access through IDs, query parameters or connections. Every command and read uses the existing World authorization service. UI hiding and layer visibility are presentation only.

Building sites and interior/dungeon entrances can already have associated maps using today's generic local cartography. Specialized city streets, buildings, interior rooms, dungeon floors, secrets and grids belong to Pass 3E. There are no placeholder tools or new secret/public permissions. Future map kinds can reuse these relationships; map scope does not determine the navigational scale.

## Deployment and recovery

Apply new migration `0108_worlds_atlas_navigation.sql` after 0107 in committed journal order. It adds context, nullable map association and the connection table with same-World constraints. Published migrations and generator editions v1/v2 remain immutable.

The migration is additive and preserves legacy read projections and data. Old code can read original maps, but cannot manage the new associations or copy preferences correctly. Pause authoring if temporarily running an older release; prefer a forward compatible fix. Reverting application code does not reverse the database migration. Never drop relationships or remove ledger entries to downgrade. Use the normal verified backup/controlled restore and reconcile post-backup changes if schema recovery is required.
