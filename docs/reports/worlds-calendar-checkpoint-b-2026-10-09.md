# Worlds calendars: Checkpoint B deployment readiness

Starting commit: `8cf4b15be56dc1f7528f1072528eb31f3773e1b7` (approved Checkpoint A). The local commit containing this report is the Checkpoint B release; the final completion response supplies its identifier. Checkpoint B completes the combined Pass 2B and is independently deployable. No later pass, external service or new configuration is required. No remote push, deployment or Production migration was performed. Remaining coding quota is not exposed by the environment.

## Completed functionality

The working Calendar Creator, rules, custom weekdays, leap/intercalary calculations, seasons, observances, previews, preferences and archives remain intact. The selected calendar now has focused History, Adoption, Convert and Anchors views inside a disclosure, with contextual authoring dialogs and shared semantic appearance/field guidance.

Saved definitions have authored effective World-year context and independent revision checks. Known years, approximate years, uncertain windows, durations and unknown context remain distinct. A beginning may explicitly have no recorded end. Successive definitions retain their original rules. Multiple labeled peoples/institutions/regions can use overlapping calendar traditions; stable adoption IDs allow later structured associations through additive relationships. Display preference never establishes adoption.

Reform authoring records predecessor/successor versions, effective canonical time, reason, transition details and an optional existing History reference. It reads the existing narrative instead of duplicating it; a planned account remains planned. Optional precise cutovers snapshot two anchored dates and require consecutive elapsed positions. Skipped/repeated printed labels retain explicit version identity. Without explicit cutover dates, year-only context never becomes a precise day. Reform/adoption records preserve their accounts with revision-checked archive/restore; a correction may archive a record and create another.

A World can establish an immutable authored day-zero origin and common day unit. Each version can establish one immutable date-to-day anchor after explicitly confirming that each ordinary/inserted day represents one shared day. Conversion supports differing year lengths and epochs, signed years, actual intercalary dates and retired definitions. Canonical decimal strings (up to twenty digits, optional minus sign, no leading zeros) cross JSON; BigInt handles arithmetic and the existing bounded engine resolves dates. Missing anchors, unspecified version IDs, absent dates and unsupported ranges refuse conversion visibly. A repeated epoch needs a distinct version. Hours/minutes do not establish physical equivalence, and canonical World-year offsets never supply day anchors.

History authoring can optionally store known, approximate, uncertain-window or duration calendar context. Server-generated snapshots preserve source names, version IDs/titles, structured date identities, notation, precision and anchored positions; range boundaries may cross reforms. Details show original context and equivalent notation/boundaries without changing precision. Old year-only records get no fabricated days. Canonical time, original year-reckoning context, era membership, narrative status and canonical sorting remain independent. An exact calendar date with an unknown canonical year remains outside the year timeline and is labeled accordingly.

Privacy uses the existing Worlds actor, ownership lock and private/no-store HTTP wrapper. Foreign administrators must explicitly enter read-only review. Archived definitions remain readable and unchanged sources can be retained, while new uses require active definitions. Failed saves keep drafts. Explicit latest-version reload now also refreshes calendar references when another tab changes a version's lifecycle without changing the History entry revision.

## Actual verification

- `npm run validate:worlds`: 26/26 passed, including four new anchored-date/precision tests and all existing History, Chronology and Creator calculations. Tests cover different year lengths, signed/distant round trips, values beyond Number's safe integer range, repeated labels, consecutive cutovers, missing anchors, absent leap occurrences, malformed serialization and unchanged canonical sorting.
- `npm run validate:worlds-disposable`: passed, including the final production build with TypeScript and browser rerun after the calendar-reference conflict correction. It rehearses 0100-to-0101 over existing calendars/preferences, all five historical date representations, original reckonings, era/tag associations, timestamps, users, catalog and Campaign/session data. Legacy row projections are unchanged, the ledger is complete and reapplication is safe.
- Its actual service/database checks passed for immutable origins/anchors/definitions, period CAS races, simultaneous/open-ended adoption, year-only versus exact cutovers, linked planned History, all supported source precisions, reversed-date rollback, renamed/retired source retention, two G.O.D.s, Admin review, Player/anonymous restrictions and cross-world anchor/reform/source FKs.
- Its actual browser checks passed for origin/anchor creation, reform/cutover authoring, adoption filtering and phone authoring, supported/refused conversions, retained failed drafts, real second-tab effective-period conflicts, archive/restore, exact History persistence/readback and second-tab archive/restore causing a stale calendar-reference conflict. Explicit reload discards only after confirmation and subsequently saves with fresh references.
- Existing Registry, classification privacy, measured era-label positioning across overlap/open/short eras, desktop/phone timeline navigation, Chronology conversions, actual two-tab History conflicts and archive safeguards passed. Direct new-endpoint role/privacy/CSRF tests and foreign Admin read-only UI passed. Browser runtime errors were absent; Campaign/combat/Form/Evolution/inventory/shared-library row snapshots remained unchanged.
- `npm run validate:navigation`: 42/42 passed, including Heavens navigation and Campaign role/workflow protections.
- `npm run validate:appearance`: 12/12 passed.
- `npm run validate:catalog-visibility`: 13/13 passed.
- `npm run validate:catalog-visibility-db`: 52/52 passed across seven suites, including fresh full migration chain, upgrade preservation, direct privacy and account-deletion checks.
- `node --import tsx --test src/features/lifecycle/*.test.ts src/features/authorization/*.test.ts`: 81/81 passed.
- `npm run validate:password-recovery`: passed with its disposable production build, keyboard show/hide, all-role recovery setup, hashed/concurrent/expiring codes, phone reset, old-password/token/session invalidation, CSRF and rate-limit checks.
- Full repository lint and focused final-file lint passed. Next route generation, standalone TypeScript, Drizzle integrity/generation synchronization and `git diff --check` passed.

