# Evolution Pass 2 — Race and Creature requirements and eligibility

Pass 2 adds requirements and read-only eligibility to Creature Evolutions, and adds equivalent first-class Race paths, requirements and eligibility. It does not perform Evolutions, change an individual's definition, activate Forms, spend Experience, consume Items, heal, or add encounter behavior.

## Persistence and migrations

- `0082_creature_evolutions.sql` and its snapshot remain unchanged.
- `0083_creature_evolution_requirements.sql` adds `creature_evolution_paths.requirement_mode` and `creature_evolution_requirements`.
- `0084_race_evolutions.sql` adds `race_evolution_paths` and `race_evolution_requirements`.
- Existing Creature paths default to `unrestricted`, retain their IDs, versions, text, ordering and timestamps, and receive no inferred requirements. No Race paths are inferred from ancestry, Forms or text.
- The two path tables have distinct source/destination foreign keys to their own definition tables. Each requirement table belongs exclusively to its corresponding path table. Public server actions, source fields, preview services and discriminated preview results also distinguish Race from Creature. There is no polymorphic integer foreign key.
- Race paths have stable IDs, names, descriptions, notes, ordering, version and timestamps. Branching and multi-stage chains use exact saved Race identities. Direct self-Evolution is rejected by both validation and a database constraint.

Each requirement has a persisted ID, a path-local stable key, group number, order, type, comparison/value, applicable reference fields and notes. Shared Skill, Item and Race Derived Ability references use restrictive foreign keys. Checks constrain modes, types, nonnegative finite values and row shape; application normalization additionally rejects incompatible/unused fields, duplicate keys/positions and malformed combinations. Malformed saved definitions fail closed during evaluation.

The supported modes are explicit:

- `unrestricted`: no requirement rows; eligible from requirement rules, subject to exact-source and lifecycle checks.
- `requirements`: at least one valid row. All rows in a group are AND; groups are OR. A failed automatic prerequisite defeats manual rows within that group. A passing alternative defeats another group's unresolved manual rows. Otherwise an unresolved potentially qualifying group needs G.O.D. review.

The editor prevents empty groups. Group/row order can change without replacing surviving requirement IDs. Removing every requirement through Unrestricted preserves the path and increments its version.

## Shared and distinct code

`src/features/evolutions/evolution-requirements.ts` shares normalization, grouping, numeric/possession comparisons, manual categories, normalized condition matching and result explanations. It reuses `requirement-primitives.ts`. `evolution-preview-facts.ts` shares the existing inventory availability reader and G.O.D. role gate. The requirements and preview dialogs are shared, with typed Race/Creature action adapters.

Creature and Race persistence services remain distinct so foreign keys and source identities are explicit. Definition-specific preview readers and their public actions remain distinct. Creature reads the current persistent NPC snapshot; Race reads saved Character state and current Race authoring. Neither substitutes one storage model for the other.

## Authoritative facts

| Requirement | Creature Evolution | Race Evolution |
| --- | --- | --- |
| Age | Exact individual's `campaign_character_profile.age` | Exact Character's saved profile age |
| Current Experience | Saved profile `experience` | Same Character field |
| Total Experience | Saved profile `total_experience`, kept separate from current Experience | Same Character field |
| Skill possession/absence | Exact Skill ID in `campaign_creature_npc_profile.current_snapshot_json.skillLinks` | Purchased points greater than zero or an exact current Race Skill grant, matching Character Form Access semantics |
| Numeric Skill prerequisite | Unsupported; authored Creature rank is not purchased Character points | `getCharacterSkillPointsById`: highest stored allocation for the exact Skill ID, excluding racial grants, calculated Rank, tier, Attributes and parent bonuses |
| Creature Ability | Portable canonical ID in the individual's current Normal snapshot abilities | Not offered or accepted |
| Derived Ability | Not offered or accepted | Exact Derived Ability ID with `possessed` from existing `loadCharacterDerivedAbilitiesInTransaction(..., false)` / `resolveCharacterDerivedAbilities`, including saved ownerships, current catalog rules and Campaign systems |
| Item | Exact Item ID available to the Creature itself or its current owning Character, explicitly selected per row | Exact Item ID available to the Character itself |
| Condition present/absent | Unresolved conditions from `readActiveEffectsInTransaction` for the exact NPC | Same Active Effects reader for the exact Character |
| Qualifies for Form | Exact source-scoped Form key and frozen Access rules in the current individual snapshot; `creatureFormAccessContext` supplies Normal snapshot facts | Exact current Race Form key and saved Access rules; the same `characterFormAccessContextFromFacts` used by Character Form Access supplies saved Normal facts |

