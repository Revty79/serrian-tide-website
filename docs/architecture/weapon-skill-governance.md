# Canonical Weapon Skill Governance

Pass 3 records canonical weapon eligibility only. A mapping belongs to one Weapon Profile, optionally to one of that profile's persisted Firing Modes, and references the exact endpoint `skill.id`. It does not store a copied ancestry path, Character identity, Character allocation, percentage, or override.

## Exact route identity

The canonical reader follows exact `skill_relationship` parent edges from the selected endpoint to the root. The resulting root-to-endpoint Skill ID vector is the route identity exposed to later passes. Names and tiers are display metadata; they never select or redirect an endpoint. Traversal has no depth limit and reports cycles, missing Skill references, and genuinely different multiple-parent routes as invalid instead of choosing one.

The Character Builder already preserves the corresponding Character-side identity with `campaign_character_skill_allocation.skill_id` and `parent_allocation_id`. Its uniqueness key is branch-aware, creation recursively persists the selected parent allocation, and advancement addresses a branch by exact parent allocation plus exact Skill ID. Pass 4 must match the canonical root-to-endpoint Skill ID vector against that persisted allocation chain. It must not match by name, tier, classification, or the highest same-named sibling. Pass 3 does not alter Builder or advancement behavior.

## Attribute fallback

Fallback is derived only after an exact, unambiguous route reaches its root:

- Spellcraft root lineage uses `INT`.
- Talismanism root lineage uses `INT`.
- Faith root lineage uses `WIS`.
- Every other root uses that exact root Skill's authored primary Attribute.

Different Attribute metadata on descendants, branches, or spheres does not invalidate an otherwise exact route. A non-special root without an authored primary Attribute remains invalid and cannot be approved.

## Scope and review

Each scope holds zero or more stably ordered endpoint mappings. An approved, valid Firing Mode set replaces the Weapon Profile default set for that mode. A missing, invalid, or wholly review-required mode set inherits the approved Weapon Profile defaults. No row means `missing`; it does not imply a guessed Skill.

Heavens master-content authoring can add, remove, order, annotate, approve, or return paths to review. Approval is rejected unless current canonical relationships produce a valid route. Database constraints prevent duplicate endpoints and duplicate sort positions per scope, cross-profile mode references, invalid review states, and silent deletion of referenced profiles, modes, Skills, or authors.

## Deferred boundary

Pass 4 may consume the read model's ordered approved options and exact validated Skill-ID chains to inspect a Character's allocations. It must keep the existing allocation lineage intact and choose no sibling branch by similarity. Character fallback resolution, percentage calculation, Character or one-action overrides, attack rolls, damage, ammunition use, Initiative changes, and Player Console work remain outside Pass 3.
