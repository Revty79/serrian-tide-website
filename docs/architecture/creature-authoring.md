# Creature Attack and Ability authoring

Step 1 adds authoring metadata. It does not connect new timing, activation, magic, On-Hit Effects, or protections to combat execution.

## Storage and compatibility

Migration `0061_creature_authoring.sql` adds nullable `authoring_json` columns to `creature_attacks` and `creature_abilities`. Each configured profile has `schemaVersion: 1`; SQL checks reject non-object or unsupported envelopes. Server normalizers validate their contents. Existing rows remain `NULL`; no legacy mechanics are inferred, converted, or deleted.

Profiles live on their owning records, using typed JSON rather than a duplicate family of mechanical-effect, spell, condition, or resource tables. This also fits the existing immutable Creature snapshot representation and attack replacement-on-save behavior. Ordered attack effect entries carry the same stable `effectKey`, mechanical `schemaVersion`, effect payload, and `sortOrder` as existing Creature Ability Effects. Ability Effects continue to use `creature_ability_effects`.

The Creature editor, NPC template loader, and direct encounter loader select the new columns. Snapshot construction deep-copies profiles and effects. NPC parsing accepts old snapshots without the fields; saving an individual validates the new fields through the existing snapshot normalization boundary. Baseline snapshots remain immutable. Existing authorization, ownership, lifecycle, canonical IDs, and transactions remain in charge.

## Attack profiles

- `initiativeCost`: nullable, positive authored cost (greater than zero). Blank means not authored; zero and negative values are invalid. Combat continues to use its pre-existing timing contract and fallback.
- `mode`: nullable `melee`, `ranged`, `hybrid`, or `aoe`. Names, legacy ranges, and Creature type never choose a mode.
- `range`: Weapon-compatible `unit`, `reach`, `short`, `medium`, and `long`. The Weapon range validator handles positive distances, normalized units, and ascending bands; Creature validation also checks Short against Long when Medium is blank. Incomplete profiles may be saved for later authoring. Reach is optional and is never a required target-distance input.
- `magical`: `true`, `false`, or `null` (unspecified). An attached Spell Construction authoritatively makes the source magical. Explicit `false` with a construction is rejected. Neither names nor Ability Origin grant magic.
- `onHitEffects`: ordered Mechanical Effects, intended to follow a successful hit automatically in a later integration step. They create no standalone Ability or extra activation. Unsupported behavior belongs in a Manual effect or the retained Special Effect text.
- `magic`: optional shared `SpellDocument`. The shared editor, calculator, and mechanical-effect adapter provide authoring and previews; incomplete constructions remain editable drafts. No new casting engine is introduced.

Attack %, damage, damage type, anatomy, requirements, uses/recharge, Special Effect, Range / Reach text, and notes retain their existing storage and meaning. Bestiary damage is authored as the complete base amount; this step adds no STR/DEX damage modifiers and changes no Character/NPC damage rules.

## Trait and Ability profiles

Activation types reuse Derived Ability values: `passive`, `activated`, `triggered`, and `reaction`, plus unspecified for old records. Initiative, resource costs, use limits, and use conditions are authoring metadata; they do not create new charge, cooldown, event-listener, or passive-synchronization state.

- Passive authoring rejects activation Initiative, resource costs, and activation rolls. Choosing Passive in the editor clears these activation-only values. Conditions remain available.
- Activated, Triggered, and Reaction authoring supports optional positive Initiative (greater than zero), Derived Ability resource cost rows, use limits/refresh scopes, and use conditions. Blank Initiative remains unauthored; no default is inferred, and zero and negative values are invalid.
- Conditions reuse `equipment`, `event`, `state`, and `manual`, including the existing key/operator/value/notes contract. No new trigger expression language or inferred events are added.
- Resolution reuses the existing automatic, fixed-roll, and manual concepts. Fixed-roll targets require a percentage from 1 through 100 inclusive; blank targets in Fixed Roll mode, zero, negative values, and values above 100 are invalid. Targeting notes remain descriptive; complex targeting uses the attached shared Spell Construction.
- The existing `ability_type` column is displayed as **Origin**, with Natural, Supernatural, Elemental, and Construct choices. An existing unknown value remains a selectable legacy option.
- Existing Mechanical Notes and Activation Notes remain descriptive text. Existing structured Ability Effects retain their current behavior. New activation metadata does not change the existing Ability use service.

## Editor organization