All numeric comparisons support at least/more than/at most/less than/equal/different. Missing, nonfinite or negative numeric individual facts require review, rather than guessing age, interpreting kill XP as individual Experience or creating progression state. Preview never spends either Experience field.

Creature Ability authoring selects an exact Normal source Ability, using the portable identity convention already used by Form Access. Evaluation inspects current snapshot membership, not current master membership. A G.O.D.'s removal from the individual means it no longer possesses that Ability. The same exact identity rule applies to individual Skill edits. Form-only/projected mechanics do not grant Normal prerequisites. Corrupt snapshots are reported as not eligible with a correction message.

Condition names are compared with Unicode NFKC normalization, trimmed/collapsed whitespace and lowercasing. Resolved conditions do not qualify. No new condition catalog, expiry process or runtime synchronization is introduced.

### Items and custody

Item requirements are positive availability prerequisites: at least one carried, Loose, usable copy. They do not express consumption or an absence rule. They use `readInventoryAccessInTransaction`, `availableLooseQuantity` and `resolveInventoryAvailability`, including actual holder, container/attachment ancestry and custody. Contained/attached copies require retrieval; dropped/lost/stolen/retired copies do not qualify. Invalid availability graphs require review. Equipped Items physically held by a Creature are read from that NPC's inventory. No inventory is initialized, moved, consumed, duplicated or weighed by eligibility.

Creature owner scope resolves the current `owner_character_id` in the same Campaign. No owner cannot satisfy an owner prerequisite; an unavailable archived owner's inventory requires review. Ownership changes affect the next preview's facts without rewriting paths or requirements.

### Forms and manual requirements

Both definition types call the existing `evaluateFormAccess` with the correct Normal context. Race Form Access and Evolution now share a fact-context builder; its semantics are unchanged. Creature preview never substitutes a newly edited master Form for the individual's frozen Form.

G.O.D. approval, story/event, milestone, environment, currently being in a Form and custom requirements are manual categories with required explanatory notes. They return review, not automatic approval. Qualifying for a Form is supported; tracking/activating a current Form is not. No authored Form mechanics are applied to eligibility facts.

## Read-only preview and permissions

The Race preview supports PCs and Race NPCs with the exact path source Race currently saved in their profile. Creature preview accepts persistent Creature NPCs with the exact current `creature_id`. A mismatch is rejected before evaluating requirements; an unrelated individual cannot qualify by matching other prerequisites. Archived source/destination/individual/Campaign blocks readiness, including unrestricted paths.

Each preview uses an enforced PostgreSQL `REPEATABLE READ READ ONLY` transaction. It uses pure readers and the non-locking Derived Ability loader, without `getCharacter`, lazy health/profile initialization or passive reconciliation. Results include owner type, path ID/version, explicit source/destination fields, overall `eligible` / `not-eligible` / `god-review`, and per-group/per-requirement explanations. Results describe saved facts at check time and do not authorize later execution.

