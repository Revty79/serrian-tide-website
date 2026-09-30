# Special Ability Mechanics: Pass 1 architecture contract

Status: inspection and design proposal for Brannan and Ember's review. No framework implementation or game-rule authoring is included.

**Pass 2 follow-up:** the [implemented Pass 2 contract](special-ability-mechanics-pass-2.md) records the safe foundation and supersedes this proposal where specified. In particular, purchased points are only a temporary, isolated v1 resolution source. Brannan and Ember have not approved one universal Special Ability progression meaning; the recommendation below must not be treated as permanent canon.

Repository baseline: a8ce41f31f0253d340083619c63de0f29bdce305, main, September 30, 2026. Production evidence was captured at 2026-09-30T13:09:01.213Z.

**Yes: Serrian Tide can add this authoring layer without competing sources of truth.** The appropriate home is one optional, versioned Special Ability extension on the existing Skill. It must describe only intrinsic ability mechanics and use typed references or read-only backlinks for mechanics owned elsewhere. Reuse existing requirement and effect vocabulary; do not reuse an execution service merely because its inputs look similar.

The main risks are extension loss during Skill saves, two different meanings of Skill progression, unguarded references inside JSON, and treating authored information as an instruction to mutate Character state. A further boundary is necessary for ability-owned resistance: Interaction Rules currently accept Race and Creature owners, not Skills.

**Future Special Abilities are a core requirement.** The current 86-entry catalog is evidence for the initial toolbox, not a fixed list of supported abilities or an exhaustive list of possible mechanics. New Special Abilities must use the same authoring, storage and display path without adding ability-specific code when their mechanics fit existing rule families. Genuinely new mechanics must have a clear extension path while retaining one authoritative owner per mechanic.

## 1. Current-state findings

### Skill creation and extensions

- [Skill schema](../../src/db/skill-schema.ts) owns Skill identity, classification, tier, Attributes, definition, provenance and archive fields. Relationships have their own IDs, restrictive Skill references, type and order. The same Skill can occur on more than one path.
- [Skill actions](../../src/app/heavens/skills/actions.ts), especially normalizeCore, getSkill and saveSkill, own serialization and server authorization. A core with neither Attribute is normalized to classification "special ability" and a null tier. [Skill editor](../../src/app/heavens/skills/skill-editor.tsx) also changes classification when Attributes are removed/added. Classification is text, not a dedicated Special Ability entity.
- [Character rules](../../src/features/characters/character-rules.ts), isSpecialAbilitySkill, recognizes trimmed, case-insensitive singular and plural classifications. New extension eligibility should use this existing semantic predicate, not infer eligibility from the Skill's name.
- [Skill workspace](../../src/app/heavens/skills/skills-workspace.tsx) and [construction editor](../../src/app/heavens/skills/skill-construction-editor.tsx) expose Core, Pathing, Construction and Preview. The optional Construction editor attaches Spell Construction and preserves other entries in its draft array. It is not a Special Ability mechanics editor and is not strictly limited by supernatural classification.
- saveSkill already requires G.O.D./admin access and checks shared-root edit permissions. Structural changes use recursive Skill validation and a mutation preview/confirmation. These checks must remain authoritative.

The existing skill_extension table is a strong storage fit. It has one row per Skill and extension type, positive schema_version, text data_json, timestamps, and a cascading foreign key to its parent Skill. Text storage intentionally preserves legacy document representation. Database constraints check nonblank text, not the document's semantic shape.

Spell Construction gets explicit parsing, version normalization, calculation snapshot creation and framework-reference validation. Other extension types currently get JSON serialization without domain validation. getSkill parses ordinary extension JSON directly; a malformed extension can fail the entire aggregate read.

**Persistence hazard:** saveSkill currently deletes every extension for the Skill and reinserts the submitted list, at lines 1608–1669. Omitting a known extension from that list deletes it; a stale draft can overwrite newer extension data. The serial extension-row ID is therefore not a stable mechanic identity. Current draft preservation is helpful, but insufficient protection for a new independently edited extension.

No dedicated Skill clone command was found in the inspected workspace/actions. Race and Creature copying is a different operation: it preserves external Skill references and creates independent owned content. A future Skill copy needs an explicit extension-copy policy, rather than an assumption that clearing the root ID is a supported clone service.

### Ownership, Race grants and progression

[Race schema](../../src/db/race-schema.ts) and [Character loading](../../src/app/characters/actions.ts) supply Race Skill links. [Character rules](../../src/features/characters/character-rules.ts) sums nonnegative link values for a Skill as its racial contribution; any matching link establishes the helper's granted flag. Effective points are purchased points plus that racial contribution.

Character allocations live in [realm-schema.ts](../../src/db/realm-schema.ts), campaignCharacterSkillAllocation. Each records Skill ID, purchased points and parent allocation. Rank is resolved per allocation/path:

1. No effective points gives Rank zero.
2. For tier greater than one, Rank is parent Rank plus effective points.
3. Otherwise it is effective points plus the primary Attribute modifier, if there is a governing Attribute.

The Character editor displays Special Abilities separately and uses 100 minus Rank for an attributeless Special Ability's roll target. Ordinary Skill rules remain in the same existing helpers. Campaign purchasing permissions and Special Ability caps are already handled there.

The XP advancement path is narrower than generic possession. [character-advancement-rules.ts](../../src/features/characters/character-advancement-rules.ts), canPlayerAdvanceSkillWithExperience, requires **positive permanent allocation points** for a Special Ability. Racial access alone does not pass that predicate. Do not silently replace it with the new layer's possession logic or change how abilities are acquired.