Actual desktop and phone captures were inspected: `worlds-calendar-evolution-desktop.png`, `worlds-calendar-evolution-mobile.png`, `worlds-calendar-history-desktop.png`, `worlds-calendar-conversion-desktop.png`, `worlds-calendar-anchor-mobile.png` and `worlds-calendar-source-mobile.png` under `artifacts/guidance`. They show version history, cutovers, coexistence, conversion refusal and native phone dialogs/source comparison. Inspection corrected ambiguous "Date unknown" copy to distinguish an unknown World year from a known calendar day, and corrected the open-period separator. Version selectors qualify otherwise repeated names. Phone overflow checks passed. Full-page/element captures contain the existing sticky navigation at the capture's scroll position; viewport/modal captures show the actual phone interaction. Artifacts are ignored by Git and reproducible by the suite.

## Migration and controlled release

`0101_worlds_calendar_evolution.sql` must follow `0100_worlds_calendar_creator.sql` (which follows 0099). It creates six operational tables: `world_day_reference`, `world_calendar_anchor`, `world_calendar_history`, `world_calendar_adoption`, `world_calendar_reform` and `world_calendar_entry_date`. Composite same-world FKs guard all version/entry/anchor associations; precision/range grammar is server validated, with database checks for identity, revision, decimal shape, source pairing and consecutive cutovers. Restrictive descendant FKs and the existing owned-World root guard account deletion. It neither changes existing columns nor backfills/reinterprets historical records.

When separately authorized:

1. Verify the release commit, server/database identity and applied journal. Preserve the current release and a verified database backup.
2. Pause conflicting writers and prepare the production build using the established release process.
3. Apply pending committed migrations in journal order through 0101 using `npx drizzle-kit migrate`. A database already through 0100 needs only 0101; earlier databases need their pending predecessors first. Do not use schema push or change applied checksums.
4. Activate this release and smoke-test Creator, History/Chronology compatibility, origin/anchor authoring, reform/adoption persistence, conversion, original-source reading, owner isolation, explicit read-only Admin review and authentication.

No new dependency, environment variable, mail provider, seed, import or automatic Campaign-time configuration is required. Origins/anchors are optional authored content: unanchored Worlds retain all earlier functionality and visibly refuse unsupported exact conversion.

A code rollback does not reverse 0101. Keep the additive tables, immutable anchors, source snapshots and ledger intact; prefer a forward fix. Checkpoint A can still read original World rows but cannot present new historical context, so pause incompatible History/calendar writers during rollback. A database restore requires stopped writers, a verified backup/target, reconciliation of subsequent changes and matching application/ledger versions. Removing tables or rewinding the ledger is not an application rollback.

No known Checkpoint B blockers remain. The checkpoint is ready for a separately authorized GitHub push and controlled server deployment. Existing homepage commit 86be939, authentication/password recovery, Heavens, Campaign, Character, Combat, inventory, Forms and Evolution implementations are preserved. No Atlas or other subsequent pass was started.

## Exact files changed

- Architecture/readiness: `docs/architecture/worlds-calendars.md`, `docs/reports/worlds-calendar-checkpoint-b-2026-10-09.md`.
- Migration registration: `drizzle.config.ts`, `drizzle/0101_worlds_calendar_evolution.sql`, `drizzle/meta/0101_snapshot.json`, `drizzle/meta/_journal.json`.
- Verification: `scripts/worlds-calendar-evolution-checks.ts`, `scripts/worlds-pass-one-disposable.test.ts`.
- Persistence/private mutation: `src/db/world-calendar-history-schema.ts`, `src/app/api/worlds/[worldId]/calendars/history/route.ts`, `src/features/worlds/calendar-evolution-service.ts`.
- Pure models/engine verification: `src/features/worlds/world-year.ts`, `src/features/worlds/calendar-dates.ts`, `src/features/worlds/calendar-dates.test.ts`, `src/features/worlds/calendar-evolution.ts`.
- Focused interface: `src/features/worlds/calendar-converter.tsx`, `src/features/worlds/calendar-date-fields.tsx`, `src/features/worlds/calendar-entry-fields.tsx`, `src/features/worlds/calendar-evolution-panel.tsx`, `src/features/worlds/calendar-history-editor.tsx`, `src/features/worlds/calendar-period-fields.tsx`, `src/features/worlds/calendar-source-details.tsx`.
- Existing Worlds integration: `src/features/worlds/calendar-service.ts`, `src/features/worlds/calendar-workspace.tsx`, `src/features/worlds/calendar.module.css`, `src/features/worlds/calendar.ts`, `src/features/worlds/history.ts`, `src/features/worlds/world-editor.tsx`, `src/features/worlds/world-service.ts`, `src/features/worlds/world-workspace.tsx`, `src/features/worlds/historical-timeline.tsx`, `src/features/guidance/page-help.ts`.
