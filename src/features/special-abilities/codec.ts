import { NUMERIC_REQUIREMENT_OPERATORS, POSSESSION_REQUIREMENT_OPERATORS } from "@/features/requirements/requirement-primitives";
import { CAPABILITY_DOMAINS, SPECIAL_ABILITY_MECHANICS_VERSION, type MechanicsCondition, type MechanicsConditions, type MechanicsDiagnostic, type MechanicsRead, type MechanicsReference, type MechanicsRule, type SpecialAbilityMechanicsDocument, type StoredMechanics } from "./models";

// Format limits, not limits on what abilities may mean. Change through a reviewed codec revision.
export const MECHANICS_LIMITS = { bytes: 262144, rules: 100, groups: 20, conditions: 50, references: 50, key: 128, title: 240, text: 16000 } as const;
export class MechanicsValidationError extends Error {
  constructor(public readonly diagnostic: MechanicsDiagnostic) { super(diagnostic.message); this.name = "MechanicsValidationError"; }
}
function fail(path: string, message: string): never {
  throw new MechanicsValidationError({ code: "invalid-document", path, message: `${path}: ${message}` });
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "Expected an object.");
  return value as Record<string, unknown>;
}
function shape(row: Record<string, unknown>, fields: string[], path: string) {
  if (Object.keys(row).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(row, key))) fail(path, "Fields do not match this document type.");
}
function text(value: unknown, path: string, required = true, maximum: number = MECHANICS_LIMITS.text): string {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) fail(path, `Expected ${required ? "nonblank " : ""}text of at most ${maximum} characters.`);
  return value; // Preserve authored text; never silently trim or reinterpret it.
}
function key(value: unknown, path: string) { return text(value, path, true, MECHANICS_LIMITS.key); }
function choice<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(path, "Unsupported value.");
  return value as T;
}
function list(value: unknown, path: string, maximum: number, nonempty = false): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || (nonempty && value.length === 0)) fail(path, `Expected ${nonempty ? "a nonempty " : "an "}array of at most ${maximum} entries.`);
  return Array.from(value);
}
function id(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) fail(path, "Expected a positive database ID.");
  return value;
}
function unique(value: string, seen: Set<string>, path: string) {
  if (seen.has(value)) fail(path, "Duplicate local key.");
  seen.add(value);
}
function reference(value: unknown, path: string): MechanicsReference {
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
function conditions(value: unknown, path: string): MechanicsConditions {
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
/** Strict v1 writes. No migration, defaults, content inference or state access. */
export function parseSpecialAbilityMechanics(input: unknown, rowVersion: number = SPECIAL_ABILITY_MECHANICS_VERSION): SpecialAbilityMechanicsDocument {
  let value = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MECHANICS_LIMITS.bytes) fail("$", "Document is too large.");
    try { value = JSON.parse(input); } catch { fail("$", "Document is not valid JSON."); }
  }
  const row = object(value, "$");
  shape(row, ["schemaVersion", "rules"], "$");
  if (rowVersion !== 1 || row.schemaVersion !== rowVersion) fail("$.schemaVersion", "Document and extension must both use supported schema version 1.");
  const keys = new Set<string>();
  const document: SpecialAbilityMechanicsDocument = { schemaVersion: 1, rules: list(row.rules, "$.rules", MECHANICS_LIMITS.rules).map((value, i): MechanicsRule => {
    const at = `$.rules[${i}]`, rule = object(value, at);
    const kind = choice(rule.kind, ["capability", "manual"], at + ".kind");
    shape(rule, ["key", "kind", "title", "description", "when", "limitations", "notes", "references", kind === "capability" ? "domain" : "adjudication"], at);
    const localKey = key(rule.key, at + ".key");
    unique(localKey, keys, at + ".key");
    const base = { key: localKey, title: text(rule.title, at + ".title", true, MECHANICS_LIMITS.title), description: text(rule.description, at + ".description"),
      when: conditions(rule.when, at + ".when"), limitations: text(rule.limitations, at + ".limitations", false), notes: text(rule.notes, at + ".notes", false),
      references: list(rule.references, at + ".references", MECHANICS_LIMITS.references).map((ref, j) => reference(ref, `${at}.references[${j}]`)) };
    return kind === "capability" ? { ...base, kind, domain: choice(rule.domain, CAPABILITY_DOMAINS, at + ".domain") }
      : { ...base, kind, adjudication: text(rule.adjudication, at + ".adjudication") };
  }) };
  if (new TextEncoder().encode(JSON.stringify(document)).length > MECHANICS_LIMITS.bytes) fail("$", "Document is too large.");
  return document;
}
/** Reading never writes/upgrades. The caller retains the original stored bytes. */
export function readSpecialAbilityMechanics(stored: StoredMechanics | null | undefined): MechanicsRead {
  if (!stored) return { status: "absent", schemaVersion: null, document: null, diagnostics: [] };
  try {
    if (!Number.isSafeInteger(stored.schemaVersion) || stored.schemaVersion < 1) fail("$.schemaVersion", "Invalid extension version.");
    if (new TextEncoder().encode(stored.dataJson).length > MECHANICS_LIMITS.bytes) fail("$", "Document is too large.");
    let value: unknown;
    try { value = JSON.parse(stored.dataJson); } catch { fail("$", "Document is not valid JSON."); }
    const row = object(value, "$");
    if (row.schemaVersion !== stored.schemaVersion) fail("$.schemaVersion", "Document and extension versions disagree.");
    if (stored.schemaVersion > SPECIAL_ABILITY_MECHANICS_VERSION) return { status: "unsupported", schemaVersion: stored.schemaVersion, document: null,
      diagnostics: [{ code: "unsupported-version", path: "$.schemaVersion", message: `Mechanics version ${stored.schemaVersion} is not supported by this editor. The saved document is preserved.` }] };
    return { status: "ready", schemaVersion: 1, document: parseSpecialAbilityMechanics(value, stored.schemaVersion), diagnostics: [] };
  } catch (error) {
    return { status: "invalid", schemaVersion: stored.schemaVersion, document: null, diagnostics: [error instanceof MechanicsValidationError ? error.diagnostic : { code: "invalid-document", path: "$", message: "Mechanics document could not be read." }] };
  }
}
