# PASS 3 — NATURAL VS WORN PROTECTION

Base: `9a446111ff497cee219d9cf4465a2764deebb7f6`. Passes 1 and 2 are accepted enough to proceed; this report covers Pass 3 only.

## Result

The shared server reader can report worn, natural and temporary protection for an exact target and hit location without combining the layers or changing damage resolution. See the [protection contract](../architecture/protection-layers.md).

| Target/source | Authoritative data | Projection |
| --- | --- | --- |
| Direct Creature | Exact encounter snapshot anatomy | Natural Armor/Soak per snapshot location; no worn layer |
| Normal Character / Race NPC | Current assigned Race relationship | Each Race protection definition and coverage, resolved live |
| Creature NPC | Current individual Creature snapshot | Creature natural protection alongside separately read worn armor |
| Worn armor | Existing ownership, Worn state, armor profiles and coverage | Item/copy/quantity, base Soak and unexecuted damage-type metadata |
| Temporary / other | Active Character modifiers or direct Creature occurrence-local modifiers | Individual active Soak amounts, labels, sources, durations and lifecycle records |

`readProtectionLayersInTransaction` is an internal server-only read helper for already authorized callers. Encounter reads verify Campaign/Encounter membership. `ProtectionLayers` retains readable locations and separate `worn`, `natural`, and `temporary` source arrays; `protectionAtLocation` filters them independently. There is no combined Armor 8 result or new total. Existing combat display is unchanged.

## Race model and migration

Migration `0063_race_natural_protection.sql` adds `race_natural_protections` and `race_natural_protection_locations`, with Race/definition foreign keys, cascading child cleanup, stable per-Race definition keys, nonnegative finite amount checks, coverage checks, order checks and location uniqueness. No existing table is altered and no values are backfilled.

Race → Mechanics now orders Attribute Caps, Movement, Natural Protection, Racial Interaction Rules. Entries contain Protection Name, Natural Armor, Natural Soak and All / Selected coverage. Selected locations use the existing ten humanoid location keys with readable labels. Multiple entries and no entries are both supported. The shared Creature master/NPC field terminology is Natural Armor / Natural Soak; stored `naturalArmor` and `soak` remain unchanged.

## Compatibility and decisions for review

- **Race changes:** use the authoritative assigned Race live. Existing Race mechanics already follow this relationship, so no new Character snapshot/copy is introduced. Editing or changing the assigned Race changes subsequent projections. An archived but still assigned Race continues to supply its existing mechanics.
- **Overlapping protections and armor quantities:** preserve each source independently. Pass 3 chooses no stacking, summing or multiplication rule.
- **Creature blanks/older snapshots:** retain original null fields and use the established blank-as-none numeric interpretation. Invalid old values remain unresolved with an issue. Snapshot schemas, immutable baselines and direct occurrence anatomy are unchanged.
- **Active modifiers from Items/spells:** classify them as temporary/other unless authoritative layer metadata exists. Preserve source details and negative amounts; exclude ended/expired records. Unknown coverage stays unresolved.
- **Older Race callers:** omitted `naturalProtections` preserves saved definitions; an explicit empty list removes them. Stable keys preserve definition identity across edits.
- **Coverage:** Race definitions use exact existing locations; All covers the current humanoid anatomy. Worn armor keeps its authored coverage keys. Creature natural protection follows exact snapshot anatomy, including nonhumanoid names. No text parsing or new anatomy model.
- **NPC ownership preservation:** final review found that an NPC save blanket-deleted owned stacks and reinserted them, cascading away Worn state. Retained stacks now upsert in place; only explicitly removed stacks are deleted. Existing authorization, locking, active-quantity guards and passive reconciliation remain unchanged. The browser regression verifies Natural Soak edits preserve Worn Armor and active Soak modifiers. This is a persistence correction needed to keep natural and worn protection together, not a damage-rule change.

## Validation

