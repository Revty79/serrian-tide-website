import { emptyRaceFormMechanics, type RaceFormMechanics } from "../src/features/races/race-form-mechanics";
import { createHumanoidRaceAnatomy } from "../src/features/races/race-anatomy";
import { emptyRaceNaturalAttack } from "../src/features/races/race-natural-attacks";

/** Disposable test data only; never seeded into a persistent library. */
export function wolfFormMechanics(skillId: number, abilityId: number): RaceFormMechanics {
  const anatomy = createHumanoidRaceAnatomy();
  anatomy.hpPools.push({ canonicalId: "wolf-tail", poolName: "Wolf Tail", hpPercentage: 10, notes: "Form-only pool", sortOrder: anatomy.hpPools.length });
  anatomy.hitLocations[0] = { ...anatomy.hitLocations[0], locationName: "Tail", hpPoolCanonicalId: "wolf-tail", bodyPartsIncluded: "Tail and fur", notes: "Form-only location" };
  const bite = emptyRaceNaturalAttack("wolf-bite");
  bite.attackName = "Bite"; bite.damage = "5"; bite.damageType = "Piercing"; bite.skillId = skillId; bite.basisNotes = "Future Character Skill basis";
  bite.authoring.mode = "melee"; bite.authoring.initiativeCost = 3; bite.authoring.range = { unit: "feet", reach: 2, short: null, medium: null, long: null }; bite.authoring.magical = false;
  bite.anatomy = { hpPoolIds: [anatomy.hpPools[0].canonicalId], hitLocationNumbers: [1], notes: "Functional jaw required" };
  bite.authoring.onHitEffects = [{ effectKey: "manual", schemaVersion: 2, sortOrder: 0, effect: { kind: "manual", title: "Bite rider", description: "Authoring only" } }];
  return { ...emptyRaceFormMechanics(), size: "Large", attributeAdjustments: { STR: 5, DEX: 10, CON: 5, INT: 0, WIS: 5, CHR: -5 },
    anatomyMode: "override", anatomy, movementMode: "override", movement: [{ key: "land", movementMode: "Land", baseValue: 4, notes: "Four legs", sortOrder: 0 }, { key: "swim", movementMode: "Swim", baseValue: 2.5, notes: "Paddling", sortOrder: 1 }],
    protectionMode: "override", protections: [{ key: "fur", name: "Fur", naturalSoak: 2, coverage: { kind: "locations", locationKeys: ["0", "1"] }, sortOrder: 0 }],
    attacksMode: "override", attacks: [bite], skillsMode: "add", skillLinks: [
      { skillId, skillName: "", skillClassification: "", linkType: "Skill", value: 5, sortOrder: 0 },
      { skillId: abilityId, skillName: "", skillClassification: "", linkType: "Granted", value: null, sortOrder: 1 },
    ], interactionMode: "add", interactionRules: { schemaVersion: 1, rules: [{ key: "silver", name: "Silver vulnerability", ruleType: "vulnerability", scope: "damage", match: "ALL", conditions: [{ key: "material", kind: "item-property", propertyName: "Material", value: "Silver" }], percentage: 50, notes: "Form rule", sortOrder: 0 }] },
    manipulation: { state: "none", notes: "Paws" }, speech: { state: "limited", notes: "Short sounds" }, equipment: { state: "unusable", notes: "Retained pending future rules" },
    restrictions: [{ key: "grip", name: "Cannot use fine tools", notes: "No fingers" }] };
}
