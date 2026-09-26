"use client";
import { useState, useEffect } from "react";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import { InteractionRulesEditor } from "@/app/heavens/interaction-rules-editor";
import { CreatureAttackAuthoringEditor, CreatureAbilityAuthoringEditor, LegacyCreatureDefenses } from "./creature-authoring-editor";
import { CREATURE_ATTRIBUTE_NAMES as ATTRIBUTES, getCreatureHpPercentageStatus, resolveCreatureHitLocationMaximumHp, resolveCreatureHpModel, resolveEffectiveCreatureStatistics } from "@/features/creatures/creature-size-rules";
import { createCreatureDraftCanonicalId } from "@/features/creatures/creature-canonical-ids";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import { listCreatureSkillCandidates, type CreatureSkillCandidate, type CreatureDraft } from "./actions";
export function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  if (label.includes("Canonical ID")) return null;
  return <GuidedField label={label} help={fieldHelp("creature", label)} className={wide ? "creature-field creature-field--wide" : "creature-field"}>{children}</GuidedField>;
}

export function OptionalNumber({ value, onChange, ...props }: { value: number | null; onChange: (value: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...props} type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
}

export function formatCreatureNumber(value: number | null) {
  return value === null ? "—" : Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

export function Stats({ draft, onChange, only }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void; only?: "attributes" | "movement" }) {
  const effective = resolveEffectiveCreatureStatistics(draft);
  const effectiveAttributes = new Map(effective.attributes.map((row) => [row.attributeKey, row.effectiveValue]));
  const effectiveMovement = new Map(effective.movement.map((row) => [row.movementMode, row.effectiveValue]));
  return <div className="creature-section">
    {!only && <><SectionHeading eyebrow="EXCEPTIONAL CREATURE MODIFIERS" title="Persistent Step Improvements" />
    <div className="creature-form-grid">
      <Field label="HP Multiplier Steps"><input type="number" min={0} step={1} value={draft.core.hpMultiplierSteps} onChange={(e) => onChange({ ...draft, core: { ...draft.core, hpMultiplierSteps: Math.max(0, Math.trunc(Number(e.target.value))) } })} /><small>Resolved multiplier: ×{formatCreatureNumber(effective.hpMultiplier)}</small></Field>
      <Field label="Base Movement Steps"><input type="number" min={0} step={1} value={draft.core.baseMovementSteps} onChange={(e) => onChange({ ...draft, core: { ...draft.core, baseMovementSteps: Math.max(0, Math.trunc(Number(e.target.value))) } })} /><small>Resolved bonus: +{formatCreatureNumber(effective.baseMovementBonus)}</small></Field>
      <Field label="Base Magic Steps"><input type="number" min={0} step={1} value={draft.core.baseMagicSteps} onChange={(e) => onChange({ ...draft, core: { ...draft.core, baseMagicSteps: Math.max(0, Math.trunc(Number(e.target.value))) } })} /><small>Resolved bonus: +{formatCreatureNumber(effective.baseMagicBonus)}</small></Field>
    </div>
    <p className="skill-library__empty">These exceptional modifiers are separate from Size. Each step uses the established Character quarter-step rule.</p>
    </>}
    {only !== "movement" && <><SectionHeading eyebrow="BASE STAT BLOCK" title="Attributes" />
    <div className="creature-row-list">{draft.attributes.map((row, index) => <div className="creature-repeat-row creature-attribute-row" key={row.attributeKey}>
      <select value={row.attributeKey} onChange={(e) => onChange({ ...draft, attributes: draft.attributes.map((entry, i) => i === index ? { ...entry, attributeKey: e.target.value } : entry) })}>{ATTRIBUTES.map((attribute) => <option key={attribute}>{attribute}</option>)}</select>
      <div><OptionalNumber value={row.value} placeholder="Base Value" onChange={(value) => onChange({ ...draft, attributes: draft.attributes.map((entry, i) => i === index ? { ...entry, value } : entry) })} /><small>Effective: {formatCreatureNumber(effectiveAttributes.get(row.attributeKey) ?? null)}</small></div>
      <input placeholder="Notes" value={row.notes} onChange={(e) => onChange({ ...draft, attributes: draft.attributes.map((entry, i) => i === index ? { ...entry, notes: e.target.value } : entry) })} />
    </div>)}</div>
    </>}
    {only !== "attributes" && <><SectionHeading eyebrow="MOBILITY & INITIATIVE" title="Movement Modes" action="Add Movement" onAction={() => onChange({ ...draft, movement: [...draft.movement, { movementMode: "Land", movementValue: null, initiative: null, requirements: "", notes: "", sortOrder: draft.movement.length }] })} />
    <div className="creature-row-list">{draft.movement.map((row, index) => <div className="creature-repeat-row creature-movement-row" key={`${row.movementMode}-${index}`}>
      <input placeholder="Mode" value={row.movementMode} onChange={(e) => patchArray(draft, onChange, "movement", index, { movementMode: e.target.value })} />
      <div><OptionalNumber value={row.movementValue} placeholder="Base Movement" onChange={(value) => patchArray(draft, onChange, "movement", index, { movementValue: value })} /><small>Effective: {formatCreatureNumber(effectiveMovement.get(row.movementMode) ?? null)}</small></div>
      <OptionalNumber value={row.initiative} placeholder="Initiative" onChange={(value) => patchArray(draft, onChange, "movement", index, { initiative: value })} />
      <input placeholder="Requirements" value={row.requirements} onChange={(e) => patchArray(draft, onChange, "movement", index, { requirements: e.target.value })} />
      <input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "movement", index, { notes: e.target.value })} />
      <RemoveButton onClick={() => removeArray(draft, onChange, "movement", index)} />
    </div>)}</div>
    </>}
  </div>;
}

