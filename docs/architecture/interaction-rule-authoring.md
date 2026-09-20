# Shared Creature and Race Interaction Rules

Step 2 authors and preserves rules. No matcher, incoming-effect resolver, damage adjustment, healing conversion, protection selection, or Character integration executes these profiles.

## Shared contract

Both owners use `InteractionRuleProfile` from `src/features/interaction-rules/interaction-rules.ts`:

```ts
type InteractionRuleProfile = {
  schemaVersion: 1;
  rules: InteractionRule[];
};
type InteractionRule = {
  key: string;
  name: string;
  ruleType: "requirement" | "immunity" | "resistance" | "vulnerability" | "absorption";
  scope: "damage" | "condition" | "mechanical-effect";
  match: "ANY" | "ALL";
  conditions: InteractionCondition[];
  percentage: number | null;
  notes: string;
  sortOrder: number;
  crImpact?: "None" | "Minor" | "Moderate" | "Major" | "Extreme";
};
type InteractionCondition = { key: string } & (
  | { kind: "damage-type"; damageType: string }
  | { kind: "magical"; magical: boolean }
  | { kind: "source-kind"; sourceKind: ActionEffectSourceKind; weaponFamily?: "firearm" | null }
  | { kind: "item-property"; propertyName: string; value: string | null; relatedCreatureCanonicalId?: string | null }
  | { kind: "item-tag"; tagCanonicalId: string }
  | { kind: "mechanical-effect-kind"; effectKind: MechanicalEffect["kind"] }
  | { kind: "condition-name"; conditionName: string }
);
```

Creature rules require an explicit valid `crImpact`; Race rules reject that field. This is owner metadata on one shared contract, not a separate rule language. Keys are nonblank and unique within their owner profile; condition keys are unique within their rule. Sort orders are unique non-negative safe integers. Normalization returns rules in ascending order without replacing keys or sort values and makes independent nested copies. The editor assigns UUIDs, preserves keys during edits/reordering, and explicitly renumbers sort order when the user rearranges rules.

`normalizeInteractionRuleProfile(unknown, "creature" | "race")` validates both owners on the server. Null/undefined means not authored; an explicit version-1 empty rules array is also valid. Missing/unknown versions, malformed fields, empty conditions, duplicate identities/orders and unsupported choices fail. No prose parsing occurs.

## Semantics being authored

- **Requirement:** a covered harmful incoming effect only works if its source satisfies ANY or ALL authored conditions. Silver is `item-property / Material / Silver`; Magical is the explicit boolean. ALL can combine Magical and Fire. Failure prevention belongs to the later resolver.
- **Immunity:** complete negation of a matching incoming effect; no percentage.
- **Resistance:** matching damage reduction by the authored percentage.
- **Vulnerability:** matching damage increase by the authored percentage.
- **Absorption:** zero damage; the authored fraction becomes healing and the remainder vanishes. Six Fire at 50% means three healing and zero damage; at 100%, six healing and zero damage. Future healing is capped at normal maximum HP unless an explicit exception applies.

Resistance, Vulnerability and Absorption require finite percentages strictly greater than zero, with no upper cap or inferred default. Exact numeric values are preserved. They currently require `scope: "damage"`; healing, buffs and conditions are not silently included. Requirement and Immunity support each explicit scope and reject every non-null percentage, including zero. Grouping is flat ANY/ALL, not nested expressions.

## Catalog facts and identities

Damage types and condition names remain authored strings with their spelling/case preserved apart from surrounding whitespace. No damage taxonomy or Poison engine is introduced. Later matching should normalize text comparisons consistently without rewriting catalog spelling.

Source Kind reuses `ACTION_EFFECT_SOURCE_KINDS`: `weapon`, `item`, `spell`, `derived-ability`, `skill`, `attribute`, `creature-attack`, `creature-ability`, `no-roll`, `manual`. Firearms remain `weapon` with optional `weaponFamily: "firearm"`; there is no competing `firearm` source alias. Future classification must use the existing authoritative firearm classification.

