# Container Pass 2: ordinary physical containers

September 25, 2026. Built on Pass 1 (`4fbbb71`) and its separately committed lifecycle correction (`40b345a`). This handoff includes the firearm/magazine and shared authoring amendments. Pass 3 is not started.

## Persistence and authoring

Migration `0068_mundane_container_physics.sql` extends two existing tables. Its snapshot follows `0067`; there are 69 journal entries and no new tables. It has been applied only to disposable test databases, not the shared development or production database.

| Record | New authored values |
| --- | --- |
| Item | Nullable external volume in liters, longest dimension in centimeters, and physical form (Solid, Liquid, or not authored). Existing narrative Size and free-text weight/unit remain intact. |
| Container profile | Classification; nullable maximum contents weight in pounds, internal volume in liters, and maximum direct Item dimension in centimeters; nesting permission; liquid-only restriction; category and Record Type allowlists; contained weight behavior fixed to `normal`. |

The shared Item/Equipment Overview editor exposes **Is Container**, default false, and hides container settings when false. Profile presence remains the authority for container identity. No existing Item is automatically marked as a container. The editor requires a finite weight or volume capacity when enabling a new profile, or when replacing previously authored capacities. Zero is an explicit zero allowance. A null limit is unconfigured/not applicable, not an authored magical infinity. Existing Pass 1 profiles with no limits remain editable without an automatic data conversion.

Content restrictions default to any Item. Each nonempty allowlist accepts any listed name, ignoring case and surrounding spaces. When both lists are supplied, both must match. Liquid-only storage requires explicitly authored Liquid physical form; a bottle containing liquid is still a solid Item. Restrictions apply to direct contents. A child container governs its own contents. Nesting defaults true to preserve Pass 1 behavior and can be disabled per model. No supernatural filtering, fluid actions, or magical-only fields were added.

The stored `contained_weight_behavior` currently accepts only `normal`; the editor displays its full-weight meaning. This provides an explicit extension point without implementing weight suppression. Enabling a profile still rejects existing stack ownership, and disabling one still rejects owned exact-copy records. Older action callers omitting physical fields/profile preserve existing values.

## Measurements and loaded weight

Calculations use pounds, liters, and centimeters. Supported weight aliases are lb/lbs/pound(s), oz/ounce(s), kg/kilogram(s), g/gram(s), and mg/milligram(s), case-insensitive with surrounding whitespace ignored. Values must be finite and nonnegative. Unsupported units, missing weights, and missing dimensions/volume remain unknown. Narrative Size is never parsed as a measurement.

`container-physics.ts` is the reusable pure model used by server reads, mutation validation, and client previews. `inventory-physical-service.ts` reads authoritative ownership and runtime state and supplies it to that model. A measurement retains its known subtotal and the names of Items with unknown data. Reads show **Physical data not authored**. A move requiring an unknown measurement fails with the affected container and missing Item data; there is no G.O.D. override in this pass. Other independent limits can still be checked when a particular limit is null.

Normal contents weight is direct stack quantity times unit weight plus each direct exact Item's full loaded weight. A loaded container weighs its empty Item weight plus its recursive contents. Thus a 3 lb backpack containing 20 lb contributes 23 lb. Character carried weight adds loose stacks and root exact instances once, including their recursive loads.

Used volume is the sum of directly stored stack volume and direct exact Item external volume. A nested pouch uses its own external volume in its parent; its contents are checked against the pouch's internal capacity and are not added to parent volume again. Longest dimension checks each directly stored Item against the container's authored maximum. This is a scalar physical-fit model, not a three-dimensional packing/orientation solver.

## Specialized firearms and magazines

The physical reader uses existing magazine `loadedRounds` and `loadedAmmunitionItemId`, firearm state, and authoritative firearm-magazine attachments. It does not mutate or duplicate those systems.

- An empty magazine weighs its base Item weight. A loaded magazine adds currently loaded rounds times their Item weight.
- A firearm adds its base weight, its specialized internal ammunition where applicable, and its attached magazine's complete loaded weight.
- Attached magazines are excluded from independent loose/contained physical roots and general contents displays. Their effective physical location follows the firearm, even if old general location metadata exists. Moving one independently requires detachment through the existing subsystem.
- Specialized loaded rounds have no general-container content rows. Their existing inventory transfer already removes them from loose ownership, so they are not counted twice.
- Moving a loaded firearm or standalone magazine changes location metadata only. Readiness, rounds, ammunition type, attachments, charges, costs, and specialized versions remain unchanged.
- Missing ammunition or magazine weights produce the same unknown measurement and capacity rejection as other Items. A firearm's authored exterior volume and dimension describe the stored assembly; no magazine shape or assembly geometry is invented.

