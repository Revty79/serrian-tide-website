import type { CreatureDraft } from "./models";
import { projectCreatureFormDefinition } from "./creature-forms";
import { resolveCreatureHpModel } from "./creature-size-rules";

export function availableCreatureForms(snapshot: CreatureDraft) {
  return (snapshot.forms ?? []).filter(form => form.id !== undefined && form.creatureId === snapshot.id)
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.id! - b.id!);
}

/** Display-only projection of frozen metadata. No health, inventory, combat, writes or runtime resolvers. */
export function resolveCreatureFormPreview(snapshot: CreatureDraft, formId: number | null, hpAdjustment = 0) {
  const form = availableCreatureForms(snapshot).find(row => row.id === formId);
  if (!form) return null;
  const definition = projectCreatureFormDefinition(snapshot, form.mechanics);
  const hp = resolveCreatureHpModel(definition, definition.hpPools, hpAdjustment);
  const normalRules = snapshot.core.interactionRules?.rules ?? [];
  const formRules = form.mechanics.interactionRules?.rules ?? [];
  return structuredClone({
    form, definition, hp,
    interactionRules: form.mechanics.interactionMode === "creature" ? normalRules : form.mechanics.interactionMode === "replace" ? formRules : [...normalRules, ...formRules],
  });
}
