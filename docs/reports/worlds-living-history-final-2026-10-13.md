# Phase 6B Final: Living History integration and acceptance

Approved starting commit: `81098e07cd7227db80aff5659e3a86b45bfda8d0`. HEAD, clean status, approved implementation, prior receipts and matching local/remote checkpoint were inspected before any changes. The owner confirmed independent technical approval of 6B-A through 6B-D. This report belongs to the ending local release commit; its full SHA is recorded in the completion handoff and `artifacts/guidance/worlds-living-history-final/release-receipt.json` after committing.

**Recommendation: the established Phase 6 Living History foundation is technically ready for completion and independent review.** The integrated journey passes, the confirmed blockers are repaired, no persistence defect requires a migration, and no unresolved application failure remains in the executed checks. Ember's review and the owner's visual acceptance are still required before accepting this checkpoint. Remote push, sync, deployment, shared services/databases and Phase 7 remain unauthorized.

## Confirmed integrated capabilities

The new disposable saved World contains two regions, connected settlements, two political identities, History event/era accounts, Calendar versions, a Chronology reckoning, original stories and retellings, a Realm, a linked building floor and dungeon, and deliberately retained alternate sources. Four substantially different periods at canonical years 100, 300, 500 and 700 cover village, city, destruction and rebuilding. Physical geometry, control and competing claims change independently; saved connections choose the town map, a separate survey, an explicitly unavailable destination, then the rebuilt town map. Each destination resolves its own appearance. Missing coverage remains unknown.

Authors can create and revise appearances through the original Map Maker and Settlement Editor, read exact earlier versions, archive/restore, compare two deliberate sources, and retain exact parent map/connection sources into an alternate timeline. The branch's independent map, politics and destination remain separate from Primary and an unadopted sibling. Shared baseline artwork, historical artwork, political accounts and connection interpretations retain their distinct ownership and save targets. No simulation, interpolation, automatic reconciliation or generated History event was added.

Geographic milestones relate saved events to stable places; territorial accounts retain exact event/era versions and their original Calendar/Chronology context. Canonical map coverage, event dates, original notation, political/account periods, settlement conditions, story telling/alleged-event dates and save timestamps remain independent. Display conversion and later Calendar/Chronology changes do not rewrite original records. Retellings continue to read the pinned original story after later revisions.

Owner, ordinary preview, explicit Administrator review, foreign G.O.D. and Player contexts were exercised across the connected journey. Both `ordinary=1` and `knowledge=ordinary` produce equivalent server projections. Protected geography/maps, appearances, politics, History, destinations, original sources and private notes remain filtered; read-only contexts cannot mutate through preview-qualified API requests. Existing owner editing remains available in author mode.

## Repairs and changed files

| Confirmed defect | Result and changed files |
| --- | --- |
| Connected workspaces/source APIs parsed only one ordinary URL alias | Reuse `ordinaryKnowledge` at affected boundaries and live request checks. Author return clears both aliases. Clients: `world-workspace.tsx`, `history-browser.tsx`, `calendar-workspace.tsx`, `chronology-workspace.tsx`, `peoples-workspace.tsx`, `sky-workspace.tsx`; SSR: `src/app/worlds/[worldId]/page.tsx`. APIs: `src/app/api/worlds/[worldId]/route.ts`, `history/route.ts`, `milestones/route.ts`, `peoples/route.ts`, `calendars/route.ts`, `calendars/history/route.ts`, `sky/route.ts`. |
| Preview-qualified writes were not uniformly rejected | `http.ts` rejects ordinary/review mutations after authentication and before invoking write callbacks. Existing unqualified owner authorization is preserved. |
| Realm links lost the selected historical year | `linking-panel.tsx` carries `mapYear` with existing timeline, review and knowledge context through related lore and map URLs. |
| Year zero became the appearance's start year | `historical-map-workspace.tsx` distinguishes an empty year from zero when opening comparison and historical connections. |
| Archived geographic subjects/arrivals could remain destinations | `atlas-navigation.ts` and `historical-connection-service.ts` exclude unavailable destinations while preserving original connection accounts and immutable versions. |
| Ordinary original-story reader failed with several lore versions | `peoples-service.ts` binds the exact validated version into the existing recursive privacy check, avoiding SQL table-scope shadowing while preserving current/pinned protection. |
| Opening a map required scrolling through the World introduction | `atlas-workspace.tsx` brings a ready workshop into view once per opened map, clearing the sticky navigation with its shared height variable. Focus, drafts and original tools are preserved. |

