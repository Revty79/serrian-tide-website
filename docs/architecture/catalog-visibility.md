# Catalog visibility (Passes 1-4)

These concepts are independent:

| Concept | Authority and meaning |
| --- | --- |
| Creator | `createdByUserId` retains original authorship and the existing shared-library ownership rules. Promoting a record never changes its creator. |
| Import provenance | `sourceSystem` and existing external identifiers describe origin and import identity. Imported content is not automatically System Canon. |
| System Canon | `isSystemCanon` is an explicit, Administrator-controlled designation on a master-content root. |
| Browsing preference | What a user wants to browse, saved independently for each of the six catalogs. |
| Environment catalog activation | Whether this database is ready to enforce preferences for a catalog. Activation never changes canon, preferences, or Campaign membership. |

## Canon governance and authoring

`races`, `creatures`, `items`, `skill`, and `derived_ability` each have `is_system_canon boolean NOT NULL DEFAULT false`, nullable `canon_marked_by_user_id text`, and nullable `canon_marked_at timestamp`. Equipment and Inventory share the Item designation. Migration `0077_catalog_visibility_foundation` leaves all existing content non-canon and preserves its data and provenance.

The session-bound `setSystemCanon` action delegates to the shared server-only `setSystemCanonForActor` service. The service reloads and locks the acting user's database `admin` role through the transaction. Player and G.O.D. alone cannot mark or unmark. Clients cannot supply the actor, roles, marking user, or timestamp. Only the five allowlisted root types and valid IDs/booleans are accepted.

Marking sets the acting Administrator and server timestamp. Repeating the current designation is a no-op. Unmarking clears both fields. These fields describe the **current designation**, not an immutable history of every promotion/removal. Database checks require both attribution fields when canon is true and neither when false. The marking-user FK restricts deletion, and the existing account-deletion plan reports current canon attribution as a blocker. Neither operation changes creator, import provenance, parentage, archive state, or existence; an actual change updates `updatedAt`.

Existing `shared-library-access.ts` authoring rules remain authoritative and do not inspect `isSystemCanon`. User-authored roots remain editable by their G.O.D. creator or an Administrator. Imported, system-owned, or ambiguous legacy roots retain their G.O.D. authoring boundary; Admin-only governance does not grant edit access to them. Promotion does not add edit protection or grant additional authoring rights. Existing lifecycle protections remain based on the current ownership/provenance policy. A new Race variant copies its parent's definition but starts non-canon with its own creator and empty canon attribution; ordinary authoring payloads do not write canon fields.

## Preferences and exact visibility semantics

`user_catalog_preferences` has `user_id text PRIMARY KEY` referencing `user.id ON DELETE CASCADE`, six `text NOT NULL DEFAULT 'canon-and-mine'` columns (`race_visibility`, `creature_visibility`, `skill_visibility`, `derived_ability_visibility`, `equipment_visibility`, `inventory_visibility`), and `created_at`/`updated_at` timestamps defaulting to `now()`. Every mode column has a database check allowing only `canon`, `canon-and-mine`, or `mine`.

The shared domain uses catalog keys `race`, `creature`, `skill`, `derivedAbility`, `equipment`, and `inventory`. `getCurrentCatalogPreferences` reads effective defaults without creating a row. `updateCurrentCatalogPreference({ catalog, mode })` upserts only the selected column, preserving other choices even during concurrent first writes. Both public actions derive identity from the session. Extra payload fields, including a target user ID, are rejected; Administrators have no preference impersonation path. Preferences are personal cleanup rows in guarded account deletion.

For a signed-in user's ID, `isCatalogContentVisible` defines:

| Mode | Include a record when |
| --- | --- |
| Canon Only (`canon`) | `isSystemCanon === true` |
| Mine Only (`mine`) | `createdByUserId === currentUserId`, including the user's promoted records |
| Canon + Mine (`canon-and-mine`) | Either condition above is true, using one predicate per record |

`classifyCatalogContent` gives Canon priority over Mine. A record created by the user and later promoted remains eligible in Mine Only and appears once in the union, classified as Canon. Foreign non-canon content and unattributed non-canon imports are excluded by these predicates. Existing access and lifecycle rules remain separate constraints; these predicates grant no read/edit authorization.

