# Shared incoming-effect planning (Pass 4)

**Current status:** the pure contract below is now integrated by [Pass 5](../reports/runtime-combat-integration-pass-5-2026-09-20.md). References to deferred runtime work describe the original Pass 4 boundary.

`resolveIncomingEffect` is one pure planning function for every supported source kind. It accepts finished source facts, an exact target context, an incoming amount/harmfulness, and a hit location when protection requires one. It returns what would happen, or explicit reasons the G.O.D. must rule. It performs no reads or writes and is **not connected to any combat execution path**.

Pass 3's `ProtectionLayers` remains the read model. Its storage, authoring and existing runtime consumers are unchanged. Pass 5 source adapters, ActionEffectPlan integration and consequence application are outside this pass.

## Input and target authority

`IncomingEffectInput` contains:

- `effect`: descriptive label, numeric amount for health effects (otherwise null), and explicit harmfulness for ambiguous effects.
- `source`: `IncomingSourceFacts`, described below. Mechanical Effect Kind identifies the incoming effect.
- `target`: `IncomingEffectTarget`, containing the exact `ProtectionLayers`, rule-owner identity and saved Interaction Rule profile (or null).
- `hitLocationKey`: exact anatomy key, or null when not needed.
- Optional `health`: authoritative current/maximum HP for reporting a proposed healing cap. No health reads or writes are inferred.

`getIncomingEffectTarget` is a server-only live read helper. It authenticates through the existing session service, checks current database roles/ownership, and reads in one **repeatable-read, read-only transaction**. There is no Server Action or new UI endpoint. Its internal transaction reader requires a trusted authenticated user ID, rechecks database permissions and target membership, and can be reused by an already authenticated server caller. It accepts no client-supplied role grant.

| Target | Rule authority | Protection authority |
| --- | --- | --- |
| Normal Character | Currently assigned Race's live profile | Live Race natural definitions, actual worn equipment, active Soak |
| Race NPC | Currently assigned Race's live profile | Same as normal Character |
| Creature NPC | `current_snapshot_json.core.interactionRules` | Individual snapshot anatomy, actual worn equipment, active Soak |
| Direct Creature | Exact encounter occurrence's `creature_snapshot_json.core.interactionRules` | Same occurrence's anatomy and local active Soak; no equipment layer |

No Creature master is read. Old snapshots without rules have no authored rules. An assigned Race's edits/reassignment affect subsequent live reads; nothing is copied into Character rows. Existing baselines and occurrence snapshots are untouched. Missing/unauthorized targets are access errors; they do not produce invented contexts.

**Identity:** encounter `ProtectionTarget.participantId` is the runtime key in `campaign_session_encounter_participant.character_id`, positive for a Character or negative for a direct Creature. It is never queried as the serial `participant_id`. The serial ID can appear only in a descriptive source identity after the runtime target has been selected.

Character access reuses `canReadActiveState`: owning G.O.D., eligible owning Player, or admin read. Direct Creature contexts require the owning G.O.D. or admin read (`canManageCampaignRecords`). Players cannot read another Character/NPC or direct Creature's private context through this helper.

The pure function clones all supplied inputs into its result. Later edits to the caller's source/target objects cannot change that result. Recalculation can consume the serialized input without a live read. This provides a future freezing boundary, not an ActionEffectPlan persistence redesign.

## Explicit source facts and matching

The shared source model carries:

- Damage Type and explicit Magical boolean.
- Source Kind: weapon, item, spell, derived-ability, skill, attribute, creature-attack, creature-ability, no-roll or manual.
- Weapon Family: firearm, explicitly none, or unknown.
- Item Properties: name, nullable value, optional related Creature canonical ID.
- Item Tag canonical IDs.
- Mechanical Effect Kind: health.damage, health.heal, condition.apply, modifier.apply or manual.
- Condition Name.

Null facts mean unknown, and null collections mean the authoritative collection was not supplied. Empty property/tag arrays mean it is known to have none. A property's null value is a known valueless property. A source's name, Creature identity or supernatural nature never supplies Magical. There are no Silver/Holy/Cold Iron columns or text-derived facts. Weapon/ammunition inheritance is deliberately not implemented.

`matchInteractionCondition` and `matchInteractionRule` form the one shared matcher. Human categorical strings use trimmed, case-insensitive comparison; the saved authoring and supplied facts remain unchanged. Tag and related Creature canonical IDs compare exactly, including case and whitespace. A null authored property value accepts any property with that name; a specific value and/or related Creature restriction must also match the same property record.

Each condition reports `match`, `no-match` or `unknown`, with readable descriptions/reasons. Flat ANY passes with one match; ALL fails with one mismatch. An unknown affects the group only when the other conditions cannot determine it. Retained unknown matches are informational when a decisive gate/Immunity makes them irrelevant to the final outcome. No nested expression language was added.

