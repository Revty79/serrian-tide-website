# Catalog visibility Pass 4 completion report

Pass 4 extends the approved Pass 3 baseline `4bfdc53fe2c4d0ed9c99d1874860b7eabde10bb7`. It also fixes the reported Master Content layout regression: all six library panels scroll as a whole, so visibility controls cannot compress the results into a narrow strip.

## Implementation

| Area | Result and principal files |
| --- | --- |
| Schema/migration | `src/db/catalog-preferences-schema.ts`, `drizzle/0079_catalog_scope_activation.sql`, snapshot and journal add one activation table. Existing tables/enums remain unchanged. |
| Activation | `catalog-activation-service.ts`, `catalog-query.ts`, shared actions and `catalog-browse-control.tsx` provide separate activation for six catalogs. Current Admin roles are checked and locked server-side. Disable restores full browsing without changing preferences or records. |
| Pass 3 compatibility | Migration copies the approved receipt's timestamp/hash into the original four activation scopes. The old receipt stays unchanged. Missing legacy actor attribution stays null. Equipment/Inventory begin inactive. The exact classifier, dry-run, explicit apply and Administrator verification remain opt-in. |
| Equipment | Equipment page and shared Item workspace use the Equipment preference and activation, applying SQL filtering before search, counts, pagination and facets. |
| Inventory | Inventory independently uses the Inventory preference and activation on the same Item roots. Canon Equipment and Mine Inventory can be used simultaneously. |
| Item Canon controls | Both editors use the established Item-root mark/remove service. Attribution changes do not rewrite creators, provenance, profiles, links, tags, powers, effects or archive state. No Item bulk classifier was added. |
| Needs Canon Review | Temporary Admin-only non-canon view in either scope, including matching facets and a current-role server check. It never changes the saved preference or promotes records automatically. |
| Item variants | `item-catalog-service.ts` expands exact upward ancestry, including nested Context, without sibling leakage or counting context as matching records/page slots. Existing variant creation and unsaved-work guards remain. |
| Tags | Facets use visible Items. Authoring/Campaign choices preserve stored tags. Tags remain shared metadata; selecting a tag does not reveal hidden Items. |
| Embedded discovery | Item, Race, Creature, Skill, Derived Ability, Form-access and interaction-rule actions filter new choices. Stored Skill, power, framework, ammunition, magazine and related-record identities remain readable/editable through existing direct hydration and retained-reference lists. Complete Skill ancestry remains available for validation. |
| Campaign Races | `campaign-catalog-service.ts` uses the persisted creator's preferences, including Admin edits of another creator's Campaign. Context is not newly selectable. Hidden world and Playable selections remain; a hidden world-only Race is not offered as a new Playable choice. |
| Campaign Items | Scope predicates are combined independently before tag expansion. Move All transfers only the current eligible, filtered list. |
| Campaign retention | Stored hidden Items, Races, Playable Races and tags remain visible as existing selections. Preferences and activation never write membership. Explicit save preserves retained content unless the user removes it. |
| Profile | All catalog pages share Profile's six preference columns. Equipment/Inventory synchronization and persistence through logout/login are exercised in the browser. |
| Scrolling/mobile | Shared `skills.css` gives Master Content one viewport-bounded scroll area across all six categories. Controls use compact semantic styling and expandable activation help. Scroll preservation includes the outer panel; Item editor tabs and long forms keep their existing behavior. |
| Account lifecycle | The new activation actor FK is restrictive and explicitly classified as a guarded account-deletion blocker. Attribution cannot silently disappear through account deletion. |

These are independent: **canon status** belongs to a record, **visibility preference** belongs to a user, and **catalog activation** belongs to a database. DEV/Production have independent content, IDs, canon, preferences and activation. No copying or synchronization was introduced. Runtime services do not consume browse visibility.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run validate:catalog-pass-four` | 709 tests passed, including all Pass 1–3 catalog/domain tests, Campaign selectors, Item/runtime, shops, lifecycle and firearm tests. |
| `npm.cmd run validate:catalog-visibility-db` | 33 tests passed on disposable PostgreSQL, plus fresh migrations, no-receipt upgrade and approved-receipt compatibility. Includes current/revoked Admin, forged roles, independent scopes, all Item modes, promoted ownership, exact context/count/page behavior, hidden tags, Campaign creator/retention, embedded references and account-attribution deletion blocking. |
| `npm.cmd run validate:profile-browser` | Production build plus retained Pass 2/3 and new Pass 4 browser checks: both Item scopes, canon/review/activation, forged G.O.D. canon rejection, Profile persistence, new/existing Campaigns, filtered Move All, hidden retention and explicit save. |
| Six catalog layout checks | At 1440×800 and 390×844, the whole Master Content panel scrolls, first/last results are reachable and no horizontal overflow occurs. Screenshots inspected for Race desktop and Equipment mobile. |
| `scripts/item-tag-authoring-disposable.test.ts` | Existing Equipment/Inventory pending request, unsaved edit, tab switch, retry, save/reload and 390px browser regression passed. |
| `scripts/inventory-containment-disposable.test.ts` | 232 contained tests passed, plus the wrapper: container physics/containment, lifecycle, Skill frameworks, magazines, weapon/armor/Item abilities, freeze, firearm readiness and attacks. |
| `npm.cmd run validate:race-authoring` | Disposable Race authoring, natural attacks, Forms, previews, variants and existing incoming-effect/Item ability runtime checks passed. |
| `scripts/shop-corrections-disposable-db.test.ts` | Disposable shop offerings/purchases/commerce regression passed. |
| TypeScript / ESLint | Typecheck and modified-file ESLint with zero warnings passed. |
| Drizzle / whitespace | `drizzle-kit check` and `git diff --check` passed. Snapshot comparison confirms only the new activation table and a valid snapshot chain. |

Older static tests were updated to follow the new discovery-service boundary, the Playable retention rule and migrations 0077–0079. Existing behavioral checks were retained. No live user records were used as test fixtures. Browser coverage is headless Chrome; no physical mobile-device, Firefox or Safari claim is made.

Reproducible checks are in `scripts/catalog-pass-four-db.test.mjs`, `scripts/catalog-pass-four-browser-checks.ts` and the extended disposable harnesses. Screenshots/logs remain local under `artifacts/guidance/`; they are not application data or committed credentials.

## Deployment status

The application connection was found pointing to `serrian_tide_prod`. Migration 0079 is prepared and verified on disposable databases; application-database application is pending the user's explicit target choice. Neither DEV nor Production was mutated during this implementation. No real Items were marked canon or scopes manually enabled. Apply the migration to the confirmed target before relying on per-catalog activation in that environment.

The commit SHA and push status are recorded in the delivery message. Work stops at Pass 4; no Pass 5 audit/finalization is included.
