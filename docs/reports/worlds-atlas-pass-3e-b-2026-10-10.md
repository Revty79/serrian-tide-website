# Atlas Pass 3E-B: building interiors and multi-level floor plans

Starting checkpoint: `6417bd8448f0ce73407a7d79352e66d52b5fdc84`, with finalized migrations through `0109`. The release checkpoint is the clean local commit containing this report; its exact SHA is provided in the completion response. No remote push, deployment, schema push or Production database operation was performed. Pass 3E-C has not begun.

## Completed functionality

An owner can select an existing settlement building and create its interior, or create/access floor maps through the Atlas library. The dedicated editor supports rectangular and irregular polygon rooms; connected straight/angled wall paths and partitions; wall-attached doors, double doors, passages, entrances, gates, custom openings and windows; stairs, ladders, lifts, ramps, shafts, hatches, portals and custom transitions; and original vector furnishing representations for tables, chairs, beds, shelves, cabinets, desks, counters, chests, fireplaces, columns, machinery, decoration and custom objects.

Selection, dragging, coordinate and boundary-point editing, midpoint insertion/removal, resizing, rotation, duplication, archive/restore, undo/redo, save/reload, pan/zoom, independent layer visibility/locking, narrative information and recovery downloads operate on saved editable source. Unfinished drawings and unapplied fields are protected. Failed saves retain drafts for comparison/download. A phone test found that a valid opening position could fail the input's step constraint; the field now accepts its actual fraction, and native touch placement/application/save passes.

Floor controls show the original building, current floor, optional classification/level/elevation references, explicit alternate-map choices, floor information and exterior returns. Display ordering never changes floor IDs. Floors can remain disconnected, larger than their exterior footprint, non-linear or otherwise unconventional. No origin, construction method, numerical floor label, physical height, staircase sequence or room/wall requirement is imposed.

The existing Explorer reads rooms and meaningful objects, follows authored stair/portal destinations with optional arrival places, switches floors, returns to the exterior, and retains geographic breadcrumbs, map trails, direct URLs, reload and browser navigation. Floor/map archives make destinations unavailable while retaining connections for restoration. Owners retain editing access; foreign G.O.D.s, Players, anonymous users and ordinary Administrator requests remain denied. Explicit Administrator review is read-only.

## Architecture and identities

See [interior architecture](../architecture/worlds-atlas-interiors.md) for the contracts and rationale.

- The existing 3E-A building geography ID is reused; creating interiors never creates another building.
- Floors are stable `world_geography` locations with context `interior`, parented to their building, with a same-World `world_interior_floor` extension. Several `interior` maps can represent one floor.
- Rooms, transitions and landmarks retain geography IDs under their floor. Lightweight furnishing, wall and opening entities retain durable IDs and narrative fields without creating geography records for ordinary chairs. Shape/vertex identities are separate.
- Map duplication creates new drawing/vertex IDs and remaps wall attachments while retaining the floor and semantic entities. Individual room/object duplication creates new semantic identities. Wall duplication also copies its attached openings.
- Existing `world_atlas_connection` records hold explicit transition destinations. Optional arrival geography identifies an existing represented destination place. Connections are never inferred from ordering or parentage. Future dungeon map kinds can reuse these relationships; no dungeon editor or VTT runtime was implemented.
- World-locked transactions and optimistic map, geography, entity and floor revisions reject stale same-map and cross-map edits. Retained source cannot be silently omitted. Composite foreign keys and service validation reject forged same-World/floor relationships and invalid geometry atomically.

Openings store their wall representation, adjacent endpoint identities, center fraction, width and style. Wall strokes are split around actual gap intervals before door/window details are drawn. Transformations preserve valid attachments. Removing an attached segment, shortening it beyond the opening's width or archiving its wall alone produces an explicit correction. Hidden/locked opening layers prevent indirect wall edits. Source labels derive from names and geometry; their layer lock protects inspector name editing. Size and collision reduction keep labels readable.

Targeted reads load only the selected interior's artwork and referenced entities. Other floors supply navigation metadata. Library thumbnails fetch visible source lazily. Each map supports 4,000 retained representations/entities, 256 points per room/wall and 64,000 source points; buildings support 512 retained floors. The existing 12,000,000-byte Atlas request guard applies. These are technical source limits, independent of architecture or physical laws.

## Migration and preservation

Additive `0110_worlds_atlas_interiors.sql` follows `0109_worlds_atlas_settlements.sql`. It adds `world_interior_floor`, `world_interior_entity`, `world_atlas_interior_shape`, interior map classification/layer state, optional transition arrival geography, version-1 JSON validators, indexes and same-World relationships. All finalized SQL and snapshots through 0109 remain unchanged.

Upgrade rehearsal inserts actual pre-0110 settlement/building geometry, snapshots every existing Atlas/settlement table, applies 0110 and compares retained row projections. Geography/map identities, editable source, recipes and connections remain unchanged. Fresh installation through 0110 and reapplication pass. Existing History/date representations, calendars, Campaign/combat/Form/Evolution snapshots and catalog privacy remain protected.

No implementation changes were made to the homepage, Heavens, Characters, Campaigns, combat, Forms, Evolutions, inventory or authentication. The separate homepage checkpoint is preserved. No gameplay movement, equipment, NPC, encounter, token, fog, public sharing, Canon or cross-application runtime integration was introduced.

## Verification

