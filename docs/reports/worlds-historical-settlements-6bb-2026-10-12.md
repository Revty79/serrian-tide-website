# Phase 6B-B: historical settlements checkpoint

Approved starting commit: `9267fc465e717d9503f4e5546e87b6243a69741b`. The checkout was clean before work. Earlier implementations, migrations and completed test evidence were preserved. This report belongs to the local Phase 6B-B release commit; the full release SHA is provided in the completion response.

## Capabilities

Existing settlement charts now support immutable historical appearances using the existing Settlement Editor, SettlementScene and original cartography renderer. Real saved buildings, streets, districts, walls, waterways and landmarks can have different layouts, positions, boundaries, local labels, descriptions, classifications and district memberships in separate inclusive periods. Terrain editing uses the existing Map Maker within the historical workspace.

Authors can create, edit, save, reopen, explore, archive and restore appearances; read older revisions; retain an exact direct-parent appearance; and author an independent branch interpretation. Linked maps preserve the requested historical year. Missing date coverage stays unknown with a clearly labeled shared-baseline reference. No interpolation, silent inheritance or generated History events is introduced.

Place conditions are known present, known absent, not yet established, abandoned, ruined, destroyed, rebuilt and unknown. Present, abandoned, ruined and rebuilt places draw their authored representation. Absent, not established, destroyed and unknown places retain source geometry and identity without drawing a present structure. A condition on the settlement controls its whole representation. Archiving a drawing remains separate from destruction. A different replacement building uses an explicitly chosen different saved identity.

Historical edits preserve shared geography, entity categories, parents, ownership, baseline artwork, existing references and prior source versions. New place identities are deliberately saved in the shared settlement first, then reused in an appearance. Historical duplication copies a representation of the chosen place rather than inventing identity continuity. Existing History events may be cited as authored text in the source account; structured source comparison and coordinated historical connections remain later scope.

## Privacy and recovery

Both ordinary URL aliases use server filtering and read-only controls. Ordinary responses omit protected sources, unadopted parent choices, source account text, unavailable place metadata, current shared entities absent from the captured source, associated maps and inverse connections. A duplicate snapshot geography field formerly spread into map headers was removed so it cannot bypass the filtered geography projection. The approved atomic Explorer request-context guard remains in place.

Author readers preserve source accounts and legitimate parent selection. Administrator review remains explicitly read-only; foreign owners and Players are denied. Failed writes retain drafts. Acknowledged writes with interrupted readback recover with a read rather than duplicate creation. Two-tab conflicts preserve the first editor's draft for comparison/download and deliberate recovery.

## Executed validation

Receipts and screenshots are retained under `artifacts/guidance/worlds-historical-settlements/`; prior evidence directories were not replaced.

| Check | Result |
| --- | --- |
| Focused unit tests: historical conditions, actual SettlementScene markup, ordinary projection, settlement geometry, map resolution, preview aliases and navigation | 19 passed |
| Persisted service scenarios: village/town/destruction/rebuild, earlier source and baseline preservation, inclusive coverage, branches, privacy, archive/restore, identity guards, roles and bounds | 11 passed |
| Additional database integrity: later saved-place reuse, unchanged earlier source, simultaneous CAS saves, JSON null rejection, direct forged source rejection, unchanged prepared baseline and prior versions | 8 passed |
| Authenticated production browser: desktop and phone real layouts, save/reload, failed save, linked year context, keyboard/native touch, both ordinary aliases and role contexts | 5 groups passed |
| Desktop/phone UI creation and recovery: interrupted readback, no duplicate write, discard refusal, two-tab conflict/comparison, terrain editor, archive/restore and reload | 2 groups passed |
| Same mounted Explorer: desktop/phone, both ordinary aliases, delayed request, failed request, successful retry and author return | 4 groups passed; zero browser errors or World mutation requests |
| Desktop/phone drawing of a later registered place through the real historical editor, with unchanged shared baseline and older ordinary chart | 2 groups passed |
| Existing generic historical navigation, linked-map return, retained source reading and draft editing | 2 groups passed |
| Production build, TypeScript, changed-file ESLint, Drizzle snapshot check and Git whitespace check | Passed |
| Exact Git migration 0125: fresh complete installation, populated approved 6B-A upgrade, migrator retry, direct SQL reapplication and preservation | Passed |
| Completed 6B-A evidence database and all pre-existing records in 98 World tables | Unchanged |

