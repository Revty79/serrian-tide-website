# Creature Ownership — Pass 1

Implemented against clean HEAD `28a80d61c07c36daa0793c0c634dd6b489e51c00`. This pass adds ownership to persistent individual Creature NPCs. Purchasing, Character inventory display, encounter enrollment and Evolutions remain future passes.

## Ownership and persistence

The existing `campaign_character` row remains the individual identity. Its `campaign_creature_npc_profile` retains the exact Creature definition/variant, baseline/current snapshots, individual notes and HP adjustment. Existing health, HP pool damage, injuries, conditions, modifiers and their history remain keyed to that same individual ID.

`campaign_character.owner_character_id` is a nullable relational link to the owning Character. `player_user_id` remains the existing controlling account; assignment never changes that account or turns an NPC into a Player Character. Player Characters and Race NPCs are eligible owners. Creature NPCs are excluded as owners. The service requires an active owner in the same Campaign.

There is no Pet/Animal table, Item instance, quantity representation, copied Character mechanic, or Creature body-weight contribution. Two creations from one definition use the existing constructor twice and produce two independent individuals. Ownership changes update only the owner link and the individual's update timestamp. Existing history is retained; this pass does not introduce a separate ownership-history ledger.

## Exact migration

`drizzle/0080_creature_ownership.sql` adds only:

- Nullable integer `campaign_character.owner_character_id`.
- Composite FK `campaign_character_creature_owner_fk`: `(owner_character_id, campaign_id)` references `campaign_character(id, campaign_id)`, with `ON DELETE RESTRICT` and `ON UPDATE NO ACTION`. This enforces owner existence and the same Campaign.
- Index `campaign_character_creature_owner_idx` on `(owner_character_id, campaign_id)`.
- Check `campaign_character_creature_owner_valid`: a non-null owner is allowed only on an individual Creature NPC and cannot reference that individual itself.

Owner eligibility and archive restrictions are checked by the authorized server action, while the FK and row constraint provide database integrity. No ownership is inferred or backfilled. Snapshot `0080_snapshot.json` follows `0079`; `campaign_character` is the only changed table. The migration journal now has 81 entries.

The migration was applied only to disposable test clusters. Neither dev nor production was migrated. Deploying these application changes requires the migration chain through `0080` on the chosen database. Live database migration and deployment remain separate from the code handoff.

## Direct assignment and permissions

In **The Heavens → NPCs**, select a Campaign, choose **Create NPC → Creature**, select the existing definition or variant, enter an individual name/role/notes, and select **Owning Character**. Leaving **Unassigned** creates the ordinary unowned NPC. Both Simple and Detailed construction are supported.

`createNpc` accepts optional `ownerCharacterId`. It locks the Campaign, checks the authenticated user's current roles and Campaign authority, validates/locks the owner, reads the authoritative Creature template, then calls the existing `buildCreatureNpcSnapshot` and `createCreatureNpcInTransaction`. Creation and assignment commit together.

The NPC index shows each Creature's owner and offers **Change Owner**. `setCreatureNpcOwner` authorizes the same Campaign-owning G.O.D./Administrator policy, locks the Campaign and individual, validates the persistent Creature profile and chosen owner, and updates the existing record. **Unassigned** releases ownership without deletion. Snapshot edits cannot bypass this action or overwrite ownership from a stale draft.

Players and G.O.D.s from other Campaigns cannot assign, transfer, edit these NPCs, or use their lifecycle controls. Ownership adds no new Player viewing or mutation authority. Existing health/condition permissions are preserved, including the distinction between Administrator record management and the Campaign owner's health-restoration authority. Current role rows are rechecked and held with a shared lock during the mutation transaction.

New owner/notes controls use shared field guidance and semantic appearance. The native dialogs scroll at phone widths and remain centered.

## Lifecycle

- Archiving/restoring an individual keeps its owner and state. Restore an archived individual before changing ownership.
- Archiving an owner does not delete or release its Creatures. New assignment to an archived owner is rejected; an active Creature can be reassigned away from that owner.
- Permanently deleting a Character that still owns Creatures is blocked, with a dependency explaining that they must be reassigned or released first. The FK also rejects direct deletion that would leave a dangling owner.
- The existing whole-Campaign deletion plan explicitly clears ownership links within that Campaign before deleting its graph. The operation remains transactional; a forced failure after detachment restores the links and state. Other Campaigns remain intact.
- Existing death, restoration and archive mechanics continue to apply to the individual. No second death/lifecycle system was added.

## Validation

