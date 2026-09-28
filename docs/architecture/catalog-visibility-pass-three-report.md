# Pass 3 completion report

## Scope and dev classification

Pass 3 activates saved visibility preferences for Race, Creature, Skill, and Derived Ability authoring. Every current Administrator can mark and remove System Canon through the four editors. The server verifies the current database `admin` role for both operations; there is no privileged-email allowlist. G.O.D. and Player alone cannot designate canon.

The authorized application database was `serrian_tide_dev`. Its target and migrations 0077/0078 were verified before applying. The existing Administrator was resolved from the operator-supplied email and recorded as the actor. Production was not modified.

| Catalog | Planned promotions | Applied promotions | User-authored records left untouched |
| --- | ---: | ---: | ---: |
| Races | 56 | 56 | 0 |
| Creatures | 90 | 90 | 3 |
| Skills | 1,137 | 1,137 | 1 |
| Derived Abilities | 6 | 6 | 0 |

There were zero missing identities, duplicates, or already-canon matches in this dev plan. There were no ambiguous Derived Ability records in this database: all six were explicitly evidenced. The classifier leaves unmatched definitions untouched; tests include ambiguous and misleading-source fixtures.

An independent read-only comparison of the captured before/after roots confirmed that only intended canon designation, actor, timestamp, and `updatedAt` fields changed. Creator ownership, archive state, parentage, and definitions were preserved. Item records were identical. Private full-record snapshots and operator reports remain in the ignored local cache and are not committed.

## Exact authority and guarded workflow

The committed allowlist is [catalog-classification-manifest.json](../../data/canon/catalog-classification-manifest.json). It pins STSTandAlone revision `0cdd430d600f6a5a46dd8e72fb2524c97f09f024` and source hashes:

- Races: `data/serrian-tide-race-seed.json`, exact source/external identity.
- Creatures: `data/serrian-tide-creature-seed.json`, its 87 base identities and three materialized Horse variants, following `scripts/import-ststandalone-canon.mjs`.
- Skills: committed `data/serrian-tide-skill-catalog.tsv`, with 637 standard identities bound to the current checked-in `data/canon/serrian-tide-human-skill-system.json`, plus 500 non-standard identities. The old six-attribute map and uncommitted additions are not authority.
- Derived Abilities: six explicit `derived_ability` seed tuples in `drizzle/0000_serrian_tide_baseline.sql`: Durable Muscles, Ambidexterity, Poison Resistance, Eidetic Memory, Indomitable Will, and Likeable.

