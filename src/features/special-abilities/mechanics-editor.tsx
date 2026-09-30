"use client";
import { useState } from "react";
import type { SkillDraft } from "@/app/heavens/skills/actions";
import { GuidedField } from "@/components/field-guidance";
import { isSpecialAbilitySkill } from "@/features/characters/character-rules";
import { changeSkillExtension } from "@/features/skills/skill-extension-draft";
import { MECHANICS_LIMITS } from "./codec";
import { CAPABILITY_DOMAINS, emptySpecialAbilityMechanics, SPECIAL_ABILITY_MECHANICS_EXTENSION, type MechanicsRule, type SpecialAbilityMechanicsDocument } from "./models";
import { mechanicsDraftState, mechanicsValidationMessage, moveMechanicsChild, newMechanicsRule, type MechanicsEditorReferences } from "./authoring";
import { MechanicsConditionsEditor } from "./mechanics-conditions-editor";
import { MechanicsReferencePicker } from "./mechanics-reference-picker";
import { MechanicsRuleSummary } from "./mechanics-preview";
import { V2_RULE_KINDS, type MechanicsV2Fields } from "./v2-models";
import { addRuleLabel, newV2Rule, RULE_FAMILY_HELP, RULE_FAMILY_LABELS, upgradeMechanicsDocument } from "./v2-authoring";
import { SelectField } from "./v2-fields";
import { V2RuleEditor } from "./v2-rule-editor";

