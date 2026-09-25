Pass 1 container foundation — September 25, 2026

Implemented from the clean current `main` checkout at `e5b9471`, with existing migrations through `0066_race_anatomy`. This is the review handoff for Pass 1 only.

**Persistence and identity**

| Table | Purpose |
| --- | --- |
| `container_profiles` | One optional row per catalog Item. Presence identifies a container model; later rule fields belong here. |
| `inventory_instance_location` | One row per contained exact copy, keyed by its existing owned-instance ID. Records its immediate container. No row means loose. |
| `inventory_stack_location` | Positive quantity allocations keyed by Character, Item, and exact container ID. The owned stack remains authoritative. |

For 10 owned potions, allocations of 4 and 3 leave 3 loose. Moving any quantity changes only allocation rows, never ownership, acquisition cost, acquisition date, charges, equipment state, or active effects. Moving a container preserves its children's immediate locations.

Containers use `campaign_character_item_instance.id`, including ordinary containers with zero Charges. Existing acquisition paths create separate copies through their existing ownership machinery. The migration marks no catalog Items automatically and converts no existing stacks. Enabling a profile is rejected while any stack ownership exists for that model. Removing its profile is rejected while owned-copy records, including retired history, remain.

The additional Item IDs on location rows form composite identity foreign keys; they are not another ownership ledger. Composite foreign keys bind both content and container to the same Character, and destination model IDs reference `container_profiles`.

**Server operations**

`inventory-containment-service.ts` supplies authenticated read/move wrappers and internal transaction functions:

- `readInventoryContainmentInTransaction`: owned stack totals, contained allocations, loose remainders, exact-copy immediate locations, and the commerce version.
- `readItemLocationInTransaction`: one owned stack or exact copy's immediate location information.
- `readContainerContentsInTransaction`: direct contents, excluding nested descendants and specialized loaded ammunition.
- `moveInventoryContentInTransaction`: stack allocation, release, container-to-container transfer, or exact-copy movement. A null source/destination means loose.
- `resolveContainmentAncestry`: validates and resolves the parent chain of a transaction's inventory view.

Moves require an explicit source and expected commerce version, recheck permission, lock the Character and commerce profile, increment the existing commerce version, and publish the existing Character invalidation. Players operate their own current Campaign Characters; the owning G.O.D. can operate Campaign Characters. Archived records reject mutations. Active combat rejects general rearrangement, and Freeze uses the existing paused-combat guard. No Initiative or retrieval mechanic is introduced.

`setContainerProfileInTransaction` is an internal catalog helper, analogous to the existing magazine catalog helper. Its caller must authorize Item editing. It is not a new Player or catalog-authoring endpoint.

**Integrity and concurrency**

Exact locations have a primary key on the owned-instance ID, so a copy has at most one immediate container. Destination/source validation rejects retired copies, wrong owners and noncontainers. Stack allocations must be positive and cannot exceed current ownership.

Both the domain service and database guard walk containment ancestry. Every location mutation serializes on the Character root; the database performs an unchanged-value row update so stale repeatable-read writers abort as well. The walk rejects self-reference, a proposed ancestor cycle, or an already invalid ancestry. Opposite concurrent moves cannot both commit. Source removal and destination insertion share one transaction.

Ownership triggers protect all existing writers, including item use, sales, magazine loading and administrative removal. An occupied container cannot be deleted or retired. A contained exact copy must first be moved to loose. A stack reduction may use its unallocated remainder; it fails if it would erase allocated units. Individual Item removal has no spilling, content deletion, transfer, or destruction behavior. Explicit Character/NPC and Campaign permanent lifecycle deletion removes containment metadata with the destroyed root, as documented in the correction below.

Catalog root locking serializes profile changes with new ownership. Owner Add takes the Item write lock directly to avoid concurrent shared-lock upgrades. Character saving now deletes only removed stacks and upserts retained ones, preserving location foreign keys, acquisition dates and equipment-state rows.

**Original Pass 1 validation**

All database validation used temporary local PostgreSQL clusters migrated through all 68 journal entries. Development and production databases were not migrated or manually edited.

