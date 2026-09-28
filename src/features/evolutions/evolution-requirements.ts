import { absent, allRequirements, anyRequirementGroup, evaluateNumericComparison, finiteNumber, nonnegativeInteger, NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS, positiveInteger, type RequirementResult } from "@/features/requirements/requirement-primitives";
import { evaluateFormAccess } from "@/features/forms/form-access";
import type { FormAccess, FormAccessContext } from "@/features/forms/form-access";
export type EvolutionOwner = "race" | "creature";

export type EvolutionRequirementMode = "unrestricted" | "requirements";
export const EVOLUTION_REQUIREMENT_TYPES = ["age", "current-experience", "total-experience", "skill", "creature-ability", "derived-ability", "item", "condition", "form-access", "manual"] as const;
export type EvolutionRequirementType = typeof EVOLUTION_REQUIREMENT_TYPES[number];
export const EVOLUTION_MANUAL_CATEGORIES = ["god-approval", "story-event", "milestone", "environment", "current-form", "custom"] as const;
export type EvolutionManualCategory = typeof EVOLUTION_MANUAL_CATEGORIES[number];
export type EvolutionRequirementOperator = typeof NUMERIC_REQUIREMENT_OPERATORS[number] | typeof POSSESSION_REQUIREMENT_OPERATORS[number];
export const EVOLUTION_TYPE_LABELS: Record<EvolutionRequirementType, string> = { age: "Age", "current-experience": "Current Experience", "total-experience": "Total Experience", skill: "Skill", "creature-ability": "Creature Ability", "derived-ability": "Derived Ability", item: "Item available", condition: "Active condition", "form-access": "Qualifies for Form", manual: "G.O.D. review" };
export const EVOLUTION_MANUAL_LABELS: Record<EvolutionManualCategory, string> = { "god-approval": "G.O.D. approval", "story-event": "Story event", milestone: "Milestone", environment: "Environment", "current-form": "Currently in a Form", custom: "Custom / manual" };
export const EVOLUTION_OPERATOR_LABELS: Record<EvolutionRequirementOperator, string> = { gte: "At least", gt: "More than", lte: "At most", lt: "Less than", eq: "Equal to", neq: "Different from", possessed: "Must have", "not-possessed": "Must not have" };
export type EvolutionRequirement = {
  id?: number; key: string; groupNumber: number; sortOrder: number; requirementType: EvolutionRequirementType;
  operator: EvolutionRequirementOperator | null; requiredValue: number | null;
  skillId: number | null; itemId: number | null; itemHolder: "creature" | "owner" | "character" | null;
  creatureAbilityCanonicalId: string | null; creatureFormKey: string | null; raceFormKey?: string | null; derivedAbilityId?: number | null;
  conditionName: string | null; manualCategory: EvolutionManualCategory | null; notes: string;
  referenceName?: string; referenceArchived?: boolean;
};
export type EvolutionRequirements = { mode: EvolutionRequirementMode; requirements: EvolutionRequirement[] };
export const isNumericEvolutionRequirement = (type: EvolutionRequirementType) => ["age", "current-experience", "total-experience"].includes(type);
export function emptyEvolutionRequirement(key: string, groupNumber: number, requirementType: EvolutionRequirementType = "manual"): EvolutionRequirement {
  return { key, groupNumber, sortOrder: 0, requirementType, operator: requirementType === "manual" ? null : isNumericEvolutionRequirement(requirementType) ? "gte" : "possessed", requiredValue: isNumericEvolutionRequirement(requirementType) ? 0 : null, skillId: null, itemId: null, itemHolder: requirementType === "item" ? "creature" : null, creatureAbilityCanonicalId: null, creatureFormKey: null, conditionName: null, manualCategory: requirementType === "manual" ? "god-approval" : null, notes: "" };
}
export function normalizeEvolutionRequirements(input: EvolutionRequirements, owner: EvolutionOwner = "creature"): EvolutionRequirements {
  if (!input || !["unrestricted", "requirements"].includes(input.mode) || !Array.isArray(input.requirements)) throw new Error("Choose an Evolution requirement mode.");
  if (input.mode === "unrestricted" && input.requirements.length) throw new Error("Remove requirements before choosing Unrestricted.");
  if (input.mode === "requirements" && !input.requirements.length) throw new Error("Add at least one Evolution requirement.");
  const keys = new Set<string>(), positions = new Set<string>();
  const requirements = input.requirements.map(row => {
    if (!row || typeof row.key !== "string" || !row.key.trim() || keys.has(row.key.trim())) throw new Error("Every Evolution requirement needs a unique identity.");
    keys.add(row.key.trim()); nonnegativeInteger(row.groupNumber, "Group"); nonnegativeInteger(row.sortOrder, "Order");
    const position = `${row.groupNumber}:${row.sortOrder}`;
    if (positions.has(position)) throw new Error("Requirement positions must be unique within a group."); positions.add(position);
    if (!EVOLUTION_REQUIREMENT_TYPES.includes(row.requirementType) || typeof row.notes !== "string") throw new Error("Choose a valid Evolution requirement type and notes.");
    const type = row.requirementType;
    if (owner === "creature") { absent(row.raceFormKey, "Race Form"); absent(row.derivedAbilityId, "Derived Ability"); if (type === "derived-ability") throw new Error("Creature requirements cannot use Character Derived Abilities."); }
    else { absent(row.creatureFormKey, "Creature Form"); absent(row.creatureAbilityCanonicalId, "Creature Ability"); if (type === "creature-ability") throw new Error("Race requirements cannot use Creature Abilities."); }
    if (type === "derived-ability") positiveInteger(row.derivedAbilityId, "Derived Ability");
    if (type !== "derived-ability") absent(row.derivedAbilityId, "Derived Ability");
    if (type !== "form-access") absent(row.raceFormKey, "Race Form");
    for (const [field, owner] of [["skillId", "skill"], ["itemId", "item"], ["itemHolder", "item"], ["creatureAbilityCanonicalId", "creature-ability"], ["creatureFormKey", "form-access"], ["conditionName", "condition"], ["manualCategory", "manual"]] as const) {
      if (type !== owner) absent(row[field], field);
    }
    if (type === "skill") positiveInteger(row.skillId, "Skill");
    if (type === "item") { positiveInteger(row.itemId, "Item"); if (!(owner === "race" ? ["character"] : ["creature", "owner"]).includes(row.itemHolder!)) throw new Error("Choose who must hold the Item."); }
    for (const [field, owner] of [["creatureAbilityCanonicalId", "creature-ability"], ["creatureFormKey", "form-access"], ["conditionName", "condition"]] as const) {
      if (type === owner && !(field === "creatureFormKey" && row.raceFormKey) && (typeof row[field] !== "string" || !row[field]!.trim())) throw new Error(`Choose or enter the required ${EVOLUTION_TYPE_LABELS[type]}.`);
    }
    if (owner === "race" && type === "form-access" && (typeof row.raceFormKey !== "string" || !row.raceFormKey.trim())) throw new Error("Choose a Form on this exact source Race.");
    if (isNumericEvolutionRequirement(type) || (owner === "race" && type === "skill" && NUMERIC_REQUIREMENT_OPERATORS.some(op => op === row.operator))) {
      if (!NUMERIC_REQUIREMENT_OPERATORS.some(op => op === row.operator)) throw new Error("Choose a numeric comparison.");
      if (finiteNumber(row.requiredValue, "Required value") < 0) throw new Error("Required value cannot be negative.");
    } else if (type === "manual") {
      absent(row.operator, "Operator"); absent(row.requiredValue, "Value");
      if (!EVOLUTION_MANUAL_CATEGORIES.includes(row.manualCategory!) || !row.notes.trim()) throw new Error("Choose a manual category and explain what the G.O.D. must confirm.");
    } else {
      absent(row.requiredValue, "Value");
      if (!POSSESSION_REQUIREMENT_OPERATORS.some(op => op === row.operator)) throw new Error("Choose Must have or Must not have.");
      if (["item", "form-access"].includes(type) && row.operator !== "possessed") throw new Error("Item and Form qualification requirements must be positive prerequisites.");
    }
    return { ...row, key: row.key.trim(), notes: row.notes.trim(), skillId: row.skillId ?? null, itemId: row.itemId ?? null, itemHolder: row.itemHolder ?? null, manualCategory: row.manualCategory ?? null, operator: row.operator ?? null, requiredValue: row.requiredValue ?? null, conditionName: row.conditionName?.trim() ?? null, creatureFormKey: row.creatureFormKey?.trim() ?? null, creatureAbilityCanonicalId: row.creatureAbilityCanonicalId?.trim() ?? null, raceFormKey: row.raceFormKey?.trim() ?? null, derivedAbilityId: row.derivedAbilityId ?? null };
  }).sort((a,b) => a.groupNumber - b.groupNumber || a.sortOrder - b.sortOrder);
  return { mode: input.mode, requirements };
}

