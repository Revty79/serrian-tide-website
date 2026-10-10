# Atlas Pass 3E-C: dungeon sites, caverns and multi-level mapping

Starting checkpoint: `806906e6c804e8b695e674f65d541cb39e666fa3`, with finalized migrations through `0110`. The release checkpoint is the local commit containing this report; its exact SHA is supplied in the completion response. No remote push, deployment, schema push or Production database operation was performed. Phase 4 has not begun.

## Completed functionality

The Atlas library creates independent dungeon sites, sites under any authored geography, or dungeon extensions of existing locations. A building or settlement is optional. Reusing a location preserves its original geography, context, parent, name and description. Sites have persistent named levels or sections, optional classifications, display ordering, depth/elevation references, multiple map representations, and archive/restore. Neither ordering nor depth creates physical rules or connections.

The dedicated Dungeon Workshop supports rectangular, polygon and circular-looking chambers; irregular caverns; straight or smooth editable corridors and natural tunnels with width/appearance controls; water, chasm, rubble, cliff and surface drawings; attached doors, double doors, gates, passages and custom openings; stairs, ladders, ramps, lifts, shafts, hatches, portals and custom transitions; furnishings, landmarks, narrative traps/hazards, secret passages and private annotations. Joining floor fills remove arbitrary borders where corridors meet chambers. Boards/tiles are optional decorative floor patterns; square/hex guides are separate.

Selection, movement, persistent vertex editing/insertion/removal, resizing, rotation, individual duplication, archive/restore, undo/redo, save/reload, pan/zoom, name/description/classification fields, layer visibility/locking, draft downloads and conflict recovery operate on editable saved source. Invalid geometry and failed saves retain drafts. Native phone touch tests author a cavern, wall-attached opening and furnishing, move the furnishing, save/read it back, add another level, switch back and Explore.

Explore uses existing Atlas geography breadcrumbs, stable associations, explicit connections, optional represented arrival markers, visit history, direct URLs, reload and browser Back/Forward. A populated basement connects to an independent dungeon without replacing its building, floor or source identities. Branching and looping connections are explicit; reciprocal or consecutive-level connections are never inferred. Archived maps/sites/levels become unavailable while retained references survive restoration.

## Architecture and stable identities

See [dungeon architecture](../architecture/worlds-atlas-dungeons.md).

- `world_dungeon_site` extends a stable existing/new World geography location.
- `world_dungeon_level` extends stable geography under the site with context `dungeon level`; names, order and elevation are descriptive fields.
- `world_dungeon_entity` stores stable entities under their level. Rooms, caverns, corridors, transitions, traps, hazards and landmarks retain geography IDs with context `dungeon`. Walls, openings, furnishings, terrain and annotations use lightweight durable entity IDs.
- `world_atlas_dungeon_shape` stores versioned source independently of the entity identity. Map duplication creates new drawing/vertex IDs and remaps door attachments while retaining semantic entities and the level. Individual duplication creates distinct entity/geography IDs deliberately.
- The existing Atlas connection table holds destination map and optional represented arrival geography. A shared validator checks active same-World destinations for generic, settlement, interior and dungeon maps.
- `plan-editor.tsx` extracts the significant 3E-B editing logic into one shared editor. The existing interior editor becomes a thin wrapper. Dedicated dungeon contracts, renderer, tables, grids and protected fields do not broaden the old interior source schema.
- World-locked transactions and map/entity/geography revisions protect same-map and shared-entity writes. Composite foreign keys retain World/level/map/entity relationships. Saved representations cannot disappear from incomplete drafts.

## Secrets, notes and access

Entities distinguish `ordinary`, `secret` and `god-only` visibility. Private author notes are stored separately. All authoring, direct reads, duplication, lifecycle operations, thumbnails and previews retain existing World owner authorization and explicit read-only Administrator review. Foreign G.O.D.s, Players, anonymous callers and ordinary Administrator requests cannot retrieve or mutate another owner's dungeon.

The owner-only `ordinary=1` server projection removes protected entities, their geographic descendants and references, source attached to excluded walls, and private notes before serialization. Excluded openings do not leave visible gaps in retained walls. It also filters protected map/arrival references and returns `canEdit:false`. Layer visibility is presentation only. Author draft downloads explicitly contain protected author data. No public/Player sharing, discovery state or player-safe VTT export is introduced.

## Grids and limits

No-grid, square and hex settings persist per map, including visibility, size, X/Y offsets, pointy/flat orientation, opacity, optional snapping and free-text scale. Changing settings never moves existing geometry. Live pointer authoring snaps only when explicitly enabled; hex snapping uses nearest centers. Pattern overlays have no pointer targets. Grids do not execute movement, distance or combat rules.