## Authoritative classification sources (Pass 3)

`data/canon/catalog-classification-manifest.json` is a reviewed, exact allowlist. Its source metadata pins the STSTandAlone commit and SHA-256 of each extracted source. The classifier does not fetch a moving branch or infer canon from a source prefix or display name.

| Catalog | Exact source | Expected identities |
| --- | --- | ---: |
| Race | STSTandAlone `data/serrian-tide-race-seed.json`, exact `sourceSystem` + `core.sourceExternalId` | 56 |
| Creature | STSTandAlone `data/serrian-tide-creature-seed.json`, exact source + canonical ID, including the three materialized Horse variants | 90 |
| Skill | Original committed STSTandAlone TSV source identities, with the current checked-in Human Skill map replacing the 637 standard Skill labels/concepts | 1,137 |
| Derived Ability | Six explicit seed tuples in `drizzle/0000_serrian_tide_baseline.sql` | 6 |

The STSTandAlone source revision is `0cdd430d600f6a5a46dd8e72fb2524c97f09f024`. Its committed Skill TSV contains 1,137 rows: 637 standard and 500 non-standard. The local STSTandAlone working copy has five later Firearm additions; those are not part of this pinned source. The current `serrian-tide-human-skill-system.json` workbook IDs correspond to the original TSV ordinal identities, verified against the preserved pre-rebuild source IDs. The manifest binds those identities to the final Human Skill map's names. Runtime database IDs may differ: classification matches source/external identity, not numeric IDs or names. The classifier changes no definitions or hierarchy, and does not run either old Skill rebuild. The old six-attribute map, five later Firearm additions, and the 28 superseded rebuild extras are not additional classification authority.

`import-ststandalone-canon.mjs` confirms the Creature materialization: 87 base creatures plus `VAR-HORSE-DRAFT`, `VAR-HORSE-LIGHT`, and `VAR-HORSE-PONY`, retaining Horse parentage. Its Item import is outside this pass.

Derived Ability authority is limited to Durable Muscles, Ambidexterity, Poison Resistance, Eidetic Memory, Indomitable Will, and Likeable, using their six exact `DA-<attribute>-40-<name>` external identities in the manifest and the exact `serrian-tide-derived-ability-canon` source. The baseline and existing Derived Ability migration tests explicitly identify these records as canonical. An unrelated record with that same source alone is not evidence. All unmatched definitions remain untouched and appear in the ambiguous or user-authored report.

## Guarded workflow and deployment order

1. Apply migrations through `0079_catalog_scope_activation` using the existing Drizzle workflow against the explicitly selected target. `0077` establishes root metadata/preferences, `0078` adds the original completion receipt, and `0079` establishes independent activation. These migrations do not run the classifier or populate personal preferences.
2. Point `.env.local` at the intended database and inspect a fresh dry-run report. The command defaults to a repeatable-read, read-only transaction:

   ```powershell
   node --env-file=.env.local --conditions=react-server --import tsx scripts/classify-system-canon.ts --report artifacts/canon-plan.json
   ```

3. Review every would-promote, already-canon, missing, duplicate, ambiguous-untouched, and user-authored-untouched record. Expected counts are the manifest sizes above; actual promotion counts depend on existing classifications. Missing or duplicate identities prevent **all** promotions and activation. Resolve source identity problems explicitly; do not substitute same-name records.
4. Apply with an existing Administrator's exact account email (replace the example at execution time; no Administrator identity is stored in source control):

   ```powershell
   node --env-file=.env.local --conditions=react-server --import tsx scripts/classify-system-canon.ts --apply --expect-database "reviewed_database_name" --administrator-email "administrator@example.com" --report artifacts/canon-applied.json
   ```

5. An explicitly applied classification establishes activation for the four reviewed catalogs in the same transaction. Pass 4 also supports manual activation without classification; see below. Deploying code, migrating, starting the app, building, or saving a preference never runs the classifier.