Both Creature and Creature NPC editors share the authoring controls and semantic theme. The focused tabs are **Stats & Movement**, **Health & Protection**, **Combat**, and **Abilities & Defenses**. `creature_uses` remains under **Overview → Harvest & Utility** with its existing component, controls and placement unchanged.

Attack Name, Attack %, Attack Initiative, Damage, Damage Type, Attack Mode, Magical, applicable Range/Reach and Notes form one primary card. Melee Reach remains optional; its unit is requested only when a numeric Reach is authored, as required by the existing validator. Ranged/Hybrid/AoE retain their supported range bands. Switching modes preserves hidden values. Empty On-Hit Effects show only an add button; Magic Construction stays collapsed.

Abilities show Name, Description, Activation Type, applicable Initiative and Effects. **Advanced Ability Settings** contains Origin, roll/targeting settings, Magical, applicable costs/limits, conditions, Magic Construction, CR Impact and Notes. Passive abilities have no Initiative or activation-cost controls. Activation semantics and validation remain unchanged.

Populated legacy Attack/Ability text appears in collapsed, read-only **Legacy Data** sections. Existing Defenses appear in one collapsed, read-only **Legacy Defense Data** section; there is no add control. These values remain in the drafts and snapshots during saves. Structured Interaction Rules are the new defense authoring path. See the [Step 2 UI supplement report](../reports/creature-authoring-ui-supplement-2026-09-20.md).

### Use Condition clarity (final Step 2 correction)

Creature masters and NPC individuals use the same Use Conditions component. Click/tap and keyboard-accessible **?** controls explain Activation Type, Use Conditions, each condition type, keys, operators, comparison values and notes. Help states the current support limits and distinguishes examples from a future supported key catalog.

- **Manual Ruling:** one **Description / Notes** field uses the existing `notes` property. The model has no separate description field, so the editor does not invent one or reuse `textValue`. The existing required manual explanation validation remains unchanged. Key/operator/number/text values on older manual conditions remain available in collapsed **Saved Condition Details**.
- **Event:** **Event Key** and **Match: Exact Event** are the simple view. All existing operator/value capabilities remain in **Advanced Comparison**. Event comparison settings are preserved, and help explicitly says current Event matching ignores them.
- **Equipment / State:** **Equipment Key / State Key**, with **Present / possessed** and **Not present / not possessed** as the basic choices. The existing operator is never defaulted or cleared. Full comparisons are available under **Advanced Comparison**.
- All eight stored operator codes are unchanged. Display labels spell out Greater than or equal to, Greater than, Less than or equal to, Less than, Equal to, Not equal to, Present / possessed, and Not present / not possessed.
- Ordered comparisons show **Number to Compare**. Equal / Not Equal offer **Compare As: Number / Text** and show just the selected value editor. This is a local presentation choice, not a new persisted field. Text-only saved comparisons reopen as Text; otherwise the initial view is Number. Both previously saved values can coexist and neither is cleared by switching views, operators or types. Values outside the selected view remain visible in collapsed **Saved Condition Details**.
- **Notes** is human explanation only and does not change evaluation. No new fields, defaults, validation, migration or runtime semantics are introduced.

Current support was checked against `derived-ability-use.ts` and `character-derived-ability-service.ts`: Event matching compares a supplied event key exactly; Equipment/State evaluation accepts boolean maps (missing facts require manual review). The normal Character Derived Ability service does not provide a complete Equipment/State fact catalog. Existing boolean evaluation is not a numeric/text comparison engine. Creature authoring profiles remain metadata and are not newly connected to runtime by this correction.

### Explicit later Combat / Runtime Integration requirement

The later approved integration step **must**:

A. Create authoritative Event facts.

B. Create authoritative Equipment facts from actual equipment state.

C. Create authoritative Character/Creature State facts.

D. Supply known supported keys to authoring UIs as dropdown/search options wherever possible.

E. Properly evaluate Greater than or equal to, Greater than, Less than or equal to, Less than, Equal to, Not equal to, Present, and Not present.

F. Use `numericValue` or `textValue` according to the authored comparison. Resolve ambiguous older combinations explicitly rather than silently discarding data or treating the presentation choice as a persisted discriminator.

G. Fall back to G.O.D. ruling when the system cannot authoritatively determine a condition.

These are planned requirements, **not implemented in Step 2**. Final damage/protection, incoming-effect interactions, Initiative, Rolls, hit locations, firearms, armor, inventory, Derived Ability execution, and `ActionEffectPlan` remain unchanged. Stop for Brannan's Step 2 review; Step 3 has not started.
