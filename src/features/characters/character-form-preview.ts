import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAttributeReference, type CharacterDraft, type CharacterRaceAggregate, type CharacterSkillReference } from "./models";
import { CHARACTER_ATTRIBUTE_REFERENCE_KEYS, getAttributeReference, getAttributeReferenceFields } from "./attribute-reference";
import { getAttributeModifier, getAttributeRollTarget, getBaseInitiative, getCharacterHp, getCharacterMovementBaseValue, getCharacterSkillRanks, getEffectiveSkillPoints, getMovementInitiative, getSkillRollTarget, normalizeSkillAttributeKey } from "./character-rules";
import { resolveRaceHealthAnatomy } from "@/features/active-state/anatomy";
import { emptyRaceFormMechanics } from "@/features/races/race-form-mechanics";

export function availableCharacterForms(draft: Pick<CharacterDraft, "profile">, race: CharacterRaceAggregate | null) {
  if (!race || draft.profile.raceId !== race.race.id) return [];
  return (race.formPreview?.forms ?? []).filter(form => form.raceId === race.race.id);
}

/** Pure display projection. Normal/unknown/foreign selections produce no override.
 * The returned object is not a CharacterDraft or runtime Race definition and is
 * never consumed by save, readiness, equipment, effects, or print code.
 */
export function resolveCharacterFormPreview(draft: CharacterDraft, race: CharacterRaceAggregate | null, formId: number | null, skillCatalog: readonly CharacterSkillReference[], referenceCatalog: readonly CharacterAttributeReference[] = []) {
  const form = availableCharacterForms(draft, race).find(form => form.id === formId);
  if (!form || !race?.formPreview) return null;
  const mechanics = form.mechanics ?? emptyRaceFormMechanics();
  const attributes = { ...draft.attributes };
  for (const key of CHARACTER_ATTRIBUTE_KEYS) attributes[key] += mechanics.attributeAdjustments[key];
  const additions = mechanics.skillsMode === "add" ? mechanics.skillLinks : [];
  const displayRace = { ...race, skillLinks: [...race.skillLinks, ...additions] };
  const allocations = draft.skillAllocations.map(row => ({ ...row }));
  let nextId = Math.min(0, ...allocations.map(row => row.draftId)) - 1;
  // Only Tier 1 predispositions can stand alone without inventing a learned path.
  for (const addition of additions) {
    const skill = skillCatalog.find(skill => skill.id === addition.skillId);
    if (addition.linkType === "Skill" && skill?.tier === 1 && !allocations.some(row => row.skillId === addition.skillId)) {
      allocations.push({ draftId: nextId--, skillId: addition.skillId, parentDraftId: null, points: 0 });
    }
  }
  const ranks = getCharacterSkillRanks({ ...draft, attributes, skillAllocations: allocations }, skillCatalog, displayRace);
  const skills = allocations.flatMap(allocation => {
    const skill = skillCatalog.find(skill => skill.id === allocation.skillId);
    const points = getEffectiveSkillPoints(allocation.points, displayRace, allocation.skillId);
    if (!skill || points <= 0) return [];
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    const rank = ranks.get(allocation.draftId) ?? 0;
    const parent = allocations.find(row => row.draftId === allocation.parentDraftId);
    const parentName = parent ? skillCatalog.find(skill => skill.id === parent.skillId)?.name : null;
    return [{ allocationId: allocation.draftId, skillId: skill.id, name: parentName ? `${parentName} → ${skill.name}` : skill.name, points, rank, target: attributeKey ? getSkillRollTarget(attributes[attributeKey], rank) : 100 - rank, formAddition: additions.some(row => row.skillId === skill.id) }];
  });
  const anatomy = mechanics.anatomyMode === "override" ? mechanics.anatomy : race.race.anatomy;
  const raceRules = race.formPreview.interactionRules?.rules ?? [];
  const formRules = mechanics.interactionRules?.rules ?? [];
  // Copies isolate consumers as well as this resolver from the authoritative draft/catalog.
  return structuredClone({
    form: { id: form.id, name: form.name, description: form.description, notes: form.notes },
    size: mechanics.size ?? race.race.size,
    attributes: CHARACTER_ATTRIBUTE_KEYS.map(key => ({ key, stored: draft.attributes[key], adjustment: mechanics.attributeAdjustments[key], value: attributes[key], modifier: getAttributeModifier(attributes[key]), rollTarget: getAttributeRollTarget(attributes[key]) })),
    attributeReferences: CHARACTER_ATTRIBUTE_REFERENCE_KEYS.map(key => {
      const reference = getAttributeReference(referenceCatalog, key, attributes[key]);
      return { key, fields: getAttributeReferenceFields(key).map(field => ({ label: field.label, value: reference?.[field.key] ?? null })) };
    }),
    baseInitiative: getBaseInitiative(attributes.DEX),
    hp: getCharacterHp(attributes.CON, draft.profile.hpMultiplierSteps),
    anatomy: resolveRaceHealthAnatomy(attributes.CON, draft.profile.hpMultiplierSteps, anatomy),
    anatomyChanged: JSON.stringify(anatomy ?? null) !== JSON.stringify(race.race.anatomy ?? null),
    movement: (mechanics.movementMode === "override" ? mechanics.movement : race.movementModes).map(mode => {
      const baseValue = getCharacterMovementBaseValue(mode.baseValue, draft.profile.baseMovementSteps);
      return { ...mode, baseValue, initiative: getMovementInitiative(attributes.DEX, baseValue) };
    }),
    protections: mechanics.protectionMode === "override" ? mechanics.protections : race.formPreview.naturalProtections,
    attacks: mechanics.attacksMode === "override" ? mechanics.attacks : race.formPreview.naturalAttacks,
    skills,
    skillAdditions: additions.map(addition => ({ ...addition, definition: skillCatalog.find(skill => skill.id === addition.skillId)?.definition ?? "" })),
    interactionRules: mechanics.interactionMode === "race" ? raceRules : mechanics.interactionMode === "replace" ? formRules : [...raceRules, ...formRules],
    interactionMode: mechanics.interactionMode,
    manipulation: mechanics.manipulation, speech: mechanics.speech, equipment: mechanics.equipment, restrictions: mechanics.restrictions,
    transformation: form.transformation ?? null,
  });
}
export type CharacterFormPreview = NonNullable<ReturnType<typeof resolveCharacterFormPreview>>;
