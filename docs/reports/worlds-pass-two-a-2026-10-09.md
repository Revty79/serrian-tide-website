# Worlds Pass 2A completion and deployment readiness

Base: `c37bcf58c0c050151d78e5d66143f21be7a4571c`. The local release commit is supplied in the completion message; the commit containing this report is independently deployable. Pass 2B and 2C are not runtime dependencies. No remote push, server deployment or Production migration is performed by this pass.

## Completed functionality

The Chronology workspace creates, edits, previews, converts, selects a persistent default, archives and restores world-owned named year reckonings. Each carries a name, description, explicit historical origin, canonical epoch, zero/no-zero rule, before/after labels and optional notes. Cards identify the default, show origin and neighboring-year examples, and explain protected or retired definitions. Contextual editors retain failed drafts, show validation, guard unsaved changes and resolve two-tab conflicts through an explicit latest-version reload.

History and the overview preview share the selected convention for era labels, timeline ticks, visible ranges, grouped accounts, chronological lists and detail reading. Go to year accepts that same convention. Entry and era editors accept signed displayed years and convert them to canonical years. Each authored source retains its convention identity, revision, arithmetic, origin, labels and displayed source years separately from actual historical time. Original context remains readable after metadata edits and retirement. Default/display changes never rewrite history or move its canonical positions.

## Architecture, compatibility and numbering

Migration `0099_worlds_chronology.sql` follows 0098. It adds `world_dating_system` and `world_chronology_preference`, and nullable `dating_system_id`/`source_dating` columns to both historical-era and historical-entry tables. Composite foreign keys require sources and defaults to belong to their world; database checks enforce convention values and valid source identity pairing. The journal has 100 ordered entries through 0099, with a generated 0099 snapshot. Schema regeneration reports no changes.

Existing version-1 `world-year` JSON, signed whole-year range of minus one trillion through one trillion, true canonical Year 0, all five date kinds, open/overlapping eras, narrative/accuracy statuses and ordering remain unchanged. Migration does not backfill systems, defaults or fabricated precision. A null/absent preference explicitly selects the always-available canonical convention. Multiple independent IDs share one world; no universal calendar or exclusive adoption rule is imposed.

With delta = canonical year minus the system's epoch:

- Include Year 0: displayed year is delta; displayed zero identifies the epoch.
- Exclude Year 0: negative delta stays negative, and nonnegative delta becomes delta + 1. The year before the epoch is Year 1 Before; the epoch is Year 1 After. The inverse rejects zero and removes the positive-side extra one.

Conversions remain whole, reversible and safely inside JavaScript integer precision. Canonical range validation applies after inverse conversion. The service derives source metadata from an authorized current system; it does not accept a client-authored snapshot. Once a dated reference exists, epoch and numbering stay permanently locked. Names, descriptions, labels and notes may change while earlier snapshots retain their original wording. Archived definitions cannot receive new references or become the default, but existing references can be retained. World/default and system revisions protect concurrent writes under the existing owned-world lock.

G.O.D.s and Administrators author their own worlds. Explicit Administrator review of other owners stays read-only. Players and anonymous users are blocked; cross-world IDs and forged associations fail. Existing account-deletion protection through the owned World still covers all chronology descendants; the User foreign-key closure remains 103.

## Verification

Executed checks and results:

| Check | Result |
| --- | --- |
| `npm run validate:worlds` | 16/16 passed, including six new chronology unit tests |
| `npm run validate:navigation` | 42/42 passed |
| `npm run validate:catalog-visibility` | 13/13 passed |
| `npm run validate:appearance` | 12/12 passed, including shared-theme enforcement |
| Lifecycle and authorization unit tests | 81/81 passed |
| `npm run validate:catalog-visibility-db` | 52/52 tests across seven suites passed; fresh migration chain and existing-data upgrade passed |
| `npm run validate:worlds-disposable` | Passed twice; final run includes the phone layout correction and malformed-source rejection |
| `npm run validate:password-recovery` | Passed: isolated production build, keyboard show/hide, recovery setup across roles, code hashing/replacement/expiry/concurrency, phone reset, session invalidation, token reuse rejection and request protection |
| Focused ESLint | Passed on all changed application and test code |
| `npm run lint` | Full repository lint passed |
| `npx next typegen` and `npm run typecheck -- --incremental false` | Both passed, including final standalone TypeScript verification after both disposable builds |
| `npx drizzle-kit check` | Passed |
| Drizzle schema regeneration | No changes; no additional migration generated |
| `git diff --check` | Passed |

The Worlds disposable check upgrades an actual 0098 database containing existing Worlds and all five historical date representations, associations, users, catalog metadata, Campaign data and an active Session/Scene. Original row projections compare unchanged, new context/defaults remain absent, ledger length matches the journal, reapplication is safe, and the older read projection still works. It also migrates the complete application for an isolated optimized production build with its integrated TypeScript check.

Service checks exercise multiple systems, epochs and extreme years; known, approximate, window, duration, undated and open-era sources; locked referenced arithmetic; concurrent system revisions; defaults without date rewrites; source snapshots surviving edited labels and archival; malformed-source checks; same-world database foreign keys; and owner/Admin/Player privacy. Browser checks exercise authoring, conversion in both directions, zero validation, default persistence/reload, geometry measured before/after display changes, source-context reading, failed saves, actual two-tab conflicts, retirement retention and phone authoring/persistence. Existing measured era-label positioning, Registry and classification selection/retention/privacy regressions, crowded markers, keyboard/drag navigation and historical conflict checks also pass.

