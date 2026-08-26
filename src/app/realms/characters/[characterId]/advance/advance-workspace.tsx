"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  advanceCharacterSkill,
  spendCharacterQuintessence,
} from "@/app/characters/actions";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterAttributeKey,
} from "@/features/characters/models";
import {
  characterAggregateToDraft,
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getRaceAttributeCap,
  getRacialSkillGrant,
} from "@/features/characters/character-rules";
import {
  ATTRIBUTE_QUINTESSENCE_COST,
  EXPERIENCE_PER_QUINTESSENCE,
  FATE_POINT_QUINTESSENCE_COST,
} from "@/features/characters/quintessence-rules";

export function AdvanceWorkspace({ initialAggregate }: { initialAggregate: CharacterAggregate }) {
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [skillSearch, setSkillSearch] = useState("");
  const [parentAllocationId, setParentAllocationId] = useState("");
  const [newSkillId, setNewSkillId] = useState("");
  const [attributeKey, setAttributeKey] = useState<CharacterAttributeKey>("STR");
  const [quintQuantity, setQuintQuantity] = useState(1);

  const draft = useMemo(() => characterAggregateToDraft(aggregate), [aggregate]);
  const ranks = useMemo(
    () => getCharacterSkillRanks(draft, aggregate.skillCatalog, aggregate.selectedRace),
    [draft, aggregate],
  );
  const allocations = new Map(aggregate.skillAllocations.map((entry) => [entry.id, entry]));
  const skills = new Map(aggregate.skillCatalog.map((entry) => [entry.id, entry]));
  const selectedParent = parentAllocationId ? allocations.get(Number(parentAllocationId)) ?? null : null;

  const advancementCandidates = aggregate.skillCatalog.filter((candidate) => {
    if (skillSearch && !candidate.name.toLowerCase().includes(skillSearch.toLowerCase())) return false;
    if (selectedParent) {
      return aggregate.skillRelationships.some((edge) =>
        edge.relationshipType.toLowerCase() === "parent" &&
        edge.skillId === candidate.id &&
        edge.relatedSkillId === selectedParent.skillId,
      );
    }
    return candidate.tier === 1 || candidate.tier === null;
  }).filter((candidate) => !aggregate.skillAllocations.some((allocation) =>
    allocation.skillId === candidate.id && allocation.parentAllocationId === (selectedParent?.id ?? null),
  )).slice(0, 100);

  async function addExperiencePoint(skillId: number, parentId: number | null) {
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await advanceCharacterSkill(aggregate.character.id, skillId, parentId, 1);
      setAggregate(saved);
      setFeedback({ kind: "success", message: "1 Experience was spent on the Skill." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Skill could not be advanced." });
    } finally {
      setBusy(false);
    }
  }

  async function unlockSkill() {
    const skillId = Number(newSkillId);
    if (!skillId) return;
    await addExperiencePoint(skillId, selectedParent?.id ?? null);
    setNewSkillId("");
  }

  async function spendQuintessence(
    purchaseType: "attribute" | "fatePoints" | "experience",
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      const saved = await spendCharacterQuintessence(
        aggregate.character.id,
        purchaseType,
        quintQuantity,
        purchaseType === "attribute" ? attributeKey : null,
      );
      setAggregate(saved);
      setFeedback({ kind: "success", message: "Quintessence purchase completed." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Quintessence purchase failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="character-page advance-page">
      <header className="character-header">
        <Link href="/realms" className="font-evanescent character-logo">SERRIAN<br />TIDE</Link>
        <div className="character-header__identity">
          <p>THE REALMS / ADVANCEMENT</p>
          <h1 className="font-portcullion">{aggregate.character.name}</h1>
          <span>{aggregate.campaign.name} · Experience and Quintessence</span>
        </div>
        <div className="character-header__actions"><Link href={`/realms/characters/${aggregate.character.id}`}>← Character Sheet</Link></div>
      </header>

      <section className="advance-resources">
        <div><span>Experience</span><strong>{aggregate.profile.experience}</strong><small>Total earned {aggregate.profile.totalExperience}</small></div>
        <div><span>Quintessence</span><strong>{aggregate.profile.quintessence}</strong><small>Total earned {aggregate.profile.totalQuintessence}</small></div>
        <div><span>Fate Points</span><strong>{aggregate.profile.fatePoints ?? 0}</strong><small>Current reserve</small></div>
      </section>

      {feedback ? <p className={`character-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

      <div className="advance-grid">
        <section className="character-editor advance-panel">
          <header className="character-section-heading"><p>EXPERIENCE</p><h2 className="font-portcullion">Advance Skills</h2></header>
          <p className="advance-help">Each point added to a Skill costs 1 Experience. Tier paths and Campaign restrictions are enforced by the server.</p>

          <div className="advance-skill-add">
            <Field label="Search"><input value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} /></Field>
            <Field label="Parent Path"><select value={parentAllocationId} onChange={(event) => { setParentAllocationId(event.target.value); setNewSkillId(""); }}><option value="">Root Skill</option>{aggregate.skillAllocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.skillName} · Rank {ranks.get(allocation.id) ?? 0}</option>)}</select></Field>
            <Field label="New Skill"><select value={newSkillId} onChange={(event) => setNewSkillId(event.target.value)}><option value="">Choose Skill</option>{advancementCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.tier ? ` · Tier ${candidate.tier}` : ""}</option>)}</select></Field>
            <button type="button" disabled={busy || !newSkillId || aggregate.profile.experience < 1} onClick={() => void unlockSkill()}>Spend 1 XP</button>
          </div>

          <div className="advance-skill-list">{aggregate.skillAllocations.map((allocation) => {
            const meta = skills.get(allocation.skillId);
            const parent = allocation.parentAllocationId === null ? null : allocations.get(allocation.parentAllocationId) ?? null;
            const racial = getRacialSkillGrant(aggregate.selectedRace, allocation.skillId);
            return <article key={allocation.id}><div><p>{parent ? `${parent.skillName} → ` : ""}{allocation.skillClassification}{allocation.skillTier ? ` · Tier ${allocation.skillTier}` : ""}</p><h3>{allocation.skillName}</h3><span>Purchased {allocation.points} · Racial +{racial.minimum} · Effective {getEffectiveSkillPoints(allocation.points, aggregate.selectedRace, allocation.skillId)}</span></div><div><span>Rank</span><strong>{ranks.get(allocation.id) ?? 0}</strong></div><button type="button" disabled={busy || aggregate.profile.experience < 1} onClick={() => void addExperiencePoint(allocation.skillId, allocation.parentAllocationId)}>+1 · 1 XP</button></article>;
          })}</div>
        </section>

        <section className="character-editor advance-panel">
          <header className="character-section-heading"><p>QUINTESSENCE</p><h2 className="font-portcullion">Permanent Growth</h2></header>
          <p className="advance-help">Serrian Tide conversion rates are preserved exactly from STSTandAlone.</p>
          <Field label="Purchase Quantity"><input type="number" min={1} step={1} value={quintQuantity} onChange={(event) => setQuintQuantity(Math.max(1, Math.trunc(Number(event.target.value))))} /></Field>

          <article className="quint-card"><div><p>ATTRIBUTE</p><h3>Increase a Core Attribute</h3><span>{ATTRIBUTE_QUINTESSENCE_COST} Quintessence per point. Race caps still apply.</span></div><select value={attributeKey} onChange={(event) => setAttributeKey(event.target.value as CharacterAttributeKey)}>{CHARACTER_ATTRIBUTE_KEYS.map((key) => <option key={key} value={key}>{CHARACTER_ATTRIBUTE_LABELS[key]} · {draft.attributes[key]}{getRaceAttributeCap(aggregate.selectedRace, key) !== null ? ` / cap ${getRaceAttributeCap(aggregate.selectedRace, key)}` : ""}</option>)}</select><button type="button" disabled={busy || aggregate.profile.quintessence < quintQuantity * ATTRIBUTE_QUINTESSENCE_COST} onClick={() => void spendQuintessence("attribute")}>Spend {quintQuantity * ATTRIBUTE_QUINTESSENCE_COST} Q</button></article>
          <article className="quint-card"><div><p>FATE</p><h3>Gain Fate Points</h3><span>{FATE_POINT_QUINTESSENCE_COST} Quintessence per Fate Point.</span></div><button type="button" disabled={busy || aggregate.profile.quintessence < quintQuantity * FATE_POINT_QUINTESSENCE_COST} onClick={() => void spendQuintessence("fatePoints")}>Spend {quintQuantity * FATE_POINT_QUINTESSENCE_COST} Q</button></article>
          <article className="quint-card"><div><p>EXPERIENCE</p><h3>Convert Quintessence to XP</h3><span>1 Quintessence becomes {EXPERIENCE_PER_QUINTESSENCE} Experience.</span></div><button type="button" disabled={busy || aggregate.profile.quintessence < quintQuantity} onClick={() => void spendQuintessence("experience")}>Spend {quintQuantity} Q · Gain {quintQuantity * EXPERIENCE_PER_QUINTESSENCE} XP</button></article>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="character-field"><span>{label}</span>{children}</label>;
}