| Check | Final result |
| --- | --- |
| Item, Character, campaign inventory, firearm and shop unit/source suites | 389 passed, 0 failed |
| New containment database suite | 32 passed, 0 failed |
| Existing magazine inventory database suite | 8 passed, 0 failed |
| Current combat firearm database suite | 69 passed, 0 failed |
| Current combat item/ability database suite | 3 passed, 0 failed |
| Current combat Freeze database suite | 5 passed, 0 failed |
| Disposable database harness | Passed; 117 child test results, no skips |
| `npm.cmd run typecheck` | Passed |
| ESLint over every changed/new TypeScript, TSX and MJS file | Passed |
| Production build | Passed; final retry had network access for existing Google Fonts dependencies |
| `drizzle-kit check` | Passed |
| Snapshot comparison | Valid parent chain; exactly three added tables; existing table definitions unchanged |
| `git diff --check` | Passed |

The new database cases cover all requested containment scenarios, real owner Add/Remove, Character load/save and stale saves, real Shop purchases and purchase retries, passive-effect preservation, magazine loading alongside allocated ammunition, raw SQL guards, concurrent moves/allocations/retirement, simultaneous grants, and profile activation racing a new stack.

Earlier attempts found and corrected fixture setup errors, source-test expectations, and a missing container flag in Shop exact-copy initialization. The migration-list assertion was already behind current main by migrations 0064–0066; it now includes 0067 and checks journal/file alignment.

The sandboxed PostgreSQL attempt failed before starting (`initdb` restricted-token error 87); the same disposable harness passed outside that Windows restriction. An initial production build passed; a subsequent sandboxed retry could not fetch the existing Geist/Geist Mono Google Fonts dependencies. The final build passed with network access.

Two legacy firearm suites have baseline failures unrelated to containment. `firearm-readiness-db.test.ts` failed in this checkout and in a temporary untouched `e5b9471` snapshot because its expected capacity error instead encounters the current Player action-ownership requirement. `firearm-attack-db.test.ts` also failed in that untouched snapshot because its fixture omits the now-required target distance. Their behavior was not weakened or changed. The current 69-test combat firearm suite passes.

Reproduce the focused database validation with `node --import tsx --test scripts/inventory-containment-disposable.test.ts`. It requires installed local PostgreSQL binaries and uses only its own disposable cluster. `SERRIAN_TEST_POSTGRES_BIN` can specify their location. `CONTAINMENT_CASE_FILTER` optionally selects one child script.

**Files changed**

| Files | Change |
| --- | --- |
| `src/db/container-schema.ts` | Three location/profile tables and identity constraints |
| `drizzle.config.ts` | Register container schema |
| `drizzle/0067_container_foundation.sql` | Additive tables, constraints and transactional guards |
| `drizzle/meta/0067_snapshot.json` | Generated schema snapshot |
| `drizzle/meta/_journal.json` | Append migration 0067 |
| `src/features/items/container-catalog-service.ts` | Internal profile activation/removal |
| `src/features/items/inventory-containment-service.ts` | Authorized containment reads and moves |
| `src/features/items/containment-ownership-service.ts` | Clear domain errors before ownership reductions |
| `src/features/items/equipment-state-service.ts` | Invoke containment validation at shared ownership checks |
| `src/features/items/owner-inventory-service.ts` | Exact container grants and safe catalog locking |
| `src/features/tabletop-operations/shop-commerce-service.ts` | Exact container purchases |
| `src/features/characters/models.ts` | Container classification in authorized catalog data |
| `src/features/characters/character-rules.ts` | Exact-instance container draft handling |
| `src/features/characters/random-character.ts` | Exact-instance container acquisition |
| `src/app/characters/actions.ts` | Classification, load/save integration and retained stack rows |
| `src/app/characters/character-editor.tsx` | Existing copy acquisition controls recognize containers |
| `src/app/heavens/npcs/actions.ts` | NPC catalog/load/save classification |
| `src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx` | Existing NPC acquisition controls recognize containers |
| `src/features/characters/firearm-baseline-migration.test.ts` | Current migration/journal assertions |
| `src/features/items/item-ownership-pipeline.test.ts` | Extended ownership-pipeline assertion |
| `scripts/inventory-containment-db.test.mjs` | Focused persistence, action and concurrency tests |
| `scripts/inventory-containment-disposable.test.ts` | Isolated migration and regression harness |
| `docs/architecture/inventory-containment-pass-one.md` | This review handoff |

