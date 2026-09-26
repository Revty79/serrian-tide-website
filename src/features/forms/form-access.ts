import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAttributeKey } from "@/features/characters/models";
import { absent, allRequirements, anyRequirementGroup, evaluateNumericComparison, finiteNumber, nonnegativeInteger, NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS, positiveInteger, type RequirementResult } from "@/features/requirements/requirement-primitives";

export type FormAccessOwner = "race" | "creature";
export type FormAccessMode = "unrestricted" | "requirements";
export type FormAccessType = "attribute" | "skill" | "derived-ability" | "creature-ability" | "manual";
export type FormAccessOperator = typeof NUMERIC_REQUIREMENT_OPERATORS[number] | typeof POSSESSION_REQUIREMENT_OPERATORS[number];
export type FormAccessRequirement = {
  key: string;
  groupNumber: number;
  requirementType: FormAccessType;
  attributeKey: CharacterAttributeKey | null;
  skillId: number | null;
  requiredDerivedAbilityId: number | null;
  requiredCreatureAbilityCanonicalId: string | null;
  operator: FormAccessOperator | null;
  requiredValue: number | null;
  notes: string;
  sortOrder: number;
  /** Read-only display labels; saved library identities remain authoritative. */
  referenceName?: string;
  skillClassification?: string;
};
export type FormAccess = { mode: FormAccessMode; requirements: FormAccessRequirement[] };
export type FormAccessStatus = "available" | "locked" | "manual-review";
export const FORM_ACCESS_LABELS: Record<FormAccessStatus, string> = { available: "Available", locked: "Locked", "manual-review": "Needs G.O.D. Review" };
export const FORM_ACCESS_HELP = "Access answers who can use this Form. Transformation describes when and how someone who qualifies can change into it.";

export function emptyFormAccess(): FormAccess { return { mode: "unrestricted", requirements: [] }; }
export function emptyFormAccessRequirement(key: string, groupNumber: number, requirementType: FormAccessType = "manual"): FormAccessRequirement {
  return { key, groupNumber, requirementType, attributeKey: null, skillId: null, requiredDerivedAbilityId: null, requiredCreatureAbilityCanonicalId: null, operator: requirementType === "manual" ? null : requirementType === "attribute" ? "gte" : "possessed", requiredValue: requirementType === "attribute" ? 0 : null, notes: "", sortOrder: 0 };
}

/** Undefined is the only legacy default. Explicit malformed definitions fail closed. */
export function normalizeFormAccess(input: FormAccess | undefined, owner: FormAccessOwner): FormAccess {
  if (input === undefined) return emptyFormAccess();
  if (!input || !["unrestricted", "requirements"].includes(input.mode) || !Array.isArray(input.requirements)) throw new Error("Choose who can use this Form, then check the requirements below.");
  if (input.mode === "unrestricted" && input.requirements.length) throw new Error("To keep these requirements, choose Only those who meet specific requirements.");
  if (input.mode === "requirements" && !input.requirements.length) throw new Error("Add at least one requirement, or allow anyone with this Race or Creature to use the Form.");
  const keys = new Set<string>();
  const positions = new Set<string>();
  const requirements = input.requirements.map(row => {
    if (!row || typeof row.key !== "string" || !row.key.trim() || keys.has(row.key.trim())) throw new Error("A requirement could not be identified. Remove and add it again, then save.");
    keys.add(row.key.trim());
    nonnegativeInteger(row.groupNumber, "Requirement group");
    nonnegativeInteger(row.sortOrder, "Requirement order");
    const position = `${row.groupNumber}:${row.sortOrder}`;
    if (positions.has(position)) throw new Error("The order of these requirements could not be saved. Remove and add the affected requirement again.");
    positions.add(position);
    if (typeof row.notes !== "string") throw new Error("Requirement notes must be text.");
    const type = row.requirementType;
    const allowed = owner === "race" ? ["attribute", "skill", "derived-ability", "manual"] : ["attribute", "skill", "creature-ability", "manual"];
    if (!allowed.includes(type)) throw new Error(`Choose a requirement offered for this ${owner === "race" ? "Race" : "Creature"} Form.`);
    if (type !== "attribute") absent(row.attributeKey, "Attribute");
    if (type !== "skill") absent(row.skillId, "Skill");
    if (type !== "derived-ability") absent(row.requiredDerivedAbilityId, "Derived Ability");
    if (type !== "creature-ability") absent(row.requiredCreatureAbilityCanonicalId, "Creature Ability");
    if (type === "attribute" && !CHARACTER_ATTRIBUTE_KEYS.includes(row.attributeKey!)) throw new Error("Choose one of the six Attributes.");
    if (type === "skill") {
      if (row.skillId == null) throw new Error("Choose a Skill or Special Ability from the library.");
      positiveInteger(row.skillId, "Skill");
    }
    if (type === "derived-ability") {
      if (row.requiredDerivedAbilityId == null) throw new Error("Choose a Derived Ability from the library.");
      positiveInteger(row.requiredDerivedAbilityId, "Derived Ability");
    }
    if (type === "creature-ability" && (typeof row.requiredCreatureAbilityCanonicalId !== "string" || !row.requiredCreatureAbilityCanonicalId.trim())) throw new Error("Choose a Normal Creature Ability.");
    const numeric = type === "attribute" || (type === "skill" && owner === "race" && NUMERIC_REQUIREMENT_OPERATORS.some(op => op === row.operator));
    if (numeric) {
      if (!NUMERIC_REQUIREMENT_OPERATORS.some(op => op === row.operator)) throw new Error("Choose a numeric comparison.");
      finiteNumber(row.requiredValue, "Requirement value");
    } else if (type === "manual") {
      absent(row.operator, "Operator"); absent(row.requiredValue, "Numeric value");
      if (!row.notes.trim()) throw new Error("Explain what the G.O.D. must confirm.");
    } else {
      if (!POSSESSION_REQUIREMENT_OPERATORS.some(op => op === row.operator)) throw new Error("Choose whether this Skill or Ability must be present or absent. Creature Skill ranks are not Character points.");
      absent(row.requiredValue, "Numeric value");
    }
    return { ...row, key: row.key.trim(), notes: row.notes.trim(), attributeKey: row.attributeKey ?? null,
      skillId: row.skillId ?? null, requiredDerivedAbilityId: row.requiredDerivedAbilityId ?? null,
      requiredCreatureAbilityCanonicalId: row.requiredCreatureAbilityCanonicalId ?? null,
      operator: row.operator ?? null, requiredValue: row.requiredValue ?? null };
  }).sort((a, b) => a.groupNumber - b.groupNumber || a.sortOrder - b.sortOrder);
  return { mode: input.mode, requirements };
}

