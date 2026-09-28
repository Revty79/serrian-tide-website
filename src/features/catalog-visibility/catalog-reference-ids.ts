/** Read authored Skill references without treating arbitrary numeric IDs as Skills. */
export function storedSkillReferenceIds(value: unknown): number[] {
  const ids = new Set<number>();
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (["skillId", "sourceSkillId", "frameworkSkillId", "endpointSkillId"].includes(key) && typeof nested === "number" && Number.isSafeInteger(nested) && nested > 0) ids.add(nested);
      if (key === "targetKey" && typeof nested === "string" && /^skill:[1-9]\d*$/.test(nested) && Number.isSafeInteger(Number(nested.slice(6)))) ids.add(Number(nested.slice(6)));
      visit(nested);
    }
  }
  visit(value);
  return [...ids];
}
