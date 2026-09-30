"use client";
import { useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { MECHANICS_LIMITS } from "./codec";
import { moveMechanicsChild, moveMechanicsCondition, newMechanicsCondition, newMechanicsKey, progressionComparisonLabels, type MechanicsEditorReferences } from "./authoring";
import type { MechanicsCondition, MechanicsConditions } from "./models";
import { MechanicsReferencePicker } from "./mechanics-reference-picker";

type AddableCondition = Exclude<MechanicsCondition["kind"], "self-progression">;
function AddCondition({ onAdd, disabled }: { onAdd: (kind: AddableCondition) => void; disabled: boolean }) {
  const [kind, setKind] = useState<AddableCondition>("manual");
  return <div className="mechanics-actions">
    <GuidedField label="New condition type" help="Choose possession of an exact definition or a condition the G.O.D. determines. Numerical progression authoring is not yet available.">
      <select className="st-control" value={kind} onChange={event => setKind(event.target.value as AddableCondition)}>
        <option value="manual">Manual / G.O.D.</option><option value="skill-possession">Skill possession</option><option value="derived-ability-possession">Derived Ability possession</option>
      </select>
    </GuidedField>
    <button className="st-button" type="button" disabled={disabled} onClick={() => onAdd(kind)}>Add Condition</button>
  </div>;
}

export function MechanicsConditionsEditor({ when, onChange, references }: {
  when: MechanicsConditions; onChange: (when: MechanicsConditions) => void; references: MechanicsEditorReferences | null;
}) {
  const [confirmAlways, setConfirmAlways] = useState(false);
  function updateCondition(groupKey: string, condition: MechanicsCondition) {
    if (when.mode === "requirements") onChange({ ...when, groups: when.groups.map(group => group.key !== groupKey ? group
      : { ...group, conditions: group.conditions.map(row => row.key === condition.key ? condition : row) }) });
  }
  return <div className="mechanics-conditions">
    <GuidedField label="Applies When" help="Always requires possession of the owning Special Ability. Requirements offers alternative ways to qualify: every condition in one way must be met.">
      <select className="st-control" value={when.mode} onChange={event => {
        if (event.target.value === "always" && when.mode === "requirements" && when.groups.length) setConfirmAlways(true);
        else onChange(event.target.value === "always" ? { mode: "always" } : { mode: "requirements", groups: [] });
      }}><option value="always">Always, when possessed</option><option value="requirements">Requirements</option></select>
    </GuidedField>
    {confirmAlways && <div className="mechanics-notice" role="alert">
      <p>Switching to Always removes these qualification groups from the draft.</p>
      <button className="st-button" type="button" onClick={() => setConfirmAlways(false)}>Keep Requirements</button>{" "}
      <button className="st-button is-danger" type="button" onClick={() => { onChange({ mode: "always" }); setConfirmAlways(false); }}>Remove Requirements and Use Always</button>
    </div>}
    {when.mode === "always" ? <p>Whenever the Character possesses this Special Ability. This does not activate or apply a mechanic.</p> : <>
      {when.groups.length === 0 && <p role="alert">Add a way to qualify and its conditions, or deliberately choose Always.</p>}
      {when.groups.map((group, groupIndex) => <div key={group.key}>
        {groupIndex > 0 && <p className="mechanics-join">OR</p>}
        <fieldset className="mechanics-group" data-group-key={group.key}>
          <legend>Way to qualify {groupIndex + 1}</legend>
          <div className="mechanics-actions">
            <button className="st-button" type="button" disabled={groupIndex === 0} onClick={() => onChange({ ...when, groups: moveMechanicsChild(when.groups, groupIndex, -1) })}>Move Way Up</button>
            <button className="st-button" type="button" disabled={groupIndex === when.groups.length - 1} onClick={() => onChange({ ...when, groups: moveMechanicsChild(when.groups, groupIndex, 1) })}>Move Way Down</button>
            <button className="st-button is-danger" type="button" onClick={() => onChange({ ...when, groups: when.groups.filter(row => row.key !== group.key) })}>Remove Way</button>
          </div>
          {group.conditions.length === 0 && <p role="alert">This way needs at least one condition before saving.</p>}
          {group.conditions.map((condition, index) => <div key={condition.key}>
            {index > 0 && <p className="mechanics-join">AND</p>}
            <div className="mechanics-condition" data-condition-key={condition.key}>
              {condition.kind === "self-progression" ? <div className="mechanics-notice" role="status">
                <strong>Provisional — purchased-point interpretation not yet finalized</strong>
                <p>Saved progression requirement: {progressionComparisonLabels[condition.operator]} {condition.requiredValue}. Numerical editing is unavailable. This condition is preserved unless you explicitly remove it.</p>
              </div> : condition.kind === "manual" ? <GuidedField label="Manual condition" help="Describe the context the G.O.D. must determine. This text is not interpreted or automatically resolved.">
                <textarea className="st-control" rows={3} maxLength={MECHANICS_LIMITS.text} value={condition.notes} onChange={event => updateCondition(group.key, { ...condition, notes: event.target.value })} />
              </GuidedField> : <>
                <MechanicsReferencePicker kind={condition.kind === "skill-possession" ? "skill" : "derived-ability"}
                  value={condition.kind === "skill-possession" ? { kind: "skill", skillId: condition.skillId } : { kind: "derived-ability", derivedAbilityId: condition.derivedAbilityId }}
                  references={references} onChange={ref => updateCondition(group.key, ref.kind === "skill"
                    ? { key: condition.key, kind: "skill-possession", skillId: ref.skillId, operator: condition.operator }
                    : { key: condition.key, kind: "derived-ability-possession", derivedAbilityId: ref.derivedAbilityId, operator: condition.operator })} />
                <GuidedField label="Possession" help="Require that the Character possesses, or does not possess, the selected definition. Missing facts remain unresolved.">
                  <select className="st-control" value={condition.operator} onChange={event => updateCondition(group.key, { ...condition, operator: event.target.value as "possessed" | "not-possessed" })}>
                    <option value="possessed">Possessed</option><option value="not-possessed">Not Possessed</option>
                  </select>
                </GuidedField>
              </>}
              <div className="mechanics-actions">
                <button className="st-button" type="button" disabled={index === 0} onClick={() => onChange({ ...when, groups: when.groups.map(row => row.key === group.key ? { ...row, conditions: moveMechanicsChild(row.conditions, index, -1) } : row) })}>Move Condition Up</button>
                <button className="st-button" type="button" disabled={index === group.conditions.length - 1} onClick={() => onChange({ ...when, groups: when.groups.map(row => row.key === group.key ? { ...row, conditions: moveMechanicsChild(row.conditions, index, 1) } : row) })}>Move Condition Down</button>
                <button className="st-button is-danger" type="button" onClick={() => onChange({ ...when, groups: when.groups.map(row => row.key === group.key ? { ...row, conditions: row.conditions.filter(item => item.key !== condition.key) } : row) })}>Remove Condition</button>
              </div>
              {when.groups.length > 1 && <GuidedField label="Move to another way" help="Move this condition into another alternative, preserving its identity. An empty way must be filled or removed before saving.">
                <select className="st-control" value={group.key} onChange={event => onChange(moveMechanicsCondition(when, condition.key, event.target.value))}>
                  {when.groups.map((row, i) => <option key={row.key} value={row.key}>Way to qualify {i + 1}</option>)}
                </select>
              </GuidedField>}
            </div>
          </div>)}
          <AddCondition disabled={group.conditions.length >= MECHANICS_LIMITS.conditions} onAdd={kind => onChange({ ...when, groups: when.groups.map(row => row.key === group.key ? { ...row, conditions: [...row.conditions, newMechanicsCondition(kind)] } : row) })} />
        </fieldset>
      </div>)}
      <button className="st-button" type="button" disabled={when.groups.length >= MECHANICS_LIMITS.groups} onClick={() => onChange({ ...when, groups: [...when.groups, { key: newMechanicsKey(), conditions: [] }] })}>Add Way to Qualify</button>
    </>}
    <p className="mechanics-hint">New Special Ability progression conditions are unavailable until Brannan and Ember finalize their meaning.</p>
  </div>;
}
