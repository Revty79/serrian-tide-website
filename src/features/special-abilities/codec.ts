import { CAPABILITY_DOMAINS, SPECIAL_ABILITY_MECHANICS_VERSION, type MechanicsRead, type MechanicsRule, type SpecialAbilityMechanicsDocument, type StoredMechanics } from "./models";

import { MECHANICS_LIMITS, MechanicsValidationError, fail, object, shape, text, key, choice, list, unique } from "./codec-primitives";
export { MECHANICS_LIMITS, MechanicsValidationError } from "./codec-primitives";
import { parseMechanicsReference, parseMechanicsConditions } from "./conditions-codec";
import { V2_RULE_KINDS } from "./v2-models";
import { parseV2Fields, validateLocalMechanicsReferences, V2_RULE_FIELDS } from "./v2-codec";
/** Strict version-specific writes. Reading does not upgrade or infer content. */
function parseDocument(input: unknown, rowVersion?: number): SpecialAbilityMechanicsDocument {
  let value = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MECHANICS_LIMITS.bytes) fail("$", "Document is too large.");
    try { value = JSON.parse(input); } catch { fail("$", "Document is not valid JSON."); }
  }
  const row = object(value, "$");
  shape(row, ["schemaVersion", "rules"], "$");
  const version = rowVersion ?? row.schemaVersion;
  if ((version !== 1 && version !== 2) || row.schemaVersion !== version) fail("$.schemaVersion", "Document and extension must agree on supported schema version 1 or 2.");
  const keys = new Set<string>();
  const document: SpecialAbilityMechanicsDocument = { schemaVersion: version, rules: list(row.rules, "$.rules", MECHANICS_LIMITS.rules).map((value, i): MechanicsRule => {
    const at = `$.rules[${i}]`, rule = object(value, at);
    const kind = choice(rule.kind, version === 1 ? ["capability", "manual"] as const : ["capability", "manual", ...V2_RULE_KINDS] as const, at + ".kind");
    const fields = kind === "capability" ? ["domain"] : kind === "manual" ? ["adjudication"] : V2_RULE_FIELDS[kind];
    shape(rule, ["key", "kind", "title", "description", "when", "limitations", "notes", "references", ...fields], at);
    const localKey = key(rule.key, at + ".key");
    unique(localKey, keys, at + ".key");
    const base = { key: localKey, title: text(rule.title, at + ".title", true, MECHANICS_LIMITS.title), description: text(rule.description, at + ".description"),
      when: parseMechanicsConditions(rule.when, at + ".when"), limitations: text(rule.limitations, at + ".limitations", false), notes: text(rule.notes, at + ".notes", false),
      references: list(rule.references, at + ".references", MECHANICS_LIMITS.references).map((ref, j) => parseMechanicsReference(ref, `${at}.references[${j}]`)) };
    return kind === "capability" ? { ...base, kind, domain: choice(rule.domain, CAPABILITY_DOMAINS, at + ".domain") }
      : kind === "manual" ? { ...base, kind, adjudication: text(rule.adjudication, at + ".adjudication") }
      : { ...base, ...parseV2Fields(rule, at) };
  }) };
  if (new TextEncoder().encode(JSON.stringify(document)).length > MECHANICS_LIMITS.bytes) fail("$", "Document is too large.");
  validateLocalMechanicsReferences(document);
  return document;
}
/** Authoring validates benchmarks; historical reads retain their original numbers. */
export function parseSpecialAbilityMechanics(input: unknown, rowVersion?: number): SpecialAbilityMechanicsDocument {
  const document = parseDocument(input, rowVersion);
  function benchmarks(value: unknown, path: string): void {
    if (Array.isArray(value)) { value.forEach((child, index) => benchmarks(child, `${path}[${index}]`)); return; }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const field = row.kind === "self-progression" ? "requiredValue" : row.kind === "progression-threshold" ? "threshold" : null;
    if (field && (typeof row[field] !== "number" || !Number.isFinite(row[field]) || row[field] < 0 || row[field] > 100)) fail(`${path}.${field}`, "Current Special Ability Score must be from 0 to 100.");
    for (const [key, child] of Object.entries(row)) benchmarks(child, `${path}.${key}`);
  }
  benchmarks(document, "$");
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
    const document = parseDocument(value, stored.schemaVersion);
    return { status: "ready", schemaVersion: document.schemaVersion, document, diagnostics: [] };
  } catch (error) {
    return { status: "invalid", schemaVersion: stored.schemaVersion, document: null, diagnostics: [error instanceof MechanicsValidationError ? error.diagnostic : { code: "invalid-document", path: "$", message: "Mechanics document could not be read." }] };
  }
}
