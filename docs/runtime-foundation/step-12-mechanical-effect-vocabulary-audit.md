# Runtime Foundation Step 12 — Mechanical Effect Vocabulary Audit

## Decision

The current shared vocabulary remains sufficient for every consequence that the current Runtime Foundation can execute objectively:

```text
health.damage
health.heal
condition.apply
modifier.apply
manual
```

No new Mechanical Effect kind is approved. `MECHANICAL_EFFECT_SCHEMA_VERSION` remains `2`.

Manual is the correct tabletop-aid result whenever a mechanic still requires a hit, resistance, timing, position, state taxonomy, or narrative decision. This audit does not parse or convert legacy text.

## Sources reviewed

- Item canon: all 1,007 checked-in Items and all 16 Item rules in `serrian-tide-item-seed.json`, plus the activated/passive Item authoring and runtime contracts.
- Spell construction: all 62 construction rules (4 containers, 30 effects, 8 ranges, 5 shapes, 4 durations, 1 Multi-Target rule, and 10 modifiers), plus 5 mastery bands and all 371 checked-in Spell records.
- Creature canon: all 45 checked-in Creature Ability definitions in `serrian-tide-creature-seed.json`.
- Shared runtime: Active Health, Active Mana, Active Conditions, Temporary Modifiers, Item Charges, Equipment State, Item Use, Spell Cast, Creature Ability Use, and the common persistence bridge.

The audit read checked-in/local source artifacts only. Database-authored runtime definitions were not queried because the database is deliberately out of scope until Step 13.

## Recurrence summary

Structured Spell effect occurrences provide the largest comparable source sample:

| Rule family | Occurrences |
| --- | ---: |
| Buff / Debuff | 113 / 125 |
| Damage / Healing | 92 / 28 |
| Immobilize / Grapple / Anchor | 41 / 30 / 18 |
| Knockdown / Stun | 18 / 18 |
| Push / Pull | 10 / 10 |
| Accelerate / Decelerate | 14 / 26 |
| Counter/Cancel | 20 |
| Transfer Life Force | 7 |
| Transform/Alter | 26 |
| Reveal/Detect / Illusion | 36 / 39 |

The Item seed contains 10 healing/restorative names, 1 Mana Potion, 9 poison/toxin/condition-related entries, 14 charge/recharge mentions, and 4 stun/blind entries. These records are descriptive catalog definitions, not complete structured runtime consequences. The one Mana Potion supplies neither a numeric amount nor a target Mana system.

Creature Ability recurrence includes 5 Incorporeal Forms, 4 Elemental Forms, at least 4 Construct/Stone forms, 4 venom riders, 2 flight-gating Abilities, 2 contact/aura fire Abilities, 2 rebirth/regrowth Abilities, and 2 multi-limb/head action-economy Abilities. Eleven Abilities explicitly depend on a successful attack, perception/hearing prerequisite, resistance, or another unresolved outcome.

## Candidate decisions

