# Linking Bridge final corrections

Starting HEAD: `d7e42a944b0a040d628ea5366ed3964c096ca4e2`. Git status and recent commits were inspected before continuing. The in-progress React Fragment fix and its completed checks were preserved, then included in this local correction commit. The exact new SHA is supplied in the completion handoff. Independent review remains pending; no push, deployment, shared-service restart, shared database action or Phase 6 work occurred.

## Changes

- `src/features/worlds/linking-service.ts`: SQL filters lore to Realms and the eleven existing society families, selected-World/timeline availability and applicable ordinary privacy before the 2,001-row probe. Exactly 2,000 eligible rows remain supported; overflow still returns an explicit error. No client filtering or silent truncation replaces the server checks.
- The same service rejects exclusion unless the connection is active and inherited from an ancestor source in a timeline with a parent. Primary and independent alternate authorship, interpretations, archived accounts and repeated exclusions are rejected transactionally. Interpreted parent accounts continue using archive/restore, matching the existing UI. Valid inherited exclusion retains sources and versions; explicit reinclusion continues working.
- `src/components/field-guidance.tsx`: recursively handles Fragment children and gives native/custom controls their styling and accessibility attributes. It no longer supplies `className` or ARIA props to a Fragment. Existing values, datalist suggestions, custom-control forwarding and help remain intact. The reported console error came from application code, not creator input.
- `src/features/guidance/field-guidance.test.tsx`: three rendering regressions, discovered by the existing feature-test runner.
- `scripts/worlds-linking-corrections.test.ts`: nine targeted correction groups plus reuse of the thirteen existing bridge service groups. It clones the completed task-owned database, uses disposable fixtures, preserves original test evidence/data and stops its isolated cluster.
- `docs/architecture/worlds-linking-bridge.md`: records the eligible capacity and inherited-exclusion rules. This report records the review handoff.

## Newly executed verification

| Check | Actual result |
| --- | --- |
| Focused unit/rendering tests | 21/21: three Fragment/control regressions, ten bridge domain tests, eight branching-history tests |
| Bridge services | 13/13 groups on newly created fixtures; includes many-to-many maps, all eleven society families, conflicts, original sources, calendar arithmetic, ordinary privacy, permissions, timeline interpretation and archive/restore |
| Review regressions | 9/9 groups: Primary/independent exclusions fail without any World row change; valid inherited exclusion retains history; both stale/current repeated exclusions fail; reinclusion, interpretation and archive/restore pass |
| Capacity/privacy boundaries | Included in those nine groups: 2,001 unrelated records permit real saves; exactly 2,000 eligible records supported; 2,001 eligible records explicitly rejected; 2,001 protected plus 2,001 pending/excluded records do not consume ordinary capacity or disclose labels/counts/inverses |
| Fragment browser checks | Real PilotEditor components in an isolated browser fixture: all four Repair E classification inputs on desktop, Realm on native touch; styling, suggestions, accessible help, unchanged drafts when opening help, edits and dirty state passed with no browser errors |
| TypeScript/lint/build | TypeScript and changed-file lint passed; final optimized production build passed with a separate output folder, shared database access disabled and generated configuration restored |
| Schema/preservation | Drizzle consistency passed; schema/config/migrations unchanged; every retained World row in the copied database remained unchanged |

Browser evidence: `artifacts/guidance/field-fragment/`; service and correction receipts: `artifacts/guidance/worlds-linking-corrections/`. The browser fixture uses in-memory drafts and an empty calendar response; it does not establish new authenticated-route or persisted browser evidence. The original component reproduced missing native-input styling/accessibility attributes; standalone React did not emit the Next.js development-only Fragment warning. Early fixture failures came from missing browser environment/asset/calendar data and were corrected before the successful checks.

Previously completed evidence reused, without claiming a rerun: full bridge authenticated production-browser checkpoints, two-tab/failed-save and map-draft navigation checks, four additional retained-source privacy groups, fresh migration installation, populated approved-I upgrade and migration-runner reapplication. These corrections leave the relevant interfaces, routes, drawing geometry, history sources and calendar mathematics unchanged. The newly executed service checks also compare all prior source rows unchanged during direct bridge writes. No comprehensive Phase 9 or unrelated full suite was run.

## Release and recovery

No new migration or configuration is required. Migration 0122 remains Git blob `b4b8e9f0a751a084e8d3633c0632723226c24234`, SHA-256 `9cb9fb385fb9da5fb60a91b2e8c914ea3bc6d1c3ea51f1c21061f97f1694945c`; every prior migration is unchanged. A later separately authorized deployment follows the existing bridge migration order through 0122 if not already applied, verified target identity/ledger/backup, reviewed application build and authenticated author/Administrator/ordinary smoke checks.

Do not drop retained records or reverse migration 0122 for an application rollback. Reverting this fix would restore the two service defects and Fragment prop bug; prefer a reviewed forward fix while preserving the compatible schema and saved data. No new recovery or deletion mechanism was added. Technically ready for independent review; owner appearance acceptance and deployment authorization remain separate.