## Mutations, equipment state, and lifecycle

Moves retain Pass 1 ownership, identity, version, cycle, cross-Character, authority, active-combat, and Freeze guards. The Character is locked and catalog Item rows receive ordered shared locks while physical reads and writes run. A move removes its source allocation, writes its destination, and validates within the same transaction before incrementing the commerce version and publishing invalidation. Errors roll back allocation, ownership, costs, version, and runtime state.

Every destination ancestor is validated from the resulting graph. A moved container's own limits are checked too. Source ancestors are also checked: a preexisting invalid load may be relieved when its known/unknown load does not worsen. This allows legacy overloaded or incompletely authored contents to be moved loose. Invalid destinations still reject additions, including moves that fit the immediate container but overload a grandparent.

Contained exact copies cannot be Worn or Wielded. Those copies must first become Equipped or Inactive before storage, and must return loose before being Worn/Wielded. For stacks, enough loose quantity must remain for all Worn/Wielded copies. Service checks and SQL triggers protect equipment changes, location writes, and stack quantity reductions. Moves never silently change equipment state or passive effects. Equipped/Inactive retain their existing meanings.

Restrictive containment ownership foreign keys and ordinary removal guards are unchanged: occupied containers, contained exact Items, and allocated stack quantities remain protected. The separate Pass 1 root-deletion correction remains intact. Disposable lifecycle coverage now uses physical container profiles and proves Player Character, Race NPC, Creature NPC, and Campaign destruction clears containment while ordinary removals remain guarded.

## Existing inventory interface

The Character Equipment tab shows location per row, including partial stack allocations and full nesting paths; a quantity-aware Move form; selectable owned container copies; server errors and previews; carried weight; and expandable nested contents with weight/volume limits and loaded container weight. Identical backpacks keep separate loads. Exact identity and ownership remain unchanged. Physical size appears in Item details.

The same controls are reused in the Creature NPC's existing Inventory tab. Player organization uses existing own-Character permission, without granting owner Add/Remove privileges. G.O.D. permissions remain tied to the Campaign. Read-only and combat/Freeze states are explained visibly. Mutation responses merge only the inventory version into the current Character draft. Colors use shared semantic theme variables and new authoring controls include field guidance.

## Original Pass 2 validation (`8ba84c4`)

All database mutation tests used disposable loopback PostgreSQL clusters with automatic cleanup. No production data was modified.

| Check | Result |
| --- | --- |
| Focused/broader Item, Character, lifecycle, shop, firearm, and Freeze unit/source tests | 484 passed, 0 failed (17 pure physical-model cases included). |
| Expanded containment disposable runner | 156 passed, 0 failed across child TAP suites; wrapper passed. |
| Pass 2 database suite within that runner | 23 passed: capacities, dimensions, nested ancestors/volume, rollback, costs/state, unknowns, equipment contradictions, authoring/defaults/restrictions, permissions, combat/Freeze, Character reload, concurrency, and specialized loaded weights. |
| Pass 1 containment within that runner | 32 passed, including ordinary removal and lifecycle boundaries. |
| Loaded-container lifecycle within that runner | 11 passed; existing lifecycle, Skill-reference, and Tabletop lifecycle suites each passed too. |
| Existing magazine/firearm/Item-use/Freeze within that runner | Magazine inventory 8; combat firearms 69; legacy readiness 1; legacy attack 1; combat Items/Abilities 3; Freeze 5, all passed. |
| Magazine catalog/readiness repair disposable suite | 5 passed. |
| Existing Shop commerce disposable suite | 1 encompassing test passed. |
| Pass 2 Chrome browser run | 24 TAP results passed (23 database results plus browser flow), zero page errors. G.O.D./Player moves, partial quantities, exact return to loose, nested contents, distinct backpacks, overloaded feedback, reload, authoring settings and 390 px layout exercised. |
| Existing Item/Equipment tag-authoring disposable browser suite | Passed, including draft preservation, save/reload, delayed requests, failure/retry and 390 px layout. |
| Typecheck; changed-file ESLint; production build | Passed. |
| Drizzle check; snapshot lineage/table-scope audit; git diff --check | Passed. |

