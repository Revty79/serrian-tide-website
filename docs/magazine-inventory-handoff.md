# Magazine equipment and inventory

This pass completes catalog authoring and individual magazine handling outside combat. Existing combat and spell behavior is preserved.

## Using it

1. In **Heavens → Equipment**, create an item with its normal name, price, weight and description. Open **Magazine**, add its profile, enter a positive whole-number **Capacity (Rounds)**, and select exact compatible ammunition definitions using the search. Save.
2. On a weapon's **Weapon / Ammunition** tab, choose **Reload Type** and select its exact **Compatible Magazines**. `Single` describes future per-round reload cost; `Magazine` describes future whole-magazine swap cost. Unconfigured existing records remain unconfigured. Ammunition compatibility does not establish physical weapon compatibility.
3. Authorize the magazine and ammunition through existing campaign availability. Acquire copies using the existing character equipment/store, NPC inventory, or Shop paths. Each new copy starts empty and has a stable copy number.
4. Open the character sheet's **Magazines** panel (also available in the Creature NPC workspace). Choose ammunition, **Add rounds**, **Fill to capacity**, or **Empty magazine**. The panel shows each copy's contents and compatible loose stock. Empty a copy before changing ammunition types.

Transfers move real loose rounds and preserve their acquisition cost. They are transactional, serialized with existing character equipment operations, and recorded under stable retry identities. Stale requests and stale character-editor saves cannot overwrite transferred rounds. Existing Player/G.O.D. permissions apply; handling is blocked on the server while the character belongs to active combat, including frozen combat.

Loaded copies must be emptied before sale, removal, retirement, or archival/deletion of their model or ammunition. Capacity reductions and compatibility removals that invalidate loaded contents are rejected. Models with existing ownership cannot be silently converted into magazines or stripped of their magazine profile.

## Migration

Migration **0046_magazine_inventory.sql** adds the magazine profile, exact ammunition/weapon links, operation receipts, copy contents, nullable weapon reload type, and integrity guards. Existing firearm runtime rows and weapon capacities are untouched; no existing ammunition is moved and no magazines are manufactured.

After reviewing the intended database connection in `drizzle.config.ts` / `DATABASE_URL`, use the repository's Drizzle migration runner:

```powershell
npx.cmd drizzle-kit migrate
```

Apply the additive migration before running the updated application. This work applied it only to disposable test databases. No live database or deployment was changed.

## Validation

- 1,286 feature tests; typecheck; lint; production build; Drizzle migration check; Git whitespace check.
- Magazine database suite: 7 focused cases plus the parent test (8 passed), covering authoring, separate empty acquisitions, conservation, invalid operations, authorization, catalog/ownership guards, idempotency, concurrent requests, stale state, and active-combat blocking.
- Existing firearm completion database regression: 13 passed with the new migration.
- One complete automated UI scenario: author magazine and weapon links; acquire two empty copies in the existing character store; fill to 15/15 and 4/15; top up; empty; reload and verify exact remaining loose ammunition and separate contents. Evidence: `artifacts/combat-screens/results-magazine.json` and `magazine-inventory.png`.

Focused commands:

```powershell
$env:COMBAT_COMPLETION_CASE_FILTER = 'magazine'
npm.cmd run validate:combat-completion-db
$env:COMBAT_SCREEN_CASE_FILTER = 'magazine'
node --import tsx --test scripts/combat-screens-disposable-browser.test.ts
```

The walkthrough used G.O.D. character administration; server tests also cover Player access and unauthorized rejection. Separate Shop and NPC browser walkthroughs were not run. Automated verification does not replace human acceptance testing.

## Remaining boundary

Combat cannot insert, swap, or fire from these magazines yet. Prepared rounds are removed from loose ammunition and therefore unavailable to the current firearm runtime until the magazine is emptied outside combat. Existing weapon capacity and reload behavior continue unchanged. No chambered rounds, clips, mixed loads, or new reload timing rules were added.

## Changed files

- Schema: `src/db/magazine-schema.ts`, `item-schema.ts`, `realm-schema.ts`; `drizzle.config.ts`; migration 0046 and its snapshot/journal.
- Catalog: `src/features/items/magazine-catalog-service.ts`; `src/app/heavens/items/actions.ts`, `item-workspace.tsx`.
- Handling: `src/features/items/magazine-inventory-service.ts`; `src/app/characters/magazine-actions.ts`, `magazine-panel.tsx`, `magazine-panel.css`.
- Ownership/display integration: character actions, editor, sheet, models/rules/random-character; NPC actions/workspace; Shop commerce; equipment-state service/types/panel; item-charge service.
- Lifecycle: campaign/account dependency plans and lifecycle service.
- Verification: `scripts/magazine-inventory-db.test.ts`, existing disposable harness/browser scenario, evidence above, and migration-sensitive source assertions.

Committed locally only; no push or deployment is part of this pass.
