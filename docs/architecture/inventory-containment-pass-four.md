# Container System — Pass 4

Pass 4 adds tabletop access and root custody to approved Passes 1–3 at `ac8586491ed8c99c8c5807239223f2695b36c453`. Ownership, physical/magical rules, and firearm/magazine mechanics remain their existing authoritative systems. No shared database migration, push, or deployment is part of this change.

## Schema and lifecycle

Migration `0070_container_tabletop_access.sql` adds four tables:

- `inventory_instance_custody`: an exact root's dropped/stolen/lost state, with a restrictive composite ownership foreign key.
- `inventory_stack_custody`: positive unavailable root quantities, also referencing existing ownership restrictively.
- `inventory_container_access`: each exact container's open/closed/locked/sealed state.
- `inventory_custody_event`: durable actor, Character, Item/copy/quantity, operation, prior/new state, reason, note, context, timestamp, retry identity and evidence.

`container_profiles` gains closure mode and nullable retrieve/stow/open/close Initiative costs. Defaults preserve always-accessible existing containers; blank costs are unresolved, and zero is an authored cost. Shared Item/Equipment normalization and the existing editor persist these same runtime fields. Existing non-container Items remain unchanged.

The new snapshot follows 0069 and changes only `container_profiles` plus these four tables. SQL guards serialize allocations with Character ownership, reject custody on contained/attached copies, prohibit over-allocation, and retain occupied-container, contained-copy, retirement and equipment guards. Character/Player/Race NPC/Creature NPC root cleanup and the Campaign deletion graph remove the new rows before ownership. Existing declarations and pending actions retain their established lifecycle. Session/Scene foreign keys use SET NULL; readable context text survives without recovering inventory.

## Custody and effective access

Carried roots need no custody row. Moving a whole root to dropped, stolen or lost leaves its child location rows, nested containers, costs, quantities, charges and specialized state intact. Exact recovery deletes custody metadata; partial stack recovery reduces its allocation. Owned stack quantity remains the sum of contained allocations, unavailable root allocations, and carried Loose remainder.

`inventory-access.ts` is the shared resolver. It returns immediate parent, full ancestor chain, outer root, custody, blocking ancestor/closure, readable context, accessible status and usable status. Attached magazines follow the firearm assembly. Accessible contents still require retrieval to Loose for independent use; an attached magazine requires its existing detach operation. Closed, locked or sealed ancestors block access. The container's own closure does not prevent moving the whole container.

`inventory-access-service.ts` supplies database graphs and exact/quantity assertions. Item consumption, exact charges, Item combat sources/effects, weapon sources, equipment, firearm initialization/setup/preparation/attack, magazine filling, ammunition reduction, Shop sale submission/finalization and individual ownership removal use these guards. Operational equipment projections exclude unavailable weapons/armor. Magazine ammunition choices show the available Loose remainder.

## Closure and outside-combat handling

Always-accessible containers ignore stored closure state. Open-close copies without a runtime row begin **closed**. Normal Open/Close changes an unlocked closed/open copy immediately outside combat. Locked/sealed states require an explicit Campaign-owning G.O.D. ruling and reason; no key, lockpicking, breaking or Skill rules are invented.

Outside combat, existing inventory moves support retrieve, stow and container-to-container movement, subject to custody, closure, capacity, restrictions and equipment rules. Drop requires one eligible active Scene, or an explicitly selected eligible Scene, containing the Character. Players recover their own dropped roots only in that same active Scene. G.O.D. can adjudicate theft, loss, recovery and access. Unrelated G.O.D.s and admin readers gain no new authority. All mutations respect Freeze.

Voluntary Drop rejects Worn/Wielded exact roots or stack quantities reserved as Worn/Wielded. Equipped state is preserved by voluntary Drop. Theft/loss can force the root's equipment Inactive, reconcile passive effects, and record the previous equipment state. Recovery preserves that history and does not silently re-equip it. Catalog conflicts do not destroy recovered contents: recovery succeeds and existing physical warnings remain visible.

## Combat timing and concurrency

`combat-inventory-service.ts` uses the existing declaration, pending action, Initiative opportunity and timeline services. Retrieve sums the authored costs of the source container and its ancestors. Stow sums the destination container and its ancestors. Open/Close uses only that container's corresponding authored cost. Closed ancestors must be opened separately. Combat stow requires a Loose source; direct container-to-container movement remains rejected.

A blank cost anywhere in the accessed chain needs an explicit **total cost and reason**, covering that whole handling operation. Player requests use the existing manual-action G.O.D. request/approval records, frozen to the exact command and consumed once. G.O.D. supplies the same explicit ruling directly for NPC actions. Drop always requires this ruling; no free-action or canonical drop cost is assumed. Authored zero-cost handling still needs an ordinary action opportunity and cannot bypass a simultaneous-choice checkpoint.