export function HpAndLocations({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const hpModel = resolveCreatureHpModel(draft, draft.hpPools);
  const effective = hpModel.statistics;
  const percentageStatus = getCreatureHpPercentageStatus(draft.hpPools);
  return <div className="creature-section">
    <SectionHeading eyebrow="CALCULATED TOUGHNESS" title="Creature Total HP" />
    <div className="creature-cr-grid">
      <div className="creature-total-hp-stat"><span>Total HP</span><strong>{formatCreatureNumber(hpModel.calculatedTotalHp)}</strong></div>
      <div><span>Effective CON</span><strong>{formatCreatureNumber(effective.effectiveConstitution)}</strong></div>
      <div><span>HP Multiplier</span><strong>×{formatCreatureNumber(effective.hpMultiplier)}</strong></div>
    </div>
    <SectionHeading eyebrow="TOUGHNESS MODEL" title="HP Pools" action="Add HP Pool" onAction={() => onChange({ ...draft, hpPools: [...draft.hpPools, { canonicalId: createCreatureDraftCanonicalId("HP"), poolName: `Pool ${draft.hpPools.length + 1}`, hpPercentage: null, maximumHp: null, notes: "", sortOrder: draft.hpPools.length }] })} />
    <p className={percentageStatus.complete ? "creature-hp-allocation is-complete" : "creature-hp-allocation is-warning"}>Allocated HP: {formatCreatureNumber(percentageStatus.totalPercentage)}%{percentageStatus.complete ? " · Complete" : " · HP Pool percentages should total 100%. You may still save an incomplete Creature."}</p>
    <div className="creature-row-list">{draft.hpPools.map((row, index) => <div className="creature-repeat-row creature-pool-row" key={`${row.canonicalId}-${index}`}>
      <input placeholder="Pool Name" value={row.poolName} onChange={(e) => patchArray(draft, onChange, "hpPools", index, { poolName: e.target.value })} />
      <div><OptionalNumber value={row.hpPercentage} placeholder="HP %" onChange={(value) => patchArray(draft, onChange, "hpPools", index, { hpPercentage: value })} /><small>Maximum HP: {formatCreatureNumber(hpModel.pools[index]?.maximumHp ?? null)}</small></div>
      <input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "hpPools", index, { notes: e.target.value })} />
      <RemoveButton onClick={() => removeArray(draft, onChange, "hpPools", index)} />
    </div>)}</div>
    <SectionHeading eyebrow="D10 LOCATION TABLE" title="Hit Locations 0–9" action="Add Location" onAction={() => {
      const used = new Set(draft.hitLocations.map(({ hitLocationNumber }) => hitLocationNumber));
      const number = Array.from({ length: 10 }, (_, i) => i).find((value) => !used.has(value));
      if (number === undefined) return;
      onChange({ ...draft, hitLocations: [...draft.hitLocations, { hitLocationNumber: number, locationName: "", bodyPartsIncluded: "", hpPoolCanonicalId: draft.hpPools[0]?.canonicalId ?? null, naturalArmor: null, soak: null, locationEffect: "", notes: "", sortOrder: draft.hitLocations.length }] });
    }} />
    <div className="creature-location-cards">{draft.hitLocations.map((row, index) => <article className="creature-location-card" key={`${row.hitLocationNumber}-${index}`}>
      <div className="creature-location-card__header"><strong>Location {row.hitLocationNumber}</strong><RemoveButton onClick={() => removeArray(draft, onChange, "hitLocations", index)} /></div>
      <div className="creature-form-grid">
        <Field label="Roll #"><input type="number" min={0} max={9} value={row.hitLocationNumber} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { hitLocationNumber: Number(e.target.value) })} /></Field>
        <Field label="Location Name"><input value={row.locationName} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { locationName: e.target.value })} /></Field>
        <Field label="Body Parts" wide><input value={row.bodyPartsIncluded} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { bodyPartsIncluded: e.target.value })} /></Field>
        <Field label="HP Pool"><select value={row.hpPoolCanonicalId ?? ""} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { hpPoolCanonicalId: e.target.value || null })}><option value="">None</option>{draft.hpPools.map((pool) => <option key={pool.canonicalId} value={pool.canonicalId}>{pool.poolName}</option>)}</select><small>Maximum HP: {formatCreatureNumber(resolveCreatureHitLocationMaximumHp(row.hpPoolCanonicalId, hpModel.pools))}</small></Field>
        <Field label="Natural Armor"><OptionalNumber value={row.naturalArmor} onChange={(value) => patchArray(draft, onChange, "hitLocations", index, { naturalArmor: value })} /></Field>
        <Field label="Natural Soak"><OptionalNumber value={row.soak} onChange={(value) => patchArray(draft, onChange, "hitLocations", index, { soak: value })} /></Field>
        <Field label="Location Effect" wide><input value={row.locationEffect} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { locationEffect: e.target.value })} /></Field>
        <Field label="Notes" wide><textarea rows={2} value={row.notes} onChange={(e) => patchArray(draft, onChange, "hitLocations", index, { notes: e.target.value })} /></Field>
      </div>
    </article>)}</div>
  </div>;
}