export type EvolutionEligibilityStatus = "eligible" | "not-eligible" | "god-review";
export const EVOLUTION_STATUS_LABELS: Record<EvolutionEligibilityStatus, string> = { eligible: "Eligible", "not-eligible": "Not eligible", "god-review": "Requires G.O.D. review" };
export type EvolutionEvaluation = {
  status: EvolutionEligibilityStatus; explanation: string;
  groups: Array<{ groupNumber: number; status: EvolutionEligibilityStatus; requirements: Array<{ key: string; status: EvolutionEligibilityStatus; explanation: string; confirmable?: boolean }> }>;
};
export type EvolutionFactContext = {
  owner: EvolutionOwner; unavailable?: boolean;
  age: number | null; currentExperience: number | null; totalExperience: number | null;
  context: FormAccessContext; forms: readonly { key: string; access?: FormAccess }[] | undefined;
  ownerPresent: boolean; individualItemIds: ReadonlySet<number> | null; ownerItemIds: ReadonlySet<number> | null;
  conditionNames: readonly string[];
};
const statusFor = (result: RequirementResult): EvolutionEligibilityStatus => result === "satisfied" ? "eligible" : result === "manual" ? "god-review" : "not-eligible";
export const normalizeEvolutionConditionName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

/** Shared grouping and comparisons; typed services supply authoritative facts, never projected mechanics. */
export function evaluateEvolutionGroups(input: EvolutionRequirements, facts: EvolutionFactContext): EvolutionEvaluation {
  try {
    const normalized = normalizeEvolutionRequirements(input, facts.owner);
    if (facts.context.owner !== facts.owner) throw new Error("Evolution facts belong to a different definition type.");
    if (facts.unavailable) return { status: "not-eligible", explanation: "Restore the source, destination, individual and Campaign before checking Evolution readiness.", groups: [] };
    if (normalized.mode === "unrestricted") return { status: "eligible", explanation: "This path has no prerequisites. This is a preview; no Evolution is performed.", groups: [] };
    const groups = new Map<number, Array<{ key: string; result: RequirementResult; explanation: string; confirmable: boolean }>>();
    for (const row of normalized.requirements) {
      let result: RequirementResult = "unsatisfied", explanation = "", confirmable = false;
      const label = row.referenceName ?? (row.skillId ? `Skill #${row.skillId}` : row.itemId ? `Item #${row.itemId}` : row.derivedAbilityId ? `Derived Ability #${row.derivedAbilityId}` : row.creatureAbilityCanonicalId ?? row.creatureFormKey ?? row.raceFormKey ?? row.conditionName ?? EVOLUTION_TYPE_LABELS[row.requirementType]);
      const numericSkill = row.requirementType === "skill" && NUMERIC_REQUIREMENT_OPERATORS.some(op => op === row.operator);
      if (isNumericEvolutionRequirement(row.requirementType) || numericSkill) {
        const value = numericSkill ? facts.context.skillPoints?.get(row.skillId!) ?? (facts.context.skillPoints ? 0 : null) : row.requirementType === "age" ? facts.age : row.requirementType === "current-experience" ? facts.currentExperience : facts.totalExperience;
        const rule = `${numericSkill ? `${label} purchased points` : EVOLUTION_TYPE_LABELS[row.requirementType]} ${EVOLUTION_OPERATOR_LABELS[row.operator!].toLowerCase()} ${row.requiredValue}`;
        result = value === null || !Number.isFinite(value) || value < 0 ? "manual" : evaluateNumericComparison(value, row.operator!, row.requiredValue!);
        explanation = result === "manual" ? `${rule}; the saved individual value is unknown and needs G.O.D. review.` : `${rule}; saved individual value: ${value}.`;
      } else if (row.requirementType === "manual") {
        confirmable = true; result = "manual"; explanation = `${EVOLUTION_MANUAL_LABELS[row.manualCategory!]}: ${row.notes}`;
      } else if (row.requirementType === "form-access") {
        const form = facts.forms?.find(form => form.key === (facts.owner === "race" ? row.raceFormKey : row.creatureFormKey));
        if (!form) { result = facts.forms === undefined ? "manual" : "unsatisfied"; explanation = "This exact Form is not recorded in the authoritative source for this individual."; }
        else {
          const access = evaluateFormAccess(form.access, facts.context);
          result = access.status === "available" ? "satisfied" : access.status === "manual-review" ? "manual" : "unsatisfied";
          // A ruling may satisfy authored manual Access clauses, never missing automatic facts.
          confirmable = access.status === "manual-review" && access.groups.some(group => group.requirements.every(requirement =>
            requirement.status === "available" || (requirement.status === "manual-review" && form.access?.requirements.some(rule => rule.key === requirement.key && rule.requirementType === "manual"))));
          explanation = `Qualifies for ${label}: ${access.explanation} ${access.groups.map(group => `Group ${group.groupNumber + 1}: ${group.requirements.map(requirement => requirement.explanation).join("; ")}`).join(" OR ")} No Form is activated.`;
        }
      } else if (row.requirementType === "item") {
        const ids = row.itemHolder === "owner" ? facts.ownerItemIds : facts.individualItemIds;
        result = row.itemHolder === "owner" && !facts.ownerPresent ? "unsatisfied" : ids === null ? "manual" : ids.has(row.itemId!) ? "satisfied" : "unsatisfied";
        explanation = `${label} must be carried, Loose and usable by ${row.itemHolder === "owner" ? "the owning Character" : "this individual"}. ${row.itemHolder === "owner" && !facts.ownerPresent ? "There is no current owner." : ids === null ? "Inventory availability needs G.O.D. review." : result === "satisfied" ? "Available; nothing is consumed." : "No available copy; retrieve or recover it first."}`;
      } else {
        const possessed = row.requirementType === "skill" ? facts.context.possessedSkillIds?.has(row.skillId!)
          : row.requirementType === "creature-ability" ? facts.context.creatureAbilityCanonicalIds?.has(row.creatureAbilityCanonicalId!)
          : row.requirementType === "derived-ability" ? facts.context.possessedDerivedAbilityIds?.has(row.derivedAbilityId!)
          : facts.conditionNames.some(name => normalizeEvolutionConditionName(name) === normalizeEvolutionConditionName(row.conditionName!));
        result = possessed === undefined ? "manual" : possessed === (row.operator === "possessed") ? "satisfied" : "unsatisfied";
        explanation = `${label}: ${EVOLUTION_OPERATOR_LABELS[row.operator!]}; ${possessed === undefined ? "needs G.O.D. review" : possessed ? "present" : "absent"} on this individual.`;
      }
      const group = groups.get(row.groupNumber) ?? []; group.push({ key: row.key, result, explanation, confirmable }); groups.set(row.groupNumber, group);
    }
    const results = [...groups.values()].map(rows => allRequirements(rows.map(row => row.result)));
    const status = statusFor(anyRequirementGroup(results));
    return { status, explanation: status === "eligible" ? "The individual meets every requirement in at least one group. Preview only; no Evolution is performed." : status === "god-review" ? "At least one group still needs G.O.D. review." : "The individual does not meet any complete requirement group.",
      groups: [...groups].map(([groupNumber, rows], index) => ({ groupNumber, status: statusFor(results[index]), requirements: rows.map(({ key, result, explanation, confirmable }) => ({ key, status: statusFor(result), explanation, ...(confirmable ? { confirmable: true } : {}) })) })) };
  } catch (error) { return { status: "not-eligible", explanation: `Eligibility needs correction: ${error instanceof Error ? error.message : "Invalid requirements or facts."}`, groups: [] }; }
}