Before spending Initiative, a rolled-back savepoint validates the actual proposed mutation. Positive costs create/lock/commit an existing declaration and pending action. The frozen evidence includes source/destination ancestry and access, profile costs/rules, commerce version, exact copy state and firearm state. Completion rechecks this evidence and current capacity/restrictions under the existing locks, then applies movement once. Interruptions leave contents in place. Stale or invalid completions cancel with an audit event instead of repeatedly failing the whole timeline; already-spent Initiative is not refunded or replayed. Retries return the same declaration, and instantaneous actions retain receipts in participant state.

The Character commerce version is deliberately conservative: an intervening inventory change can invalidate pending handling even when it affects another portion. A new action must be prepared from the current inventory. Retrieve does not draw, ready, unload, detach, or change ammunition. Player simultaneous choices retain the existing privacy boundary.

## Weight, firearms, magic and substances

Carried weight excludes unavailable roots and their full external loaded weight. Descendants and attached magazines are counted through their root assembly once. Recovery restores the same resolved contribution. Existing unknown-data warnings, magical external-weight rules, and finite measurements are retained.

Custody/access reads the existing firearm and magazine relationships; it never replaces their state or creates ammunition containment rows. Loaded firearm assemblies and standalone magazines preserve attachments, rounds, readiness and ammunition costs through drop, theft, loss and recovery. Unavailable ammunition cannot be loaded and unavailable exact copies cannot be prepared or fired.

Finite substance records and infinite source definitions survive custody. Drawing/adding substance requires accessible carried ancestry and an open container. Contained time continues to resolve from ancestry even when custody is unavailable. The Pass 3 time hook remains a current-graph hook, not a new historical clock. Bulk substance manipulation remains outside combat; this pass adds no drinking, pouring or firearm actions.

## Deliberate destruction/spill

Only the Campaign-owning G.O.D. can resolve container destruction, with a reason. Direct exact children become roots at the destroyed container's effective custody; child container interiors stay intact. Contained stack quantities become equivalent Loose carried or unavailable root portions. Finite substance is removed as spilled/lost with its amount and definition in the audit. The empty container is retired; child Items are preserved.

Magical containers and special capacity/weight/time/living/infinite-source cases require an additional explicit safe-spill ruling. Specialized attachments on the destroyed container itself must be resolved through their own subsystem first. No automatic damage, explosions, portals, annihilation, interior effects or child destruction are added.

## Interfaces

The existing shared Character/NPC inventory rows show effective custody, ancestor blockers, per-copy closure, context and unavailable stack portions without duplicating ownership rows. Guided controls provide Open/Close, Drop, eligible recovery, G.O.D. theft/loss, access rulings and deliberate spill resolution. Carried-weight guidance explains exclusions. Existing source/setup controls display unavailable state.

The actual combat screen's Item and Weapons commands, Player source rulings, and Player tabletop equipment panel reuse `InventoryHandlingControls`. It shows containers, accessible/unavailable portions, accessed chain, calculated costs, pending Initiative, completed/cancelled handling and G.O.D. cost approval. Players commit their own approved actions. Controls use shared semantic theme colors and field guidance, and fit a 390 px viewport.

## Validation

Validation uses disposable PostgreSQL and disposable authenticated browser accounts only.

| Check | Result |
| --- | --- |
| Item, Character, lifecycle, combat-screen, tabletop, Initiative, declaration, firearm, Freeze and Shop unit suites | 938 passed; includes 12 focused access/authoring cases |
| Physical/magical/access database suite | 87 passed; includes 33 focused Pass 4 service cases |
| Containment root lifecycle | 11 passed, including Player/Race NPC/Creature NPC/Campaign cleanup with new custody/access/audit state |
| Existing lifecycle, Skill-reference lifecycle, tabletop lifecycle | 1 transactional suite each passed |
| Pass 1 containment database suite | 32 passed |
| Magazine inventory database suite | 8 passed |
| Combat firearm completion | 69 passed |
| Combat Item/Ability completion | 3 passed |
| Combat Freeze completion | 5 passed |
| Firearm readiness / attack databases | 1 transactional suite each passed |
| Magazine catalog regression | 5 passed |
| Shop transactional regression, including unavailable stack/exact sale rejection | Passed |
| Shared Equipment/Inventory Item authoring browser regression | Passed |
| Combined physical/magical/access browser run | 88 passed, including the browser workflow; no page errors |
| TypeScript, changed-file ESLint with zero warnings, production build | Passed |
| Drizzle check / 0069→0070 snapshot chain / diff whitespace check | Passed |

