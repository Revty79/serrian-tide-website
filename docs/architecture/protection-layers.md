# Natural, worn and temporary protection

Pass 3 adds a shared read model and Race authoring. It does not change final damage math or execute Interaction Rules.

## Authoritative sources

`readProtectionLayersInTransaction` in `src/features/protection/protection-service.ts` is a server-only, read-only transaction helper. Like the existing equipment and active-state readers, it requires an already authorized caller. It is not a public Server Action. Callers select a Character, or an exact Campaign/Encounter participant using the existing runtime participant key. Encounter scope is verified before reading a participant.

- **Normal Characters and Race NPCs:** current `campaign_character_profile.race_id` resolves the assigned Race's Natural Protection. Existing Race mechanics such as movement already use this relationship; there is no Character Race-mechanics snapshot to extend. Editing a Race, assigning a different Race, or clearing the assignment changes the next protection projection. No numbers are copied into the Character record. An archived but still assigned Race retains its authored protection; archiving a catalog entry does not revoke existing mechanics.
- **Creature NPCs:** natural protection comes from `campaign_creature_npc_profile.current_snapshot_json`, never a fresh master read. The immutable baseline remains untouched. Worn armor comes from that Character's existing equipment state, so Natural Armor 3 and Worn Armor 5 remain separate source records.

  Creature NPC saves now retain unchanged Item ownership rows. The previous blanket delete/reinsert cascaded away Worn state even for an anatomy-only edit. The save now deletes only explicitly removed stacks and upserts retained/new ones, preserving acquisition metadata and equipment-state references. Existing ownership validation, active-quantity guards, authorization, locking and passive reconciliation remain in place. This preservation fix changes no armor calculation or equipment selection rule.
- **Direct Creatures:** natural protection comes from the exact Encounter occurrence's `creature_snapshot_json` and its named hit locations. There is no equipment ownership layer for a direct occurrence, so worn protection is empty. Occurrence-local Soak modifiers come from `local_state_json.modifiers`. No second Creature protection engine is introduced.
- **Worn protection:** the existing equipment reader selects owned stacks/copies actually in the Worn state. Merely owned, Equipped, inactive, retired or inventory-only entries do not become worn armor. Item identity, ownership/copy identity, quantity, base Soak, coverage keys/text, armor type, rules text and damage-type metadata remain separate and unexecuted. Quantity is not multiplied, overlapping armor is not summed, and no new stacking rule is inferred.
- **Temporary / other:** active Soak modifiers preserve their amount, ID, label, full source identity, duration and lifecycle fields. Ended/expired records are excluded. Item passive modifiers remain temporary/other because their active modifier record does not authoritatively classify them as worn or natural protection. Negative modifiers remain signed. Existing `self` coverage applies across the anatomy; unsupported target keys stay unresolved and are surfaced with an issue rather than assumed to apply.

## Shared representation

`ProtectionLayers` contains the target, readable anatomy locations, `worn[]`, `natural[]`, `temporary[]` and issues. It deliberately has no generic Armor/Soak total, no stacking operation and no final HP effect.

Natural records retain the source identity/name, protection name, coverage, Armor and Soak separately. Creature records additionally expose original authored fields for explanation. The established Creature blank-as-none rule is reused for the numeric projection while original nulls remain available; malformed/negative old values remain unresolved, not silently corrected.

`protectionAtLocation(profile, locationKey)` selects each layer independently. Unknown anatomy locations are rejected. Explicit coverage matches exact existing location keys; text descriptions are never parsed into coverage. Unresolved temporary coverage remains visible separately. All-locations Race coverage means all locations of the normal humanoid anatomy, with the existing 0–9 mapping and readable names. Creature anatomy remains its own snapshot mapping, including different names for the same rolled number.

## Race authoring and storage

Race → Mechanics orders Attribute Caps, Movement, Natural Protection, then Racial Interaction Rules. An empty list is valid. Multiple definitions can be authored without deciding whether they stack. Each entry has a stable key, Protection Name, finite nonnegative Natural Armor and Natural Soak, and Coverage: All locations or one/more readable humanoid locations. Fractions and zero are accepted; invalid, duplicate or empty selected coverage is rejected. Examples of torso coverage use Groin, Stomach and Chest, not a new torso/anatomy key.

Migration `0063_race_natural_protection.sql` adds only:

- `race_natural_protections`: Race foreign key, stable definition key, name, Natural Armor, Natural Soak, coverage kind and order. Keys are unique within a Race; amounts, coverage kind, text and order have database checks.
- `race_natural_protection_locations`: child rows with an existing hit-location key, uniqueness and supported-key checks, cascading from the definition. All-locations definitions need no location rows.

Race save retains existing authentication, shared-library edit permission, archive checks and transaction boundaries. Definitions upsert by Race/key; removals remove only those explicit definitions and their children. Missing `naturalProtections` on an older caller's draft preserves existing definitions; an explicit empty array removes them. The server validates selected coverage before writes and on reads. No existing table is altered, no catalog data is backfilled, and no snapshot version changes. Legacy Creature snapshots require no new field.

## Compatibility and next pass

All ordinary attack, firearm, spell, Creature Attack, Item Ability, Mechanical Effect and ActionEffectPlan damage paths continue to read their existing inputs. They do not call the new projection. There is no compatibility adapter because no old read was replaced. Consequently, Race Natural Protection and newly exposed Creature NPC natural protection are available to future consumers but do not start reducing damage in Pass 3.

Approved future incoming-effect order:

source qualification → worn / external protection → interaction rules → natural protection → temporary / other protection → final HP effect.

If qualifying damage becomes healing through Absorption, natural and temporary protection must not reduce that healing. **This order and Absorption behavior are documented only.** Requirement, Immunity, Resistance, Vulnerability and Absorption remain authoring/preserved only. Event/State/Equipment condition integration, Initiative, Rolls, firearms, spells and ActionEffectPlan redesign remain outside this pass. Pass 4 requires explicit approval after review.
