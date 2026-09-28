# Creature Ownership - Pass 2

Implemented against Pass 1 commit `26d02c4ade223287a1c08f1f76997499b2b7cf80`. This pass covers acquisition, Character-sheet companions, narrow Player management, personal equipment custody, ordinary out-of-combat Item use, and exact-individual resale. It does not implement encounter enrollment or Evolutions.

## Persistent identity and authority

An owned Creature remains the same `campaign_character` Creature NPC, with its existing `campaign_creature_npc_profile` baseline/current snapshots, individual HP adjustment, notes, Active Health, conditions, modifiers, inventory, and equipment. Ownership never copies Creature mechanics onto the owner.

The Campaign G.O.D. retains the existing full individual NPC editor, linked from companion details. Changing Storm's individual mechanics changes neither the master Horse nor other Horses. The Player interface exposes only the authorized companion actions. It does not expose snapshots, private NPC notes, general editing, arbitrary condition changes, restoration, or lifecycle controls. Administrator record-management authority remains distinct from live equipment/health authority.

## Exact schema and migration

`drizzle/0081_creature_commerce.sql`, `drizzle/meta/0081_snapshot.json`, and the journal add migration 82 in the chain. No earlier migration was edited.

| Change | Purpose |
| --- | --- |
| `item_creature_grant(item_id PK, creature_id)` | An explicit typed Item-to-Creature acquisition profile. Item deletion cascades its profile; Creature deletion is restricted. |
| `shop_transaction_creature(id, campaign_id, transaction_line_id, creature_character_id, creature_id, name_snapshot)` | One relational receipt child per individual, including quantity purchases. Unique transaction-line/individual pair and Campaign-scoped Creature FK. |
| `shop_resale_creature(id, campaign_id, shop_id, item_id, creature_character_id, source_character_id, acquired_transaction_id, sold_transaction_id, status, created_at, updated_at)` | Exact resale custody. A partial unique index permits only one in-stock custody row per individual. Lifecycle checks relate sold status to the resale transaction. |
| Nullable request-line `granted_creature_id`, `creature_character_id`, `resale_creature_id` | Preserve authoritative acquisition terms and exact sale/resale identity through review and execution. |
| Request/receipt fulfillment checks | Permit `creature-transfer`; require Creature grant identity, disallow Item-instance fulfillment, and require quantity one for exact individuals. |

The migration includes the corresponding FKs and lookup indexes. It performs no content backfill, historical purchase replay, Related Creature interpretation, ownership inference, or existing inventory conversion. Personal equipment and Item-use amendments reuse existing tables and require no additional migration.

### DEV and production verification

The user applied the migrations during development and requested reconciliation of both databases. Read-only audits on 2026-09-27 confirmed **`serrian_tide_dev` and `serrian_tide_prod` both have all 82 migrations**. The hashes for `0079`, `0080`, and `0081` match the working files. All columns, constraints, and indexes on the six affected ownership/commerce tables exactly match a freshly migrated disposable database. **No repair or additional migration was necessary, and this audit changed no live data.**

Local evidence: `artifacts/guidance/creature-live-schema-audit.json`, `creature-live-schema-comparison.log`, and `creature-schema-expected.json`. Tests use disposable PostgreSQL databases and never the configured DEV/production data.

## Authoring and acquisition

The Item editor provides **Grants Creature on Purchase**, a Creature search, and an exact definition/variant selector. Presence of the relational grant profile enables the behavior. A typed FK provides unambiguous identity and referential integrity; the existing Related Creature property remains descriptive, so a wolf pelt cannot create a wolf.

The profile round-trips through save/read/variant cloning. Omitted fields from older save callers preserve the existing profile; an explicit null removes it. New references must be valid, available definitions. Changing/removing a profile while it holds exact resale stock is rejected. Archived definitions cannot be newly purchased. Service/narrative offerings keep their service behavior even if the Item has a grant profile.

Canonical Shop execution resolves the effective fulfillment kind and current grant terms in its existing transaction. A generic purchase invokes `createOwnedCreatureInTransaction`, which uses the existing Creature template reader, snapshot builder, NPC constructor, and shared ownership validator. Quantity two creates two different persistent NPC IDs and receipt children. It creates no animal Item stack/copy and adds no animal body weight to Character encumbrance.

## Animals & Companions and naming

The Character equipment tab loads a separate **Animals & Companions** section through authenticated server actions. It shows individual names/IDs, exact definition, health/damage, injuries, conditions, and archived status. Details are in a scrolling, themed dialog usable at a 390px viewport. Item use and gear changes refresh the Character and companion views.

