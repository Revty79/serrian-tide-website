# Dungeon sites, levels and the Dungeon Workshop

Atlas 3E-C extends the existing World-owned Atlas. It has no dependency on Phase 4, Campaigns, Heavens, Characters, combat or the future standalone VTT.

## Stable source and identity

`world_dungeon_site.geography_id` extends an existing location or a newly created independent World location. Reusing a location retains its name, context, parent and identity. A new site may have any existing geographic parent or none. Sites do not require settlement buildings or interior floors.

`world_dungeon_level.geography_id` identifies a level or significant section under the site, with context `dungeon level`. Optional classification, label, display order and depth/elevation notation describe the section; they neither identify it nor impose physical rules. Multiple `world_atlas_map` rows of kind `dungeon` may represent the same level. Sites and levels archive without deleting maps, source or connections. An archived site makes its levels unavailable.

`world_dungeon_entity.id` is independent of `world_atlas_dungeon_shape.id`. Rooms, caverns, meaningful corridors, transitions, traps, hazards and landmarks retain geography identities under their level, with context `dungeon`. Local walls, openings, furnishings, environmental drawings and annotations have durable lightweight entity IDs. They do not add an ordinary chair or rubble illustration to World geography. All support optional narrative descriptions/classifications. Geography remains authoritative for geographic names and descriptions.

Map duplication remaps drawing and vertex IDs, including wall attachments, while retaining semantic entities and the level. Individual object/place duplication creates a new semantic identity. Neither operation infers physical distance, elevation, reciprocity, origin or purpose.

## Shared editing and dedicated tools

`plan-editor.tsx` is the shared editor used by building interiors and dungeon maps. It reuses Atlas history, coordinates, revision protection, navigation guards, recovery downloads and source rendering. Existing interior JSON and tables remain unchanged. Dungeon-specific source, metadata, lifecycle and grids live in separate versioned contracts and tables.

Dungeon tools add round chambers, editable irregular caverns, width-controlled constructed or natural passage paths, environmental paths/surface areas, hazards, authored traps, secret passages and private annotations. Corridors can overlap and branch; floor fills are drawn after their outer borders so adjoining chambers/passages connect visually. Smooth natural paths remain editable point source. They do not perform pathfinding, fluid simulation, geology or movement rules.

Shared walls and openings retain endpoint identity, segment fraction, width and style. Real wall gaps remain visible. Invalid attached-segment edits are refused without overwriting source. Shared transform, duplication, archive/restore, undo/redo, geometry-point fields and draft-conflict recovery work for dungeon content. Labels derive from names and use size/collision suppression.

Existing `world_atlas_connection` records connect authored transitions to explicit destination maps and optional represented arrival geography. The shared destination validator checks World, lifecycle and actual destination representation for generic, settlement, interior and dungeon maps. No next-level links or reciprocal transitions are inferred. Multiple entrances can use existing map-to-place associations and explicit transitions. Browser visit history and geography ancestry remain distinct.

## Protected information

Entity visibility is `ordinary`, `secret` or `god-only`. Private author notes are separately stored. Every read, write, duplicate, thumbnail and preview uses the existing World authorization: owner access or explicit read-only Administrator review. Foreign G.O.D.s, Players, ordinary Administrator requests and anonymous callers receive no dungeon source. This pass creates no Player sharing or Campaign discovery state.

The owner-only `ordinary=1` Atlas projection runs after authorization and before serialization. It removes protected records, geographic descendants and their references, wall-attached source that loses its protected wall, and all private author notes. Protected passages disappear; excluded openings do not cut gaps in the remaining walls. The returned bundle is read-only. Ordinary previews retain the same private-World access boundary; they are not a player-safe VTT sharing feature. Editor layer visibility remains a presentation setting, not authorization. Author draft downloads contain protected information and are labeled accordingly.

## Grids, performance and safety

Each dungeon map stores its own version-1 grid: none/square/hex, visibility, size, offsets, pointy/flat orientation, snapping, opacity and optional authored scale text. Switching grids never transforms saved geometry. Explicit snapping affects newly drawn/dragged points only. Hex snapping rounds axial coordinates to the nearest center. Pattern overlays have no pointer targets and remain bounded through zoom/pan.

Source limits are 4,000 retained drawings/entities per map, 256 points per area/path, 64,000 total points, 512 retained levels per site, 256 retained maps per level and the existing twelve-megabyte Atlas request limit. Source loading includes only the selected dungeon map's drawings/entities. Other levels provide navigation metadata. JSON validators reject unknown fields, unsupported versions, invalid coordinates, malformed grids and oversized source. Composite World/level/map/entity foreign keys preserve associations. World-locked transactions and map/entity/geography revisions reject same-map and shared-entity stale writes atomically.

## Deployment and recovery

Migration `0111_worlds_atlas_dungeons.sql` follows finalized `0110_worlds_atlas_interiors.sql`. Older SQL/snapshots must remain unchanged. The upgrade rehearsal retains populated interior floors/rooms/drawings and compares every prior Atlas/settlement/interior/connection row; a fresh installation and migration reapplication must pass before release.

No new environment variables or services are required. After explicit authorization, verify target identity/ledger and backups, apply missing committed migrations in journal order, build/restart, then smoke-test owner authoring/Explore, ordinary projection, read-only Administrator review and previous systems.

Reverting code does not reverse the database migration. Older application code cannot author dungeon map kinds. Prefer a forward fix; if restoring a database backup, restore matching code and reconcile subsequent writes. Do not drop dungeon source or reinterpret it as generic/interior data to simulate rollback.
