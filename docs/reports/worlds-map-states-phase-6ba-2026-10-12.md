# Worlds Phase 6B-A completion — 2026-10-12

Starting commit: technically approved `92281e00005bb8fb8cbbd78ef2eaea613dd7e5ed`. The checkout was clean before implementation. All completed creator, linking, Atlas, History/calendar/timeline and Phase 6A work is preserved. This report belongs to the local release commit identified in the completion handoff, titled **Add Worlds historical map appearances**.

## Delivered behavior

An existing generic Atlas map now has a historical appearance workshop. The author can choose an inclusive World-year period, create an appearance from the shared baseline or another retained appearance, edit genuine coastlines and drawing content with the existing Map Maker, save, switch between earlier/later periods and baseline, and reload those sources. Local names/descriptions and presentation can differ without changing shared place metadata or another timeline's artwork. River source added in service validation and coastline movement performed in desktop/native-touch browsers render through the actual cartography engine.

Historical viewing is read-only until deliberately enabled. Source accounts, captured baseline revisions, original/retained/interpretation modes and prior immutable revisions remain available. Failed saves retain drafts; concurrent edits use the existing comparison/download recovery. An acknowledged save followed by failed readback reports that the appearance was saved and offers direct recovery without another creation. Individual appearances, whole maps and alternate timelines retain sources during archive/restore.

`editMap` and `mapYear` preserve the opened map and requested year. Explore follows existing connected destinations with that time context. A requested year inside a period remains the same year through information saves and editor/Explore transitions. Unknown destination coverage is labeled clearly. Realm links retain their existing map identity and authored accounts.

## Model, resolution and timeline isolation

Map identity, place identity and visual appearance remain distinct. Five additive tables provide appearance identities, immutable source versions, timeline selections, stable drawing/feature reservations and same-World geography references. A version stores one bounded map snapshot using existing editable source geometry, together with attribution and generation provenance. Prior revisions and retained source provenance are separate links. No World is duplicated or automatically regenerated. Rendering remains browser SVG/cartography with no GPU-dependent server work, new graphics system, package or service.

Date resolution uses only explicit active ranges. Years include both endpoints; equal endpoints describe one year. Before the first range, between ranges and after the final range, coverage is unknown and the shared map is shown as a reference. There is no interpolation, carry-forward, Calendar conversion, inferred geographical change or automatic History event. Active overlaps are refused. The baseline remains independently editable and earlier captured sources remain immutable.

An alternate timeline begins without authored map coverage. Retaining a direct parent's appearance requires an explicit action and checks its exact selected version/revision. The pin never follows later parent changes automatically. A branch edit appends a local interpretation; Primary and siblings keep their own selections. The 128-state limit includes archives; revision choices expose up to 100 retained sources. Existing generic geometry/drawing bounds and the twelve-megabyte Atlas request bound are preserved.

## Privacy and authorization

World ownership and existing G.O.D./Administrator role gates run on the server. Administrator review and ordinary previews remain read-only; their POST URLs reject mutation. Foreign G.O.D.s and Players cannot read the World or its map sources. Same-site mutation validation and private/no-store responses remain in use. No Campaign access or publication permission changed.

Ordinary selections, counts, parent choices and revision readers filter before serialization. A protected appearance or one revealing a protected place, ancestor or retained source is withheld in full. Current source protection also guards earlier pins. Private older revisions remain private after the current appearance's visibility changes. Historical projection preserves Atlas's omission of generation provenance from ordinary responses. New geographic identities are created in the shared Atlas library first and deliberately reused, preventing a protected historical draft from publishing a new name through that library.

## Validation executed

- **43 focused unit/render regressions passed:** map date resolution, Atlas geometry, cartography source/undo, stable-place navigation, historical time, timeline divergence and Phase 6A story composition. The story render file passed with the repository's CSS test loader.
- **13 service groups passed:** two distinct states; exact date boundaries/gaps; real geometry, river drawing and local name changes; unchanged baseline/earlier sources; stale revisions and overlap refusal; retained revision recovery; appearance archive/restore; explicit branch pins and independent interpretations; protected choices/source filtering; ownership/review/same-World integrity; baseline object reservations; Realm relationships and stable destinations.
- **8 final integrity groups passed:** ordinary generation redaction; refusal of unsaved private place identities with no partial writes; database object reservations; invalid payload rejection; self-referencing revision rejection; truly simultaneous saves with one success/one conflict; whole-map archive recovery; archived timeline browsing and write refusal.
- **3 complete browser groups passed:** authenticated desktop at 1440×900 and native-touch Chrome at 390×844 used the actual renderer, tap controls and keyboard/guidance. They covered creation, editing, distinct earlier/later/baseline geometry, save/reload, interrupted save, unsaved-switch refusal, archive/restore, branch geography, connected destinations and Realm reading. A real second tab produced a stale conflict and explicit saved-map recovery. The third group verified actual read-only Administrator review and foreign/Player HTTP authorization. No React/browser console errors or horizontal overflow occurred.
- **3 focused recovery/browser groups passed:** a requested year inside an authored period survives saves and navigation; acknowledged creation with failed readback recovers one persisted appearance across reload without another POST; actual ordinary historical UI hides protected names/choices and remains read-only.
- **Migration checks passed:** fresh full-chain installation; populated approved Phase 6A upgrade; unchanged pre-existing World rows/maps; migrator no-op reapplication; direct SQL reapplication over retained historical states without changing their rows. The exact staged Git migration bytes were used. Prior numbered SQL migrations are unchanged.
- **Production build, explicit TypeScript, repository lint, Drizzle journal/schema checks and whitespace checks passed.** Drizzle generation reports no further schema changes. Builds and browsers used an isolated production distribution and disposable database; no Next development compilation was used.