Validated limits: 4,000 retained shapes/entities per map, 256 vertices per area/path, 64,000 total vertices per map, 512 retained sections per site, 256 retained maps per section, and the existing 12 MB Atlas request cap. Only the selected dungeon level map loads its artwork/entities; other levels provide navigation metadata. Names, private notes and descriptions have bounded lengths. Database JSON validators reject unknown keys, unsupported versions and malformed source.

## Verification

The production browser suites use isolated PostgreSQL 18 databases and actual built Next.js applications, with authenticated persisted fixtures. They do not use the configured DEV/Production database for writes.

| Command | Result |
| --- | --- |
| `npm.cmd run validate:worlds` | 78/78 passed |
| `npm.cmd run validate:worlds-disposable` | Passed: full populated upgrade, production build/TypeScript and all Worlds/Atlas browser regressions |
| `npm.cmd run validate:catalog-pass-three` | 298/298 passed |
| `npm.cmd run validate:catalog-visibility-db` | 52/52 across seven suites passed; fresh migrations through 0111 |
| Navigation/authorization/appearance/lifecycle/authentication/Campaign unit command below | 170/170 passed |
| Forms/Evolution/Combat/Character/inventory/firearm unit command below | 143/143 passed |
| `npm.cmd run validate:password-recovery` | Passed: production build, desktop keyboard toggles, role recovery setup, anonymous phone reset, one-use/expiry/concurrency/session invalidation, origin and rate-limit checks |
| `npx.cmd tsc --noEmit --incremental false` | Passed |
| `npm.cmd run lint` | Passed |
| `npx.cmd drizzle-kit check` | Passed |
| `npx.cmd drizzle-kit generate` | Passed: no schema changes; no additional migration generated |
| `git diff --check` | Passed |

The full Worlds harness invokes `node node_modules/next/dist/bin/next build` with a disposable `DATABASE_URL` and isolated output directory, then starts that production build for browser checks. It compares existing application data before/after migration and authoring. The focused `npm.cmd run validate:worlds-disposable -- --dungeon-only` iterations also ran the upgrade/services/build; intermediate browser failures exposed fixture ordering and ambiguous modal/control selectors, which were corrected. Grid Apply/save behavior, shared symbol theme variables, Next native-history preview updates and canvas text-selection during panning were fixed before final verification. The final pan test scrolls the canvas into view and verifies the SVG viewBox changes without selecting page text.

