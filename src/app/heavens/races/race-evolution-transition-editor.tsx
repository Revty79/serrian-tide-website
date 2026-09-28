"use client";
import { GuidedField } from "@/components/field-guidance";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";
import { emptyRaceEvolutionTransition, RACE_EVOLUTION_STEP_FIELDS, type PermanentEvolutionAdjustment, type RaceEvolutionTransition } from "@/features/races/race-evolution-transition";
import styles from "../creatures/creature-evolutions.module.css";

const stepLabels = { hpMultiplierSteps: "HP multiplier steps", baseMovementSteps: "Base movement steps", baseMagicSteps: "Base magic steps" };
export function RaceEvolutionTransitionEditor({ value, onChange }: { value: RaceEvolutionTransition | null | undefined; onChange: (value: RaceEvolutionTransition) => void }) {
  const current = value ?? emptyRaceEvolutionTransition();
  return <section className={styles.card} aria-label="Permanent Race Evolution mechanics">
    <h4>Permanent Character Changes</h4>
    <p>Add adjustments permanently change the individual Character when this Evolution is executed. They are added to the existing saved values and do not replace what the Character originally purchased. Enter a positive number to increase a value, a negative number to decrease it, or zero for no adjustment.</p>
    <p>The destination Race supplies size, anatomy, movement modes, protections, attacks, racial Skills, base magic, Forms and Interaction Rules. These adjustments spend no Experience and do not heal damage. Set is an explicit replacement option: it replaces that saved value, including when set to zero.</p>
    <h5>Attributes</h5>
    {CHARACTER_ATTRIBUTE_KEYS.map(key => <Adjustment key={key} label={key} value={current.attributes.find(row => row.key === key) ?? null} help={`Permanently change saved ${key}. Negative Add values reduce it. Results below zero are rejected; creation caps are not applied to Evolution.`}
      onChange={rule => onChange({ ...current, attributes: [...current.attributes.filter(row => row.key !== key), ...(rule ? [{ key, ...rule }] : [])] })} />)}
    <h5>Character Steps</h5>
    {RACE_EVOLUTION_STEP_FIELDS.map(key => <Adjustment key={key} label={stepLabels[key]} value={current[key]} integer
      help={key === "hpMultiplierSteps" ? "Each existing HP multiplier step adds 0.25 to the base multiplier of 2. Total HP is recalculated from the resulting CON and multiplier. Damage and injuries remain unchanged." : "Each existing permanent advancement step adds 0.25 to the destination Race's base value. This does not create a movement mode or change the Campaign's magic system."}
      onChange={rule => onChange({ ...current, [key]: rule })} />)}
  </section>;
}
function Adjustment({ label, help, value, onChange, integer }: { label: string; help: string; value: PermanentEvolutionAdjustment | null; onChange: (value: PermanentEvolutionAdjustment | null) => void; integer?: boolean }) {
  return <div className={styles.fields}>
    <GuidedField className="st-field" label={`${label} change`} help={help}>
      <select className="st-control" value={value?.operation ?? "add"} onChange={event => onChange({ operation: event.target.value as "add" | "set", value: value?.value ?? 0 })}>
        <option value="add">Add adjustment</option><option value="set">Set replacement</option>
      </select>
    </GuidedField>
    <GuidedField className="st-field" label={`${label} value`} help={`${value?.operation === "set" ? "Replace the saved value, including with zero." : "Add this signed adjustment to the saved value. Zero leaves it unchanged."} ${integer ? "Enter a whole number. The resulting step count must be zero or greater." : "The resulting Attribute must be zero or greater."}`}>
      <input className="st-control" type="number" required step={integer ? 1 : "any"} min={value?.operation === "set" ? 0 : undefined} value={Number.isNaN(value?.value) ? "" : value?.value ?? 0} onChange={event => onChange({ operation: value?.operation ?? "add", value: event.target.value === "" ? NaN : Number(event.target.value) })} />
    </GuidedField>
  </div>;
}