Classification matches exact source/external pairs, never display names or a non-null source alone. See the [deployment order and exact commands](catalog-visibility.md#guarded-workflow-and-deployment-order). The default is read-only planning. Apply requires `--apply`, `--expect-database`, and an email resolved to a current database Administrator. Missing/duplicate identities fail the entire operation. Promotions and the manifest completion receipt commit atomically through the existing governance service; repeated apply preserves prior attribution.

Before classification completes, the application retains the full existing catalogs. The completion receipt enables filtering without a second preference store. Later Administrator removals remain effective without disabling filtering.

## Authoring behavior and retained references

| Integration | Result |
| --- | --- |
| Races | Shared SQL predicate applies before search, counts, and pagination; exact parent chains accompany visible descendants. |
| Creatures | Same behavior, with mode-aware Family/Type choices and retained nested variant lineage. |
| Skills | SQL filters both list and recursive discovery. Required ancestor paths remain; unrelated siblings do not appear. The editor and runtime retain their complete dependency graph. |
| Derived Abilities | SQL filters discovery; visible definitions retain prerequisite summaries and existing editor/runtime dependencies. |

Labels distinguish Serrian Tide Canon, Mine, and Context. A user's promoted record still appears under Mine Only and receives the Canon label. Context does not inflate matching-result counts, consume matching page slots, or grant editing rights. Archived ancestors are included when required. Context traversal is upward only and terminates on cycles.

Profile and catalog controls share the same database preferences. Browser coverage proves changes in both directions for Races and Creatures, then logout/login persistence. All four controls save and refresh the real authoring results. Request ordering prevents an older list response from replacing newer results. Existing scroll-preservation behavior and unsaved drafts remain in place.

Disposable regression fixtures establish Character/Race, Creature NPC/source, Character Skill allocation, and Character Derived Ability relationships before hiding their sources. Reads and persisted relationships remain valid afterward. Existing Race/Creature Forms, attacks, anatomy, protection, previews, Skill relationships, and Derived Ability runtime checks are retained.

Items, Equipment, Inventory, Item Tags, Campaign Builder selectors/reference filtering, sharing, and marketplaces remain outside this pass. Pass 4 has not begun.

## Changed files

| Area | Files |
| --- | --- |
| Classification authority | `data/canon/catalog-classification-manifest.json`; `scripts/classify-system-canon.ts` |
| Activation schema | `src/db/catalog-preferences-schema.ts`; `drizzle/0078_catalog_visibility_activation.sql`; `drizzle/meta/0078_snapshot.json`; `drizzle/meta/_journal.json` |
| Shared server/query code | `src/features/catalog-visibility/{canon-manifest,canon-classification-service,catalog-query,catalog-lineage,skill-catalog-service,system-canon-service,actions}.ts` |
| Shared controls and tests | `src/features/catalog-visibility/{canon-designation-control,catalog-browse-control,catalog-source-badge,catalog-preferences-editor}.tsx`; `catalog-visibility-control.module.css`; `catalog-pass-three.test.ts`; `profile.test.ts` in the same directory |
| Four catalog integrations | `actions.ts`, `page.tsx`, and the workspace component under each of `src/app/heavens/{races,creatures,skills,derived-abilities}`; `skills/skill-library.tsx`, `skills/skills.css`, and `derived-abilities/derived-abilities.css` |
| Shared metadata and guidance | `src/features/skills/recursive-skill-library.ts`; `src/app/profile/page.tsx`; `src/features/guidance/page-help.ts` |
| Verification | `scripts/catalog-pass-three-{db.test,browser-checks}.ts`; `catalog-visibility-fixtures.ts`; `catalog-visibility-disposable-db.test.ts`; `profile-disposable-browser.test.ts`; `register-test-css.mjs`; `race-authoring-{disposable.test,browser}.ts`; `race-{forms,form-mechanics,form-preview}-browser.ts`; `package.json` |
| Documentation | `docs/architecture/catalog-visibility.md`; this report |

Existing test expectations now account explicitly for the Pass 1 columns and use exact Race identity text rather than also matching a variant's parent label. Assertions and scenarios were preserved. Static React tests use a CSS-module name adapter; actual CSS is verified in the browser. Windows test cleanup accepts a shutdown race only after proving the spawned server is gone and removes only its own generated TypeScript includes.

## Verification

| Check | Final result |
| --- | --- |
| `npm.cmd run validate:catalog-pass-three` | 288 passed, 0 failed. Includes the existing Pass 1/2 catalog tests plus Race, Creature, recursive Skill, Derived Ability, ownership, and navigation tests. |
| `npm.cmd run validate:catalog-visibility-db` | 26 passed, 0 failed: 11 foundation tests, 1 account-deletion test, 12 Pass 3 classification/visibility/reference tests, and 2 Derived Ability runtime tests. Fresh and upgrade migration checks also passed. |
| `npm.cmd run validate:profile-browser` | Passed the retained Profile scenarios, classification activation guard, all four modes/search/labels/admin controls, Creature facets, nested context, cross-page/logout synchronization, and 390px layouts. Separate Admin-only and G.O.D.-only accounts verified the role boundary. No browser JavaScript errors. |
| Production build | The final Profile browser run compiled the production application, passed TypeScript, generated all 28 pages, and served the production build successfully. |
| `npm.cmd run validate:race-authoring` | Passed: 44 Natural Attack/Forms/mechanics/preview DB tests, the full authoring/guidance/Character browser scenarios, and 116 existing target/gameplay/runtime DB tests. The enclosing disposable migration/browser test passed. |
| `npm.cmd run typecheck` | Passed on the final code. |
| Modified-file ESLint | Passed for all 42 modified/new TypeScript, TSX, and MJS files. |
| `npx.cmd drizzle-kit check` | Passed. |
| `git diff --check` | Passed. |

Phone screenshots for all four catalogs and the Skill tree were inspected; the Skill and Derived Ability canon controls use readable stacked editor headers. Browser checks used headless Chrome at desktop and approximately 390px, not a physical phone or other browser engines. This is automated verification, not human acceptance of every gameplay workflow.

Final logs are retained privately under `node_modules/.cache/catalog-visibility/verification-2026-09-27-final-*.log`; browser images are under the ignored `artifacts/guidance/profile-pass-two/` and `artifacts/race-authoring/` directories. The delivery commit SHA is supplied in the completion message; `git show --stat <SHA>` provides the complete committed file inventory.