Exact additional unit commands:

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/navigation/*.test.ts src/features/authorization/*.test.ts src/features/appearance/*.test.ts src/features/lifecycle/*.test.ts src/features/authentication/*.test.ts src/features/campaigns/*.test.ts
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/forms/*.test.ts src/features/evolutions/*.test.ts src/features/combat-screen/*.test.ts src/features/characters/character-creation.test.ts src/features/characters/attribute-reference.test.ts src/features/characters/character-attribute-card.test.ts src/features/characters/character-print.test.ts src/features/items/firearm-timing.test.ts src/features/items/firearm-timing-integration.test.ts src/features/characters/item-ammunition-parity.test.ts src/features/characters/character-sheet-rules.test.ts src/features/characters/firearm-baseline-migration.test.ts
```

Upgrade rehearsals populate existing calendars, history, geography, maps, drawings, settlement buildings, interior floors/rooms/source, connections and active application data before applying 0111. Every previous Atlas/settlement/interior/connection row projection remains equal; existing map rows only gain default dungeon state. Prior source/provenance and historical date representations remain unchanged. Fresh installation, complete disposable migration ledger and migrator reapplication pass. Published SQL/snapshots through 0110 remain untouched.

The read-only `npm.cmd run validate:migration-ledger` against local `serrian_tide_dev` returned the expected pending-migration mismatch: 111 applied entries versus 112 repository entries. DEV remains at 0110. This is not a disposable upgrade failure; 0111 awaits controlled application. No configured database was migrated.

Final browser checks cover the independent five-level complex, original building-connected basement, room/cavern points, real attached gaps, traps and secrets, both grids without source rewriting, live snapping, individual/map duplication, archives, same-map and cross-map two-tab conflicts with retained losing drafts, server-redacted JSON, explicit arrivals/Back/Forward/reload, native phone persistence, role denial and read-only Administrator review. Existing interiors, settlements, connected maps, generation/refinement, chronology/calendars/history, era-label positioning, tag discovery and navigation/privacy regressions are included.

## Screenshots and dense-map observations

107 actual PNG captures are included. Evidence: [Pass 3E-C directory](../screenshots/worlds-atlas-pass-3e-c/). [files.json](../screenshots/worlds-atlas-pass-3e-c/files.json) inventories every screenshot and measurement with size/hash. Captures come from production-built applications and persisted test data, including full desktop/phone pages and native phone viewport captures. Earlier pass evidence is preserved. Inspected actual desktop dungeon/grid/ordinary-preview/dense-map and basement navigation screenshots plus native 390 x 844 phone workshop and exploration captures. Symbols, floor joins, grids and wall gaps are readable; no page overflow or pan-induced text selection remains.

The dense fixture has 810 retained objects: 80 chambers/caverns, 80 editable passages and 650 furnishings/hazards, alongside a five-level site. Browser measurements and confirmed zero other-level artwork loads are recorded in [performance.json](../screenshots/worlds-atlas-pass-3e-c/performance.json). Source read 52 ms; payload 415,746 bytes; map open 468 ms; selection 105 ms; edit 83 ms; save 982 ms; pan/zoom 661 ms; level switch 71 ms. Other-level source count: zero. Timings are observations from this Windows/Chrome test machine, not guarantees for other devices. Existing dense interior/settlement regressions have separate metrics under `regressions/`.

## Exact changed files

Created:

- `docs/architecture/worlds-atlas-dungeons.md`
- `docs/reports/worlds-atlas-pass-3e-c-2026-10-10.md`
- `drizzle/0111_worlds_atlas_dungeons.sql`
- `drizzle/meta/0111_snapshot.json`
- `scripts/worlds-dungeon-checks.ts`
- `src/features/worlds/atlas-destinations.ts`
- `src/features/worlds/dungeon-levels.tsx`
- `src/features/worlds/dungeon-projection.ts`
- `src/features/worlds/dungeon-scene.tsx`
- `src/features/worlds/dungeon-service.ts`
- `src/features/worlds/dungeon.module.css`
- `src/features/worlds/dungeon.test.ts`
- `src/features/worlds/dungeon.ts`
- `src/features/worlds/plan-editor.tsx`

Modified:

- `docs/architecture/worlds-atlas-roadmap.md`
- `drizzle/meta/_journal.json`
- `scripts/worlds-interior-checks.ts`
- `scripts/worlds-pass-one-disposable.test.ts`
- `src/app/api/worlds/[worldId]/atlas/route.ts`
- `src/db/world-atlas-schema.ts`
- `src/features/worlds/atlas-explorer.tsx`
- `src/features/worlds/atlas-navigation.ts`
- `src/features/worlds/atlas-service.ts`
- `src/features/worlds/atlas-thumbnail.tsx`
- `src/features/worlds/atlas-workspace.tsx`
- `src/features/worlds/atlas.ts`
- `src/features/worlds/cartography-scene.tsx`
- `src/features/worlds/interior-editor.tsx`
- `src/features/worlds/interior-floors.tsx`
- `src/features/worlds/interior-scene.tsx`
- `src/features/worlds/interior-service.ts`

Screenshot and measurement files under `docs/screenshots/worlds-atlas-pass-3e-c/` are enumerated individually in that directory's `files.json` inventory.

## Controlled deployment and recovery

Required migration: `0111_worlds_atlas_dungeons.sql`, after finalized `0110_worlds_atlas_interiors.sql`. SQL, snapshot and journal are versioned together. Apply any genuinely missing earlier migrations in committed journal order; do not edit published migrations or use schema push. No new environment variables, email services or external services are required.

After explicit authorization:

1. Verify the release commit, server/application target, database identity and applied migration ledger. Protect a verified database backup and the currently running release.
2. Rehearse against a restored disposable copy of the target data. Prepare/build the complete application release before activation.
3. During the controlled release window, run the established `npx drizzle-kit migrate` process against the verified target, through 0111, then activate/restart the matching application release.
4. Smoke-test owner dungeon creation/edit/save/reopen, level switching, attached gaps, grids, protected preview and basement arrivals; verify denied foreign/Player access and read-only Administrator review. Check existing Worlds/history/calendars, interiors/settlements, Heavens, Campaigns and authentication.

Reverting code does not reverse 0111 or the ledger. Older application code cannot author dungeon map kinds; do not expose new dungeon data to older writers. Prefer a reviewed forward fix. If backup restoration is needed, stop writers, preserve post-backup data for reconciliation, restore a verified target, and deploy code compatible with that schema/ledger. Never drop dungeon source, rewrite it as interior/generic artwork or delete migration ledger rows to imitate rollback.

## Boundaries, limitations and readiness

This delivers functional structural cartography, not the future artistic overhaul, automatic generation, 3D, encounters, trap execution, tokens, fog of war or VTT. Unconventional geometry and disconnected/looping relationships are author controlled. Ordinary preview remains private and owner/Admin authorized; Player sharing requires a separately authorized model. Large retained sources are bounded; archived records still consume limits. Local measurements do not establish hardware-independent performance.

Gameplay runtime, Heavens/Paths, Campaign state/time, Characters, combat, inventory and authentication implementation remain untouched. Worlds remains standalone. Historical map evolution remains Phase 6B; Phase 4 has not begun. The homepage is unchanged.

No unresolved implementation or verification blockers remain. Pass 3E-C is independently deployable and ready for an authorized GitHub push and controlled server deployment with migration 0111. No subsequent development pass is required. DEV and Production remain unmigrated by this work; the target ledger must be checked before applying pending migrations. Stop at this checkpoint for approval.
