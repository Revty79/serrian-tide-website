"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  getCharacter,
  saveCharacter,
} from "./actions";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterDraft,
} from "@/features/characters/models";
import {
  characterAggregateToDraft,
  evaluateCharacterReadiness,
  getAttributeModifier,
  getAttributePointsUsed,
  getCharacterHp,
  getCharacterHpBreakdown,
  getCharacterManaProfiles,
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getRaceAttributeCap,
  getRacialSkillGrant,
  getSkillPointsUsed,
  getSkillRollTarget,
  getStartingFundsSpent,
  normalizeSkillAttributeKey,
} from "@/features/characters/character-rules";

type Tab = "identity" | "race" | "attributes" | "skills" | "story" | "equipment" | "review";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "race", label: "Race" },
  { id: "attributes", label: "Attributes" },
  { id: "skills", label: "Skills" },
  { id: "story", label: "Story & Personality" },
  { id: "equipment", label: "Equipment & Inventory" },
  { id: "review", label: "Review" },
];

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "character-field character-field--wide" : "character-field"}><span>{label}</span>{children}</label>;
}

function OptionalNumber({ value, onChange, disabled = false, ...props }: { value: number | null; onChange: (value: number | null) => void; disabled?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...props} type="number" disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
}

export function CharacterEditor({
  initialAggregate,
  godMode,
}: {
  initialAggregate: CharacterAggregate;
  godMode: boolean;
}) {
  const [aggregate, setAggregate] = useState(initialAggregate);
  const [draft, setDraft] = useState<CharacterDraft>(() => characterAggregateToDraft(initialAggregate));
  const [activeTab, setActiveTab] = useState<Tab>("identity");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const playerLocked = !godMode && Boolean(aggregate.profile.creationCompletedAt);
  const selectedRace = aggregate.selectedRace?.race.id === draft.profile.raceId ? aggregate.selectedRace : null;
  const readiness = useMemo(
    () => evaluateCharacterReadiness(draft, aggregate, selectedRace),
    [aggregate, draft, selectedRace],
  );

  function change(next: CharacterDraft) {
    if (playerLocked) return;
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist(completeCreation = false) {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveCharacter(aggregate.character.id, draft, completeCreation, godMode);
      setAggregate(saved);
      setDraft(characterAggregateToDraft(saved));
      setDirty(false);
      setFeedback({
        kind: "success",
        message: completeCreation
          ? `${saved.character.name} is complete. The Player creation record is now locked.`
          : `${saved.character.name} was saved.`,
      });
      if (draft.profile.raceId !== null && saved.selectedRace?.race.id !== draft.profile.raceId) {
        const refreshed = await getCharacter(saved.character.id, godMode);
        setAggregate(refreshed);
        setDraft(characterAggregateToDraft(refreshed));
      }
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Character could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  const backHref = godMode ? "/heavens" : "/realms";

  return (
    <main className="character-page">
      <header className="character-header">
        <Link href={backHref} className="font-evanescent character-logo">SERRIAN<br />TIDE</Link>
        <div className="character-header__identity">
          <p>{godMode ? "THE HEAVENS / CHARACTER RECORD" : "THE REALMS / CHARACTER RECORD"}</p>
          <h1 className="font-portcullion">{draft.name || "New Character"}</h1>
          <span>{aggregate.campaign.name} · {aggregate.character.playerUsername}{aggregate.character.isNpc ? " · NPC" : ""}</span>
        </div>
        <div className="character-header__actions">
          <Link href={backHref}>← Back</Link>
          {!playerLocked ? <button type="button" disabled={saving || !dirty} onClick={() => void persist(false)}>{saving ? "Saving…" : "Save Draft"}</button> : <span className="character-lock">Creation Locked</span>}
        </div>
      </header>

      <section className="character-status-strip">
        <div><span>Attributes</span><strong>{readiness.attributesUsed} / {aggregate.campaign.attributePoints}</strong></div>
        <div><span>Skills</span><strong>{readiness.skillPointsUsed} / {aggregate.campaign.skillPoints}</strong></div>
        <div><span>Funds</span><strong>{readiness.fundsRemaining.toLocaleString()} cr</strong></div>
        <div><span>Experience</span><strong>{draft.profile.experience}</strong></div>
        <div><span>Quintessence</span><strong>{draft.profile.quintessence}</strong></div>
        <div><span>Status</span><strong>{aggregate.profile.creationCompletedAt ? "Complete" : "Creation"}</strong></div>
      </section>

      {feedback ? <p className={`character-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

      <div className="character-workspace">
        <nav className="character-tabs">{TABS.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}><span>{tab.label}</span>{tabStatus(tab.id, readiness) ? <i>✓</i> : null}</button>)}</nav>
        <section className="character-editor">
          {activeTab === "identity" ? <IdentityTab draft={draft} aggregate={aggregate} disabled={playerLocked} godMode={godMode} onChange={change} /> : null}
          {activeTab === "race" ? <RaceTab draft={draft} aggregate={aggregate} disabled={playerLocked} onChange={change} /> : null}
          {activeTab === "attributes" ? <AttributesTab draft={draft} aggregate={aggregate} race={selectedRace} disabled={playerLocked} onChange={change} /> : null}
          {activeTab === "skills" ? <SkillsTab draft={draft} aggregate={aggregate} race={selectedRace} disabled={playerLocked} onChange={change} /> : null}
          {activeTab === "story" ? <StoryTab draft={draft} disabled={playerLocked} onChange={change} /> : null}
          {activeTab === "equipment" ? <EquipmentTab draft={draft} aggregate={aggregate} disabled={playerLocked} onChange={change} /> : null}
          {activeTab === "review" ? <ReviewTab draft={draft} aggregate={aggregate} readiness={readiness} selectedRace={selectedRace} godMode={godMode} playerLocked={playerLocked} saving={saving} onSave={() => void persist(false)} onComplete={() => void persist(true)} /> : null}
        </section>
      </div>
    </main>
  );
}

function tabStatus(tab: Tab, readiness: ReturnType<typeof evaluateCharacterReadiness>) {
  if (tab === "identity") return readiness.identityComplete;
  if (tab === "race") return readiness.raceComplete;
  if (tab === "attributes") return readiness.attributesComplete;
  if (tab === "skills") return readiness.skillsComplete;
  if (tab === "story") return readiness.storyComplete;
  if (tab === "equipment") return readiness.equipmentComplete;
  return readiness.ready;
}

function IdentityTab({ draft, aggregate, disabled, godMode, onChange }: { draft: CharacterDraft; aggregate: CharacterAggregate; disabled: boolean; godMode: boolean; onChange: (draft: CharacterDraft) => void }) {
  const profile = draft.profile;
  const setProfile = (update: Partial<CharacterDraft["profile"]>) => onChange({ ...draft, profile: { ...profile, ...update } });
  return <div className="character-section character-form-grid">
    <SectionHeading eyebrow="WHO ARE YOU?" title="Identity" wide />
    <Field label="Character Name" wide><input disabled={disabled} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} /></Field>
    <Field label="Age"><OptionalNumber disabled={disabled} min={0} value={profile.age} onChange={(age) => setProfile({ age })} /></Field>
    <Field label="Sex"><input disabled={disabled} value={profile.sex} onChange={(e) => setProfile({ sex: e.target.value })} /></Field>
    <Field label="Height Feet"><OptionalNumber disabled={disabled} min={0} value={profile.heightFeet} onChange={(heightFeet) => setProfile({ heightFeet })} /></Field>
    <Field label="Height Inches"><OptionalNumber disabled={disabled} min={0} max={11} value={profile.heightInches} onChange={(heightInches) => setProfile({ heightInches })} /></Field>
    <Field label="Weight"><OptionalNumber disabled={disabled} min={0} value={profile.weight} onChange={(weight) => setProfile({ weight })} /></Field>
    <Field label="Skin Color"><input disabled={disabled} value={profile.skinColor} onChange={(e) => setProfile({ skinColor: e.target.value })} /></Field>
    <Field label="Eye Color"><input disabled={disabled} value={profile.eyeColor} onChange={(e) => setProfile({ eyeColor: e.target.value })} /></Field>
    <Field label="Hair Color"><input disabled={disabled} value={profile.hairColor} onChange={(e) => setProfile({ hairColor: e.target.value })} /></Field>
    <Field label="Deity"><input disabled={disabled} value={profile.deity} onChange={(e) => setProfile({ deity: e.target.value })} /></Field>
    <Field label="Defining Marks" wide><textarea disabled={disabled} rows={3} value={profile.definingMarks} onChange={(e) => setProfile({ definingMarks: e.target.value })} /></Field>
    <Field label="Fate Points"><OptionalNumber disabled={disabled || (!godMode && aggregate.campaign.fatePointMethod === "Assigned")} min={0} value={profile.fatePoints} onChange={(fatePoints) => setProfile({ fatePoints })} /></Field>
    <div className="character-rule-note"><strong>{aggregate.campaign.fatePointMethod} Fate Points</strong><span>{aggregate.campaign.fatePointMethod === "Assigned" ? `Campaign value: ${aggregate.campaign.assignedFatePoints ?? 0}.` : "Roll or enter Fate Points during creation."}</span></div>
  </div>;
}

function RaceTab({ draft, aggregate, disabled, onChange }: { draft: CharacterDraft; aggregate: CharacterAggregate; disabled: boolean; onChange: (draft: CharacterDraft) => void }) {
  const race = aggregate.selectedRace?.race.id === draft.profile.raceId ? aggregate.selectedRace : null;
  return <div className="character-section">
    <SectionHeading eyebrow="PEOPLE & INHERITANCE" title="Race" />
    <Field label="Campaign-Allowed Race"><select disabled={disabled} value={draft.profile.raceId ?? ""} onChange={(e) => onChange({ ...draft, profile: { ...draft.profile, raceId: e.target.value ? Number(e.target.value) : null } })}><option value="">Choose a Race</option>{aggregate.allowedRaces.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>
    {race ? <div className="character-race-card"><header><div><p>{race.race.size}</p><h3>{race.race.name}</h3></div><strong>Base Magic {race.race.baseMagic ?? 0}</strong></header><p>{race.race.physicalDescription || "No physical description."}</p><div className="character-chip-row">{race.attributeCaps.map((cap) => <span key={cap.attributeKey}>{cap.attributeKey} cap {cap.maxValue}</span>)}</div><div className="character-race-grid"><section><h4>Movement</h4>{race.movementModes.map((mode) => <p key={mode.movementMode}>{mode.movementMode}: {mode.baseValue}</p>)}</section><section><h4>Racial Quirk</h4><strong>{race.race.racialQuirkName || "None"}</strong><p>{race.race.quirkSuccessEffect}</p><p>{race.race.quirkFailureEffect}</p></section></div><section><h4>Racial Skills & Abilities</h4><div className="character-chip-row">{race.skillLinks.map((link) => <span key={`${link.skillId}-${link.linkType}`}>{link.skillName}{link.value ? ` +${link.value}` : ""}</span>)}</div></section></div> : draft.profile.raceId ? <p className="character-notice">Save the draft to load the newly selected Race mechanics.</p> : null}
  </div>;
}

function AttributesTab({ draft, aggregate, race, disabled, onChange }: { draft: CharacterDraft; aggregate: CharacterAggregate; race: CharacterAggregate["selectedRace"]; disabled: boolean; onChange: (draft: CharacterDraft) => void }) {
  const total = getAttributePointsUsed(draft);
  const hp = getCharacterHp(draft.attributes.CON);
  const hpBreakdown = getCharacterHpBreakdown(hp);
  return <div className="character-section">
    <SectionHeading eyebrow="CORE BODY & MIND" title="Attributes" />
    <div className={`character-budget${Math.abs(total - aggregate.campaign.attributePoints) < .000001 ? " is-complete" : ""}`}><span>Campaign Attribute Budget</span><strong>{total} / {aggregate.campaign.attributePoints}</strong></div>
    <div className="character-attribute-grid">{CHARACTER_ATTRIBUTE_KEYS.map((key) => { const score = draft.attributes[key]; const cap = getRaceAttributeCap(race, key); const modifier = getAttributeModifier(score); return <article key={key}><header><div><span>{key}</span><h3>{CHARACTER_ATTRIBUTE_LABELS[key]}</h3></div><strong>{score}</strong></header><input disabled={disabled} type="number" min={0} max={cap ?? undefined} value={score} onChange={(e) => onChange({ ...draft, attributes: { ...draft.attributes, [key]: Number(e.target.value) } })} /><dl><div><dt>Modifier</dt><dd>{modifier >= 0 ? `+${modifier}` : modifier}</dd></div><div><dt>Roll Target</dt><dd>{100 - score}%</dd></div><div><dt>Race Cap</dt><dd>{cap ?? "—"}</dd></div></dl></article>; })}</div>
    <SectionHeading eyebrow="DERIVED TOUGHNESS" title={`Hit Points · ${hp}`} />
    <div className="character-hp-grid">{hpBreakdown.pools.map((pool) => <div key={pool.key}><span>{pool.name}</span><strong>{pool.hp} HP</strong><small>{pool.percentage}%</small></div>)}</div>
    <div className="character-hit-table">{hpBreakdown.locations.map((location) => <div key={location.result}><strong>{location.result}</strong><span>{location.name}</span><em>{location.poolName} · {location.hp} HP</em></div>)}</div>
  </div>;
}

function SkillsTab({ draft, aggregate, race, disabled, onChange }: { draft: CharacterDraft; aggregate: CharacterAggregate; race: CharacterAggregate["selectedRace"]; disabled: boolean; onChange: (draft: CharacterDraft) => void }) {
  const [search, setSearch] = useState("");
  const [parentDraftId, setParentDraftId] = useState("");
  const [skillId, setSkillId] = useState("");
  const ranks = useMemo(() => getCharacterSkillRanks(draft, aggregate.skillCatalog, race), [draft, aggregate.skillCatalog, race]);
  const total = getSkillPointsUsed(draft);
  const allocations = new Map(draft.skillAllocations.map((entry) => [entry.draftId, entry]));
  const skillMap = new Map(aggregate.skillCatalog.map((entry) => [entry.id, entry]));
  const selectedParent = parentDraftId ? allocations.get(Number(parentDraftId)) ?? null : null;
  const candidates = aggregate.skillCatalog.filter((candidate) => {
    if (search && !candidate.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedParent) return aggregate.skillRelationships.some((edge) => edge.relationshipType.toLowerCase() === "parent" && edge.skillId === candidate.id && edge.relatedSkillId === selectedParent.skillId);
    return candidate.tier === 1 || candidate.tier === null;
  }).slice(0, 100);

  function addSkill() {
    const id = Number(skillId); if (!id) return;
    const parent = selectedParent?.draftId ?? null;
    if (draft.skillAllocations.some((entry) => entry.skillId === id && entry.parentDraftId === parent)) return;
    const nextDraftId = Math.min(0, ...draft.skillAllocations.map((entry) => entry.draftId)) - 1;
    onChange({ ...draft, skillAllocations: [...draft.skillAllocations, { draftId: nextDraftId, skillId: id, parentDraftId: parent, points: 0 }] });
    setSkillId("");
  }

  const manaProfiles = getCharacterManaProfiles(draft, aggregate.skillCatalog, race);

  return <div className="character-section">
    <SectionHeading eyebrow="PERCENTILE PATHS" title="Skills" />
    <div className={`character-budget${Math.abs(total - aggregate.campaign.skillPoints) < .000001 ? " is-complete" : ""}`}><span>Campaign Skill Budget</span><strong>{total} / {aggregate.campaign.skillPoints}</strong></div>
    {manaProfiles.length ? <div className="character-mana-grid">{manaProfiles.map((profile) => <div key={profile.system}><span>{profile.system}</span><strong>{profile.manaPool} Mana</strong><small>{profile.spellAccessLevel ?? "Below Apprentice"}{profile.nextLevel ? ` · Next ${profile.nextLevel} at ${profile.nextRequiredMana}` : ""}</small></div>)}</div> : null}
    {!disabled ? <div className="character-skill-add"><Field label="Search"><input value={search} onChange={(e) => setSearch(e.target.value)} /></Field><Field label="Parent Path"><select value={parentDraftId} onChange={(e) => { setParentDraftId(e.target.value); setSkillId(""); }}><option value="">Root Skill</option>{draft.skillAllocations.map((allocation) => <option key={allocation.draftId} value={allocation.draftId}>{skillMap.get(allocation.skillId)?.name ?? `Skill ${allocation.skillId}`} · Rank {ranks.get(allocation.draftId) ?? 0}</option>)}</select></Field><Field label="Skill"><select value={skillId} onChange={(e) => setSkillId(e.target.value)}><option value="">Choose Skill</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.classification}{candidate.tier ? ` · T${candidate.tier}` : ""}</option>)}</select></Field><button type="button" disabled={!skillId} onClick={addSkill}>Add Skill</button></div> : null}
    <div className="character-skill-list">{draft.skillAllocations.map((allocation) => {
      const meta = skillMap.get(allocation.skillId); if (!meta) return null;
      const parent = allocation.parentDraftId === null ? null : allocations.get(allocation.parentDraftId) ?? null;
      const parentName = parent ? skillMap.get(parent.skillId)?.name : null;
      const racial = getRacialSkillGrant(race, allocation.skillId);
      const rank = ranks.get(allocation.draftId) ?? 0;
      const attributeKey = normalizeSkillAttributeKey(meta.primaryAttribute);
      const attributeScore = attributeKey ? draft.attributes[attributeKey] : 0;
      const roll = attributeKey ? getSkillRollTarget(attributeScore, rank) : 100 - rank;
      const hasChildren = draft.skillAllocations.some((entry) => entry.parentDraftId === allocation.draftId);
      return <article key={allocation.draftId}><div className="character-skill-main"><div><p>{parentName ? `${parentName} → ` : ""}{meta.classification}{meta.tier ? ` · Tier ${meta.tier}` : ""}</p><h3>{meta.name}</h3><span>{meta.definition}</span></div><div className="character-skill-rank"><span>Rank</span><strong>{rank}</strong><small>Target {roll}%</small></div></div><div className="character-skill-controls"><label><span>Purchased</span><input disabled={disabled} type="number" min={0} value={allocation.points} onChange={(e) => onChange({ ...draft, skillAllocations: draft.skillAllocations.map((entry) => entry.draftId === allocation.draftId ? { ...entry, points: Number(e.target.value) } : entry) })} /></label><span>Racial +{racial.minimum}</span><span>Effective {getEffectiveSkillPoints(allocation.points, race, allocation.skillId)}</span>{!disabled ? <button type="button" disabled={hasChildren || racial.minimum > 0} onClick={() => onChange({ ...draft, skillAllocations: draft.skillAllocations.filter((entry) => entry.draftId !== allocation.draftId) })}>Remove</button> : null}</div></article>;
    })}</div>
  </div>;
}

function StoryTab({ draft, disabled, onChange }: { draft: CharacterDraft; disabled: boolean; onChange: (draft: CharacterDraft) => void }) {
  const setProfile = (update: Partial<CharacterDraft["profile"]>) => onChange({ ...draft, profile: { ...draft.profile, ...update } });
  return <div className="character-section character-form-grid"><SectionHeading eyebrow="THE PERSON BEHIND THE NUMBERS" title="Story & Personality" wide />
    <Field label="Personality" wide><textarea disabled={disabled} rows={5} value={draft.profile.personality} onChange={(e) => setProfile({ personality: e.target.value })} /></Field>
    <Field label="Goals" wide><textarea disabled={disabled} rows={5} value={draft.profile.goals} onChange={(e) => setProfile({ goals: e.target.value })} /></Field>
    <Field label="Secrets" wide><textarea disabled={disabled} rows={5} value={draft.profile.secrets} onChange={(e) => setProfile({ secrets: e.target.value })} /></Field>
    <Field label="Backstory" wide><textarea disabled={disabled} rows={8} value={draft.profile.backstory} onChange={(e) => setProfile({ backstory: e.target.value })} /></Field>
    <Field label="Motivations" wide><textarea disabled={disabled} rows={5} value={draft.profile.motivations} onChange={(e) => setProfile({ motivations: e.target.value })} /></Field>
  </div>;
}

function EquipmentTab({ draft, aggregate, disabled, onChange }: { draft: CharacterDraft; aggregate: CharacterAggregate; disabled: boolean; onChange: (draft: CharacterDraft) => void }) {
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const authorized = aggregate.authorizedItems.filter((entry) => entry.credits !== null && (!search || entry.name.toLowerCase().includes(search.toLowerCase()) || entry.category.toLowerCase().includes(search.toLowerCase()))).slice(0, 120);
  const sourceMap = new Map(aggregate.authorizedItems.map((entry) => [entry.id, entry]));
  const spent = getStartingFundsSpent(draft);
  function addItem() { const id = Number(itemId); const source = sourceMap.get(id); if (!source || source.credits === null || draft.items.some((entry) => entry.itemId === id)) return; onChange({ ...draft, items: [...draft.items, { itemId: id, quantity: 1, unitCostCredits: source.credits }] }); setItemId(""); }
  return <div className="character-section"><SectionHeading eyebrow="CAMPAIGN-AUTHORIZED GEAR" title="Equipment & Inventory" /><div className={`character-budget${spent <= aggregate.campaign.startingCreditAmount ? " is-complete" : " is-error"}`}><span>Starting Funds</span><strong>{spent.toLocaleString()} / {aggregate.campaign.startingCreditAmount.toLocaleString()} cr</strong></div>
    {!disabled ? <div className="character-item-add"><Field label="Search"><input value={search} onChange={(e) => setSearch(e.target.value)} /></Field><Field label="Authorized Item"><select value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">Choose Item</option>{authorized.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.catalogScope}{entry.equipmentGroup ? `/${entry.equipmentGroup}` : ""} · {entry.credits} cr</option>)}</select></Field><button type="button" disabled={!itemId} onClick={addItem}>Add Item</button></div> : null}
    <div className="character-item-list">{draft.items.map((owned) => { const source = sourceMap.get(owned.itemId); if (!source) return null; return <article key={owned.itemId}><div><p>{source.catalogScope}{source.equipmentGroup ? ` / ${source.equipmentGroup}` : ""}</p><h3>{source.name}</h3><span>{source.recordType} · {source.category}</span></div><div className="character-item-price"><strong>{source.credits ?? owned.unitCostCredits} cr</strong><small>{source.priceBasis}</small></div><label><span>Qty</span><input disabled={disabled} type="number" min={1} step={1} value={owned.quantity} onChange={(e) => onChange({ ...draft, items: draft.items.map((entry) => entry.itemId === owned.itemId ? { ...entry, quantity: Math.max(1, Math.trunc(Number(e.target.value))) } : entry) })} /></label>{!disabled ? <button type="button" onClick={() => onChange({ ...draft, items: draft.items.filter((entry) => entry.itemId !== owned.itemId) })}>Remove</button> : null}</article>; })}</div>
    {!aggregate.authorizedItems.length ? <p className="character-notice">This Campaign has not authorized any Equipment or Inventory records yet. The G.O.D. must configure Campaign inventory before creation can be completed.</p> : null}
  </div>;
}

function ReviewTab({ draft, aggregate, readiness, selectedRace, godMode, playerLocked, saving, onSave, onComplete }: { draft: CharacterDraft; aggregate: CharacterAggregate; readiness: ReturnType<typeof evaluateCharacterReadiness>; selectedRace: CharacterAggregate["selectedRace"]; godMode: boolean; playerLocked: boolean; saving: boolean; onSave: () => void; onComplete: () => void }) {
  const hp = getCharacterHp(draft.attributes.CON);
  return <div className="character-section"><SectionHeading eyebrow="FINAL RECORD" title="Review Character" /><article className="character-review-hero"><div><p>{selectedRace?.race.name ?? "Race not selected"} · {aggregate.campaign.name}</p><h2>{draft.name || "New Character"}</h2><span>{draft.profile.age !== null ? `Age ${draft.profile.age}` : "Age —"} · {draft.profile.sex || "Sex —"} · {hp} HP</span></div><strong className={readiness.ready ? "is-ready" : ""}>{readiness.ready ? "READY" : "INCOMPLETE"}</strong></article><div className="character-review-grid"><ReviewStatus label="Identity" okay={readiness.identityComplete} /><ReviewStatus label="Race" okay={readiness.raceComplete} /><ReviewStatus label="Attributes" okay={readiness.attributesComplete} /><ReviewStatus label="Skills" okay={readiness.skillsComplete} /><ReviewStatus label="Story" okay={readiness.storyComplete} /><ReviewStatus label="Equipment" okay={readiness.equipmentComplete} /></div>{readiness.issues.length ? <section className="character-issues"><h3>Before Completion</h3><ul>{readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></section> : <p className="character-ready-message">Every creation requirement is satisfied.</p>}<div className="character-review-actions">{!playerLocked ? <button type="button" disabled={saving} onClick={onSave}>Save Draft</button> : null}{!aggregate.profile.creationCompletedAt ? <button className="is-primary" type="button" disabled={saving} onClick={onComplete}>{godMode ? "Complete Character" : "Complete & Lock Character"}</button> : null}{playerLocked ? <Link href={`/realms/characters/${aggregate.character.id}/advance`}>Advance Character →</Link> : null}</div></div>;
}

function ReviewStatus({ label, okay }: { label: string; okay: boolean }) { return <div className={okay ? "is-ready" : ""}><span>{label}</span><strong>{okay ? "Complete" : "Needs Work"}</strong></div>; }
function SectionHeading({ eyebrow, title, wide = false }: { eyebrow: string; title: string; wide?: boolean }) { return <header className={wide ? "character-section-heading character-field--wide" : "character-section-heading"}><p>{eyebrow}</p><h2 className="font-portcullion">{title}</h2></header>; }