Test maintenance was needed for obsolete migration-count assertions and two legacy firearm fixtures. The latter now author required Reload Type/range, use an NPC for G.O.D.-directed choices, follow current per-round loading and responder timing, provide the roll at declaration, and complete simultaneous checkpoints. They retain transactional/readiness/attack assertions; no firearm/magazine production mechanics were changed. An older Shop wrapper had a stale hardcoded migration count; the actual Shop commerce disposable suite was run directly and its ledger assertion now reads the journal.

Reproduction commands (PowerShell; `npm.cmd` avoids shell-shim policy issues):

```powershell
node --import tsx --test --test-reporter=tap src/features/items/*.test.ts src/features/characters/*.test.ts src/features/lifecycle/*.test.ts src/features/shops/*.test.ts src/features/tabletop-operations/firearm*.test.ts src/features/tabletop-operations/*shop*.test.ts src/features/tabletop-operations/*freeze*.test.ts
node --import tsx --test scripts/inventory-containment-disposable.test.ts
$env:CONTAINMENT_CASE_FILTER='container-physical'; $env:CONTAINMENT_BROWSER='1'
node --import tsx --test scripts/inventory-containment-disposable.test.ts
Remove-Item Env:CONTAINMENT_CASE_FILTER, Env:CONTAINMENT_BROWSER
$env:COMBAT_COMPLETION_CASE_FILTER='magazine-catalog'
node --import tsx --test scripts/combat-completion-disposable-db.test.ts
Remove-Item Env:COMBAT_COMPLETION_CASE_FILTER
node --conditions=react-server --import tsx --test scripts/tabletop-shop-commerce-db.test.ts
node --import tsx --test scripts/item-tag-authoring-disposable.test.ts
npm.cmd run typecheck
npm.cmd run build
node node_modules/drizzle-kit/bin.cjs check
git diff --check
```

Changed TypeScript/TSX/MJS files were linted with the repository ESLint configuration. Browser screenshots and server logs are local ignored artifacts under `artifacts/container-pass-two/`. Desktop and mobile screenshots were inspected. Browser coverage is Windows Chrome and emulated narrow viewports; it is not human acceptance or physical-device, Firefox, or Safari coverage.

## File inventory

- Persistence: `src/db/item-schema.ts`, `src/db/container-schema.ts`, `drizzle/0068_mundane_container_physics.sql`, `drizzle/meta/0068_snapshot.json`, `drizzle/meta/_journal.json`.
- Domain/services: `src/features/items/container-physics.ts`, `inventory-physical-service.ts`, `container-catalog-service.ts`, `inventory-containment-service.ts`, `equipment-state-service.ts`.
- Shared authoring/guidance: `src/app/heavens/items/actions.ts`, `item-workspace.tsx`, `src/features/guidance/field-help.ts`.
- Character/NPC UI: `src/app/characters/inventory-location-actions.ts`, `inventory-location-controls.tsx`, `inventory-location-controls.css`, `owned-equipment-list.tsx`, `character-sheet.tsx`, `character-editor.tsx`, `src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx`.
- Coverage/harness: `src/features/items/container-physics.test.ts`, `src/features/characters/firearm-baseline-migration.test.ts`, `scripts/container-physical-db.test.mjs`, `container-physical-browser.ts`, `inventory-containment-disposable.test.ts`, `lifecycle-containment-db.test.ts`, `firearm-readiness-db.test.ts`, `firearm-attack-db.test.ts`, `tabletop-shop-commerce-db.test.ts`.
- Handoff/artifact exclusions: this file and `.gitignore`.

## Review boundaries before Pass 3

Catalog dimensions, capacities, and physical forms still need deliberate authoring; this pass does not backfill or guess canon. Scalar dimensions do not model flexible bags, orientation, bulk compression, sealed packaging, or automatic fluid transfer. Category/type allowlists are authored names rather than a new taxonomy or supernatural classification system.

Catalog edits can change the physical load or allowed contents of an already stored Item. Reads expose the resulting problems and future containment moves revalidate them; moving loose can relieve them. The correction below requires retrieval before specialized loading or assembly changes. It does not add capacity calculations to firearm or magazine actions. General inventory rearrangement remains blocked during active combat/Freeze; retrieval Initiative and combat handling are unresolved.