A granted ability may therefore be present without purchased progression. Form-granted abilities and Creature native abilities also have distinct ownership contexts. A new extension must not manufacture allocation rows, Derived Ability ownership, or Creature ownership.

### What Form Access actually compares

[form-access-context.ts](../../src/features/forms/form-access-context.ts) reads a saved Character's Normal-state facts, calling getCharacterSkillPointsById from [character-rules.ts](../../src/features/characters/character-rules.ts).

For a Skill ID, that helper returns the **highest persisted purchased allocation.points across its paths**, starting from zero. It does not sum paths and excludes racial points, Attributes, parent Rank, tier and temporary effects.

[form-access.ts](../../src/features/forms/form-access.ts) uses that map for numeric Skill comparisons. A known missing Skill entry compares as zero. Possession is separate: positive purchased points or a Normal Race link can establish Skill possession, even when a numerical threshold is unmet. Derived Ability possession comes from its existing resolved status. Creature contexts support native Skill/Ability possession; they do not pretend Creature Rank is Character purchased points.

A hypothetical Character with 40 purchased points and 10 racial points can display Rank 50 for an attributeless Special Ability, while a Form requiring 50 purchased points remains locked. This is an illustration of current code, not a proposed change to any Form.

Form requirements have AND within a group and OR between groups, with available, locked and manual-review results. Access does not activate a Form. Unsaved edits and preview bonuses cannot qualify the Character's saved Normal state.

### Forms, previews, Evolution and copies

- [race-forms.ts](../../src/features/races/race-forms.ts), [race-form-service.ts](../../src/features/races/race-form-service.ts) and [race-form-mechanics.ts](../../src/features/races/race-form-mechanics.ts) own exact Race-local Forms, persistent IDs, stable local keys, anatomy, signed Attribute adjustments, movement, protection, attacks, Skill additions and Interaction Rules.
- [creature-forms.ts](../../src/features/creatures/creature-forms.ts) and [creature-form-service.ts](../../src/features/creatures/creature-form-service.ts) preserve native Creature collections, replacement base Attributes and Size rules. They are not interchangeable with Race Form adjustments.
- [form-transformation.ts](../../src/features/forms/form-transformation.ts) already describes entry/exit method, timing, costs, use conditions, involuntary triggers, duration, limits, cooldown and equipment notes. It reuses Derived Ability definitions/normalizers; it does not spend resources or track transformations.
- [form-access-schema.ts](../../src/db/form-access-schema.ts) gives Skill/Derived prerequisites restrictive FKs. [form-access-service.ts](../../src/features/forms/form-access-service.ts) validates exact Creature ability ownership, allows retained archived references and rejects newly assigned archived references.
- [Character Form preview](../../src/features/characters/character-form-preview.ts), [Race preview service](../../src/features/races/race-form-preview-service.ts) and [Creature preview](../../src/features/creatures/creature-form-preview.ts) create detached views. Race previews use normal Character facts plus the selected Form's adjustments; they do not write state.
- Cloning creates new Form rows under the new owner. External Skill/Derived references stay external; Creature-local ability references are remapped to cloned normal abilities. Form keys are owner-local, never globally meaningful.
- Evolution now has [requirements](../../src/features/evolutions/evolution-requirements.ts), [execution](../../src/features/evolutions/evolution-execution-service.ts), [destination handling](../../src/features/evolutions/evolution-destination-service.ts) and [event storage](../../src/db/evolution-event-schema.ts). It can ask whether an individual qualifies for a Form using that Form's access evaluator. Special Abilities must not duplicate Evolution paths or execute Evolution as a side effect of resolution.

The older [Forms audit](forms-final-audit.md) remains useful for ownership and cloning, but its statement that Evolution is a future system has been superseded by the current code. This audit uses the implementation for that boundary.

### Display and lifecycle today

[character-editor.tsx](../../src/app/characters/character-editor.tsx) displays Skill groups, investment/Rank and a definition dialog. Character loaders explicitly read spell-construction and spell-import-source extensions; they do not yet load a Special Ability mechanics document.

[character-print.ts](../../src/features/characters/character-print.ts), [paper-character.ts](../../src/features/characters/paper-character.ts) and [paper-sheet-content.tsx](../../src/app/characters/paper-sheet-content.tsx) carry Skill definitions and existing roll information. The paper layer deliberately suppresses an attributeless Special Ability roll through hasRoll, despite an upstream target being calculable. This discrepancy is an existing display boundary, not permission to change percentile canon in this project.

[player-tabletop-console.ts](../../src/features/tabletop-operations/player-tabletop-console.ts), its [service](../../src/features/tabletop-operations/player-tabletop-console-service.ts), and [player-tabletop-workspace.tsx](../../src/app/realms/tabletop/player-tabletop-workspace.tsx) provide useful read models for spells, Derived Abilities, Health, Mana, Items, charges and history. There is no corresponding Special Ability mechanics read model or execution source. Generic Skill/roll facilities do not amount to Special Ability mechanic automation.

[lifecycle-service.ts](../../src/features/lifecycle/lifecycle-service.ts) and [policy.ts](../../src/features/lifecycle/policy.ts) handle archive/restore/delete with root authorization, dependency previews, transactional locking and audit records. Canonical/imported/protected roots have additional restrictions. Extensions remain with an archived Skill and cascade only on eligible root destruction. Existing dependencies block destructive deletion, including Race grants, allocations, Form/Evolution prerequisites and Derived requirements.

Serialized references are not automatically protected. Lifecycle explicitly scans Spell Construction framework references; it knows nothing about a future Special Ability document's references. New reference types require symmetric save and delete/change guards.

## 2. Existing infrastructure to reuse

