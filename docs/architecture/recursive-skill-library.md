# Recursive Skill Library — Pass 1

## Scope and authority

This pass rebuilds the existing `/heavens/skills` master-content workspace around the authored Skill graph. It does not rewrite canonical Skill rows, relationships, Race links, Character allocations, weapon mappings, Called Checks, spell documents, or historical Roll snapshots. It adds no migration.

Only a user with the existing `god` master-content role can read or mutate this workspace. The page gate and every exported server mutation independently revalidate that role. Campaign ownership and Administrator status do not grant Skill-authoring access.

## Current schema

`skill` stores the exact integer identity and authored metadata:

- `id` is the canonical database identity.
- `name`, `classification`, `tier`, `primary_attribute`, `secondary_attribute`, and `definition` are metadata, never identity.
- `source_system` plus `source_external_id` preserve imported source identity and cannot be changed by the editor.
- duplicate names are structurally permitted; only non-null source identity pairs are unique.

`skill_relationship` stores directed typed edges:

- `skill_id` is the child/source Skill.
- `related_skill_id` is the parent/related Skill.
- `relationship_type = 'parent'` participates in canonical hierarchy traversal.
- other relationship types, including `prerequisite`, remain authored and editable but do not become parent edges.
- `sort_order` is authored ordering. For a parent's children, edge order is used first and normalized name plus exact ID is the deterministic fallback.
- the schema prevents self-edges and exact duplicate `(skill_id, related_skill_id, relationship_type)` rows, but intentionally permits genuinely different parents.

`skill_extension` preserves one versioned document per `(skill_id, extension_type)`. Spell construction remains an extension and is not altered by hierarchy construction.

The existing tables already represent the required arbitrary-depth graph, metadata, and ordering. No additive column or migration is necessary. Migration `0031_player_combat_ruling_requests` remains the tail; `0031` and all earlier migration SQL and snapshots are unchanged.

## Shared recursive model and APIs

The pure shared model is `src/features/skills/recursive-skill-library.ts`. The database reader is `src/features/skills/recursive-skill-library-service.ts`.

Public domain APIs are:

- `buildRecursiveSkillLibrary(skills, relationships)` builds roots, Attribute groups, exact paths, review reasons, duplicate-name groups, and observed depth.
- `getEffectiveRootAttribute(root)` applies only authored primary Attribute and the three explicit supernatural fallbacks.
- `getRecursiveSkillPath(library, rootToEndpointIds)` resolves one exact ID vector.
- `getRecursiveSkillChildren(library, path)` returns the next authored level for that exact path.
- `searchRecursiveSkillLibrary(library, query)` returns exact Skill identity plus complete lineage; the same identity can have multiple path results.
- `previewSkillStructureChange(library, proposal)` compares old and proposed paths, lists downstream identities, detects cycles, and marks changes requiring confirmation.
- `validateCanonicalSkillPath`, `validateSelectedCanonicalSkillPath`, and `enumerateCanonicalSkillPathAlternatives` remain the public weapon-governance and Called Check traversal APIs. `src/features/items/weapon-skill-governance.ts` re-exports them, preserving existing imports and regression behavior.
- `loadRecursiveSkillLibrary()` loads exact database rows into the shared model.
- `loadSkillConsumerImpact(skillIds)` performs read-only consumer counts for structural review.

The model has no tier ceiling and no Tier 1/Tier 2/Tier 3 traversal branches.

## Root detection and Attribute grouping

A root has no valid authored `parent` edge. Skills with a broken parent or roots synthesized solely to make a disconnected cycle visible are placed under `Review Required / Missing Attribute`.

Ordinary roots use only their authored `primary_attribute`, normalized for grouping. A descendant remains in every exact governing-root lineage even if its own Attribute metadata differs. That difference is emitted as a `descendant-attribute-difference` notice and displayed; it never moves the descendant to a different group.

The only name-based rules are the explicitly required supernatural fallbacks:

- exact normalized root name `Spellcraft` → `INT`
- exact normalized root name `Talismanism` → `INT`
- exact normalized root name `Faith` → `WIS`

No Attribute is inferred from any other name, classification, description, tier, or apparent purpose. Missing ordinary root Attributes remain in the review group. Custom authored root Attributes are exposed as additional groups after STR, DEX, CON, INT, WIS, and CHA.

## Exact identity and duplicate names