Damage scope covers health.damage; Condition covers condition.apply; Mechanical Effect covers the supported mechanical effect kinds. Conditions further narrow those scopes. Rule matching is recorded even for out-of-scope or non-harmful effects, while execution is explicitly skipped when it does not apply.

health.damage is known harmful; health.heal is healing. condition.apply, modifier.apply and manual require a supplied harmful boolean. No name-based harmfulness inference is performed. Contradictory health classifications are invalid. Matching Requirement/Immunity rules never block a known non-harmful effect.

## Stages and rule behavior

1. **Source:** retain and validate supplied facts and classification. This stage does not execute Requirements.
2. **Worn:** one applicable source subtracts its existing Base Soak. Multiple covering sources require a ruling. No quantity multiplier, highest-selection or stacking is inferred. All preserved damage-type modifier rows/text remain unresolved metadata: there is currently **no universally executable structured case** in the accepted Item schema. An applicable armor source carrying any such metadata requires a ruling; no `Fire +2` parsing or relevance inference is attempted.
3. **Interaction:** retain rule matches in stable authored `sortOrder`, then resolve Requirement gates before downstream rules. Every applicable Requirement is an independent gate: all must pass, with ANY/ALL evaluated inside each rule. Any definite failure prevents the entire harmful effect, even if other Requirements are unknown or downstream rules would otherwise conflict. Matching Immunity prevents the effect when no Absorption matches or could match; all duplicate Immunities remain in the trace. Unknown/matching Resistance or Vulnerability cannot block that certain prevention. For effects that continue, Resistance multiplies by `(1 - percentage/100)` and floors at zero. Vulnerability multiplies by `(1 + percentage/100)` without a cap. Multiple Resistance/Vulnerability rules multiply sequentially in authored order; percentages are never added.
4. **Natural:** one applicable definition subtracts Natural Armor and Natural Soak, separately traced. Multiple overlapping definitions require a ruling. Creature anatomy normally supplies one definition at the hit location. Existing blank-as-none Creature projection semantics remain unchanged.
5. **Temporary/other:** applicable active Soak amounts are summed with their signs, then subtracted and floored at zero. Individual source/value/lifecycle records remain in the input and trace. Ended/expired records are excluded again defensively. Unsupported coverage requires a ruling. A negative total can increase remaining damage, following existing signed modifier semantics; values are not relabeled as worn/natural.
6. **Final:** round up once and report the proposed damage/healing/prevention. No final effect is returned while a ruling is unresolved.

Every protection subtraction has a zero floor. Only Absorption converts incoming damage to healing. Non-damage effects skip all numerical protection. Prevented effects skip natural/temporary protection, so a negative modifier cannot resurrect a prevented effect.

Simple Absorption sets damage to zero and calculates healing from the **post-worn interaction-entry amount** times the uncapped percentage. Unconverted damage disappears. Natural and temporary stages are explicitly skipped, including otherwise unresolved protection that cannot affect this healing. Healing is rounded up once, then optionally capped to supplied maximum-HP room. No cap is inferred when health context is absent.

When downstream rules are reached, Absorption with Immunity, Resistance, Vulnerability or another Absorption remains unresolved. A potential/unknown Absorption match also blocks definite Immunity, because the unresolved match could create that conflict. These results preserve the incoming amount, all rule matches, per-rule candidate outcomes and the sequential Resistance/Vulnerability candidate. Candidates do not choose precedence or become a final effect.

A definitely failed Requirement is decisive before any of those downstream combinations. It produces zero damage and zero healing, with no percentage or Absorption candidate calculation. An unknown Requirement remains blocking unless another outcome makes both possibilities identical: for example, definite Immunity with no matching/potential Absorption prevents the effect whether that Requirement would pass or fail. Earlier source/Worn blockers are checked before these Interaction decisions and are never cleared by them.

## Exact arithmetic and trace

The calculation keeps decimal coefficients/scales as BigInts internally from each authored number's decimal representation. It does not feed intermediate JavaScript number approximations back into calculation. This follows the repository's decimal arithmetic approach without modifying the existing runtime helper. Final ceiling uses the exact amount: 100 with 70% Resistance becomes **30**, not 31 from binary floating-point noise. Real small positive remainders still round up; no epsilon discards them.

The returned object contains no BigInts. Numeric fields are convenient display projections; `exact*` decimal strings preserve the full calculation, including precision below a JavaScript number. An unrepresentable actual numerical result requires a ruling instead of emitting infinite HP. A hypothetical standalone candidate's overflow does not invalidate a finite actual sequence or Immunity; it retains an exact string and null numerical projection.

