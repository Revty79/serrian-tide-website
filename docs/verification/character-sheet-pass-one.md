# Character sheet Pass 1 verification

Verified locally on 2026-09-24. Base: `main` at `b9d3c02d46857251a612c9bad010a5a6cdb0ebe8`. Commit and GitHub synchronization were subsequently authorized by the user. No deployment or persistent database migration was performed. All mutation rehearsals used disposable PostgreSQL databases.

## Delivered behavior

- Realms and Heavens share Identity, Attributes, Skills & Abilities, Story & Personality, Equipment, and the campaign-owner-only G.O.D. tab.
- Players can read Fame, XP, lifetime XP, Quintessence, and lifetime Quintessence on screen and in existing printed sheets. Their authorized advancement purchases retain server costs and eligibility checks. Manual balance adjustments and HP/mana restoration require the actual persisted campaign owner; item/spell/gameplay effects retain their existing paths.
- Completed Equipment shows one owned-item list. Applicable equipment selectors and item-use controls are beside the item; details and advanced magazine/firearm/charge controls are collapsed. Stacks show owned and active quantities; individual copies retain separate IDs and charge values. Creation retains its starting equipment store.
- Campaign owners have Add Item above the list and Remove on rows. The searchable modal uses current campaign availability, including unpriced items. Grants charge no currency, change no shop/catalog/purchase-ledger records, use existing ownership/starting-charge rules, and begin inactive with existing ammunition defaults.
- Stack removal explicitly chooses quantity and equipment state; other copies retain their states. Exact-copy removal retires that copy with its stored charge history. Existing equipment services end its passive effects. Previously owned items remain readable and removable after catalog removal or archival.
- Loaded firearms/magazines must be unloaded/emptied and attachments detached using existing controls before removal. Administrative adjustments are blocked during active combat and combat freeze. They do not automatically dispose of ammunition or infer rules for unsupported states.
- Mutations authorize the authenticated user against the target character's actual campaign owner. The locked commerce version rejects concurrent duplicate or stale requests. A repeated request fails with reload guidance rather than applying twice. A new intentional adjustment requires the refreshed version.
- Ordinary profile saves preserve unchanged ownership/acquisition rows and cannot adjust completed inventory. Creation-time profile saves and later purchases retain granted acquisition cost and the current purse; they do not charge for a grant or refund an administrative removal. Additional purchases remain server-priced and affordability-checked.

## Verification

| Check | Result |
| --- | --- |
| Focused character, authorization, active-state, item, and shop tests | 420 passed. The existing stale migration-list assertion was excluded explicitly. |
| Real server-action/database scenarios | 10 passed, covering owner grants/removals; concurrent/repeated requests; active-effect cleanup; exact charges; currency/profile preservation; unavailable items; loaded/attached ammunition; combat and freeze; player/admin/foreign-role rejection; advancement and insufficient funds; creation completion/locks; ordinary profile saves. |
| Actual browser routes | Passed player, campaign-owner, non-owning admin, and unrelated G.O.D. checks; row equip/unequip, partial armor, healing-potion consumption, owner stack/copy grants/removals, resources and inventory after reload, keyboard tabs, retained edits, mobile overflow, and all four print presets with public totals. No browser page errors. |
| Existing gameplay completion suite | 391 passed across 28 child scripts, including automated rewards and gameplay healing. Run during Pass 1 before the additive inventory-owner service; existing gameplay services were retained. |
| Existing shop commerce scenario | Passed against disposable PostgreSQL. Used a temporary copy of the existing test with only its hardcoded migration count replaced by the actual journal count; the temporary file was removed. |
| Typecheck | Passed. |
| ESLint on changed/new TypeScript and test files | Passed, no lint errors or warnings. |
| Production build | Passed. |
| Git whitespace check | Passed. |

The browser run preceded the final explicit profile-save combat-freeze guard; the final database run includes that guard and the typecheck/build passed afterward. Printed presets were checked through browser print-media rendering; a physical printer was not used. This is automated verification, not human acceptance.

## Screenshots

- [Owner equipment, desktop](../../artifacts/character-sheet-pass-one/owner-inventory-desktop.png)
- [Owner equipment, mobile](../../artifacts/character-sheet-pass-one/owner-inventory-mobile.png)
- [Owner Add Item dialog, mobile](../../artifacts/character-sheet-pass-one/owner-add-item-mobile.png)
- [Player equipment, desktop](../../artifacts/character-sheet-pass-one/player-equipment-desktop.png)
- [Player equipment, mobile](../../artifacts/character-sheet-pass-one/player-equipment-mobile.png)
- [Player identity, mobile](../../artifacts/character-sheet-pass-one/player-identity-mobile.png)
- [Owner G.O.D. controls, desktop](../../artifacts/character-sheet-pass-one/owner-controls-desktop.png)
- [Owner G.O.D. controls, mobile](../../artifacts/character-sheet-pass-one/owner-controls-mobile.png)

Screenshots are local ignored artifacts and contain disposable test characters.

## Remaining limits

No schema decision is needed for this implementation. The pre-existing migration-list unit assertion and legacy shop-test migration-count assertion remain stale in the checkout; they were not presented as passing unchanged. Containers, capacities, print redesign, and new item mechanics are outside this pass. A live character has not been modified as a test.

## Files changed

- `.gitignore`
- `scripts/character-sheet-actions-db.test.mjs`
- `scripts/character-sheet-pass-one-disposable.test.ts`
- `src/app/characters/actions.ts`
- `src/app/characters/active-health-panel.tsx`
- `src/app/characters/active-mana-panel.tsx`
- `src/app/characters/character-editor.tsx`
- `src/app/characters/character-print-center.tsx`
- `src/app/characters/character-sheet.tsx`
- `src/app/characters/character.css`
- `src/app/characters/equipment-state-actions.ts`
- `src/app/characters/owned-equipment-list.tsx`
- `src/app/characters/owner-inventory-actions.ts`
- `src/app/characters/owner-inventory-control.tsx`
- `src/app/characters/printable-character-sheet.css`
- `src/app/realms/characters/[characterId]/page.tsx`
- `src/features/active-state/active-health-service.ts`
- `src/features/active-state/active-mana-persistence.test.ts`
- `src/features/active-state/active-mana-service.ts`
- `src/features/authorization/managed-character-capability-service.ts`
- `src/features/authorization/managed-character-capability.test.ts`
- `src/features/authorization/managed-character-capability.ts`
- `src/features/characters/character-creation.test.ts`
- `src/features/characters/character-creation.ts`
- `src/features/characters/character-print.test.ts`
- `src/features/characters/character-rules.ts`
- `src/features/characters/character-sheet-access.test.ts`
- `src/features/characters/character-sheet-access.ts`
- `src/features/characters/models.ts`
- `src/features/characters/random-character.ts`
- `src/features/items/equipment-state-service.ts`
- `src/features/items/equipment-state.test.ts`
- `src/features/items/item-charge.test.ts`
- `src/features/items/item-ownership-pipeline.test.ts`
- `src/features/items/item-ownership.ts`
- `src/features/items/item-use-integration.test.ts`
- `src/features/items/owner-inventory-service.ts`
- `docs/verification/character-sheet-pass-one.md` (this handoff)