export function MechanicsEditor({ draft, onChange, references }: { draft: SkillDraft; onChange: (draft: SkillDraft) => void; references: MechanicsEditorReferences | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDetach, setConfirmDetach] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [newFamily, setNewFamily] = useState<MechanicsV2Fields["kind"]>("resource");
  const [upgradeFamily, setUpgradeFamily] = useState<MechanicsV2Fields["kind"] | null>(null);
  const state = mechanicsDraftState(draft);
  const eligible = isSpecialAbilitySkill(draft.core);
  function write(document: SpecialAbilityMechanicsDocument) { onChange(changeSkillExtension(draft, { operation: "upsert", extensionType: SPECIAL_ABILITY_MECHANICS_EXTENSION, schemaVersion: document.schemaVersion, data: document })); }
  function updateRule(rule: MechanicsRule) {
    if (state.kind === "editable") write({ ...state.document, rules: state.document.rules.map(row => row.key === rule.key ? rule : row) });
  }
  function addRule(kind: "capability" | "manual") {
    if (state.kind !== "editable") return;
    const rule = newMechanicsRule(kind);
    write({ ...state.document, rules: [...state.document.rules, rule] });
    setExpanded(current => new Set([...current, rule.key]));
  }
  function addV2Rule(kind: MechanicsV2Fields["kind"], confirmed = false) {
    if (state.kind !== "editable") return;
    if (state.document.schemaVersion === 1 && !confirmed) { setUpgradeFamily(kind); return; }
    const document = state.document.schemaVersion === 1 ? upgradeMechanicsDocument(state.document) : state.document;
    const rule = newV2Rule(kind);
    write({ ...document, rules: [...document.rules, rule] });
    setExpanded(current => new Set([...current, rule.key]));
    setUpgradeFamily(null);
  }
  return <section className="mechanics-editor" aria-label="Special Ability Mechanics">
    <h3>Special Ability Mechanics</h3>
    <p>Author mechanics intrinsic to this Special Ability. Forms, anatomy, movement values, Natural Attacks and other systems keep their own editors.</p>
    <p>These are definitions for reading and G.O.D. review. Saving them does not execute gameplay actions.</p>
    {!eligible && <p role="alert">Structured mechanics require Special Ability classification. Restore that classification, or explicitly detach mechanics before saving this classification change.</p>}
    {state.kind === "absent" ? <>
      <p>Definition only. No structured mechanics are attached.</p>
      {eligible && <button className="st-button is-primary" type="button" onClick={() => write(emptySpecialAbilityMechanics())}>Add Structured Mechanics</button>}
    </> : <>
      {state.kind === "protected" ? <div className="mechanics-notice" role="status">
        {state.diagnostics.map((message, i) => <p key={i}>{message}</p>)}
        <p>Structured editing is unavailable. Saving Skill details preserves the original document. You may deliberately detach it below.</p>
      </div> : <>
        {state.document.rules.length === 0 && <p>Structured mechanics are attached, but no rules have been authored. This is a valid empty document.</p>}
        {mechanicsValidationMessage(state.document) && <p className="mechanics-notice" role="alert">Before saving: {mechanicsValidationMessage(state.document)}</p>}
        <fieldset disabled={!eligible} className="mechanics-fields">
          <div className="mechanics-actions">
            <button className="st-button" type="button" disabled={state.document.rules.length >= MECHANICS_LIMITS.rules} onClick={() => addRule("capability")}>Add Capability Rule</button>
            <button className="st-button" type="button" disabled={state.document.rules.length >= MECHANICS_LIMITS.rules} onClick={() => addRule("manual")}>Add Manual / G.O.D. Rule</button>
          </div>
          <SelectField label="Expanded rule family" value={newFamily} options={V2_RULE_KINDS.map(value => ({ value, label: RULE_FAMILY_LABELS[value] }))} onChange={setNewFamily} help={RULE_FAMILY_HELP[newFamily]} />
          <button className="st-button" type="button" disabled={state.document.rules.length >= MECHANICS_LIMITS.rules} onClick={() => addV2Rule(newFamily)}>{addRuleLabel(newFamily)}</button>
          {upgradeFamily && <div className="mechanics-notice" role="alert"><p>Adding {RULE_FAMILY_LABELS[upgradeFamily]} requires mechanics version 2. Upgrade this draft and add the rule? Existing authored rules and their identities are preserved. The upgrade is saved only when you Save Skill.</p><div className="mechanics-actions">
            <button className="st-button" type="button" onClick={() => setUpgradeFamily(null)}>Keep Version 1</button>
            <button className="st-button" type="button" onClick={() => addV2Rule(upgradeFamily, true)}>Upgrade and Add Rule</button>
          </div></div>}
          {state.document.rules.map((rule, index) => <article key={rule.key} data-rule-key={rule.key} className="mechanics-card">
            <MechanicsRuleSummary rule={rule} rules={state.document.rules} references={references} compact />
            <div className="mechanics-actions">
              <button className="st-button" type="button" aria-expanded={expanded.has(rule.key)} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(rule.key)) next.delete(rule.key); else next.add(rule.key); return next; })}>{expanded.has(rule.key) ? "Collapse Rule" : "Edit Rule"}</button>
              <button className="st-button" type="button" disabled={index === 0} onClick={() => write({ ...state.document, rules: moveMechanicsChild(state.document.rules, index, -1) })}>Move Rule Up</button>
              <button className="st-button" type="button" disabled={index === state.document.rules.length - 1} onClick={() => write({ ...state.document, rules: moveMechanicsChild(state.document.rules, index, 1) })}>Move Rule Down</button>
              <button className="st-button is-danger" type="button" onClick={() => setConfirmRemove(rule.key)}>Remove Rule</button>
            </div>
            {confirmRemove === rule.key && <div role="alert"><p>Remove this rule and its conditions from the draft?</p><div className="mechanics-actions">
              <button className="st-button" type="button" onClick={() => setConfirmRemove(null)}>Keep Rule</button>
              <button className="st-button is-danger" type="button" onClick={() => { write({ ...state.document, rules: state.document.rules.filter(row => row.key !== rule.key) }); setConfirmRemove(null); }}>Confirm Remove Rule</button>
            </div></div>}
            {expanded.has(rule.key) && <div className="mechanics-rule-fields">
              <GuidedField label="Rule Title" help="Give this rule a readable title. Renaming it preserves its identity."><input className="st-control" value={rule.title} maxLength={MECHANICS_LIMITS.title} onChange={event => updateRule({ ...rule, title: event.target.value })} /></GuidedField>
              <GuidedField label="Rule Description" help="Describe the intrinsic mechanic in your own authored words. The system does not infer rules from this text."><textarea className="st-control" rows={4} maxLength={MECHANICS_LIMITS.text} value={rule.description} onChange={event => updateRule({ ...rule, description: event.target.value })} /></GuidedField>
              {rule.kind === "capability" && <>
                <GuidedField label="Capability Domain" help="A descriptive category for organizing capabilities. It creates no movement, Flight, breathing runtime, Initiative, anatomy or resistance.">
                  <select className="st-control" value={rule.domain} onChange={event => updateRule({ ...rule, domain: event.target.value as typeof rule.domain })}>{CAPABILITY_DOMAINS.map(domain => <option key={domain} value={domain}>{domain[0].toUpperCase() + domain.slice(1)}</option>)}</select>
                </GuidedField><p>Capability categories are descriptive; they do not apply game mechanics.</p>
              </>}
              <MechanicsConditionsEditor when={rule.when} references={references} onChange={when => updateRule({ ...rule, when })} />
              {rule.kind === "manual" && <GuidedField label="G.O.D. Determination" help="State what the G.O.D. decides. Manual mechanics are supported authored rules and remain manual even when their requirements match."><textarea className="st-control" rows={3} maxLength={MECHANICS_LIMITS.text} value={rule.adjudication} onChange={event => updateRule({ ...rule, adjudication: event.target.value })} /></GuidedField>}
              <V2RuleEditor rule={rule} rules={state.document.rules} references={references} onChange={updateRule} />
              <GuidedField label="Limitations" help="Describe restrictions or exceptions intrinsic to this mechanic. Optional."><textarea className="st-control" rows={2} maxLength={MECHANICS_LIMITS.text} value={rule.limitations} onChange={event => updateRule({ ...rule, limitations: event.target.value })} /></GuidedField>
              <GuidedField label="Notes" help="Add optional guidance for readers. Notes do not change automated rules."><textarea className="st-control" rows={2} maxLength={MECHANICS_LIMITS.text} value={rule.notes} onChange={event => updateRule({ ...rule, notes: event.target.value })} /></GuidedField>
              <fieldset className="mechanics-group"><legend>Documentation References</legend>
                <p>Relate this mechanic to an existing definition. A reference does not grant, execute, copy or transfer it.</p>
                {rule.references.map((ref, refIndex) => <div className="mechanics-condition" key={refIndex}>
                  <MechanicsReferencePicker kind={ref.kind} value={ref} references={references} onChange={value => updateRule({ ...rule, references: rule.references.map((row, i) => i === refIndex ? value : row) })} />
                  <button className="st-button is-danger" type="button" onClick={() => updateRule({ ...rule, references: rule.references.filter((_, i) => i !== refIndex) })}>Remove Reference</button>
                </div>)}
                <div className="mechanics-actions">
                  <button className="st-button" type="button" disabled={rule.references.length >= MECHANICS_LIMITS.references} onClick={() => updateRule({ ...rule, references: [...rule.references, { kind: "skill", skillId: 0 }] })}>Add Skill Reference</button>
                  <button className="st-button" type="button" disabled={rule.references.length >= MECHANICS_LIMITS.references} onClick={() => updateRule({ ...rule, references: [...rule.references, { kind: "derived-ability", derivedAbilityId: 0 }] })}>Add Derived Ability Reference</button>
                </div>
              </fieldset>
            </div>}
          </article>)}
        </fieldset>
      </>}
      <div className="mechanics-detach">
        <button className="st-button is-danger" type="button" onClick={() => setConfirmDetach(true)}>Detach Mechanics</button>
        {confirmDetach && <div role="alert"><p>Detach all structured mechanics from this Skill? Its Definition remains. This removal takes effect when you Save Skill.</p><div className="mechanics-actions">
          <button className="st-button" type="button" onClick={() => setConfirmDetach(false)}>Keep Mechanics</button>
          <button className="st-button is-danger" type="button" onClick={() => { onChange(changeSkillExtension(draft, { operation: "remove", extensionType: SPECIAL_ABILITY_MECHANICS_EXTENSION })); setConfirmDetach(false); }}>Confirm Detach Mechanics</button>
        </div></div>}
      </div>
    </>}
  </section>;
}
