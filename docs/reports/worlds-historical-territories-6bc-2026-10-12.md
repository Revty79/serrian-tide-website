# Phase 6B-C: historical territories checkpoint

Approved starting commit: `9ac678fc03a6f39a9989e9991d34f3e48b5a6d0f`. The checkout was clean before work. Completed 6B-A/B implementations, migrations and earlier evidence were preserved. The release is the commit containing this report; its full SHA and actual push/sync result are provided in the completion response. The owner separately authorized push/sync during this pass. Deployment and shared database/service changes remain unauthorized.

## Delivered capability

Generic and settlement historical appearances now carry editable political overlays above the original cartography renderer. Authors select an existing map/timeline/period, add a territory account, deliberately choose exact saved political sources, draw or trace disconnected areas and enclave holes, edit boundaries, save/reload, switch years, explore associated entities, read original sources and archive/restore. The existing Map Maker supplies mouse, native touch, keyboard, point controls, undo/redo and draft download. Its physical tools remain available outside overlay editing.

Relationships reuse existing Polities, Governments, Institutions, Claims, Agreements, Conflicts, Realms and Civilizations. Control, claim, administration, occupation and original authored roles remain distinct. Multiple relationships and overlapping outlines express disputes and shared/seasonal arrangements. Unknown and explicitly unclaimed areas do not establish a political relationship. Political identities are never deleted because they lose territory. Source account date/notation, inclusive relationship period and exact History event dating remain separate. No political change or History event is inferred from prose.

The same saved valley is shown under Aster in Year 100 and Veyr with visibly changed boundaries in Year 300. An explicitly retained alternate interpretation preserves Aster at Year 300. Primary, sibling, older revisions, baseline land/artwork and saved political/History accounts remain independent. Missing year coverage is labeled unknown. Relationships in a deliberately copied later appearance adopt its explicitly chosen period; earlier bytes are retained. An existing relationship identity cannot be reassigned to another entity.

## Privacy, preservation and recovery

Both ordinary aliases use the same read-only server projection before serialization. A protected territory, exact political/History pin or nested protected source withholds the whole appearance, including its choices, names, accounts and geometry. Current source protection and the original pinned protection both apply. Republishing a current entity/event does not publish its older protected pin. Unadopted parent selections remain absent; deliberately retained authorized exact sources remain readable. Ordinary responses strip territory source accounts, account dates/notation and relationship accounts; History readers strip private notes. Author and explicit read-only Administrator review retain legitimate exact source readers.

The approved atomic Explorer guard accepts appearance and Atlas data only for the exact World/map/timeline/year/knowledge/review context. Failed ordinary requests show error/retry without protected information from the earlier author view. Foreign owners and Players are denied; preview-qualified writes and Administrator writes are rejected. Failed saves retain drafts. Interrupted acknowledged creation recovers through a read without duplicate creation. Concurrent editors receive a conflict, compare the correct saved overlay, and deliberately accept or preserve/download their draft.

All original records in the approved disposable 6B-B database and its 98 World tables stayed unchanged. New tests ran on cloned databases and new disposable Worlds. Earlier immutable appearance versions in the new fixture were compared directly, while existing physical sources and political/History identities were preserved. No shared database, Production database or shared service was used, changed or restarted.

## Newly executed validation

Receipts, production logs and desktop/phone screenshots are retained under `artifacts/guidance/worlds-historical-territories/`. Earlier pass evidence remains in its original directories. Completed groups were reused when resuming unfinished checks.

| Check | Result |
| --- | --- |
| Focused unit/renderer: political roles, disconnections/enclaves, geometry, stable identities, source dates, bounds, settlement projection, map coverage and preview/navigation | 27 passed |
| Persisted service scenarios: two periods, immutable sources, exact branch retention, ordinary/public/private pins, archive/restore, simultaneous saves, forged references, roles and existing settlements | 13 groups passed |
| Additional integrity: all eight source families, unusual arrangements, protected History and nested sources, real foreign pins, reversed identity collisions, reassignment, direct SQL authorship/date guards, capacities, enclave cases and settlement overlays | 9 groups passed |
| Authenticated production browser: desktop/phone renderer, source readers, both ordinary aliases, author return, failed save, unsaved guard, mouse/native-touch move and drawing, keyboard point editing, reload, acknowledged-write recovery, conflicts, archive/restore, physical editing and existing settlements | 15 groups passed; zero browser errors |
| Same mounted Explorer: desktop/phone with both ordinary aliases, delayed request, failed ordinary request, successful retry and author return | 4 groups passed; zero browser errors or World mutation requests |
| Final production renderer/readers: desktop/phone two-period/branch/unknown views, exact author History notes, ordinary note exclusion, both preview aliases and real settlement overlay save/reload with unchanged physical artwork | 6 groups passed; zero browser errors |
| TypeScript, changed-file ESLint, Drizzle snapshot consistency and Git whitespace | Passed |
| Final isolated production build | Passed |
| Exact staged Git migration: fresh complete installation, populated approved 6B-B upgrade, migrator retry, direct SQL retry and unchanged existing records | Passed; 127 journal entries, one pending upgrade migration |

