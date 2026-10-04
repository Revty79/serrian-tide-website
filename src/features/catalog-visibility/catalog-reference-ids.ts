/** Read authored Skill references without treating arbitrary numeric IDs as Skills. */
export function storedSkillReferenceIds(value: unknown): number[] {
  return authoredReferenceIds(value, ["skillId", "sourceSkillId", "frameworkSkillId", "endpointSkillId", "relatedSkillId"], "skill:");
}

export function authoredReferenceIds(value: unknown, fields: readonly string[], targetPrefix?: string): number[] {
  const ids = new Set<number>();
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (fields.includes(key) && typeof nested === "number" && Number.isSafeInteger(nested) && nested > 0) ids.add(nested);
      if (key === "targetKey" && targetPrefix && typeof nested === "string" && nested.startsWith(targetPrefix)) {
        const id = Number(nested.slice(targetPrefix.length));
        if (Number.isSafeInteger(id) && id > 0) ids.add(id);
      }
      visit(nested);
    }
  }
  visit(value);
  return [...ids];
}

export function authoredCreatureCanonicalIds(value: unknown): string[] {
  const ids = new Set<string>();
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "relatedCreatureCanonicalId" && typeof nested === "string" && nested.trim()) ids.add(nested);
      visit(nested);
    }
  }
  visit(value);
  return [...ids];
}
