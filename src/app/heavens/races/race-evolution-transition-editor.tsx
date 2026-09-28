"use client";
import { GuidedField } from "@/components/field-guidance";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";
import { emptyRaceEvolutionTransition, RACE_EVOLUTION_STEP_FIELDS, type PermanentEvolutionAdjustment, type RaceEvolutionTransition } from "@/features/races/race-evolution-transition";
import styles from "../creatures/creature-evolutions.module.css";

const stepLabels = { hpMultiplierSteps: "HP multiplier steps", baseMovementSteps: "Permanent movement steps", baseMagicSteps: "Permanent magic steps" };
export function RaceEvolutionTransitionEditor({ value, onChange }: { value: RaceEvolutionTransition | null | undefined; onChange: (value: RaceEvolutionTransition) => void }) {
  const current = value ?? emptyRaceEvolutionTransition();
  return <section className={styles.card} aria-label="Permanent Race Evolution mechanics">
    <h4>Permanent individual changes</h4>
    <p>The destination Race supplies size, anatomy, movement modes, protections, attacks, racial Skills, base magic, Forms and Interaction Rules. Author changes here only for values saved on the individual. Add adjusts the existing value; Set replaces it. Unchanged preserves it. These changes spend no Experience and do not heal damage.</p>
    {CHARACTER_ATTRIBUTE_KEYS.map(key => <Adjustment key={key} label={key} value={current.attributes.find(row => row.key === key) ?? null} help={`Permanently change saved ${key}. Negative Add values reduce it. Results below zero are rejected; creation caps are not applied to Evolution.`}
      onChange={rule => onChange({ ...current, attributes: [...current.attributes.filter(row => row.key !== key), ...(rule ? [{ key, ...rule }] : [])] })} />)}
    {RACE_EVOLUTION_STEP_FIELDS.map(key => <Adjustment key={key} label={stepLabels[key]} value={current[key]} integer
      help={key === "hpMultiplierSteps" ? "Each existing HP multiplier step adds 0.25 to the base multiplier of 2. Total HP is recalculated from the resulting CON and multiplier. Damage and injuries remain unchanged." : "Each existing permanent advancement step adds 0.25 to the destination Race's base value. This does not create a movement mode or change the Campaign's magic system."}
      onChange={rule => onChange({ ...current, [key]: rule })} />)}
  </section>;
}
function Adjustment({ label, help, value, onChange, integer }: { label: string; help: string; value: PermanentEvolutionAdjustment | null; onChange: (value: PermanentEvolutionAdjustment | null) => void; integer?: boolean }) {
  return <div className={styles.fields}>
    <GuidedField className="st-field" label={`${label} change`} help={help}>
      <select className="st-control" value={value?.operation ?? "unchanged"} onChange={event => onChange(event.target.value === "unchanged" ? null : { operation: event.target.value as "add" | "set", value: value?.value ?? 0 })}>
        <option value="unchanged">Unchanged</option><option value="add">Add</option><option value="set">Set</option>
      </select>
    </GuidedField>
    {value ? <GuidedField className="st-field" label={`${label} value`} help={integer ? "Enter a whole number. The resulting step count must be zero or greater." : "Enter the exact adjustment or replacement value. The resulting Attribute must be zero or greater."}>
      <input className="st-control" type="number" required step={integer ? 1 : "any"} min={value.operation === "set" ? 0 : undefined} value={Number.isNaN(value.value) ? "" : value.value} onChange={event => onChange({ ...value, value: event.target.value === "" ? NaN : Number(event.target.value) })} />
    </GuidedField> : null}
  </div>;
}