| Infrastructure | Reuse | Boundary |
| --- | --- | --- |
| Skill extensions | Existing parent identity, unique type, version column, text document and editor draft preservation | Add strict codec and safe mutation semantics; do not introduce a second ability root |
| Spell Construction | Optional structured layer, decode/normalize/validate, unsupported-version rejection, summaries, explicit reference locking | Keep its spell document, calculation, framework and casting ownership; do not embed a second spell constructor |
| Shared requirements | [requirement-primitives.ts](../../src/features/requirements/requirement-primitives.ts): gte, gt, lte, lt, eq, neq, possession vocabulary and three-state AND/OR | Facts must come from an authorized saved context; undefined facts must not silently become a successful negative condition |
| Derived Ability authoring | [models.ts](../../src/features/derived-abilities/models.ts), [domain.ts](../../src/features/derived-abilities/derived-ability-domain.ts): activation, costs, use conditions, limits and refresh terms | Do not inherit Derived acquisition, ownership rows, live synchronization or use history |
| Derived resolution | [resolver](../../src/features/derived-abilities/character-derived-ability-resolver.ts): deterministic dependency checks and separate possession/availability | Use its results as facts; do not create a cross-system recursive grant engine |
| Mechanical Effects | [models](../../src/features/mechanical-effects/models.ts), [validation](../../src/features/mechanical-effects/validation.ts), [summaries](../../src/features/mechanical-effects/summaries.ts): shared effect definitions and readable diagnostics | No calls to effect planning/application merely to render an ability |
| Interaction Rules | [authoring](../../src/features/interaction-rules/interaction-rules.ts), [matcher](../../src/features/incoming-effects/interaction-matcher.ts), [incoming resolver](../../src/features/incoming-effects/resolve-incoming-effect.ts) | Reuse matching/resistance semantics; never implement a parallel percentage engine |
| Forms | Existing access, transformation, costs and detached preview patterns | No copied Form unlock list, body data or transformation costs in a Special Ability |
| Character / tabletop | Existing authorization, Character facts, read projections and print composition | Add a read-only projection later; do not insert a source into combat declaration or spending |

### Derived Abilities: precise limits of reuse

The current model has automatic/learned/awarded acquisition and passive/activated/reaction/triggered activation. Acquisition and live requirements are distinct. Use conditions include equipment, event, state and manual descriptions. Costs distinguish Initiative, Mana, Health, ammunition, named resource and custom. A named cost's resourceKey is a text label, **not a registered Character resource**.

Limits support round, encounter, scene, manual, never and event refresh scopes. [derived-ability-use.ts](../../src/features/derived-abilities/derived-ability-use.ts) plans eligibility, selections, effects and affordability. Initiative needs encounter context, and Mana needs a canonical pool. Health, ammunition and generic/custom resource costs remain manual where they lack an authoritative pool/instance interpretation.

[character-derived-ability-service.ts](../../src/features/derived-abilities/character-derived-ability-service.ts) and [combat-derived-ability-service.ts](../../src/features/tabletop-operations/combat-derived-ability-service.ts) already execute supported behavior, persist uses/recharges, and synchronize supported passive effects. A Special Ability read operation must never call these mutators. Targets and HP locations are selected separately from a definition. Reaction/trigger context and G.O.D. confirmation are explicit, not inferred from narrative.

### Resources and resource-like state

| Resource | Definition / maximum | Current state, spending and refill | History / display / gap |
| --- | --- | --- | --- |
| Mana | Existing Character magic profiles, fixed canonical systems; [active-mana.ts](../../src/features/active-state/active-mana.ts) | [Mana service](../../src/features/active-state/active-mana-service.ts) stores manaSpent; current = max(0, maximum − spent); authorized transactional spend/restore/full restore | Tabletop and casting integrations exist. Not a generic pool registry or universal resource ledger |
| HP | Character/Race/Creature anatomy and pool maxima | [Health service](../../src/features/active-state/active-health-service.ts) stores total/pool damage and injuries; remaining HP is resolved | Existing damage/healing/effect histories are context-specific. A cost needs a named authoritative pool/location; a ward is not automatically HP |
| Quintessence | Character profile current balance and total field in realm schema | Existing advancement/award workflows; no ability-defined maximum or generic refill model | [Closeout awards](../../src/features/tabletop-operations/closeout-award-service.ts) preserve award history. Do not repurpose or reinterpret totalQuintessence as a new resource counter |
| Item charges | Item runtime/power resource definitions set maximum and use costs | Exact owned Item instances hold currentCharges; [charge service](../../src/features/items/item-charge-service.ts) spends/restores | Item use/tabletop integration exists. Charges belong to an Item instance, not a new ability pool |
| Ammunition | Item/weapon/magazine and capacity definitions | Inventory and [firearm readiness](../../src/features/tabletop-operations/firearm-readiness-service.ts)/[attack service](../../src/features/tabletop-operations/firearm-attack-service.ts) own loading and consumption | Existing firearm history and exact ownership must remain authoritative |
| Initiative | Existing combat timing/capacity model | Encounter participant state and authoritative Initiative services | Timing/event history is combat-specific; speed prose is not automatically an Initiative modifier |
| Derived uses | Maximum uses and refresh scope on the ability | Derived use and recharge records resolve remaining uses | Useful pattern, but not a named-resource balance |
| Form named costs | Definition reuses costType/resourceKey | Authoring only | A text name does not create a pool or make spending executable |
| Ability-defined resource, e.g. a possible Shift Reserve | No general definition/maximum contract found | No generic current value, create/grant, spend, recovery or cap-reconciliation service found | No generic resource ledger or tabletop panel. All remain future work |

