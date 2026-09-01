import {
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  type MechanicalEffect,
} from "./models";
import { validateMechanicalEffect } from "./validation";

export type PersistedMechanicalEffect = {
  schemaVersion: number;
  effectJson: unknown;
};

export function encodeMechanicalEffect(effect: MechanicalEffect): PersistedMechanicalEffect {
  const validation = validateMechanicalEffect(effect);
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  return {
    schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
    effectJson: validation.effect,
  };
}

export function decodeMechanicalEffect(input: PersistedMechanicalEffect): MechanicalEffect {
  if (input.schemaVersion !== 1 && input.schemaVersion !== MECHANICAL_EFFECT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported Mechanical Effect schema version ${input.schemaVersion}; expected 1 or ${MECHANICAL_EFFECT_SCHEMA_VERSION}.`,
    );
  }
  const validation = validateMechanicalEffect(input.effectJson);
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  if (
    input.schemaVersion === 1
    && (validation.effect.kind === "condition.apply" || validation.effect.kind === "modifier.apply")
  ) {
    throw new Error("Mechanical Effect schema version 1 cannot contain persistent Condition or Modifier effects.");
  }
  return validation.effect;
}
