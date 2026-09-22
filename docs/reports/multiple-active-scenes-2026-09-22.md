# Multiple active Scenes — 22 September 2026

## Baseline and scope

Fetched `origin/main` and verified it matched local `main` at `0e68938ebd6c4ebefd515905a31f1cff690e3d19`, with a clean working tree. This pass implements only simultaneous active Scenes and the safeguards/presentation required for them.

## Migration

`0065_multiple_active_scenes.sql` contains one statement: drop `campaign_session_scene_one_active_per_session_uq`. The Drizzle schema, journal and generated snapshot agree; the snapshot was compared against 0064 and differs only in that index and its migration identities.

The migration does not edit rows, timestamps, sequence numbers, membership, history or Character data. The existing unique Scene sequence per Session, required Encounter Scene reference, one-active-Encounter-per-Scene index and one-active-Session-per-Campaign index remain unchanged.

Migration validation used fresh disposable PostgreSQL clusters. An upgrade from 0064 preserved the exact contents of every public table, including planned, active and completed Scene fixtures with nonconsecutive sequence numbers. This pass does not apply migrations to shared DEV, home or production databases. Each installation must apply its normal Drizzle migrations before using this change, then rebuild/restart as usual.

## Behavior

- Starting or reopening a Scene succeeds while other Scenes in the same active Session are active, provided their members do not overlap.
- A shared Character or NPC blocks activation with their name and the conflicting Scene title. Failure leaves the Scene unchanged.
- Adding a member to an active Scene performs the same check. Planned Scene memberships may overlap, with validation deferred until activation. No automatic transfer occurs.
- The shared check holds the parent Session lock through the write. Existing authorized Scene actions already hold that parent lock. Concurrent start/start, add/add and start/add tests confirm that only one conflicting assignment succeeds.
- Town placement, NPC inclusion and refresh can also create Scene memberships. Their shared membership helper now calls the same guard. This is the only location-service behavior change; it prevents a normal G.O.D. action from bypassing the new invariant, and a failed placement rolls back atomically. Town/Shop placement and navigation are otherwise unchanged.
- Player Tabletop already resolves Scene membership for the exact selected Character. That read path is unchanged: Sarah, Kennith and Rebecca resolve independently to Junction, Cedar & Steel and South Gate. Corrupt overlapping memberships retain the existing defensive ambiguity error. The waiting message now says “an active Scene.”
- The G.O.D. Active Table summary displays the active Scene count and all names. The closeout read model returns all active Scenes and Encounters, with each Encounter's own Scene and Initiative summary, instead of choosing the first. Existing closeout blockers already cover all Scenes and remain authoritative; completion is blocked until the last active Scene completes. Planned unused Scenes/Encounters remain warnings.
- Separate active Scenes can each start an Encounter. Starting a second active Encounter in the same Scene still fails, as does starting a second active Session in the Campaign. Combat and Initiative services were not modified.

Existing member-removal protections remain: Encounter history, included Town NPCs and active Shop visits can prevent removal. This pass does not erase those references or introduce a transfer workflow.

## Validation

- `node --import tsx --test scripts/multiple-active-scenes-disposable.test.ts`: migration preservation plus **41 passing database/action tests** across five scripts: 12 new multi-Scene tests, 24 existing Tabletop Operations tests, 3 Session Closeout tests, 1 Player Tabletop test and 1 comprehensive location-placement test.
- The new tests invoke the real Scene, Encounter and Session server actions against PostgreSQL. Only HTTP authentication and Next cache invalidation are mocked; application ownership/lifecycle checks, transactions, audit writes and live invalidation remain real. The test runner requires Node's experimental module-mocking flag, supplied by the harness.
- **72 focused unit/source tests** passed: Scene, Session and Encounter foundations, Session Closeout and Player Tabletop.
- TypeScript, changed-file ESLint, `drizzle-kit check`, schema-snapshot comparison and `git diff --check` passed.
- Production build passed with isolated `.next-race-authoring-build` output. The build's temporary `tsconfig.json` additions were restored afterward.
- The existing location regression had an obsolete hardcoded 41-migration assertion. It now checks the current journal length; its behavior assertions passed unchanged.

No browser walkthrough or human gameplay acceptance is claimed. No broad combat regression or unrelated refactoring was performed.

## Singular Scene assumptions retained

No known Session-wide first-active-Scene assumption remains in the inspected runtime/presentation paths. The dashboard still edits one **selected** Scene at a time, Player Tabletop still resolves one Scene for its selected Character, and Encounter controls remain scoped to one Scene. Those are intentional selection/identity boundaries. A dashboard for viewing or managing several Scenes side by side belongs to the later redesign.

## Exact files changed

1. `docs/architecture/tabletop-operations.md`
2. `docs/reports/multiple-active-scenes-2026-09-22.md`
3. `drizzle/0065_multiple_active_scenes.sql`
4. `drizzle/meta/0065_snapshot.json`
5. `drizzle/meta/_journal.json`
6. `scripts/multiple-active-scenes-db.test.mjs`
7. `scripts/multiple-active-scenes-disposable.test.ts`
8. `scripts/tabletop-location-placement-db.test.ts`
9. `scripts/tabletop-operations-db.test.ts`
10. `src/app/heavens/tabletop/scene-actions.ts`
11. `src/app/heavens/tabletop/tabletop-workspace.tsx`
12. `src/db/tabletop-operations-schema.ts`
13. `src/features/tabletop-operations/location-placement-service.ts`
14. `src/features/tabletop-operations/player-tabletop-console.ts`
15. `src/features/tabletop-operations/scene-foundation.test.ts`
16. `src/features/tabletop-operations/scene-foundation.ts`
17. `src/features/tabletop-operations/scene-membership-service.ts`
18. `src/features/tabletop-operations/session-closeout-service.ts`
19. `src/features/tabletop-operations/session-closeout.test.ts`
