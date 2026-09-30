import type { CharacterSpecialAbility, CharacterSpecialAbilityView } from "./character-models";
import type { MechanicsEditorReferences } from "./authoring";
import { progressionComparisonLabels } from "./authoring";
import type { SpecialAbilityMechanicsProjection } from "./resolution";

export const MECHANICS_READ_ONLY_NOTICE = "Definitions and qualification only. A matched rule means the known saved Character facts satisfy its authored qualification. Nothing is activated, paid, applied or executed.";
export const NORMAL_MECHANICS_CONTEXT = "Based on saved Normal Character facts. Unsaved edits and temporary active Form-granted abilities are not evaluated here.";
export const CREATURE_MECHANICS_CONTEXT = "Native Creature owner evaluation is unavailable. Fixed Creature Skill Rank is not Character purchased progression; no owner-specific Special Ability facts are inferred.";
export const PROVISIONAL_MECHANICS_WARNING = "Provisional — purchased-point interpretation not yet finalized.";
export const MECHANICS_STATUS_LABELS = { matched: "Matched qualification", "not-matched": "Qualification not matched", manual: "Manual / G.O.D.", unavailable: "Owner evaluation unavailable" } as const;

export function mechanicsDocumentState(view: SpecialAbilityMechanicsProjection): string {
  if (view.documentStatus === "absent") return "Definition only. This ability has no structured mechanics document.";
  if (view.documentStatus === "unsupported") return "Structured mechanics were authored in a newer format and remain preserved. This view cannot interpret them.";
  if (view.documentStatus === "invalid") return "The structured mechanics could not be read safely. The ability's Definition remains available.";
  if (view.empty) return "Structured mechanics are attached but currently contain no rules.";
  return `Structured mechanics version ${view.schemaVersion}.`;
}
export function mechanicsPossessionSummary(ability: CharacterSpecialAbility): string {
  const source = [ability.possession.purchased && "saved purchase", ability.possession.racial && "current Race grant"].filter(Boolean).join(" and ");
  return `Possessed${source ? ` through ${source}` : ""}. Saved purchased progression: ${ability.mechanics.progression.value ?? "unavailable"} (provisional; maximum saved allocation across paths).`;
}
export function presentationReferences(view: SpecialAbilityMechanicsProjection): MechanicsEditorReferences {
  return { options: view.references.flatMap(ref => ref.name && (ref.status === "available" || ref.status === "archived") ? [{ ...ref, name: ref.name, archived: ref.status === "archived" }] : []) };
}
export function presentationDiagnostics(view: SpecialAbilityMechanicsProjection): string[] {
  return view.diagnostics.map(diagnostic => {
    if (diagnostic.code.startsWith("reference-")) return `${diagnostic.path.startsWith("derived-ability:") ? "Derived Ability" : "Skill"} reference ${diagnostic.code.slice(10)}. No replacement or grant is inferred.`;
    // Keep authored names in safe text; internal paths/IDs are not player guidance.
    if (diagnostic.code === "invalid-document") return "Structured mechanics need author review; the saved document has been preserved.";
    return diagnostic.message;
  });
}
export function qualificationExplanation(explanation: string): string {
  return explanation.replace(/(?:derived-ability|skill):\d+/g, "Unavailable definition")
    .replace(/requires (gte|gt|lte|lt|eq|neq) /g, (_, operator: keyof typeof progressionComparisonLabels) => `requires ${progressionComparisonLabels[operator]} `);
}
export const mechanicsContextSummary = (view: CharacterSpecialAbilityView) => view.context === "saved-normal" ? NORMAL_MECHANICS_CONTEXT : CREATURE_MECHANICS_CONTEXT;