export function Combat({ draft, onChange, attacksOnly = false }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void; attacksOnly?: boolean }) {
  return <div className="creature-section">
    <SectionHeading eyebrow="DIRECT COMBAT" title="Attacks" action="Add Attack" onAction={() => onChange({ ...draft, attacks: [...draft.attacks, { canonicalId: createCreatureDraftCanonicalId("ATK"), attackName: "", attackPercentage: null, damage: null, damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: draft.attacks.length }] })} />
    <div className="creature-card-list">{draft.attacks.map((row, index) => <article className="creature-edit-card" key={`${row.canonicalId}-${index}`}><CardHeader title={row.attackName || `Attack ${index + 1}`} onRemove={() => removeArray(draft, onChange, "attacks", index)} /><CreatureAttackAuthoringEditor authorNativeText={attacksOnly} attack={row} skillOptions={draft.skillLinks.map(({ skillId, skillName }) => ({ id: skillId, name: skillName }))} onChange={(attack) => patchArray(draft, onChange, "attacks", index, attack)} /></article>)}</div>
    {!attacksOnly && <CreatureSkills draft={draft} onChange={onChange} />}
  </div>;
}

export function CreatureSkills({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<CreatureSkillCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const preserveScroll = useInPlaceScrollPreservation();
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => listCreatureSkillCandidates(search).then((rows) => { if (active) setCandidates(rows); }), 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);
  const add = () => {
    const candidate = candidates.find(({ id }) => id === Number(selectedId));
    if (!candidate || draft.skillLinks.some(({ skillId }) => skillId === candidate.id)) return;
    onChange({ ...draft, skillLinks: [...draft.skillLinks, { skillId: candidate.id, skillName: candidate.name, skillClassification: candidate.classification, rank: null, notes: "", sortOrder: draft.skillLinks.length }] });
    setSelectedId("");
  };
  return <>
    <SectionHeading eyebrow="SHARED SKILL LIBRARY" title="Creature Skills" />
    <div className="creature-skill-picker"><Field label="Search"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field><Field label="Matching Skill"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Select a Skill</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}</option>)}</select></Field><button className="skills-primary-button" type="button" disabled={!selectedId} onClick={() => void preserveScroll(add)}>Add Skill</button></div>
    <div className="creature-row-list">{draft.skillLinks.map((row, index) => <div className="creature-repeat-row creature-skill-row" key={`${row.skillId}-${index}`}><div><strong>{row.skillName}</strong><span>{row.skillClassification}</span></div><input placeholder="Rank" value={row.rank ?? ""} onChange={(e) => patchArray(draft, onChange, "skillLinks", index, { rank: e.target.value || null })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patchArray(draft, onChange, "skillLinks", index, { notes: e.target.value })} /><RemoveButton onClick={() => removeArray(draft, onChange, "skillLinks", index)} /></div>)}</div>
  </>;
}