Application issues found and fixed included deferred-check rebinding, SQL alias isolation in recursive privacy checks, saved-overlay conflict normalization, read-only metadata controls, the SVG title warning, and enclave geometry validation. Separate harness failures included comparing newly added empty tables as if they were old tables, expecting 403 where foreign-World concealment deliberately uses 404, and checking Drizzle's wrapper instead of the underlying deferred-constraint error. These were corrected without weakening authorization or persistence guards. The initial sandbox could not start the task-owned temporary PostgreSQL cluster; the guarded disposable checks ran in the permitted execution context. No unresolved application or harness failure remains. The comprehensive Phase 9 suite was not run.

## Migration, configuration and controlled release

Only `0126_worlds_historical_territories.sql` is new. Apply it after frozen 0125 and every earlier journal entry. It adds `world_map_territory`, `world_map_territory_boundary`, `world_map_territory_lore` and `world_map_territory_history`, with immutable identity/reference rows, exact same-World/map constraints, strict bounded payload validation, deferred reference completeness, selected-head checks, authorship/date guards and separation from physical artwork identities. It extends the retained 6B-B validator without rewriting its source data. There is no backfill. Previous numbered migrations are unchanged.

Frozen 0124 SHA-256: `acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa`. Frozen 0125 SHA-256: `6339cddc47e8821fa66758fec97f72b6b5a81b5498d904380cf3461f6379c638`. Final 0126 SHA-256: `c8a31d7a9ee7824304e7b8a6221175d8d8b2131235e8ee655cfdb470d7b588c4`. Fresh/populated retry receipts are recorded in `migration-results.json`.

No application configuration, paid API, external AI, GPU, geographic library or artwork dependency was added. The increment works independently after its ordered migration; no later pass is required.

After separate deployment authorization and independent review: verify the exact commit, target database identity and ledger; protect a verified backup and current release; pause writers; run pending committed migrations in order with `npx drizzle-kit migrate`; stage the production build; activate through the existing operator-managed process; and smoke-test owner, ordinary and explicit Administrator contexts. These steps have not been performed on shared infrastructure.

A code revert does not reverse migration 0126, its ledger or saved overlays. Preserve all identity, source and reference tables. Older writers may omit political overlays, so keep incompatible historical/Atlas writing paused during fallback. Prefer a reviewed forward fix. A controlled backup restore requires stopped writers, preservation of subsequent changes and reconciliation of application, schema and migration ledger versions.

## Changed files and supported limits

- Persistence: `src/db/world-map-state-schema.ts`, `src/features/worlds/map-state-service.ts`, `territory-service.ts`, `drizzle/0126_worlds_historical_territories.sql`, `drizzle/meta/0126_snapshot.json`, `drizzle/meta/_journal.json`.
- Source reading and API: `src/features/worlds/peoples-service.ts`, `territory-reading.tsx`, `src/app/api/worlds/[worldId]/atlas/territories/route.ts`.
- Model and visual editing: `historical-territories.ts`, `territory-editor.tsx`, `territory-list.tsx`, `territory-scene.tsx`, `territories.module.css`, `atlas.ts`, `atlas-map-editor.tsx`, `atlas-explorer.tsx`, `atlas-service.ts`, `cartography-scene.tsx`, `historical-map-workspace.tsx` under `src/features/worlds/`.
- Tests: `src/features/worlds/historical-territories.test.tsx`; `scripts/worlds-historical-territories.test.ts`, `worlds-historical-territory-checks.ts`, `worlds-historical-territory-integrity.ts`; focused reuse of the approved `worlds-explorer-failure-checks.ts` harness.
- Documentation: `AGENTS.md`, the map/settlement continuity notes, `docs/architecture/worlds-historical-territories.md`, and this report.

An appearance supports 128 territories, 128 total boundary rings, 8,192 overlay vertices, 256 points per ring, 20 geographic subjects, 20 political relationships and 20 History citations per territory, within the existing 12 MB request bound. Active enclave holes must stay inside their parent and cannot touch, overlap or nest. Source choice queries are bounded to 2,000 political identities and 5,000 History records; large-catalog search/pagination remains future work. Coordinates are versioned Atlas map units, with an extensible component/hole representation; accurate Earth imports, GIS accuracy and worldwide datasets are not claimed.

Historical interior/dungeon editing, coordinated historical connections (6B-D), Advanced Map Studio, planetary rendering, automatic simulation, publishing and VTT integration remain outside this pass. Existing shared connection destinations and calendar/chronology rules are preserved.

Technical validation is complete. Ember's independent technical review and owner visual acceptance are pending. Push/sync is separately authorized; deployment, shared changes and the next pass are not.
