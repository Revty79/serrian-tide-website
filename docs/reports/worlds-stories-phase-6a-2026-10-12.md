# Phase 6A: Lore, Stories and Legends

Starting checkout: clean at approved `3550f8bd765e9e3f0531ee56e14107a5bf944a56`. Git status, uncommitted changes, latest commits, preserved bridge receipts and the established Worlds architecture were inspected first. The exact local release SHA is supplied in the completion handoff; this report is committed in that release. Ember's independent technical review and owner experience acceptance remain pending. No push, deployment, shared-service restart, shared DEV/Production write or Phase 6B work occurred.

## Implemented increment

Stories extend the common World lore identity/version/head/audit architecture rather than create a competing identity system. The new workspace at `tab=stories` supports a name-only start, arbitrary classifications, optional introduction and ten typed narrative fields: classification, full story, origin, authorship, narrator, audience, transmission, historical uncertainty, interpretations and original source context. Named passages and transmission periods have stable identities, optional/protected text and independently unknown endpoints. Nothing determines fictional truth, infers continuing circulation or creates a History event from prose.

The accepted CreatorWorkshop supplies visible questions and (?) guidance, full editable drafts, preview, saved readers, search/classification/lifecycle/place filters, validation, revision conflicts and failed-save/navigation protection. Story-telling/recording dates and alleged-event dates have independent controls, uncertainty, chronology notation and optional exact original calendar sources. Related History events are explicit actions; event/era citations retain their actual immutable versions.

People & creations uses every existing family through custom connections and familiar shortcuts. Multiple saved participants, original roles and unresolved wording remain distinct. Atlas references use actual geography identities. Existing creation/place readers show inverse story relationships. Earlier-account connections preserve real story identities, original versions/revisions/names/text and authored relationships. Source readers require a connection in the current selected owner story, so a guessed version UUID is insufficient. Rename/archive never silently replaces a saved pin. Current milestones are not injected into the retained original narrative reader.

Readers offer “Write a retelling” and “Write a contradictory account”; each starts a separate draft with the selected original source. Archived source shortcuts require restore before a new reference, while existing historical pins remain available. “Refresh earlier story choices” retains the parent draft and existing pins. If a newly selected source changes, remove that new connection and deliberately select its refreshed version. Failed requests and stale revisions retain unsaved text.

Primary, independent alternate authorship, deliberate parent inclusion/exclusion, retained originals, local interpretations and explicit adoption of new parent sources use the existing branch architecture. Story continuity always requires a decision on divergence; alleged-event dating never establishes that the telling happened before divergence. Parent content remains immutable.

## Data and privacy

Only new migration `0123_worlds_stories.sql` follows 0122. It adds `world_story_version`, `world_story_context` and `world_story_source`, restrictive composite same-World/family/version foreign keys, immutable child guards, required typed/context completeness, story family checks, source notation/endpoint/order checks and a story branch in the metadata view. Existing rows and migrations were preserved. No new User/Campaign foreign keys, packages, environment variables, permission grants or runtime integrations are added.

Final migration SHA-256: `0de340633cdb2275a5d32f2bd65e259c5c69887f03c9bc368d28f62ae753acaa`; staged Git blob: `75db2b75df89111b3a00054cb7af17223697a671`. Migration 0122 remains unchanged with SHA-256 `9cb9fb385fb9da5fb60a91b2e8c914ea3bc6d1c3ea51f1c21061f97f1694945c`.

Ownership, Player/foreign-owner rejection and explicit read-only Administrator review remain server enforced. Ordinary knowledge is a private preview. Protection filters run before titles, choices, counts, lists and inverses. Protected narrative fields/passages/periods/alleged context, source associations, revealing participants, confidential Atlas descendants and protected source calendars withhold the entire story. Private author notes are stripped without alone hiding an otherwise safe story. Earlier families retain their existing independent field behavior.

The shared ordinary-source graph propagates secrecy through immutable version dependencies and selected current heads. Old and current source protection are independent; a public current revision does not release an older secret original, and current secrecy suppresses older pins. Story/History cycles terminate through deduplicated recursive sets. Missing, pending and excluded heads do not fall back to Primary.

## Executed verification

| Check | Actual result |
| --- | --- |
| Focused domain/reader and existing lore/branch/calendar/bridge tests | 36/36 passed |
| Existing workshop compositions and User/Campaign lifecycle closure | 38/38 passed; current 111-FK User closure remains correct |
| Fragment/control guidance rendering regressions | 3/3 passed; story classification datalist causes no Fragment warning |
| Final focused story/profile/pilot/Fragment repetition after UI refinements | 12/12 passed; overlaps the above tests |
| Story services | 12/12 groups passed: minimal/all ten typed fields, passages/periods, independent dates, idempotence, no automatic History, competing accounts, original preservation, inverses, archive/restore, authorization/cross-World/wrong-family references, branch decisions/interpretation, ordinary privacy, protected old/current pins, exact History/calendar sources, cycles, confidential descendants and DB immutability |
| Linking bridge services | 13/13 existing groups passed against schema 0123 |
| 3550 bridge correction regressions against 0123 | 9/9 groups passed: valid/rejected exclusions, reinclusion/interpretation/archive recovery, 2,001 unrelated records, exactly 2,000 eligible records, explicit eligible overflow and 2,001 protected plus 2,001 pending/excluded records omitted before ordinary limits |
| Migration rehearsal | Fresh disposable installation, populated approved-schema upgrade, unchanged pre-existing World rows and migrator reapplication passed using final staged Git bytes |
| Migration/schema consistency | `drizzle-kit check` passed; generation after final schema/snapshot alignment reported no changes |
| Production | Final isolated Next production build passed; generated configuration restored |
| Actual desktop and native-touch phone | 1440×900 and 390×844 authenticated Chrome journeys passed; no horizontal overflow or React/browser errors |
| Browser workflows | Original classification/full story/authorship, keyboard focus, two dates, retained source/reader, source refresh without loss, transmission period, passage, failed-save retry, persisted reload, retelling draft, archive/restore, two-tab revision conflict, cancellation protection and branch-to-Primary switching passed |
| HTTP roles and actual Admin page | Foreign G.O.D. 404, Player 403, implicit Admin 404, explicit review 200; actual Admin reader has no create/edit controls |
| TypeScript/lint/whitespace | `tsc --noEmit`, whole-application `eslint --quiet` and `git diff --check` passed |

