"use client";

import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import {
  CREATURE_ABILITY_ORIGINS, CREATURE_ATTACK_MODES, CREATURE_RESOLUTION_MODES,
  emptyCreatureAbilityAuthoring, emptyCreatureAttackAuthoring,
  type CreatureAbilityAuthoring, type CreatureAttackAuthoring, type CreatureMagicConstruction,
} from "@/features/creatures/creature-authoring";
import {
  DERIVED_ABILITY_ACTIVATION_TYPES, DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES,
  DERIVED_ABILITY_REQUIREMENT_OPERATORS, DERIVED_ABILITY_USE_CONDITION_TYPES,
} from "@/features/derived-abilities/models";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { adaptSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { SpellConstructionEditor } from "@/app/heavens/skills/spell-construction-editor";
import { listSpellFrameworkSkills } from "@/app/heavens/skills/actions";
import { CreatureAbilityEffectsEditor } from "./creature-ability-effects-editor";
import "./creature-authoring-editor.css";
import "../skills/skills.css";
import type { CreatureDraft } from "./actions";

const label = (value: string) => value === "aoe" ? "AoE" : value.replace(/(^|-)(\w)/g, (_, separator: string, letter: string) => `${separator ? " " : ""}${letter.toUpperCase()}`);
function Field({ name, children }: { name: string; children: ReactNode }) {
  const labelId = useId();
  return <label className="st-field"><span id={labelId}>{name}</span>{Children.map(children, (child) =>
    isValidElement(child) && typeof child.type === "string" && ["input", "select", "textarea"].includes(child.type)
      ? cloneElement(child as ReactElement<{ "aria-labelledby"?: string }>, { "aria-labelledby": labelId })
      : child,
  )}</label>;
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

function MagicConstruction({ value, name, onChange }: { value: CreatureMagicConstruction | null; name: string; onChange: (value: CreatureMagicConstruction | null) => void }) {
  const calculation = value ? calculateSpell(value.document) : null;
  const adapter = value ? adaptSpellToMechanicalEffects(value.document) : null;
  return <details className="creature-authoring__magic"><summary>Magic Construction{value ? ` — ${value.document.name || "Untitled"}` : " (optional)"}</summary>
    <p>Use the shared Spell Construction tools for complex magic. The construction is saved here for later combat integration.</p>
    {value ? <><button type="button" className="st-button" onClick={() => onChange(null)}>Remove Magic Construction</button>
      <SpellConstructionEditor document={value.document} onChange={(document) => onChange({ document })} findFrameworkSkills={listSpellFrameworkSkills} />
      <p>Calculator: {calculation?.baseSpellManaCost} Mana; {calculation?.baseCombatCastingTime} Initiative. {adapter?.valid ? `${adapter.effects.length} supported effects.` : "Some effects require manual review."} The authored action cost above remains separate.</p>
    </> : <button type="button" className="st-button" onClick={() => onChange({ document: { ...createEmptySpell(), name: name || "Creature Magic" } })}>Build Magic Construction</button>}
  </details>;
}

export function CreatureAttackAuthoringEditor({ value, name, skillOptions, onChange }: {
  value: CreatureAttackAuthoring | null | undefined; name: string;
  skillOptions: Array<{ id: number; name: string }>;
  onChange: (value: CreatureAttackAuthoring) => void;
}) {
  const data = value ?? emptyCreatureAttackAuthoring();
  const patch = (update: Partial<CreatureAttackAuthoring>) => onChange({ ...data, ...update });
  const ranged = data.mode === "ranged" || data.mode === "hybrid" || data.mode === "aoe";
  return <section className="creature-authoring" aria-label="Attack authoring">
    <h4>Attack Setup</h4>
    <p>Attack % controls the attack roll. Damage is the complete Bestiary base damage; no extra Strength or Dexterity is authored here. New setup fields are saved for later combat integration.</p>
    <div className="creature-authoring__grid">
      <NumberField name="Attack Initiative" value={data.initiativeCost} onChange={(initiativeCost) => patch({ initiativeCost })} />
      <Field name="Attack Mode"><select className="st-control" value={data.mode ?? ""} onChange={(event) => patch({ mode: event.target.value as CreatureAttackAuthoring["mode"] || null })}><option value="">Unspecified</option>{CREATURE_ATTACK_MODES.map((mode) => <option value={mode} key={mode}>{label(mode)}</option>)}</select></Field>
      <Magical value={data.magical} construction={Boolean(data.magic)} onChange={(magical) => patch({ magical })} />
      {data.mode ? <Field name="Distance Unit"><input className="st-control" placeholder="e.g. feet" value={data.range.unit ?? ""} onChange={(event) => patch({ range: { ...data.range, unit: event.target.value || null } })} /></Field> : null}
      {data.mode === "melee" || data.mode === "hybrid" ? <NumberField name="Reach" value={data.range.reach} onChange={(reach) => patch({ range: { ...data.range, reach } })} /> : null}
      {ranged ? (["short", "medium", "long"] as const).map((band) => <NumberField key={band} name={`${label(band)} Range`} value={data.range[band]} onChange={(distance) => patch({ range: { ...data.range, [band]: distance } })} />) : null}
    </div>
    {data.mode === "aoe" ? <p>Range to the effect is optional. Describe its area in the existing notes or Magic construction.</p> : null}
    {data.mode === "melee" ? <p>Reach is optional authoring data. A melee attack does not require a target distance.</p> : null}
    <CreatureAbilityEffectsEditor ability={{ effects: data.onHitEffects }} skillOptions={skillOptions}
      title="On-Hit Effects" note="These ordered effects belong to a successful hit, without a separate activation. Automatic application will be connected in a later combat step. Use Manual / G.O.D. Resolution for effects that need a ruling."
      emptyMessage="No structured On-Hit Effects. Special Effect text remains available as a legacy reference."
      onChange={({ effects }) => patch({ onHitEffects: effects })} />
    <MagicConstruction value={data.magic} name={name} onChange={(magic) => patch({ magic, magical: magic ? true : data.magical })} />
  </section>;
}

export function CreatureAbilityAuthoringEditor({ value, name, onChange }: {
  value: CreatureAbilityAuthoring | null | undefined; name: string; onChange: (value: CreatureAbilityAuthoring) => void;
}) {
  const data = value ?? emptyCreatureAbilityAuthoring();
  const patch = (update: Partial<CreatureAbilityAuthoring>) => onChange({ ...data, ...update });
  const passive = data.activationType === "passive";
  const active = data.activationType !== null && !passive;
  return <section className="creature-authoring" aria-label="Ability authoring">
    <h4>Trait / Ability Setup</h4>
    <p>Choose how this trait or ability is intended to operate. This setup is saved for later combat integration.</p>
    <div className="creature-authoring__grid">
      <Field name="Activation Type"><select className="st-control" value={data.activationType ?? ""} onChange={(event) => {
        const activationType = event.target.value as CreatureAbilityAuthoring["activationType"] || null;
        patch({ activationType, ...(activationType === "passive" ? { initiativeCost: null, costs: [], resolutionMode: "automatic", fixedRollTarget: null } : {}) });
      }}><option value="">Unspecified</option>{DERIVED_ABILITY_ACTIVATION_TYPES.map((type) => <option value={type} key={type}>{label(type)}</option>)}</select></Field>
      {active ? <NumberField name="Ability Initiative" value={data.initiativeCost} onChange={(initiativeCost) => patch({ initiativeCost })} /> : null}
      {data.activationType ? <Field name="Resolution Mode"><select className="st-control" value={data.resolutionMode} onChange={(event) => patch({ resolutionMode: event.target.value as CreatureAbilityAuthoring["resolutionMode"], fixedRollTarget: null })}>{CREATURE_RESOLUTION_MODES.filter((mode) => !passive || mode !== "fixed-roll").map((mode) => <option key={mode} value={mode}>{label(mode)}</option>)}</select></Field> : null}
      {active && data.resolutionMode === "fixed-roll" ? <NumberField name="Fixed Roll Target %" max={100} value={data.fixedRollTarget} onChange={(fixedRollTarget) => patch({ fixedRollTarget })} /> : null}
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
    <fieldset><legend>Use Conditions</legend>
      <p>Use the existing event, equipment, state, or manual conditions for triggers, reactions, and passive traits.</p>
      {data.useConditions.map((condition, index) => {
        const update = (change: Partial<typeof condition>) => patch({ useConditions: data.useConditions.map((entry, i) => i === index ? { ...entry, ...change } : entry) });
        return <div className="creature-authoring__row" key={index}>
          <Field name="Condition Type"><select className="st-control" value={condition.conditionType} onChange={(event) => update({ conditionType: event.target.value as typeof condition.conditionType })}>{DERIVED_ABILITY_USE_CONDITION_TYPES.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></Field>
          {condition.conditionType !== "manual" ? <><Field name="Condition Key"><input className="st-control" value={condition.conditionKey ?? ""} onChange={(event) => update({ conditionKey: event.target.value || null })} /></Field>
            <Field name="Operator"><select className="st-control" value={condition.operator ?? ""} onChange={(event) => update({ operator: event.target.value as typeof condition.operator || null })}><option value="">Unspecified</option>{DERIVED_ABILITY_REQUIREMENT_OPERATORS.map((operator) => <option key={operator}>{operator}</option>)}</select></Field>
            <Field name="Numeric Value"><input className="st-control" type="number" step="any" value={condition.numericValue ?? ""} onChange={(event) => update({ numericValue: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
            <Field name="Text Value"><input className="st-control" value={condition.textValue ?? ""} onChange={(event) => update({ textValue: event.target.value || null })} /></Field></> : null}
          <Field name="Condition Notes"><input className="st-control" value={condition.notes} onChange={(event) => update({ notes: event.target.value })} /></Field>
          <button type="button" className="st-button" onClick={() => patch({ useConditions: data.useConditions.filter((_, i) => i !== index) })}>Remove Condition</button>
        </div>;
      })}
      <button type="button" className="st-button" onClick={() => patch({ useConditions: [...data.useConditions, { conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "", sortOrder: data.useConditions.length }] })}>Add Use Condition</button>
    </fieldset>
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
    <MagicConstruction value={data.magic} name={name} onChange={(magic) => patch({ magic, magical: magic ? true : data.magical })} />
  </section>;
}