Every node, edge, search result, breadcrumb, parent selector, path preview, and save request retains integer Skill IDs. A path contains both `rootToEndpointIds` and the reverse `endpointToRootIds`. Names are display text only.

Duplicate names are reported as distinct ID groups. Search returns one entry per exact path, shows every ID in the lineage, and opens the selected path key. It never redirects through a same-named sibling.

## Multiple parents, cycles, duplicates, and broken references

Multiple parent relationships are not normalized away. A multi-parent identity appears on every reachable exact route. It receives `multiple-parents`; if routes resolve through different governing Attributes it also receives `conflicting-governing-roots`. Saving a proposed multi-parent state requires explicit structural confirmation.

Cycle traversal is path-local and terminates before repeating an ID. Every cycle member receives a structured `cycle` reason and a disconnected cycle remains discoverable in the review group. A proposed reparent that creates a cycle is rejected before persistence.

Broken child and parent references, duplicate Skill identities, and duplicate relationship rows are represented by structured reasons. PostgreSQL constraints normally prevent these states, but the pure model remains defensive for fixtures, future imports, and partial reads. It does not throw one generic traversal error or guess a replacement.

## Heavens interface

The existing Skills route retains two presentations over the same exact Skill identities. List View is the default and preserves the paginated complete-library search and metadata filters. Tree View begins with the Character-style Attribute names in STR, DEX, CON, INT, WIS, and Charisma order, followed by any custom authored groups and the explicit Review / Unlinked group. It does not show any roots until one group is selected, and then shows only that group's roots.

Selecting a root opens its immediate children; selecting a child repeats the same operation at any depth. The workspace deliberately does not render the entire database as one permanently expanded tree. Switching into Tree View starts at its Attribute selector, while List View selection continues to load the same right-side viewer/editor without forcing a hierarchy presentation.

The selected view includes:

- breadcrumb buttons for every exact root-to-selected identity;
- governing root, effective Attribute, authored Attributes, classification, authored tier, parent identity, and exact ID;
- complete name-and-ID and ID-only path previews;
- immediate children, siblings, Up One Level, Back to Root, and Attribute Overview controls;
- structured review warnings.

All navigation actions use native buttons and labeled navigation regions. Errors use `role="alert"`; success and review messages use status semantics. Focus-visible outlines are explicit. Narrow layouts stack the hierarchy and prevent page-level horizontal overflow; long names and ID paths wrap within their containers.

## Search

Search covers every depth in the loaded graph and matches name, exact numeric ID, `#ID`, classification, and authored Attributes. Results include the governing group and full lineage with IDs. Review-required paths are searchable. Selecting a result opens that exact path.

## Creation and reparenting

`New Skill` always opens the ordinary existing editor with no preselected structural decision. The author chooses Attribute and tier metadata in Core Details and adds any exact parent relationships in Pathing. A draft with no parent becomes a root; a draft with an authored `parent` edge becomes a child. Placement is never separately stored: after save, the shared model derives the Attribute group and every lineage from canonical rows. The saved identity stays selected, and a Tree View save opens one exact derived path immediately.

The path editor searches all Skill depths, labels each parent candidate with exact ID and every complete lineage, and preserves non-parent relationship types. The editor shows current and proposed paths continuously.

Before persistence, the server reloads the current graph, validates every related ID, checks cycles, and recomputes structural significance. Reparenting and proposed multiple-parent states require a second explicit confirmation. The confirmation shows downstream Skill identities and read-only counts for Character allocations, Race references, weapon and defense governance, Called Checks, Derived Ability requirements, and Creature Skill references. These consumers are not rewritten or deleted.

Exact Skill identity and source identity remain unchanged during edit. Restrictive foreign keys continue to produce deletion errors rather than silent consumer removal. This pass adds no broader deletion behavior.

## Character Builder and advancement boundary

Character allocation identity remains `(skill_id, parent_allocation_id)` and is not recreated. The shared model's exact ID vectors match the paths expected by Character Builder and advancement recursion.

The current Builder already renders recursively and keys an allocation to its exact parent allocation. Pass 1 intentionally does not change point costs, ranks, unlock thresholds, Campaign tier permissions, progression, advancement mathematics, or supernatural access.

Recommended Pass 2 integration:

