"use client";

import { CREATURE_CR_IMPACTS, type CreatureCrImpact } from "@/db/creature-schema";
import { LegacyAuthoringData } from "@/app/heavens/legacy-authoring-data";
import { type ReactNode } from "react";
import { AttackRangeFields, AttackMagicConstructionEditor as MagicConstruction } from "../attack-authoring-fields";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import {
  CREATURE_ABILITY_ORIGINS, CREATURE_ATTACK_MODES, CREATURE_RESOLUTION_MODES,
  emptyCreatureAbilityAuthoring, emptyCreatureAttackAuthoring,
  type CreatureAbilityAuthoring, type CreatureAttackAuthoring,
} from "@/features/creatures/creature-authoring";
import {
  DERIVED_ABILITY_ACTIVATION_TYPES, DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES,
} from "@/features/derived-abilities/models";
import { CreatureAbilityEffectsEditor } from "./creature-ability-effects-editor";
import { CreatureAuthoringHelpField, CreatureUseConditionsEditor, creatureActivationHelp } from "./creature-use-conditions-editor";
import "./creature-authoring-editor.css";
import "../skills/skills.css";
import type { CreatureDraft } from "./actions";

const label = (value: string) => value === "aoe" ? "AoE" : value.replace(/(^|-)(\w)/g, (_, separator: string, letter: string) => `${separator ? " " : ""}${letter.toUpperCase()}`);
function Field({ name, children }: { name: string; children: ReactNode }) {
  return <GuidedField label={name} help={fieldHelp("creature", name)} className="st-field">{children}</GuidedField>;
}
function NumberField({ name, value, onChange, min = 0, max }: { name: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number }) {
  return <Field name={name}><input className="st-control" type="number" min={min} max={max} step="any" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></Field>;
}
function Magical({ value, construction, onChange }: { value: boolean | null; construction: boolean; onChange: (value: boolean | null) => void }) {
  return <Field name="Magical"><select className="st-control" value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Unspecified</option><option value="true">Yes</option><option value="false" disabled={construction}>No</option></select>{construction ? <small>The attached Magic construction makes this source magical.</small> : null}</Field>;
}
export function CreatureOriginField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const known = CREATURE_ABILITY_ORIGINS.some((origin) => origin === value);
  return <Field name="Origin"><select className="st-control" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Unspecified</option>{!known && value ? <option value={value}>{value} (legacy)</option> : null}{CREATURE_ABILITY_ORIGINS.map((origin) => <option key={origin}>{origin}</option>)}</select></Field>;
}

export function CreatureHarvestUtilityEditor({ uses, onChange }: { uses: CreatureDraft["uses"]; onChange: (uses: CreatureDraft["uses"]) => void }) {
  return <section className="creature-authoring creature-authoring__harvest" aria-label="Harvest & Utility"><h3>Harvest & Utility</h3>
    <p>Materials, harvesting, and other uses of this creature.</p>
    {uses.map((use, index) => <div className="creature-authoring__row" key={index}>
      <Field name="Use Name"><input className="st-control" value={use.useName} onChange={(event) => onChange(uses.map((row, i) => i === index ? { ...row, useName: event.target.value } : row))} /></Field>
      <Field name="Use Notes"><input className="st-control" value={use.notes} onChange={(event) => onChange(uses.map((row, i) => i === index ? { ...row, notes: event.target.value } : row))} /></Field>
      <button type="button" className="st-button" onClick={() => onChange(uses.filter((_, i) => i !== index))}>Remove Use</button>
    </div>)}
    <button type="button" className="st-button" onClick={() => onChange([...uses, { seedIdentity: null, useName: "", notes: "", sortOrder: uses.length }])}>Add Use</button>
  </section>;
}