| Candidate mechanic | Observed sources/examples | Frequency / recurrence | Existing state owner | Objective after selections? | Future combat/session dependency? | Decision | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Direct Health change | Item healing entries; Spell Damage 92 and Healing 28; Creature burning/drain descriptions | High, cross-source | Active Health | Yes when amount and anatomy/application are structured | No | Already represented | `health.damage` and `health.heal` own this exactly. Legacy prose is not an amount definition. |
| Named ongoing state | Poison, fear, blind, stun, prone, curse | High, cross-source | Active Conditions | Yes only when the author explicitly chooses a name and duration | No automatic ticking | Already represented | `condition.apply` records the named state without inventing hidden mechanics. Source prerequisites remain Manual. |
| Explicit additive numeric change | Spell Buff 113, Debuff 125, Accelerate 14, Decelerate 26; Item passives | High, cross-source | Temporary Modifiers | Yes only with channel, target key, amount, and duration | No automatic ticking | Already represented | `modifier.apply` supports attribute, skill, movement, initiative, soak, and damage. Generic Spell rules do not structurally select one channel. |
| Interpretive instruction | Every source includes unresolved prose | High, cross-source | None required | Yes as an instruction, not an automatic mutation | No | Already represented | `manual` is first-class and intentionally preserves G.O.D. adjudication. |
| Mana restoration | One descriptive Mana Potion; no objective Spell or Creature Ability restoration | One Item name; zero complete structured sources | Active Mana | No: amount and Mana system are absent | No | Remain Manual; do not add | Possibility alone is insufficient. The current source does not define `Restore X Mana` or a fixed/selected system contract. |
| Target Mana drain/spend | No current objective source definition | None | Active Mana | No | No | Remain Manual; do not add | Casting cost already belongs to Spell runtime. No target-drain effect is presently structured. |
| Resolve selected Condition | Anti-Poison Serum; Cleansing Aegis; Metabolic Purge | Recurring concept, but no canonical taxonomy | Active Conditions | No: poison/curse/fatigue identity is prose and Cleansing Aegis requires G.O.D. parity judgment | No | Remain Manual; do not add | A human could select a row, but current source cannot prove that the selected arbitrary Condition satisfies the source category. No cure-specific kinds are justified. |
| End selected Temporary Modifier | Counter/Cancel occurs 20 times | Recurring Spell rule | Active Modifiers | No: “magical effect” is broader than a Modifier and lacks exact effect identity/type semantics | No | Remain Manual; do not add | There is no persisted ongoing Spell entity and no objective mapping from Counter/Cancel to one Modifier row. |
| Restore Item Charges | 14 Item charge/recharge mentions, including Solar Charger and batteries | Recurring bookkeeping vocabulary, not a cross-source effect | Item instance Charges | Sometimes numeric, but commonly tied to devices, sunlight/day, or normal recharge | Often requires time progression | Remain direct bookkeeping / Manual | Step 10 already owns controlled Charge correction/recharge. No current cross-source Mechanical Effect requires it. |
| Equipment state mutation | Wield/wear/equip choices; Disarm rule 3 occurrences | Recurring | Equipment State | Normal choices yes; forced changes no because success/resistance is unresolved | Attack/combat dependency for forced changes | Remain direct choice / Manual | Ordinary equipment choices are not source effects. Disarm belongs to later attack/combat resolution. |
| Forced or compelled movement | Push 10, Pull 10, Siren song, luring, telekinesis | Recurring, cross-source | No position owner | No | Map/position and resistance | Remain Manual | Numeric movement modifiers are supported; spatial displacement is not. |
| Grapple, immobilize, prone, stun, disarm | 41 Immobilize, 30 Grapple, 18 Knockdown, 18 Stun, 3 Disarm | High in Spells | Conditions can label results but do not own action/relationship mechanics | No: saves, relationships, action loss, or equipment consequences remain unresolved | Combat/action economy | Remain Manual | Do not turn a rule name into hidden state mechanics. An author may explicitly apply a descriptive Condition after the prerequisite is resolved. |
| Ongoing, aura, or contact Damage | Spell round-based/terrain effects; Phoenix Fiery Form; Fire Elemental Burning Presence | Recurring | Active Health owns each discrete application, not timing | No automatic schedule | Tick/round/position infrastructure | Remain Manual | The G.O.D. may apply explicit Damage at the correct moment. No tick engine is created. |
| Form/anatomy transformation and immunities | Incorporeal 5, Elemental 4, Construct/Stone 4+, Amorphous/Rooted/Flexible forms | High in Creature Abilities | Creature current snapshot anatomy is authoritative but not runtime-transformable | No | Form/anatomy state and interaction rules | Remain Manual | Current anatomy is a snapshot. Descriptive traits must not rewrite it or invent immunity rules. |
| Detection, concealment, and senses | Reveal 36, Illusion 39, camouflage, stillness, vibration sense | High, cross-source | No perception/visibility graph | Only explicit numeric roll modifiers are objective | Visibility/sensory and often position state | Existing Modifier when explicitly authored; otherwise Manual | No hidden sensory engine or prose inference. |
| Regeneration, rebirth, death, changing anatomy | Phoenix Rebirth; Hydra Head Regrowth; recurring Spell regeneration prose | Recurring concept | Health lacks authoritative death/timing/form state | No | Death, time, and anatomy lifecycle | Remain Manual | Health restoration can be applied explicitly, but triggers and timing cannot be automated. |
| Multi-limb/head action economy | Giant Squid grasp; Hydra heads | Two Creature Abilities | No action-counter owner | No | Initiative/action economy | Remain Manual | Tabletop Operations must define action availability before any counter exists. |
| Transfer Life Force | Spell rule occurs 7 times | Recurring Spell-only structured rule | Active Health | No: direction, paired subjects, allocation, and prerequisite semantics are incomplete | May depend on target grouping and resistance | Remain Manual | Separate explicit Damage and Healing can be authored when the G.O.D. knows the outcome; no compound transfer kind is justified. |
| Counter/Cancel broadly | Spell rule occurs 20 times | Recurring | No generic “ongoing magical effect” owner | No | Sometimes casting/opposed-resolution infrastructure | Remain Manual | Conditions, Modifiers, equipment passives, and whole Spells are not interchangeable state rows. |

## Adapter and runtime consequences