export type FormAccessContext = {
  owner: FormAccessOwner;
  attributes: Partial<Record<CharacterAttributeKey, number | null>>;
  possessedSkillIds: ReadonlySet<number>;
  skillPoints?: ReadonlyMap<number, number>;
  possessedDerivedAbilityIds?: ReadonlySet<number>;
  creatureAbilityCanonicalIds?: ReadonlySet<string>;
};
export type FormAccessEvaluation = {
  status: FormAccessStatus;
  explanation: string;
  groups: { groupNumber: number; status: FormAccessStatus; requirements: { key: string; status: FormAccessStatus; explanation: string }[] }[];
};
const statusFor = (result: RequirementResult): FormAccessStatus => result === "satisfied" ? "available" : result === "manual" ? "manual-review" : "locked";
const comparisons = { gte: "at least", gt: "greater than", lte: "at most", lt: "less than", eq: "equal to", neq: "different from" };

/** Reads only caller-provided Normal facts. It never receives or projects Form mechanics. */
export function evaluateFormAccess(input: FormAccess | undefined, context: FormAccessContext): FormAccessEvaluation {
  let access: FormAccess;
  try { access = normalizeFormAccess(input, context.owner); }
  catch (error) { return { status: "locked", explanation: `The access requirements need correction: ${error instanceof Error ? error.message : "Review required."}`, groups: [] }; }
  if (access.mode === "unrestricted") return { status: "available", explanation: `No access requirements for this ${context.owner === "race" ? "Race" : "Creature"} Form.`, groups: [] };
  const grouped = new Map<number, { key: string; result: RequirementResult; explanation: string }[]>();
  for (const row of access.requirements) {
    let result: RequirementResult;
    let explanation: string;
    const numeric = row.requirementType === "attribute" || (row.requirementType === "skill" && row.requiredValue !== null);
    const name = row.requirementType === "attribute" ? row.attributeKey! : row.referenceName || (row.requirementType === "skill" ? `Skill #${row.skillId}` : row.requirementType === "derived-ability" ? `Derived Ability #${row.requiredDerivedAbilityId}` : `Creature Ability ${row.requiredCreatureAbilityCanonicalId}`);
    if (row.requirementType === "manual") {
      result = "manual"; explanation = `G.O.D. review: ${row.notes}`;
    } else if (numeric) {
      const current = row.requirementType === "attribute" ? context.attributes[row.attributeKey!] : context.skillPoints?.get(row.skillId!) ?? 0;
      const threshold = `${name}${row.requirementType === "skill" ? " purchased Skill points" : ""} ${comparisons[row.operator as keyof typeof comparisons]} ${row.requiredValue}`;
      if (current === null || current === undefined || !Number.isFinite(current)) {
        result = "manual"; explanation = `G.O.D. review: Normal ${name} has not been recorded; needs ${threshold}.`;
      } else {
        result = evaluateNumericComparison(current, row.operator!, row.requiredValue!);
        explanation = `${result === "satisfied" ? "Meets" : "Requires"} ${threshold}; Normal value: ${current}.`;
      }
    } else {
      const possessed = row.requirementType === "skill" ? context.possessedSkillIds.has(row.skillId!) : row.requirementType === "derived-ability" ? context.possessedDerivedAbilityIds?.has(row.requiredDerivedAbilityId!) ?? false : context.creatureAbilityCanonicalIds?.has(row.requiredCreatureAbilityCanonicalId!) ?? false;
      result = (row.operator === "possessed") === possessed ? "satisfied" : "unsatisfied";
      explanation = `${result === "satisfied" ? "Meets" : "Requires"}: ${name}${row.skillClassification ? ` · ${row.skillClassification}` : ""} ${row.operator === "possessed" ? "must be present" : "must be absent"} before changing Form.${row.notes ? ` ${row.notes}` : ""}`;
    }
    const group = grouped.get(row.groupNumber) ?? [];
    group.push({ key: row.key, result, explanation }); grouped.set(row.groupNumber, group);
  }
  const results = [...grouped.values()].map(rows => allRequirements(rows.map(row => row.result)));
  const status = statusFor(anyRequirementGroup(results));
  return { status, explanation: status === "available" ? `The saved normal ${context.owner === "race" ? "Character" : "Creature"} meets all requirements in at least one way to qualify.` : status === "manual-review" ? "One way to qualify still needs a G.O.D. ruling." : `The saved normal ${context.owner === "race" ? "Character" : "Creature"} does not meet any complete way to qualify.`, groups: [...grouped].map(([groupNumber, rows], index) => ({ groupNumber, status: statusFor(results[index]), requirements: rows.map(({ key, result, explanation }) => ({ key, status: statusFor(result), explanation })) })) };
}