Apply also checks the explicitly supplied database name against the connected database before making changes. Reports use new filenames and never overwrite an existing report. Run from the repository root. To apply schema migrations use the repository's `npx.cmd drizzle-kit migrate` workflow only after verifying the configured target. Production build/testing does not migrate an application database.

Apply resolves the email to a database User joined to the current `admin` role and locks that role. Player/G.O.D.-only accounts, missing users, and revoked administrators fail. It locks the four root tables against concurrent writes, recalculates the complete plan, and delegates promotions to the same `setSystemCanonInTransaction` governance used by Pass 1's session action. Attribution uses that resolved Administrator and execution time. Already-canon records retain their original attribution. All promotions and the manifest-hash receipt commit together. Any failure rolls back both. Items are never read or written by this classifier.

The receipt establishes that classification completed; it is not a preference store or a permanent requirement that every initial record remain canon. A later authorized unmark does not disable filtering. A changed manifest requires another reviewed classification if this optional bulk workflow is used. The exact manifest and guarded dry-run/apply workflow remain unchanged. Items are excluded.

## Per-catalog environment activation (Pass 4)

Migration `0079_catalog_scope_activation.sql` adds `catalog_visibility_scope_activation`: `catalog_key` primary key, `activated_at`, nullable `activated_by_user_id`, `activation_method`, and optional `manifest_hash`. A row means filtering is active. Checks restrict keys to the six catalogs and distinguish `manual` (requires an actor; no manifest hash) from `classified-manifest` (requires a hash; original four catalogs only). The actor foreign key restricts account deletion and is included in the guarded deletion dependency plan.

The migration preserves `catalog_visibility_activation` unchanged. Only the approved Pass 3 hash `26e5281a043b824a13295acf76b6f819bd3abf28e00602a6eac097279b47472c` establishes Race, Creature, Skill and Derived Ability activation. It copies the original classification timestamp and hash. The old receipt has no actor field, so migrated actors remain null instead of inventing attribution. Without that receipt all scopes remain inactive. Equipment and Inventory always start inactive. Migration changes no content, canon flags, preferences, or Campaign selections.

Any current Administrator can enable or disable filtering separately on each catalog. The session-bound action validates the payload, checks and locks the current Admin role, and records manual attribution. Repeated enables preserve existing evidence; disable removes only that scope's activation row. The original receipt remains historical evidence and does not reactivate a manually disabled scope on subsequent requests. This table records current activation, not a history of manual toggles.

Normal workflow: author/review records, mark official definitions System Canon individually, then enable that catalog when ready. Inactive catalogs retain full browsing while saving personal preferences. Active catalogs immediately use those same saved choices. Controls explain their database-wide effect; normal G.O.D.s do not receive mutation controls. Canon designation, personal preference, and activation are independent concepts.

DEV and Production each use their own rows, Item IDs, content, preferences and canon designations. No deployment or runtime code synchronizes them. Apply migrations only to a verified target; manual canon and activation work without bulk classification.

## Active authoring catalogs and context

All six authoring pages apply preferences when their own scope is activated: Races, Creatures, Skills, Derived Abilities, Equipment and Inventory. Their signed-in server actions read the same persisted preferences as Profile and use `catalogBrowseWhere` / `catalogVisibilityPredicate`. Search, facets, counts and page boundaries apply to matching eligible records in SQL. Required context can add rows without inflating counts or consuming matching-record slots. Context has no artificial depth cutoff.

Race and Creature lists include the minimum parent chain for each page's matches. Parent-first ordering, restrained indentation, "Variant of" text, and `Context` badges explain ancestry. Expansion goes upward only, including an archived ancestor when necessary; it never pulls unrelated siblings. A recursive SQL `UNION` keeps cycles finite. Lifecycle labels remain visible.

Skills use the same predicate and ancestor expansion in both list and recursive tree views. Each retained exact path includes its required parent chain, including archived context. Search excludes context-only endpoints while retaining the ancestry for matching visible Skills. Tree counts exclude context. Tiers, relationship ordering, governing attributes, and fallback rules use the existing recursive builder. Editing still loads the complete graph for structural validation and previews, but new relationship endpoints and framework choices must be eligible for discovery. Runtime consumers keep their existing rules. Changing discovery does not invalidate the draft or make a context parent editable.