The existing services are good examples of ownership and transactional spending. They are not interchangeable implementations of one generic resource API. A future resource layer needs stable definition identity, entitlement, maximum resolution, current balance semantics, recovery policy, authorization, atomic changes, idempotency, audit history and public projection. Definition versus current state must remain separate. Whether lowering a maximum loses stored points or merely caps display is a game decision; this audit chooses neither.

### Effects and exceptions

Mechanical Effects schema version 2 covers health.heal, health.damage, condition.apply, modifier.apply and manual. Modifier channels are Attribute, Skill, movement, Initiative, Soak and damage, with target keys, amounts and duration. Durations include until removed, combat steps, combat rounds and scene; health effects support immediate/over-time timing.

This is not a universal capability, defense, immunity, movement-mode or rules-exception registry. Condition names and many modifier target keys remain strings. Runtime duration types cannot precisely encode every minute-, success-, permanent- or narrative-duration ability without an explicit adapter or manual fallback.

Interaction Rules cover requirements, immunity, resistance, vulnerability and absorption across damage, conditions and mechanical effects. Conditions match damage type, magical status, source kind, Item property/tag, effect kind and condition name. Percentage rules currently apply to damage only. Race and Creature own profiles; Forms can retain/add/replace them. Incoming resolution already owns protection ordering and ambiguity handling. Its target loader currently obtains Race or Creature snapshot rules, not Special Ability contributions.

**Required boundary decision:** an ability's intrinsic immunity should eventually use the shared Interaction Rule contract with explicit Skill-source provenance, if approved. An existing Race/Form rule remains there and is only referenced. Pass 2 must not widen InteractionRuleOwner, add an ability target loader, or store a competing resistance modifier. Until that integration is designed, describe the intrinsic interaction as a manual rule.

## 3. Gaps

| Layer | Missing or unsafe today |
| --- | --- |
| Authoring | Special Ability mechanics UI; intrinsic-vs-external ownership guidance; capabilities; approved override slots; progressive intrinsic rules; per-owner choice definitions; explicit successful/failed outcome descriptions |
| Storage | Strict codec for this extension; safe partial extension writes and stale-save rejection; stable rule/resource keys; version isolation; reference validation and delete/change guards for its JSON |
| Character resolution | Dedicated saved-fact projection; clear possession versus purchased progression; per-owner chosen Attribute/weapon/element; unavailable/manual diagnostics; provenance; contextual Form preview without feeding bonuses back into access |
| Display | Shared mechanics summary on Skill preview, Characters, print and tabletop; conditional explanations; unsupported-version and missing-reference display; distinction between eligibility and execution |
| Future runtime | Named Character resources; activation costs/outcomes; ability-owned interaction integration; passive synchronization; trigger events; links between actors; targeting/areas; approved exception consumers; duration/recovery/history; coordinated Form/Evolution/ownership consequences |

A JSON field can store arbitrary text today. That does not mean the system can validate, resolve or execute the mechanic safely.

## 4. Production requirements audit

The [complete 86-entry requirements matrix](../reports/special-ability-mechanics-production-matrix-2026-09-30.md) is part of this report. It lists every audited Skill ID/name, candidate requirements, ownership boundary and unresolved questions. Categories are nonexclusive and are design requirements, not authored mechanics.

All 86 rows are active Special Abilities, IDs 1053–1138, with null tier and Attribute fields and **no extensions attached**. The only extension families found in the Production inventory were 371 spell-construction documents at version 6 and 371 spell-import-source documents at version 1. These counts are a dated catalog snapshot, not a claim about the deployed application build.

The breadth is real: sensing, modifiers, casting exceptions, event-dependent actions, resources, actor links, body transformations and manual rulings all appear. No generic prose-to-effect conversion is justified. Probability Manipulation demonstrates why structured manual rules are a first-class outcome, not a failed automation attempt.

## 5. Proposed architecture

### Storage and identity

Use skill_extension with extension_type **special-ability-mechanics**, initially schema_version **1**. The Skill remains the root identity and description owner. Do not add a Special Ability root table or convert it to a Derived Ability.

Document identity is the parent Skill ID plus extension type. Rule identity is that document identity plus an immutable local rule key. Future intrinsic resource identity is the parent Skill ID plus immutable resource key, never its editable display name or extension-row ID.

Do not duplicate the Skill's name, classification, progression, owned Forms, or Character state inside the document. A schema version is a format version, not a content revision.

### Concrete Pass 2 document shape

The following is a design contract, not implemented code or populated game content:

| Field | Pass 2 shape and meaning |
| --- | --- |
| schemaVersion | Literal 1, equal to the extension row's schema_version |
| rules | Ordered array of RuleV1, empty is valid |
| RuleV1.key | Nonblank, immutable local identity; unique within this document |
| RuleV1.kind | capability or manual only in the initial foundation |
| RuleV1.title / description | Authored readable text; no replacement of the Skill definition |
| RuleV1.when | Explicit always, or any-of groups containing all-of typed conditions |
| RuleV1.references | Explicit Skill or Derived Ability references for documentation; no implied grant/execution |
| Capability payload | domain from a bounded display taxonomy (sense, movement, breathing, communication, other), plus authored limitations |
| Manual payload | Required adjudication notes; identifies what the G.O.D. must determine |

Capability categories are **display metadata**, not automatic permissions to fly, breathe, see or move. Neither accepted rule kind contains numeric modifier fields, resource balances, copied attacks or arbitrary executable objects. The Skill definition remains readable even without an extension.

Conditions initially accept only self progression, Skill possession, Derived Ability possession and manual context notes. Skill/Derived references use explicit positive IDs; self progression is implicit in the owning Skill and cannot point at a different ability's progression.