Path/requirement actions authenticate through the existing G.O.D./Administrator authoring boundary and apply existing shared-library source permissions. A Player's ownership does not grant library editing. Eligibility and candidate discovery are limited to the Campaign-owning G.O.D., including for PCs; this pass introduces no Player preview and exposes no private NPC facts through companion controls. Administrator library permissions alone do not grant Campaign runtime preview authority.

## Cloning, lifecycle and concurrency

- Creature variant copying gives each path and requirement a new persisted ID. Destination definitions and shared Skill/Item IDs remain unchanged. Normal Ability canonical IDs are remapped through the same map as Form Access. Form keys survive in the newly copied source's owner-local namespace, with independently persisted Form rows.
- Race variants independently copy paths/requirements, retain destination Race and shared Skill/Item/Derived Ability IDs, and scope preserved Form keys to their new source Race. Later parent edits are not inherited; clone edits do not change the parent.
- Master save rejects removal of a Normal Creature Ability or a Race/Creature Form referenced by an outgoing Evolution requirement. The check is in the same source-save transaction, so a failed removal rolls back the whole save.
- Lifecycle lists outgoing paths as owned children and incoming paths as deletion blockers. Deleting an eligible source cascades its own paths/requirements; deleting a destination cannot silently destroy incoming paths. Skill/Item/Derived Ability dependencies are visible in lifecycle and protected by restrictive FKs.
- Archived destinations remain visible on saved paths and may be retained, edited or cloned, but cannot be newly selected or reported ready. New external prerequisites must be active and discoverable; an archived/hidden existing reference may be retained by its existing requirement key and identity. Runtime possession still follows the corresponding existing Character/Creature rules.
- Requirement writes increment the owning path version. Path edits, requirement edits, removal and reorder all verify expected versions. Source locks serialize changes; multi-root path operations retain Pass 1's ascending-ID `FOR NO KEY UPDATE` ordering. Variant source locks conflict with source mutations. Authoring reads load requirement rows, choices and revision in one consistent read-only snapshot.

## Interfaces

Race authoring now has an Evolutions tab with add/edit/reorder/remove and exact destination selection, independent from Forms. Both libraries offer Requirements and Campaign G.O.D. eligibility dialogs. Requirements can be grouped, reordered, removed and saved separately from definition mechanics. Unsaved definition edits disable Evolution mutations. Guidance explains ownership, exact references, purchased points, missing facts, manual review and preview limits.

The interfaces reuse shared semantic appearance variables and GuidedField help. Requirements dialogs retain bounded viewport height, vertical scrolling, flexible button rows and narrow-screen controls; the Race area is outside the archived definition fieldset so retained authoring can still be inspected.

## Verification

Verification evidence is recorded under ignored `artifacts/guidance/evolution-pass-two` and `artifacts/guidance/creature-evolutions`.

- Relevant unit suites: 561 passed (Evolutions, Creature/Race rules, Forms, NPCs, Active Effects, inventory, lifecycle, catalog and shared-library authorization).
- Disposable database suites: existing Creature Evolutions 9; new Pass 2 9; Race Forms 10, Form mechanics 11, Form preview/access 13; Creature Forms 21; Ownership Pass 1 6; Ownership Pass 2/commerce/equipment/Item use 16; lifecycle 2.
- Catalog/shared-library disposable suite: 33 tests, including existing migration/classification/authorization behavior.
- Fresh chain through 0084 and populated forward upgrade from already-applied 0082: existing path identity/version/text/timestamps preserved and all 185 pre-existing non-Evolution public tables unchanged. No inferred requirements or Race paths.
- Preview tests compare every public table before/after, including snapshots, profiles, owner, equipment, health/effects and encounter data. Tests cover permissions, stale/concurrent writes, exact-source rejection, independent clone identities/remapping, reference removal protection, Form qualification and archive behavior.

