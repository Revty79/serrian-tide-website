import { referenceKey, type MechanicsReference, type SpecialAbilityMechanicsDocument } from "./models";
import type { MechanicalEffect } from "@/features/mechanical-effects/models";
/** Data references only. Never traverse or execute another mechanics document. */
export function collectMechanicsReferences(document: SpecialAbilityMechanicsDocument): MechanicsReference[] {
  const result = new Map<string, MechanicsReference>();
  function add(ref: MechanicsReference) { result.set(referenceKey(ref), ref); }
  function effect(ref: MechanicalEffect) { if (ref.kind === "modifier.apply" && ref.channel === "skill") add({ kind: "skill", skillId: Number(ref.targetKey.slice(6)) }); }
  for (const rule of document.rules) {
    for (const ref of rule.references) result.set(referenceKey(ref), { ...ref });
    if (rule.kind === "modifier") effect(rule.effect);
    if (rule.kind === "activated") for (const row of rule.effects) effect(row.effect);
    if (rule.kind === "choice" && rule.selection.kind === "skill") rule.selection.skillIds.forEach(skillId => add({ kind: "skill", skillId }));
    if (rule.kind === "choice" && rule.selection.kind === "derived-ability") rule.selection.derivedAbilityIds.forEach(derivedAbilityId => add({ kind: "derived-ability", derivedAbilityId }));
    const requirements = [rule.when, ...(rule.kind === "resource" ? rule.maximumChanges.map(change => change.when) : [])];
    for (const when of requirements) if (when.mode === "requirements") for (const group of when.groups) for (const condition of group.conditions) {
      const ref: MechanicsReference | null = condition.kind === "skill-possession" ? { kind: "skill", skillId: condition.skillId }
        : condition.kind === "derived-ability-possession" ? { kind: "derived-ability", derivedAbilityId: condition.derivedAbilityId } : null;
      if (ref) result.set(referenceKey(ref), ref);
    }
  }
  return [...result.values()].sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)));
}