The owning Player must control the owning PC, retain Campaign membership and the Player role, and still own the selected Creature. Rename trims and validates a 1-120 character name and writes only the individual's name/update timestamp. Forged mechanical or ownership fields are ignored. Current ownership and active-state restrictions are checked on the server.

G.O.D. ownership controls call the same Pass 1 transfer service, preserving exact identity, snapshots, health, equipment, and history. The expected old owner prevents a stale transfer from overwriting a newer assignment. In-stock resale custody blocks unrelated assignment.

## Personal equipment

Companion controls reuse the existing Character/NPC inventory, exact Item instances, stack ownership, Equipment State setters, passive reconciliation, availability rules, and custody event history.

- Moving an exact copy changes its holder to the Creature NPC while retaining its ID, charges, cost, provenance, and acquisition data. Returning it preserves that same ID.
- Ordinary stack gear moves actual quantities between holders. It is never represented by an owner-side pet flag.
- Worn, Wielded, Equipped, and Inactive use existing equipment behavior. Passive effects apply to the Creature holder rather than its owner.
- Character carried weight follows the actual holder. Returning worn gear first makes it Inactive in the same transaction.
- Commands check current ownership, current Campaign authority, inventory versions, expected equipment counts, and availability. The custody event's request key and original command make retries repeat-safe; the browser preserves the original attempt after an uncertain result.
- Unsaved Character edits disable gear mutation. Archived records, unavailable/contained gear, inventory-only Items, and active encounters cannot bypass the existing restrictions. Ordinary G.O.D. NPC equipment controls remain intact.

Eligibility follows existing active Equipment rules. This pass adds no species-fit, training, capacity, cargo, saddlebag, mounted-combat, or rider rules. Containers use their existing separate workflows. Copies with prepared firearm runtime state are rejected by the companion transfer path rather than discarding holder-scoped firearm state; those require the firearm workflow.

## Ordinary Item use on a companion

The existing `item-use-actions.ts` path now permits a Player-controlled PC as resource source and either Self or one of that PC's currently owned, active persistent Creature NPCs as target. NPC target options show individual IDs to distinguish identically named Creatures. The target picker excludes other PCs, unowned NPCs, another Character's Creatures, and active encounter participants. G.O.D. targeting retains its existing Campaign authority.

Preview and execution use the actual target's existing anatomy/Active Health and the unchanged authored Mechanical Effects and incoming-effect resolver. Area healing retains its existing pool-only semantics. Conditions and modifiers attach to the selected individual. No ownership-specific health record is introduced.

Execution rechecks ownership and current authority under locks; a transfer after preview rejects the old owner's use. Source inventory supplies the resource. Consumption and all effects commit or roll back together through the existing Item Use transaction, with existing resource locks/concurrency checks. Self-use and G.O.D.-only restoration remain separate.

Retired legacy charged Item Use stays retired under the existing Item/Ability rules; this pass does not re-enable it. The tests verify that a rejected legacy charged use spends no charges. Item Power/Ability targeting and encounter action timing are not extended here.

## Shop retries, history, transfer, and resale

Purchase, approval, acceptance, money, stock, and individual creation remain inside the existing Shop commerce transaction/operation pipeline. `shop_commerce_operation` submission identities and intent hashes return the original result on retries. Old ordinary-Item normalized request shapes remain stable. Creature terms are revalidated when quoted/reviewed/executed; changed grants require owner review. The Player sale UI now also retains the complete original payload on an uncertain response.

Receipts have relational per-individual references and name snapshots, rendered in G.O.D./Player history. They do not rely solely on narrative text. Exact Creature references protect historical identity from permanent deletion; Campaign graph deletion explicitly breaks the nullable request/resale cycle before deleting scoped records.

Selling requires an owned active individual and a listing explicitly granting its exact definition. Completion releases ownership through the shared helper. Under **add to Shop stock**, the Shop receives an exact resale custody row; generic stock is not incremented. Rebuy marks that custody row sold and transfers the same NPC ID to the buyer. It retains name, injuries, conditions, snapshots, and held gear. Under **remove from active play**, the original individual is archived with a lifecycle audit record, rather than deleted or recreated.

## Changed files