77 distinct focused unit/rendering/lifecycle tests passed across the first three rows; repetitions are not counted as extra distinct tests. Phase 9's comprehensive integrated assessment was intentionally deferred. Earlier complete A2–I/bridge evidence was retained rather than rerun wholesale.

Evidence is retained locally under `artifacts/guidance/worlds-stories/`: migration/service/correction/browser JSON receipts, desktop/phone reader/conflict screenshots, isolated production log/build and task environment marker. It is test-only, ignored output. `scripts/worlds-stories.test.ts` can resume completed stages against its exact retained disposable clone; `--services-only`, `--build-only`, `--no-build` and `--bridge-corrections-only` keep unfinished checks separate. It restores generated TypeScript files and stops the task-owned cluster/server. The original completed linking test database is a template and was not modified.

Harness issues were kept separate from product failures. An outdated source used as a new test connection was correctly rejected with 409 and the fixture was corrected. Initially broad label locators matched help/protection controls; exact locators fixed that ambiguity. PowerShell/script/module and sandbox PostgreSQL startup issues were execution limits, resolved without shared operations. The initial raw bulk-capacity fixture produced a several-minute query plan with stale statistics and was cancelled in its disposable connection. The same source projection took about 30 ms and exact choice shape about 3 seconds with refreshed fixture statistics; analyzing the raw bulk seeds allowed all nine correction groups to pass under normal application settings. No privacy filter, capacity check or application database configuration was weakened. Cold statistics after large raw imports remain a performance caveat for later assessment; this is not evidence of unrestricted scale.

## Controlled release and recovery

This is a complete local increment awaiting independent review; readiness to push/deploy is conditional on that review and separate authorization. No outstanding technical test failure remains. Owner experience acceptance is separate from browser automation.

For a future authorized release, verify the exact reviewed commit, database identity and migration ledger, preserve a verified backup/current release, apply committed migrations in order through 0123 with the established migrator, build against that schema, activate through the existing operator process, and run authenticated owner/ordinary/explicit-Admin desktop/phone smoke checks. The source graph requires the new tables before activating this code. Configuration is unchanged; never use schema push or edit earlier migrations.

Reverting code does not undo schema, source rows or the migration ledger. Older readers do not understand the new story family and cannot be assumed compatible after stories exist. Prefer a reviewed forward fix; pause affected writers if recovery is needed. A backup restoration requires separate authorization, a verified target and reconciliation of post-backup changes and application/ledger versions. Do not delete source identities or ledger entries to accommodate older code.

Limits: existing shared 2,000 retained lore identities per World/selected collection and 100-record pages; 50,000 characters per text field/passage; 40 passages, periods and originals; 100 participants and History citations. Narrative text is plain text. Draft protection follows the accepted in-memory workshop; crash-proof autosave is not claimed. No public publishing/export, truth adjudication, geometry changes, Map Studio, canon workflows, VTT mechanics or Phase 6B controls are included.

## Changed files

- Navigation/workshop integration: `src/features/worlds/world-workspace.tsx`, `peoples-workspace.tsx`, `pilot-editor.tsx`, `pilot-profile.tsx`, `pilot-history-fields.tsx`, `pilot-composition.ts`, `pilot-connections.tsx`, `creator-composition.ts`.
- Domain, persistence and privacy: `src/features/worlds/peoples.ts`, `peoples-service.ts`, `stories.ts`, `stories-composition.ts`, `story-source-service.ts`, `ordinary-knowledge.ts`, `ordinary-source-graph.ts`, `src/app/api/worlds/[worldId]/peoples/route.ts`.
- New story controls/readers: `src/features/worlds/story-fields.tsx`, `story-period-fields.tsx`, `story-source-reader.tsx`.
- Schema/migration: `src/db/world-peoples-schema.ts`, `src/db/world-story-schema.ts`, `drizzle.config.ts`, `drizzle/0123_worlds_stories.sql`, `drizzle/meta/0123_snapshot.json`, `drizzle/meta/_journal.json`.
- Validation: `src/features/worlds/stories.test.ts`, `scripts/worlds-stories.test.ts`, `scripts/worlds-stories-checks.ts`, `scripts/worlds-stories-bridge-regressions.ts`.
- Living guidance/handoff: `AGENTS.md`, `docs/architecture/worlds-stories.md`, `worlds-creator-experience.md`, `worlds-creator-coverage.md`, this report.
