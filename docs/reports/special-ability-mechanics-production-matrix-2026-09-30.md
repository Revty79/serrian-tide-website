# Production Special Ability requirements matrix — September 30, 2026

Companion to the [Pass 1 architecture contract](../architecture/special-ability-mechanics-pass-1.md). This is a requirements classification of the stored descriptions, **not an authored mechanics document**. No rules, thresholds, effects, Forms, resources or Evolution paths were created.

This catalog is an initial coverage sample, not the system's supported-ability list. Future Special Abilities must be able to compose the same primitives, retain unfamiliar mechanics as explicit manual authoring, and introduce reviewed new rule families where needed. Neither these names/IDs nor these requirement categories may become a fixed implementation limit.

Evidence: serrian_tide_prod, read-only repeatable-read transaction, 2026-09-30T13:09:01.213Z. All 86 Special Abilities were active; IDs 1053–1138; no attached extensions; all had null tier, primary Attribute and secondary Attribute. Names below preserve catalog identity. Similar names do not imply shared mechanics or permission to merge records.

The raw local snapshot is ignored by Git at artifacts/guidance/special-ability-pass-1/production-catalog.json. SHA-256: aef86727deddb6f2b0f70e095db3120f260df32bd6124f0c12a1464401b1d101. Catalog findings are dated; this audit does not establish the deployed application's code revision.

## Reading the matrix

Tags indicate apparent authoring needs, not implementation readiness:

| Tag | Requirement |
| --- | --- |
| P | Progressive capability/modifier or described increase with mastery; no implied interpretation of percentages |
| C | Capability, sensing, communication or permission |
| M | Attribute, roll, defense, damage, speed or similar modifier |
| R | Resource capacity, balance interaction, expenditure or depletion; not necessarily a new resource |
| A | Intentional activation or action-like effect |
| T | Event/trigger-dependent behavior |
| U | Duration, use count, recharge, cooldown or other temporal boundary |
| E | Target, area, damage/healing or Condition effect |
| L | Relationship, bond, mark or link between actors |
| V | Movement, teleportation, phasing or action timing |
| I | Resistance, immunity, vulnerability, absorption or other incoming interaction |
| O | Exception to an existing rule/system |
| F | Form/transformation or appearance/body boundary |
| X | Reference to existing authored content/system |
| Q | Per-owner choice, bound source or context-dependent variant |
| G | Explicit/manual G.O.D. resolution or insufficiently specified behavior |

All rows require designer review before numerical authoring, whether G appears or not. "Progressive" does not decide whether changes accumulate or replace earlier effects. "Effect" does not imply existing runtime can execute it. A duration/cost omitted from the description stays unspecified, rather than defaulting to free, unlimited or permanent.

## Complete catalog matrix

