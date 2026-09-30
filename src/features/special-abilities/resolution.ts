import { isSpecialAbilitySkill } from "@/features/characters/character-rules";
import type { CharacterDraft } from "@/features/characters/models";
import { allRequirements, anyRequirementGroup, evaluateNumericComparison, type RequirementResult } from "@/features/requirements/requirement-primitives";
import { readSpecialAbilityMechanics } from "./codec";
import { referenceKey, type MechanicsCondition, type MechanicsDiagnostic, type MechanicsReference, type StoredMechanics } from "./models";
import { resolveSpecialAbilityProgression } from "./progression";
import { collectMechanicsReferences } from "./references";
import { summarizeMechanicsRule } from "./summaries";

export type MechanicsReferenceView = MechanicsReference & { name: string | null; status: "available" | "archived" | "missing" | "unavailable" };
export type MechanicsOwnerFacts = {
  possessedSkillIds: ReadonlySet<number> | null;
  possessedDerivedAbilityIds: ReadonlySet<number> | null;
  savedAllocations: Pick<CharacterDraft, "skillAllocations"> | null;
};
export type MechanicsRuleStatus = "matched" | "not-matched" | "manual" | "unavailable";
const status = (result: RequirementResult): MechanicsRuleStatus => result === "satisfied" ? "matched" : result === "unsatisfied" ? "not-matched" : "manual";

/** Pure authoring projection. Matched conditions never apply or grant a mechanic. */
export function resolveSpecialAbilityMechanics(input: {
  source: { id: number; name: string; classification: string; archived: boolean };
  stored: StoredMechanics | null;
  owner: MechanicsOwnerFacts | null;
  references?: readonly MechanicsReferenceView[];
}) {
  const read = readSpecialAbilityMechanics(input.stored);
  const progression = resolveSpecialAbilityProgression(input.source.id, input.owner?.savedAllocations ?? null);
  const possessed = input.owner?.possessedSkillIds?.has(input.source.id) ?? null;
  const refMap = new Map((input.references ?? []).map(ref => [referenceKey(ref), ref]));
  const references = read.status === "ready" ? collectMechanicsReferences(read.document).map(ref =>
    refMap.get(referenceKey(ref)) ?? { ...ref, name: null, status: "unavailable" as const }) : [];
  const diagnostics: MechanicsDiagnostic[] = [...read.diagnostics];
  const classificationValid = isSpecialAbilitySkill(input.source);
  if (!classificationValid) diagnostics.push({ code: "classification", path: "$", message: "Mechanics belong only to Skills classified as Special Abilities." });
  if (input.source.archived) diagnostics.push({ code: "archived-source", path: "$", message: "This Special Ability is archived. Its saved authoring is retained." });
  for (const ref of references) if (ref.status !== "available") diagnostics.push({ code: "reference-" + ref.status, path: referenceKey(ref),
    message: `${ref.name ?? referenceKey(ref)}: ${ref.status} reference; no replacement or grant is inferred.` });

  function evaluate(condition: MechanicsCondition): { key: string; result: RequirementResult; explanation: string } {
    if (condition.kind === "manual") return { key: condition.key, result: "manual", explanation: condition.notes };
    if (condition.kind === "self-progression") return { key: condition.key,
      result: progression.value === null ? "manual" : evaluateNumericComparison(progression.value, condition.operator, condition.requiredValue),
      explanation: `${progression.label}: ${progression.value ?? "unknown"}; requires ${condition.operator} ${condition.requiredValue}.` };
    const ref: MechanicsReference = condition.kind === "skill-possession" ? { kind: "skill", skillId: condition.skillId }
      : { kind: "derived-ability", derivedAbilityId: condition.derivedAbilityId };
    const view = refMap.get(referenceKey(ref));
    const facts = condition.kind === "skill-possession" ? input.owner?.possessedSkillIds : input.owner?.possessedDerivedAbilityIds;
    const id = ref.kind === "skill" ? ref.skillId : ref.derivedAbilityId;
    const known = !!view && (view.status === "available" || view.status === "archived") && facts != null;
    const actual = known ? facts.has(id) : null;
    return { key: condition.key, result: actual === null ? "manual" : actual === (condition.operator === "possessed") ? "satisfied" : "unsatisfied",
      explanation: `${view?.name ?? referenceKey(ref)}: ${condition.operator}; possession ${actual === null ? "unknown" : actual ? "confirmed" : "not present"}.` };
  }
  const rules = read.status === "ready" ? read.document.rules.map(rule => {
    // Definition-only/unpossessed contexts do not claim conditions were evaluated.
    const eligible = classificationValid && possessed === true;
    const groups = eligible && rule.when.mode === "requirements" ? rule.when.groups.map(group => {
      const conditions = group.conditions.map(evaluate);
      return { key: group.key, result: allRequirements(conditions.map(row => row.result)), conditions };
    }) : [];
    const result = anyRequirementGroup(groups.map(row => row.result));
    const missingDocumentation = rule.references.some(ref => !refMap.has(referenceKey(ref)) || ["missing", "unavailable"].includes(refMap.get(referenceKey(ref))!.status));
    const ruleStatus: MechanicsRuleStatus = !eligible ? "unavailable" : result === "unsatisfied" ? "not-matched"
      : rule.kind === "manual" || missingDocumentation ? "manual" : status(result);
    return { key: rule.key, title: rule.title, kind: rule.kind, status: ruleStatus, groups,
      explanation: !classificationValid ? "This Skill is not classified as a Special Ability."
        : !eligible ? possessed === false ? "The owner does not possess this Special Ability." : "Owner facts are unavailable; this is a definition-only view."
        : ruleStatus === "manual" ? "G.O.D. determination or additional facts are required."
        : ruleStatus === "matched" ? "Authored conditions match. Nothing has been activated, paid, applied or granted." : "Authored conditions do not match.",
      summary: summarizeMechanicsRule(rule), authored: rule };
  }) : [];
  return structuredClone({ source: input.source, documentStatus: classificationValid ? read.status : "invalid" as const, schemaVersion: read.schemaVersion,
    empty: read.status === "ready" && read.document.rules.length === 0, context: input.owner ? "owner" as const : "definition" as const,
    possessed, progression, rules, references, diagnostics, runtimeSupported: false as const });
}
export type SpecialAbilityMechanicsProjection = ReturnType<typeof resolveSpecialAbilityMechanics>;