For implementation, make when a discriminated object: mode always has no groups; mode requirements has a nonempty groups array. Each group has a unique local key and a nonempty conditions array. Conditions also have unique local keys and exactly one of these payloads:

| Condition kind | Required payload |
| --- | --- |
| self-progression | Numeric operator and requiredValue; uses the owning Skill's purchased points |
| skill-possession | skillId and possessed/not-possessed operator |
| derived-ability-possession | derivedAbilityId and possessed/not-possessed operator |
| manual | Nonblank notes; always returns manual until a future explicit ruling system exists |

Documentation references are a separate discriminated union of kind skill with skillId, or kind derived-ability with derivedAbilityId. They have no grant amount, copied definition or execution command. Array order supplies display order; keys supply identity. No second sort-order field or evaluation priority is needed in v1.

A future format revision can add the rule families below. Unknown kinds/fields in an attempted v1 write must reject instead of silently being dropped. Do not advertise unimplemented resource/effect/override kinds as supported v1 data. Read an unknown future version as unavailable structured content while preserving its raw document.

### Rule families evaluated

These families are an initial design, not a permanently closed taxonomy. The small Pass 2 format is the first implementation boundary, not the eventual limit of the system.

| Family | Recommendation and owning boundary |
| --- | --- |
| Capability | Keep. Supports sensing, breathing, communication and other intrinsic capabilities with conditions and limitations. Anatomical movement remains Race/Form/Creature-owned |
| Manual / G.O.D. | Keep from the first version. Structured trigger/context, limitations and ruling notes where facts or mechanics are unresolved |
| Resource rule | Add in a later authoring version. Intrinsic resource definition, grant, maximum/recovery description or typed modification of an existing resource; no current value. No Shift Reserve numbers/defaults |
| Passive modifier | Add a narrow, typed use of shared modifier vocabulary later. Do not infer stacking, rounding, roll scope or convert speed percentages to Initiative. Body adjustments stay on Forms |
| Interaction rule | Do not create a competing family with independent resistance math. Later provide a shared Interaction Rule integration for intrinsic ability-owned interactions; external profiles remain references |
| Rule override | Add only registered slots owned by the target subsystem, with typed parameters and documented conflict behavior. Direct Casting needs casting/cost/outcome contracts, not a new caster |
| Activated / reaction / triggered intent | Add later as non-executing authoring. Reuse cost/condition/limit concepts and Mechanical Effects only for effects genuinely owned here. Reference existing spells, attacks and Items |
| Choice / binding | Required addition to the design: selected Attribute, element, weapon, talent or sphere can differ per owner. Definition declares a choice; a future Character-owned selection stores the choice. Never overwrite the global Skill to record one Character's selection |
| Outcome branches | Required for success/failure/backlash descriptions such as Direct Casting and Moonshadow Omen. Later typed outcome vocabulary must use the existing roll result, not invent a percentile engine |
| Actor link / mark | Needed for Bond, Chain and Mark abilities. Begin as manual descriptions; a future runtime relationship needs participant identities, expiry, sharing direction and cycle rules. Creature ownership is not a substitute |

Keep small bounded value forms when numerical authoring is introduced: explicit constants, approved self-progression scaling, or authored thresholds with declared units. Do not accept JavaScript, SQL, evaluated strings, arbitrary formulas or an unbounded rules tree. If stacking or a scale is ambiguous, retain manual text until the designers settle it.

### Contract for future Special Abilities

- **Compose supported mechanics as data.** An ability can contain multiple intrinsic rules with different conditions, plus typed references to other owners. No behavior may be selected by a hard-coded catalog name, Production Skill ID, or a predefined list of the current abilities. IDs remain valid as authored content references, not implementation switches.
- **Extend shared rule families when necessary.** A new mechanical concept gets an explicit typed contract, validator, summary and read-only resolver behavior, followed by authoring controls and any separately authorized runtime consumer. Keep these responsibilities organized by rule family so adding one does not require separate implementations for Character, print and tabletop. An internal typed dispatch is sufficient; this does not require an arbitrary scripting or plugin system.
- **Preserve unsupported concepts faithfully.** Every future ability can retain its authored description and structured manual/G.O.D. rules before a suitable typed primitive exists. Show which portions need a ruling or lack automation. Manual support does not mean the mechanic has numerical resolution or runtime support, and it must not force the designer to change the ability to fit an unrelated field.
- **Version additions without changing old meanings.** Introduce new kinds or changed contracts through explicit format evolution, retaining stable rule identity where appropriate. Older documents remain readable. Older clients preserve newer documents and cannot erase or silently downgrade them. Replacing a manual rule with typed authoring requires explicit author review; it must not leave both as competing active definitions.
- **Keep ownership independent of catalog growth.** A future mechanic that belongs to Forms, Spells, Items, Evolution, Creatures or Interaction Rules extends or references that owning system. Adding a Special Ability never creates permission to duplicate its mechanics in the extension.

Coverage therefore has three explicit levels: authorable/readable, structurally resolvable, and runtime-supported. The first must accommodate any future Special Ability; the latter two grow through reviewed shared primitives and integrations. No fixed schema can promise automatic execution of every mechanic that might be invented later.

### Single progression contract

**Recommendation for new intrinsic rule conditions: use the existing persisted purchased Skill-points contract, getCharacterSkillPointsById.** Call it "purchased points" in fields and explanations, not an ambiguous percentage or "power level." For repeated paths it is the maximum saved allocation, exactly as existing Form and Derived progression requirements already work.

