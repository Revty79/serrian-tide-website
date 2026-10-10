# Worlds combined Pass 2B: Checkpoint A

Base: 9617b32. This checkpoint delivers the working Calendar Creator independently of historical evolution. The commit containing this report is the local deployment checkpoint; the final completion report supplies its identifier. This uses the assignment's explicitly permitted Checkpoint A fallback. Historical evolution needs another complete implementation and verification cycle; it is not started here. Combined Pass 2B is unfinished, and is complete only after Checkpoint B is implemented and verified. Remaining usage/quota is not exposed by the environment, so no numeric allocation claim is made.

## Functional increment

World-owned named calendar traditions have descriptions, cultural context, multiple immutable saved rule definitions, a persistent preferred version, and archive/restore. The gallery and selected overview open actual authored calendars. Contextual sections edit months, weeks/day units, extra days, seasons and observances, with a live preview and visible validation. Failed saves retain drafts; parent revisions protect structural and metadata edits; explicit reload resolves two-tab conflicts. Revision creates another saved definition instead of changing earlier rules. Retired definitions remain readable.

Supported grammar: 1-40 months, 1-400 ordinary days/month, 1-20 weekdays, continuous/year-reset/month-reset weeks, year-zero/no-zero numbering, optional 1-1000 hours/day and minutes/hour, up to 20 inserted named days with explicit month/day position and weekday participation, periodic leap rules with nested exception/restoration periods and bounded explicit year overrides, up to 20 inclusive/wrapping/overlapping seasons, and up to 100 annual/periodic month-day, ordinal-day or named-intercalary observances. Optional absent occurrences are skipped; invalid dates and unsupported rules fail visibly. No arbitrary code runs. JSON rule snapshots are versioned and server-validated.

The preview navigates every authored month and signed year, including negative and trillion-year boundaries, shows actual weekday arrangements, season marks, holidays/festivals, out-of-week dates, day details and the whole-year agenda. Internal integer day arithmetic uses BigInt and bounded periodic counts/binary search. Calendar printed years remain distinct from canonical World years. Optional hours/minutes describe authored units and do not infer physical durations.

## Verification and compatibility

- Worlds/calendar unit tests: 22/22 passed. They include an independent per-year oracle for signed periodic prefixes, negative/extreme round trips, ten 36-day months, six-day weeks, leap exceptions, out-of-week festivals, year transitions, numbering, recurrence and malformed grammar.
- Navigation/Heavens regressions: 42/42 passed.
- Appearance/shared-theme regressions: 12/12 passed.
- Catalog privacy unit tests: 13/13 passed.
- Disposable catalog/database chain/privacy/lifecycle/runtime tests: 52/52 passed across seven suites.
- Authorization and lifecycle unit tests: 81/81 passed.
- Password-recovery disposable production/browser regression passed: sign-in/registration keyboard show/hide, every role's setup, hashed codes, replacement, concurrent consumption, expiry, phone recovery, password/token/session invalidation, CSRF/rate limits and no browser runtime errors.
- Focused ESLint and full repository lint passed. Drizzle integrity check passed; generation reports no schema changes after 0100. Next route generation, standalone TypeScript and the final Worlds optimized production build with TypeScript passed.
- Worlds disposable service/browser suite passed after correcting phone tab overflow. It rehearses an actual 0099-to-0100 upgrade over existing users/catalog/Campaign/active-session data, all five historical date representations, era/entry/tag associations, existing source-reckoning snapshots/defaults and timestamps. JSON row projections remain unchanged, migration ledger is complete, and reapplication is safe.
- Calendar service and HTTP checks passed: persistence, multiple traditions, immutable earlier versions, default CAS, database same-world FKs, calendar/version archive and restore, archived-world write rejection, retained definitions, two G.O.D.s, Administrator's own authoring, explicit foreign-world read-only review, Player/anonymous denial, guessed private IDs and cross-origin mutation rejection.
- Actual desktop/phone calendar authoring, navigation, leap previews, seasonal/festival day details, failed saves, actual two-tab conflict reload, retained versions, preferred persistence and 390px authoring/reload passed. Existing Registry, classifications/privacy, measured era-label bounds, timeline navigation and Chronology checks also passed. Browser runtime errors were absent and Campaign/combat/Form/Evolution/inventory/shared-library snapshots stayed unchanged.

