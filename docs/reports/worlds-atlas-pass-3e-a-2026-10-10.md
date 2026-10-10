# Atlas Pass 3E-A: settlement maps

Starting checkpoint: `fd8b700a59e830079216f06d7eb67752305adccd`, with published migrations through `0108`. The release checkpoint is the clean local commit containing this report; the exact SHA is supplied in the completion message. No remote push, deployment or Production database operation is authorized or performed.

## Delivered functionality

Creators can choose an existing settlement or create one together with a dedicated map. A separate settlement classification opens a specialized workshop with editable streets, lanes/trails/bridges, rectangular and irregular buildings, overlapping districts, walls, waterways, open spaces and landmarks. Names, detailed descriptions and custom classifications remain optional beyond a place's name; conventional architecture, districts, roads, walls and origin explanations are never required.

The workshop provides selection, native pointer/touch drawing, drag movement and vertex editing, coordinate controls, midpoint insertion/removal, rotation, resizing, duplication, archive/restore, undo/redo, persistent layer visibility/locking, save and reload. Unapplied fields, unfinished paths, navigation and stale revisions receive explicit protection. Failed saves retain the draft for comparison and download. The existing terrain/artwork editor remains available and preserves settlement source when saving the background.

Explore uses the existing connected Atlas navigation, deep URLs, browser history, geographic breadcrumbs and place information. Multiple maps represent the same settlement without copying its identity. Explicit adoption preserves a generic map's source and ID; existing maps are never converted automatically.

## Architecture and compatibility

See [settlement architecture](../architecture/worlds-atlas-settlements.md). Existing `world_geography.id` remains the semantic identity of settlements, buildings, districts and important landmarks. New settlement entities extend a location rather than replacing it. Building geography can anchor future interior maps without changing its ID. District memberships are separate many-to-many relationships, so overlapping areas do not compete for a single geographic parent.

Version-1 settlement representations have their own stable IDs and retained vertex IDs, independent of names, coordinates and drawing order. Duplicating a map makes new representations while retaining the semantic entities. Duplicating an individual object deliberately creates a new semantic place. Archiving a representation retains its source and relationships; referenced semantic geographies cannot be deleted or archived out from under their maps.

Additive migration `0109_worlds_atlas_settlements.sql` adds map classification/layer state plus entity, membership and representation tables. Composite foreign keys enforce the same World, settlement and map subject; strict JSON validators enforce the versioned geometry and layer contract. Earlier SQL, snapshots, geography rules, cartographic presentation v1 and generation algorithms remain unchanged. Existing geometry validation was extracted into a shared module without changing its rules.

Targeted reads load one map's settlement source plus shared entity metadata for its settlement. Unrelated settlements' building descriptions and shape source are omitted. Library source loads lazily for visible thumbnails. No second ownership, tag, sharing or map-rendering system was introduced.

## Verification

Executed against the current implementation:

| Command or check | Result |
| --- | --- |
| `npm run validate:worlds` | 62/62 units pass, including exact movement/rotation/resizing, retained identities, geometry refusal and expanded source limits. |
| `npm run validate:worlds-disposable` | Full suite passes: existing-data upgrades, ledger/reapplication checks, services, isolated production build/TypeScript and production-browser workflows for all previous Worlds/Atlas passes plus settlements. |
| `npm run validate:catalog-pass-three` | 298/298 catalog, Race, Creature, Skill, Derived Ability and access/navigation regressions pass. |
| `npm run validate:catalog-visibility-db` | 52/52 tests across seven suites pass on the complete fresh migration chain through 0109, including existing catalog ownership/privacy, retained references, account deletion and Derived Ability runtime. |
| Navigation/authorization/appearance/lifecycle/Campaign units below | 135/135 pass. |
| Forms/Evolution/Combat screen/focused Character/firearm units below | 127/127 pass. |
| `npm run lint` | Full repository lint passes; focused lint also passes after the final geometry/test correction. |
| `npx drizzle-kit check` and `npx drizzle-kit generate` | Check passes; generation reports no schema changes and creates no additional migration. |
| `npm run validate:password-recovery` | Passes with a separate production build: keyboard show/hide controls, recovery setup for every role, hashed/replaced/downloaded codes, concurrent consumption/expiry, phone recovery, password/session/token invalidation, CSRF and rate limiting. |
| `npm run typecheck` | Final standalone TypeScript check passes after both harnesses restore the normal configuration. |
| `git diff --check` | Passes. |