| ID | Catalog name | Candidate needs | Ownership boundary and unresolved requirement |
| --- | --- | --- | --- |
| 1053 | Attribute Boosters | P, A, M, U, Q, G | Intrinsic temporary Attribute effect; Character owns the selected Attribute(s). The progression list and mechanical scaling disagree, including boundary/all-Attribute wording. Preserve for review; do not derive a formula or settle duration/success interpretation. |
| 1054 | Berserker Rage | A, M, U, E, G | Intrinsic boost and control/failure consequences. Requires a defined roll outcome, affected Attributes, duration and targeting restriction. Do not confuse temporary changes with Form anatomy or permanently allocate points. |
| 1055 | Shape Shifting | P, A, F, X, G | Actual bodies and access belong to Forms. Ability-wide transformation constraints/failure may be intrinsic. Setting limits, permissible forms and failed return require G.O.D. design; no generated Form list. |
| 1056 | Wild Talents | P, A, Q, X, R, G | Owner-selected talent/tradition/effect and effective capacity may need binding plus spell references. Do not create a new spell engine or interpret effective mana wording as a persisted pool automatically. |
| 1057 | Super Powers | P, A, Q, E, G | Chosen power differs by owner; scope and limitations are adjudicated. Needs a bounded choice/manual contract before a generic numerical effect can be justified. |
| 1058 | Telepathic Bond | P, C, L, E, U | Shared communication/senses require actor identities, range/count and link termination/feedback semantics. A link is neither Creature ownership nor permission to expose another Character's private sheet. |
| 1059 | Shadow Manipulation | P, A, C, V, E, X, G | Concealment, constructs, movement and creatures span multiple owners. Lighting, failure and summoned content require context; reference Creature/Form definitions where applicable instead of copying them. |
| 1060 | Energy Channeling | P, A, Q, R, E, I, G | Mixed chosen-energy attack, absorption, redirection and healing needs outcomes and source/target facts. Interaction Rules own incoming math. Resource conversion and transformative interpretation remain unapproved. |
| 1061 | Gravity Manipulation | P, A, M, V, E, X, G | Affects weights, motion and zones. Item weight remains Item data; environment/action effects require a scoped override or manual ruling, not overwriting catalog values. |
| 1062 | Spell Weaving | P, A, Q, O, X | Separate supernatural traditions and multi-effect casting require typed spell-system references and per-owner choice. Spell Construction owns the combined spell; do not duplicate its progression or calculation. |
| 1063 | Adrenaline Surge | P, A, M, U, V, E | Speed/damage benefits and fatigue need effect and duration definitions. Percentage speed is not automatically Initiative or extra actions; exact timing integration needs design. |
| 1064 | Arcane Ward | P, A, R, I, E, U | Absorption capacity and reflection suggest barrier state plus incoming interactions. Decide whether there is a resource at all, its depletion and recovery. Do not represent it as HP or Natural Protection by default. |
| 1065 | Battlefield Intuition | P, C, M, G | Prediction and evasion are described without actionable amounts. Capability/manual text fits initially; a defense modifier or timing exception needs explicit rules later. |
| 1066 | Elemental Affinity | P, Q, M, I, X | Chosen element plus potency/resistance needs per-owner binding. Incoming resistance/immunity must use shared Interaction Rules; distinguish an intrinsic ability contribution from an existing racial profile. |
| 1067 | Feral Instinct | P, C, I, G | Sensory benefits and overload resistance need scope, ranges and environmental conditions. Sensory anatomy remains its existing owner; do not create a universal numerical perception bonus from adjectives. |
| 1068 | Kinetic Burst | P, A, E, V | Damage, area and knockback require target geometry, distance and outcome semantics. Use existing effect vocabulary where sufficient; forced movement remains a separate future runtime concern. |
| 1069 | Phase Step | P, A, C, V, U | Phasing/teleport/barrier traversal need destination validity, duration and use limits. Capability alone cannot imply a move or disregard collision; body replacement, if any, belongs to Forms. |
| 1070 | Psychic Shield | P, C, I, X | Mind-control/fear/telepathy protection is broader than damage resistance. Reuse shared immunity/condition interactions where representable; target-magic categories and degrees remain unresolved. |
| 1071 | Time Dilation | P, A, V, O, U | Reaction/action-time changes and stopped time need approved combat timing slots. Do not equate this with a flat Initiative modifier or author an alternate scheduler. |
| 1072 | Weapon Bond | P, Q, L, M, C, X | Bind an actual chosen weapon; recall/accuracy/imbuing cross Item and ability ownership. The definition must not contain a Character's Item instance or copy its attack profile. |
| 1073 | Combat Casting | P, O, X, G | Moving/defending and concentration exceptions belong at casting boundaries. The description expressly retains casting time and Initiative requirements; a generic "instant cast" override would contradict it. |
| 1074 | Blood Frenzy | P, T, M, E, U | Blood/damage triggers, escalating benefits and loss of control require authoritative event facts and ending rules. Missing trigger detail must stay manual. |
| 1075 | Iron Will | P, C, I | Fear, intimidation and coercion resistance needs effect taxonomy and degree. Interaction Rule immunity can describe some outcomes; broad mental resilience is not a universal damage percentage. |
| 1076 | Weapon Mastery | P, Q, M, C, X | Chosen weapon category, accuracy/damage and maneuver access require existing weapon/Skill governance references. Do not copy a weapon tree or create free Skill allocations. |
| 1077 | Shadow Step | P, A, V, U, E | Lighting-dependent movement, frequency and attacks during transitions need environmental conditions and action timing. Reference existing attack sources instead of duplicating damage. |
| 1078 | Aura of Defiance | P, C, E, I, U, G | Allies and enemies receive different morale/fear effects. Needs relationship targeting, radius and duration; morale vocabulary is not yet a universal modifier channel. |
| 1079 | Runic Empowerment | P, A, X, E, U | Runes on Items/surfaces and temporary/permanent/dispel behavior cross Item and magic ownership. Reference the authored rune/power; do not store a second Item/spell definition. |
| 1080 | Spell Echo | P, A, T, R, U, O, X | Refers to a previous successful cast and changes cost/use limits. Needs history identity and typed casting exception; freeze the source cast rather than reading a mutable "last spell" name. |
| 1081 | Blood Pact | P, A, R, M, E | HP sacrifice and benefits require an explicit authoritative Health pool and cost/outcome ordering. A generic resourceKey string is insufficient; do not assume full-body versus local damage. |
| 1082 | Tactical Reload | P, O, V, X | Reload, swapping and mid-action handling belong at firearm/equipment timing boundaries. Keep ammunition and exact Item state in existing services. |
| 1083 | Illusion Weaving | P, A, C, E, U, G | Multi-sensory, interactive deception with contradiction-based limits needs readable capability/context rules. Belief, magical senses and resistance remain adjudicated until specified. |
| 1084 | Blade Dance | P, A, V, M, E, O, X | Chained attacks, defense and movement require existing combat action sources and scheduling. No inferred extra actions or parallel attack resolver. |
| 1085 | Mana Surge | P, A, R, M, E, U | Spell potency, fatigue and backlash need a defined relationship to existing Mana and spell calculation. Do not infer a larger pool or refill merely from the name. |
| 1086 | Guardian’s Stance | P, A, M, I, E, U | Block/parry/knockback and nearby-ally protection need selected subjects, reach and duration. Defense/interception rules remain with combat; incoming prevention uses shared interactions. |
| 1087 | Vital Strike | P, A, M, E, O, X | Exposed targets, critical effects and armor bypass need attack facts and protection-stage rules. Natural attacks/weapons own their base attack; this may contribute an approved intrinsic exception. |
| 1088 | Battle Trance | P, A, C, V, O, U | Awareness and action chaining include reacting before an attack commits. Needs explicit event/timing model; does not justify bypassing combat declarations. |
| 1089 | Arcane Overload | P, A, M, E, U, X | Temporary spell damage increase with fatigue/backlash should reference spell effects. Stacking, rounding and consequences need design; do not alter spell documents on activation. |
| 1090 | Spirit Bond | P, L, C, X, G | Familiar/spirit connection and shared abilities/senses require actor identity and sharing rules. Creature definition/ownership remain separate and no linked Skill is automatically acquired. |
| 1091 | Battle Cry | P, A, E, I, U | Allied morale and enemy intimidation need target groups, range, duration and opposed outcomes. Start manual where morale has no formal numeric contract. |
| 1092 | Mind Pierce | P, A, E, O, U | Mental attack, concentration interruption, fear and unconsciousness need effect/outcome branches and defensive context. Interruption must use the existing casting/combat boundary. |
| 1093 | Earthshatter | P, A, E, V, G | Ground shock, knockdown and structure damage need area/terrain/target facts. Character damage tools alone do not resolve structures or environmental changes. |
| 1094 | Soul Rend | P, A, E, O, L, G | Spiritual injury, armor bypass and severed bonds need distinct targets and resistance rules. No "soul" resource or relationship state is created from the description. |
| 1095 | Wind Walk | P, A, C, M, V, U | Speed, gliding and levitation require capability limits and motion rules. Decide intrinsic movement contribution versus Form movement before storing numerical changes. |
| 1096 | Mana Burn | P, A, R, E | Target Mana drain converted to damage requires source and target pools plus atomic multi-resource consequences later. Existing generic Health effects do not define the conversion. |
| 1097 | Mirror Strike | P, A, T, E, X, O | Copies an opponent's attack; needs a referenced event/source snapshot, eligibility and timing. Do not clone the opponent's mutable Item or copy its catalog attack permanently. |
| 1098 | Spirit Chain | P, A, L, E, C, U | Linked damage/senses/abilities require participant count, sharing direction, expiry and cycle handling. Skill and Creature ownership are not the link state. |
| 1099 | Void Step | P, A, C, V, U, O | Intangibility, barriers and dimensional seals need destination/context and exception semantics. Avoid treating every obstruction as a normal movement modifier. |
| 1100 | Celestial Beacon | P, A, E, I, U | Area healing/morale and undead-target harm need separate target branches and creature facts. Health effects can be reused, but targeting and undead classification require explicit authority. |
| 1101 | Runic Overload | P, A, X, E, O | Discharges existing runes and breaks wards. Identify the authored rune/ward and its owner before defining destruction/depletion; a name is not a resource or spell reference. |
| 1102 | Blood Oath | P, L, M, E, T, G | Promise conditions, bonuses and breach consequences need actor links and G.O.D. judgments. Do not encode narrative promises as executable arbitrary predicates. |
| 1103 | Seismic Slam | P, A, E, V, G | Ground impact, knockdown and terrain/structure damage require area and environment handling. It remains a distinct Skill from Earthshatter despite overlapping requirements. |
| 1104 | Hunter’s Mark | P, A, L, C, U, E | Persistent target marking/sensing needs exact target identity and termination rules. "Until death" needs clarification about whose death, reach and dispelling. |
| 1105 | Stormcaller | P, A, E, V, M, U, G | Weather, zones and hazards affect movement and damage. World/environment state needs a separate authority; a Character modifier cannot represent the entire storm. |
| 1106 | Harbinger Elf Berserker Rage | P, A, M, C, E, G | Undead/necromantic targets and exclusions need reliable target facts. Preserve the living-target restriction. Light/ward and sensing effects need design, not inference from the generic Berserker Rage. |
| 1107 | Blood Legacy | P, T, L, X, O, G | Feeding-related memories/Skill transfer requires permanent progression ownership, donor identity and explicit acquisition rules. Never create allocations from prose or treat copied memories as owned Skills automatically. |
| 1108 | Vampiric Charm | A, E, X, O, U, G | Charm Sphere access and reverse-charm failure require spell/Skill references and distinct outcome targets. No cloned Charm spell or automatic Sphere grant. |
| 1109 | Vampiric Forms | P, F, C, V, A, E, U, X | Form unlocks/body details belong to Forms; humanoid flight and fear aura may be intrinsic. Separate those owners before authoring. Do not put a second list of Forms in the extension. |
| 1110 | Direct Casting | A, O, R, E, X, G | Casting without Mana, spells per success and failure depletion need typed casting/outcome hooks. Which Mana pool, spell access and exact failure interaction require design; existing casting remains authoritative. |
| 1111 | Purification/Corruption | A, E, F, U, G | Changes beings/substances with permanent implications and wing-related appearance. Needs targets, meaning of permanence and G.O.D. outcomes; do not automatically create a Form or Evolution. |
| 1112 | Shift Forms | P, F, X, G | Exact Form access, bodies, movement and Natural Attacks belong on Forms. Existing description's form numbering must not be converted automatically. Possible Shift Reserve is unfinalized and has no authored values here. |
| 1113 | Natural Camouflage | P, C, M, G | Progressive concealment needs environmental scope and detection rules. Capability text can describe it without inventing a stealth bonus. |
| 1114 | Sense Undead | P, C, E, G | Range, detail and sensing a controlling source need target facts and information-disclosure rules. Undefined detection categories remain G.O.D.-resolved. |
| 1115 | Dark Vision | P, C, G | Distinguish normal darkness, magical darkness, distance and detail. Do not assume an existing numerical roll modifier captures the permission to see. |
| 1116 | Magic Immunity | P, I, X, G | Described mitigation/immunity must use Interaction Rules semantics. Weaker/stronger magic and non-damage effects need explicit classification; no independent percentage engine. |
| 1117 | Hovering | P, C, V, U | Height, duration and maneuver limits are movement capabilities. Determine whether actual speed is supplied by a body/Form or an intrinsic rule before encoding it. |
| 1118 | Water Breathing | P, C, V, M, I, U | Breathing, swim speed and pressure resilience are different mechanisms. Keep body movement and incoming interactions in their owners; capability duration needs explicit terms. |
| 1119 | Flight | P, C, V, M, G | Distance/control/speed/altitude/carrying need structured limits and a movement owner. No default fly speed, wing anatomy or Initiative value can be inferred. |
| 1120 | Natural Leader | P, C, M, E, I, U | Stored definition calls itself Leadership; retain catalog identity Natural Leader. Group morale/fear and reach need target rules; do not merge/rename automatically. |
| 1121 | Poison Immunity | P, I, X, G | Toxin resistance, immunity and magical exceptions need shared incoming matching and a clear toxin taxonomy. Ordinary versus magical poison must not be guessed by name. |
| 1122 | Charm Ability | P, A, E, U, I | Target count, duration, resistance and compulsion need effects and opposed outcomes. Distinct from Vampiric Charm; no automatic shared spell/mechanic. |
| 1123 | Keen Hearing | P, C, G | Hearing range/detail and sensory limits are capabilities. Resolve environmental interference manually until authored; no automatic perception modifier. |
| 1124 | Keen Sense of Smell | P, C, G | Scent range/detail/tracking needs source/environment limits. Do not convert descriptive tracking strength into a Skill allocation or roll bonus. |
| 1125 | Keen Eyesight | P, C, G | Visual range/detail needs lighting and identification limits. Keep this distinct from Dark Vision and avoid inferred stacking. |
| 1126 | Vampiric Magical Immunities | P, I, X, G | Broad magic resilience retains Life and Fire vulnerabilities. Shared Interaction Rules must own represented math; "extreme" and "most potent" are not numeric rules. |
| 1127 | Dragon Fire | P, A, E, U, X, G | Progressive breath, burning and environmental fire need one attack owner plus effect/area/timing details. Decide Race/Form Natural Attack versus intrinsic attack design before authoring; do not duplicate both. |
| 1128 | Dragon Acid | P, A, E, U, X, O, G | Corrosion over time affects flesh, equipment and structures. Attack definition has one owner; Item damage/armor erosion require native-system rules beyond Health damage. |
| 1129 | Dragon Spark | P, A, E, T, X, G | Chaining, conductivity, stun and equipment effects need source/target/environment facts. Damage type and attack profile stay with the chosen attack owner. |
| 1130 | Dragon Frost | P, A, E, V, U, X, G | Slowing, freezing, immobilization and terrain changes need Conditions and area/duration rules. One breath attack owner; no automatic encasement/structure system. |
| 1131 | Dragon Sleep | P, A, E, I, O, U, X | Sleep, target count, resistance and bypass of physical defense require shared effect/protection semantics. This is not necessarily Health damage; choose an attack owner before implementation. |
| 1132 | Elemental Dragon Breath | P, A, Q, E, X, O, G | Element choice/layering and changing resistance interactions need a single attack definition and explicit multi-type rules. Do not merge separate Dragon abilities or invent resistance ordering. |
| 1133 | Full Sphere Access | P, C, Q, M, R, O, X | Sphere access, spell-roll contribution and reduced/free casting belong at existing Skill/casting boundaries. Access is not automatic allocation; exclusions and eligible spells need design. |
| 1134 | Echolocation | P, C, M, A, E, X, G | Sensing progresses into weak-point benefits and a sonic attack, with environmental penalties. Separate capability/modifier/attack ownership; do not invent a sound damage profile. |
| 1135 | Umbral Veil | P, C, I, O, G | Concealment from ordinary, technological and magical detection needs sensor context. Keep broad sensor exceptions manual until the target systems expose meaningful rules. |
| 1136 | Glamour Shift | P, A, C, F, Q, G | Appearance, voice/gait and biometric mimicry need a cosmetic capability boundary. A disguise does not automatically change anatomy, Attributes or create a Form. |
| 1137 | Moonshadow Omen | P, A, C, M, V, E, O, U, G | Multiple foresight outcomes, ally defense and enemy interruption need branches/choices and timing. Failure has explicit stun/roll-penalty text, but no effects were authored from it. |
| 1138 | Probability Manipulation | P, A, O, G | Explicitly plausible outcomes only, no impossible creation or automatic control of free will. Structured manual context/limits are the proper initial representation; no arbitrary chance script. |

