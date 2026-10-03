import { DERIVED_ABILITY_ACTIVATION_TYPES, DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES } from "@/features/derived-abilities/models";
import { MODIFIER_ATTRIBUTE_KEYS, type MechanicalEffect, type RuntimeDuration } from "@/features/mechanical-effects/models";
import { normalizeRuntimeDuration, validateMechanicalEffect } from "@/features/mechanical-effects/validation";
import { normalizeInteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { requireRegisteredOverrideSlot } from "./override-registry";
import { MECHANICS_LIMITS, fail, object, shape, text, key, choice, list, id, unique } from "./codec-primitives";
import { parseMechanicsConditions } from "./conditions-codec";
import { OUTCOME_KINDS, OVERRIDE_SUBSYSTEMS, type DefinitionAmount, type DefinitionCost, type IntrinsicEffect, type MechanicsV2Fields, type OutcomeBranch, type AbilityInteraction } from "./v2-models";
import type { SpecialAbilityMechanicsDocument } from "./models";

export const V2_RULE_FIELDS = {
  resource: ["unit", "grantsResource", "maximum", "maximumChanges", "recovery"], modifier: ["effect", "adjudication"],
  interaction: ["interaction", "adjudication"], activated: ["activationType", "trigger", "costs", "useLimits", "duration", "target", "choiceKeys", "effects", "outcomes"],
  override: ["override", "outcomes"], choice: ["selection", "minimum", "maximum", "reselection", "restrictions"],
} as const;
const CHILD_LIMIT = 50;
function number(value: unknown, path: string, minimum = 0, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || Math.abs(value) > Number.MAX_SAFE_INTEGER || integer && !Number.isSafeInteger(value)) fail(path, "Enter a finite amount within safe numeric bounds" + (integer ? " using whole numbers." : "."));
  return value;
}
function optionalShape(row: Record<string, unknown>, required: string[], optional: string[], path: string) {
  if (Object.keys(row).some(k => ![...required, ...optional].includes(k)) || required.some(k => !Object.hasOwn(row, k))) fail(path, "Fields do not match this definition.");
}
function keyed<T extends { key: string }>(input: unknown, path: string, parse: (value: unknown, path: string) => T): T[] {
  const seen = new Set<string>();
  return list(input, path, CHILD_LIMIT).map((value, i) => { const row = parse(value, `${path}[${i}]`); unique(row.key, seen, path); return row; });
}
function keys(input: unknown, path: string): string[] {
  const seen = new Set<string>(); return list(input, path, CHILD_LIMIT).map((value, i) => { const k = key(value, `${path}[${i}]`); unique(k, seen, path); return k; });
}
function ids(input: unknown, path: string): number[] {
  const values = list(input, path, CHILD_LIMIT, true).map((value, i) => id(value, `${path}[${i}]`));
  if (new Set(values).size !== values.length) fail(path, "Candidate identities must be unique."); return values;
}
export function parseDefinitionAmount(input: unknown, path: string, signed = false): DefinitionAmount {
  const row = object(input, path);
  if (row.kind === "fixed") { shape(row, ["kind", "amount"], path); return { kind: row.kind, amount: number(row.amount, path + ".amount", signed ? -Number.MAX_SAFE_INTEGER : 0) }; }
  if (row.kind === "manual") { shape(row, ["kind", "guidance"], path); return { kind: row.kind, guidance: text(row.guidance, path + ".guidance") }; }
  if (row.kind === "progression-threshold") {
    shape(row, ["kind", "threshold", "contribution"], path);
    return { kind: row.kind, threshold: number(row.threshold, path + ".threshold"), contribution: number(row.contribution, path + ".contribution", signed ? -Number.MAX_SAFE_INTEGER : 0) };
  }
  return fail(path, "Choose a fixed amount or G.O.D. determination. Formulas are not supported.");
}
export function parseDefinitionDuration(input: unknown, path: string): RuntimeDuration {
  const row = object(input, path); optionalShape(row, ["kind"], ["value", "label"], path);
  if (row.value !== undefined && row.value !== null) number(row.value, path + ".value", 1, true);
  if (row.label !== undefined) text(row.label, path + ".label", false);
  try { normalizeRuntimeDuration(row); } catch (error) { fail(path, error instanceof Error ? error.message : "Invalid duration."); }
  return structuredClone(row) as RuntimeDuration;
}
/** Strict envelope around the shared validator; preserve rather than normalize text. */
export function parseIntrinsicEffect(input: unknown, path: string): MechanicalEffect {
  const row = object(input, path);
  switch (row.kind) {
    case "health.damage": optionalShape(row, ["kind", "amount", "application"], ["timing"], path); break;
    case "health.heal": optionalShape(row, ["kind", "amount", "scope"], ["timing"], path); break;
    case "condition.apply": shape(row, ["kind", "name", "description", "duration"], path); text(row.name, path + ".name"); text(row.description, path + ".description", false); parseDefinitionDuration(row.duration, path + ".duration"); break;
    case "modifier.apply":
      shape(row, ["kind", "label", "channel", "targetKey", "amount", "duration"], path); text(row.label, path + ".label");
      text(row.targetKey, path + ".targetKey", true, MECHANICS_LIMITS.title);
      if (row.targetKey !== (row.targetKey as string).trim()) fail(path, "Use the exact modifier target key without padding.");
      if (row.channel === "skill") id(Number((row.targetKey as string).slice(6)), path + ".targetKey");
      parseDefinitionDuration(row.duration, path + ".duration"); break;
    case "manual": shape(row, ["kind", "title", "description"], path); text(row.title, path + ".title"); text(row.description, path + ".description"); break;
    default: return fail(path, "Unsupported intrinsic effect. Use Manual / G.O.D.");
  }
  if ("amount" in row) number(row.amount, path + ".amount", row.kind === "modifier.apply" ? -Number.MAX_SAFE_INTEGER : 0);
  if (row.timing !== undefined) {
    const timing = object(row.timing, path + ".timing");
    shape(timing, timing.mode === "immediate" ? ["mode"] : ["mode", "frequency", "applications", "firstApplication"], path + ".timing");
    if (timing.mode !== "immediate") number(timing.applications, path + ".timing.applications", 1, true);
  }
  const validation = validateMechanicalEffect(row);
  if (!validation.valid) fail(path, validation.issues.map(issue => issue.message).join(" "));
  return structuredClone(row) as MechanicalEffect;
}
function interaction(input: unknown, path: string): AbilityInteraction {
  const row = object(input, path); shape(row, ["ruleType", "scope", "match", "conditions", "percentage"], path);
  if (row.percentage !== null) number(row.percentage, path + ".percentage");
  const seen = new Set<string>();
  const conditions = list(row.conditions, path + ".conditions", CHILD_LIMIT, true).map((value, i) => {
    const at = `${path}.conditions[${i}]`, c = object(value, at); const k = key(c.key, at + ".key"); unique(k, seen, at);
    switch (c.kind) {
      case "damage-type": shape(c, ["key", "kind", "damageType"], at); text(c.damageType, at + ".damageType"); break;
      case "magical": shape(c, ["key", "kind", "magical"], at); break;
      case "source-kind": optionalShape(c, ["key", "kind", "sourceKind"], ["weaponFamily"], at); break;
      case "mechanical-effect-kind": shape(c, ["key", "kind", "effectKind"], at); break;
      case "condition-name": shape(c, ["key", "kind", "conditionName"], at); text(c.conditionName, at + ".conditionName"); break;
      default: fail(at, "This matching condition requires an unsupported lifecycle contract. Use Manual / G.O.D.");
    }
    return c;
  });
  // Race mode is the shared CR-free definition validator only. This does not
  // attach a Race profile or add a Special Ability owner/runtime target loader.
  try { normalizeInteractionRuleProfile({ schemaVersion: 1, rules: [{ ...row, key: "validation", name: "Ability-owned contribution", notes: "", sortOrder: 0, conditions }] }, "race"); }
  catch (error) { fail(path, error instanceof Error ? error.message : "Invalid Interaction contribution."); }
  return structuredClone(row) as AbilityInteraction;
}
function eventFor(scope: string, value: unknown, path: string) { return text(value, path, scope === "event"); }
function outcomes(input: unknown, path: string): OutcomeBranch[] {
  return keyed(input, path, (value, at) => {
    const row = object(value, at); shape(row, ["key", "kind", "description", "effectKeys", "adjudication", "limitations", "notes"], at);
    const kind = choice(row.kind, OUTCOME_KINDS, at + ".kind");
    return { key: key(row.key, at), kind, description: text(row.description, at + ".description"), effectKeys: keys(row.effectKeys, at + ".effectKeys"),
      adjudication: text(row.adjudication, at + ".adjudication", kind === "manual"), limitations: text(row.limitations, at + ".limitations", false), notes: text(row.notes, at + ".notes", false) };
  });
}
export function parseV2Fields(row: Record<string, unknown>, path: string): MechanicsV2Fields {
  switch (row.kind) {
    case "resource": {
      if (typeof row.grantsResource !== "boolean") fail(path, "Choose whether this definition grants the resource.");
      return { kind: row.kind, unit: text(row.unit, path + ".unit", false, 240), grantsResource: row.grantsResource, maximum: parseDefinitionAmount(row.maximum, path + ".maximum"),
        maximumChanges: keyed(row.maximumChanges, path + ".maximumChanges", (value, at) => {
          const r = object(value, at); shape(r, ["key", "when", "amount", "notes"], at);
          return { key: key(r.key, at), when: parseMechanicsConditions(r.when, at + ".when"), amount: parseDefinitionAmount(r.amount, at + ".amount", true), notes: text(r.notes, at + ".notes", false) };
        }), recovery: keyed(row.recovery, path + ".recovery", (value, at) => {
          const r = object(value, at); shape(r, ["key", "scope", "event", "amount", "notes"], at);
          const scope = choice(r.scope, DERIVED_ABILITY_REFRESH_SCOPES, at + ".scope"), amount = object(r.amount, at + ".amount");
          if (amount.kind === "full") shape(amount, ["kind"], at + ".amount");
          return { key: key(r.key, at), scope, event: eventFor(scope, r.event, at + ".event"), amount: amount.kind === "full" ? { kind: "full" as const } : parseDefinitionAmount(amount, at + ".amount"), notes: text(r.notes, at + ".notes", false) };
        }) };
    }
    case "modifier": {
      const effect = parseIntrinsicEffect(row.effect, path + ".effect"); if (effect.kind !== "modifier.apply") fail(path, "A Modifier rule needs the shared modifier definition.");
      return { kind: row.kind, effect, adjudication: text(row.adjudication, path + ".adjudication", false) };
    }
    case "interaction": return { kind: row.kind, interaction: interaction(row.interaction, path + ".interaction"), adjudication: text(row.adjudication, path + ".adjudication", false) };
    case "activated": {
      const activationType = choice(row.activationType, DERIVED_ABILITY_ACTIVATION_TYPES.filter(value => value !== "passive"), path + ".activationType");
      const target = object(row.target, path + ".target"); shape(target, ["kind", "description"], path + ".target");
      const targetKind = choice(target.kind, ["self", "other", "multiple", "manual"], path + ".target.kind");
      const effects = keyed<IntrinsicEffect>(row.effects, path + ".effects", (value, at) => { const r = object(value, at); shape(r, ["key", "effect"], at); return { key: key(r.key, at), effect: parseIntrinsicEffect(r.effect, at + ".effect") }; });
      return { kind: row.kind, activationType, trigger: text(row.trigger, path + ".trigger", activationType !== "activated"),
        duration: row.duration === null ? null : parseDefinitionDuration(row.duration, path + ".duration"), target: { kind: targetKind, description: text(target.description, path + ".target.description", targetKind === "manual") },
        choiceKeys: keys(row.choiceKeys, path + ".choiceKeys"), effects, outcomes: outcomes(row.outcomes, path + ".outcomes"),
        costs: keyed<DefinitionCost>(row.costs, path + ".costs", (value, at) => {
          const r = object(value, at), kind = choice(r.kind, DERIVED_ABILITY_COST_TYPES, at + ".kind");
          shape(r, ["key", "kind", "amount", "notes", ...(kind === "resource" ? ["resource"] : [])], at);
          const base = { key: key(r.key, at), amount: parseDefinitionAmount(r.amount, at + ".amount"), notes: text(r.notes, at + ".notes", false) };
          if (kind !== "resource") return { ...base, kind };
          const resource = object(r.resource, at + ".resource");
          if (resource.kind === "local") { shape(resource, ["kind", "resourceKey"], at); return { ...base, kind, resource: { kind: "local", resourceKey: key(resource.resourceKey, at + ".resourceKey") } }; }
          shape(resource, ["kind", "name", "guidance"], at); choice(resource.kind, ["manual"], at);
          return { ...base, kind, resource: { kind: "manual", name: text(resource.name, at + ".name"), guidance: text(resource.guidance, at + ".guidance") } };
        }), useLimits: keyed(row.useLimits, path + ".useLimits", (value, at) => {
          const r = object(value, at); shape(r, ["key", "maximumUses", "refreshScope", "event", "notes"], at);
          const refreshScope = choice(r.refreshScope, DERIVED_ABILITY_REFRESH_SCOPES, at + ".refreshScope");
          return { key: key(r.key, at), maximumUses: number(r.maximumUses, at + ".maximumUses", 1, true), refreshScope, event: eventFor(refreshScope, r.event, at + ".event"), notes: text(r.notes, at + ".notes", false) };
        }) };
    }
    case "override": {
      const r = object(row.override, path + ".override");
      if (r.mode === "registered") { requireRegisteredOverrideSlot(String(r.slotKey)); fail(path, "Registered authoring is not available in this version."); }
      shape(r, ["mode", "subsystem", "proposedChange", "conflictGuidance"], path + ".override"); choice(r.mode, ["manual"], path + ".override.mode");
      return { kind: row.kind, override: { mode: "manual", subsystem: choice(r.subsystem, OVERRIDE_SUBSYSTEMS, path), proposedChange: text(r.proposedChange, path + ".proposedChange"), conflictGuidance: text(r.conflictGuidance, path + ".conflictGuidance") }, outcomes: outcomes(row.outcomes, path + ".outcomes") };
    }
    case "choice": {
      const selection = object(row.selection, path + ".selection"); const minimum = number(row.minimum, path + ".minimum", 1, true), maximum = number(row.maximum, path + ".maximum", minimum, true);
      if (maximum > CHILD_LIMIT) fail(path, "Selection count exceeds the authoring limit of 50.");
      let selected: Extract<MechanicsV2Fields, { kind: "choice" }>["selection"];
      if (selection.kind === "attribute") {
        shape(selection, ["kind", "attributeKeys"], path); const values = list(selection.attributeKeys, path + ".attributeKeys", 6, true).map(value => choice(value, MODIFIER_ATTRIBUTE_KEYS, path));
        if (new Set(values).size !== values.length) fail(path, "Attribute candidates must be unique."); selected = { kind: selection.kind, attributeKeys: values };
      } else if (selection.kind === "skill") { shape(selection, ["kind", "skillIds"], path); selected = { kind: selection.kind, skillIds: ids(selection.skillIds, path + ".skillIds") }; }
      else if (selection.kind === "derived-ability") { shape(selection, ["kind", "derivedAbilityIds"], path); selected = { kind: selection.kind, derivedAbilityIds: ids(selection.derivedAbilityIds, path + ".derivedAbilityIds") }; }
      else { shape(selection, ["kind", "guidance"], path); choice(selection.kind, ["manual"], path); selected = { kind: "manual", guidance: text(selection.guidance, path + ".guidance") }; }
      const count = selected.kind === "attribute" ? selected.attributeKeys.length : selected.kind === "skill" ? selected.skillIds.length : selected.kind === "derived-ability" ? selected.derivedAbilityIds.length : null;
      if (count !== null && maximum > count) fail(path, "Selection maximum exceeds the allowed candidates.");
      return { kind: row.kind, selection: selected, minimum, maximum, reselection: choice(row.reselection, ["never", "god-approval", "allowed"], path + ".reselection"), restrictions: text(row.restrictions, path + ".restrictions", false) };
    }
    default: return fail(path, "Unsupported rule family.");
  }
}
/** Local references have no database FK. Reject dangling/cross-kind links on every write. */
export function validateLocalMechanicsReferences(document: SpecialAbilityMechanicsDocument) {
  const resources = new Set(document.rules.filter(rule => rule.kind === "resource").map(rule => rule.key));
  const choices = new Set(document.rules.filter(rule => rule.kind === "choice").map(rule => rule.key));
  for (const rule of document.rules) {
    if (rule.kind === "activated") {
      for (const cost of rule.costs) if (cost.kind === "resource" && cost.resource.kind === "local" && !resources.has(cost.resource.resourceKey)) fail("$", "A cost references a resource definition that is missing. Keep the definition or explicitly update the cost.");
      for (const key of rule.choiceKeys) if (!choices.has(key)) fail("$", "An activated rule references a missing choice definition.");
    }
    if (rule.kind === "activated" || rule.kind === "override") {
      const effects = new Set(rule.kind === "activated" ? rule.effects.map(effect => effect.key) : []);
      for (const outcome of rule.outcomes) for (const key of outcome.effectKeys) if (!effects.has(key)) fail("$", "An outcome references a missing intrinsic effect. Update the branch before removing its effect.");
    }
  }
}
