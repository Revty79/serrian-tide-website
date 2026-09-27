# Catalog visibility foundation (Pass 1)

These concepts are independent:

| Concept | Authority and meaning |
| --- | --- |
| Creator | `createdByUserId` retains original authorship and the existing shared-library ownership rules. Promoting a record never changes its creator. |
| Import provenance | `sourceSystem` and existing external identifiers describe origin and import identity. Imported content is not automatically System Canon. |
| System Canon | `isSystemCanon` is an explicit, Administrator-controlled designation on a master-content root. |
| Browsing preference | A user's independently saved mode for each catalog, intended for future browsing and discovery. |

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

`classifyCatalogContent` gives Canon priority over Mine. A record created by the user and later promoted remains eligible in Mine Only and appears once in the union, classified as Canon. Foreign non-canon content and unattributed non-canon imports are excluded by these future predicates. Existing access and lifecycle rules remain separate constraints; these predicates grant no read/edit authorization.

## Integration boundary and deployment

Pass 1 adds no catalog, Profile, or Campaign UI and applies no automatic filtering to existing queries. No tags, named libraries, or community sharing change. Future browsing filters must never invalidate retained Campaign selections, Character references, or runtime mechanics; those paths continue resolving referenced content under their established rules.

Apply migration 0077 before running the new application revision against a database: existing Drizzle full-root reads now select the added columns. Generation and disposable migration tests do not apply it to dev or production. Deliberate canon classification and catalog integration belong to later passes.

Validation commands: `npm run validate:catalog-visibility` and `npm run validate:catalog-visibility-db`. The DB harness creates isolated PostgreSQL databases, checks the full fresh migration chain and an upgrade from 0076 with existing content, then runs canon/preference/variant and account-deletion regression tests. It never uses the configured application database.