Derived Abilities have prerequisite relationships, not a browse hierarchy. Existing requirement summaries continue resolving the prerequisite Skill/Ability names for each visible definition; the editor retains its referenced dependencies. No additional unrelated definitions need to become browse rows. Character-owned acquisition, evaluation, and effects remain in the existing runtime service.

Library identity areas show `Serrian Tide Canon`, `Mine`, or `Context`; a user's promoted record is Canon even in Mine Only. No creator IDs are sent for display. Opening a direct record and saving it still use the existing access/ownership checks. Visibility neither grants editing authority nor detaches a Campaign, Character, NPC, Form, snapshot, encounter, or allocation.

## Administrator designation controls

All six authoring editors shows Mark System Canon / Remove System Canon for any current `admin` role holder after opening a saved record. This is role-based; it has no special email/account allowlist. Player and G.O.D.-only accounts do not receive the control. The session-bound action rechecks and locks the current database role on every request, including removals; hiding the button is not the security boundary. Controls wait while a change is saving, surface failures, and refresh browse results after success. Unsaved drafts must be saved first. Metadata merges into the selected draft without replacing its content. Existing edit/lifecycle permissions remain separate.

## Items, tags and embedded discovery

Equipment and Inventory share Item definitions and canon flags, but each candidate's `catalogScope` determines its independent activation and preference. Combined discovery ORs the two scoped predicates, so Canon Equipment and Mine Inventory can coexist. Item ancestry expands upward only and labels the minimum extra parents Context; unrelated siblings, counts and pagination remain separate. Variant creation and draft guards continue unchanged.

Admin-only **Needs Canon Review** shows non-canon Items in the current scope/lifecycle view. It is a temporary review view, never a fourth saved preference or automatic promotion. The server checks the current Admin role for both results and facets. Homebrew may intentionally remain non-canon indefinitely. Item mark/remove controls use the same root governance service in Equipment and Inventory and preserve definitions, profiles and relationships.

Tags remain shared Item metadata, without private tag stores. Active browse facets derive only from matching Items. Authoring and Campaign choices derive from the visible Item pool plus currently stored tag IDs. Inactive scopes preserve full discovery. Tags attached to an edited Item (including unsaved tags) and tags retained by an existing Campaign stay readable. Choosing a tag cannot reveal hidden Items.

New Related Item, ammunition, magazine and Related Creature searches filter before limits. Stored relationships hydrate through existing direct reads and remain selectable. Skill path/power source lists combine eligible Skills with stored governance, power, framework and effect references; complete ancestry is still used for canonical path validation. Race and Creature Skill search, Derived Ability requirements, Form access choices, Skill relationships/framework selection, and interaction-rule catalogs apply corresponding discovery preferences. Their existing stored references remain readable/editable. Runtime resolution, allocation, authorization, weapons, armor, purchases and effect services never read visibility preferences.

## Campaign discovery and retention

New Campaigns use the current creator's preferences immediately. Editing uses the persisted Campaign creator, even when another Administrator edits it. Available Races use that creator's Race pool plus necessary ancestry Context. Existing Campaign Races and Playable Races are loaded separately, retained even when hidden or archived, and marked **Existing Campaign selection**. Context-only ancestry cannot be newly selected. A hidden world-only Race stays in the world list without becoming a new Playable choice; already saved hidden Playable selections remain removable and restorable within the draft.

Campaign Item candidates independently apply Equipment and Inventory visibility, then intersect selected tags. Already-selected Items and tags are fetched separately for retention. Hidden retained Items do not become eligible tag matches. Move All uses only the currently visible eligible list, including the active type/search filters. Direct valid persisted relationships remain legal; visibility is discovery, not authorization. Changing preferences, activation, tabs, search or tags does not mutate persisted membership. Only an explicit Campaign save changes it.

## Master Content scrolling

