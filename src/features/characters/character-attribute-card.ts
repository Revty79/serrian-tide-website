import {
  getAttributeReference,
  getAttributeReferenceFields,
} from "./attribute-reference";
import {
  getBaseInitiative,
  getCharacterHp,
  getMovementInitiative,
} from "./character-rules";
import type {
  CharacterAttributeKey,
  CharacterAttributeReference,
} from "./models";

export type CharacterAttributeCardStat = {
  key: string;
  label: string;
  value: number | null;
  source: "canon" | "derived";
};

export type CharacterAttributeCardMovement = {
  movementMode: string;
  baseMovement: number;
  initiative: number;
};

export type CharacterAttributeCardDetails = {
  stats: CharacterAttributeCardStat[];
  movements: CharacterAttributeCardMovement[];
};

export function getCharacterAttributeCardDetails(
  referenceRows: readonly CharacterAttributeReference[],
  attributeKey: CharacterAttributeKey,
  score: number,
  movementModes: ReadonlyArray<{
    movementMode: string;
    baseValue: number;
  }> = [],
): CharacterAttributeCardDetails {
  const reference = getAttributeReference(referenceRows, attributeKey, score);
  const stats: CharacterAttributeCardStat[] = getAttributeReferenceFields(
    attributeKey,
  ).map((field) => ({
    key: field.key,
    label: field.label,
    value: reference?.[field.key] ?? null,
    source: "canon",
  }));

  if (attributeKey === "DEX") {
    stats.push({
      key: "baseInitiative",
      label: "Base Initiative",
      value: getBaseInitiative(score),
      source: "derived",
    });
  }

  if (attributeKey === "CON") {
    stats.push({
      key: "totalHp",
      label: "Total HP",
      value: getCharacterHp(score),
      source: "derived",
    });
  }

  return {
    stats,
    movements:
      attributeKey === "DEX"
        ? movementModes.map((mode) => ({
            movementMode: mode.movementMode,
            baseMovement: mode.baseValue,
            initiative: getMovementInitiative(score, mode.baseValue),
          }))
        : [],
  };
}
