"use client";
import type { AttackAuthoring, AttackMagicConstruction } from "@/features/attacks/attack-authoring";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { adaptSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { SpellConstructionEditor } from "@/app/heavens/skills/spell-construction-editor";
import { listSpellFrameworkSkills } from "@/app/heavens/skills/actions";
import "./creatures/creature-authoring-editor.css";
import "./skills/skills.css";

export function AttackRangeFields({ value: data, onChange }: { value: AttackAuthoring; onChange: (value: AttackAuthoring) => void }) {
  const range = data.range;
  const ranged = data.mode === "ranged" || data.mode === "hybrid" || data.mode === "aoe";
  const number = (key: "reach" | "short" | "medium" | "long", name: string) =>
    <GuidedField key={key} className="st-field" label={name} help={fieldHelp("creature", name)}><input className="st-control" type="number" min={0} step="any" value={range[key] ?? ""} onChange={event => onChange({ ...data, range: { ...range, [key]: event.target.value === "" ? null : Number(event.target.value) } })} /></GuidedField>;
  return <>
    {data.mode ? <div className="creature-authoring__grid">
      {data.mode === "melee" || data.mode === "hybrid" ? number("reach", "Reach") : null}
      {ranged || data.mode === "melee" && range.reach !== null ? <GuidedField className="st-field" label={ranged ? "Distance Unit" : "Reach Unit"} help="Use one distance unit, such as feet, for every authored reach and range on this attack."><input className="st-control" placeholder="e.g. feet" value={range.unit ?? ""} onChange={event => onChange({ ...data, range: { ...range, unit: event.target.value || null } })} /></GuidedField> : null}
      {ranged ? (["short", "medium", "long"] as const).map(band => number(band, `${band[0].toUpperCase()}${band.slice(1)} Range`)) : null}
    </div> : null}
    {data.mode === "aoe" ? <p>Optional range to the effect. Describe the area in Notes or Magic Construction.</p> : null}
    {data.mode === "melee" ? <p>Reach{range.unit ? ` (${range.unit})` : ""} is optional. Melee does not require a target distance.</p> : null}
  </>;
}

export function AttackMagicConstructionEditor({ value, name, onChange, authoringOnly = false }: { value: AttackMagicConstruction | null; name: string; authoringOnly?: boolean; onChange: (value: AttackMagicConstruction | null) => void }) {
  const calculation = value ? calculateSpell(value.document) : null;
  const adapter = value ? adaptSpellToMechanicalEffects(value.document) : null;
  return <details className="creature-authoring__magic"><summary>Magic Construction{value ? ` — ${value.document.name || "Untitled"}` : " (optional)"}</summary>
    <p>{authoringOnly ? "Author a spell construction for this inherent attack. This saves the construction for later use; it does not enable Character attacks or casting." : "Use the shared Spell Construction tools for complex magic. Supported constructed effects are used during Creature action resolution; unsupported effects need a G.O.D. ruling."}</p>
    {value ? <><button type="button" className="st-button" onClick={() => onChange(null)}>Remove Magic Construction</button>
      <SpellConstructionEditor document={value.document} onChange={(document) => onChange({ document })} findFrameworkSkills={listSpellFrameworkSkills} />
      <p>Calculator: {calculation?.baseSpellManaCost} Mana; {calculation?.baseCombatCastingTime} Initiative. {adapter?.valid ? `${adapter.effects.length} supported effects.` : "Some effects require manual review."} The authored action cost above remains separate.</p>
    </> : <button type="button" className="st-button" onClick={() => onChange({ document: { ...createEmptySpell(), name: name || (authoringOnly ? "Natural Attack Magic" : "Creature Magic") } })}>Build Magic Construction</button>}
  </details>;
}
