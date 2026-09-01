import type {
  MechanicalEffect,
  MechanicalEffectApplication,
  MechanicalEffectSelectionRequirement,
} from "./models";

export function getMechanicalEffectRequirements(
  effect: MechanicalEffect,
): MechanicalEffectSelectionRequirement[] {
  switch (effect.kind) {
    case "health.heal":
      return effect.scope === "area"
        ? ["target-character", "hp-pool"]
        : ["target-character"];
    case "health.damage":
      return ["target-character", "hit-location-or-hp-pool"];
    case "condition.apply":
    case "modifier.apply":
      return ["target-character"];
    case "manual":
      return [];
  }
}

function hasTarget(application: MechanicalEffectApplication): boolean {
  return application.targetCharacterId !== null
    && application.targetCharacterId !== undefined;
}

function hasPool(application: MechanicalEffectApplication): boolean {
  return typeof application.poolKey === "string" && application.poolKey.trim().length > 0;
}

function hasHitLocation(application: MechanicalEffectApplication): boolean {
  return application.hitLocationNumber !== null
    && application.hitLocationNumber !== undefined;
}

export function getMissingMechanicalEffectSelections(
  effect: MechanicalEffect,
  application: MechanicalEffectApplication = {},
): MechanicalEffectSelectionRequirement[] {
  return getMechanicalEffectRequirements(effect).filter((requirement) => {
    switch (requirement) {
      case "target-character":
        return !hasTarget(application);
      case "hp-pool":
        return !hasPool(application);
      case "hit-location-or-hp-pool":
        return !hasHitLocation(application) && !hasPool(application);
    }
  });
}
