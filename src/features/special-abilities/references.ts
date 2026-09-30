import { referenceKey, type MechanicsReference, type SpecialAbilityMechanicsDocument } from "./models";
/** Data references only. Never traverse or execute another mechanics document. */
export function collectMechanicsReferences(document: SpecialAbilityMechanicsDocument): MechanicsReference[] {
  const result = new Map<string, MechanicsReference>();
  for (const rule of document.rules) {
    for (const ref of rule.references) result.set(referenceKey(ref), { ...ref });
    if (rule.when.mode === "requirements") for (const group of rule.when.groups) for (const condition of group.conditions) {
      const ref: MechanicsReference | null = condition.kind === "skill-possession" ? { kind: "skill", skillId: condition.skillId }
        : condition.kind === "derived-ability-possession" ? { kind: "derived-ability", derivedAbilityId: condition.derivedAbilityId } : null;
      if (ref) result.set(referenceKey(ref), ref);
    }
  }
  return [...result.values()].sort((a, b) => referenceKey(a).localeCompare(referenceKey(b)));
}