| Area | Files |
| --- | --- |
| Schema | `src/db/item-schema.ts`; `src/db/tabletop-shop-visit-schema.ts`; `drizzle/0081_creature_commerce.sql`; `drizzle/meta/0081_snapshot.json`; `drizzle/meta/_journal.json` |
| Ownership/commerce services | `src/features/creatures/creature-ownership-service.ts`; `creature-commerce-service.ts`; `owned-creature-service.ts`; `owned-creature-equipment-service.ts`; `src/features/tabletop-operations/shop-commerce-service.ts`; `shop-visit-service.ts`; `src/app/heavens/npcs/actions.ts` |
| Item authoring | `src/app/heavens/items/actions.ts`; `creature-grant-fields.tsx`; `item-workspace.tsx` |
| Character controls | `src/app/characters/character-sheet.tsx`; `owned-creature-actions.ts`; `owned-creature-equipment-actions.ts`; `owned-creature-equipment.tsx`; `owned-creatures.tsx`; `owned-creatures.module.css`; `item-use-actions.ts`; `item-use-dialog.tsx`; `src/features/items/item-use.ts`; `src/features/items/owner-inventory-service.ts` |
| Shop interfaces | `src/app/heavens/tabletop/shop-visit-workspace.tsx`; `src/app/realms/tabletop/player-shop-visit.tsx` |
| Lifecycle | `src/features/lifecycle/campaign-delete-plan.ts`; `campaign-delete-plan.test.ts`; `lifecycle-service.ts` |
| Verification | `scripts/creature-commerce-disposable.test.ts`; `creature-commerce-db.test.mjs`; `creature-commerce-browser.test.ts`; `tabletop-shop-visit-db.test.ts`; `tabletop-shop-visit-browser.test.ts`; `src/features/items/item-use.test.ts`; `src/features/characters/firearm-baseline-migration.test.ts` |
| Handoff | `docs/architecture/creature-ownership-pass-two-report.md` |

## Verification

- Focused unit suite: **547 passed**, covering Creature/NPC, Items, authorization, Active Health/state, Shop, lifecycle, and migration expectations.
- Disposable Pass 1/2 database suites: **6 + 16 passed**. Coverage includes authoring, quantity/retry/approval/rollback, exact resale, weight, identity-preserving equipment, passive placement, unauthorized and stale changes, individual G.O.D. editing, source-only consumption, anatomy, conditions/modifiers, effect rollback, concurrency, archive/encounter boundaries, and deletion cycles. A deterministic competing-transaction check verifies that G.O.D. inventory grants wait on the Campaign before locking its Character, preventing a deadlock with ownership/commerce operations.
- Fresh 82-migration chain and upgrade from populated pre-0081 data passed. The upgrade preserved all **182 pre-existing public tables**, including old animal Items, snapshots, ownership, and damage.
- Existing inventory/containment/physical-weight suite: **232 child cases passed** during this pass. Existing Shop commerce, Shop foundation, correction, and visit database checks passed; the visit check now discovers the journal length instead of asserting an obsolete migration count.
- Lifecycle service, historical migration replay, and derived-runtime regression checks: **4 passed**.
- Chrome desktop/390px browser workflow passed: author grant, buy two distinct horses, name Storm, move/wear/unequip/return the same harness, heal Storm with the owner's potion, G.O.D. transfer, approved sale, and exact injured repurchase. No browser page errors. Screenshots are under `artifacts/guidance/creature-commerce/`.
- Existing focused Shop browser regression passed: dirty stock reconciliation, repeated quote review, original-payload retry after an uncertain response, and cancellation/new checkout. Its initial/end-state assertions now follow the current Alerts tab instead of a hidden Table panel.
- Existing Character-sheet action regression: **14 passed**, including owner grants/removals, versions, permissions, costs, unavailable inventory, combat/loaded-ammunition guards, and later saves.
- TypeScript, changed-file lint, Drizzle metadata check, production build, and `git diff --check` passed. Build/browser harnesses restored their temporary Next configuration changes.

These automated checks do not substitute for the user's playtest or browser/device acceptance. No application deployment, commit, or push is part of this Pass 2 handoff.

## Pass 3 considerations

The current encounter system also supports definition-based Creature occurrences with separate encounter identity/state. Pass 3 must explicitly enroll the existing positive persistent NPC ID, avoid creating a duplicate occurrence, and reconcile encounter damage/effects with that individual's existing state. Ownership must not imply uncontrolled participant/action permissions. Combat timing, Initiative costs, reactions, and equipment handling must use their existing encounter rules.

Shop custody and receipt references must remain authoritative while an individual is unowned for resale. Item/gear operations must continue rejecting former owners after transfers. Encounter completion, sale, archive/death, and campaign deletion need end-to-end checks for the same identity and retained equipment. Evolution remains future work over that identity and its individual snapshot; no definition paths, requirements, or execution were added.