/** Apply this execution's explicit rulings using the same AND/OR primitives as preview. */
export function confirmEvolutionEvaluation(evaluation: EvolutionEvaluation, confirmedKeys: readonly string[]): EvolutionEvaluation {
  const allowed = new Set(evaluation.groups.flatMap(group => group.requirements.filter(row => row.confirmable && row.status === "god-review").map(row => row.key)));
  if (new Set(confirmedKeys).size !== confirmedKeys.length || confirmedKeys.some(key => !allowed.has(key))) throw new Error("Confirm only the exact manual requirements shown in the current preview.");
  const confirmed = new Set(confirmedKeys);
  const toResult = (status: EvolutionEligibilityStatus): RequirementResult => status === "eligible" ? "satisfied" : status === "god-review" ? "manual" : "unsatisfied";
  if (!evaluation.groups.length) return evaluation;
  const groups = evaluation.groups.map(group => {
    const requirements = group.requirements.map(row => confirmed.has(row.key) ? { ...row, status: "eligible" as const, explanation: `${row.explanation} Confirmed by the Campaign G.O.D. for this execution.` } : row);
    return { ...group, requirements, status: statusFor(allRequirements(requirements.map(row => toResult(row.status)))) };
  });
  const status = statusFor(anyRequirementGroup(groups.map(group => toResult(group.status))));
  return { status, groups, explanation: status === "eligible" ? "Every automatic prerequisite and required manual ruling in at least one group is satisfied for this execution." : "No complete group is satisfied. Correct unknown saved facts and confirm the required manual rulings." };
}
