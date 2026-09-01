import type {
  MechanicalEffect,
  MechanicalEffectValidationIssue,
  MechanicalEffectValidationResult,
} from "./models";
import {
  MODIFIER_ATTRIBUTE_KEYS,
  RUNTIME_DURATION_KINDS,
  TEMPORARY_MODIFIER_CHANNELS,
  type RuntimeDuration,
  type TemporaryModifierChannel,
} from "./models";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(
  code: MechanicalEffectValidationIssue["code"],
  path: string,
  message: string,
): MechanicalEffectValidationIssue {
  return { code, path, message };
}

function validateAmount(value: unknown): MechanicalEffectValidationIssue[] {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return [invalid(
      "invalid-amount",
      "amount",
      "Effect amount must be a finite number greater than zero.",
    )];
  }
  return [];
}

export function normalizeRuntimeDuration(input: unknown): RuntimeDuration {
  if (!isRecord(input) || !RUNTIME_DURATION_KINDS.includes(input.kind as never)) {
    throw new Error("Duration kind must be until-removed, combat-steps, combat-rounds, or scene.");
  }
  const kind = input.kind as RuntimeDuration["kind"];
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : undefined;
  if (kind === "combat-steps" || kind === "combat-rounds") {
    if (!Number.isInteger(input.value) || (input.value as number) <= 0) {
      throw new Error("Counted durations require a positive whole-number value.");
    }
    return { kind, value: input.value as number, ...(label ? { label } : {}) };
  }
  if (input.value !== undefined && input.value !== null) {
    throw new Error("Scene and Until Removed durations do not accept a numeric value.");
  }
  return { kind, value: null, ...(label ? { label } : {}) };
}

function validateModifierTarget(channel: TemporaryModifierChannel, targetKey: unknown): string | null {
  if (typeof targetKey !== "string" || !targetKey.trim()) return "Modifier target key is required.";
  const key = targetKey.trim();
  if (channel === "attribute" && !MODIFIER_ATTRIBUTE_KEYS.includes(key as never)) {
    return "Attribute modifier target must be STR, DEX, CON, INT, WIS, or CHR.";
  }
  if (channel === "skill" && !/^skill:[1-9]\d*$/.test(key)) {
    return "Skill modifier target must use stable identity skill:<positive-id>.";
  }
  if (channel === "movement" && !/^movement:.+/.test(key)) {
    return "Movement modifier target must use stable identity movement:<mode>.";
  }
  if (["initiative", "soak", "damage"].includes(channel) && key !== "self") {
    return `${channel} modifier target must be self.`;
  }
  return null;
}

export function validateMechanicalEffect(input: unknown): MechanicalEffectValidationResult {
  if (!isRecord(input) || typeof input.kind !== "string") {
    return {
      valid: false,
      effect: null,
      issues: [invalid("invalid-effect", "effect", "Mechanical effect must be an object with a kind.")],
    };
  }

  const issues: MechanicalEffectValidationIssue[] = [];
  switch (input.kind) {
    case "health.heal":
      issues.push(...validateAmount(input.amount));
      if (input.scope !== "full-body" && input.scope !== "area") {
        issues.push(invalid(
          "unsupported-scope",
          "scope",
          "Healing scope must be full-body or area.",
        ));
      }
      break;
    case "health.damage":
      issues.push(...validateAmount(input.amount));
      if (input.application !== "localized") {
        issues.push(invalid(
          "unsupported-application",
          "application",
          "Damage application must be localized.",
        ));
      }
      break;
    case "condition.apply":
      if (typeof input.name !== "string" || !input.name.trim()) {
        issues.push(invalid("empty-condition-name", "name", "Condition name is required."));
      }
      if (typeof input.description !== "string") {
        issues.push(invalid("invalid-condition-description", "description", "Condition description must be text."));
      }
      try { normalizeRuntimeDuration(input.duration); } catch (error) {
        issues.push(invalid("invalid-duration", "duration", error instanceof Error ? error.message : "Duration is invalid."));
      }
      break;
    case "modifier.apply": {
      if (typeof input.label !== "string" || !input.label.trim()) {
        issues.push(invalid("empty-modifier-label", "label", "Modifier label is required."));
      }
      if (!TEMPORARY_MODIFIER_CHANNELS.includes(input.channel as never)) {
        issues.push(invalid("unsupported-modifier-channel", "channel", "Modifier channel is unsupported."));
      } else {
        const targetIssue = validateModifierTarget(input.channel as TemporaryModifierChannel, input.targetKey);
        if (targetIssue) issues.push(invalid("invalid-modifier-target", "targetKey", targetIssue));
      }
      if (!Number.isInteger(input.amount) || input.amount === 0) {
        issues.push(invalid("invalid-modifier-amount", "amount", "Modifier amount must be a non-zero whole number."));
      }
      try { normalizeRuntimeDuration(input.duration); } catch (error) {
        issues.push(invalid("invalid-duration", "duration", error instanceof Error ? error.message : "Duration is invalid."));
      }
      break;
    }
    case "manual":
      if (typeof input.title !== "string" || input.title.trim().length === 0) {
        issues.push(invalid(
          "empty-manual-title",
          "title",
          "Manual effect title must contain meaningful text.",
        ));
      }
      if (typeof input.description !== "string" || input.description.trim().length === 0) {
        issues.push(invalid(
          "empty-manual-description",
          "description",
          "Manual effect description must contain meaningful text.",
        ));
      }
      break;
    default:
      issues.push(invalid(
        "unsupported-kind",
        "kind",
        `Unsupported mechanical effect kind ${JSON.stringify(input.kind)}.`,
      ));
  }

  if (issues.length > 0) return { valid: false, effect: null, issues };
  let effect: MechanicalEffect;
  switch (input.kind) {
    case "health.heal":
      effect = {
        kind: input.kind,
        amount: input.amount as number,
        scope: input.scope as "full-body" | "area",
      };
      break;
    case "health.damage":
      effect = {
        kind: input.kind,
        amount: input.amount as number,
        application: "localized",
      };
      break;
    case "condition.apply":
      effect = {
        kind: input.kind,
        name: (input.name as string).trim(),
        description: input.description as string,
        duration: normalizeRuntimeDuration(input.duration),
      };
      break;
    case "modifier.apply":
      effect = {
        kind: input.kind,
        label: (input.label as string).trim(),
        channel: input.channel as TemporaryModifierChannel,
        targetKey: (input.targetKey as string).trim(),
        amount: input.amount as number,
        duration: normalizeRuntimeDuration(input.duration),
      };
      break;
    case "manual":
      effect = {
        kind: input.kind,
        title: input.title as string,
        description: input.description as string,
      };
      break;
    default:
      throw new Error("Validated Mechanical Effect kind could not be projected.");
  }
  return { valid: true, effect, issues: [] };
}