**Review boundary and remaining concerns**

Migration 0067 must be applied before running this changed application against a persistent environment. No migration was applied there during this pass. Containers currently require explicit internal catalog definition; no existing backpack, pouch or quiver was inferred from its name.

Pass 1 has no container-management UI, capacity, weight, volume, access cost, magical rules, world storage or transfer mechanic. Until location-aware consumption and sale choices are designed, allocated units must be moved to loose before an operation would reduce ownership below the allocated total. Equipment and passive behavior remain independent of location. A loaded magazine's ammunition stays in its specialized storage even if the magazine itself is placed inside a backpack.

The database guards are part of this foundation, not optional application validation. Future inventory writers must retain the Character/catalog lock boundaries and commerce-version rules. Expected concurrency conflicts fail closed and require a fresh read. No blocking foundation issue remains from the exercised scenarios; the two legacy test-fixture failures above remain outside this pass. Automation is not human acceptance. Stop here for Pass 1 review before any later container pass.

**Pass 1 lifecycle correction — 2026-09-25**

Review of committed Pass 1 (`4fbbb71fb4098a9452c43d65d496ddf98af771c4`) found that restrictive containment ownership foreign keys also blocked permanent Character/NPC and Campaign deletion. Before the correction, disposable database tests reproduced failures for Player Characters with stack contents, exact contents, and nested containers, both NPC kinds with nested contents, and whole-Campaign deletion. Individual removal guards remained effective.

The existing lifecycle transaction now deletes a Character's `inventory_instance_location` rows, then its `inventory_stack_location` rows, before the verified Character cascade. This shared path covers Player Characters, Race NPCs, and Creature NPCs. The Campaign deletion plan includes both tables with its existing `character` scope, before stack ownership, exact-copy ownership, and Character roots. Both lifecycle previews count these locations as nonblocking dependencies. Existing authorization, blockers, and audit behavior remain in place.

No schema, migration, ownership foreign key, or ordinary removal guard changed. Occupied containers still cannot be removed or retired; contained exact copies must move loose before removal; stack reductions cannot consume allocated units. The correction adds no Pass 2 behavior.

The new database suite invokes the real permanent lifecycle service and verifies all five Character/NPC cases, whole-Campaign deletion, complete location cleanup, preservation of unrelated roots and catalog Items, audit creation, unauthorized deletion rejection, transactional rollback, and the three ordinary removal guards. The existing lifecycle database snapshot helper now handles every current Campaign deletion scope so its existing graph and rollback assertions can run against the current plan.

| Correction validation | Result |
| --- | --- |
| New lifecycle containment database suite | 11 passed, 0 failed |
| Existing lifecycle service database suite | 1 passed, 0 failed; covers all lifecycle roots and Campaign scope/atomicity |
| Existing Skill framework reference database suite | 1 passed, 0 failed |
| Existing Tabletop lifecycle database suite | 1 passed, 0 failed |
| Focused Pass 1 containment database suite | 32 passed, 0 failed |
| Existing magazine / combat firearm / item-ability / Freeze database suites | 8 / 69 / 3 / 5 passed, 0 failed |
| Expanded disposable database harness | Passed; 131 child test results, no skips |
| Lifecycle and Character deletion unit/source tests | 65 passed, 0 failed |
| `npm.cmd run typecheck` | Passed |
| ESLint over all five changed/new TypeScript files | Passed |
| `npm.cmd run build` | Passed |
| `git diff --check` | Passed |

All correction database checks used the disposable PostgreSQL harness migrated through all 68 journal entries. No development or production database was changed. Run the full checks with `node --import tsx --test scripts/inventory-containment-disposable.test.ts`; set `CONTAINMENT_CASE_FILTER=lifecycle-containment` to select only the new regression suite. The harness removes its temporary cluster afterward.

Correction files: `src/features/lifecycle/lifecycle-service.ts`, `src/features/lifecycle/campaign-delete-plan.ts`, `scripts/lifecycle-containment-db.test.ts`, `scripts/lifecycle-service-db.test.ts`, `scripts/inventory-containment-disposable.test.ts`, and this handoff. This is a separate correction to Pass 1. Stop after committing it; do not begin Pass 2.