Inspected actual screenshots: `artifacts/guidance/worlds-calendar-desktop.png`, `worlds-calendar-mobile.png`, and `worlds-calendar-editor-mobile.png`. Desktop uses a readable month gallery and weekday grid; phone retains the authored six-column week, tap targets and contextual sections. The first run exposed the fourth workspace tab overflowing on phone; tab wrapping fixed it and the entire suite passed on rerun. Checkboxes were constrained to native checkbox size; feedback uses existing theme roles. These local artifacts are ignored by Git and reproducible with the browser suite.

## Migration, deployment and recovery

`0100_worlds_calendar_creator.sql` follows `0099_worlds_chronology.sql`. It creates only the operational `world_calendar`, `world_calendar_version` and `world_calendar_preference` tables, with world/composite same-world/default foreign keys, lifecycle checks and indexes. Immutable structural definitions are JSON snapshots within version rows; identity metadata is separate. No User FK or separate permissions system is introduced; the owned World continues to block unsafe account deletion. Existing dates/entries are not rewritten or given artificial days. No new dependencies, environment variables, external service or seed/import step is required.

When separately authorized, verify the exact release/target/ledger, prepare the build, pause conflicting writers, protect a verified backup, apply pending committed migrations in journal order through 0100 using `npx drizzle-kit migrate`, then activate this code and smoke-test existing history, new calendar authoring/persistence, owner isolation and Admin review. An installation already through 0099 needs only 0100. Fresh installations apply the full journal. Do not use schema push, replay incompatible baselines, or alter applied migration checksums.

A code rollback leaves the additive tables and migration ledger intact. Pass 2A readers/writers do not know calendar tables, but their existing data remains compatible. Preserve the new calendar tables and prefer a forward fix. A database restore requires stopped writers, a verified backup, reconciliation of subsequent data and matching code/ledger. Production backup restoration is an operator step, not simulated by these tests.

No Production database has been changed, and nothing has been pushed or deployed. The homepage from 86be939 and authentication/Campaign/Character/Combat/Forms/Evolution implementation are preserved. Checkpoint A is ready for a separately authorized GitHub push and controlled server deployment, with 0100 required. There are no known Checkpoint A deployment blockers; Checkpoint B remains the blocker to declaring the combined assignment complete.

## Exact files changed

- Calendar calculation and validation: `src/features/worlds/calendar.ts`, `src/features/worlds/calendar.test.ts`.
- Working calendar interface: `src/features/worlds/calendar-editor.tsx`, `src/features/worlds/calendar-preview.tsx`, `src/features/worlds/calendar-workspace.tsx`, `src/features/worlds/calendar.module.css`.
- Persistence and private API: `src/db/world-calendar-schema.ts`, `src/features/worlds/calendar-service.ts`, `src/app/api/worlds/[worldId]/calendars/route.ts`.
- Existing architecture integration: `src/features/worlds/world-service.ts` (reuse existing authorization/locking), `src/features/worlds/world-workspace.tsx` (working Calendars tab), `src/features/worlds/worlds.module.css` (phone tab wrapping), `src/features/guidance/page-help.ts` (accurate calendar help).
- Ordered migration registration: `drizzle.config.ts`, `drizzle/0100_worlds_calendar_creator.sql`, `drizzle/meta/0100_snapshot.json`, `drizzle/meta/_journal.json`.
- Disposable upgrade/service/browser verification: `scripts/worlds-calendar-checks.ts`, `scripts/worlds-pass-one-disposable.test.ts`.
- Architecture and readiness documentation: `docs/architecture/worlds-calendars.md`, `docs/reports/worlds-calendar-checkpoint-a-2026-10-09.md`.

## Remainder for Checkpoint B

Historical effective periods, authored adoption labels, reform records linked to existing History, explicit absolute-day origins/anchors, exact cross-calendar conversion and precise calendar-date History sources are not part of Checkpoint A. Internal calendar day arithmetic alone does not establish a shared historical anchor. There are no inactive controls or empty tables pretending to deliver those features. The structural-version model and bounded arithmetic prepare that work while this checkpoint remains deployable by itself.
