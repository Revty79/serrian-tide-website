import type { SkillDraft } from "@/app/heavens/skills/actions";
import { mechanicsDraftState, mechanicsValidationMessage, progressionComparisonLabels, type MechanicsEditorReferences } from "./authoring";
import { referenceKey, type MechanicsConditions, type MechanicsReference, type MechanicsRule } from "./models";
import { resolveSpecialAbilityMechanics } from "./resolution";
import { RULE_FAMILY_LABELS } from "./v2-authoring";
import { v2RuleSummary } from "./v2-summaries";
import { collectMechanicsReferences } from "./references";

export function mechanicsReferenceLabel(reference: MechanicsReference, references: MechanicsEditorReferences | null): string {
  const row = references?.options.find(option => referenceKey(option) === referenceKey(reference));
  return row ? `${row.name}${row.archived ? " (Archived)" : ""}` : (reference.kind === "skill" ? "Skill" : "Derived Ability") + " reference unavailable";
}
export function mechanicsConditionSummary(when: MechanicsConditions, references: MechanicsEditorReferences | null): string {
  if (when.mode === "always") return "Always, when the Character possesses this Special Ability.";
  if (!when.groups.length) return "Requirements need a way to qualify.";
  return when.groups.map((group, i) => `Way ${i + 1}: ` + (group.conditions.length ? group.conditions.map(condition => {
    if (condition.kind === "manual") return `G.O.D. determines: ${condition.notes || "condition not yet described"}`;
    if (condition.kind === "self-progression") return `Provisional purchased points ${progressionComparisonLabels[condition.operator]} ${condition.requiredValue} (meaning not finalized)`;
    const reference: MechanicsReference = condition.kind === "skill-possession" ? { kind: "skill", skillId: condition.skillId } : { kind: "derived-ability", derivedAbilityId: condition.derivedAbilityId };
    return `${mechanicsReferenceLabel(reference, references)}: ${condition.operator === "possessed" ? "Possessed" : "Not Possessed"}`;
  }).join(" AND ") : "add a condition")).join(" OR ");
}
export function MechanicsRuleSummary({ rule, rules = [], references, compact = false }: { rule: MechanicsRule; rules?: MechanicsRule[]; references: MechanicsEditorReferences | null; compact?: boolean }) {
  const excerpt = (text: string) => compact && text.length > 240 ? text.slice(0, 240) + "…" : text;
  const definitions = v2RuleSummary(rule, rules, reference => mechanicsReferenceLabel(reference, references));
  const typedReferences = collectMechanicsReferences({ schemaVersion: 2, rules: [rule] });
  return <div className="mechanics-summary">
    <p className="mechanics-type">{rule.kind === "capability" ? `Capability · ${rule.domain}` : RULE_FAMILY_LABELS[rule.kind]}</p>
    <h4>{rule.title || "Untitled rule"}</h4>
    <p>{excerpt(rule.description) || "Add a description."}</p>
    <p><strong>Applies When: </strong>{excerpt(mechanicsConditionSummary(rule.when, references))}</p>
    {rule.kind === "manual" && <p><strong>G.O.D. Determination: </strong>{excerpt(rule.adjudication) || "Describe what the G.O.D. determines."}</p>}
    {(compact ? definitions.slice(0, 2) : definitions).map((line, i) => <p key={i}>{excerpt(line)}</p>)}
    {!compact && rule.kind === "resource" && rule.maximumChanges.map((change, i) => <p key={change.key}><strong>Maximum change {i + 1} applies when: </strong>{mechanicsConditionSummary(change.when, references)}</p>)}
    {!compact && typedReferences.length > 0 && <div><strong>Referenced definitions</strong><ul>{typedReferences.map(ref => <li key={referenceKey(ref)}>{mechanicsReferenceLabel(ref, references)}</li>)}</ul></div>}
    {rule.limitations && <p><strong>Limitations: </strong>{excerpt(rule.limitations)}</p>}
    {!compact && rule.notes && <p><strong>Notes: </strong>{rule.notes}</p>}
    {!compact && rule.references.length > 0 && <div><strong>Documentation References</strong><ul>{rule.references.map((ref, index) => <li key={`${referenceKey(ref)}-${index}`}>{mechanicsReferenceLabel(ref, references)}</li>)}</ul></div>}
  </div>;
}
export function MechanicsPreview({ draft, references }: { draft: SkillDraft; references: MechanicsEditorReferences | null }) {
  const state = mechanicsDraftState(draft);
  if (state.kind === "absent") return <section><h4>Special Ability Mechanics Preview</h4><p>Definition only. No structured mechanics are attached.</p></section>;
  if (state.kind === "protected") return <section role="status"><h4>Special Ability Mechanics Preview</h4>{state.diagnostics.map((message, i) => <p key={i}>{message}</p>)}<p>The saved mechanics are preserved. This editor cannot interpret them.</p></section>;
  const validation = mechanicsValidationMessage(state.document);
  const projection = resolveSpecialAbilityMechanics({ source: { id: draft.id ?? 0, name: draft.core.name, classification: draft.core.classification, archived: false },
    stored: { schemaVersion: state.document.schemaVersion, dataJson: JSON.stringify(state.document) }, owner: null,
    references: references?.options.map(ref => ({ ...ref, status: ref.archived ? "archived" : "available" })) });
  return <section className="mechanics-preview">
    <h4>Special Ability Mechanics Preview</h4>
    <p>Definition preview. No Character has been evaluated, and no mechanic has been activated or applied.</p>
    {validation && <p role="alert">Draft needs attention: {validation} Your unfinished text remains in the editor.</p>}
    {state.document.rules.length === 0 && <p>Structured mechanics are attached, with no authored rules.</p>}
    {projection.rules.map(rule => <article className="mechanics-card" key={rule.key}><MechanicsRuleSummary rule={rule.authored} rules={state.document.rules} references={references} /></article>)}
  </section>;
}