This adds no second stored progression value, does not alter Rank or rolls, and keeps qualification independent of the benefits it could grant. Possession is evaluated separately. An ability granted by a Race with zero purchased points is possessed but has zero purchased progression. An always rule can still be described for it; no threshold is inferred from that grant.

This is an architectural recommendation for review, **not a ruling that every percentage in Production prose means purchased points**. If Brannan and Ember intend racial contributions or calculated Rank to govern intrinsic Special Ability progression, approve that as an explicit contract change before authoring numerical conditions. Do not add a per-rule choice between purchased points, effective points and Rank merely to avoid making this decision; that would create inconsistent progression semantics.

Pass 2 may implement and test this recommendation using synthetic fixtures. No existing Form requirement, Derived requirement, Skill calculation or Production description changes.

### Conditions, resolution and ordering

Reuse the shared numeric and possession operators. AND/OR is justified by abilities with environmental alternatives and progressive context restrictions; two levels (OR of AND groups) are sufficient. Do not add arbitrary nesting.

Require a deliberate always mode. In requirements mode, reject an empty group/list so an unfinished condition does not accidentally become unconditional. Compare finite nonnegative purchased facts. Missing authorized context is unknown/manual; a complete saved allocation map with no entry means zero. Unknown possession must remain unknown for both possessed and not-possessed.

Evaluate possession and saved Normal-state facts first. Then evaluate this document's conditions and produce explanations. Never feed its projected modifiers, a preview Form's additions or its potential grants back into eligibility. External references are lookups, not recursive resolution of other Special Ability documents.

Possession of the owning Special Ability is an outer eligibility gate. Conditions cannot make an unpossessed ability available. In a definition-only catalog view, show the authored conditions without pretending an owner has met them. A self-reference used to explain possession is a fact lookup, not a request to resolve the document again.

A pure result should identify source Skill, format/revision, possession sources, purchased progression, each rule key, matched/not-matched/manual status, reference diagnostics and readable payload. Also distinguish absent document, invalid document and unsupported version. "Matched" means its authored conditions match; it does not mean activated, applied or paid.

Archived or missing sources remain visible to authorized existing readers with diagnostics. Do not turn an archive into a silent removal of established Character knowledge, or let missing content become a free/default mechanic.

### Explicit references and lifecycle

| Target | Existing identity / lifecycle | Proposed handling |
| --- | --- | --- |
| Skill / Special Ability | skill.id; archive fields; restrictive relational dependencies; special handling for JSON spell refs | Pass 2 supports explicit Skill references; validate existence/read access, lock target and reject new archived assignments. Preserve external IDs on independent copies |
| Derived Ability | derived_ability.id; archive and ownership/use history restrictions | Same explicit reference discipline; consume resolved possession, never create ownership. Pass 2 supported |
| Race Form | Saved Form ID plus Race ID; local key; owned children cascade | Later reference exact owner + ID, verify ownership. No name lookup or Variant ancestry. Shift Forms uses a derived backlink from Form access, not a second list |
| Creature Form | Saved Form ID plus Creature ID; local key; independent snapshots | Same exact ownership; snapshots retain snapshot-local provenance. Copies remap local identities only when copying that owning aggregate |
| Item | items.id; owned instance ID is distinct; lifecycle guards | Later typed definition reference; owner-selected actual weapon/charges belong to Character/Item state. Preserve external definition references, never copy balances |
| Movement mode | Text labels and owner-local movement rows, no global stable mode catalog established | Do not invent a global ID or deduplicate by label. Use exact owner's row/key later, or manual text |
| Damage type | Existing authored vocabulary/string matching, not a universal FK catalog | Use the existing source contract when introduced; do not invent numeric catalog IDs or a second normalization scheme |
| Resource | Canonical Mana system; HP pool key; exact Item instance; no generic ability resource identity yet | Distinct typed variants later. Intrinsic definition identity uses owning Skill + resource key. Text resourceKey alone cannot resolve a pool |
| Mechanical Effect | Inline typed value with owner-local position/key; no universal effect catalog | Author inline only when intrinsic. Reference another owner's effect via that owner's stable identity once supported; never use a regenerated serial child ID |
| Interaction Rule | Profile owner + local rule key; local conditions; selected tag/Creature refs | Preserve owner provenance; no universal rule library assumed. New ability ownership and safe rule-removal guards need a separate approved integration |
| Spell / magic framework | Skill extension or saved Character spell document; canonical systems/framework IDs | Reference the actual source kind. Reuse framework validation and spell ownership; do not duplicate construction |
| Creature ability / Evolution | Creature canonical/local snapshot identity; Evolution source/path identity and retained history | Later explicit kinds only when needed; follow native clone/remap/history contracts, not a polymorphic ID |

Pass 2 needs no generic polymorphic reference table. For its two supported external kinds, parse references in conditions and documentation links; validate them transactionally and extend the corresponding lifecycle dependency checks. [skill-framework-reference-service.ts](../../src/features/skills/skill-framework-reference-service.ts) demonstrates locking serialized references against concurrent lifecycle operations.

Use deterministic lock ordering and a locked fresh parent read. A target deletion must lock the same target before scanning references. Missing, malformed or unsupported referencing documents must not make deletion appear safe; fail closed for destructive operations that cannot establish the dependency set. Add a reference index only if measured scale later requires it, and make it a rebuildable projection of the document, not another authoring surface.

This is service-level reference integrity, not a database FK inside text JSON. Every supported writer/importer and lifecycle path must use the same locking and validation protocol. Direct SQL can bypass it. If future operational requirements demand database-enforced protection, propose explicit typed dependency projections with restrictive FKs in a separately reviewed migration; do not claim the current extension table provides that protection.

