# Forms Runtime Pass 2: effective mechanics audit

Baseline: `ee49594b2b7ef1090670baf1b7dbbc0a96a825ee`. Explicit Pass 2 authorization supersedes Pass 1's Normal-only execution boundary. Definition, Access, transformation, resource, clean-boundary and permanent Evolution authorities remain the existing owners.

## Shared authority

`features/forms/effective-form-mechanics.ts` extracts the existing Race preview's mechanical projection and temporary Tier 1 calculation inputs. `projectCreatureFormDefinition` remains the Creature projection authority; its Interaction Rule add mode now combines source-local profiles with distinct provenance. Preview and runtime both consume these functions. Runtime never consumes the display projection.

`effective-form-service.ts` reads the positive individual's active entry and frozen transition definition, then reads current Normal Character facts or the current individual Creature snapshot. It does not query a live Form library definition. Narrow Attribute consumers use the same pure Attribute function. No active entry returns each existing Normal reader's original path. Negative direct occurrences return their supplied snapshot unchanged.

| Runtime owner | Integration |
| --- | --- |
| Health, injury and limb resolution | Effective CON, permanent HP steps, projected anatomy and individual Creature HP Adjustment. Exact damage/pool/injury storage is untouched. Existing orphan behavior applies. |
| Initiative and movement | Existing capacity rules receive effective DEX and movement; new initialization calls this owner. Transition never writes an established position. |
| Incoming effects | Effective anatomy, Interaction Rules and natural protection; worn equipment and active protection retain their existing owners and order. Copied Form/body evidence stays in plans. |
| Race/Creature attacks and Creature Abilities | Existing executors receive effective collections and entry-bound references, including inherited attacks. Attached Magic continues through Combat Pass 4. |
| Skill/Attribute, weapon, spell, Dodge and called checks | Existing lineage calculation receives effective Attributes, saved allocations, Race links and temporary Form additions. Temporary calculation identities carry explicit Form provenance and are never persisted as allocation rows. |
| Firearms and equipment | Existing damage/governance owners receive effective Attributes. Capability guards protect active use, preparation, drawing, Item activation and physical handling. |
| Creature defenses | Active persistent Creature Forms supply native Dodge/Block/Parry collections and frozen entry evidence. Untransformed reader behavior and direct occurrences retain their previous paths. |
| Mana | Race Base Magic and permanent steps remain current; temporary Skill contributions use the same shared inputs. No refill. Creature magic steps remain part of the projected native definition. |
| Current Form UI | Existing preview sections render the authoritative effective view beside Normal editors. Existing invalidation refreshes sheets and combat choices. |

## Schema proof

A real positive Creature Form Block/Parry commit failed PostgreSQL constraint `campaign_session_encounter_reaction_defending_item_valid`: the existing item-free defense exception only accepted negative direct occurrences. Migration `0094_forms_effective_creature_defenses.sql` changes that single check. It additionally accepts a positive responder only with a Creature-defense snapshot, positive frozen Creature Form entry identity, no defending Item/instance, and a positive committed cost. Server authorization and exact current Creature/Form readers remain mandatory. No new table, column, inferred state, history rewrite or data backfill is introduced. Existing valid rows continue to satisfy the constraint.

## Boundaries retained

- Access and advancement use saved Normal facts. Form bonuses cannot self-unlock a Form. Permanent Evolution/Return and Race reassignment remain blocked by active/pending Forms.
- Temporary `Granted` links are authoritative evidence in the effective body, source facts and sheet. They create no ownership records and do not introduce Special Ability execution or a new Special Ability possession ledger.
- Speech/manipulation are typed runtime facts. Inherited capability states mean existing Normal behavior. No typed universal verbal-component requirement exists in the current spell/source model; prose is not executed.
- Restricted equipment remains recorded. Passive Worn Armor still applies until separately authorized physical reconciliation. A ruling cannot bypass an explicit `none`, `unusable`, `merged` or `dropped` active-use block.
- Limited/custom physical-use rulings use existing Encounter source-ruling history. A dedicated equipment-operation discriminator prevents an inventory/magazine capability approval from changing action resolution or Initiative. Existing controls can record G.O.D. approval while preserving the Player's action choice; exact operation references and current entry must match, and pending completion retains the frozen evidence.
- Form transitions retain Pass 1 fencing, receipts, costs, clean boundaries and transactional invalidation. New declarations reject a mismatched actor/target Form entry; source, distance and Called Shot rulings retain exact Form binding.
- Automatic triggers/Return, duration expiry, limit/cooldown ledgers, physical equipment consequences and active Form/Evolution coordination remain Pass 3.

Validation and deployment boundaries are recorded in [the completion report](../reports/forms-runtime-pass-2-2026-10-03.md). No shared migration application is authorized by this pass.
