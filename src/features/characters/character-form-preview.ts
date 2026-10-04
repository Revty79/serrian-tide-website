import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAttributeReference, type CharacterDraft, type CharacterRaceAggregate, type CharacterSkillReference } from "./models";
import { CHARACTER_ATTRIBUTE_REFERENCE_KEYS, getAttributeReference, getAttributeReferenceFields } from "./attribute-reference";
import { getAttributeModifier, getAttributeRollTarget, getBaseInitiative, getCharacterHp, getCharacterMovementBaseValue, getCharacterSkillRanks, getEffectiveSkillPoints, getMovementInitiative, getSkillRollTarget, normalizeSkillAttributeKey } from "./character-rules";
import { resolveRaceHealthAnatomy } from "@/features/active-state/anatomy";
import { resolveRaceFormMechanics, resolveFormSkillInputs } from '@/features/forms/effective-form-mechanics';
import { emptyRaceFormMechanics } from "@/features/races/race-form-mechanics";

export function availableCharacterForms(draft: Pick<CharacterDraft, "profile">, race: CharacterRaceAggregate | null) {
  if (!race || draft.profile.raceId !== race.race.id) return [];
  return (race.formPreview?.forms ?? []).filter(form => form.raceId === race.race.id);
}

/** Presentation of the shared pure mechanics; selecting this view changes no state. */
export function resolveCharacterFormPreview(draft: CharacterDraft, race: CharacterRaceAggregate | null, formId: number | null, skillCatalog: readonly CharacterSkillReference[], referenceCatalog: readonly CharacterAttributeReference[] = []) {
  const form = availableCharacterForms(draft, race).find(form => form.id === formId);
  if (!form || !race?.formPreview) return null;
  const mechanics = form.mechanics ?? emptyRaceFormMechanics();
  const effective = resolveRaceFormMechanics(race, draft.attributes, mechanics);
  const { attributes, additions, anatomy } = effective;
  const displayRace = effective.race;
  const allocations = resolveFormSkillInputs(draft.skillAllocations, additions, skillCatalog);
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
  // Copies isolate consumers as well as this resolver from the authoritative draft/catalog.
  return structuredClone({
    form: { id: form.id, name: form.name, description: form.description, notes: form.notes },
    size: effective.race.race.size,
    attributes: CHARACTER_ATTRIBUTE_KEYS.map(key => ({ key, stored: draft.attributes[key], adjustment: mechanics.attributeAdjustments[key], value: attributes[key], modifier: getAttributeModifier(attributes[key]), rollTarget: getAttributeRollTarget(attributes[key]) })),
    attributeReferences: CHARACTER_ATTRIBUTE_REFERENCE_KEYS.map(key => {
      const reference = getAttributeReference(referenceCatalog, key, attributes[key]);
      return { key, fields: getAttributeReferenceFields(key).map(field => ({ label: field.label, value: reference?.[field.key] ?? null })) };
    }),
    baseInitiative: getBaseInitiative(attributes.DEX),
    hp: getCharacterHp(attributes.CON, draft.profile.hpMultiplierSteps),
    anatomy: resolveRaceHealthAnatomy(attributes.CON, draft.profile.hpMultiplierSteps, anatomy),
    anatomyChanged: JSON.stringify(anatomy ?? null) !== JSON.stringify(race.race.anatomy ?? null),
    movement: effective.movement.map(mode => {
      const baseValue = getCharacterMovementBaseValue(mode.baseValue, draft.profile.baseMovementSteps);
      return { ...mode, baseValue, initiative: getMovementInitiative(attributes.DEX, baseValue) };
    }),
    protections: effective.protections,
    attacks: effective.attacks,
    skills,
    grantedAbilities: [...new Map(displayRace.skillLinks.filter(link => link.linkType === "Granted").map(link => [link.skillId, {
      skillId: link.skillId, name: skillCatalog.find(skill => skill.id === link.skillId)?.name || link.skillName,
      definition: skillCatalog.find(skill => skill.id === link.skillId)?.definition ?? "",
      fromRace: race.skillLinks.some(normal => normal.skillId === link.skillId && normal.linkType === "Granted"),
    }])).values()],
    skillAdditions: additions.map(addition => ({ ...addition, definition: skillCatalog.find(skill => skill.id === addition.skillId)?.definition ?? "" })),
    interactionRules: effective.interactionRules?.rules ?? [],
    interactionMode: mechanics.interactionMode,
    manipulation: mechanics.manipulation, speech: mechanics.speech, equipment: mechanics.equipment, restrictions: mechanics.restrictions,
    transformation: form.transformation ?? null,
  });
}
export type CharacterFormPreview = NonNullable<ReturnType<typeof resolveCharacterFormPreview>>;