Authenticated HTTP/direct-route checks cover both G.O.D. users, explicit read-only Admin review, Player and anonymous denial, forged source/default IDs, no-store responses and cross-origin rejection. The fixture snapshots existing Campaign/combat/Form/Evolution, inventory-operation and shared-library data before migration and after navigation/authoring; those rows remain unchanged. Browser runtime error collection is empty. No production application or Production database is used for these checks.

## Screenshot inspection

Actual Chrome captures were visually inspected at desktop 1440 x 900 and phone 390 x 844. Chronology uses the shared theme, distinct cards, default and archived badges, origin mapping, readable conversion output and contextual guidance. Phone cards, conversion controls and editor epoch/numbering/label fields stack. The first inspection found cramped phone epoch guidance; the fields were corrected and the complete disposable build/browser checks rerun. Final phone screenshots have readable guidance, reachable save controls and no horizontal overflow.

Evidence in ignored local `artifacts/guidance/`:

- `worlds-chronology-desktop.png`
- `worlds-chronology-mobile.png`
- `worlds-chronology-editor-desktop.png`
- `worlds-chronology-editor-mobile.png`
- Existing `worlds-era-labels-desktop.png`, `worlds-era-labels-mobile.png`, history/overview/Registry/classification and history-editor captures regenerated by the same run.

Screenshots supplement actual DOM bounding-box assertions; they are not the sole positional regression.

## Scope, limitations and future foundation

No month/day calendar, leap rule, season/festival, celestial simulation, Atlas/geography, publishing, automatic simulation, Campaign time advancement or mechanics are introduced. Canonical years are indices with no assumed year length. Archived contexts remain readable; used arithmetic is changed by creating a separate reckoning. Calendar identity/version, overlapping adoption/effective periods, reforms linked to existing History and explicit elapsed-reference/precision mapping are documented in `docs/architecture/worlds-pass-two-a.md`, including 10 x 36 versus 12 x 30 versus 12 x 29 months and skipped/repeated printed dates. No empty future tables or controls were added. Pass 2B may add functional authored calendar structures, and 2C historical evolution; current features need neither.

The homepage remains exactly as commit `86be939` left it. Password recovery, Heavens, Campaign, Character, Combat, inventory, Forms and Evolution implementation/permissions are outside the application diff. The permanent requirement is recorded in `AGENTS.md` and `docs/operations/pass-deployment-standard.md`.

## Exact changed files

- `AGENTS.md`
- `docs/architecture/worlds-pass-two-a.md`
- `docs/operations/pass-deployment-standard.md`
- `docs/reports/worlds-pass-two-a-2026-10-09.md`
- `drizzle/0099_worlds_chronology.sql`
- `drizzle/meta/0099_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/worlds-chronology-checks.ts`
- `scripts/worlds-pass-one-disposable.test.ts`
- `src/app/api/worlds/[worldId]/chronology/route.ts`
- `src/db/world-schema.ts`
- `src/features/guidance/page-help.ts`
- `src/features/worlds/chronology.ts`
- `src/features/worlds/chronology.test.ts`
- `src/features/worlds/chronology-workspace.tsx`
- `src/features/worlds/chronology-year-input.tsx`
- `src/features/worlds/chronology.module.css`
- `src/features/worlds/client-api.ts`
- `src/features/worlds/historical-timeline.tsx`
- `src/features/worlds/history.ts`
- `src/features/worlds/world-editor.tsx`
- `src/features/worlds/world-field.tsx`
- `src/features/worlds/world-service.ts`
- `src/features/worlds/world-workspace.tsx`
- `src/features/worlds/worlds.module.css`

## Controlled deployment and recovery

No new environment variables, configuration changes, packages, email service or external infrastructure are required. Retain existing protected `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` deployment configuration. Test-only database URLs/build directories are not release configuration.

When separately authorized:

1. Verify the exact local release commit, target database identity and applied migration ledger. Build/install through the existing operator-managed process and retain the currently deployed release.
2. Pause conflicting application writes and take/verify a protected database backup. Preserve a ledger/schema/data baseline for comparison.
3. Apply committed pending migrations in journal order with `npx drizzle-kit migrate`. A server already through 0098 needs 0099; earlier servers must first apply their pending predecessors. Do not replay a baseline against incompatible historical ledgers and do not use `drizzle-kit push`.
4. Confirm both new tables, four nullable columns, constraints and the 0099 ledger entry. Check existing Worlds/history are unchanged. Activate the Pass 2A build only after migration succeeds.
5. Smoke-test canonical existing history, create/convert/default/persist a reckoning, source-aware history editing, a second owner's denial and explicit Admin read-only review. Resume writes when those checks pass.

Prefer a reviewed forward fix. Reverting code leaves schema, source metadata and ledger unchanged. Older Pass 1 readers remain compatible with the additive schema, but pause historical-date and chronology writes during an older-code fallback: old editors cannot maintain new source metadata. Retain new columns/tables and roll forward before resuming those writes. A database restore requires stopped writers, preservation/reconciliation of post-backup changes, a verified backup and matching application/ledger versions. Do not improvise rollback by deleting migration ledger rows or dropping live metadata. The rehearsal verifies additive read compatibility and migration reapplication; it does not simulate a Production backup restore.

Migration 0099 has been applied only to disposable test databases. Server-specific ledger, backup and hosting activation remain controlled deployment steps, not unresolved feature dependencies. Stop development after Pass 2A for review before beginning Pass 2B.

**Readiness:** no remaining implementation or validation blockers. Ready for an explicitly authorized GitHub push and controlled server deployment of Pass 2A, with migration 0099 applied before activating this code. No future development pass is needed. The checkout is to be committed locally with only the 25 files listed above; the final completion message identifies that commit and confirms its worktree status.
