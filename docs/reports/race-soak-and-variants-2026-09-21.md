# Race cleanup and independent variants — 21 September 2026

This implements Brannan's focused changes in the existing Serrian Tide repository. The current Race authoring, Character rules, Skills, Quirks and Interaction Rules remain the working architecture.

## Changes

- Race Natural Protection now authors **Protection Name, Soak and Coverage**. Multiple definitions and whole-body/selected-location coverage remain supported. The existing `natural_soak` column is authoritative; `natural_armor` is removed from Race storage, validation, readers and the Race runtime projection.
- The shared incoming-effect resolver subtracts Race Soak once. It does not execute an obsolete Race Armor value, even if supplied in an old input object. Creature snapshot Armor/Soak, Worn Armor, temporary Soak, Interaction Rule order and historical stored outcomes retain their established behavior.
- **Base Magic** moved from Overview into Mechanics, with the Mana multiplier explanation. Movement rows now visibly label **Movement Mode, Base Movement and Notes**. All eight Size categories, six normal Attribute caps, Overview, Quirk, Skills & Abilities, Culture & Play, Preview and existing lore remain intact.
- A **Variants** tab follows the Item copy-on-create workflow. It provides Variant Name, Clone as Variant, direct-child links, a source-Race link and archived labels. A new draft must be saved first. Dirty clone/navigation requests offer Keep Editing or explicit discard; cloning after discard copies the last saved definition. Concurrent UI operations are gated while save/load/clone runs.

## Migration and current data

`0064_race_soak_and_variants.sql`:

1. Drops `race_natural_protections.natural_armor` and updates its amount constraint to validate only finite, nonnegative `natural_soak`.
2. Adds nullable `races.parent_race_id`, a self-referencing `ON DELETE RESTRICT` foreign key, an index and a no-self-parent check.
3. Does not update, seed or infer any Race relationships. Existing Race parents remain null. Soak is neither converted nor added to Armor.

The read-only preflight inspected **56 Races and one Natural Protection row** in loopback `serrian_tide_dev`:

| Race | Protection | Old Armor discarded | Soak retained | Coverage |
| --- | --- | ---: | ---: | --- |
| Black Naga Orang (Race 52) | Natural Armor (entry 1; authored name preserved) | 2 | 2 | All locations |

This intentionally changes that Race's natural reduction from the old two-part 2 + 2 to **Soak 2**. No conversion, compensation or Character data change was made.

Migration 0064 was applied to **local DEV only** after disposable validation. All 65 migration entries match their file hashes. All six Race-owned tables were compared before and after: every existing value is unchanged except the removed Armor field and the new null parent field. No variants were created in DEV.

The guarded helper `scripts/apply-race-cleanup-dev-migration.mjs --apply` verifies the expected database and migration history, snapshots the Race tables, applies the seven migration statements in one transaction and validates the exact allowed changes before commit. It refuses a different migration state. Local evidence is ignored by Git:

- `artifacts/race-authoring/before-0064-1790012676716.json` — pre-migration Race table snapshot, including the discarded value.
- `artifacts/race-authoring/dev-migration.json` — verified counts and transformation result.

Other installations need the normal Drizzle migration before running the new application code, followed by their usual production build/restart. No home/production server was accessed or deployed.

## Exact variant behavior

The authorized server action passes the authenticated user to a server-only transaction that re-reads current roles and applies the existing shared-library ownership policy. It locks the saved source Race while copying; normal Race saves lock the same root before modifying children.

The new record receives a fresh Race ID, its chosen name, a fixed `parent_race_id`, the cloning user as creator, fresh timestamps and active lifecycle state. Source/import identifiers are cleared, matching Item semantics. The normal save action cannot create or change parentage.