## Category groups and representative design pressures

These are cross-references into the complete matrix, not additional catalog entries.

| Group | Representative records | Required design lesson |
| --- | --- | --- |
| Narrative/manual first | 1065 Battlefield Intuition; 1102 Blood Oath; 1138 Probability Manipulation | A valid rule can remain a readable G.O.D. ruling. None should be auto-converted |
| Passive/progressive capabilities | 1067 Feral Instinct; 1114 Sense Undead; 1115 Dark Vision; 1123–1125 senses | Capability descriptions need conditions and limits; not every capability is a modifier |
| Passive/conditional numerical contributions | 1066 Elemental Affinity; 1075 Iron Will; 1076 Weapon Mastery | Determine owner, channel and stacking before implementing math |
| Activated temporary modifiers | 1053 Attribute Boosters; 1063 Adrenaline Surge; 1089 Arcane Overload | Choose binding, progression, outcome and duration explicitly |
| Resource capacity/interaction/cost | 1064 Arcane Ward; 1081 Blood Pact; 1085 Mana Surge; 1096 Mana Burn; 1110 Direct Casting | Definition, maximum, current state and atomic multi-pool effects are separate concerns |
| Uses/recharge/history | 1069 Phase Step; 1080 Spell Echo; 1104 Hunter’s Mark | Explicit temporal scope and historical identity are needed |
| Triggered behavior | 1074 Blood Frenzy; 1097 Mirror Strike; 1107 Blood Legacy | Authoritative event facts and permissions precede automation |
| Targets, effects and zones | 1068 Kinetic Burst; 1091 Battle Cry; 1100 Celestial Beacon; 1105 Stormcaller | Current single-target effects do not supply all geometry, relationships or environment state |
| Relationships between actors | 1058 Telepathic Bond; 1090 Spirit Bond; 1098 Spirit Chain; 1104 Hunter’s Mark | Link state is neither Skill ownership nor Creature ownership |
| Movement and timing | 1069 Phase Step; 1071 Time Dilation; 1082 Tactical Reload; 1117–1119 movement abilities | Base movement, capability and combat timing have distinct owners |
| Resistance / immunity / vulnerability | 1070 Psychic Shield; 1116 Magic Immunity; 1121 Poison Immunity; 1126 Vampiric Magical Immunities | Shared Interaction Rules remain authoritative; ability provenance is a missing integration |
| Magic rule exceptions | 1062 Spell Weaving; 1073 Combat Casting; 1080 Spell Echo; 1110 Direct Casting; 1133 Full Sphere Access | Register typed rules with the casting system; do not build another caster |
| General rule exceptions | 1084 Blade Dance; 1087 Vital Strike; 1088 Battle Trance; 1097 Mirror Strike | Existing combat/action/protection consumers must explicitly support each exception |
| Form / transformation interactions | 1055 Shape Shifting; 1109 Vampiric Forms; 1112 Shift Forms; 1136 Glamour Shift | Form-owned body/access data must not be copied; cosmetics are not necessarily Forms |
| External authored-system references | 1072 Weapon Bond; 1079 Runic Empowerment; 1101 Runic Overload; 1127–1132 breath abilities | Reference exact definitions and preserve lifecycle/copy boundaries |
| Owner-specific choices | 1053 Attribute Boosters; 1056 Wild Talents; 1057 Super Powers; 1066 Elemental Affinity; 1072 Weapon Bond | Shared Skill content cannot store one Character's selected Attribute, element or Item |
| Mixed/complex outcomes | 1059 Shadow Manipulation; 1109 Vampiric Forms; 1134 Echolocation; 1137 Moonshadow Omen | Split intrinsic rules from native-system references; do not require one universal effect object |

