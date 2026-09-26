import type { CreatureDraft } from "../src/features/creatures/models";
import { emptyCreatureFormMechanics, type CreatureForm } from "../src/features/creatures/creature-forms";
import { CREATURE_ATTRIBUTE_NAMES } from "../src/features/creatures/creature-size-rules";
import { emptyCreatureAbilityAuthoring, emptyCreatureAttackAuthoring } from "../src/features/creatures/creature-authoring";
import { transformationFixture } from "./race-form-transformation-fixture";

/** Disposable example only; never inserted into the real library. */
export function creatureFormFixture(skillId?: number): CreatureForm {
  const mechanics = emptyCreatureFormMechanics();
  Object.assign(mechanics, { size: "Small", hpMultiplierSteps: 2, baseMovementSteps: 1, baseMagicSteps: 3 });
  mechanics.attributes = { mode: "override", rows: CREATURE_ATTRIBUTE_NAMES.map((attributeKey, sortOrder) => ({ attributeKey, value: 20 + sortOrder * 4, notes: `Form ${attributeKey}`, sortOrder })) };
  mechanics.movement = { mode: "override", rows: [{ movementMode: "Flight", movementValue: 18, initiative: 3, requirements: "Spread wings", notes: "Form flight", sortOrder: 0 }] };
  mechanics.body = { mode: "override", hpPools: [{ canonicalId: "FORM-TORSO", poolName: "Winged torso", hpPercentage: 100, maximumHp: null, notes: "Form pool", sortOrder: 0 }], hitLocations: [{ hitLocationNumber: 1, locationName: "Wings", bodyPartsIncluded: "Both wings", hpPoolCanonicalId: "FORM-TORSO", naturalArmor: 4, soak: 2, locationEffect: "Grounded if disabled", notes: "Form location", sortOrder: 0 }] };
  mechanics.attacks = { mode: "override", rows: [{ canonicalId: "FORM-TALON", attackName: "Form Talons", attackPercentage: 67, damage: "2d6", damageType: "Slashing", rangeReach: "Within reach", requiredAnatomy: "Talons", requirements: "Free claws", usesRecharge: "Once per turn", specialEffect: "Raking wound", notes: "Form attack", sortOrder: 0, authoring: { ...emptyCreatureAttackAuthoring(), initiativeCost: 4, mode: "melee", range: { unit: "feet", reach: 2, short: null, medium: null, long: null }, magical: true } }] };
  mechanics.abilities = { mode: "override", rows: [{ canonicalId: "FORM-SIGHT", abilityName: "Form Moon Sight", abilityType: "Supernatural", activation: "Open eyes", requirements: "Darkness", usesRecharge: "After rest", description: "See faint paths", mechanicalEffect: "Manual sight ruling", notes: "Form ability", sortOrder: 0, crImpact: "Minor", effects: [], authoring: { ...emptyCreatureAbilityAuthoring(), activationType: "activated", initiativeCost: 3, targeting: "Self", costs: [{ costType: "mana", amount: 2, resourceKey: null, notes: "Sight cost", sortOrder: 0 }], useConditions: [{ conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "At night", sortOrder: 0 }], useLimits: [{ maximumUses: 2, refreshScope: "scene", refreshKey: null, notes: "Two sights", sortOrder: 0 }] } }] };
  mechanics.defenses = { mode: "override", rows: [{ seedIdentity: null, defenseType: "Resistance", against: "Cold", value: "5", notes: "Form defense", crImpact: "Minor", sortOrder: 0 }] };
  mechanics.skills = { mode: "add", rows: skillId ? [{ skillId, skillName: "Form Awareness", skillClassification: "standard", rank: "3", notes: "Form rank", sortOrder: 0 }] : [] };
  mechanics.interactionMode = "add";
  mechanics.interactionRules = { schemaVersion: 1, rules: [{ key: "cold", name: "Form cold rule", ruleType: "resistance", scope: "damage", match: "ANY", percentage: 20, notes: "Preview only", crImpact: "Minor", sortOrder: 0, conditions: [{ key: "cold", kind: "damage-type", damageType: "Cold" }] }] };
  mechanics.manipulation = { state: "limited", notes: "Claws only" };
  mechanics.speech = { state: "none", notes: "Calls only" };
  mechanics.equipment = { state: "retained", notes: "Fit requires a ruling" };
  mechanics.restrictions = [{ key: "writing", name: "Cannot write", notes: "No hands" }];
  return { key: "winged", name: "Winged Form", description: "Disposable alternate body", notes: "Preview fixture", sortOrder: 0, mechanics, transformation: transformationFixture() };
}

export function creatureDraftFixture(): CreatureDraft {
  return { core: { canonicalId: "DRAFT-CREATURE-FORMS", canonicalName: "Forms test Creature", family: "Test", creatureType: "Test", size: "Medium", hpMultiplierSteps: 0, totalHp: null, baseMovementSteps: 0, baseMagicSteps: 0, challengeRating: 1, killXp: null, parentCreatureId: null, parentCreatureName: null, calculatedChallengeRating: 1, challengeRatingAdjustment: 0, challengeRatingAdjustmentReason: "", description: "Normal body", typicalBehavior: "", habitatEcology: "", notes: "", sourceSystem: null }, attributes: CREATURE_ATTRIBUTE_NAMES.map((attributeKey, sortOrder) => ({ attributeKey, value: 30, notes: "", sortOrder })), movement: [{ movementMode: "Land", movementValue: 10, initiative: 2, requirements: "", notes: "", sortOrder: 0 }], hpPools: [{ canonicalId: "DRAFT-HP-FORMS", poolName: "Normal body", hpPercentage: 100, maximumHp: null, notes: "", sortOrder: 0 }], hitLocations: [], attacks: [], abilities: [], defenses: [], skillLinks: [], uses: [], derivedCreatures: [] };
}
