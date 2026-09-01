import { resolveHealthMechanicalEffect } from "./health-adapter";
import type {
  MechanicalEffect,
  MechanicalEffectApplication,
  MechanicalEffectHealthContext,
  MechanicalEffectPlan,
  MechanicalEffectSource,
  MechanicalEffectValidationIssue,
} from "./models";
import {
  getMechanicalEffectRequirements,
  getMissingMechanicalEffectSelections,
} from "./requirements";
import { formatMechanicalEffectSummary } from "./summaries";
import { validateMechanicalEffect } from "./validation";

export type PlanMechanicalEffectInput = {
  effect: unknown;
  source?: MechanicalEffectSource | null;
  application?: MechanicalEffectApplication;
  health?: MechanicalEffectHealthContext | null;
};

function invalidPlan(
  source: MechanicalEffectSource | null,
  issues: MechanicalEffectValidationIssue[],
  effect: MechanicalEffect | null = null,
): MechanicalEffectPlan {
  return {
    status: "invalid",
    effect,
    source,
    summary: effect ? formatMechanicalEffectSummary(effect) : "Invalid Mechanical Effect",
    requirements: effect ? getMechanicalEffectRequirements(effect) : [],
    missingSelections: [],
    issues,
    healthResult: null,
  };
}

function validateApplication(
  application: MechanicalEffectApplication,
): MechanicalEffectValidationIssue[] {
  const issues: MechanicalEffectValidationIssue[] = [];
  if (
    application.targetCharacterId !== null
    && application.targetCharacterId !== undefined
    && (!Number.isInteger(application.targetCharacterId) || application.targetCharacterId <= 0)
  ) {
    issues.push({
      code: "invalid-target-character",
      path: "application.targetCharacterId",
      message: "Target Character ID must be a positive integer.",
    });
  }
  if (application.poolKey !== null && application.poolKey !== undefined) {
    if (typeof application.poolKey !== "string") {
      issues.push({
        code: "invalid-pool-key",
        path: "application.poolKey",
        message: "HP Pool key must be text when supplied.",
      });
    }
  }
  if (
    application.hitLocationNumber !== null
    && application.hitLocationNumber !== undefined
    && !Number.isInteger(application.hitLocationNumber)
  ) {
    issues.push({
      code: "invalid-hit-location",
      path: "application.hitLocationNumber",
      message: "Hit-location result must be an integer when supplied.",
    });
  }
  return issues;
}

export function planMechanicalEffect(input: PlanMechanicalEffectInput): MechanicalEffectPlan {
  const source = input.source ?? null;
  const validation = validateMechanicalEffect(input.effect);
  if (!validation.valid) return invalidPlan(source, validation.issues);

  const effect = validation.effect;
  const requirements = getMechanicalEffectRequirements(effect);
  const summary = formatMechanicalEffectSummary(effect);
  if (effect.kind === "manual") {
    return {
      status: "manual",
      effect,
      source,
      summary,
      requirements,
      missingSelections: [],
      issues: [],
      healthResult: null,
    };
  }

  const application = input.application ?? {};
  const applicationIssues = validateApplication(application);
  if (applicationIssues.length > 0) {
    return invalidPlan(source, applicationIssues, effect);
  }

  const missingSelections = getMissingMechanicalEffectSelections(effect, application);
  if (missingSelections.length > 0) {
    return {
      status: "needs-selection",
      effect,
      source,
      summary,
      requirements,
      missingSelections,
      issues: [],
      healthResult: null,
    };
  }

  if (effect.kind === "condition.apply" || effect.kind === "modifier.apply") {
    return {
      status: "ready",
      effect,
      source,
      summary,
      requirements,
      missingSelections: [],
      issues: [],
      healthResult: null,
    };
  }

  if (!input.health) {
    return {
      status: "ready",
      effect,
      source,
      summary,
      requirements,
      missingSelections: [],
      issues: [],
      healthResult: null,
    };
  }

  if (input.health.state.characterId !== application.targetCharacterId) {
    return invalidPlan(source, [{
      code: "target-state-mismatch",
      path: "health.state.characterId",
      message: "Active Health state does not belong to the selected target Character.",
    }], effect);
  }

  try {
    return {
      status: "ready",
      effect,
      source,
      summary,
      requirements,
      missingSelections: [],
      issues: [],
      healthResult: resolveHealthMechanicalEffect(
        effect,
        application,
        input.health.state,
        input.health.anatomy,
      ),
    };
  } catch (error) {
    return invalidPlan(source, [{
      code: "health-resolution-failed",
      path: "health",
      message: error instanceof Error ? error.message : "Active Health could not resolve the effect.",
    }], effect);
  }
}