Evidence remains in ignored `artifacts/guidance/worlds-map-states/`: migration, service, integrity, browser and recovery JSON receipts; production logs; desktop/phone state screenshots, conflict screenshot and ordinary-coverage screenshot. The completed Phase 6A test database was used only as a clone template. Earlier interrupted disposable attempts and completed prior evidence were retained.

### Failure classification

Application failures found and corrected were a PostgreSQL deferred-trigger variable collision, an Explore-to-editor URL transition that lost the opened map on reload, and appearance-information DTO handling. Focused checks verified their corrected behavior. Final review also verified exact-year preservation, ordinary provenance omission and acknowledged-save recovery.

Harness failures were an incomplete versioned river fixture, CSS imported without the existing test loader, incorrect heading/exact-text locators for the Realm disclosure and an unchanged retry value that left an information-save button disabled. The latter exposed an unhandled test promise rejection; only the identified task cluster was stopped and Next's automatic tracked configuration change was restored. Corrected targeted continuations completed the remaining checks. These failures are not reported as product regressions. No unresolved application or harness failure remains.

## Files and migration

New runtime files: `src/features/worlds/map-states.ts`, `map-state-service.ts`, `historical-map-workspace.tsx`, `src/db/world-map-state-schema.ts` and `src/app/api/worlds/[worldId]/atlas/states/route.ts`.

Existing runtime changes: Atlas workspace/editor/Explore integration, historical object guards and generic-map adoption safeguards in Atlas service, and updated Realm connection guidance. Existing renderer/source contracts are reused. No unrelated runtime was rewritten.

Validation files: `src/features/worlds/map-states.test.ts`, `scripts/worlds-map-state-checks.ts` and `scripts/worlds-map-states.test.ts`. Documentation updates include AGENTS, creator experience/coverage, linking continuity and the [historical map architecture](../architecture/worlds-map-states.md).

Apply `0124_worlds_map_states.sql` **after `0123_worlds_stories.sql`**, with required predecessors in committed journal order. The generated 0124 snapshot and journal entry are included. No backfill, configuration, dependency or external service is required.

Final migration SHA-256: `acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa`. Git blob: `c8d235c911972e38e291472fc4bdc56ea9ec2a76`. The final rehearsal verifies those exact bytes.

## Release, recovery and boundaries

For a separately authorized deployment, verify this release, target identity, migration ledger and backup; pause writers; apply pending committed migrations through the established migrator; stage the production build; then verify owner authoring, baseline/history switching, ordinary preview and explicit read-only review before activating the release. All checks here used disposable environments. Shared DEV/Production databases and services were not changed; no remote push or deployment occurred.

A code revert does not reverse the schema, retained sources or ledger. Keep the five additive tables and source identities. Older Atlas writers lack historical safeguards, so keep Atlas authoring paused during fallback and prefer a reviewed forward fix. Backup restoration requires stopped writers, preservation/reconciliation of later data and matching code/schema versions.

Historical settlement growth/destruction, relocation, territory-specific surfaces, settlement/interior/dungeon editing, historical destination changes, rich branch comparison/source reconciliation, uncertain ranges and multi-map coordination remain later Phase 6B work. Generic maps with retained appearances stay generic; create a separate settlement map instead of converting and losing access to the current historical workshop. New place identities and ancestry remain shared Atlas operations. Advanced Map Studio, simulation, 3D, AI generation, VTT and the Phase 9 whole-Worlds assessment were not begun.

The application increment is technically complete and ready for independent review. Ember review and owner visual acceptance remain separate pending statuses. The handoff stops at a clean local commit; push, deployment, shared service/database actions and the next pass require separate authorization.