The additional unit commands were:

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/navigation/*.test.ts src/features/authorization/*.test.ts src/features/appearance/*.test.ts src/features/lifecycle/*.test.ts src/features/authentication/*.test.ts src/features/campaigns/campaign-membership.test.ts src/features/campaigns/campaign-workflow.test.ts
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/forms/*.test.ts src/features/evolutions/*.test.ts src/features/combat-screen/*.test.ts src/features/characters/character-creation.test.ts src/features/characters/attribute-reference.test.ts src/features/characters/character-attribute-card.test.ts src/features/characters/character-print.test.ts src/features/characters/character-sheet-rules.test.ts src/features/characters/item-ammunition-parity.test.ts src/features/characters/firearm-baseline-migration.test.ts
npx eslint src/features/worlds/settlement.ts src/features/worlds/settlement.test.ts scripts/worlds-settlement-checks.ts
```

The authentication glob has no unit files; password recovery is verified separately by its disposable production-browser regression. The selected unit suites overlap, so their totals are not a count of unique application tests.

The migration rehearsal retains old historical date/source representations, chronology/calendar versions, maps, drawings, geography IDs, procedural recipes and Pass 3D associations/preferred connections. Rows before 0109 are compared exactly after removing only the new map columns. Fresh installation and repeated migration application succeed. Campaign/combat/Form/Evolution and catalog fixture snapshots remain unchanged after all Worlds workflows.

Settlement service tests exercise same-World/settlement foreign keys, strict JSON CHECK constraints, invalid compound-creation rollback, retained source, multiple chart representations, cross-map semantic conflicts, deliberate adoption with retained artwork, targeted reads and role privacy. Browser scenarios cover actual creation of all object categories, properties and overlapping districts, stable source through save/reopen and background editing, movement/rotation/resizing, point edits, object duplication, archive/restore, undo/redo, locked layers, losing-tab draft retention, parent-map navigation, reload/Back/Forward and native phone drawing/movement/save/Explore. Foreign G.O.D.s, ordinary Administrator access, Players and anonymous callers are denied; explicit Administrator review is read-only and forged mutation fails.

The complete existing browser suite also verifies measured era-label positions, independent historical dates and Campaign time, calendar evolution, native coast/terrain/path editing, description generation, frozen v1/v2 recipes, dense 5,200+ terrain-mark navigation/editing and native PNG export. No gameplay code was changed.

An early dense-browser run found that the new transform's vertical calculation used the horizontal cosine term, collapsing unrotated footprints. It was corrected before completion; exact coordinate regressions and the full browser rerun pass. Native phone movement now also checks saved coordinates rather than only taking a screenshot. All final checks pass. The separate homepage commit `86be939` remains in the release ancestry and homepage source was not modified.

## Screenshots and performance

Evidence is committed under [worlds-atlas-pass-3e-a](../screenshots/worlds-atlas-pass-3e-a/README.md): 11 settlement captures, nine connected-navigation captures and 19 prior generation/refinement PNG artifacts. The 39 PNG files comprise 38 browser captures and one native map export. The manifest includes every evidence file and three measurement JSON files. Previous pass screenshot directories are unchanged.

Actual desktop editor/Explore, phone editor/Explore and dense editor images were inspected. The interface wraps without phone horizontal overflow; building properties, descriptions, memberships and source remain usable. Dense/overlapping labels can collide at fit scale. There is no automatic label collision layout in this foundation pass.

The representative dense settlement has 900 buildings, 24 routes, two districts and four additional objects (930 representations). Recorded production-browser observations on this machine: opening 1,044.7 ms, selection 112.7 ms, nudge/save/readback 1,573.1 ms and Explore navigation 549.1 ms. See [measurements](../screenshots/worlds-atlas-pass-3e-a/performance.json). These timings include workflow/network/database costs and are not device-independent guarantees. Existing dense native-terrain regression measurements are retained alongside the new captures.

## Limits and future work

The contract allows 4,000 retained settlement representations and semantic entities per draft, 256 points per object and 64,000 total settlement points, including archived source. Entity metadata is shared across representations of the same settlement. Requests are bounded at 12 MB, so very long descriptions can reach the payload limit earlier. The searchable object list displays the first 200 matching representations; all retained map objects remain rendered. Legacy feature/drawing and terrain limits are preserved.

This is a functional foundation rather than the final professional cartography polish. Paths intersect visually; there is no traffic, hydrology, automatic street routing or city generation. Gates/towers are editable landmarks and bridges are styled routes. Secret-content redaction and public/player sharing are not introduced; hiding a layer does not make its contents private. Performance figures are single-run local observations, not device-wide guarantees.

3E-B interiors, 3E-C dungeons and gameplay/VTT integration were not implemented. Worlds remains a standalone application. Future VTT development belongs to a separate dashboard application, not Worlds or Paths. Existing Heavens, Campaigns, Characters, Creatures, Shops, combat, inventory and authentication runtime are unchanged.

## Controlled deployment and recovery

No new environment variable, mail provider, external service or asset configuration is required.

1. After explicit authorization, push the tested release commit including migrations, snapshots, documentation and screenshots. Verify the exact deployed commit and target database identity/ledger.
2. Stage the production build and preserve the currently running release. Take and verify a database backup. Rehearse the target's pending migration chain on a disposable copy before changing the server.
3. Pause writers. Apply committed migrations in journal order with the normal operator-managed `npx drizzle-kit migrate` process. `0109` follows `0108`; apply any earlier pending migrations first. Do not use schema push or edit an applied migration.
4. Activate the matching application build. Smoke-test owner creation/save/reopen, connected Explore, foreign-user denial, explicit read-only Administrator review and existing authentication/Heavens routes before resuming writes.

A Git revert does not undo a migration or its ledger entry. The new schema is additive, but older writers do not understand settlement metadata, representation retention or protected entity parents. Keep those writes paused during fallback. Prefer a forward fix. If restoring is necessary, preserve post-backup changes for reconciliation, stop writers, restore only into a verified target and align the application, schema and migration ledger before restarting. Do not delete new tables or ledger rows to force an old checkout to appear current.

## Changed files

Complete inventory (73 files):

```text
AGENTS.md
docs/architecture/worlds-atlas-roadmap.md
docs/architecture/worlds-atlas-settlements.md
docs/reports/worlds-atlas-pass-3e-a-2026-10-10.md
docs/screenshots/worlds-atlas-pass-3e-a/README.md
docs/screenshots/worlds-atlas-pass-3e-a/building-properties.png
docs/screenshots/worlds-atlas-pass-3e-a/connected-navigation.png
docs/screenshots/worlds-atlas-pass-3e-a/dense-settlement-explore.png
docs/screenshots/worlds-atlas-pass-3e-a/dense-settlement.png
docs/screenshots/worlds-atlas-pass-3e-a/desktop-settlement-editor.png
docs/screenshots/worlds-atlas-pass-3e-a/desktop-town-map.png
docs/screenshots/worlds-atlas-pass-3e-a/district-properties.png
docs/screenshots/worlds-atlas-pass-3e-a/mobile-settlement-editor.png
docs/screenshots/worlds-atlas-pass-3e-a/mobile-settlement-explore.png
docs/screenshots/worlds-atlas-pass-3e-a/performance.json
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/breadcrumbs.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/continent-selection.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/dense-exploration.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/navigation.json
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/phone-connections.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/phone-region.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/phone-town.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/place-information.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/regional-towns.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/connected/world-connected.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/archipelago.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/continental-world.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/description-controls.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/description-driven.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/edited-generated-map.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/generation-controls.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/northern-continent.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/phone-description-map.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/phone-description.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/phone-editor.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/phone-generation.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/generation/rugged-world.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/broken-archipelago.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/chaotic-world.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/dense-export.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/dense-map.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/description-after.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/description-before.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/dramatic-continent.png
docs/screenshots/worlds-atlas-pass-3e-a/regressions/refinement/performance.json
docs/screenshots/worlds-atlas-pass-3e-a/settlement-explore.png
docs/screenshots/worlds-atlas-pass-3e-a/streets-footprints.png
drizzle/0109_worlds_atlas_settlements.sql
drizzle/meta/0109_snapshot.json
drizzle/meta/_journal.json
scripts/worlds-connected-geography-checks.ts
scripts/worlds-pass-one-disposable.test.ts
scripts/worlds-settlement-checks.ts
src/app/api/worlds/[worldId]/atlas/route.ts
src/db/world-atlas-schema.ts
src/features/guidance/page-help.ts
src/features/worlds/atlas-explorer.tsx
src/features/worlds/atlas-geometry.ts
src/features/worlds/atlas-map-editor.tsx
src/features/worlds/atlas-navigation.ts
src/features/worlds/atlas-record-editor.tsx
src/features/worlds/atlas-service.ts
src/features/worlds/atlas-thumbnail.tsx
src/features/worlds/atlas-workspace.tsx
src/features/worlds/atlas.ts
src/features/worlds/cartography-scene.tsx
src/features/worlds/cartography.module.css
src/features/worlds/settlement-editor.tsx
src/features/worlds/settlement-scene.tsx
src/features/worlds/settlement-service.ts
src/features/worlds/settlement.module.css
src/features/worlds/settlement.test.ts
src/features/worlds/settlement.ts
```

## Deployment readiness

Ready for an explicitly authorized GitHub push and controlled server deployment after migration 0109. No environment changes or subsequent pass are required. There are no remaining functional or validation blockers. No push, deployment or Production migration was performed. Stop here for review; 3E-B and 3E-C require separate authorization.
