# Building interiors and floor plans

Atlas Pass 3E-B extends the existing World-authorized Atlas. It creates no Campaign, Heavens, equipment, NPC, combat, movement or session records. A future dashboard VTT remains a separate application. Dedicated dungeon construction remains Pass 3E-C.

## Identities and relationships

The existing settlement building's `world_geography.id` remains authoritative. `world_interior_floor.geography_id` is a new location with context `interior`, parented to that building. Its explicit same-World building foreign key requires an existing settlement entity of kind `building`. Names, optional custom classifications, free-text level labels, display order and elevation references never identify a floor or impose physical laws. Each floor can have several `world_atlas_map` rows with kind `interior`, associated through the existing map geography column. Floor ordering does not change any identifier.

`world_interior_entity.id` identifies a room, wall, opening, window, transition, furnishing or landmark. Rooms, transitions and landmarks use that same ID as a World geography location under their floor. Geography remains authoritative for their names and descriptions; entity classification is independent optional narrative metadata. Furnishings, walls and openings have stable lightweight entity records, without adding ordinary chairs to the World's geographic hierarchy. Their names, descriptions and custom classifications remain durable reference targets. These objects are illustration and narrative data, never Heavens inventory objects.

`world_atlas_interior_shape.id` identifies one versioned drawing representation. Its map and entity foreign keys include the same World and floor. Duplicating a map creates new shape and vertex IDs and remaps door attachments, while retaining its floor and semantic entity IDs. Duplicating an individual room or object creates a new entity and, when applicable, geography. It does not create another representation of the original room. Room geometry can overlap, extend beyond the exterior building footprint, or represent unconventional architecture.

## Geometry, openings and transitions

Version 1 source supports polygon room areas, connected straight or angled wall paths, wall-attached openings and rotated object representations. Irregular outlines use editable vertices; this pass does not claim spline walls or structural engineering. Source remains editable JSON, rather than flattened artwork. The shared Atlas coordinate, history, map revision and scene systems are reused.

An opening retains its wall representation ID, adjacent endpoint IDs, center fraction along that segment, width and style. The scene splits wall strokes around merged gap intervals before rendering door leaves, swing arcs, passages or window marks. This is a real gap in the displayed wall, rather than a stamp over an uninterrupted barrier. Moving, scaling or rotating a wall preserves a valid attachment. Removing its attached segment, shortening it beyond the opening's width or archiving the wall alone fails with a correction message. Archive or reattach affected openings before that edit. Hidden or locked attached layers also prevent indirect edits through a wall tool.

Transitions retain their own entity/geography ID separately from stair or portal artwork. Existing `world_atlas_connection` records link the source map and transition geography to an explicitly chosen existing same-World destination map. The additive arrival geography column optionally identifies an existing represented room or transition on that map. These are authored navigation relationships. There is no automatic next-floor connection, bidirectionality, physical-height rule or conversion of coordinates. The destination contract also supports future map kinds without implementing dungeon tools today.

## Editing, navigation and authorization

The dedicated editor provides rooms, walls, openings/windows, transitions, furnishings and custom landmarks, with persistent information, transforms, boundary editing, duplication, archive/restore, undo/redo, save/reload, recovery downloads, comparison, pan/zoom and independent layer state. Background/flooring, rooms, walls, openings, windows, transitions, furnishings, landmarks and labels have visible/locked controls. Decorative boards and tiles are flooring patterns, not a tabletop grid. Labels derive from entity names and current geometry; their layer lock prevents name editing in the interior inspector. They are not separately positioned label drawings. Legacy generic/settlement presentation remains unchanged.

Floor controls display the existing building and current floor, explicit map choices, floor information and exterior returns. Creation is available from the selected settlement building, Explore and the Atlas library. The existing Explorer handles floor and room details, transitions, geographic breadcrumbs, map trails, direct URLs, arrival selection and browser navigation. Multiple maps of one floor remain explicit choices.

World ownership and explicit read-only Administrator review are checked before reads or writes. Writes reuse the World-locked transaction and optimistic map revision. Shared geography and entity revisions reject stale cross-map metadata, including unchanged stale submissions. Failed saves retain source and unapplied fields. Hidden layers do not redact World content and are not a security boundary.

Archiving a floor retains its geography, maps, source, entities and incoming connections, and makes its maps unavailable for opening or new destinations. Existing unchanged links survive unrelated source saves and return when the floor is restored. Archiving a representation retains its source and entity identity; other representations continue to exist. No hard deletion is introduced.

## Source limits and loading

Each interior map supports 4,000 retained representations and entities, at most 256 points per room or wall, and 64,000 total source points. These dedicated limits do not inherit the generic 128 geographic-feature or 512 decorative-drawing caps. A building supports 512 retained floors, an explicit source-size safeguard rather than a floor-number convention. All geometry stays within the existing 2,000 by 1,200 drawing canvas, with two-decimal coordinates. These are illustration bounds, independent of physical size. The existing Atlas request-body size guard remains authoritative.

Targeted map reads load only the selected interior's artwork and referenced semantic entities. Other maps supply metadata for explicit choices. Library thumbnails load source lazily when visible. Rendering uses the existing SVG scene, memoized shape components and animation-frame pointer previews; camera panning does not rewrite source. Dense fixture timings and actual desktop/phone evidence are committed under `docs/screenshots/worlds-atlas-pass-3e-b`.

## Deployment and recovery

Migration `0110_worlds_atlas_interiors.sql` follows `0109_worlds_atlas_settlements.sql`. It adds the floor, entity and shape tables, interior layer state, optional transition arrival geography, validated JSON functions and explicit `interior` map kind. All finalized migrations and snapshots through 0109 remain unchanged. Upgrade checks compare existing settlement/building geometry, map provenance, geography, drawing source and connections before and after 0110. Fresh installation and migration reapplication are separate checks.

No new environment variables, email service, external assets or integration configuration are required. Controlled deployment requires a database backup, ordered migrations, application build/restart and owner/review smoke checks. A code rollback does not reverse the migration. If interior data has been authored, retain a backup and prefer a forward fix; older application code does not understand the new map kind. A coordinated database restore must use its matching application release and account for writes since the backup. Do not remove new tables or reinterpret interiors as generic maps to simulate rollback.