The 12 database suites contain 220 passing tests in total. Their harness migrates all 71 journal entries into a fresh PostgreSQL cluster. Focused coverage includes exact and stack ancestry, closed/locked/sealed handling, authored zero and decimal nested costs, ordinary opportunity enforcement, Player approval and G.O.D. authority, delayed completion/retries/interruption, concurrent theft/retrieval, Freeze, physical recovery conflicts, passive-effect reconciliation, actual Item-use/sale rejection, loaded firearms, magic/substances, safe spill, and historical Scene/Session context retention.

Actual authenticated Chrome flows cover Player outside-combat retrieve/stow, nested location, open/close and closed-container errors, drop/recovery with carried-weight changes, G.O.D. theft/recovery, unavailable descendants, loaded firearm assembly preservation, magical containers/sources, actual combat retrieve and pending/completed Initiative, G.O.D. approval of an unresolved stow cost, completed stow, and 390 px layout without horizontal overflow. Desktop/mobile screenshots were inspected. Screenshots and logs remain local under `artifacts/container-pass-four/` and `artifacts/container-pass-four-*.log`; prior physical/magical screenshots are in their existing Pass 2/3 artifact folders.

Commands: `node --import tsx --test scripts/inventory-containment-disposable.test.ts`; repeat with `CONTAINMENT_CASE_FILTER=container-physical-db` and `CONTAINMENT_BROWSER=1` for browsers; `COMBAT_COMPLETION_CASE_FILTER=magazine-catalog` with `scripts/combat-completion-disposable-db.test.ts`; `node --conditions=react-server --import tsx --test scripts/tabletop-shop-commerce-db.test.ts`; `node --import tsx --test scripts/item-tag-authoring-disposable.test.ts`; all `*.test.ts` files under the seven feature directories named in the unit-suite row; `npm.cmd run typecheck`; changed-file ESLint; `npm.cmd run build`; `node node_modules/drizzle-kit/bin.cjs check`; `git diff --check`.

## Review correction: manual passive custody eligibility

The follow-up to reviewed Pass 4 commit `c4e85146bbd359d56e012db2f51a237a26873ecc` corrects the Equipment State read model's manual passive reporting. It previously checked saved Equipment State without the custody filtering already used by automatic passive reconciliation. A voluntarily dropped Equipped copy, an Equipped descendant of an unavailable container, or an unavailable stack could therefore still advertise a manual benefit to the Character and paper sheets.

`eligiblePassiveOwnerKeys()` in `equipment-state-service.ts` now supplies both `readCharacterEquipmentStateInTransaction()` and `reconcileItemPassiveEffectsInTransaction()`. An exact owner must have effective carried custody and satisfy its passive's Equipment State requirement. A stack must have a carried Loose or carried contained quantity and an active quantity satisfying that same requirement, preserving the existing stack semantics. Exact owner identities, automatic effect lifecycle/history, and the read model's single manual row per authored effect are preserved.

This eligibility deliberately depends on custody, not closure/access or Loose placement. Equipped contents of a closed carried backpack still qualify. Voluntary Drop preserves Equipment State but suppresses passive reporting until recovery. Theft of a root that forces Inactive still requires explicit re-equipping after recovery. Worn Armor/Wielded Weapon operational filtering retains its separate existing rules. No UI filtering, schema change, migration, or new firearm/magazine behavior is introduced.

Eleven focused disposable database cases in `scripts/container-passive-db-cases.mjs`, invoked by the existing physical containment suite, cover both legacy and power-authored passives; exact drop/recovery; nested stolen/lost ancestry and closed-container recovery; root theft requiring re-equipping; fully/partially unavailable stacks; carried contained stacks without Loose copies; independent exact copies and manual-row aggregation; and Worn Armor/Wielded Weapon behavior. Each scenario checks manual read eligibility against real automatic Conditions and Modifiers, including idempotent reconciliation; drop/recovery also verifies retained effect history. The new custody assertions reproduced the defect before the fix.

Follow-up validation (separate from the original Pass 4 validation above):

- Unit regressions: **1,007 passed**, covering Items/equipment/access/Passes 2–3, active state/effects, Characters/sheets/paper/print, lifecycle, combat-screen, tabletop operations, and Shops.
- Full disposable containment harness: **232 passed** across all 12 child suites, including 99 physical/magical/access/passive tests (11 new focused passive cases), 32 Pass 1 containment tests, lifecycle cleanup, firearm/magazine, Item/Ability completion, and Freeze regressions. All migrations ran only in the harness's temporary database, which was removed afterward.
- Typecheck and changed-file ESLint with zero warnings: passed.
- Production build and `git diff --check`: passed.

