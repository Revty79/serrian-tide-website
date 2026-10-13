# Phase 6B-A Explorer failure-path correction

Starting commit: `0143999a703e30bbb3a1327207a801755fec8ceb`. Initial Git status was clean and the local `origin/main` reference matched HEAD. Ember's acceptance of the earlier two privacy corrections is preserved. This follow-up is a separate local commit, with its full SHA provided in the completion message.

## Fix and scope

`src/features/worlds/atlas-explorer.tsx` now stores the loaded Atlas bundle and historical appearance together as one result associated with its request context. Both are exposed to rendering only when that context matches the current World, map, timeline, requested year, ordinary/author knowledge mode and review mode. Successful initial loads and connection refreshes update that single result together.

When an ordinary request fails after an author view, the previous protected appearance cannot reappear when loading ends. The existing error and Retry map controls remain available. Successful retry presents the filtered ordinary projection; returning to author mode retrieves the authorized appearance again. No appearance information is carried between mismatched contexts.

The only production file changed is `atlas-explorer.tsx`. There are no migration, schema, API, permission, renderer, saved-source, other creator or later Phase 6B changes.

Test/report files:

- `scripts/worlds-explorer-failure-checks.ts`: authenticated same-instance failure/recovery checks and full-application navigation, source-reader and draft-editing regressions.
- `scripts/worlds-map-state-privacy.test.ts`: adds an isolated `--explorer-failure` mode, reusing the existing disposable clone/build/preservation harness and leaving its previous evidence directory intact.
- This report records the handoff and validation boundary.

## Newly executed validation

- **Six authenticated browser groups passed**, using desktop Chrome at 1440 by 900 and native-touch Chrome at 390 by 844. Each device tested both `knowledge=ordinary` and `ordinary=1`: an author-visible protected appearance, delayed ordinary request, deliberate HTTP 503, absent protected name/source account during loading and after failure, successful retry to unknown/filtered ordinary coverage, and restored original appearance in author mode. The same Explorer DOM instance stayed connected throughout every failure/recovery sequence.
- **Full-application checks passed on both devices:** canonical year navigation, linked destination and Previous map navigation, retained immutable revision reading, current source account readback, actual Map Maker draft editing, refusal to discard an unsaved draft and subsequent explicit discard. Historical year context and phone layout remained functional.
- **Eight focused unit regressions passed:** the existing knowledge alias/review normalization, historical coverage and Atlas navigation tests.
- **Isolated production build, explicit TypeScript, changed-file lint and whitespace checks passed.** The successful production build was reused while unfinished browser checks resumed. There were no React/JavaScript console errors; the simulated 503 resource error was intentional.
- **Preservation passed:** no World mutation requests were issued. Complete before/after snapshots matched for all rows in **98 World tables**, including historical sources, immutable revisions, timeline heads, maps, geography, lore and links. The completed Phase 6B-A fixture database also matched its original snapshot. Previous reports, databases and evidence were retained.

The World page's existing History guard intentionally remounts Atlas when `knowledge=ordinary` changes. To exercise the reported retained-state failure for both aliases, the failure checks mount the actual Explorer source with a test-only live URL-context adapter, shared production styles and authenticated production API requests. This keeps the Explorer instance alive across mode changes without adding an application route or changing the History guard. Navigation/readers/editing are independently checked through the full Next application. Generated fixture bundles, failed/recovered desktop/phone screenshots, browser/preservation receipts and production logs remain in ignored `artifacts/guidance/worlds-explorer-failure/`.

Initial harness assumptions were corrected: the full-page knowledge transition could not retain the component instance, retained-revision selection opens the source's authored starting year, and the canonical year control has a numeric input role. Those were fixture/selector issues, not application regressions. The application correction is limited to the independently reviewed stale appearance state.

Focused commands:

```text
node --conditions=react-server --import tsx scripts/worlds-map-state-privacy.test.ts --explorer-failure --browser-only
node --import tsx --test src/features/worlds/knowledge-preview.test.ts src/features/worlds/map-states.test.ts src/features/worlds/atlas-navigation.test.ts
npx tsc --noEmit
npx eslint src/features/worlds/atlas-explorer.tsx scripts/worlds-explorer-failure-checks.ts scripts/worlds-map-state-privacy.test.ts
git diff --check
```

An interrupted check can resume with `--explorer-failure --resume --browser-only --no-build --continue` when the build and completed evidence remain valid. No comprehensive Worlds/Phase 9 suite was run.

## Release and review boundary

There are no new migrations or configuration changes. Migration `0124` is unchanged, with committed SHA-256 `acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa`; existing migration evidence was reused and no SQL migrations were executed. Next's temporary TypeScript configuration edits were restored. The task-owned test server and PostgreSQL cluster are stopped.

Technical validation is complete and the local commit is ready for independent review. On a later authorized release, verify the reviewed commit and database ledger, retain the backup/running release, build, then perform role/ordinary/retry smoke checks before activation. An installation already at Phase 6B-A needs no migration for this fix; older installations still require their unchanged ordered migration chain through `0124`. This code-only correction needs no database rollback. Reverting it would reintroduce the reviewed failure-path exposure, so preserve the corrected context guard during recovery.

Ember's independent review of this follow-up remains pending. No push, deployment, shared service/database action or 6B-B work was performed or authorized by completion.