| Check | Result |
| --- | --- |
| Creature, Character, NPC, lifecycle, active-state, Item/weight unit regressions | 648 passed |
| New ownership PostgreSQL scenarios | 6 passed |
| Container physics, containment lifecycle, inventory containment and magazine PostgreSQL regressions | 150 passed: 99 + 11 + 32 + 8 |
| Existing lifecycle service, populated lifecycle migration upgrade, Derived Ability runtime PostgreSQL regressions | 4 passed: 1 + 1 + 2 |
| Fresh migration chain and populated 0079 → 0080 upgrade | Passed; all 182 existing public tables preserved after excluding the new nullable column; old damage/snapshots/notes unchanged |
| Authenticated Chromium desktop and 390px phone workflow | Passed: two independent creations, owner selection, shared help, scrolling, transfer, unassignment, reload, retained damage and notes; no browser errors |
| Changed-file ESLint | Passed |
| Drizzle check and snapshot-chain/table-diff verification | Passed |
| Final `npm.cmd run typecheck`, production build and whitespace check | Passed; build completed TypeScript and generated all 28 static pages; temporary Next configuration changes restored |

The six ownership DB scenarios cover authoritative construction and Forms snapshots; separate IDs/names/state; unchanged full owner aggregate and encumbrance; transfer to Player Characters and Race NPCs; release/reassignment; health, injuries and condition retention; exact variant identity; ordinary unowned compatibility; individual editing and Simple-to-Detailed upgrade; invalid/cross-Campaign/self/Creature/archived-owner rejection; database FK/check rejection; unauthorized Players/foreign G.O.D.s; Admin record authority without health escalation; stale snapshot ownership bypass prevention; archive/restore; owner deletion blockers; Campaign deletion and rollback.

One older `runtime-foundation-db.test.ts` attempt could not execute: it explicitly requires an intentionally absent Step 13 fixture set. That prohibited legacy fixture seed was not recreated. The new ownership DB tests directly exercise current active-health damage/restoration and condition services; the self-contained Derived Ability runtime regressions passed separately. No product defect was identified by that unavailable legacy suite. Automated browser verification is not human acceptance testing; Firefox, Safari and physical mobile devices were not exercised.

Reproduce the focused checks without loading `.env.local` into a live database connection:

```powershell
node --import tsx scripts/creature-ownership-disposable.test.ts
node --import tsx scripts/creature-ownership-disposable.test.ts --browser
node --import tsx scripts/creature-ownership-disposable.test.ts --regressions
node --import tsx scripts/creature-ownership-disposable.test.ts --build
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/creatures/*.test.ts src/features/characters/*.test.ts src/features/npcs/*.test.ts src/features/lifecycle/*.test.ts src/features/active-state/*.test.ts src/features/items/*.test.ts
```

The disposable harness overrides `DATABASE_URL`, migrates temporary loopback databases, and stops/removes its own cluster in cleanup. Build/browser helpers restore their temporary Next TypeScript configuration changes. Local logs and screenshots are under ignored `artifacts/guidance/creature-ownership*` paths.

## Files changed

| File | Purpose |
| --- | --- |
| `.gitignore` | Ignore isolated ownership browser/build output |
| `src/db/realm-schema.ts` | Nullable relational ownership, FK/index/check |
| `drizzle/0080_creature_ownership.sql` | Forward schema migration |
| `drizzle/meta/0080_snapshot.json` | Generated schema snapshot |
| `drizzle/meta/_journal.json` | Register migration 0080 |
| `src/features/npcs/npc-workflow.ts` | Optional ownership creation input and validation |
| `src/app/heavens/npcs/actions.ts` | Atomic assignment, authorized reassignment/release, owner choices and ownership reads |
| `src/app/heavens/npcs/npc-workspace.tsx` | Creation selector, owner display, reassignment dialog and guidance |
| `src/app/heavens/npcs/npcs.css` | Center native NPC dialogs |
| `src/features/lifecycle/campaign-delete-plan.ts` | Scoped ownership detachment during Campaign deletion |
| `src/features/lifecycle/lifecycle-service.ts` | Owner deletion dependency blocker |
| `src/features/characters/firearm-baseline-migration.test.ts` | Keep the existing ordered migration assertion current |
| `scripts/creature-ownership-db.test.mjs` | Focused real-database action/state/permission/lifecycle tests |
| `scripts/creature-ownership-disposable.test.ts` | Guarded fresh/upgrade DB, regression, browser and build harness |
| `scripts/creature-ownership-browser.test.ts` | Authenticated desktop/phone ownership workflow verification |
| `docs/architecture/creature-ownership-pass-one-report.md` | This implementation and validation record |

## Implications for later passes

The planned order remains appropriate. Pass 2 should display/query these individual IDs and scope any Player-facing read access explicitly. Purchase creation must run in the same transaction as its commerce operation and use retry/idempotency protection; transfer/sale must update the existing individual rather than invoke a constructor. Keep the new purchasable-Creature listing setting separate from Related Creature.

Pass 3 must enroll the same persistent individual ID and its existing active state; encounter-only Creature occurrences remain a separate existing path. Future Evolution can change the profile's definition/current snapshot while keeping the root ID and owner link, with explicit health/anatomy translation rules. No evolution fields or execution were introduced.
