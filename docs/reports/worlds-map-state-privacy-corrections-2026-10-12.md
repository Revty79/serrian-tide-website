# Phase 6B-A final privacy corrections

Starting commit: `278686d4000eb42794d61bad06543c2213c12cb4` on `main`, matching the local `origin/main` reference. Initial Git status was clean. The completed historical-map implementation, report, migrations and disposable evidence were preserved. This correction is delivered as a separate clean local commit; its full SHA accompanies the completion message.

## Corrections

Ordinary alternate-timeline map responses now return an empty `parentStates` collection. The server never queries parent appearance choices for ordinary serialization. Primary authors, alternate authors and explicit Administrator review retain their legitimate source choices. Authorized, deliberately retained versions and their revision readers remain available in their selected timeline with the existing current-protection checks.

The Atlas library, Explorer and directly related API routes now use one predicate for `knowledge=ordinary` and `ordinary=1`. Either alias requests the server-filtered projection and returns `canEdit: false`. Ordinary map, geography and connection authoring controls are absent. Atlas data from a previous knowledge context is suppressed while the matching response loads. The library preserves preview mode; returning to author view clears both ordinary aliases without losing timeline, historical year or explicit Administrator review.

Preview-qualified POST requests to Atlas, historical appearances, Realm connections and place milestones reject either ordinary alias and `review=1`. Normal owner authorization remains intact: valid unqualified owner commands reach the existing revision-conflict checks. Administrator review remains read-only.

Focused navigation validation also exposed a direct-entry Explorer bug: selecting a place before following a linked map could leave the initial map out of the navigation trail. Explorer now retains that starting map, preserving the Previous map control and historical year without changing persisted connections.

## Changed files

| Files | Purpose |
| --- | --- |
| `src/features/worlds/map-state-service.ts` | Suppress ordinary parent appearance metadata before serialization. |
| `src/features/worlds/atlas-service.ts` | Explicitly exclude ordinary viewing from Atlas editing permission. |
| `src/features/worlds/atlas-explorer.tsx` | Recognize both aliases, suppress stale projections, clear both aliases on author return, preserve preview/library and direct-entry navigation context. |
| `src/features/worlds/atlas-workspace.tsx` | Share mode detection, bind loaded data to its mode, use the filtered selected map and suppress authoring dialogs in previews. |
| `src/features/worlds/knowledge-preview.ts` | Shared query predicates and author-return normalization. |
| `src/app/api/worlds/[worldId]/atlas/route.ts`, `atlas/states/route.ts`, `atlas/milestones/route.ts`, `links/route.ts` | Equivalent server filtering and preview-qualified mutation refusal. |
| `src/features/worlds/knowledge-preview.test.ts` | Conflicting-alias privacy and author-return/review context regressions. |
| `scripts/worlds-map-state-privacy-checks.ts`, `scripts/worlds-map-state-privacy.test.ts` | Focused service/browser checks in a new disposable clone, with preservation snapshots and resumable completed groups. |
| `docs/architecture/worlds-map-states.md`, this report | Document the corrected privacy contract and validation handoff. |

No schema, migration, original cartography renderer, other creator or Phase 6A lore implementation changed.

## Newly executed validation

- **8 targeted unit regressions passed:** ordinary aliases, conflicting aliases, returning to author while preserving explicit review/year/timeline, existing map date coverage and stable geography/navigation rules.
- **5 service groups passed:** Primary author, alternate author, alternate ordinary and explicit Administrator review comparison; no unadopted parent metadata; readable retained immutable sources after parent changes; protected historical selections/maps/geographies withheld; preserved map destinations and Realm sources.
- **9 production-browser groups passed:** authenticated desktop Chrome at 1440 by 900 and native-touch Chrome at 390 by 844. Both aliases produced identical Atlas, appearance, Realm-link and milestone projections; protected places returned 404. Plain Atlas and historical ordinary entry paths withheld protected rendering and author controls. Both author returns restored editing. Retained branch appearances remained readable. Actual Realm readers, linked-map return navigation, year 50, unsaved-draft refusal and Administrator review worked. Delaying the ordinary response proved protected author content disappears before the filtered response arrives. Twelve preview-qualified POST combinations returned 403; unqualified owner Atlas and appearance commands returned the expected stale-revision 409 without writes.
- **Production build, explicit TypeScript, changed-file lint and `git diff --check` passed.** The production build was repeated after the small navigation correction. Successful browser groups were retained while unfinished groups resumed against that build. No React/browser console errors or horizontal overflow were observed.
- **Preservation passed:** complete before/after snapshots of all rows in **98 World tables**, including sources, immutable revisions, timeline heads, maps, geography, lore and links, matched exactly. The completed Phase 6B-A evidence database also matched its original snapshot. Only a new disposable database was used for these checks.

Focused commands:

```text
node --import tsx --test src/features/worlds/knowledge-preview.test.ts src/features/worlds/map-states.test.ts src/features/worlds/atlas-navigation.test.ts
node --conditions=react-server --import tsx scripts/worlds-map-state-privacy.test.ts --services-only
node --conditions=react-server --import tsx scripts/worlds-map-state-privacy.test.ts --resume --browser-only
npx tsc --noEmit
npx eslint <the twelve changed TypeScript files listed above>
git diff --check
```

For interrupted browser validation, `--resume --browser-only --no-build --continue` reuses the successful isolated build and completed groups. Use a fresh run when implementation changes invalidate a completed group's evidence.

Evidence is preserved in ignored `artifacts/guidance/worlds-map-state-privacy/`: service, browser and preservation JSON receipts, production logs, environment marker and desktop/phone ordinary/author screenshots. The earlier `artifacts/guidance/worlds-map-states/` evidence was retained.

### Failure classification

The application failures were the two reviewed privacy findings and the direct-entry navigation trail gap described above. Harness failures were a comparison against Windows checkout line endings rather than committed migration bytes, an assertion that mistakenly included the separate World identity control, an incorrectly scoped details locator/browser variable reference, and un-routing a delayed Playwright request before its continuation finished. Those harness issues were corrected; the routing failure's leftover task-owned services were explicitly identified and stopped before continuation. No failure required a shared service restart or shared database action.

## Migration and deployment readiness

No migration was added or executed. Migration `0124` and all earlier migrations/schema files are unchanged. The committed `0124` SHA-256 remains `acd146d910a170dec6374b93016a7b749d55e9bf765cdfe29a5f81733a0edfaa`; its existing fresh-install, populated-upgrade, reapplication and source-preservation evidence was reused. Windows working-copy line endings were normalized only for comparison, without editing the migration.

No application configuration changes are required. Next's temporary build-generated TypeScript configuration entries were removed/restored; test services are stopped. For a later authorized release, verify the reviewed commit and target ledger, retain the backup/running release, and follow the existing controlled deployment process. A database already at Phase 6B-A needs no new migration; an older installation still requires the unchanged ordered chain through `0124` before activating historical-map code. Build and role/preview smoke checks precede activation.

This correction changes no stored representation, so database rollback is unnecessary. Reverting only these code fixes would restore the reviewed preview exposures; retain the corrected privacy behavior or use a reviewed forward fix.

## Review boundary

Technical validation is complete; Ember's independent review remains pending. Owner experience acceptance is separate. Generic historical-map scope and the earlier documented limitations remain unchanged. The comprehensive Phase 9 suite and later Phase 6B work were not run or started. No push, deployment, shared service/database change or next pass is authorized by this completion.