Extending to Form, Item, local Interaction Rule or resource references is conditional on implementing that target's removal/rekey guards in the same pass. Race/Creature root lifecycle checks alone cannot protect a Form removed during a normal save.

Archive the parent Skill without erasing its extension; exclude archived sources from new assignment while retaining authorized existing displays. Hard deletion follows existing restrictions plus the new inbound-reference checks. Removing a referenced local key later must be blocked or accompanied by an explicit atomic reference update; never silently redirect by name.

A future explicit Skill clone copies authored content and stable local keys under a **new Skill namespace**, preserves external references, and does not copy runtime state. Unsupported documents must be preserved or make the clone unavailable, not disappear. No Skill clone UI is required in Pass 2.

### Save, version and validation contract

1. Enforce existing root-edit authorization on the server. Classification must resolve to Special Ability after normal core normalization. Reject changing away from Special Ability while the extension is attached unless an explicit detach is included.
2. Decode strictly before accepting a write. Match envelope/row versions, validate discriminated shapes, bounded size/counts, unique immutable keys, finite values, permitted operators and nonblank required guidance. No arbitrary extra properties.
3. Keep absent, intentionally empty and explicit removal distinct. No extension means legacy narrative behavior; an empty document is valid and non-executing.
4. Replace bulk extension deletion with explicit per-type upsert/removal semantics. Omitted families are preserved. Update the spell editor's detach path explicitly and retain current spell validation.
5. Require a server-issued revision token over the saved aggregate/document bytes; compare after locking the fresh root. Existing timestamps may contribute, but a canonical hash of the relevant saved content avoids relying on timestamp precision. Reject stale full-Skill writes, not just stale mechanics-tab writes.
6. Preserve unrelated and unsupported extension rows byte-for-byte when not intentionally edited. Isolate parse errors so a bad/newer optional extension can be reported without destroying the underlying Skill description.
7. Validate external reference existence, authorized access, type and archive retention against the freshly saved state in the transaction. The server resolves labels.
8. Future format upgrades are explicit, deterministic and tested. Decoding must not persist upgrades, infer mechanics from definitions, or downgrade unknown formats.

## 6. Ownership boundary matrix

| Mechanic | Authoritative owner | Allowed Special Ability contribution / unresolved issue |
| --- | --- | --- |
| Skill percentile, Rank and investment | Existing Skill/Character allocation and roll rules | Read facts; never store alternate progress or change roll semantics |
| Intrinsic Special Ability mechanic | Its versioned Skill extension | Author only the ability's own rule |
| Race trait / racial grant | Race definition and Race Skill links | Reference the grant; do not mirror Race traits |
| Race or Creature Form access | Exact Form's access requirements | Read backlinks/explanations; no duplicated unlock thresholds |
| Form transformation | Exact Form's transformation definition | Universal intrinsic exception may be authored later through an approved Form rule slot; overlap/precedence needs design |
| Form anatomy | Form body / anatomy system | Reference only |
| Form Attributes | Race Form adjustments or Creature Form replacement/scaling | Never copy body adjustments into passive ability modifiers |
| Movement | Normal Race/Creature or Form movement; Character permanent advancement; existing runtime modifiers | An intrinsic capability/temporary modifier may be described, but whether a new Flight entry changes base speed requires design |
| Natural Protection | Race/Form protection or Creature defense system | No second armor/Soak profile in an ability |
| Natural Attacks | Race/Form Natural Attack or native Creature attack definition | Breath anatomy, attack profile and on-hit construction stay with the chosen attack owner; progression-only intrinsic contributions need explicit design |
| Interaction Rules | Existing profile and shared incoming-effect semantics | Ability-owned interactions need a shared-system extension; existing profiles must not be copied |
| Spell behavior | Spell Construction/casting systems | Typed exception/reference later; Direct Casting's pool selection, failure and access semantics require design |
| Item behavior | Item definition/powers/runtime and exact owned instance | Describe a chosen-Item interaction; no duplicate Item profile or balance |
| Evolution | Evolution requirements, transition, execution and history | Reference eligibility/context later; no inferred Evolution milestones |
| Creature behavior | Native Creature definitions and individual snapshots | Reference; never turn Creature abilities into Character Skill scripts |
| Creature ownership | Existing owned Creature/individual ownership services | Bonds/marks are not permission transfers; relationship semantics need design |
| Character runtime resource state | Authorized Character state service, future named-resource subsystem where needed | Extension defines entitlement/maximum/recovery only; current value/history belongs to the individual |
| Per-owner choices | Future Character-owned ability binding, tied to existing possession | Attribute/element/weapon choices must not edit the shared Skill |
| Link/mark runtime state | Future relationship/effect service | Lifetimes, sharing, actor permissions and cycles need design |

**Shift Forms test:** the Form editor remains the only place for Animal/Hybrid/Beast access, body, movement, protection and attacks. The ability can display which existing Forms reference it using a read-only query. It does not store that list or grant access itself. If approved later, Shift Reserve's definition could be intrinsic to Shift Forms, while its current value belongs to the Character. No maximum, recovery rate, spend, threshold, Form or universal transformation exception is authored here.

## 7. Runtime-deferred contract

The authoring project may prepare validated definitions, stable source identities, reference diagnostics, read-only condition results and summaries. Later display passes can compose the same result into Character, preview, print and tabletop views under existing permissions.

Until a separately authorized runtime pass, all of the following remain non-executing:

