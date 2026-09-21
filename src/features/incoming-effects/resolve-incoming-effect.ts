import { INTERACTION_EFFECT_LABELS, INTERACTION_SOURCE_KINDS, normalizeInteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { interactionRuleInScope, matchInteractionRule } from "./interaction-matcher";
import { ExactAmount } from "./exact-amount";
import type { IncomingEffectInput, IncomingEffectResolution, ResolutionEntry, ResolutionStage, ResolutionStageKey } from "./models";

const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

function validate(input: IncomingEffectInput): string[] {
  const errors: string[] = [];
  const { source, effect, target, health } = input;
  if (!(source.mechanicalEffectKind in INTERACTION_EFFECT_LABELS)) errors.push("Unknown Mechanical Effect Kind.");
  if (source.sourceKind !== null && !INTERACTION_SOURCE_KINDS.includes(source.sourceKind)) errors.push("Invalid Source Kind.");
  if (source.weaponFamily !== null && !["none", "firearm"].includes(source.weaponFamily)) errors.push("Invalid Weapon Family.");
  if (source.weaponFamily === "firearm" && source.sourceKind !== "weapon") errors.push("Firearm family requires Weapon Source Kind.");
  if (source.magical !== null && typeof source.magical !== "boolean") errors.push("Magical must be an explicit boolean or unknown.");
  if (effect.harmful !== null && typeof effect.harmful !== "boolean") errors.push("Harmfulness must be an explicit boolean or unknown.");
  for (const [label, value] of [["Damage Type", source.damageType], ["Condition Name", source.conditionName]] as const) {
    if (value !== null && (typeof value !== "string" || !value.trim())) errors.push(`${label} must be nonblank text or unknown.`);
  }
  if (source.itemProperties !== null && (!Array.isArray(source.itemProperties) || source.itemProperties.some((property) =>
    !property || typeof property.name !== "string" || !property.name.trim() || property.value !== null && typeof property.value !== "string"
    || property.relatedCreatureCanonicalId != null && (typeof property.relatedCreatureCanonicalId !== "string" || !property.relatedCreatureCanonicalId.trim())))) errors.push("Invalid Item Properties.");
  if (source.itemTags !== null && (!Array.isArray(source.itemTags) || source.itemTags.some((tag) => typeof tag !== "string" || !tag.trim()))) errors.push("Invalid Item Tags.");
  const hp = source.mechanicalEffectKind === "health.damage" || source.mechanicalEffectKind === "health.heal";
  if (hp && !nonnegative(effect.amount)) errors.push("Health effects need a finite non-negative incoming amount.");
  if (!hp && effect.amount !== null) errors.push("Non-health effects do not use a numerical damage/healing amount.");
  if (source.mechanicalEffectKind === "health.damage" && effect.harmful === false) errors.push("Health damage is harmful.");
  if (source.mechanicalEffectKind === "health.heal" && effect.harmful === true) errors.push("Health healing cannot be classified as harmful damage.");
  if (health && (!nonnegative(health.currentHp) || !nonnegative(health.maximumHp) || health.currentHp > health.maximumHp)) errors.push("Health context must have finite 0 <= current HP <= maximum HP.");
  const identity = target.protection.target;
  if (identity.kind === "character" ? !Number.isSafeInteger(identity.characterId) || identity.characterId <= 0
    : !Number.isSafeInteger(identity.participantId) || identity.participantId === 0 || !Number.isSafeInteger(identity.campaignId) || identity.campaignId <= 0 || !Number.isSafeInteger(identity.encounterId) || identity.encounterId <= 0) errors.push("Invalid exact target identity.");
  if (target.ruleSource.kind === "none" && target.interactionRules?.rules.length) errors.push("Interaction Rules need an authoritative owner.");
  try {
    // Validation only. Keep the original authoring, including exact canonical identities, in the plan.
    normalizeInteractionRuleProfile(target.interactionRules, target.ruleSource.kind === "creature-snapshot" ? "creature" : "race");
  } catch (error) { errors.push(error instanceof Error ? error.message : "Invalid Interaction Rules."); }
  return errors;
}

/** Pure planning only. No database reads, HP writes, resource spending or combat integration. */
export function resolveIncomingEffect(supplied: IncomingEffectInput): IncomingEffectResolution {
  const input = structuredClone(supplied);
  const result: IncomingEffectResolution = { schemaVersion: 1, status: "resolved", input, stages: [], ruleMatches: [], matchedRules: [], candidates: [], issues: [], finalEffect: null, explanation: [] };
  const { effect, source, target, hitLocationKey } = input;
  const isDamage = source.mechanicalEffectKind === "health.damage";
  const isHealing = source.mechanicalEffectKind === "health.heal";
  const harmful = isDamage ? true : isHealing ? false : effect.harmful;
  let damage: number | null = isDamage ? effect.amount : 0;
  let healing: number | null = isHealing ? effect.amount : 0;
  let exactDamage = nonnegative(damage) ? ExactAmount.from(damage) : null;
  let exactHealing = nonnegative(healing) ? ExactAmount.from(healing) : null;
  let prevented = false, absorbed = false;
  const issue = (stage: ResolutionStageKey, code: string, message: string, sourceIds: string[] = []) => result.issues.push({ stage, code, message, sourceIds });
  const stage = (key: ResolutionStageKey, operation: (current: ResolutionStage) => void) => {
    const current: ResolutionStage = { key, status: "completed", damageBefore: damage, damageAfter: damage, healingBefore: healing, healingAfter: healing,
      exactDamageBefore: exactDamage?.toString() ?? null, exactDamageAfter: null, exactHealingBefore: exactHealing?.toString() ?? null, exactHealingAfter: null, entries: [] };
    operation(current);
    current.damageAfter = damage; current.healingAfter = healing;
    current.exactDamageAfter = exactDamage?.toString() ?? null; current.exactHealingAfter = exactHealing?.toString() ?? null;
    result.stages.push(current);
  };
  const entry = (current: ResolutionStage, message: string, fields: Omit<ResolutionEntry, "message"> = { operation: "explanation" }) => current.entries.push({ ...fields, message });
  const skip = (current: ResolutionStage, message: string) => { current.status = "skipped"; entry(current, message, { operation: "skip" }); };
  const block = (current: ResolutionStage) => { current.status = "blocked"; damage = null; healing = null; exactDamage = null; exactHealing = null; };
  const finite = (value: number, key: ResolutionStageKey): number | null => {
    if (Number.isFinite(value)) return value;
    issue(key, "numeric-overflow", "Calculation exceeds finite numeric precision; a G.O.D. ruling is required.");
    return null;
  };
  const candidateNumber = (value: ExactAmount | null) => value !== null && Number.isFinite(value.toNumber()) ? value.toNumber() : null;
  const finish = () => {
    result.explanation = result.stages.flatMap((current) => current.entries.map(({ message }) => `[${current.key}] ${message}`));
    result.explanation.push(...result.issues.map(({ message }) => `G.O.D. review: ${message}`));
    return result;
  };
  const errors = validate(input);
  stage("source", (current) => {
    entry(current, `${effect.label}: incoming ${source.damageType ?? "unspecified type"} ${source.mechanicalEffectKind}${effect.amount === null ? "" : ` ${effect.amount}`}.`, { operation: "incoming", value: effect.amount });
    entry(current, `Authoritative source facts: ${JSON.stringify(source)}. Harmful: ${harmful ?? "unknown"}.`, { operation: "source-facts" });
    if (errors.length) {
      errors.forEach((message) => issue("source", "invalid-input", message));
      block(current);
    } else if (harmful === null) {
      issue("source", "unknown-harmfulness", "Supply an authoritative harmful/non-harmful classification for this non-damage effect.");
      block(current);
    }
  });
  if (errors.length) { result.status = "invalid"; return finish(); }

  const layers = target.protection;
  const covers = (coverage: { kind: string; locationKeys?: string[] }) => coverage.kind === "all" || coverage.kind === "locations" && hitLocationKey !== null && coverage.locationKeys?.includes(hitLocationKey);
  const worn = layers.worn.filter(({ coveredLocationKeys }) => hitLocationKey !== null && coveredLocationKeys.includes(hitLocationKey));
  const natural = layers.natural.filter(({ coverage }) => covers(coverage));
  const activeTemporary = layers.temporary.filter(({ modifier }) => !modifier.endedAt && !modifier.expiredAt);
  const temporary = activeTemporary.filter(({ coverage }) => covers(coverage));
  const locationRequired = layers.worn.length > 0 || layers.natural.some(({ coverage }) => coverage.kind === "locations") || activeTemporary.some(({ coverage }) => coverage.kind === "locations");

  stage("worn", (current) => {
    if (!isDamage) return skip(current, "Numerical worn protection does not reduce this non-damage effect.");
    if (hitLocationKey === null && locationRequired || hitLocationKey !== null && !layers.locations.some(({ key }) => key === hitLocationKey)) {
      issue("worn", "hit-location-required", "Choose an authoritative hit location in this target's anatomy.");
    }
    const unknownCoverage = layers.worn.filter(({ coveredLocationKeys }) => !coveredLocationKeys.length);
    if (unknownCoverage.length) issue("worn", "worn-coverage", "Worn coverage cannot be determined.", unknownCoverage.map(({ ownershipKey }) => ownershipKey));
    if (worn.length > 1) issue("worn", "multiple-worn", "Multiple worn sources cover this location; no stacking or selection rule is approved.", worn.map(({ ownershipKey }) => ownershipKey));
    for (const armor of worn) {
      entry(current, `${armor.itemName}: authored Base Soak ${armor.baseSoak ?? "unknown"}.`, { operation: "worn-source", sourceId: armor.ownershipKey, value: armor.baseSoak });
      if (!nonnegative(armor.baseSoak)) issue("worn", "worn-value", `${armor.itemName} lacks an executable non-negative Base Soak.`, [armor.ownershipKey]);
      if (armor.damageModifiersSourceText.trim() || armor.damageModifiers.length) issue("worn", "armor-damage-metadata", `${armor.itemName} has damage-type metadata without approved executable semantics.`, [armor.ownershipKey]);
    }
    if (result.issues.length) return block(current);
    if (!worn.length) entry(current, "No applicable worn protection.");
    else {
      const before = damage!;
      exactDamage = exactDamage!.subtract(ExactAmount.from(worn[0].baseSoak!)).floorZero(); damage = exactDamage.toNumber();
      entry(current, `${worn[0].itemName}: ${before} - ${worn[0].baseSoak} = ${damage}.`, { operation: "subtract-base-soak", sourceId: worn[0].ownershipKey, before, after: damage, value: worn[0].baseSoak });
    }
  });

  stage("interaction", (current) => {
    result.ruleMatches = [...(target.interactionRules?.rules ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map((rule) => ({ rule, inScope: interactionRuleInScope(rule, source), ...matchInteractionRule(rule, source) }));
    result.matchedRules = result.ruleMatches.filter(({ inScope, outcome }) => inScope && outcome === "match").map(({ rule }) => rule);
    for (const match of result.ruleMatches) {
      entry(current, `${match.rule.name}: ${match.inScope ? `${match.rule.match} ${match.outcome}` : "outside this effect's scope"}. ${match.conditions.map(({ reason }) => reason).join(" ")}`, { operation: "match-rule", sourceId: match.rule.key });
    }
    if (harmful === false) return skip(current, "Requirement/Immunity and damage percentages do not apply to a non-harmful effect.");
    const scoped = result.ruleMatches.filter(({ inScope }) => inScope);
    const matching = scoped.filter(({ outcome }) => outcome === "match").map(({ rule }) => rule);
    const absorptions = matching.filter(({ ruleType }) => ruleType === "absorption");
    const immunities = matching.filter(({ ruleType }) => ruleType === "immunity");
    const percentages = matching.filter(({ ruleType }) => ruleType === "resistance" || ruleType === "vulnerability");
    const failedRequirements = scoped.filter(({ rule, outcome }) => rule.ruleType === "requirement" && outcome === "no-match");
    for (const { rule, outcome, conditions } of scoped.filter(({ rule }) => rule.ruleType === "requirement")) {
      entry(current, `Requirement ${outcome === "match" ? "satisfied" : outcome === "no-match" ? "not satisfied" : "undetermined"}: ${rule.name} (${rule.match}: ${conditions.map(({ description }) => description).join("; ")}). Each separate Requirement is an independent gate.`, { operation: "requirement-gate", sourceId: rule.key });
    }
    // Interaction decisions cannot clear blockers from source qualification or worn protection.
    if (result.issues.length) {
      entry(current, "Interaction resolution remains blocked by an earlier stage; retained matches do not override that ruling.");
      return block(current);
    }
    const prevent = (reason: string, decisiveKeys: string[]) => {
      const before = damage;
      prevented = true; damage = 0; healing = 0; exactDamage = ExactAmount.from(0); exactHealing = ExactAmount.from(0);
      entry(current, reason, { operation: "prevent", before, after: 0 });
      for (const { rule } of scoped.filter(({ rule }) => !decisiveKeys.includes(rule.key))) {
        entry(current, `${rule.name}: not applied because ${failedRequirements.length ? "a Requirement gate" : "definite Immunity"} already prevented the effect. Retained matching details do not require a ruling or affect the outcome.`, { operation: "skip-rule", sourceId: rule.key });
      }
    };
    // A failed gate makes every other Interaction outcome irrelevant, including Absorption.
    // Keep informational matches in the trace; only outcome-changing uncertainty belongs in issues.
    if (failedRequirements.length) return prevent("A Requirement failed: harmful effect prevented entirely. Downstream Interaction rules were not reached.", failedRequirements.map(({ rule }) => rule.key));
    const possibleAbsorption = scoped.some(({ rule, outcome }) => rule.ruleType === "absorption" && outcome !== "no-match");
    if (immunities.length && !possibleAbsorption) return prevent(`Immunity prevents the harmful effect. Matching Immunities: ${immunities.map(({ name }) => name).join(", ")}.`, immunities.map(({ key }) => key));

    for (const match of scoped.filter(({ outcome }) => outcome === "unknown")) issue("interaction", "unknown-source-fact", `${match.rule.name}: ${match.conditions.filter(({ outcome }) => outcome === "unknown").map(({ reason }) => reason).join(" ")}${match.rule.ruleType === "absorption" && immunities.length ? " A possible Absorption match could conflict with Immunity; a ruling is still required." : ""}`, [match.rule.key]);
    if (absorptions.length > 1) issue("interaction", "multiple-absorption", "Multiple Absorption rules match; conversion precedence is undecided.", absorptions.map(({ key }) => key));
    if (absorptions.length && immunities.length) issue("interaction", "absorption-immunity", "Absorption and Immunity match; their precedence is undecided.", [...absorptions, ...immunities].map(({ key }) => key));
    if (absorptions.length && percentages.length) issue("interaction", "absorption-percentage", "Absorption and Resistance/Vulnerability match; their interaction is undecided.", [...absorptions, ...percentages].map(({ key }) => key));

    // Candidates explain alternatives; they never select a winner or become a final effect.
    const basis = damage;
    const exactBasis = exactDamage;
    const factor = (percentage: number, resistance: boolean) => resistance
      ? ExactAmount.from(1).subtract(ExactAmount.from(percentage).percent())
      : ExactAmount.from(1).add(ExactAmount.from(percentage).percent());
    for (const rule of [...immunities, ...absorptions, ...percentages]) {
      const exactCandidateDamage = rule.ruleType === "immunity" || rule.ruleType === "absorption" ? ExactAmount.from(0) : exactBasis?.multiply(factor(rule.percentage!, rule.ruleType === "resistance")).floorZero() ?? null;
      const exactCandidateHealing = rule.ruleType === "absorption" ? exactBasis?.multiply(ExactAmount.from(rule.percentage!).percent()) ?? null : ExactAmount.from(0);
      const candidateDamage = candidateNumber(exactCandidateDamage);
      const candidateHealing = candidateNumber(exactCandidateHealing);
      result.candidates.push({ ruleKeys: [rule.key], basisDamage: basis, damage: candidateDamage, healing: candidateHealing,
        exactDamage: exactCandidateDamage?.toString() ?? null, exactHealing: exactCandidateHealing?.toString() ?? null,
        description: `${rule.name} alone at interaction entry ${exactBasis?.toString() ?? "unknown"}: damage ${exactCandidateDamage?.toString() ?? "unknown"}, healing ${exactCandidateHealing?.toString() ?? "unknown"}; not a precedence decision.` });
    }
    let sequence = basis;
    let exactSequence = exactBasis;
    for (const rule of percentages) {
      const before = sequence;
      const exactBefore = exactSequence?.toString() ?? null;
      const multiplier = factor(rule.percentage!, rule.ruleType === "resistance");
      exactSequence = exactSequence?.multiply(multiplier).floorZero() ?? null;
      sequence = candidateNumber(exactSequence);
      entry(current, `${rule.name} ${rule.percentage}%: ${exactBefore ?? "unknown"} × ${multiplier} = ${exactSequence?.toString() ?? "unknown"}${rule.ruleType === "resistance" && rule.percentage! > 100 ? " (floored at zero)" : ""}${absorptions.length || immunities.length || result.issues.length ? " (candidate only)" : ""}.`,
        { operation: "percentage-candidate", sourceId: rule.key, before, after: sequence, value: rule.percentage, exactBefore, exactAfter: exactSequence?.toString() ?? null });
    }
    if (percentages.length) result.candidates.push({ ruleKeys: percentages.map(({ key }) => key), basisDamage: basis, damage: sequence, healing: 0,
      exactDamage: exactSequence?.toString() ?? null, exactHealing: "0", description: "Sequential Resistance/Vulnerability candidate in authored sort order, with no intermediate rounding." });
    result.candidates.forEach((candidate) => entry(current, candidate.description, { operation: "candidate" }));
    // A hypothetical standalone candidate cannot invalidate a finite actual sequence.
    if (!immunities.length) {
      if (!absorptions.length && exactSequence) finite(exactSequence.toNumber(), "interaction");
      if (absorptions.length === 1 && exactBasis) finite(exactBasis.multiply(ExactAmount.from(absorptions[0].percentage!).percent()).toNumber(), "interaction");
    }
    if (result.issues.length) return block(current);
    if (absorptions.length) {
      absorbed = true; damage = 0; exactDamage = ExactAmount.from(0);
      exactHealing = exactBasis!.multiply(ExactAmount.from(absorptions[0].percentage!).percent()); healing = exactHealing.toNumber();
      entry(current, `${absorptions[0].name}: ${basis} × ${absorptions[0].percentage}% = ${healing} healing; 0 damage. Unconverted damage disappears.`, { operation: "absorb", sourceId: absorptions[0].key, before: basis, after: healing, value: absorptions[0].percentage });
    } else if (isDamage) { damage = sequence; exactDamage = exactSequence; }
    if (!scoped.length) entry(current, "No applicable Interaction Rules.");
  });

  const skipProtection = (current: ResolutionStage) => {
    if (absorbed) { skip(current, "Skipped because Absorption converted damage to healing."); return true; }
    if (prevented) { skip(current, "Skipped because the harmful effect was prevented."); return true; }
    if (!isDamage) { skip(current, "Numerical protection does not reduce this non-damage effect."); return true; }
    return false;
  };
  stage("natural", (current) => {
    if (skipProtection(current)) return;
    if (natural.length > 1) issue("natural", "multiple-natural", "Multiple natural definitions cover this location; no stacking or selection rule is approved.", natural.map(({ source }) => source.id));
    for (const protection of natural) {
      entry(current, `${protection.name}: Natural Armor ${protection.armor ?? "unknown"}, Natural Soak ${protection.soak ?? "unknown"}.`, { operation: "natural-source", sourceId: protection.source.id });
      if (!nonnegative(protection.armor) || !nonnegative(protection.soak)) issue("natural", "natural-value", `${protection.name} lacks executable non-negative Natural Armor/Soak.`, [protection.source.id]);
    }
    if (result.issues.length) return block(current);
    if (!natural.length) entry(current, "No applicable natural protection.");
    else for (const [label, amount] of [["Natural Armor", natural[0].armor!], ["Natural Soak", natural[0].soak!]] as const) {
      const before = damage!; exactDamage = exactDamage!.subtract(ExactAmount.from(amount)).floorZero(); damage = exactDamage.toNumber();
      entry(current, `${natural[0].name}, ${label}: ${before} - ${amount} = ${damage}.`, { operation: "subtract-natural", sourceId: natural[0].source.id, before, after: damage, value: amount });
    }
  });
  stage("temporary", (current) => {
    if (skipProtection(current)) return;
    const unresolved = activeTemporary.filter(({ coverage }) => coverage.kind === "unresolved");
    if (unresolved.length) issue("temporary", "temporary-coverage", "Active Soak has unresolved coverage; no applicability is assumed.", unresolved.map(({ id }) => id));
    for (const modifier of temporary) {
      entry(current, `${modifier.name}: active signed Soak ${modifier.amount ?? "unknown"}.`, { operation: "temporary-source", sourceId: modifier.id, value: modifier.amount });
      if (modifier.amount === null || !Number.isFinite(modifier.amount)) issue("temporary", "temporary-value", `${modifier.name} lacks an authoritative finite Soak value.`, [modifier.id]);
    }
    if (result.issues.length) return block(current);
    const exactTotal = temporary.reduce((sum, { amount }) => sum.add(ExactAmount.from(amount!)), ExactAmount.from(0));
    const total = finite(exactTotal.toNumber(), "temporary");
    if (total === null) return block(current);
    const before = damage!; exactDamage = exactDamage!.subtract(exactTotal).floorZero(); damage = finite(exactDamage.toNumber(), "temporary");
    entry(current, `Temporary/other signed Soak total ${total}: ${before} - (${total}) = ${damage ?? "unknown"}.`, { operation: "subtract-signed-soak-total", before, after: damage, value: total });
    if (damage === null) block(current);
  });
  stage("final", (current) => {
    if (result.issues.length) { entry(current, "No final HP effect: resolve the listed G.O.D. rulings first."); return block(current); }
    const beforeDamage = damage!, beforeHealing = healing!;
    const exactDamageBeforeRounding = exactDamage!.toString(), exactHealingBeforeRounding = exactHealing!.toString();
    damage = exactDamage!.ceil(); healing = exactHealing!.ceil();
    exactDamage = ExactAmount.from(damage); exactHealing = ExactAmount.from(healing);
    const cappedHealing = input.health ? Math.min(healing, ExactAmount.from(input.health.maximumHp).subtract(ExactAmount.from(input.health.currentHp)).toNumber()) : null;
    result.finalEffect = { kind: absorbed ? "health.heal" : source.mechanicalEffectKind, disposition: prevented ? "prevented" : absorbed ? "absorbed" : "allowed", damage, healing, cappedHealing, damageBeforeRounding: beforeDamage, healingBeforeRounding: beforeHealing, exactDamageBeforeRounding, exactHealingBeforeRounding };
    entry(current, `Round up once: damage ${exactDamageBeforeRounding} → ${damage}; healing ${exactHealingBeforeRounding} → ${healing}.${cappedHealing === null ? "" : ` Authoritative HP room caps proposed healing to ${cappedHealing}.`} Planning only; no HP or effect was applied.`, { operation: "ceil-once" });
  });
  result.status = result.issues.length ? "requires-god-ruling" : prevented ? "prevented" : absorbed ? "absorbed" : "resolved";
  return finish();
}