All six authoring libraries scroll the complete Master Content panel, including visibility/activation controls and filters. Results retain a useful minimum height and share that scroll area, so added controls cannot squeeze the list into a narrow strip. Panel height follows the viewport, and the surrounding page remains scrollable on narrow screens. Scroll preservation includes Master Content; editor tabs and long forms retain their existing behavior. Supplemental activation help is expandable and uses the shared semantic theme.

Named libraries, community sharing, marketplaces and automatic sharing remain outside Pass 4.

## Validation

The [Pass 3 completion report](catalog-visibility-pass-three-report.md) records the authorized dev classification. The [Pass 4 completion report](catalog-visibility-pass-four-report.md) records activation, Item/Campaign integration, scrolling and verification.

- `npm.cmd run validate:catalog-visibility` covers shared modes, ownership boundaries, the pinned manifest, and lineage ordering.
- `npm.cmd run validate:catalog-pass-three` runs the focused Race, Creature, recursive Skill, Derived Ability, authorization, navigation, and catalog tests. Static React markup tests use `register-test-css.mjs` for CSS module names; the browser suite verifies actual appearance. `validate:derived-abilities` uses the same Node CSS adapter.
- `npm.cmd run validate:catalog-pass-four` includes those tests plus Campaign selection, Items, shops, lifecycle, Character ammunition and firearm regressions.
- `npm.cmd run validate:catalog-visibility-db` creates isolated PostgreSQL databases, checks fresh migrations, upgrade from 0076 without a receipt, and approved-receipt compatibility. It runs Pass 1/3 governance/classification/preferences/context tests, activation roles/independence, Item modes/facets/context/review, Campaign creation/editing/retention, embedded references, account attribution and existing Derived Ability runtime tests. It never uses the configured application database.
- `npm.cmd run validate:profile-browser` builds the production app against a separate disposable database and runs retained Pass 2/3 scenarios plus both Item scopes, Admin controls and forged-request rejection, Profile synchronization, Campaign creation/editing/tag transfers, 390px layouts and all six Master Content panels at 1440x800 and 390x844. It uses synthetic fixtures, not copied user data.

## Profile and controls (Pass 2)

`/profile` uses the existing Better Auth session and redirects unsigned users to `/login`. It is available to every authenticated account, including accounts without a gameplay role. Name, username/display username, and email are read-only. Role assignments supply navigation destinations only; they do not gate the page. The shared navigation accepts a neutral context on Profile, links back to `/access`, and retains the existing three role destinations. Desktop and mobile account areas link to Profile, as does the access page for users with no assigned path.

`CatalogVisibilityControl` in `src/features/catalog-visibility/catalog-visibility-control.tsx` is a controlled, reusable native radio group using the Pass 1 catalog/mode types. It accepts its label, current mode, change handler, optional description, and pending/error/status feedback. It has no Profile route or persistence dependency. Native checked state and arrow-key behavior remain accessible, and choices fit at 390px with comfortable tap targets. The Profile page's six controls use shared semantic theme colors and explain the modes, environment activation, and retention of existing Campaign content. The page-guidance system supplies further help.

`CatalogPreferencesEditor` reads initial values supplied by `getCurrentCatalogPreferences`. Each row calls `updateCurrentCatalogPreference` immediately on selection; there is no Save button or alternate storage. The row displays Saving and disables repeat submissions until completion. Success accepts only that catalog's value from the response; it never replaces the other five controls with an older response snapshot. Failure restores the prior selection and displays a visible retry message. State is scoped to the authenticated user, and persisted database choices survive reload and logout/login. Equipment and Inventory remain independent preferences.

`npm run validate:profile-browser` builds the production app and exercises it in headless Chrome against a freshly migrated disposable database. Coverage includes anonymous/role/roleless access, defaults without backfill, per-catalog persistence, failure/retry, pending and keyboard behavior, account isolation, logout/login, desktop/mobile navigation, guidance, and existing Race/Campaign behavior with Mine Only saved. Screenshots are retained under `artifacts/guidance/profile-pass-two/`. This harness does not touch dev or production data and requires the local PostgreSQL and Chrome executables (overridable via `SERRIAN_TEST_POSTGRES_BIN` and `SERRIAN_TEST_CHROME`).
