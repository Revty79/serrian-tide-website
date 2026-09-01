"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  listCreatureSkillCandidates,
  type CreatureDraft,
  type CreatureSkillCandidate,
} from "@/app/heavens/creatures/actions";
import {
  CREATURE_CR_IMPACTS,
  CREATURE_SIZE_OPTIONS,
  type CreatureCrImpact,
} from "@/db/creature-schema";
import {
  getCreatureNpc,
  saveCreatureNpc,
  type CreatureNpcDraft,
} from "../actions";
import { ActiveHealthPanel } from "@/app/characters/active-health-panel";
import { ActiveEffectsPanel } from "@/app/characters/active-effects-panel";
import { getActiveHealth } from "@/app/characters/active-health-actions";
import { getActiveEffects } from "@/app/characters/active-effects-actions";
import type { ActiveHealthView } from "@/features/active-state/models";
import type { ActiveEffectsView } from "@/features/active-state/active-effects";
import {
  resolveCreatureHpPoolMaximum,
  resolveCreatureTotalMaximumHp,
  resolveEffectiveCreatureStatistics,
} from "@/features/creatures/creature-size-rules";
import {
  createDraftOwnedItemInstances,
  getItemChargeDisplay,
  getItemOwnershipStrategy,
  getStartingItemInstanceCharges,
} from "@/features/items/item-ownership";
import { getItemUseActivatability } from "@/features/items/item-use";
import { ItemUseDialog } from "@/app/characters/item-use-dialog";
import { EquipmentStatePanel } from "@/app/characters/equipment-state-panel";
import { getCharacterEquipmentState } from "@/app/characters/equipment-state-actions";
import type { CharacterEquipmentStateView } from "@/features/items/equipment-state";
import { ItemChargePanel } from "@/app/characters/item-charge-panel";
import { getCharacterItemChargeState } from "@/app/characters/item-charge-actions";
import type { CharacterItemChargeStateView } from "@/features/items/item-charge";
import { CreatureAbilityEffectsEditor } from "@/app/heavens/creatures/creature-ability-effects-editor";
import { CreatureAbilityUseDialog } from "../creature-ability-use-dialog";