- **1,441/1,441 feature tests across 170 files pass**, including nine new protection/Race validation tests and the existing Character, Creature/NPC, equipment, active-state and snapshot tests. Only the migration inventory test changed an existing expectation: the new migration is appended; combat expectations are unchanged.
- **19/19 existing combat damage service tests pass** in a disposable PostgreSQL cluster. These run unchanged and cover ordinary attacks, armor/Soak, weapon effects, rulings, damage modifiers and related consequence safeguards.
- The expanded **disposable migration/authenticated browser suite** validates Race save/load with no protection, multiple definitions, readable/selected coverage, rejected empty selected coverage, 390-pixel mobile controls/save/reload, Character Race inheritance and live edits/reassignment, exact worn/natural/temporary values, direct Creature local modifiers/expiry, snapshot compatibility/preservation, NPC protection editing with Worn-state retention, immutable baseline/master protection, stable Race definition IDs, database checks and unchanged ordinary damage output. The prior Creature/Race lifecycle, variants, Use Conditions and authoring tests remain included.
- **TypeScript, changed-file lint, Drizzle consistency checks, schema snapshot comparison, production build and diff checks pass.** The schema comparison confirms every pre-existing table definition is unchanged and exactly two tables were added.
- Mobile screenshot reviewed: `artifacts/creature-authoring/race-natural-protection-phone.png`. Validation logs: `pass3-unit.log`, `pass3-browser.log`, `pass3-damage.log`, `pass3-build.log` under `artifacts/creature-authoring/`. Initial browser runs corrected test fixture/locator omissions and found the Coverage accessible-label issue, which was fixed. Automated checks do not replace Brannan's review.

Migration applied only to loopback DEV after a verified full backup. **All 64 migration hashes match; all 158 existing public table row counts/digests are unchanged; both new tables are empty.** No Race protection values or other catalog/Character records were backfilled. The full dump was decoded successfully, without a restore rehearsal. Backup: `C:\Users\birev\AppData\Local\Temp\serrian-before-natural-protection-AcMQlM\serrian_tide_dev.dump`; evidence: `artifacts/creature-authoring/pass3-dev-migration.json`.

## Exact files changed

```text
COMBAT-RESUME.md
docs/architecture/protection-layers.md
docs/reports/protection-layers-pass-3-2026-09-20.md
drizzle/0063_race_natural_protection.sql
drizzle/meta/0063_snapshot.json
drizzle/meta/_journal.json
scripts/apply-natural-protection-dev-migration.mjs
scripts/creature-authoring-browser.test.ts
scripts/creature-authoring-disposable.test.ts
scripts/protection-layer-checks.ts
src/app/heavens/creatures/creature-workspace.tsx
src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx
src/app/heavens/npcs/actions.ts
src/app/heavens/races/actions.ts
src/app/heavens/races/race-natural-protection-editor.module.css
src/app/heavens/races/race-natural-protection-editor.tsx
src/app/heavens/races/race-workspace.tsx
src/db/race-schema.ts
src/features/characters/firearm-baseline-migration.test.ts
src/features/protection/protection-layers.test.ts
src/features/protection/protection-layers.ts
src/features/protection/protection-service.ts
src/features/races/race-natural-protection-service.ts
src/features/races/race-natural-protection.test.ts
src/features/races/race-natural-protection.ts
```

## Boundaries

Final damage math and every existing damage read path are unchanged. No compatibility adapter is needed because no old read is replaced. Race and newly exposed Creature NPC natural protection do not begin reducing damage in this pass. Existing ordinary, firearm, spell, Creature Attack, Item Ability, Mechanical Effect and ActionEffectPlan behavior remains in place.

Interaction Rules still do **not** execute: no Requirement, Immunity, Resistance, Vulnerability, Absorption, Silver or Magical qualification behavior. The approved future order and the rule that absorbed healing is not reduced by natural/temporary protection are documented only. No Event/State/Equipment runtime integration. **Pass 4 has not started. Stop after this commit for review.** No push or deployment.