Feature filenames without a full prefix are under `src/features/worlds/`. New fixture/checks: `scripts/worlds-living-history-checks.ts`, `scripts/worlds-living-history-final.test.ts`. New archived destination regression: `src/features/worlds/historical-connections.test.ts`. Scope/continuity: `AGENTS.md`, `docs/architecture/worlds-living-history-acceptance.md`, this report. No schemas, dependencies, existing migrations, original cartography renderer or unrelated creators changed.

## Executed validation and evidence

| Check | Result |
| --- | --- |
| Targeted unit/render regressions | **80 passed**: historical connections, Atlas navigation, map states, territories, settlements, ordinary preview, stories, History/index/branching, Calendars/dates and Chronology. |
| Persisted integrated services | **18 groups passed**: four periods, stable identities, source dates, exact pins/readers, branch isolation, comparisons, unavailable/archived destinations, archive/restore, conflicts and authorization. |
| Authenticated production browser integration | **26 groups passed**: 12 desktop, 12 phone, connected source/API privacy matrix, full owner/Administrator/foreign/Player access matrix. |
| Source API privacy matrix | Both aliases deep-equal across 12 requests; protected markers and private notes absent. **33 preview/review-qualified mutations rejected with 403**, with version counts unchanged. |
| Failure and recovery | Failed appearance saves retain the draft; acknowledged saves followed by failed readback recover without duplicates. A delayed/failed ordinary context hides protected History data, offers retry and recovers into the filtered view. |
| Interaction | Desktop 1440x1000 and phone 390x844 Chromium; keyboard dialog close/focus, unsaved-draft navigation, bounded dialog overflow, native touch SVG panning, source readers, Realm links, year zero, editor/explorer visibility below navigation. |
| TypeScript / changed-file lint | Passed. |
| Production build | Passed in an isolated output directory with a disposable database and task-owned production server. |
| Drizzle static consistency / Git whitespace | Passed. |
| Migration/preservation | All 128 committed migrations unchanged; populated clone migrator is a no-op; 105 existing World tables and completed 6B-D evidence unchanged. |

New receipts/screenshots: `artifacts/guidance/worlds-living-history-final/` (`service-results.json`, `browser-results.json`, `migration-results.json`, `preservation-results.json`, `environment.json`, `fixture-progress.json`, `production.log`, `desktop-*` and `phone-*` screenshots). Ignored local artifacts retain evidence without adding production fixtures. `failure.html`/`failure.png` retain an earlier investigation, not the final result. Previous browser receipts remain saved; only affected checks were invalidated and repeated after subsequent repairs.

Test World: `c7d789bb-0dea-445a-b6e3-b80d7fe955ff`, in `serrian_livinghistory_1791900806863` at loopback port 63992, cloned from completed 6B-D evidence. The task-owned production server uses loopback port 52561 and an isolated build directory. The harness starts/stops only its stopped task-owned temporary PostgreSQL cluster and own application process, and restores Next-generated local configuration afterward. Shared DEV/Production and shared services were not used.

Focused commands:

```powershell
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/worlds/historical-connections.test.ts src/features/worlds/atlas-navigation.test.ts src/features/worlds/map-states.test.ts src/features/worlds/historical-territories.test.tsx src/features/worlds/historical-settlements.test.tsx src/features/worlds/settlement.test.ts src/features/worlds/knowledge-preview.test.ts
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/worlds/stories.test.ts src/features/worlds/history.test.ts src/features/worlds/history-index.test.ts src/features/worlds/branching-history.test.ts src/features/worlds/calendar.test.ts src/features/worlds/calendar-dates.test.ts src/features/worlds/chronology.test.ts
node --conditions=react-server --import tsx scripts/worlds-living-history-final.test.ts --resume --services-only
node --conditions=react-server --import tsx scripts/worlds-living-history-final.test.ts --resume --browser-only
npx tsc --noEmit
# ESLint: every changed src file and both new integration scripts.
npx drizzle-kit check
git diff --check
```

The initial unit command also named a nonexistent `stories.test.tsx` path that Node ignored. The actual `stories.test.ts` ran in the second 40-test group; the 80 distinct tests exclude the nonexistent path. Unrelated platform suites and comprehensive Phase 9 were not run.

### Application versus harness failures

The original-story SQL error was a real application failure reproduced by the source API matrix, repaired in the service, and covered by persisted ordinary/current/pinned protection checks. Alias inconsistency, date loss, year-zero fallback, archived destination availability and workshop scroll clearance were application integration/usability defects.

Harness/fixture corrections were separate: an outline used a location instead of a physical continent; a date used month two in one-month rules; archive recovery used a year lookup instead of the retained ID; a source locator selected the wrong semantic element; a Calendar history request omitted its required version. Completed checkpointed records were preserved. Unauthorized Player route attempts produce the existing access-denial server log; APIs reject access and no World data renders. Final authorized browser page errors are empty.

