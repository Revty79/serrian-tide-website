# Character weapon governance resolver

Pass 4 selects a weapon's governing Character source. It does not roll dice,
apply damage, spend Initiative, consume ammunition, or mutate Pass 3 mappings.

## Identity and calculation

Canonical eligibility comes from Pass 3. Each approved path is an ordered
root-to-endpoint Skill-ID vector. Character ownership is matched only against
the ordered `campaign_character_skill_allocation.skill_id` vector obtained by
following exact `parent_allocation_id` identities. Names, tiers,
classifications, and sibling allocations are not substitutes.

For every applicable canonical option, the resolver checks endpoint to root
and selects the deepest owned exact allocation. It then reuses
`getCharacterSkillRanks`, `getSkillRollTarget`, and
`getSpecialAbilityRollTarget`; it does not derive a second Skill formula. A
Skill target already contains its Attribute contribution. If no path Skill is
owned, the resolver uses Pass 3's validated root fallback and computes exactly
`100 - current Attribute`.

All applicable options remain in the result. The lowest roll-over target is
recommended. Equal targets remain visible and the stable Pass 3 order selects
the default recommendation.

## Overrides and precedence

Resolution precedence is:

1. one-action G.O.D. override;
2. firing-mode persistent override, then weapon-wide persistent override;
3. normal canonical Character resolution;
4. a structured G.O.D.-ruling state.

Persistent rows are scoped by Campaign, Character, canonical Item/Weapon
Profile, and optional firing mode. They reference either one exact Character
Skill allocation or one Character Attribute. The database proves Character to
Campaign, Profile to Item, mode to Profile, allocation to Character, and
Attribute to Character relationships. Partial unique indexes prevent duplicate
weapon-wide or mode-specific scopes. Allocation deletion is restricted while
referenced so it cannot silently redirect an override; a source that is no
longer owned or otherwise calculable returns `override-invalid`.

The Character editor now updates Character Attribute rows in place, retains
the IDs of unchanged persisted allocations,
and refuses to redirect an existing ID to another Skill or parent lineage.
New branches still receive new IDs and removed unreferenced branches can still
be deleted.

One-action overrides are typed inputs and are never stored. They require a
bounded nonblank reason and may use an exact owned allocation, an Attribute, or
a Pass 2-compatible manual target. Only an authenticated Campaign-owning user
with the G.O.D. role may mutate persistent overrides or supply one-action
overrides. Administrator status alone has no mechanical authority.

## Output and entities

Successful results include the exact source, original target, normal
alternatives and tie information, explanation, and both the Pass 2
`RollGoverningSourceRequest` and fully populated governing-source snapshot.
Resolving alone creates no Roll row.

Race NPCs use the same Character allocation model. Creature NPCs never receive
invented Character Skill ownership. Their natural attacks are outside this
resolver; manufactured canonical weapon use requires an explicit supported
Attribute/manual ruling or returns `needs-god-ruling`.