Commands: `node --import tsx --test scripts/inventory-containment-disposable.test.ts`; `node --import tsx --test --test-reporter=tap` with all `*.test.ts` files under `src/features/{items,characters,active-state,lifecycle,combat-screen,tabletop-operations,shops}`; `npm.cmd run typecheck`; `npx.cmd eslint src/features/items/equipment-state-service.ts scripts/container-physical-db.test.mjs scripts/container-passive-db-cases.mjs --max-warnings 0`; `npm.cmd run build`; `git diff --check`. Follow-up logs are local ignored files at `artifacts/container-pass-four-passive-*.log`. No browser workflow was rerun for this shared-service correction.

Correction files: `src/features/items/equipment-state-service.ts`, `scripts/container-passive-db-cases.mjs`, `scripts/container-physical-db.test.mjs`, and this handoff. Commit this correction separately and stop; no post-container work is included.

## Limits and review boundary

- This is custody metadata under the original Character's ownership, not transfer to another Character or a world-loot ledger.
- Player immediate recovery remains an outside-combat operation; G.O.D. can adjudicate recovery during combat, subject to Freeze. No recovery Initiative rule was invented.
- No automatic locks/keys, durability engine, Creature containment, environmental simulation, new firearm behavior or additional magical rules were introduced.
- Automated and Chrome browser coverage are engineering validation, not human gameplay acceptance. No Firefox/Safari or physical mobile device was exercised.
- Migration 0070 is generated and tested in disposable databases. Applying it to persistent environments requires the normal deployment workflow.

Pass 4 ends here. Do not begin post-container expansion before review.

## Files changed

- `.gitignore`
- `COMBAT-RESUME.md`
- `docs/architecture/inventory-containment-pass-four.md`
- `drizzle.config.ts`
- `drizzle/0070_container_tabletop_access.sql`
- `drizzle/meta/0070_snapshot.json`
- `drizzle/meta/_journal.json`
- `scripts/container-access-browser.ts`
- `scripts/container-access-db-cases.mjs`
- `scripts/container-physical-browser.ts`
- `scripts/container-physical-db.test.mjs`
- `scripts/inventory-containment-db.test.mjs`
- `scripts/inventory-containment-disposable.test.ts`
- `scripts/lifecycle-containment-db.test.ts`
- `scripts/tabletop-shop-commerce-db.test.ts`
- `src/app/characters/firearm-setup-panel.tsx`
- `src/app/characters/inventory-custody-controls.tsx`
- `src/app/characters/inventory-location-actions.ts`
- `src/app/characters/inventory-location-controls.tsx`
- `src/app/characters/item-use-actions.ts`
- `src/app/characters/magazine-panel.tsx`
- `src/app/heavens/items/container-rule-fields.tsx`
- `src/app/realms/tabletop/player-tabletop-combat-equipment.tsx`
- `src/db/container-schema.ts`
- `src/db/inventory-access-schema.ts`
- `src/features/characters/firearm-baseline-migration.test.ts`
- `src/features/combat-screen/command-actions.ts`
- `src/features/combat-screen/command-panel.tsx`
- `src/features/combat-screen/inventory-handling-controls.css`
- `src/features/combat-screen/inventory-handling-controls.tsx`
- `src/features/items/container-physics.ts`
- `src/features/items/container-rules.ts`
- `src/features/items/containment-ownership-service.ts`
- `src/features/items/equipment-state-service.ts`
- `src/features/items/firearm-magazine-service.ts`
- `src/features/items/firearm-setup-service.ts`
- `src/features/items/inventory-access-service.ts`
- `src/features/items/inventory-access.test.ts`
- `src/features/items/inventory-access.ts`
- `src/features/items/inventory-containment-service.ts`
- `src/features/items/inventory-custody-service.ts`
- `src/features/items/inventory-physical-service.ts`
- `src/features/items/item-charge-service.ts`
- `src/features/items/magazine-inventory-service.ts`
- `src/features/lifecycle/campaign-delete-plan.ts`
- `src/features/lifecycle/lifecycle-service.ts`
- `src/features/tabletop-operations/action-declaration-service.ts`
- `src/features/tabletop-operations/action-effect-plan-service.ts`
- `src/features/tabletop-operations/action-source-resolver-service.ts`
- `src/features/tabletop-operations/combat-inventory-service.ts`
- `src/features/tabletop-operations/combat-magazine-fill-service.ts`
- `src/features/tabletop-operations/firearm-attack-service.ts`
- `src/features/tabletop-operations/firearm-readiness-service.ts`
- `src/features/tabletop-operations/runtime-integration-service.ts`
- `src/features/tabletop-operations/shop-commerce-service.ts`