All current authored core fields are copied, including Size, Base Magic, age, physical descriptions, legacy description, Quirk narratives, languages, archetypes, genre examples, culture, magic outlook and Interaction Rule JSON. Caps, movement, Skill/Ability link rows, protection definitions and coverage rows are copied with independent database identities. Existing Skill IDs remain links to the same shared Skills. Race-local protection/rule keys remain meaningful within their new owning Race; they do not share mutable records.

The parent/child relationship records provenance only. Later edits and archive/restore operations do not propagate in either direction. Variants may themselves be cloned; the tab lists only direct children. Character Creation and protection readers continue using the selected Race's own definition and never resolve a parent chain.

Lifecycle preview lists child variants as deletion blockers, and the FK enforces that restriction. An unreferenced leaf variant can be deleted through existing lifecycle policy; its owned definitions cascade normally while its parent remains intact. Protected imported/canonical source rules remain unchanged. An archived Race must be restored before cloning.

## Mechanics audit

- **Size:** Race/Character paths do not call Creature Size scaling. Tests exercise all eight categories with unchanged Attribute-derived Skill ranks, caps, movement and Mana. Creature Size scaling remains intact and is covered separately.
- **Attribute caps:** continue to limit Character purchases/reach through the existing checks; no minimums, bonuses, penalties or alternative Attributes were added. Six authored caps survive real Race save/reload and variant cloning.
- **Base Magic:** the existing calculation already uses `sourceSkillPoints * effectiveBaseMagic`; 5 × 3 = 15. Existing Quintessence advancement costs 25 Q for a +0.25 step. Player saves retain authoritative stored advancement steps. The existing G.O.D. administrative correction controls were not redesigned; no new advancement path was introduced. No calculation correction was needed.
- **Skills/Quirks/Interaction Rules:** no redesign. Skill identity, eligibility, classification, hierarchy and Character calculations are unchanged. Quirks remain narrative. Interaction Rules are copied intact and retain current resolution behavior.

## Validation

- **120** focused Race, protection and incoming-effect unit tests passed, including stale Armor rejection as executable input, single subtraction, whole-body and selected coverage, unchanged Creature/Worn behavior, exact rounding and existing Interaction Rule boundaries.
- **36** Character creation/Base Magic/Quintessence tests passed. The enhanced all-Size test also confirms unchanged Attribute-derived ranks and the exact 5 × 3 Mana example.
- **14** lifecycle/schema regression tests and **38** Creature authoring/Size tests passed.
- `npm run validate:race-authoring` passed in a fresh disposable PostgreSQL cluster: pre-0064 migration preservation, independent variants/child IDs, permission rejection, lifecycle/FK protection, creator/source identity, real Character protection reads and authenticated desktop/390px browser workflows.
- That harness also ran **116** existing incoming-target, Pass 5 and Pass 6 runtime service tests successfully. Fixtures now author Race Soak directly; Creature fixture values and expected behavior remain unchanged.
- The existing disposable Creature/Race/NPC authoring compatibility suite passed after updating its Race column/label expectations. Master authoring, NPC edits, direct encounter snapshots, legacy preservation, archive/restore, Creature variants and desktop/phone layouts remain compatible; its browser result records `passed: true` with no JavaScript errors.
- TypeScript, changed-file ESLint, Drizzle metadata checks and production build passed. The build used an isolated output directory; the initial sandbox could not fetch the existing Google Fonts, and the permitted rerun succeeded.
- Browser checks found no JavaScript errors or horizontal overflow; desktop/phone screenshots were inspected. Test-owned databases and servers are disposed; no synthetic records were written to DEV.

This is automated validation, not human tabletop acceptance. Full unrelated application suites and a general combat rewrite were outside this task.

## Remaining tabletop decision

If multiple Natural Protection definitions cover the same hit location, the existing resolver still requires a G.O.D. ruling: no stacking or selection rule has been approved. This pass preserves that boundary rather than choosing addition, maximum Soak or another rule. Brannan and Ember can settle it separately. There are no new unresolved rules introduced by clone-as-variant or the field cleanup.
