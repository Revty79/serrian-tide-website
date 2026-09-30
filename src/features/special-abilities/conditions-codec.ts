import { NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS } from "@/features/requirements/requirement-primitives";
import type { MechanicsReference, MechanicsCondition, MechanicsConditions } from "./models";
import { MECHANICS_LIMITS, fail, object, shape, text, key, choice, list, id, unique } from "./codec-primitives";
export function parseMechanicsReference(value: unknown, path: string): MechanicsReference {
  const row = object(value, path);
  if (row.kind === "skill") {
    shape(row, ["kind", "skillId"], path);
    return { kind: "skill", skillId: id(row.skillId, path + ".skillId") };
  }
  if (row.kind === "derived-ability") {
    shape(row, ["kind", "derivedAbilityId"], path);
    return { kind: "derived-ability", derivedAbilityId: id(row.derivedAbilityId, path + ".derivedAbilityId") };
  }
  return fail(path, "Unsupported reference kind.");
}
function condition(value: unknown, path: string): MechanicsCondition {
  const row = object(value, path), localKey = key(row.key, path + ".key");
  switch (row.kind) {
    case "self-progression": {
      shape(row, ["key", "kind", "operator", "requiredValue"], path);
      const amount = row.requiredValue;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) fail(path + ".requiredValue", "Expected a finite, nonnegative safe numeric threshold.");
      return { key: localKey, kind: row.kind, operator: choice(row.operator, NUMERIC_REQUIREMENT_OPERATORS, path + ".operator"), requiredValue: amount };
    }
    case "skill-possession":
      shape(row, ["key", "kind", "operator", "skillId"], path);
      return { key: localKey, kind: row.kind, skillId: id(row.skillId, path + ".skillId"), operator: choice(row.operator, POSSESSION_REQUIREMENT_OPERATORS, path + ".operator") };
    case "derived-ability-possession":
      shape(row, ["key", "kind", "operator", "derivedAbilityId"], path);
      return { key: localKey, kind: row.kind, derivedAbilityId: id(row.derivedAbilityId, path + ".derivedAbilityId"), operator: choice(row.operator, POSSESSION_REQUIREMENT_OPERATORS, path + ".operator") };
    case "manual":
      shape(row, ["key", "kind", "notes"], path);
      return { key: localKey, kind: row.kind, notes: text(row.notes, path + ".notes") };
    default: return fail(path, "Unsupported condition kind.");
  }
}
export function parseMechanicsConditions(value: unknown, path: string): MechanicsConditions {
  const row = object(value, path);
  if (row.mode === "always") { shape(row, ["mode"], path); return { mode: "always" }; }
  if (row.mode !== "requirements") return fail(path, "Choose always or requirements explicitly.");
  shape(row, ["mode", "groups"], path);
  const groups = new Set<string>(), clauseKeys = new Set<string>();
  return { mode: "requirements", groups: list(row.groups, path + ".groups", MECHANICS_LIMITS.groups, true).map((value, i) => {
    const at = `${path}.groups[${i}]`, group = object(value, at);
    shape(group, ["key", "conditions"], at);
    const groupKey = key(group.key, at + ".key");
    unique(groupKey, groups, at + ".key");
    return { key: groupKey, conditions: list(group.conditions, at + ".conditions", MECHANICS_LIMITS.conditions, true).map((value, j) => {
      const clause = condition(value, `${at}.conditions[${j}]`);
      unique(clause.key, clauseKeys, at + ".conditions");
      return clause;
    }) };
  }) };
}