Mechanical Effect Kind uses the existing `MechanicalEffect["kind"]`: `health.damage`, `health.heal`, `condition.apply`, `modifier.apply`, `manual`. The editor's label map is checked against that union.

Item Properties match the existing `item_properties.property_name` and optional `value`. Null value means any value for that name. Optional `relatedCreatureCanonicalId` restricts the match to an explicitly Creature-related property; it is not required for ordinary materials. Existing property rows, related Item/Creature relationships, quantity, unit and notes remain untouched. Rules do not point to an individual Item's property-row ID or invent material columns. Existing property names are offered as suggestions; authors can enter additional property names/values.

Item Tags reference `item_tags_catalog.canonical_id`, never the mutable display name. The shared authenticated catalog action supplies the tag selector and optional Creature relationship selector. Master Creature/Race saves and NPC individual saves verify those canonical references exist. Snapshot parsing uses the preserved metadata without live catalog lookups. Historical missing references remain visible in the editor; a save reports the missing reference for deliberate review.

Magical is an explicit boolean matcher only. Step 1 Magical authoring is unchanged. Future source facts come from Spell Construction, Item `isMagical`, construction-backed Item Abilities, and explicitly Magical/construction-backed Creature Attacks or Abilities. Creature identity never supplies this fact by itself.

## Storage and preservation

Migration `0062_interaction_rule_authoring` adds nullable `interaction_rules_json` JSONB to `creatures` and `races`, with object/version/rules-array envelope constraints. There is no default, update, backfill, table replacement or legacy-defense conversion. Detailed domain validation is server-side.

Both authoring aggregates expose `core.interactionRules?: InteractionRuleProfile | null`. Explicit master projections, save normalization, NPC template loading, deep snapshot copying, NPC current snapshot validation and direct encounter snapshot construction retain this field. Old snapshots with the field absent stay valid and absent. Variant creation copies the parent's profile with the same owner-local keys; the separate JSONB owner makes subsequent edits independent.

Creature master and individual editors share the **Interaction Rules** editor under **Abilities & Defenses**. Existing Defense rows appear in a populated-only, collapsed, read-only **Legacy Defense Data** section, with no creation control. The Race editor uses the same component under **Mechanics → Racial Interaction Rules**, after Attribute Caps and Movement. No Natural Armor is added to Races. All controls use shared semantic appearance variables and form classes.

The basic rule view shows Name, Type, Requires/Against, common condition fields, and Amount/Healing percentage where applicable. ANY/ALL appears only for multiple conditions; existing hidden match values are retained. **Advanced Matching** contains the less common matching types, related Creature restriction, applicable scope, notes and Creature CR Impact. Mandatory Damage scope has no editable selector. Nonstandard saved scopes and advanced conditions retain visible summaries. This presentation does not alter the accepted domain semantics or storage.

Authored Creature CR Impact is preserved but excluded from calculated CR. Existing legacy Defense scoring is unchanged. Deliberate legacy reconciliation is needed before including the new impact to avoid double counting.

Characters currently hold a Race ID (`campaign_character_profile.race_id`). Step 2 does not create a Race snapshot or route its profile to Character combat. The later runtime step must decide when Race rules are captured and how master edits affect existing Characters and committed actions.

## Deferred runtime decisions for review

1. Rule precedence, stacking, conflicting Requirements, and interactions between Immunity, Resistance, Vulnerability and Absorption.
2. The point in damage/protection calculation at which qualifying damage is measured; fractional rounding and values above 100%. Authored percentages are intentionally not capped here.
3. Authoritative source facts for weapon/ammunition combinations, inherited Item Properties/Tags, and construction-backed effects.
4. How a structured effect is classified as harmful, and how condition names/case and effect scopes are compared.
5. When Race rules are snapshotted for Characters/actions, whether master edits propagate, and how unavailable catalog references are handled during execution.
6. Deliberate reconciliation of legacy Defenses with structured rules before CR integration.

None of these runtime decisions is silently implemented by Step 2. Natural-vs-Worn protection remains a separate, unstarted step.
