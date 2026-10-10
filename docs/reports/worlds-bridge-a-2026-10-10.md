# Worlds Bridge A: release and inspection report

The approved starting commit is `cb86d43a5aebf2ef89fa6533649a3e15dc77b163`. This report belongs to the local release commit titled **Complete Worlds alternate historical timelines Bridge A**; its exact SHA is provided in the completion response and by `git rev-parse HEAD`. No GitHub push, server activation, DEV migration or Production write is part of this pass.

## Completed functionality and inspected foundations

Inspection covered World ownership/service/HTTP authorization, historical eras/entries/relationships, canonical signed years, reckonings, immutable calendar rules/anchors/source notation/reforms, the 0111 ledger, stable Atlas identities and lifecycle, and the existing disposable production-browser harness. The implementation extends those systems as described in [Branching history architecture](../architecture/worlds-branching-history.md).

Every existing and new World receives a permanent Primary History identity. A working Timeline Manager creates alternatives from primary or alternate parents, records an authored canonical divergence/name/description/unrestricted explanation, shows relationships, switches histories, edits metadata and archives/restores alternatives. Existing eras, entries, calendar sources and Atlas data retain their original identities and representations. Primary-only creators continue using the familiar History workflow.

Branches pin immutable source versions by reference. Their entries and eras support the existing account, notes, dates, uncertainty, planned/recorded status, accuracy, reckonings, precise calendar context, era relationships and lifecycle. Local interpretations retain the original entity identity. Later parent edits cannot overwrite a branch or descendant. Source review identifies changed parent versions; explicit acceptance validates both current branch and exact parent revisions transactionally.

Divergence is the start of Year N. Fully dated predecessor accounts ending strictly before N are inherited. Events beginning at N or later are not automatically inherited. Approximate predecessor dates, crossing intervals, unknown dates and earlier plans require decisions. A spanning era retains its immutable original ending while the effective branch has unknown continuation and a visibly bounded predecessor extent. Author controls adopt a complete source deliberately, exclude it or create a branch interpretation. Source dates are never fabricated or rewritten for inheritance.

Deep links, Back/Forward, unsaved-navigation cancellation, failure drafts, explicit conflict reload, native dialogs, phone touch editing and save/reload are operational. The shared appearance system and field/page guidance explain the selected history and its rules. Shared World historical-overview prose is clearly identified in alternatives and edited from Primary History.

Calendars remain shared World definitions and immutable source notation. Alternate views do not project Primary History's adoptions/reforms as alternate events. Server-side reform authoring rejects links to branch-origin accounts until dedicated timeline-specific calendar reforms exist. History accounts may still describe alternate reforms freely. No Campaign association, clock, NPC, Phase 4 editor, gameplay consequence, VTT, public sharing or System Canon feature was added.

## Database integrity and preservation

`0112_worlds_branching_timelines.sql` follows 0111. Four new tables store timelines, immutable versions, effective heads and versioned era relationships. The two existing historical tables gain backfilled origin timeline references; every other existing column remains unchanged. Existing entries/eras are snapshotted with all source context and links. New World inserts automatically create Primary History.

Same-World composite foreign keys protect ancestry, source entities, heads, reckonings and anchored calendar versions. Primary uniqueness/permanence, immutable ancestry/divergence, valid parent boundaries, retained heads and append-only sources/relationships have SQL protections. Requiring an existing parent plus immutable parentage prevents cycles. Owned-World locks and per-record revisions protect all mutations. An archived parent keeps descendants accessible; no new branch can use an archived parent.

Populated upgrade comparison includes historical dates/source notation, every prior calendar/evolution table, Atlas geography/maps/drawings/features/connections, settlements/buildings/memberships, interiors/floors/rooms/shapes and existing dungeon sites/levels/protected rooms/shapes. Migration reapplication retains the same primary IDs and projections. A fresh disposable installation also applies the complete journal. SQL/snapshots through 0111 and prior screenshot evidence are unchanged; homepage commit `86be939` remains an ancestor and homepage/authentication implementation files have no changes.

