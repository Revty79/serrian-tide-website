"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { ATTACK_MODES, type AttackAuthoring } from "@/features/attacks/attack-authoring";
import { createHumanoidRaceAnatomy, type RaceAnatomy } from "@/features/races/race-anatomy";
import { emptyRaceNaturalAttack, normalizeRaceNaturalAttacks, type RaceNaturalAttack } from "@/features/races/race-natural-attacks";
import { AttackRangeFields, AttackMagicConstructionEditor } from "../attack-authoring-fields";
import { CreatureAbilityEffectsEditor } from "../creatures/creature-ability-effects-editor";
import { listNaturalAttackSkillCandidates, type RaceSkillCandidate } from "./actions";
import styles from "./race-natural-attacks-editor.module.css";

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <GuidedField className="st-field" label={label} help={help}>{children}</GuidedField>;
}

function AttackRow({ attack, anatomy, skillOptions, onChange }: {
  attack: RaceNaturalAttack; anatomy: RaceAnatomy | null; skillOptions: Array<{ id: number; name: string }>;
  onChange: (value: RaceNaturalAttack) => void;
}) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<RaceSkillCandidate[]>([]);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      listNaturalAttackSkillCandidates(search).then(rows => { if (active) { setCandidates(rows); setSearchError(""); } })
        .catch(() => { if (active) { setCandidates([]); setSearchError("Skill search failed. Try searching again."); } })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);
  const patch = (change: Partial<RaceNaturalAttack>) => onChange({ ...attack, ...change });
  const mechanics = (change: Partial<AttackAuthoring>) => patch({ authoring: { ...attack.authoring, ...change } });
  const data = attack.authoring;
  const body = anatomy ?? createHumanoidRaceAnatomy();
  let validation = "";
  try { normalizeRaceNaturalAttacks([attack], anatomy); } catch (error) { validation = error instanceof Error ? error.message : "Check this Natural Attack."; }
  const pools = [...body.hpPools.map(row => ({ id: row.canonicalId, name: row.poolName })),
    ...attack.anatomy.hpPoolIds.filter(id => !body.hpPools.some(pool => pool.canonicalId === id)).map(id => ({ id, name: `${id} (missing from Anatomy)` }))];
  const locations = [...body.hitLocations.map(row => ({ number: row.hitLocationNumber, name: row.locationName })),
    ...attack.anatomy.hitLocationNumbers.filter(number => !body.hitLocations.some(row => row.hitLocationNumber === number)).map(number => ({ number, name: "Missing from Anatomy" }))];
  return <div className="creature-authoring creature-authoring--card">
    <div className={styles.fields}>
      <Field label="Attack Name" help="Name this inherent attack, such as Bite, Claws or Tail Strike."><input className="st-control" value={attack.attackName} onChange={event => patch({ attackName: event.target.value })} /></Field>
      <Field label="Damage" help="Enter the authored damage value or expression. Leave blank when the damage has not been decided."><input className="st-control" value={attack.damage ?? ""} onChange={event => patch({ damage: event.target.value || null })} /></Field>
      <Field label="Damage Type" help="Use the damage category specified by the attack, such as Slashing, Piercing or Fire."><input className="st-control" value={attack.damageType} onChange={event => patch({ damageType: event.target.value })} /></Field>
      <Field label="Attack Initiative" help="Enter a positive Initiative cost, including a fractional cost when authored. Blank leaves the cost unresolved."><input className="st-control" type="number" min={0.01} step="any" value={data.initiativeCost ?? ""} onChange={event => mechanics({ initiativeCost: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
      <Field label="Attack Mode" help="Melee uses reach, ranged uses distance bands, and hybrid supports both. AoE supports range to the area; describe its shape and size in Notes or Magic Construction."><select className="st-control" value={data.mode ?? ""} onChange={event => mechanics({ mode: event.target.value as AttackAuthoring["mode"] || null })}><option value="">Unspecified</option>{ATTACK_MODES.map(mode => <option key={mode} value={mode}>{mode === "aoe" ? "AoE" : mode[0].toUpperCase() + mode.slice(1)}</option>)}</select></Field>
      <Field label="Magical" help="State whether this attack itself is magical or supernatural. Unspecified preserves an undecided value. Race Base Magic does not set this field; an attached Magic Construction establishes magical nature."><select className="st-control" value={data.magical === null ? "" : String(data.magical)} onChange={event => mechanics({ magical: event.target.value === "" ? null : event.target.value === "true" })}><option value="">Unspecified</option><option value="true">Yes</option><option value="false" disabled={!!data.magic}>No</option></select></Field>
    </div>
    <AttackRangeFields value={data} onChange={authoring => patch({ authoring })} />
    <fieldset><legend>Attack Skill / Basis</legend>
      <p>Select the intended Skill from the shared library. This records the attack basis for later Character rules; it does not grant or change a Skill.</p>
      <div className={styles.fields}>
        <Field label="Search Attack Skills" help="Search saved, active Skills by name. Attack references can use any tier; Race Skill grant restrictions remain separate."><input className="st-control" type="search" value={search} onChange={event => { setSearch(event.target.value); setCandidates([]); setLoading(true); }} /></Field>
        <Field label="Attack Skill" help="Choose the Skill this attack is intended to use. Unspecified leaves resolution undecided. Record any additional Attribute or basis explanation below."><select className="st-control" value={attack.skillId ?? ""} onChange={event => { const selected = candidates.find(row => row.id === Number(event.target.value)); patch({ skillId: selected?.id ?? null, skillName: selected?.name ?? "" }); }}><option value="">{loading ? "Searching… (Unspecified)" : "Unspecified"}</option>{attack.skillId !== null && !candidates.some(row => row.id === attack.skillId) ? <option value={attack.skillId}>{attack.skillName || `Skill #${attack.skillId}`} (saved reference)</option> : null}{candidates.map(row => <option key={row.id} value={row.id}>{row.name} · {row.classification}{row.tier !== null ? ` · T${row.tier}` : ""}</option>)}</select></Field>
      </div>
      {searchError ? <p role="alert">{searchError}</p> : null}
      <Field label="Attack Basis Notes" help="Document the intended Skill/Attribute basis or unresolved ruling. These notes are descriptive and do not define a new calculation."><textarea className="st-control" rows={2} value={attack.basisNotes} onChange={event => patch({ basisNotes: event.target.value })} /></Field>
    </fieldset>
    <fieldset><legend>Anatomy Requirement</legend>
      <p>Select the body pools and hit locations this attack needs. Use the notes for details such as a functional jaw, claws or horns. References follow this Race&apos;s HP & Hit Locations; an unchanged Race uses standard humanoid Anatomy.</p>
      <div className={styles.fields}>
        <fieldset><legend>Required HP Pools</legend>{pools.map(pool => <label className={styles.choice} key={pool.id}><input type="checkbox" checked={attack.anatomy.hpPoolIds.includes(pool.id)} onChange={event => patch({ anatomy: { ...attack.anatomy, hpPoolIds: event.target.checked ? [...attack.anatomy.hpPoolIds, pool.id] : attack.anatomy.hpPoolIds.filter(id => id !== pool.id) } })} />{pool.name}</label>)}</fieldset>
        <fieldset><legend>Required Hit Locations</legend>{locations.map(location => <label className={styles.choice} key={location.number}><input type="checkbox" checked={attack.anatomy.hitLocationNumbers.includes(location.number)} onChange={event => patch({ anatomy: { ...attack.anatomy, hitLocationNumbers: event.target.checked ? [...attack.anatomy.hitLocationNumbers, location.number] : attack.anatomy.hitLocationNumbers.filter(number => number !== location.number) } })} />{location.number}: {location.name}</label>)}</fieldset>
      </div>
      <Field label="Anatomy Requirement Notes" help="Describe required body features or function that the selected pool/location alone cannot express. These authored requirements are saved for future availability checks."><textarea className="st-control" rows={2} value={attack.anatomy.notes} onChange={event => patch({ anatomy: { ...attack.anatomy, notes: event.target.value } })} /></Field>
    </fieldset>
    <Field label="Notes" help="Describe this attack's inherent nature, area, or any rules needing an author or G.O.D. decision."><textarea className="st-control" rows={2} value={attack.notes} onChange={event => patch({ notes: event.target.value })} /></Field>
    <CreatureAbilityEffectsEditor ability={{ effects: data.onHitEffects }} skillOptions={skillOptions} compact addLabel="Add On-Hit Effect" title="On-Hit Effects"
      note="Author effects intended to follow a successful hit. These definitions are stored for later runtime integration."
      emptyMessage="No on-hit effects authored." onChange={({ effects }) => mechanics({ onHitEffects: effects })} />
    <AttackMagicConstructionEditor value={data.magic} name={attack.attackName} authoringOnly onChange={magic => mechanics({ magic, magical: magic ? true : data.magical })} />
    {validation ? <p role="alert" className={styles.error}>{validation}</p> : null}
  </div>;
}

export function RaceNaturalAttacksEditor({ value, anatomy, skillOptions, onChange }: {
  value: RaceNaturalAttack[]; anatomy: RaceAnatomy | null; skillOptions: Array<{ id: number; name: string }>;
  onChange: (attacks: RaceNaturalAttack[]) => void;
}) {
  const update = (rows: RaceNaturalAttack[]) => onChange(rows.map((row, sortOrder) => ({ ...row, sortOrder })));
  const move = (index: number, delta: number) => { const rows = [...value]; [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]]; update(rows); };
  return <section className={styles.editor} aria-label="Race Natural Attacks">
    <p className="race-help">Inherent attacks belong to the Race&apos;s body or nature. Save them here for later Character integration.</p>
    <button type="button" className="st-button" onClick={() => {
      const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
      update([...value, emptyRaceNaturalAttack(key)]);
    }}>Add Natural Attack</button>
    {!value.length ? <p>No Natural Attacks authored.</p> : null}
    {value.map((attack, index) => <article className={styles.card} key={attack.key} aria-label={`Natural Attack ${index + 1}`}>
      <header><div><h3>{attack.attackName || `Natural Attack ${index + 1}`}</h3><p>{attack.damage || "Damage unspecified"}{attack.damageType ? ` ${attack.damageType}` : ""} · Initiative {attack.authoring.initiativeCost ?? "unspecified"} · {attack.skillName || "Skill unspecified"}</p></div><div className={styles.actions}>
        <button type="button" className="st-button" disabled={index === 0} onClick={() => move(index, -1)}>Move Up</button>
        <button type="button" className="st-button" disabled={index === value.length - 1} onClick={() => move(index, 1)}>Move Down</button>
        <button type="button" className="st-button is-danger" onClick={() => update(value.filter(row => row.key !== attack.key))}>Remove Natural Attack</button>
      </div></header>
      <AttackRow attack={attack} anatomy={anatomy} skillOptions={skillOptions} onChange={changed => update(value.map(row => row.key === attack.key ? changed : row))} />
    </article>)}
  </section>;
}