export function CreatureAttackAuthoringEditor({ attack, skillOptions, onChange }: {
  attack: CreatureDraft["attacks"][number];
  skillOptions: Array<{ id: number; name: string }>;
  onChange: (attack: CreatureDraft["attacks"][number]) => void;
}) {
  const data = attack.authoring ?? emptyCreatureAttackAuthoring();
  const patch = (update: Partial<CreatureAttackAuthoring>) => onChange({ ...attack, authoring: { ...data, ...update } });
  return <section className="creature-authoring creature-authoring--card" aria-label="Attack authoring">
    <div className="creature-authoring__grid" data-attack-primary>
      <Field name="Attack Name"><input className="st-control" value={attack.attackName} onChange={(e) => onChange({ ...attack, attackName: e.target.value })} /></Field>
      <Field name="Attack %"><input className="st-control" type="number" step="any" value={attack.attackPercentage ?? ""} onChange={(e) => onChange({ ...attack, attackPercentage: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
      <NumberField name="Attack Initiative" min={0.01} value={data.initiativeCost} onChange={(initiativeCost) => patch({ initiativeCost })} />
      <Field name="Damage"><input className="st-control" value={attack.damage ?? ""} onChange={(e) => onChange({ ...attack, damage: e.target.value || null })} /></Field>
      <Field name="Damage Type"><input className="st-control" value={attack.damageType} onChange={(e) => onChange({ ...attack, damageType: e.target.value })} /></Field>
      <Field name="Attack Mode"><select className="st-control" value={data.mode ?? ""} onChange={(event) => patch({ mode: event.target.value as CreatureAttackAuthoring["mode"] || null })}><option value="">Unspecified</option>{CREATURE_ATTACK_MODES.map((mode) => <option value={mode} key={mode}>{label(mode)}</option>)}</select></Field>
      <Magical value={data.magical} construction={Boolean(data.magic)} onChange={(magical) => patch({ magical })} />
    </div>
    <AttackRangeFields value={data} onChange={authoring => onChange({ ...attack, authoring })} />
    <Field name="Notes"><textarea className="st-control" rows={2} value={attack.notes} onChange={(e) => onChange({ ...attack, notes: e.target.value })} /></Field>
    <CreatureAbilityEffectsEditor ability={{ effects: data.onHitEffects }} skillOptions={skillOptions} compact addLabel="Add On-Hit Effect"
      title="On-Hit Effects" note="Optional effects after a successful hit."
      onChange={({ effects }) => patch({ onHitEffects: effects })} />
    <MagicConstruction value={data.magic} name={attack.attackName} onChange={(magic) => patch({ magic, magical: magic ? true : data.magical })} />
    <LegacyAuthoringData entries={[
      { label: "Range / Reach", value: attack.rangeReach }, { label: "Required Anatomy", value: attack.requiredAnatomy },
      { label: "Requirements", value: attack.requirements }, { label: "Uses / Recharge", value: attack.usesRecharge },
      { label: "Special Effect", value: attack.specialEffect },
    ]} />
  </section>;
}

export function LegacyCreatureDefenses({ defenses }: { defenses: CreatureDraft["defenses"] }) {
  return <LegacyAuthoringData title="Legacy Defense Data" entries={defenses.map((defense, index) => ({
    label: defense.defenseType || `Defense ${index + 1}`,
    value: [defense.against, defense.value, defense.notes, `CR Impact: ${defense.crImpact}`].filter(Boolean).join("\n"),
  }))} />;
}

export function CreatureAbilityAuthoringEditor({ ability, skillOptions, onChange }: {
  ability: CreatureDraft["abilities"][number];
  skillOptions: Array<{ id: number; name: string }>;
  onChange: (ability: CreatureDraft["abilities"][number]) => void;
}) {
  const data = ability.authoring ?? emptyCreatureAbilityAuthoring();
  const patch = (update: Partial<CreatureAbilityAuthoring>) => onChange({ ...ability, authoring: { ...data, ...update } });
  const passive = data.activationType === "passive";
  const active = data.activationType !== null && !passive;
  return <section className="creature-authoring creature-authoring--card" aria-label="Ability authoring">
    <Field name="Ability Name"><input className="st-control" value={ability.abilityName} onChange={(e) => onChange({ ...ability, abilityName: e.target.value })} /></Field>
    <Field name="Description"><textarea className="st-control" rows={3} value={ability.description} onChange={(e) => onChange({ ...ability, description: e.target.value })} /></Field>
    <div className="creature-authoring__grid">
      <CreatureAuthoringHelpField name="Activation Type" help={creatureActivationHelp}><select className="st-control" value={data.activationType ?? ""} onChange={(event) => {
        const activationType = event.target.value as CreatureAbilityAuthoring["activationType"] || null;
        patch({ activationType, ...(activationType === "passive" ? { initiativeCost: null, costs: [], resolutionMode: "automatic", fixedRollTarget: null } : {}) });
      }}><option value="">Unspecified</option>{DERIVED_ABILITY_ACTIVATION_TYPES.map((type) => <option value={type} key={type}>{label(type)}</option>)}</select></CreatureAuthoringHelpField>
      {active ? <NumberField name="Ability Initiative" min={0.01} value={data.initiativeCost} onChange={(initiativeCost) => patch({ initiativeCost })} /> : null}
    </div>
    <CreatureAbilityEffectsEditor ability={ability} skillOptions={skillOptions} onChange={onChange} compact title="Effects" note="Choose what this ability does." />
    <details className="creature-authoring__advanced"><summary>Advanced Ability Settings</summary>
    <div className="creature-authoring__grid">
      <CreatureOriginField value={ability.abilityType} onChange={(abilityType) => onChange({ ...ability, abilityType })} />
      <Field name="Threat / CR Impact"><select className="st-control" value={ability.crImpact} onChange={(e) => onChange({ ...ability, crImpact: e.target.value as CreatureCrImpact })}>{CREATURE_CR_IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}</select></Field>
      {data.activationType ? <Field name="Resolution Mode"><select className="st-control" value={data.resolutionMode} onChange={(event) => patch({ resolutionMode: event.target.value as CreatureAbilityAuthoring["resolutionMode"], fixedRollTarget: null })}>{CREATURE_RESOLUTION_MODES.filter((mode) => !passive || mode !== "fixed-roll").map((mode) => <option key={mode} value={mode}>{label(mode)}</option>)}</select></Field> : null}
      {active && data.resolutionMode === "fixed-roll" ? <NumberField name="Fixed Roll Target %" min={1} max={100} value={data.fixedRollTarget} onChange={(fixedRollTarget) => patch({ fixedRollTarget })} /> : null}
      <Field name="Targeting Notes"><input className="st-control" value={data.targeting} onChange={(event) => patch({ targeting: event.target.value })} placeholder="Targets or manual selection instructions" /></Field>
      <Magical value={data.magical} construction={Boolean(data.magic)} onChange={(magical) => patch({ magical })} />
    </div>
    {passive ? <p>Passive traits have no activation roll or activation costs. Use Conditions describe when the trait should be present.</p> : null}
    {active ? <p>Choosing Passive clears activation costs and fixed-roll settings.</p> : null}
    {active ? <fieldset><legend>Resource Costs</legend>
      {data.costs.map((cost, index) => <div className="creature-authoring__row" key={index}>
        <Field name="Resource"><select className="st-control" value={cost.costType} onChange={(event) => patch({ costs: data.costs.map((entry, i) => i === index ? { ...entry, costType: event.target.value as typeof cost.costType } : entry) })}>{DERIVED_ABILITY_COST_TYPES.filter((type) => type !== "initiative").map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></Field>
        <NumberField name="Cost Amount" value={cost.amount} onChange={(amount) => patch({ costs: data.costs.map((entry, i) => i === index ? { ...entry, amount: amount ?? 0 } : entry) })} />
        <Field name="Resource Key"><input className="st-control" value={cost.resourceKey ?? ""} onChange={(event) => patch({ costs: data.costs.map((entry, i) => i === index ? { ...entry, resourceKey: event.target.value || null } : entry) })} /></Field>
        <Field name="Cost Notes"><input className="st-control" value={cost.notes} onChange={(event) => patch({ costs: data.costs.map((entry, i) => i === index ? { ...entry, notes: event.target.value } : entry) })} /></Field>
        <button type="button" className="st-button" onClick={() => patch({ costs: data.costs.filter((_, i) => i !== index) })}>Remove Cost</button>
      </div>)}
      <button type="button" className="st-button" onClick={() => patch({ costs: [...data.costs, { costType: "mana", amount: 1, resourceKey: null, notes: "", sortOrder: data.costs.length }] })}>Add Resource Cost</button>
    </fieldset> : null}
    <CreatureUseConditionsEditor conditions={data.useConditions} onChange={(useConditions) => patch({ useConditions })} />
    {active ? <fieldset><legend>Uses & Recharge</legend>
      {data.useLimits.map((limit, index) => {
        const update = (change: Partial<typeof limit>) => patch({ useLimits: data.useLimits.map((entry, i) => i === index ? { ...entry, ...change } : entry) });
        return <div className="creature-authoring__row" key={index}>
          <NumberField name="Maximum Uses" value={limit.maximumUses} min={1} onChange={(maximumUses) => update({ maximumUses: maximumUses ?? 0 })} />
          <Field name="Refresh Scope"><select className="st-control" value={limit.refreshScope} onChange={(event) => update({ refreshScope: event.target.value as typeof limit.refreshScope })}>{DERIVED_ABILITY_REFRESH_SCOPES.map((scope) => <option key={scope} value={scope}>{label(scope)}</option>)}</select></Field>
          <Field name="Refresh Key"><input className="st-control" value={limit.refreshKey ?? ""} onChange={(event) => update({ refreshKey: event.target.value || null })} /></Field>
          <Field name="Recharge Notes"><input className="st-control" value={limit.notes} onChange={(event) => update({ notes: event.target.value })} /></Field>
          <button type="button" className="st-button" onClick={() => patch({ useLimits: data.useLimits.filter((_, i) => i !== index) })}>Remove Use Limit</button>
        </div>;
      })}
      <button type="button" className="st-button" onClick={() => patch({ useLimits: [...data.useLimits, { maximumUses: 1, refreshScope: "encounter", refreshKey: null, notes: "", sortOrder: data.useLimits.length }] })}>Add Use Limit</button>
    </fieldset> : null}
    <Field name="Notes"><textarea className="st-control" rows={2} value={ability.notes} onChange={(e) => onChange({ ...ability, notes: e.target.value })} /></Field>
    <MagicConstruction value={data.magic} name={ability.abilityName} onChange={(magic) => patch({ magic, magical: magic ? true : data.magical })} />
    </details>
    <LegacyAuthoringData entries={[
      { label: "Activation", value: ability.activation }, { label: "Requirements", value: ability.requirements },
      { label: "Uses / Recharge", value: ability.usesRecharge }, { label: "Mechanical Notes", value: ability.mechanicalEffect },
    ]} />
  </section>;
}
