export const CORE_SKILL_ATTRIBUTES = [
  { value: "STR", label: "STR — Strength" },
  { value: "DEX", label: "DEX — Dexterity" },
  { value: "CON", label: "CON — Constitution" },
  { value: "INT", label: "INT — Intelligence" },
  { value: "WIS", label: "WIS — Wisdom" },
  { value: "CHA", label: "CHA — Charisma" },
] as const;

export function skillAttributeOptions(existingValues: string[]) {
  const coreValues = new Set<string>(
    CORE_SKILL_ATTRIBUTES.map(({ value }) => value),
  );

  const customOptions = [
    ...new Set(
      existingValues.filter((value) => value && !coreValues.has(value)),
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));

  return [...CORE_SKILL_ATTRIBUTES, ...customOptions];
}
