export function referencesFrameworkSkill(
  serializedDocument: string,
  targetSkillId: number,
): boolean {
  if (!Number.isInteger(targetSkillId) || targetSkillId <= 0) return false;

  try {
    const document = JSON.parse(serializedDocument) as unknown;
    return typeof document === "object"
      && document !== null
      && !Array.isArray(document)
      && (document as Record<string, unknown>).frameworkSkillId === targetSkillId;
  } catch {
    // Skill extensions predate the database's JSON-validity constraint used by
    // Character spell documents. A malformed legacy extension must not make a
    // lifecycle preview fail; it simply cannot be an exact app-shaped link.
    return false;
  }
}
