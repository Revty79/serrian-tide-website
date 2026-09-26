"use client";

import { GuidedField } from "@/components/field-guidance";
import { createCreatureCanonicalIdentity } from "@/features/creatures/creature-canonical-ids";
import { getCreatureHpPercentageStatus } from "@/features/creatures/creature-size-rules";
import { createHumanoidRaceAnatomy, type RaceAnatomy } from "@/features/races/race-anatomy";
import styles from "./race-anatomy-editor.module.css";

export function RaceAnatomyEditor({ value, onChange, authoringOnly = false }: { value: RaceAnatomy | null; onChange: (value: RaceAnatomy | null) => void; authoringOnly?: boolean }) {
  const allocation = value ? getCreatureHpPercentageStatus(value.hpPools) : null;
  const changePool = (index: number, patch: Partial<RaceAnatomy["hpPools"][number]>) => value && onChange({ ...value, hpPools: value.hpPools.map((pool, i) => i === index ? { ...pool, ...patch } : pool) });
  const changeLocation = (index: number, patch: Partial<RaceAnatomy["hitLocations"][number]>) => value && onChange({ ...value, hitLocations: value.hitLocations.map((location, i) => i === index ? { ...location, ...patch } : location) });
  return <section className={styles.editor} aria-label={authoringOnly ? "Form HP and Hit Locations" : "Race HP and Hit Locations"}>
    <h3>HP &amp; Hit Locations</h3>
    <p>{authoringOnly ? "Define this Form body using the shared HP pools and 0-9 hit results. These definitions do not change Character Anatomy yet." : "Define this Race's body using the same HP pools and 0-9 hit results as Creatures. Total HP still comes from each character's Constitution and HP Multiplier."}</p>
    <GuidedField label="Body layout" className="st-field" help={authoringOnly ? "Choose a standard humanoid Form body or a custom body. This body belongs only to this Form and does not change the Race or any Character." : "Standard humanoid keeps the existing body table. Custom starts with that table so you can add a tail, wings, or other body regions. Changes take effect for characters assigned to this Race after saving. Existing damage and injury records are retained, including removed pools."}>
      <select className="st-control" value={value ? "custom" : "humanoid"} onChange={(event) => onChange(event.target.value === "custom" ? createHumanoidRaceAnatomy() : null)}><option value="humanoid">Standard humanoid</option><option value="custom">{authoringOnly ? "Custom Form anatomy" : "Custom Race anatomy"}</option></select>
    </GuidedField>
    {value ? <>
      <div className={styles.heading}><h4>HP Pools</h4><button className="st-button" type="button" onClick={() => onChange({ ...value, hpPools: [...value.hpPools, { canonicalId: `race-pool-${createCreatureCanonicalIdentity()}`, poolName: "", hpPercentage: null, notes: "", sortOrder: value.hpPools.length }] })}>Add HP Pool</button></div>
      <p>Allocated HP: {allocation!.totalPercentage}%{allocation!.complete ? " · Complete" : " · Pool percentages should total 100%. An incomplete definition can be saved, as with Creatures."}</p>
      <div className={styles.list}>{value.hpPools.map((pool, index) => <article className={styles.pool} key={pool.canonicalId} aria-label={`HP Pool ${index + 1}`}>
        <GuidedField className="st-field" label="Pool Name" help={authoringOnly ? "Name one shared HP pool, such as Tail. Renaming keeps the same body part." : "Name one shared HP pool, such as Tail. Renaming preserves its recorded damage."}><input className="st-control" value={pool.poolName} onChange={(e) => changePool(index, { poolName: e.target.value })} /></GuidedField>
        <GuidedField className="st-field" label="HP %" help="Percentage of each character's Total HP allocated to this pool, rounded up using the existing Creature pool rule. Blank leaves the maximum unavailable; zero means zero HP."><input className="st-control" type="number" min={0} step="any" value={pool.hpPercentage ?? ""} onChange={(e) => changePool(index, { hpPercentage: e.target.value === "" ? null : Number(e.target.value) })} /></GuidedField>
        <GuidedField className="st-field" label="Pool Notes" help="Reference notes for the Race author; these do not create automated effects."><input className="st-control" value={pool.notes} onChange={(e) => changePool(index, { notes: e.target.value })} /></GuidedField>
        <button className="st-button is-danger" type="button" onClick={() => onChange({ ...value, hpPools: value.hpPools.filter((_, i) => i !== index), hitLocations: value.hitLocations.map((location) => location.hpPoolCanonicalId === pool.canonicalId ? { ...location, hpPoolCanonicalId: null } : location) })}>Remove Pool</button>
      </article>)}</div>
      <div className={styles.heading}><h4>Hit Locations 0–9</h4><button className="st-button" type="button" disabled={value.hitLocations.length >= 10} onClick={() => {
        const number = Array.from({ length: 10 }, (_, i) => i).find((number) => !value.hitLocations.some((row) => row.hitLocationNumber === number));
        if (number !== undefined) onChange({ ...value, hitLocations: [...value.hitLocations, { hitLocationNumber: number, locationName: "", bodyPartsIncluded: "", hpPoolCanonicalId: null, locationEffect: "", notes: "", sortOrder: value.hitLocations.length }] });
      }}>Add Location</button></div>
      <p>{authoringOnly ? "Repeated results can use one HP pool. Form protection and attack requirements refer to these body parts. Review them when changing this body." : "Repeated results can use one HP pool. Missing results and unmapped pools cannot receive automatic localized damage. Natural Protection is edited in Mechanics; its coverage follows these roll numbers."}</p>
      <p>Existing armor coverage also uses numbered locations. Review its coverage when changing this table; body names do not automatically refit or remap equipment.</p>
      <div className={styles.list}>{value.hitLocations.map((location, index) => <article className={styles.location} key={index} aria-label={`Hit Location ${index + 1}`}>
        <div className={styles.heading}><h4>Result {location.hitLocationNumber}</h4><button className="st-button is-danger" type="button" onClick={() => onChange({ ...value, hitLocations: value.hitLocations.filter((_, i) => i !== index) })}>Remove Location</button></div>
        <div className={styles.fields}>
          <GuidedField className="st-field" label="Roll #" help="Assign each d10 result from 0 to 9 once."><input className="st-control" type="number" min={0} max={9} value={location.hitLocationNumber} onChange={(e) => changeLocation(index, { hitLocationNumber: Number(e.target.value) })} /></GuidedField>
          <GuidedField className="st-field" label="Location Name" help="Name the body region hit by this result, such as Tail Tip."><input className="st-control" value={location.locationName} onChange={(e) => changeLocation(index, { locationName: e.target.value })} /></GuidedField>
          <GuidedField className="st-field" label="HP Pool" help="Choose the shared pool that takes localized damage here. Several results can use the same pool."><select className="st-control" value={location.hpPoolCanonicalId ?? ""} onChange={(e) => changeLocation(index, { hpPoolCanonicalId: e.target.value || null })}><option value="">None</option>{value.hpPools.map((pool) => <option key={pool.canonicalId} value={pool.canonicalId}>{pool.poolName || "Unnamed Pool"}</option>)}</select></GuidedField>
          <GuidedField className="st-field" label="Body Parts" help="Describe the body parts included in this location. This is descriptive and does not change armor coverage."><input className="st-control" value={location.bodyPartsIncluded} onChange={(e) => changeLocation(index, { bodyPartsIncluded: e.target.value })} /></GuidedField>
          <GuidedField className="st-field" label="Location Effect" help="Record any special rule for this location. It requires a G.O.D. ruling and is not a new automatic effect."><input className="st-control" value={location.locationEffect} onChange={(e) => changeLocation(index, { locationEffect: e.target.value })} /></GuidedField>
          <GuidedField className="st-field" label="Location Notes" help="Additional anatomy reference notes."><textarea className="st-control" rows={2} value={location.notes} onChange={(e) => changeLocation(index, { notes: e.target.value })} /></GuidedField>
        </div>
      </article>)}</div>
    </> : <p>{authoringOnly ? "This Form uses standard humanoid pools and hit locations. Choose Custom Form anatomy to edit them." : "This Race uses the existing humanoid pools and hit locations. Choose Custom Race anatomy to edit them."}</p>}
  </section>;
}