- Real Chrome UI: Creature path add/edit/reorder/remove, exact variants, archive retention, Race path add/reorder/remove, both requirement editors with AND/OR groups and saved reload, both Campaign G.O.D. previews, and viewport/scroll bounds at 1365px and 390px. Shared theme behavior verified; screenshots inspected. No browser page errors.
- Production Next build passed against the disposable database; TypeScript completed and all routes generated. Standalone `npm.cmd run typecheck` passed.
- Changed-file ESLint passed without warnings. Drizzle metadata check and `git diff --check` passed; migration 0082 SQL/snapshot have no diff.
- Browser coverage is Chrome automation, not Firefox/Safari, a physical phone, or human gameplay acceptance. No runtime Evolution or encounter execution was tested because none was added.

Reproduction commands (disposable scripts explicitly guard their temporary database targets):

```powershell
node --import tsx scripts/creature-evolution-disposable.test.ts --browser --build
node --import tsx scripts/catalog-visibility-disposable-db.test.ts
node --import ./scripts/register-test-css.mjs --import tsx --test src/features/evolutions/*.test.ts src/features/creatures/*.test.ts src/features/races/*.test.ts src/features/forms/*.test.ts src/features/npcs/*.test.ts src/features/active-state/*.test.ts src/features/items/*.test.ts src/features/lifecycle/*.test.ts src/features/catalog-visibility/*.test.ts src/features/authorization/shared-library-access.test.ts
npm.cmd run typecheck
npx.cmd drizzle-kit check
git diff --check
```

## Changed file groups

- Schema: `drizzle.config.ts`, the two new SQL migrations and snapshots/journal, `src/db/creature-schema.ts`, `creature-evolution-schema.ts`, `race-evolution-schema.ts`.
- Shared domain: `src/features/evolutions/evolution-requirements.ts`, `evolution-preview-facts.ts`, and shared Character Form Access context in `src/features/forms/form-access-context.ts`.
- Creature domain: existing `creature-evolutions.ts` / `creature-evolution-service.ts`, new `evolution-requirement-service.ts`, `evolution-eligibility-service.ts`, and the Creature-facing evaluator wrapper.
- Race domain: `race-evolutions.ts`, `race-evolution-service.ts`, `evolution-requirement-service.ts`, `evolution-eligibility-service.ts`, and variant cloning integration.
- UI/actions: shared `src/app/heavens/evolution-requirements-editor.tsx`, Creature and Race Evolution actions/editors, both definition save actions, and Race workspace tab.
- Supporting integration: lifecycle dependency lists and page help.
- Verification: `src/features/evolutions/evolution-requirements.test.ts`, `scripts/evolution-pass-two-db.test.mjs`, and expanded existing Evolution disposable/browser harnesses. This report records the implementation and rollout boundary.

## DEV and production status

Read-only audit on 2026-09-28: both `serrian_tide_dev` and `serrian_tide_prod` contain 83 ledger entries through 0082. Each database's 0082 hash matches the unchanged repository migration. Neither has 0083 or 0084, the new requirements tables, or the new Creature path mode column.

No DEV/production migrations or data changes were performed. The code requires both forward migrations before it is served against either database. After selecting and verifying the intended `DATABASE_URL`, the repository migration command is:

```powershell
npx.cmd drizzle-kit migrate
```

Apply separately to DEV and production during their authorized rollout; this uses the journal to apply 0083 then 0084. Do not rewrite/reapply 0082 or use schema push in place of the recorded migrations. The local config loads `.env.local`; an explicitly set `DATABASE_URL` takes precedence, so verify the active target before invoking the command.

## Pass 3 considerations

Execution must be newly authorized. It must lock/revalidate the current exact individual/source, path version, destination lifecycle, requirements and relevant mutable facts. Manual review is not stored approval. Preserve persistent Character/NPC identity, ownership, name, history, inventory and appropriate active state while reconciling a newly selected Race or Creature definition. Author explicit HP/anatomy/state translation rules; do not interpret this preview as permission to recreate, fully heal, spend XP/Items or activate Forms. Runtime Form tracking remains a separate future project.