## Issues that must stay unresolved until design review

- Progression prose uses points, percentages and qualitative mastery. The current Form/Derived requirement input is purchased points, while Character Rank can include other contributions. No row has been converted to a threshold on either basis.
- Attribute Boosters contains inconsistent progression descriptions. Shape Shifting, Shift Forms and Vampiric Forms also require ownership/meaning decisions; the audit does not choose body definitions or reconcile form numbering.
- Direct Casting has concrete cost/failure claims, but integrating them requires explicit Mana-pool, casting-access, success-count and percentile exception rules. Its description alone is not a safe runtime contract.
- Dragon breath and Echolocation combine progression and attacks. A natural attack can remain the authored attack owner while an ability supplies approved access/parameters later; whether that is the intended design is still for Brannan and Ember.
- Immunity prose includes degrees, broad categories and exceptions not all expressible in the current Interaction Rule matcher. No new resistance or damage taxonomy was invented.
- Soul injury, ward capacity, mana surges and runic discharge do not automatically establish new resources.
- Permanent skill transfer, purification/corruption, blood relationships and changes to form access must not be treated as automatically authorized Evolution, acquisition or ownership operations.
- All durations, areas, costs, targets, recovery values, stacking and failure choices not explicitly settled remain unspecified/manual. This matrix is the requirements inventory for designing the toolbox.