export function Special({ draft, onChange, abilitiesOnly = false }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void; abilitiesOnly?: boolean }) {
  return <div className="creature-section">
    {!abilitiesOnly && <InteractionRulesEditor owner="creature" value={draft.core.interactionRules} onChange={(interactionRules) => onChange({ ...draft, core: { ...draft.core, interactionRules } })} />}
    <SectionHeading eyebrow="SPECIAL MECHANICS" title="Traits & Abilities" action="Add Ability" onAction={() => onChange({ ...draft, abilities: [...draft.abilities, { canonicalId: createCreatureDraftCanonicalId("ABL"), abilityName: "", abilityType: "", activation: "", requirements: "", usesRecharge: "", description: "", mechanicalEffect: "", notes: "", sortOrder: draft.abilities.length, crImpact: "None", effects: [] }] })} />
    <div className="creature-card-list">{draft.abilities.map((row, index) => <article className="creature-edit-card" key={`${row.canonicalId}-${index}`}><CardHeader title={row.abilityName || `Ability ${index + 1}`} onRemove={() => removeArray(draft, onChange, "abilities", index)} /><CreatureAbilityAuthoringEditor authorNativeText={abilitiesOnly} ability={row} skillOptions={draft.skillLinks.map(({ skillId, skillName }) => ({ id: skillId, name: skillName }))} onChange={(ability) => patchArray(draft, onChange, "abilities", index, ability)} /></article>)}</div>
    {!abilitiesOnly && <LegacyCreatureDefenses defenses={draft.defenses} />}
  </div>;
}

export function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  const preserveScroll = useInPlaceScrollPreservation();
  return <div className="creature-subheading"><div><p>{eyebrow}</p><h3>{title}</h3></div>{action && onAction ? <button type="button" onClick={() => void preserveScroll(onAction)}>{action}</button> : null}</div>;
}
function CardHeader({ title, onRemove }: { title: string; onRemove: () => void }) { return <header className="creature-edit-card__header"><strong>{title}</strong><RemoveButton onClick={onRemove} /></header>; }
function RemoveButton({ onClick }: { onClick: () => void }) {
  const preserveScroll = useInPlaceScrollPreservation();
  return <button className="is-danger" type="button" onClick={() => void preserveScroll(onClick)}>Remove</button>;
}

function patchArray<K extends "movement" | "hpPools" | "hitLocations" | "attacks" | "skillLinks" | "abilities" | "defenses" | "uses">(
  draft: CreatureDraft,
  onChange: (draft: CreatureDraft) => void,
  key: K,
  index: number,
  update: Partial<CreatureDraft[K][number]>,
) {
  const rows = draft[key].map((row, i) => i === index ? { ...row, ...update } : row) as CreatureDraft[K];
  onChange({ ...draft, [key]: rows });
}

function removeArray<K extends "movement" | "hpPools" | "hitLocations" | "attacks" | "skillLinks" | "abilities" | "defenses" | "uses">(
  draft: CreatureDraft,
  onChange: (draft: CreatureDraft) => void,
  key: K,
  index: number,
) {
  const rows = draft[key].filter((_, i) => i !== index) as CreatureDraft[K];
  onChange({ ...draft, [key]: rows });
}
