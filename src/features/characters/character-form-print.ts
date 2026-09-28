import type { CharacterAggregate } from "./models";
import { characterAggregateToDraft } from "./character-rules";
import { availableCharacterForms, resolveCharacterFormPreview } from "./character-form-preview";
import { evaluateCharacterFormAccess } from "@/features/forms/form-access-context";
import { emptyRaceFormMechanics } from "@/features/races/race-form-mechanics";

/** Saved Normal facts only. Selection and Form viewing never enter this projection. */
export function buildCharacterFormReferences(aggregate: CharacterAggregate) {
  const draft = characterAggregateToDraft(aggregate), race = aggregate.selectedRace;
  return availableCharacterForms(draft, race).flatMap(form => {
    const preview = resolveCharacterFormPreview(draft, race, form.id, aggregate.skillCatalog, aggregate.attributeReferenceCatalog);
    if (!preview || !race) return [];
    const mechanics = form.mechanics ?? emptyRaceFormMechanics();
    return [{ raceId: race.race.id, raceName: race.race.name, characterName: aggregate.character.name,
      preview, access: evaluateCharacterFormAccess(aggregate, race.race.id, form.access),
      sources: { size: mechanics.size == null ? "Normal Race" : "Form replacement",
        anatomy: mechanics.anatomyMode === "override" ? "Form replacement" : "Normal Race",
        movement: mechanics.movementMode === "override" ? "Form replacement" : "Normal Race",
        protection: mechanics.protectionMode === "override" ? "Form replacement" : "Normal Race",
        attacks: mechanics.attacksMode === "override" ? "Form replacement" : "Normal Race",
        skills: mechanics.skillsMode === "add" ? "Normal Skills plus Form additions" : "Normal Skills",
      } }];
  });
}
export type CharacterFormReference = ReturnType<typeof buildCharacterFormReferences>[number];

/** Reject stale/foreign IDs and duplicates, retaining the current Race's authored order. */
export function selectedCharacterFormReferences(references: readonly CharacterFormReference[], selected: readonly number[]) {
  const ids = new Set(selected);
  return references.filter(row => ids.has(row.preview.form.id));
}