Earlier valid migration and creator evidence was reused; the comprehensive Phase 9 assessment was not run. Application defects found during development were corrected: constraint rebinding, PL/pgSQL alias ambiguity, duplicate snapshot geography serialization, missing condition controls, and editable draft normalization for reused saved places. Harness failures were distinguished from those defects: touch coordinates before scrolling, mixed input sessions/undelivered synthetic taps, a dismissed recovery confirmation, and a forged-source fixture missing required reference rows. Completed browser groups were reused when resuming unfinished checks. The main phone workflow verified native touch movement and saving; the later-place reuse check verified native rectangle drawing followed by keyboard Save activation.

## Database and controlled release

The only new migration is additive `0125_worlds_historical_settlements.sql`, after 0124 and all earlier journal entries. It extends validators and identity constraints/triggers without new tables, columns or backfill. Migration 0124 and every earlier numbered migration remain unchanged. Its committed SHA-256 remains `acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa`. The final 0125 hash and rehearsal details are in `migration-results.json`.

No configuration, mandatory GPU, image service, paid infrastructure or deployment dependency was added. Shared DEV/Production databases and shared services were not used or restarted. Test servers and PostgreSQL ran only against the guarded disposable cluster and cloned databases.

After separate approval: verify the exact release commit, target identity and migration ledger; take a verified backup; pause writers; apply committed migrations in order with the established migrator; stage the production build; then check authenticated owner, ordinary and Administrator contexts. Preserve all immutable source tables and the migration ledger during recovery. A Git revert does not undo database changes. Older code cannot author historical settlements; keep incompatible Atlas writers paused during fallback and prefer a reviewed forward fix. Controlled backup restore requires preserving later changes and matching application/schema versions.

## Changed files and limits

- Appearance persistence: `src/db/world-map-state-schema.ts`, `src/features/worlds/map-state-service.ts`, `drizzle/0125_worlds_historical_settlements.sql`, `drizzle/meta/0125_snapshot.json`, `drizzle/meta/_journal.json`.
- Place conditions and ordinary projection: `historical-places.ts`, `historical-settlement-projection.ts`, `atlas.ts`, `atlas-navigation.ts` under `src/features/worlds/`.
- Existing UI/service integration: `atlas-workspace.tsx`, `historical-map-workspace.tsx`, `settlement-editor.tsx`, `settlement-scene.tsx`, `atlas-explorer.tsx`, `atlas-service.ts` under `src/features/worlds/`.
- Tests: `historical-settlements.test.tsx`; `scripts/worlds-historical-settlements.test.ts`, `worlds-historical-settlement-checks.ts`, `worlds-historical-settlement-integrity.ts`, `worlds-historical-settlement-recovery.ts`; optional focused reuse of `worlds-explorer-failure-checks.ts`.
- Documentation: `AGENTS.md`, `docs/architecture/worlds-map-states.md`, `docs/architecture/worlds-historical-settlements.md`, and this report.

The existing 4,000-shape/entity, 64,000-point and 12 MB bounds remain. The settlement geography bound is 4,129 to include its captured subject without reducing the previous capacity for 4,128 place entries. Existing semantic places are reused; historical editing does not silently create new shared identities. Abandoned/ruined/rebuilt condition labels do not automatically generate damage artwork: authors edit the real layout. Political territories, historical borders, richer source comparisons and coordinated historical connection changes remain for separately reviewed 6B-C/D work. Historical interior/dungeon editors, Advanced Map Studio, simulation, Campaign sharing and VTT integration are outside this checkpoint.

The increment is technically ready for independent review and controlled deployment planning. Ember's independent technical review and owner visual acceptance are pending. No push, deployment, shared database change or later phase is authorized or performed.