- Activation, reaction windows, event subscriptions, automatic triggers and use logging.
- Spending/refilling Mana, HP, Quintessence, ammunition, Item charges, Initiative or named resources.
- Creating current resource rows, initializing balances, applying recovery ticks or reconciling a changed maximum.
- Passive-effect synchronization, damage/healing, Conditions, roll/Attribute/Soak modifiers and durations.
- Casting-rule changes, rerolls, spell duplication, interruption, timing or combat declaration changes.
- Transformation, Form access changes, anatomy/equipment changes, Natural Attack execution and Evolution.
- Actor linking, control, Creature ownership, shared damage/senses, permanent Skill transfer and allocation changes.

Do not add Special Ability to active source-kind unions or route its resolver through existing mutation-capable Derived/Spell/Item services. No "Apply," "Activate" or "Spend" button may imply supported execution. A matching condition remains a read-only statement.

Future tabletop display must respect the existing public/private boundary, including sealed combat resource projections. Historical outcomes must retain the definition revision and frozen facts that produced them, not recalculate against later live edits.

## 8. Implementation-ready Pass 2 recommendation

**Build the document and integrity foundation only. No production content conversion and no runtime.**

| Work unit | Exact proposed scope |
| --- | --- |
| Domain | New src/features/special-abilities/models.ts and codec.ts for the v1 envelope, manual/capability rules, stable keys and explicit conditions/references |
| Extensibility | Organize validation, summaries and resolution by typed rule family; document the steps for adding a family/version. Do not couple accepted ability identities to the Production audit or add ability-name/ID behavior switches |
| Conditions and summaries | New pure resolution.ts and summaries.ts using shared requirement primitives and the purchased-points recommendation; return explanations and diagnostics without applying effects |
| Skill integration | Update the existing Skill action/draft contract for optional mechanics, explicit per-family mutation, unknown-extension preservation and locked revision checks; retain ordinary Skill and spell behavior |
| Reference integrity | New reference-service.ts for Skill/Derived IDs; extend both target lifecycle dependency paths. Validate archive retention, missing targets and concurrent deletion |
| Read boundary | Provide a server-authorized read projection of the document plus saved Character facts for later consumers; return definition-only output if owner facts are unavailable. Do not persist derived results |
| Documentation | Document allowed fields, no-execution guarantee, progression wording and extension compatibility. Apply existing field guidance and semantic theme rules when a UI is added later |

No schema migration is required for this bounded foundation: the existing extension table can store it, and reference integrity can follow the existing serialized-reference service pattern. No new resource/ownership/effect tables, no deployment, and no game data seed should be part of Pass 2.

Do not include a complete authoring UI, every proposed rule family, Character/print/tabletop rollout, native-system redesign or resource runtime in this foundation. Those are subsequent explicitly scoped passes. Pass 2's contract/tests and server serialization must be solid before authoring richer families.

Acceptance checks for Pass 2:

1. Synthetic manual/capability documents round-trip, and absent/empty/remove are distinguishable. No Production ability is used as a generated mechanic fixture.
2. Ordinary Skill and Spell Construction behavior remain unchanged; saving either editor preserves unrelated and future-version extensions. Explicit spell/mechanics detach works.
3. Unsupported versions, malformed JSON, version mismatch, bad kinds/keys/conditions and unauthorized/classification-incompatible writes give visible errors without data loss.
4. Stale drafts cannot erase another editor's extension; concurrent writes/deletion/archive tests use a disposable database with explicit target verification.
5. Skill/Derived references survive legitimate copies, preserve retained archived links, reject new archived/missing/unauthorized targets and prevent unsafe deletion. Unknown documents cannot bypass destructive checks.
6. Purchased points, multiple paths, zero-point racial possession, missing context, negative possession and AND/OR/manual truth tables match the declared contract.
7. The pure resolver mutates neither inputs nor persisted state and imports no spending, effect application, spell-casting, Form/Evolution execution or passive-sync service.
8. Run focused domain and disposable persistence/lifecycle checks, TypeScript, affected lint and whitespace checks. If no interface is changed, do not claim browser verification.
9. Use synthetic ability identities absent from the Production catalog to verify that supported rule combinations round-trip and resolve through the same path. Renaming an ability must not change its mechanical interpretation.
10. Verify the future-mechanic path: a manual rule can preserve an unrepresented concept without pretending it executes; a newer typed document is reported as unsupported and preserved by an older reader/writer. Document how a future rule family joins the shared projections without changing existing family semantics.

### Decisions to review before richer rule authoring

- Accept or explicitly revise purchased points as the single intrinsic progression input; never translate Production percentages automatically.
- Choose how intrinsic ability-owned resistance joins Interaction Rules without copying Race/Form profiles.
- Set per-owner binding semantics for selectable powers, Attributes, elements and Items.
- Decide breath/sonic attack ownership and how progressive access references that attack.
- Define actual named-resource values, units, maximum changes, recovery and ownership; no Shift Reserve defaults.
- Approve target-system override slots, conflict handling and success/failure meanings before encoding them.
- Decide whether Form-granted temporary possession can expose intrinsic abilities in a preview; it must never bootstrap saved access or acquisition.

### Evidence and verification of this pass

Production was inspected in a repeatable-read, read-only transaction with read-only connection defaults and an explicit database/read-only check. Queries inspected catalog definitions and extension metadata; no Character data or credentials are included in the report. The transaction was rolled back. No Production/shared DEV writes or migration application occurred.

The local ignored evidence file is artifacts/guidance/special-ability-pass-1/production-catalog.json, SHA-256 aef86727deddb6f2b0f70e095db3120f260df32bd6124f0c12a1464401b1d101. The matrix is the reviewable catalog deliverable; the raw snapshot is not added to Git.

This pass changes documentation only. Coverage, file links and whitespace are checked; application tests/build/browser automation are not claimed because implementation and runtime were not changed. These recommendations remain proposals for review, not permission to execute Pass 2.