- Items retain the five current activated effect kinds. Passive Items remain limited to Condition, Modifier, and Manual effects that are meaningful while equipment state is active.
- Spells continue adapting only structured Damage and configured Healing automatically. Generic Buff/Debuff, all Control effects, Counter/Cancel, Transfer Life Force, Teleport, Transform, Summon, and other interpretive rules remain Manual.
- Creature Abilities continue using author-authored structured effects. All 45 legacy Ability definitions keep the Step 11 one-Manual-effect compatibility fallback.
- The common bridge remains the only automatic executor for Item Use, Spell Cast, Creature Ability Use, passive Item reconciliation, and G.O.D. Active State controls.
- No canon data is rewritten and no source text is parsed.

## Step 13 schema-change inventory

This inventory is derived from the current Drizzle schema, the preserved `0000_serrian_tide_baseline.sql`, the preserved experimental `0001_persistent_active_health.sql`, and the current schema diff. Step 12 adds no Drizzle schema change.

### Present after `0000` and represented by preserved `0001`

1. `campaign_character_profile`
   - New `base_movement_steps integer NOT NULL DEFAULT 0`.
   - New `base_magic_steps integer NOT NULL DEFAULT 0`.
   - Nonnegative check constraint for each new column.
2. `campaign_character_active_health`
   - New table: Character PK/FK with cascade, `total_damage` default `0`, timestamps, and nonnegative Damage check.
3. `campaign_character_active_health_pool`
   - New table: composite Character/Pool PK, cascade FK to Active Health, Pool identity snapshot, Damage default `0`, timestamps.
   - Character/Damage index and nonblank Pool key/name plus nonnegative Damage checks.
4. `campaign_character_injury`
   - New table: serial PK, cascade FK to Active Health, Pool/location snapshots, name/notes, optional Damage, resolution state/timestamp, timestamps.
   - Character/resolution/creation and Character/Pool indexes.
   - Pool/name, location range, Damage, and resolution-consistency checks.

### Present in current schema but absent from both preserved `0000` and `0001`

1. Runtime Foundation Step 2 — Item runtime definitions
   - `item.is_magical boolean NOT NULL DEFAULT false`.
   - New `item_runtime_profiles`: Item PK/FK cascade; use mode, quantity/Charge fields, recharge/activation/use notes, timestamps; mode, label, and mutually valid field-combination checks.
   - New `item_effects`: serial PK, Item FK cascade, schema version, JSONB effect, deterministic order, timestamps; unique Item/order, Item index, version/order/JSON-object checks.
2. Runtime Foundation Steps 3 and 10 — owned Item instances and Charges
   - New `campaign_character_item_instance`: serial PK; Character FK cascade; Item FK restrict; `current_charges`; unit cost; acquired/created/updated timestamps.
   - Character/Item and Item/Character indexes; nonnegative Charges and cost checks.
   - Step 10 requires no additional table beyond the instance Charge state already present.
3. Runtime Foundation Step 5 — Active Mana
   - New `campaign_character_active_mana`: Character/System composite PK, Character FK cascade, `mana_spent` default `0`, timestamps.
   - System/Character index; supported-system and nonnegative-spent checks.
4. Runtime Foundation Step 8 — Active Conditions and Temporary Modifiers
   - New `campaign_character_active_condition`: serial PK; Character FK cascade; descriptive state; immutable source snapshot; optional stable source-effect key; duration snapshot; resolution state/note.
   - Character/resolution/creation index and name/source/duration validity checks.
   - New `campaign_character_active_modifier`: serial PK; Character FK cascade; label, channel, target key, nonzero amount; source snapshot; duration snapshot; ending state/note.
   - Character/ended/channel/target index and label/channel/target/amount/source/duration checks.
5. Runtime Foundation Step 9 — Equipment State and passive Item effects
   - New `item_passive_effects`: serial PK, Item FK cascade, required equipment state, versioned JSONB effect, order, timestamps; Item/order index and state/version/order/JSON checks.
   - New `campaign_character_item_equipment_state`: Character/Item/state composite PK; composite ownership FK to `campaign_character_item` with cascade; quantity and updated timestamp.
   - Item/Character index and state/positive-quantity checks.
   - `campaign_character_item_instance.equipment_state text NOT NULL DEFAULT 'inactive'` plus allowed-state check.
6. Runtime Foundation Step 11 — Creature Ability effects
   - New `creature_ability_effects`: serial PK, Ability FK cascade, stable effect key, schema version, JSONB effect, deterministic order, timestamps.
   - Unique Ability/key and Ability/order constraints; Ability index; nonblank-key, positive-version, and nonnegative-order checks.

### Runtime Foundation steps with no relational schema delta

- Step 1 Mechanical Effects core.
- Step 4 Item Use runtime.
- Step 6 Spell adapter.
- Step 7 real Spell casting.
- Step 12 vocabulary audit.

Step 13 must reconcile the preserved experimental migration with every currently unrepresented schema change above. This document does not generate, edit, apply, or squash any migration.
