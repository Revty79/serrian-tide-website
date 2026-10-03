import type { SkillDraft } from "@/app/heavens/skills/actions";
import { parseSpecialAbilityMechanics, readSpecialAbilityMechanics } from "./codec";
import { SPECIAL_ABILITY_MECHANICS_EXTENSION, SPECIAL_ABILITY_MECHANICS_VERSION, type MechanicsCondition, type MechanicsConditions, type MechanicsReference, type MechanicsRule, type SpecialAbilityMechanicsDocument } from "./models";

export type MechanicsReferenceOption = MechanicsReference & { name: string; archived: boolean; classification?: string };
export type MechanicsEditorReferences = { options: MechanicsReferenceOption[] };
export const progressionComparisonLabels = { gte: "at least", gt: "more than", lte: "at most", lt: "less than", eq: "equal to", neq: "not equal to" } as const;

// getRandomValues also works on plain HTTP LAN browsers, unlike randomUUID.
export const newMechanicsKey = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
export function newMechanicsRule(kind: "capability" | "manual"): MechanicsRule {
  const base = { key: newMechanicsKey(), title: "", description: "", when: { mode: "requirements" as const, groups: [] }, limitations: "", notes: "", references: [] };
  return kind === "capability" ? { ...base, kind, domain: "other" } : { ...base, kind, adjudication: "" };
}
export function newMechanicsCondition(kind: MechanicsCondition["kind"]): MechanicsCondition {
  const key = newMechanicsKey();
  return kind === "self-progression" ? { key, kind, operator: "gte", requiredValue: 0 } : kind === "manual" ? { key, kind, notes: "" } : kind === "skill-possession"
    ? { key, kind, skillId: 0, operator: "possessed" } : { key, kind, derivedAbilityId: 0, operator: "possessed" };
}
export function moveMechanicsChild<T>(rows: readonly T[], from: number, direction: -1 | 1): T[] {
  const result = [...rows], to = from + direction;
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return result;
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
export function moveMechanicsCondition(when: MechanicsConditions, key: string, targetGroup: string): MechanicsConditions {
  if (when.mode !== "requirements" || !when.groups.some(group => group.key === targetGroup)) return when;
  const condition = when.groups.flatMap(group => group.conditions).find(row => row.key === key);
  if (!condition) return when;
  return { ...when, groups: when.groups.map(group => ({ ...group, conditions: [
    ...group.conditions.filter(row => row.key !== key), ...(group.key === targetGroup ? [condition] : []),
  ] })) };
}
export function mechanicsValidationMessage(document: unknown): string | null {
  try { parseSpecialAbilityMechanics(document); return null; }
  catch (error) {
    const detail = error instanceof Error ? error.message : "The mechanics could not be validated.";
    // Keep the codec authoritative, with human-facing field and location names.
    return detail.replace(/\$\.rules\[(\d+)\]/g, (_, index) => `Rule ${Number(index) + 1}`)
      .replace(/\.when\.groups\[(\d+)\]/g, (_, index) => `, way to qualify ${Number(index) + 1}`)
      .replace(/\.conditions\[(\d+)\]/g, (_, index) => `, condition ${Number(index) + 1}`)
      .replace(/\.references\[(\d+)\]/g, (_, index) => `, documentation reference ${Number(index) + 1}`)
      .replace(/\.when\.groups/g, " requirements").replace(/\.conditions/g, " conditions")
      .replace(/\.(?:skillId|derivedAbilityId)/g, " selected definition").replace(/\.adjudication/g, " G.O.D. determination")
      .replace(/\.(title|description|notes)/g, " $1").replace(/^\$:/, "Mechanics:")
      .replace(/\.([a-zA-Z]+)\[(\d+)\]/g, (_, field, index) => `, ${field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} ${Number(index) + 1}`)
      .replace(/\.([a-z][a-zA-Z]*)/g, (_, field) => ` ${field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`)
      .replace("Expected a positive database ID.", "Choose an existing definition.");
  }
}
export function mechanicsDraftState(draft: SkillDraft) {
  const extension = draft.extensions.find(row => row.extensionType === SPECIAL_ABILITY_MECHANICS_EXTENSION);
  if (!extension) return { kind: "absent" as const };
  if (extension.readStatus === "invalid" || extension.readStatus === "unsupported" || extension.schemaVersion > SPECIAL_ABILITY_MECHANICS_VERSION) {
    return { kind: "protected" as const, diagnostics: extension.diagnostics ?? ["This mechanics format is not supported by this editor. The saved document is preserved."] };
  }
  const mutation = draft.extensionMutations?.find(row => row.extensionType === SPECIAL_ABILITY_MECHANICS_EXTENSION);
  // New editor drafts intentionally retain unfinished fields for correction.
  if (mutation?.operation === "upsert") return { kind: "editable" as const, document: mutation.data as SpecialAbilityMechanicsDocument };
  const read = readSpecialAbilityMechanics({ schemaVersion: extension.schemaVersion, dataJson: JSON.stringify(extension.data) });
  if (read.status === "ready") return { kind: "editable" as const, document: read.document };
  return { kind: "protected" as const, diagnostics: read.diagnostics.map(diagnostic => diagnostic.message) };
}
