# Worlds Phase 4B privacy correction

Starting SHA: `d86531e3ffdd36abeaf13e74678f675cef726916`. The ending SHA is the local commit containing this report, reported exactly in the completion response; retrieve it with `git log -1 --format=%H -- docs/reports/worlds-4b-privacy-correction-2026-10-10.md`. This is a complete follow-up privacy correction, stopping before Phase 4C.

The uncovered case was reproduced against the starting checkpoint with actual saved sources: Iona was protected, Vale ordinary, and the ordinary relationship “Iona is Vale's true parent” had two participant rows with `protected = false`. Ordinary search returned that revealing relationship. Filtering the participant ID alone did not protect its title, inverse discovery, references or related History narratives. An ordinary event linked to a sensitive identity could likewise retain a revealing title, account, categories and types, including through another public linked entity.

`ordinary-knowledge.ts` now resolves a set of eligible immutable sources from the selected timeline's effective heads. A relationship is withheld entirely when its own participant flags are protected or its saved participants are protected, pending, excluded, missing or archived in that timeline. Secrecy propagates through references to other relationships, with recursive deduplication handling cycles. Ordinary readers use the effective pinned source without origin or latest Primary History fallback. Public individual profiles retain ordinary biographies and ordinary relationships when an independent affiliation is confidential.

Historical projection withholds the entire event when any saved link references a withheld lore identity or protected dungeon place. This applies to relationship-editor milestones, manually linked existing events and later History edits whose nominal visibility remains ordinary. Sensitive accounts do not contribute titles, narratives, event types, categories, matching counts, reference choices or navigation. Retained historical pins must be safe themselves and have an available safe effective event in the selected timeline. The correction neither rewrites immutable sources nor changes stable entity/event IDs. A separate intentionally public-safe event without confidential links remains authorable; the Vale/public-harbor account demonstrates this capability.

Author knowledge still presents all protected identities, participants, relationships and historical sources. Explicit Administrator review retains the same full read-only view; its ordinary preview uses the same filtered projection. Foreign G.O.D., Player and anonymous access remains denied. Knowledge selection persists across History/individual links and reload. Ordinary Overview labels use projected History and author totals are withheld, including the History navigation count. Existing semantic appearance and field guidance are retained.

| Affected reader | Behavior covered |
| --- | --- |
| `peoples-service.ts` and `peoples-geography-service.ts`; `/api/worlds/[worldId]/peoples` | Metadata/search/pagination, summaries, detail, references, place discovery, inbound accounts, milestones and retained historical sources |
| `history-index-service.ts`; `/api/worlds/[worldId]/history` | Visible links, search, categories/types/facets and direct entry lookup |
| `milestone-service.ts`; `/api/worlds/[worldId]/milestones` | Whole-event eligibility before historical link lookup and ordinary choices |
| `atlas-milestone-service.ts`; `/api/worlds/[worldId]/atlas/milestones` | Sensitive events withheld from otherwise public places |
| Individual, History, Atlas-history and World workspace readers | Ordinary navigation, reload, Overview labels and counts |

`scripts/worlds-individual-privacy-checks.ts` extends the actual disposable PostgreSQL and production browser suite. It checks these cases with persisted identities, sources and event links:

| Required case | Evidence |
| --- | --- |
| A: protected target, unprotected participant link | Iona/Vale's saved relationship has two explicitly unprotected participant rows; ordinary metadata/detail/inverse/source/pickers cannot disclose it |
| B: explicit participant protection | A confidential link between otherwise public Vale/Rin remains withheld, including in a timeline where Iona is public |
| C: public individual/private affiliation | Vale's biography, companion and friendship accounts and separate public milestone remain available |
| D: linked historical event | Editor-created, manually linked and corrected nominally ordinary events are withheld from direct/index/facet/link/entity/place/source readers; old pins cannot bypass current sensitive links or an excluded event |
| E: alternate timelines | Included relationships remain withheld for pending/excluded/missing targets; an inherited relationship becomes ordinary only after a local ordinary participant interpretation; Primary changes do not alter child/nested pins |
| F: multiple participants | Four-party ancestry and indirect cyclic confidential relationships expose no title/count/reference metadata; public cycles remain readable |
| G: identities/corrections | Individual, relationship and canonical event IDs remain unique; old corrected sources remain intact; immutable-source digests are unchanged by ordinary reads |
| H: authorization | Owner, foreign G.O.D., Player, anonymous and explicit read-only Administrator review exercised through services and production HTTP/UI |

The prior protected dungeon-link regression is strengthened to require whole-event unavailability rather than an ordinary event with an empty link list. Existing tests are retained. A full rerun exposed an association browser test reading the database before its save request completed: its wait now requires HTTP 200 and the saved-summary paragraph, with the original persistence assertions preserved and no Campaign runtime change. Regression artifacts use a separate `artifacts/guidance/worlds-4b-privacy/` directory; earlier 4B and 4A receipts/reports remain intact.

| Executed verification | Result |
| --- | --- |
| Starting-checkpoint saved-identity reproduction | Failed as expected: one revealing relationship returned instead of zero |
| Focused disposable privacy service cases | Passed A–H |
| `npm run validate:worlds` | 104/104 passed |
| `npm run validate:unit` | 1,989/1,989 across 229 feature files passed |
| Complete `npm run validate:worlds-disposable` on final code | Passed: full final database/build/desktop/native-touch browser regression |
| Actual production desktop and native-touch 390px phone privacy/browser checks | Passed on final application source, including Overview labels and counts |
| `npx next typegen`, `npx tsc --noEmit --incremental false` | Passed on final source |
| `npm run lint` plus focused lint of the updated association test | Passed on final source |
| `npx drizzle-kit check` | Passed |
| `npm run validate:admin-account-db` | 1/1 passed |
| `git diff --check` | Passed on final source |

The complete disposable suite includes the production build/TypeScript check, fresh and populated ordered migration rehearsals with ledger hash/timestamp verification, reapplication, previous History/chronology/calendar/Bridge/4A/Atlas/cartography/generation/settlement/interior/dungeon/browser regressions, authorization and unchanged Campaign, combat, Character, Form and Evolution snapshots. Focused service and browser results are retained in the correction directory and summarized in the accompanying evidence JSON. No declared-but-unexecuted test is counted as passing.

No migration, journal, snapshot, configuration or external service change is needed. The existing schema through `0117_worlds_individuals` is the prerequisite; all finalized migrations through 0117 remain unchanged. No DEV or Production database or server was modified. Validation used newly created loopback PostgreSQL databases, isolated production builds and headless test browsers; temporary database/build processes are cleaned up by the runner.

For a separately authorized controlled release, verify the exact commit and target identity/ledger, retain the previous release and a verified backup, confirm schema through 0117, stage the production build and run owner/Administrator ordinary-and-author smoke checks before activation. This correction adds no pending migration on a target already through 0117; otherwise apply existing committed pending migrations in journal order through the normal controlled process. A code rollback is schema-compatible but reopens the privacy vulnerability. Prefer a reviewed forward fix or restrict Worlds access during recovery; no database restore or immutable-source rewrite is necessary for this correction. Reverting code does not undo the existing 0117 database upgrade. Target deployment state is deliberately unverified.

Readiness: complete, with no unresolved validation blockers; ready for independent review and a separately authorized controlled release. No remote push, deployment or Phase 4C work is authorized by this checkpoint.