type Tab = "identity" | "current" | "stats" | "hp" | "combat" | "special" | "inventory" | "preview";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "identity", label: "Individual" },
  { id: "current", label: "Current State" },
  { id: "stats", label: "Attributes & Movement" },
  { id: "hp", label: "HP & Locations" },
  { id: "combat", label: "Attacks & Skills" },
  { id: "special", label: "Abilities & Defenses" },
  { id: "inventory", label: "Inventory" },
  { id: "preview", label: "Preview" },
];

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "creature-npc-field creature-npc-field--wide" : "creature-npc-field"}><span>{label}</span>{children}</label>;
}
function OptionalNumber({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <input type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
}

function formatCreatureNumber(value: number | null) {
  return value === null ? "—" : Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

export function CreatureNpcWorkspace({ initialDraft, initialActiveHealth, initialActiveEffects, initialEquipmentState, initialChargeState }: { initialDraft: CreatureNpcDraft; initialActiveHealth: ActiveHealthView; initialActiveEffects: ActiveEffectsView; initialEquipmentState: CharacterEquipmentStateView; initialChargeState: CharacterItemChargeStateView }) {
  const [draft, setDraft] = useState(initialDraft);
  const [activeHealth, setActiveHealth] = useState(initialActiveHealth);
  const [activeEffects, setActiveEffects] = useState(initialActiveEffects);
  const [equipmentState, setEquipmentState] = useState(initialEquipmentState);
  const [chargeState, setChargeState] = useState(initialChargeState);
  const [tab, setTab] = useState<Tab>("identity");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  function change(next: CreatureNpcDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }
  function changeSnapshot(next: CreatureDraft) {
    change({ ...draft, currentSnapshot: next });
  }
  function acceptChargeState(next: CharacterItemChargeStateView) {
    const charges = new Map(next.instances.map((entry) => [entry.instanceId, entry.currentCharges]));
    setChargeState(next);
    setDraft((current) => ({
      ...current,
      itemInstances: current.itemInstances.map((entry) => ({
        ...entry,
        currentCharges: entry.instanceId === null ? entry.currentCharges : charges.get(entry.instanceId) ?? entry.currentCharges,
      })),
    }));
    setEquipmentState((current) => ({
      ...current,
      instances: current.instances.map((entry) => ({
        ...entry,
        currentCharges: charges.get(entry.instanceId) ?? entry.currentCharges,
      })),
    }));
  }
  async function persist() {
    setSaving(true); setFeedback(null);
    try {
      const saved = await saveCreatureNpc(draft);
      const [refreshedHealth, refreshedEquipment, refreshedCharges] = await Promise.all([
        getActiveHealth(draft.characterId),
        getCharacterEquipmentState(draft.characterId),
        getCharacterItemChargeState(draft.characterId),
      ]);
      setDraft(saved);
      setActiveHealth(refreshedHealth);
      setEquipmentState(refreshedEquipment);
      setChargeState(refreshedCharges);
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.name} was saved. The ${saved.creatureName} master Creature was not changed.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Creature NPC could not be saved." });
    } finally { setSaving(false); }
  }

  async function refreshRuntimeState() {
    const [refreshed, refreshedHealth, refreshedEffects, refreshedEquipment, refreshedCharges] = await Promise.all([
      getCreatureNpc(draft.characterId),
      getActiveHealth(draft.characterId),
      getActiveEffects(draft.characterId, true),
      getCharacterEquipmentState(draft.characterId),
      getCharacterItemChargeState(draft.characterId),
    ]);
    setDraft(refreshed);
    setActiveHealth(refreshedHealth);
    setActiveEffects(refreshedEffects);
    setEquipmentState(refreshedEquipment);
    setChargeState(refreshedCharges);
    setDirty(false);
    setFeedback({ kind: "success", message: "The Creature NPC and its Active State were refreshed." });
  }

  return <main className="creature-npc-page">
    <header className="creature-npc-header"><Link href={`/heavens/npcs?campaign=${draft.campaignId}`} className="font-evanescent creature-npc-logo">SERRIAN<br />TIDE</Link><div><p>THE HEAVENS / NPCS / CREATURE INDIVIDUAL</p><h1 className="font-sans">{draft.name}</h1><span>{draft.campaignName} · Template: {draft.creatureName}</span></div><nav><Link href={`/heavens/npcs?campaign=${draft.campaignId}`}>← NPC Master Sheet</Link><button type="button" disabled={!dirty || saving} onClick={() => void persist()}>{saving ? "Saving…" : "Save Individual"}</button></nav></header>
    {feedback ? <p className={`creature-npc-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <section className="creature-npc-warning"><strong>Independent Creature NPC</strong><span>This record began as a snapshot of <b>{draft.creatureName}</b>. Changes here never alter the master Creature library.</span></section>
    <div className="creature-npc-layout"><nav className="creature-npc-tabs">{TABS.map((entry) => <button type="button" key={entry.id} className={tab === entry.id ? "is-active" : ""} onClick={() => setTab(entry.id)}>{entry.label}</button>)}</nav><section className="creature-npc-editor">
      {tab === "identity" ? <Identity draft={draft} onChange={change} /> : null}
      {tab === "current" ? <><ActiveHealthPanel health={activeHealth} onHealthChange={setActiveHealth} context="creature" /><ActiveEffectsPanel state={activeEffects} godMode skillOptions={draft.currentSnapshot.skillLinks.map(({ skillId, skillName }) => ({ id: skillId, name: skillName }))} movementModes={draft.currentSnapshot.movement.map(({ movementMode }) => movementMode)} onChange={setActiveEffects} /><EquipmentStatePanel state={equipmentState} disabled={dirty || saving} includeEffectHistory onChange={setEquipmentState} onActiveEffectsChange={setActiveEffects} /><ItemChargePanel state={chargeState} disabled={dirty || saving} onChange={acceptChargeState} /></> : null}
      {tab === "stats" ? <Stats snapshot={draft.currentSnapshot} onChange={changeSnapshot} /> : null}
      {tab === "hp" ? <Hp snapshot={draft.currentSnapshot} hpAdjustment={draft.hpAdjustment} onChange={changeSnapshot} /> : null}
      {tab === "combat" ? <Combat snapshot={draft.currentSnapshot} onChange={changeSnapshot} /> : null}
      {tab === "special" ? <Special characterId={draft.characterId} snapshot={draft.currentSnapshot} disabled={dirty || saving} onChange={changeSnapshot} onComplete={refreshRuntimeState} /> : null}
      {tab === "inventory" ? <><Inventory draft={draft} onChange={change} /><ActivatedCreatureItems draft={draft} disabled={dirty || saving} onComplete={refreshRuntimeState} /></> : null}
      {tab === "preview" ? <Preview draft={draft} /> : null}
    </section></div>
  </main>;
}

function Identity({ draft, onChange }: { draft: CreatureNpcDraft; onChange: (draft: CreatureNpcDraft) => void }) {
  const core = draft.currentSnapshot.core;
  return <div className="creature-npc-section creature-npc-form-grid"><SectionHeading eyebrow="INDIVIDUAL RECORD" title="Identity & Personality" wide /><Field label="NPC Name" wide><input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} /></Field><Field label="Master Creature"><input disabled value={draft.creatureName} /></Field><Field label="Template Canonical ID"><input disabled value={core.canonicalId} /></Field><Field label="Final Individual HP Adjustment"><input type="number" value={draft.hpAdjustment} onChange={(e) => onChange({ ...draft, hpAdjustment: Number(e.target.value) })} /></Field><Field label="Size"><select value={core.size} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, size: e.target.value } } })}>{CREATURE_SIZE_OPTIONS.map((size) => <option key={size}>{size}</option>)}</select></Field><Field label="HP Multiplier Steps"><input type="number" min={0} step={1} value={core.hpMultiplierSteps} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, hpMultiplierSteps: Math.max(0, Math.trunc(Number(e.target.value))) } } })} /></Field><Field label="Base Movement Steps"><input type="number" min={0} step={1} value={core.baseMovementSteps} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, baseMovementSteps: Math.max(0, Math.trunc(Number(e.target.value))) } } })} /></Field><Field label="Base Magic Steps"><input type="number" min={0} step={1} value={core.baseMagicSteps} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, baseMagicSteps: Math.max(0, Math.trunc(Number(e.target.value))) } } })} /></Field><Field label="Family"><input value={core.family} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, family: e.target.value } } })} /></Field><Field label="Creature Type"><input value={core.creatureType} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, creatureType: e.target.value } } })} /></Field><p className="creature-npc-field--wide creature-npc-runtime-note">Size scales the six effective Attributes. Exceptional steps remain independent and use the established Character quarter-step rules; HP Adjustment is applied last to this NPC only.</p><Field label="Personality" wide><textarea rows={6} value={draft.personality} onChange={(e) => onChange({ ...draft, personality: e.target.value })} /></Field><Field label="Instance Notes" wide><textarea rows={6} value={draft.instanceNotes} onChange={(e) => onChange({ ...draft, instanceNotes: e.target.value })} /></Field><Field label="Individual Description" wide><textarea rows={6} value={core.description} onChange={(e) => onChange({ ...draft, currentSnapshot: { ...draft.currentSnapshot, core: { ...core, description: e.target.value } } })} /></Field></div>;
}

function Stats({ snapshot, onChange }: { snapshot: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const effective = resolveEffectiveCreatureStatistics(snapshot);
  const effectiveAttributes = new Map(effective.attributes.map((row) => [row.attributeKey, row.effectiveValue]));
  const effectiveMovement = new Map(effective.movement.map((row) => [row.movementMode, row.effectiveValue]));
  return <div className="creature-npc-section"><SectionHeading eyebrow="INDIVIDUAL STAT BLOCK" title={`Attributes · ${effective.size} ×${formatCreatureNumber(effective.sizeMultiplier)}`} /><div className="creature-npc-row-list">{snapshot.attributes.map((row, index) => <div className="creature-npc-repeat creature-npc-attribute" key={`${row.attributeKey}-${index}`}><input value={row.attributeKey} onChange={(e) => patch(snapshot, onChange, "attributes", index, { attributeKey: e.target.value })} /><div><OptionalNumber value={row.value} onChange={(value) => patch(snapshot, onChange, "attributes", index, { value })} /><small>Base {formatCreatureNumber(row.value)} · Effective {formatCreatureNumber(effectiveAttributes.get(row.attributeKey) ?? null)}</small></div><input placeholder="Notes" value={row.notes} onChange={(e) => patch(snapshot, onChange, "attributes", index, { notes: e.target.value })} /></div>)}</div><SectionHeading eyebrow="MOVEMENT & INITIATIVE" title="Movement Modes" action="Add Movement" onAction={() => onChange({ ...snapshot, movement: [...snapshot.movement, { movementMode: "Land", movementValue: null, initiative: null, requirements: "", notes: "", sortOrder: snapshot.movement.length }] })} /><div className="creature-npc-row-list">{snapshot.movement.map((row, index) => <div className="creature-npc-repeat creature-npc-movement" key={index}><input placeholder="Mode" value={row.movementMode} onChange={(e) => patch(snapshot, onChange, "movement", index, { movementMode: e.target.value })} /><div><OptionalNumber value={row.movementValue} onChange={(value) => patch(snapshot, onChange, "movement", index, { movementValue: value })} /><small>Base {formatCreatureNumber(row.movementValue)} · Effective {formatCreatureNumber(effectiveMovement.get(row.movementMode) ?? null)}</small></div><OptionalNumber value={row.initiative} onChange={(value) => patch(snapshot, onChange, "movement", index, { initiative: value })} /><input placeholder="Requirements" value={row.requirements} onChange={(e) => patch(snapshot, onChange, "movement", index, { requirements: e.target.value })} /><button type="button" onClick={() => remove(snapshot, onChange, "movement", index)}>Remove</button></div>)}</div></div>;
}

function Hp({ snapshot, hpAdjustment, onChange }: { snapshot: CreatureDraft; hpAdjustment: number; onChange: (draft: CreatureDraft) => void }) {
  const effective = resolveEffectiveCreatureStatistics(snapshot);
  const totalMaximumHp = resolveCreatureTotalMaximumHp(snapshot, hpAdjustment);
  return <div className="creature-npc-section"><SectionHeading eyebrow="CALCULATED TOUGHNESS" title="Creature Total HP" /><div className="creature-npc-summary-grid"><div><span>Effective CON</span><strong>{formatCreatureNumber(effective.effectiveConstitution)}</strong></div><div><span>HP Multiplier</span><strong>×{formatCreatureNumber(effective.hpMultiplier)}</strong></div><div><span>Calculated HP</span><strong>{formatCreatureNumber(effective.calculatedTotalMaximumHp)}</strong></div><div><span>Individual Adjustment</span><strong>{hpAdjustment >= 0 ? "+" : ""}{formatCreatureNumber(hpAdjustment)}</strong></div><div><span>Final Total HP</span><strong>{formatCreatureNumber(totalMaximumHp)}</strong></div></div><SectionHeading eyebrow="TOUGHNESS" title="HP Pools" action="Add Pool" onAction={() => onChange({ ...snapshot, hpPools: [...snapshot.hpPools, { canonicalId: `${snapshot.core.canonicalId}-npc-hp-${snapshot.hpPools.length + 1}`, poolName: `Pool ${snapshot.hpPools.length + 1}`, hpPercentage: null, notes: "", sortOrder: snapshot.hpPools.length }] })} /><div className="creature-npc-row-list">{snapshot.hpPools.map((row, index) => <div className="creature-npc-repeat creature-npc-pool" key={index}><input value={row.canonicalId} onChange={(e) => patch(snapshot, onChange, "hpPools", index, { canonicalId: e.target.value })} /><input value={row.poolName} onChange={(e) => patch(snapshot, onChange, "hpPools", index, { poolName: e.target.value })} /><div><OptionalNumber value={row.hpPercentage} onChange={(value) => patch(snapshot, onChange, "hpPools", index, { hpPercentage: value })} /><small>Maximum {formatCreatureNumber(resolveCreatureHpPoolMaximum(totalMaximumHp, row.hpPercentage))}</small></div><button type="button" onClick={() => remove(snapshot, onChange, "hpPools", index)}>Remove</button></div>)}</div><SectionHeading eyebrow="D10 LOCATIONS" title="Hit Locations 0–9" action="Add Location" onAction={() => { const used = new Set(snapshot.hitLocations.map(({ hitLocationNumber }) => hitLocationNumber)); const next = Array.from({ length: 10 }, (_, i) => i).find((value) => !used.has(value)); if (next !== undefined) onChange({ ...snapshot, hitLocations: [...snapshot.hitLocations, { hitLocationNumber: next, locationName: "", bodyPartsIncluded: "", hpPoolCanonicalId: snapshot.hpPools[0]?.canonicalId ?? null, naturalArmor: null, soak: null, locationEffect: "", notes: "", sortOrder: snapshot.hitLocations.length }] }); }} /><div className="creature-npc-card-list">{snapshot.hitLocations.map((row, index) => <article key={index}><header><strong>Location {row.hitLocationNumber} · {row.locationName || "Unnamed"}</strong><button type="button" onClick={() => remove(snapshot, onChange, "hitLocations", index)}>Remove</button></header><div className="creature-npc-form-grid"><Field label="Roll #"><input type="number" min={0} max={9} value={row.hitLocationNumber} onChange={(e) => patch(snapshot, onChange, "hitLocations", index, { hitLocationNumber: Number(e.target.value) })} /></Field><Field label="Name"><input value={row.locationName} onChange={(e) => patch(snapshot, onChange, "hitLocations", index, { locationName: e.target.value })} /></Field><Field label="HP Pool"><select value={row.hpPoolCanonicalId ?? ""} onChange={(e) => patch(snapshot, onChange, "hitLocations", index, { hpPoolCanonicalId: e.target.value || null })}><option value="">None</option>{snapshot.hpPools.map((pool) => <option key={pool.canonicalId} value={pool.canonicalId}>{pool.poolName}</option>)}</select></Field><Field label="Natural Armor"><OptionalNumber value={row.naturalArmor} onChange={(value) => patch(snapshot, onChange, "hitLocations", index, { naturalArmor: value })} /></Field><Field label="Soak"><OptionalNumber value={row.soak} onChange={(value) => patch(snapshot, onChange, "hitLocations", index, { soak: value })} /></Field><Field label="Body Parts" wide><input value={row.bodyPartsIncluded} onChange={(e) => patch(snapshot, onChange, "hitLocations", index, { bodyPartsIncluded: e.target.value })} /></Field><Field label="Effect" wide><input value={row.locationEffect} onChange={(e) => patch(snapshot, onChange, "hitLocations", index, { locationEffect: e.target.value })} /></Field></div></article>)}</div></div>;
}

function Combat({ snapshot, onChange }: { snapshot: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const [skillSearch, setSkillSearch] = useState(""); const [candidates, setCandidates] = useState<CreatureSkillCandidate[]>([]); const [skillId, setSkillId] = useState("");
  useEffect(() => { let active = true; const timer = window.setTimeout(() => listCreatureSkillCandidates(skillSearch).then((rows) => { if (active) setCandidates(rows); }), 160); return () => { active = false; window.clearTimeout(timer); }; }, [skillSearch]);
  return <div className="creature-npc-section"><SectionHeading eyebrow="DIRECT COMBAT" title="Attacks" action="Add Attack" onAction={() => onChange({ ...snapshot, attacks: [...snapshot.attacks, { canonicalId: `${snapshot.core.canonicalId}-npc-attack-${snapshot.attacks.length + 1}`, attackName: "", attackPercentage: null, damage: null, damageType: "", rangeReach: "", requiredAnatomy: "", requirements: "", usesRecharge: "", specialEffect: "", notes: "", sortOrder: snapshot.attacks.length }] })} /><div className="creature-npc-card-list">{snapshot.attacks.map((row, index) => <article key={index}><header><strong>{row.attackName || `Attack ${index + 1}`}</strong><button type="button" onClick={() => remove(snapshot, onChange, "attacks", index)}>Remove</button></header><div className="creature-npc-form-grid"><Field label="Name"><input value={row.attackName} onChange={(e) => patch(snapshot, onChange, "attacks", index, { attackName: e.target.value })} /></Field><Field label="Attack %"><OptionalNumber value={row.attackPercentage} onChange={(value) => patch(snapshot, onChange, "attacks", index, { attackPercentage: value })} /></Field><Field label="Damage"><input value={row.damage ?? ""} onChange={(e) => patch(snapshot, onChange, "attacks", index, { damage: e.target.value || null })} /></Field><Field label="Damage Type"><input value={row.damageType} onChange={(e) => patch(snapshot, onChange, "attacks", index, { damageType: e.target.value })} /></Field><Field label="Range / Reach"><input value={row.rangeReach} onChange={(e) => patch(snapshot, onChange, "attacks", index, { rangeReach: e.target.value })} /></Field><Field label="Special Effect" wide><textarea rows={3} value={row.specialEffect} onChange={(e) => patch(snapshot, onChange, "attacks", index, { specialEffect: e.target.value })} /></Field></div></article>)}</div><SectionHeading eyebrow="CANONICAL SKILLS" title="Skill Links" /><div className="creature-npc-skill-add"><input value={skillSearch} placeholder="Search Skills" onChange={(e) => setSkillSearch(e.target.value)} /><select value={skillId} onChange={(e) => setSkillId(e.target.value)}><option value="">Choose Skill</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}</option>)}</select><button type="button" disabled={!skillId} onClick={() => { const candidate = candidates.find(({ id }) => id === Number(skillId)); if (candidate && !snapshot.skillLinks.some(({ skillId: id }) => id === candidate.id)) { onChange({ ...snapshot, skillLinks: [...snapshot.skillLinks, { skillId: candidate.id, skillName: candidate.name, skillClassification: candidate.classification, rank: null, notes: "", sortOrder: snapshot.skillLinks.length }] }); setSkillId(""); } }}>Add Skill</button></div><div className="creature-npc-row-list">{snapshot.skillLinks.map((row, index) => <div className="creature-npc-repeat creature-npc-skill" key={row.skillId}><div><strong>{row.skillName}</strong><span>{row.skillClassification}</span></div><input placeholder="Rank" value={row.rank ?? ""} onChange={(e) => patch(snapshot, onChange, "skillLinks", index, { rank: e.target.value || null })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patch(snapshot, onChange, "skillLinks", index, { notes: e.target.value })} /><button type="button" onClick={() => remove(snapshot, onChange, "skillLinks", index)}>Remove</button></div>)}</div></div>;
}

function Special({ characterId, snapshot, disabled, onChange, onComplete }: { characterId: number; snapshot: CreatureDraft; disabled: boolean; onChange: (draft: CreatureDraft) => void; onComplete: () => void | Promise<void> }) {
  return <div className="creature-npc-section"><SectionHeading eyebrow="SPECIAL MECHANICS" title="Abilities" action="Add Ability" onAction={() => onChange({ ...snapshot, abilities: [...snapshot.abilities, { canonicalId: `${snapshot.core.canonicalId}-npc-ability-${snapshot.abilities.length + 1}`, abilityName: "", abilityType: "", activation: "", requirements: "", usesRecharge: "", description: "", mechanicalEffect: "", notes: "", sortOrder: snapshot.abilities.length, crImpact: "None", effects: [] }] })} /><p className="creature-npc-runtime-note">Ability use is authoritative from the saved Current Snapshot. Save individual edits before resolving an ability.</p><div className="creature-npc-card-list">{snapshot.abilities.map((row, index) => <article key={row.canonicalId || index}><header><strong>{row.abilityName || `Ability ${index + 1}`}</strong><div><CreatureAbilityUseDialog sourceCharacterId={characterId} ability={row} disabled={disabled} onComplete={onComplete} /><button type="button" onClick={() => remove(snapshot, onChange, "abilities", index)}>Remove</button></div></header><div className="creature-npc-form-grid"><Field label="Name"><input value={row.abilityName} onChange={(e) => patch(snapshot, onChange, "abilities", index, { abilityName: e.target.value })} /></Field><Field label="Canonical ID"><input value={row.canonicalId} onChange={(e) => patch(snapshot, onChange, "abilities", index, { canonicalId: e.target.value })} /></Field><Field label="Type"><input value={row.abilityType} onChange={(e) => patch(snapshot, onChange, "abilities", index, { abilityType: e.target.value })} /></Field><Field label="Activation"><input value={row.activation} onChange={(e) => patch(snapshot, onChange, "abilities", index, { activation: e.target.value })} /></Field><Field label="CR Impact"><select value={row.crImpact} onChange={(e) => patch(snapshot, onChange, "abilities", index, { crImpact: e.target.value as CreatureCrImpact })}>{CREATURE_CR_IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}</select></Field><Field label="Uses / Recharge"><input value={row.usesRecharge} onChange={(e) => patch(snapshot, onChange, "abilities", index, { usesRecharge: e.target.value })} /></Field><Field label="Requirements" wide><input value={row.requirements} onChange={(e) => patch(snapshot, onChange, "abilities", index, { requirements: e.target.value })} /></Field><Field label="Description" wide><textarea rows={3} value={row.description} onChange={(e) => patch(snapshot, onChange, "abilities", index, { description: e.target.value })} /></Field><Field label="Mechanical Notes (Legacy Text)" wide><textarea rows={3} value={row.mechanicalEffect} onChange={(e) => patch(snapshot, onChange, "abilities", index, { mechanicalEffect: e.target.value })} /></Field><Field label="Notes" wide><textarea rows={2} value={row.notes} onChange={(e) => patch(snapshot, onChange, "abilities", index, { notes: e.target.value })} /></Field></div><CreatureAbilityEffectsEditor ability={row} skillOptions={snapshot.skillLinks.map(({ skillId, skillName }) => ({ id: skillId, name: skillName }))} onChange={(ability) => patch(snapshot, onChange, "abilities", index, { ...ability, crImpact: row.crImpact })} /></article>)}</div><SectionHeading eyebrow="DEFENSE" title="Defenses" action="Add Defense" onAction={() => onChange({ ...snapshot, defenses: [...snapshot.defenses, { seedIdentity: null, defenseType: "", against: "", value: null, notes: "", sortOrder: snapshot.defenses.length, crImpact: "None" }] })} /><div className="creature-npc-row-list">{snapshot.defenses.map((row, index) => <div className="creature-npc-repeat creature-npc-defense" key={index}><input placeholder="Type" value={row.defenseType} onChange={(e) => patch(snapshot, onChange, "defenses", index, { defenseType: e.target.value })} /><input placeholder="Against" value={row.against} onChange={(e) => patch(snapshot, onChange, "defenses", index, { against: e.target.value })} /><input placeholder="Value" value={row.value ?? ""} onChange={(e) => patch(snapshot, onChange, "defenses", index, { value: e.target.value || null })} /><select value={row.crImpact} onChange={(e) => patch(snapshot, onChange, "defenses", index, { crImpact: e.target.value as CreatureCrImpact })}>{CREATURE_CR_IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}</select><button type="button" onClick={() => remove(snapshot, onChange, "defenses", index)}>Remove</button></div>)}</div><SectionHeading eyebrow="UTILITY" title="Uses" action="Add Use" onAction={() => onChange({ ...snapshot, uses: [...snapshot.uses, { seedIdentity: null, useName: "", notes: "", sortOrder: snapshot.uses.length }] })} /><div className="creature-npc-row-list">{snapshot.uses.map((row, index) => <div className="creature-npc-repeat creature-npc-use" key={index}><input placeholder="Use Name" value={row.useName} onChange={(e) => patch(snapshot, onChange, "uses", index, { useName: e.target.value })} /><input placeholder="Notes" value={row.notes} onChange={(e) => patch(snapshot, onChange, "uses", index, { notes: e.target.value })} /><button type="button" onClick={() => remove(snapshot, onChange, "uses", index)}>Remove</button></div>)}</div></div>;
}

function Inventory({ draft, onChange }: { draft: CreatureNpcDraft; onChange: (draft: CreatureNpcDraft) => void }) {
  const [search, setSearch] = useState(""); const [itemId, setItemId] = useState("");
  const nextInstanceDraftId = useRef(-3_000_000);
  const visible = useMemo(() => draft.authorizedItems.filter((entry) => !search || [entry.name, entry.category, entry.canonicalId].some((value) => value.toLowerCase().includes(search.toLowerCase()))).slice(0, 100), [draft.authorizedItems, search]);
  function addSelectedItem() {
    const selected = draft.authorizedItems.find(({ id }) => id === Number(itemId));
    if (!selected) return;
    if (getItemOwnershipStrategy(selected.runtimeProfile) === "instance") {
      const [created] = createDraftOwnedItemInstances({
        itemId: selected.id,
        quantity: 1,
        unitCostCredits: selected.credits ?? 0,
        runtimeProfile: selected.runtimeProfile,
        createDraftId: () => nextInstanceDraftId.current--,
      });
      onChange({
        ...draft,
        itemInstances: [...draft.itemInstances, {
          ...created,
          currentCharges: getStartingItemInstanceCharges(selected.runtimeProfile),
          acquiredAt: null,
        }],
      });
    } else {
      const existing = draft.items.find((entry) => entry.itemId === selected.id);
      onChange({
        ...draft,
        items: existing
          ? draft.items.map((entry) => entry.itemId === selected.id ? { ...entry, quantity: entry.quantity + 1 } : entry)
          : [...draft.items, { itemId: selected.id, quantity: 1, unitCostCredits: selected.credits ?? 0 }],
      });
    }
    setItemId("");
  }
  return <div className="creature-npc-section"><SectionHeading eyebrow="CAMPAIGN-AUTHORIZED POSSESSIONS" title="Inventory" /><div className="creature-npc-skill-add"><input type="search" value={search} placeholder="Search Items" onChange={(e) => setSearch(e.target.value)} /><select value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Choose Item</option>{visible.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.catalogScope}{entry.equipmentGroup ? `/${entry.equipmentGroup}` : ""}</option>)}</select><button type="button" disabled={!itemId} onClick={addSelectedItem}>Add</button></div><div className="creature-npc-inventory">{draft.items.map((owned) => { const source = draft.authorizedItems.find(({ id }) => id === owned.itemId); return <article key={owned.itemId}><div><strong>{source?.name ?? `Item ${owned.itemId}`}</strong><span>{source?.category ?? ""} · Stack</span></div><input type="number" min={1} step={1} value={owned.quantity} onChange={(e) => onChange({ ...draft, items: draft.items.map((entry) => entry.itemId === owned.itemId ? { ...entry, quantity: Math.max(1, Math.trunc(Number(e.target.value))) } : entry) })} /><button type="button" onClick={() => onChange({ ...draft, items: draft.items.filter((entry) => entry.itemId !== owned.itemId) })}>Remove</button></article>; })}{draft.itemInstances.map((owned, index) => { const source = draft.authorizedItems.find(({ id }) => id === owned.itemId); const chargeDisplay = getItemChargeDisplay({ currentCharges: owned.currentCharges, maximumCharges: source?.runtimeProfile.maximumCharges ?? null }); return <article key={owned.draftId} className="is-instance"><div><strong>{source?.name ?? `Item ${owned.itemId}`}</strong><span>{source?.isMagical ? "Magical · Charged" : "Charged"} · {owned.instanceId === null ? `New copy ${index + 1}` : `Copy #${owned.instanceId}`}</span>{chargeDisplay.exceedsCurrentMaximum ? <small>Above current template maximum; saved state preserved.</small> : null}</div><strong>{chargeDisplay.label}</strong><button type="button" onClick={() => onChange({ ...draft, itemInstances: draft.itemInstances.filter((entry) => entry.draftId !== owned.draftId) })}>Remove this copy</button></article>; })}</div></div>;
}

function ActivatedCreatureItems({ draft, disabled, onComplete }: { draft: CreatureNpcDraft; disabled: boolean; onComplete: () => void | Promise<void> }) {
  const stacks = draft.items.flatMap((owned) => {
    const definition = draft.authorizedItems.find(({ id }) => id === owned.itemId);
    return definition && getItemUseActivatability(definition.runtimeProfile, definition.effectCount).executable
      ? [{ owned, definition }]
      : [];
  });
  const instances = draft.itemInstances.flatMap((owned) => {
    if (owned.instanceId === null) return [];
    const definition = draft.authorizedItems.find(({ id }) => id === owned.itemId);
    return definition && getItemUseActivatability(definition.runtimeProfile, definition.effectCount).executable
      ? [{ owned, definition }]
      : [];
  });
  const unavailable = [
    ...draft.items.map(({ itemId }) => itemId),
    ...draft.itemInstances.map(({ itemId }) => itemId),
  ].filter((itemId, index, values) => values.indexOf(itemId) === index).flatMap((itemId) => {
    const definition = draft.authorizedItems.find(({ id }) => id === itemId);
    return definition && definition.runtimeProfile.useMode !== "none" && definition.effectCount <= 0
      ? [definition]
      : [];
  });
  if (!stacks.length && !instances.length && !unavailable.length) return null;
  return <section className="creature-npc-section creature-npc-activated-items">
    <SectionHeading eyebrow="ACTIVE POSSESSIONS" title="Activated Items" />
    <p>Preview the exact resource and Active Health changes before confirming.</p>
    {disabled ? <small>Save or discard pending Creature NPC edits before using an Item.</small> : null}
    <div className="creature-npc-activated-grid">
      {stacks.map(({ owned, definition }) => <article key={`stack-${owned.itemId}`}><div><strong>{definition.name}</strong><span>{owned.quantity} owned · {definition.runtimeProfile.useMode === "unlimited" ? "Unlimited" : `${definition.runtimeProfile.quantityPerUse} per use`}</span></div><ItemUseDialog sourceCharacterId={draft.characterId} itemId={owned.itemId} itemInstanceId={null} itemName={definition.name} activationLabel={definition.runtimeProfile.activationLabel} disabled={disabled} onComplete={onComplete} /></article>)}
      {instances.map(({ owned, definition }) => {
        const chargeDisplay = getItemChargeDisplay({
          currentCharges: owned.currentCharges,
          maximumCharges: definition.runtimeProfile.maximumCharges,
        });
        return <article key={`instance-${owned.instanceId}`}><div><strong>{definition.name} · Copy #{owned.instanceId}</strong><span>{chargeDisplay.label}{chargeDisplay.exceedsCurrentMaximum ? " · Above current template maximum" : ""}</span></div><ItemUseDialog sourceCharacterId={draft.characterId} itemId={owned.itemId} itemInstanceId={owned.instanceId} itemName={`${definition.name} · Copy #${owned.instanceId}`} activationLabel={definition.runtimeProfile.activationLabel} disabled={disabled} onComplete={onComplete} /></article>;
      })}
      {unavailable.map((definition) => <article key={`unavailable-${definition.id}`} className="is-unavailable"><div><strong>{definition.name}</strong><span>Not executable: this activated profile has no Mechanical Effects. Add a Manual effect for descriptive resolution.</span></div></article>)}
    </div>
  </section>;
}

function Preview({ draft }: { draft: CreatureNpcDraft }) {
  const snapshot = draft.currentSnapshot;
  const effective = resolveEffectiveCreatureStatistics(snapshot);
  const totalMaximumHp = resolveCreatureTotalMaximumHp(snapshot, draft.hpAdjustment);
  const effectiveAttributes = new Map(effective.attributes.map((row) => [row.attributeKey, row.effectiveValue]));
  const effectiveMovement = new Map(effective.movement.map((row) => [row.movementMode, row.effectiveValue]));
  return <div className="creature-npc-section"><article className="creature-npc-preview"><header><p>{snapshot.core.family || "Creature"} · {snapshot.core.creatureType || "Individual"}</p><h2 className="font-sans">{draft.name}</h2><span>{snapshot.core.size} ×{formatCreatureNumber(effective.sizeMultiplier)} · CR {snapshot.core.challengeRating ?? "?"}{draft.hpAdjustment === 0 ? "" : ` · Individual HP ${draft.hpAdjustment > 0 ? "+" : ""}${formatCreatureNumber(draft.hpAdjustment)}`}</span></header><section><h3>Attributes</h3>{snapshot.attributes.map((attribute) => <p key={attribute.attributeKey}><strong>{attribute.attributeKey}</strong> · Base {formatCreatureNumber(attribute.value)} · Effective {formatCreatureNumber(effectiveAttributes.get(attribute.attributeKey) ?? null)}</p>)}</section><section><h3>Health & Exceptional Modifiers</h3><p>Effective CON {formatCreatureNumber(effective.effectiveConstitution)} · HP Multiplier ×{formatCreatureNumber(effective.hpMultiplier)} · Calculated HP {formatCreatureNumber(effective.calculatedTotalMaximumHp)}{draft.hpAdjustment === 0 ? "" : ` · Individual adjustment ${draft.hpAdjustment > 0 ? "+" : ""}${formatCreatureNumber(draft.hpAdjustment)}`} · Final Total HP {formatCreatureNumber(totalMaximumHp)} · Movement bonus +{formatCreatureNumber(effective.baseMovementBonus)} · Base Magic bonus +{formatCreatureNumber(effective.baseMagicBonus)}</p></section><section><h3>Personality</h3><p>{draft.personality || "Not specified."}</p></section><div className="creature-npc-preview-grid"><section><h3>Movement</h3>{snapshot.movement.map((row) => <p key={row.movementMode}>{row.movementMode}: Base {formatCreatureNumber(row.movementValue)} · Effective {formatCreatureNumber(effectiveMovement.get(row.movementMode) ?? null)} · Init {row.initiative ?? "—"}</p>)}</section><section><h3>Attacks</h3>{snapshot.attacks.map((row) => <p key={row.canonicalId}><strong>{row.attackName}</strong> · {row.attackPercentage ?? "?"}% · {row.damage ?? "—"}</p>)}</section></div><section><h3>Individual Notes</h3><p>{draft.instanceNotes || "None."}</p></section></article></div>;
}

function SectionHeading({ eyebrow, title, action, onAction, wide = false }: { eyebrow: string; title: string; action?: string; onAction?: () => void; wide?: boolean }) { return <header className={wide ? "creature-npc-section-heading creature-npc-field--wide" : "creature-npc-section-heading"}><div><p>{eyebrow}</p><h2 className="font-sans">{title}</h2></div>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</header>; }

function patch<K extends "attributes" | "movement" | "hpPools" | "hitLocations" | "attacks" | "skillLinks" | "abilities" | "defenses" | "uses">(snapshot: CreatureDraft, onChange: (draft: CreatureDraft) => void, key: K, index: number, update: Partial<CreatureDraft[K][number]>) { const rows = snapshot[key].map((row, i) => i === index ? { ...row, ...update } : row) as CreatureDraft[K]; onChange({ ...snapshot, [key]: rows }); }
function remove<K extends "movement" | "hpPools" | "hitLocations" | "attacks" | "skillLinks" | "abilities" | "defenses" | "uses">(snapshot: CreatureDraft, onChange: (draft: CreatureDraft) => void, key: K, index: number) { const rows = snapshot[key].filter((_, i) => i !== index) as CreatureDraft[K]; onChange({ ...snapshot, [key]: rows }); }