Before magical behavior, inspect and approve this physical baseline; decide actual magical capacity, weight, nesting, destruction and interior-space semantics from canon. Extend the profile and common physical model deliberately while preserving specialized firearm state and lifecycle cleanup. Infinite storage, magical weight reduction, preservation, living-creature suspension, refilling liquids and special destruction effects are absent.

## Pass 2 correction: specialized handling requires Loose exact copies

The review of `8ba84c4` identified that attachment and general containment could coexist in storage. The accepted physical calculator correctly gave attachment precedence, but a stale general location could reappear after detachment. Specialized filling could also change a contained copy's physical load. This separate correction closes those write paths without changing the physical model or implementing retrieval mechanics.

- Outside combat, filling/adding/emptying a detached magazine requires no general containment location. A firearm must be Loose before loading, unloading, attaching, detaching, or swapping its magazine.
- Attachment still requires an exact owned, compatible magazine detached from every other firearm. The replacement must also be Loose. Invalid replacement operations leave location, attachments, ammunition, costs, receipts, and firearm state unchanged.
- Combat magazine filling and firearm preparation enforce the same location boundary. Delayed fill insertions, Single loading progress, and preparation/swap completion recheck location before applying changes. Rejected transactions do not spend Initiative or leave partial declarations/receipts. Existing Worn/Wielded containment restrictions remain intact.
- On a valid detach or replacement from a Loose firearm, the shared swap function removes any stale general containment row belonging to the **previously attached magazine**, in the same transaction. The detached copy becomes Loose. This is normalization of contradictory Pass 2 history, not automatic retrieval of a contained replacement. A failed operation does not normalize anything.
- Setup and combat magazine selectors mark contained copies unavailable. Filling controls explain the Loose requirement. The Character Equipment tab refreshes both specialized panels when an inventory move updates the commerce version, so retrieval enables the appropriate controls without reloading the page.

The server remains authoritative. Inventory location checks share the Character lock with ownership/location mutations. Firearm firing, readiness calculations, ammunition transfer rules, authored Initiative costs and timing, restrictive ownership foreign keys, and root lifecycle cleanup are unchanged. The physical calculator and schema/migrations are unchanged. Loaded firearm assemblies can still be stored and moved without altering rounds, attachment, readiness, charges, costs, or total carried weight.

Correction coverage adds 17 focused database subtests to `container-physical-db.test.mjs` (18 TAP results including the enclosing test). They exercise each setup manipulation, successful handling after retrieval, combat rejection and success, delayed operation rechecks, stale-state detach in both paths, failed-swap atomicity, and loaded-assembly conservation. The existing Pass 1 magazine test now explicitly expects contained emptying to fail, then retrieves the copy before checking its original conservation assertions.

Correction validation:

- 493 Item, Character, lifecycle, combat-screen, firearm, and Freeze unit/source tests passed.
- Focused Pass 2 database suite: 41 passed. Chrome adds a 42nd result covering unavailable contained-copy controls, refresh after retrieval, and the original desktop/Player/mobile/authoring flows; zero page errors.
- Existing disposable regressions passed: Pass 1 containment 32; containment lifecycle 11; lifecycle service 1; Tabletop lifecycle 1; magazine inventory 8; combat firearms 69; legacy readiness 1; legacy attack 1; combat Items/Abilities 3; Freeze 5; magazine catalog/setup repair 5.
- Typecheck, changed-file ESLint with zero warnings, production build, and `git diff --check` passed. No schema migration was needed and no shared database was modified.

Additional touched files: `containment-ownership-service.ts`, `firearm-magazine-service.ts`, `firearm-setup-service.ts`, `magazine-inventory-service.ts`, `tabletop-operations/firearm-readiness-service.ts`, `tabletop-operations/combat-magazine-fill-service.ts`, `combat-screen/firearm-controls.tsx`, `combat-screen/magazine-fill-controls.tsx`, `app/characters/firearm-setup-panel.tsx`, `app/characters/magazine-panel.tsx`, `app/characters/character-sheet.tsx`, and the two containment database tests plus `container-physical-browser.ts`. Browser evidence remains under `artifacts/container-pass-two/`, including `specialized-setup.png`.

**STOP: Pass 3 is not started and requires separate user approval.**