| Command/check | Result |
| --- | --- |
| `npm run validate:worlds` | 70/70 pass, including exact gaps, attachment transforms/refusals, object transforms, remapped duplicate IDs and strict layer contracts. |
| `npm run validate:worlds-disposable` | Full upgrade/service/isolated production-build/browser suite passes: previous Worlds, chronology, calendar evolution, Atlas/cartography, connected geography, settlements, generation/refinement, dense maps, PNG exports and privacy. |
| `npm run validate:worlds-disposable -- --interior-only` | Passes: focused production build/browser workflow, unobscured evidence capture and integrated dense interaction measurements. |
| `npm run validate:catalog-pass-three` | 298/298 catalog/Race/Creature/Skill/Derived Ability regressions pass. |
| `npm run validate:catalog-visibility-db` | 52/52 across seven suites pass on the full fresh migration chain through 0110. |
| Navigation/authorization/appearance/lifecycle/authentication/Campaign units | 135/135 pass. |
| Forms/Evolution/Combat screen/focused Character/firearm units | 127/127 pass. |
| `npm run validate:password-recovery` | Separate production build/browser suite passes: keyboard toggles, all-role setup, hashed/replaced/downloaded codes, concurrent use/expiry, phone recovery, password/session/token invalidation, CSRF and rate limiting. |
| `npm run lint` | Full repository lint passes. |
| `npm run typecheck` | Standalone check passes after isolated harness configuration restoration. |
| `npx drizzle-kit check` / `npx drizzle-kit generate` | Check passes; generation reports no schema changes and creates no extra migration. |
| `git diff --check` / staged diff check | Pass. |

Browser checks exercise at least five different floors including a basement, then create another through the exterior UI. They verify room information/point edits, actual wall-gap SVG paths, invalid segment refusal, layer locking, furnishing transforms/duplication/archive/restore, undo/redo, distinct physical-room duplication, unfinished/unapplied-field guards, same-map and shared-room cross-map conflicts with retained drafts, non-linear stairs with an arrival transition, a portal bypass, destination archive/restore, browser history/reload and exterior returns. Native phone input creates/edits a room, places a wall-attached door, moves a furnishing, saves exact coordinates/IDs, switches floors and explores without horizontal overflow. All relevant roles and explicit read-only review are exercised.

## Evidence and performance

Actual production-built evidence is committed under [worlds-atlas-pass-3e-b](../screenshots/worlds-atlas-pass-3e-b). Its 52 PNGs comprise 13 primary images and 39 prior-pass regression captures. Primary images cover the desktop editor, completed floor, room/opening/furnishing properties, basement navigation, authored stair arrival, Explore, exterior floor choices, phone editing/Explore and dense source. Further captures preserve prior-pass regression evidence. Images were visually reviewed; primary captures start at page top to keep fixed navigation from obscuring evidence. `files.json` lists every artifact. `performance.json` records loading, selection, exact-coordinate editing, saving, floor switching and pan measurements.

Dense source contains 960 retained object representations and 402,025 bytes of selected-map JSON, with no artwork from other floors in that response. Final measurements: source read 41 ms, editor open 297 ms, selection 83 ms, geometry edit 91 ms, save/readback 993 ms and floor switch 65 ms; the pan interaction took 988 ms. Timings are local end-to-end observations including automation, not hardware-independent guarantees. The multi-floor authored building also exercises real rooms, partitions, doors, windows, stairs, portals, furnishings and landmarks. Synthetic fixtures exist only in disposable test databases.

## Limitations and deployment readiness

Rooms/walls use editable straight/angled polygonal source, without spline walls, structural simulation or physical constraints. Labels derive from names rather than independent label drawings. Furnishings use original vector starter illustrations. Uploaded background assets, 3D rendering, procedural buildings, dungeon construction and VTT integration are future work. Curved-looking arrangements can use additional vertices.

Pass 3E-B is independently functional, with no dependency on 3E-C. No new environment variables, external services or configuration changes are required. After the listed checks, there are no remaining functional or deployment-readiness blockers.

Controlled deployment requires explicit authorization: verify release SHA and target database/ledger, protect a verified backup and current release, apply every missing committed migration in journal order with `npx drizzle-kit migrate` through 0110, build/restart the application, and smoke-test owner authoring/Explore, read-only review and existing authentication/navigation. Never use schema push or edit an applied migration.

A code revert does not undo this migration. Once interiors exist, older code does not understand their map kind: retain the backup and prefer a forward fix. If database restoration is required, restore a matching application/database checkpoint and account for subsequent writes. Do not drop retained source or reinterpret interiors as generic maps to simulate rollback. Ready for an authorized GitHub push and controlled server deployment; neither was performed.

## Exact files

Created: `src/features/worlds/interior.ts`, `interior.test.ts`, `interior-service.ts`, `interior-editor.tsx`, `interior-scene.tsx`, `interior-floors.tsx`, `interior.module.css`; `scripts/worlds-interior-checks.ts`; `drizzle/0110_worlds_atlas_interiors.sql`; `drizzle/meta/0110_snapshot.json`; `docs/architecture/worlds-atlas-interiors.md`; this report; evidence files listed in `docs/screenshots/worlds-atlas-pass-3e-b/files.json`.

Modified: `src/db/world-atlas-schema.ts`; `src/features/worlds/atlas.ts`, `atlas-service.ts`, `atlas-workspace.tsx`, `atlas-explorer.tsx`, `atlas-navigation.ts`, `atlas-connections.tsx`, `atlas-thumbnail.tsx`, `cartography-scene.tsx`, `settlement-editor.tsx`; `scripts/worlds-pass-one-disposable.test.ts`, `scripts/worlds-settlement-checks.ts`; `drizzle/meta/_journal.json`; `docs/architecture/worlds-atlas-roadmap.md`. Settlement screenshot capture accepts a destination directory so previous-pass images remain unchanged. Temporary build configuration/artifacts are restored or excluded from the commit.