## Migration, source and timeline preservation

**No new migration or schema change.** Required schema remains committed migrations in journal order through `0127_worlds_historical_connections.sql`, SHA-256 `30b597d392112bf0173140d15dcb21214cc083718d542ad5eb57a2c3f9d03ff2`. All 128 SQL files match approved source. Exact unchanged 6B-D fresh-install, populated-6B-C upgrade, migrator reapplication and direct-SQL reapplication receipts were reused from `artifacts/guidance/worlds-historical-connections/migration-results.json`. The new populated clone verifies the 128-entry ledger and unchanged data after a no-op migrator run.

After integration writes, every pre-existing row across 105 World tables remains present with identical stored data, including sources, revisions and timeline heads. The completed 6B-D evidence database independently matches its original snapshot. New writes belong to the new disposable fixture World. A legacy/unavailable destination check temporarily archived that fixture's own geographic subject through SQL and restored it in `finally`; application archive rules remain unchanged. Shared DEV/Production were never opened or written.

## Supported, deferred and future compatibility

Historical settlements retain linked interior/dungeon maps with stable identities, ownership, connections and requested year/timeline/knowledge context. Original floor/dungeon readers and editors remain functional. Their artwork is a **shared baseline reference with unknown dated coverage**. Phase 6 does not author historical room, floor or dungeon layout construction/destruction.

Dated interior/dungeon artwork is deliberately deferred and is not a failing dependency of this foundation. If the owner adds it to acceptance criteria, the missing work is typed dated payloads and stable room/layout source identities, condition/protection validation, renderer/editor adapters, comparisons, branch retention and recovery tests. This is comparable to a complete historical workshop pass rather than a small integration correction. Recommend a separately approved historical interiors/dungeons pass; no partial controls or migration were introduced here.

| Future compatibility finding | Later ownership |
| --- | --- |
| Stable World/map/place/territory/connection identities and versions support country/region/city links and historical imports. | Preserve exact identities/pins in import adapters; retain fantasy sources. |
| Atlas-v1 bounded drawing positions are not latitude/longitude or a geographic projection. | Modern global Earth foundation must retain authoritative geometry, CRS, provider/version provenance and independent display projection. |
| Bounded full snapshots and World-library reads cannot support detailed global outlines or large historical datasets. | Earth/Studio work needs progressive loading, levels of detail, versioned geometry storage/pagination and bounded metadata reads. |
| Fantasy shapes and independent accounts must coexist with real Earth sources. | Keep World-specific sources/projections and explicit author choices; do not impose Earth-only conventions or reconcile sources automatically. |
| Browser SVG/terrain caching works without a server GPU. | Preserve browser support while assessing later large-data renderer adapters. |

No future renderer, importer or dataset was implemented. The roadmap remains Phase 6, Phase 7, Phase 8, accurate modern global Earth foundation before Phase 9, comprehensive Worlds acceptance, independent Worlds development website, Advanced Map Studio with Comprehensive Historical Earth, then integration back into Serrian Tide. This pass authorizes none of those next steps.

## Independent review and owner decisions

Ember should independently review both aliases, original-story privacy, preview mutation rejection, archived destinations and source preservation. Owner visual review should assess the four periods, baseline versus appearance guidance/save targets, year/source/timeline selection, map-to-settlement/Realm navigation, comparison/source-reader dialog height and keyboard focus, workshop placement and phone touch/editing. Automated Chromium phone evidence does not replace hands-on device or owner acceptance.

The owner should accept the documented shared-baseline limitation for interior/dungeon artwork or separately authorize the substantial dated-layout pass. No unresolved technical blocker was found within the established Phase 6 foundation. Technical evidence, independent review and human acceptance remain separate statuses.

## Deployment readiness and recovery

This checkpoint builds and functions independently with schema through 0127. No new dependency or production configuration is required; test ports, database and output directory are harness-only. It is ready for independent review, with push/deployment held at the local commit boundary.

After separate authorization, follow operator deployment: verify the exact accepted SHA, running release, target database, backup and migration ledger; apply only genuinely pending committed migrations in journal order; build/stage before activation; perform owner/ordinary/review/unauthorized smoke checks. This pass adds no database upgrade step. No deployment action occurred.

Rollback to starting code is schema-compatible, but reintroduces the repaired integration/privacy and source-reader defects. Prefer a reviewed forward fix. Do not rewrite sources, remove versions or alter the migration ledger to roll back code. A Git revert does not reverse earlier database migrations.