`IncomingEffectResolution` has `schemaVersion: 1`, status (`resolved`, `prevented`, `absorbed`, `requires-god-ruling`, `invalid`), the cloned `input`, `stages`, `ruleMatches`, `matchedRules`, `candidates`, structured `issues`, `finalEffect`, and an `explanation` string array. `finalEffect` is **null** on unresolved/invalid plans, rather than a misleading zero damage result. The model/version is unchanged by the decisive-gate correction: `issues` contains only blocking issues. Informational uncertainty remains in `ruleMatches` and `skip-rule` stage entries, so it cannot accidentally force a ruling.

Each stage has completed/skipped/blocked status, before/after damage/healing in numeric and exact form, and operation entries with source IDs, amounts and readable messages. Rule matches include every authored condition and its result. All original protection records, percentages, names, coverage, metadata and source identities are retained in `input`.

For the approved example, the stage amounts are:

```text
Incoming Fire: 12
Worn Breastplate: 12 - 3 = 9
Resistance 25%: 9 * 0.75 = 6.75
Natural Armor: 6.75 - 2 = 4.75
Natural Soak: 4.75 - 1 = 3.75
Temporary Ward: 3.75 - 1 = 2.75
Final ceiling: 3 damage
```

Requirements explicitly say satisfied/not satisfied/undetermined, list their conditions, and explain their independent gate. Decisive prevention preserves other matches and adds `skip-rule` entries identifying which rules did not affect the outcome and need no ruling. Absorption records its input, percentage, zero damage, calculated healing, skipped protection and optional cap. Structured traces are returned directly; callers need not reconstruct anything from logs.

## Intentional ruling cases

| Issue code | Required context or unresolved rule |
| --- | --- |
| `unknown-harmfulness` | Explicit classification for an ambiguous non-damage effect |
| `unknown-source-fact` | A missing authoritative fact leaves an in-scope rule undecidable and that uncertainty can still change the outcome; includes potential Absorption alongside definite Immunity |
| `hit-location-required` | Missing location for location-dependent damage protection, or a supplied key outside target anatomy |
| `worn-coverage` | A worn source has no authoritative coverage |
| `multiple-worn` | More than one worn source covers the location |
| `worn-value` | Applicable worn Base Soak is not an executable nonnegative number |
| `armor-damage-metadata` | Applicable worn source contains damage-type metadata lacking approved semantics |
| `multiple-absorption` | Multiple Absorptions match |
| `absorption-immunity` | Absorption and Immunity match |
| `absorption-percentage` | Absorption and Resistance/Vulnerability match |
| `multiple-natural` | Multiple natural definitions cover the location |
| `natural-value` | Applicable natural Armor/Soak is unsupported |
| `temporary-coverage` | Active Soak coverage is unresolved |
| `temporary-value` | Applicable active Soak lacks a finite value |
| `numeric-overflow` | An actual calculated result exceeds the finite numerical output range |

Malformed effect amounts, rule profiles, percentages/scopes, duplicate ordering, source values, identity or health context produce `invalid` with `invalid-input` issues. This is a typed internal API, not an arbitrary-JSON decoding endpoint. Source/target authorization errors remain server access errors.

Protection defects at unrelated locations do not block a known applicable location. Unknown coverage does block because applicability cannot be determined. Missing hit location is allowed for no protection or all-locations-only protection, and for non-damage effects. An explicitly supplied location must belong to the damage target's anatomy.

## Review items and Pass 5 boundary

Pass 5 now integrates this unchanged pure resolver with the existing combat and Ability runtimes. See the [Pass 5 integration report](../reports/runtime-combat-integration-pass-5-2026-09-20.md) for source/target freezing, authorization, application, Use Conditions and validation. The scope statement below records what belonged to Pass 4; it is not the current implementation status.

Brannan and Ember still need to settle:

- Absorption + Immunity precedence.
- Absorption + Resistance/Vulnerability interaction.
- Multiple Absorption combination/precedence.
- Overlapping worn armor stacking/selection.
- Overlapping Race Natural Protection stacking/selection.
- Structured execution semantics for armor damage-type metadata.
- Which Weapon and Ammunition properties/tags/magic contribute to the finished source facts.
- Authoritative harmfulness for ambiguous conditions/modifiers/manual effects.

Implementation choices for review: null versus empty source collections; Mechanical Effect scope includes all supported effect kinds; no hit location needed when every applicable protection is all-locations; armor metadata is conservatively unresolved whenever its armor source applies. Brannan's final Pass 4 correction settles decisive prevention: failed Requirements stop downstream rules, definite Immunity makes Resistance/Vulnerability irrelevant, and matching/potential Absorption remains an exception to Immunity's short circuit.

No source adapter, HP mutation, condition/injury creation, resource/ammunition/mana/Initiative spend, new combat effect, ActionEffectPlan change, UI flow, authoring backfill or migration is part of Pass 4. Existing combat paths and their tests remain unchanged. **Stop after this commit for review. Pass 5 has not started.**
