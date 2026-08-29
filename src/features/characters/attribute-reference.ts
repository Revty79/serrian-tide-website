import type {
  CharacterAttributeKey,
  CharacterAttributeReference,
  CharacterAttributeReferenceKey,
} from "./models";

export type CharacterAttributeReferenceField = Exclude<
  keyof CharacterAttributeReference,
  "attributeKey" | "score"
>;

export const CHARACTER_ATTRIBUTE_REFERENCE_KEYS = [
  "STR",
  "INT",
  "WIS",
  "CHR",
] as const satisfies readonly CharacterAttributeReferenceKey[];

const REFERENCE_FIELDS: Record<
  CharacterAttributeReferenceKey,
  ReadonlyArray<{
    key: CharacterAttributeReferenceField;
    label: string;
  }>
> = {
  STR: [
    { key: "maxCarry", label: "Max Carry" },
    { key: "maxLift", label: "Max Lift" },
  ],
  INT: [
    { key: "maxSpheres", label: "Max Spheres" },
    { key: "spellWeaving", label: "Spell Weaving" },
  ],
  WIS: [{ key: "teachingBase", label: "Teaching Base" }],
  CHR: [{ key: "loyaltyBase", label: "Loyalty Base" }],
};

export function getAttributeReference(
  rows: readonly CharacterAttributeReference[],
  attributeKey: CharacterAttributeKey,
  score: number | null | undefined,
): CharacterAttributeReference | null {
  if (
    !CHARACTER_ATTRIBUTE_REFERENCE_KEYS.includes(
      attributeKey as CharacterAttributeReferenceKey,
    ) ||
    score === null ||
    score === undefined ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 100
  ) {
    return null;
  }

  return (
    rows.find(
      (row) => row.attributeKey === attributeKey && row.score === score,
    ) ?? null
  );
}

export function getAttributeReferenceFields(
  attributeKey: CharacterAttributeKey,
): ReadonlyArray<{
  key: CharacterAttributeReferenceField;
  label: string;
}> {
  return REFERENCE_FIELDS[attributeKey as CharacterAttributeReferenceKey] ?? [];
}