All reads validate role and World ownership before selecting a timeline. All writes run in the established owned-World transaction. Foreign G.O.D.s, Players and anonymous users cannot use known timeline IDs to access history. Administrator review explicitly advertises read-only capabilities and cannot write another owner's records. Cross-World parent/entity/version/relationship forgeries are rejected. Stale unchanged submissions leave heads and version counts unchanged.

## Executed verification

| Check | Result |
| --- | --- |
| `npm run validate:worlds` | 86/86 passed, including boundary/uncertainty/source extent checks |
| `npm run validate:worlds-disposable` | Passed: populated 0111 upgrade, migration reapplication, all service/SQL checks, production build/TypeScript and the complete desktop/phone browser suite |
| `npm run validate:catalog-pass-three` | 298/298 passed |
| `npm run validate:catalog-visibility-db` | 52/52 across seven groups passed; fresh installation through 0112 and existing catalog/privacy database suites |
| Navigation, authorization, appearance, lifecycle, authentication and Campaign units | 170/170 passed |
| Forms, Evolution, combat, Character, firearms and inventory units | 194/194 passed |
| `npm run validate:password-recovery` | Passed: production build, keyboard show/hide, recovery setup for all roles, native phone reset, failed/reused/expired codes, concurrency, session revocation, CSRF and rate limits |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run lint` and final focused browser-script lint | Passed |
| `npx drizzle-kit check` / `npx drizzle-kit generate` | Passed / no schema changes to generate |
| `git diff --check` | Passed |
| Read-only `npm run validate:migration-ledger` against local DEV | Expected pending-migration result: DEV remains at 0108; no migration applied |

The full browser suite checks actual saved data, era label/band geometry, partial inherited-era extent, timeline branching/authoring/reconciliation, actual two-tab conflicts, archive/restore, direct URLs, failed drafts, Back/Forward and canceled navigation, authorization and native phone behavior. It also exercises existing generation/refinement/cartography, connected map navigation, settlements, interiors and dungeons, and compares Campaign/runtime data before and after. Negative authorization cases deliberately return denied responses; those expected server diagnostics are not browser failures.

Screenshots are opt-in under the updated Bridge A rule (`SERRIAN_WORLDS_SCREENSHOTS=1`). Earlier evidence remains intact. A small temporary diagnostic capture was inspected while investigating a stale calendar fixture name; repeated screenshot deliverables are not generated or committed. Actual desktop/phone functional and geometry checks remain mandatory and were executed.

## Observed performance and limits

The fixture has 1,200 historical accounts and 12 alternatives, including nested branches. All branches share 1,200 immutable payload versions rather than copying their history. Creating the 12 branches took **4,161 ms**. The selected server projection loads only selected heads/versions and direct-parent comparison metadata; no revision archive is sent to the browser. Its final measurement was **19 ms**, **1,983,899 bytes**. Real browser switching was **302 ms** and searchable browsing **66 ms**. These are local disposable production-build measurements, not a Production capacity claim.

Initial supported bounds are 256 retained timelines per World and 5,000 retained identities per timeline, counting archived/excluded identities. Views use bounded queries and incremental list/review rendering. Large prose increases payload size. Parentage/divergence rebasing, importing newly added parent identities, timeline-specific calendar adoption/reform states, timeline-specific Atlas states and pagination beyond these bounds remain explicit future work. Existing pinned identities can be reconciled now. These extensions are not dependencies of Bridge A.

## Deployment readiness and recovery

There are no new packages, environment variables, SMTP requirements or external services. The feature is independently deployable with its migration and does not require Bridge B or Phase 4.

The live **read-only** local check found `serrian_tide_dev` at 0108: 109 ledger entries versus 113 journal entries. Its remaining order is **0109 → 0110 → 0111 → 0112**. The mismatch is expected because these pending migrations were not authorized/applied here. Disposable ledgers are complete through 0112. Production ledger/state was not inspected or modified; operators must verify its actual pending sequence.

For an authorized release: verify this release SHA, server/database identity and actual ledger; stage the production build; pause conflicting writes and preserve a verified backup plus the running release; apply committed pending migrations in journal order with `npx drizzle-kit migrate` under the [controlled release procedure](../operations/pass-deployment-standard.md); activate only after success; smoke-test old primary records, a branch, distinct authoring, explicit reconciliation, private access and read-only review. No automatic deployment or remote push occurs.

A Git revert does not reverse database changes. Older Worlds code reads all World records and could blend branch-origin records into primary history; older writers omit version capture. Do not restore those older Worlds readers/writers after branches exist without a compatibility fix or temporarily disabling Worlds access. Prefer a reviewed forward fix. If restoring a backup, stop writers, preserve subsequent edits for reconciliation, restore to a verified target and align application code and migration ledger with that restored point. Do not drop source history or delete migration ledger rows as an improvised rollback.

No coding prerequisite from Bridge B is required. Before Bridge B, confirm the separate association scope and the intended treatment of archived timelines/Worlds; it can use these stable IDs without replacing them. Stop at this Bridge A checkpoint.

## Final readiness and exact files

Bridge A has no remaining implementation or verification blockers. It is ready for an authorized GitHub push and controlled server deployment after target-ledger verification and the required ordered migrations. No code for Bridge B is required to use or deploy this release. DEV is deliberately still unmigrated, and Production is untouched. The local release commit contains the following 40 files; temporary logs, diagnostic images and existing screenshot evidence are excluded.

Documentation:

- `docs/architecture/worlds-branching-history.md`
- `docs/reports/worlds-bridge-a-2026-10-10.md`

Database and migration registration:

- `drizzle.config.ts`
- `drizzle/0112_worlds_branching_timelines.sql`
- `drizzle/meta/0112_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/db/world-schema.ts`
- `src/db/world-timeline-schema.ts`

Routes and shared guidance:

- `src/app/api/worlds/[worldId]/route.ts`
- `src/app/api/worlds/[worldId]/timelines/route.ts`
- `src/app/worlds/[worldId]/page.tsx`
- `src/features/guidance/page-help.ts`

Worlds functionality and focused units:

- `src/features/worlds/branching-history-service.ts`
- `src/features/worlds/branching-history.test.ts`
- `src/features/worlds/branching-history.ts`
- `src/features/worlds/calendar-evolution-service.ts`
- `src/features/worlds/calendar-workspace.tsx`
- `src/features/worlds/historical-timeline.tsx`
- `src/features/worlds/history-version-service.ts`
- `src/features/worlds/history.ts`
- `src/features/worlds/timeline-manager.tsx`
- `src/features/worlds/timeline.ts`
- `src/features/worlds/world-editor.tsx`
- `src/features/worlds/world-service.ts`
- `src/features/worlds/world-workspace.tsx`
- `src/features/worlds/worlds.module.css`

Disposable database/browser checks and the updated optional screenshot policy:

- `scripts/worlds-atlas-checks.ts`
- `scripts/worlds-branching-checks.ts`
- `scripts/worlds-browser-evidence.ts`
- `scripts/worlds-calendar-checks.ts`
- `scripts/worlds-calendar-evolution-checks.ts`
- `scripts/worlds-cartography-checks.ts`
- `scripts/worlds-chronology-checks.ts`
- `scripts/worlds-connected-geography-checks.ts`
- `scripts/worlds-dungeon-checks.ts`
- `scripts/worlds-generation-checks.ts`
- `scripts/worlds-interior-checks.ts`
- `scripts/worlds-pass-one-disposable.test.ts`
- `scripts/worlds-refinement-checks.ts`
- `scripts/worlds-settlement-checks.ts`
