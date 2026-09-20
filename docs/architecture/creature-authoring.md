# Creature Attack and Ability authoring

Step 1 adds authoring metadata. It does not connect new timing, activation, magic, On-Hit Effects, or protections to combat execution.

## Storage and compatibility

Migration `0061_creature_authoring.sql` adds nullable `authoring_json` columns to `creature_attacks` and `creature_abilities`. Each configured profile has `schemaVersion: 1`; SQL checks reject non-object or unsupported envelopes. Server normalizers validate their contents. Existing rows remain `NULL`; no legacy mechanics are inferred, converted, or deleted.

Profiles live on their owning records, using typed JSON rather than a duplicate family of mechanical-effect, spell, condition, or resource tables. This also fits the existing immutable Creature snapshot representation and attack replacement-on-save behavior. Ordered attack effect entries carry the same stable `effectKey`, mechanical `schemaVersion`, effect payload, and `sortOrder` as existing Creature Ability Effects. Ability Effects continue to use `creature_ability_effects`.

The Creature editor, NPC template loader, and direct encounter loader select the new columns. Snapshot construction deep-copies profiles and effects. NPC parsing accepts old snapshots without the fields; saving an individual validates the new fields through the existing snapshot normalization boundary. Baseline snapshots remain immutable. Existing authorization, ownership, lifecycle, canonical IDs, and transactions remain in charge.

## Attack profiles

- `initiativeCost`: nullable, nonnegative authored cost. Blank means not authored. Combat continues to use its pre-existing timing contract and fallback.
- `mode`: nullable `melee`, `ranged`, `hybrid`, or `aoe`. Names, legacy ranges, and Creature type never choose a mode.
- `range`: Weapon-compatible `unit`, `reach`, `short`, `medium`, and `long`. The Weapon range validator handles positive distances, normalized units, and ascending bands; Creature validation also checks Short against Long when Medium is blank. Incomplete profiles may be saved for later authoring. Reach is optional and is never a required target-distance input.
- `magical`: `true`, `false`, or `null` (unspecified). An attached Spell Construction authoritatively makes the source magical. Explicit `false` with a construction is rejected. Neither names nor Ability Origin grant magic.
- `onHitEffects`: ordered Mechanical Effects, intended to follow a successful hit automatically in a later integration step. They create no standalone Ability or extra activation. Unsupported behavior belongs in a Manual effect or the retained Special Effect text.
- `magic`: optional shared `SpellDocument`. The shared editor, calculator, and mechanical-effect adapter provide authoring and previews; incomplete constructions remain editable drafts. No new casting engine is introduced.

Attack %, damage, damage type, anatomy, requirements, uses/recharge, Special Effect, Range / Reach text, and notes retain their existing storage and meaning. Bestiary damage is authored as the complete base amount; this step adds no STR/DEX damage modifiers and changes no Character/NPC damage rules.

## Trait and Ability profiles

Activation types reuse Derived Ability values: `passive`, `activated`, `triggered`, and `reaction`, plus unspecified for old records. Initiative, resource costs, use limits, and use conditions are authoring metadata; they do not create new charge, cooldown, event-listener, or passive-synchronization state.

- Passive authoring rejects activation Initiative, resource costs, and activation rolls. Choosing Passive in the editor clears these activation-only values. Conditions remain available.
- Activated, Triggered, and Reaction authoring supports optional Initiative, Derived Ability resource cost rows, use limits/refresh scopes, and use conditions.
- Conditions reuse `equipment`, `event`, `state`, and `manual`, including the existing key/operator/value/notes contract. No new trigger expression language or inferred events are added.
- Resolution reuses the existing automatic, fixed-roll, and manual concepts. Fixed-roll targets require a percentage from 0 through 100. Targeting notes remain descriptive; complex targeting uses the attached shared Spell Construction.
- The existing `ability_type` column is displayed as **Origin**, with Natural, Supernatural, Elemental, and Construct choices. An existing unknown value remains a selectable legacy option.
- Existing Mechanical Notes and Activation Notes remain descriptive text. Existing structured Ability Effects retain their current behavior. New activation metadata does not change the existing Ability use service.

## Editor organization

Both Creature and Creature NPC editors share the authoring controls and semantic theme. The special tab is **Traits, Abilities & Defenses**. Defenses retain their current editor and data. `creature_uses` is shown under **Overview → Harvest & Utility** without changing its rows. Ranges depend on Attack Mode; switching mode preserves hidden values for later editing, and future consumers must respect the explicit mode. Magic Construction is optional and collapsed by default.

This step intentionally leaves final damage/protection, incoming-effect interactions, Initiative, Rolls, hit locations, firearms, armor, inventory, Derived Ability execution, and `ActionEffectPlan` unchanged. Brannan must review Step 1 before Step 2 begins.