1. Consume the shared root/path model instead of independently rebuilding `childrenByParent` and roots.
2. Remove the current root filter that also requires `tier` to be null or 1; root identity must come only from authored parent edges.
3. Preserve authored child ordering instead of name-only ordering.
4. Present an explicit exact route when a Skill has multiple parents; do not let racial anchor reconciliation choose or flatten a route.
5. Use governing-root Attribute groups while continuing to show descendant authored Attribute metadata.
6. Keep every allocation's `parentAllocationId`, cost, rank, unlock, and advancement rule unchanged.
7. Extend Character Builder browser coverage with deep paths and exact duplicate-name fixtures.

## Race and supernatural boundary

`race_skill_links.skill_id` is an exact foreign key to `skill.id`; `(race_id, skill_id, link_type)` is unique. The audit found no broken Race Skill reference. Race rows and links were not changed.

Spellcraft, Talismanism, Faith, their shared branch identities, spheres, and spell descendants were not rewritten. The library renders their existing many-parent structure under each exact root. Spell extension data and supernatural construction behavior remain unchanged.

## Weapon governance and Called Checks

Weapon governance retains its exact endpoint mapping and validation contract. Approved governance still requires one unambiguous parent chain for a broad endpoint; explicitly selected canonical paths retain exact route validation. Only implementation ownership moved to the shared hierarchy module.

Called Checks continue to call `enumerateCanonicalSkillPathAlternatives`, preserve exact allocations and selected path vectors, and use root Attribute fallback. Historical requests, governing snapshots, and Rolls are not recalculated or mutated.

## Non-destructive development database audit

Command:

```text
npm run audit:recursive-skills
```

The command rejects any host other than loopback and any database name not ending in `_dev`. It opens a read-only transaction and always rolls it back.

Observed on `localhost/serrian_tide_dev` on 2026-09-04:

| Measure | Result |
| --- | ---: |
| Skills | 1,142 |
| Roots | 147 |
| Relationships | 1,027 |
| Parent relationships | 1,027 |
| Maximum observed depth | 4 |
| Duplicate-name groups | 0 |
| Multiple-parent Skills | 16 |
| Cycles | 0 |
| Broken relationship references | 0 |
| Duplicate relationships | 0 |
| Missing ordinary root Attributes / review roots | 85 |
| Race Skill references | 283 |
| Broken Race Skill references | 0 |
| Character allocation references | 10 |
| Broken Character allocation references | 0 |
| Weapon-governance endpoint references | 0 |
| Broken weapon-governance endpoint references | 0 |
| Called Check endpoint references | 0 |

Distinct Skill membership by effective group:

| Group | Distinct Skills |
| --- | ---: |
| STR | 78 |
| DEX | 148 |
| CON | 88 |
| INT | 316 |
| WIS | 451 |
| CHA | 184 |
| Review Required | 85 |

Membership counts intentionally overlap: the 16 shared supernatural branch identities and their descendants are reachable through Spellcraft, Talismanism, and Faith exact paths. They are not duplicate Skill rows.

The 16 genuinely multi-parent Skills are Charm `#657`, Death `#670`, Divination `#684`, Earth `#697`, Enchantment `#710`, Fire `#723`, Illusion `#736`, Life `#749`, Negation `#762`, Soul `#775`, Summoning `#788`, Time & Space `#801`, Transmutation `#814`, Transformation `#827`, Water `#840`, and Wind `#853`. Each has exact parents Spellcraft `#425`, Talismanism `#426`, and Faith `#544`.

Each supernatural root has those 16 immediate branches and 208 distinct descendant identities. Spellcraft resolves to INT, Talismanism resolves to INT, and Faith resolves to WIS. No supernatural Skill or relationship was rewritten.

The 85 review roots are existing Attribute-less Special Ability records (IDs `#1059` through `#1143` in this snapshot). They remain separate exact roots; the pass does not infer Attributes or relationships for them.

## Deliberately deferred to Pass 2

- Character Builder adoption of the shared hierarchy view and ordering.
- Explicit multi-parent route choice for new Character allocations and racial anchor reconciliation.
- Any deliberate canonical Skill rename, merge, deletion, Attribute decision, tier decision, relationship change, or supernatural data redesign.
- Race data rebuild.
- Changes to progression, points, ranks, unlocks, advancement, weapon mappings, Character weapon overrides, Called Checks, Roll history, or combat mechanics.
- Navigation overhaul, global scroll repair, NPC-builder work, Campaign deletion, backup/restore, printing, and unrelated editor cleanup.
