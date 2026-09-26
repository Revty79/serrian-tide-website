/** A Race-local authoring identity. The Race itself remains the normal state. */
export type RaceForm = {
  key: string;
  name: string;
  description: string;
  notes: string;
  sortOrder: number;
};

/** Persisted identities are exposed for future readers, never accepted as ownership authority. */
export type SavedRaceForm = RaceForm & { id: number; raceId: number };

export function emptyRaceForm(key: string): RaceForm {
  return { key, name: "", description: "", notes: "", sortOrder: 0 };
}

export function normalizeRaceForms(input: readonly RaceForm[]): RaceForm[] {
  if (!Array.isArray(input)) throw new Error("Forms must be an ordered list.");
  const keys = new Set<string>();
  const text = (value: unknown, label: string) => {
    if (typeof value !== "string") throw new Error(`${label} must be text.`);
    return value.trim();
  };
  return input.map((row: RaceForm, sortOrder: number) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Each Form needs an authored definition.");
    const key = text(row.key, "Form identity");
    if (!key || keys.has(key)) throw new Error("Form identities must be nonblank and unique within the Race.");
    keys.add(key);
    const name = text(row.name, "Form Name");
    if (!name) throw new Error("Form Name is required.");
    return { key, name, description: text(row.description, "Form Description"), notes: text(row.notes, "Form Notes"), sortOrder };
  });
}
