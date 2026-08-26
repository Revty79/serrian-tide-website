"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createCharacter } from "@/app/characters/actions";
import {
  addCampaignPlayer,
  getCampaignAdmin,
  getCampaignMembers,
  getCampaignReferenceData,
  removeCampaignPlayer,
  saveCampaignAdmin,
  type CampaignAdminDraft,
  type CampaignAdminSummary,
  type CampaignMemberData,
  type CampaignReferenceData,
} from "./actions";

type Tab = "rules" | "races" | "inventory" | "players";
const SYSTEMS = ["Tier 1", "Tier 2", "Tier 3", "Spellcraft", "Talismanism", "Faith", "Psyonics", "Special Abilities", "Bardic Resonance"] as const;

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "campaign-field campaign-field--wide" : "campaign-field"}><span>{label}</span>{children}</label>;
}

export function CampaignWorkspace({ initialCampaigns }: { initialCampaigns: CampaignAdminSummary[] }) {
  const router = useRouter();
  const [campaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<CampaignAdminDraft | null>(null);
  const [references, setReferences] = useState<CampaignReferenceData | null>(null);
  const [members, setMembers] = useState<CampaignMemberData | null>(null);
  const [tab, setTab] = useState<Tab>("rules");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [raceSearch, setRaceSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [playerCandidate, setPlayerCandidate] = useState("");

  async function openCampaign(id: number) {
    if (dirty && !window.confirm("Discard unsaved Campaign changes?")) return;
    setSelectedId(id);
    setLoading(true);
    setFeedback(null);
    try {
      const [nextDraft, nextRefs, nextMembers] = await Promise.all([
        getCampaignAdmin(id),
        getCampaignReferenceData(id),
        getCampaignMembers(id),
      ]);
      setDraft(nextDraft);
      setReferences(nextRefs);
      setMembers(nextMembers);
      setDirty(false);
      setTab("rules");
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Campaign could not be loaded." });
    } finally { setLoading(false); }
  }

  function change(next: CampaignAdminDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveCampaignAdmin(draft);
      setDraft(saved);
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.name} was saved.` });
      if (selectedId) setMembers(await getCampaignMembers(selectedId));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Campaign could not be saved." });
    } finally { setSaving(false); }
  }

  async function addPlayer() {
    if (!draft || !playerCandidate) return;
    setSaving(true);
    try {
      await addCampaignPlayer(draft.id, playerCandidate);
      setMembers(await getCampaignMembers(draft.id));
      setPlayerCandidate("");
      setFeedback({ kind: "success", message: "Player added to Campaign." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Player could not be added." });
    } finally { setSaving(false); }
  }

  async function removePlayer(userId: string) {
    if (!draft) return;
    setSaving(true);
    try {
      await removeCampaignPlayer(draft.id, userId);
      setMembers(await getCampaignMembers(draft.id));
      setFeedback({ kind: "success", message: "Player removed from Campaign." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Player could not be removed." });
    } finally { setSaving(false); }
  }

  async function createForPlayer(userId: string) {
    if (!draft) return;
    setSaving(true);
    try {
      const aggregate = await createCharacter(draft.id, userId);
      router.push(`/heavens/characters/${aggregate.character.id}`);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Character could not be created." });
      setSaving(false);
    }
  }

  const filteredRaces = useMemo(() => references?.races.filter((race) => !raceSearch || race.name.toLowerCase().includes(raceSearch.toLowerCase())) ?? [], [references, raceSearch]);
  const filteredItems = useMemo(() => references?.items.filter((entry) => !itemSearch || [entry.name, entry.canonicalId, entry.category, entry.recordType].some((value) => value.toLowerCase().includes(itemSearch.toLowerCase()))) ?? [], [references, itemSearch]);

  return <main className="campaign-page">
    <header className="campaign-header"><Link href="/heavens" className="font-evanescent campaign-logo">SERRIAN<br />TIDE</Link><div><p>THE HEAVENS / CAMPAIGN CONTROL</p><h1 className="font-portcullion">Campaigns</h1><span>Creator-owned rules, access, and authorized content.</span></div><nav><Link href="/heavens">← The Heavens</Link><Link className="is-primary" href="/heavens/campaigns/new">New Campaign</Link></nav></header>
    {feedback ? <p className={`campaign-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <div className="campaign-workspace">
      <aside className="campaign-library"><header><p>YOUR WORLDS</p><h2>Campaign Library</h2></header><div>{campaigns.map((entry) => <button key={entry.id} type="button" className={selectedId === entry.id ? "is-selected" : ""} onClick={() => void openCampaign(entry.id)}><strong>{entry.name}</strong><span>{entry.playerCount} Players · {entry.characterCount} Characters · {entry.npcCount} NPCs</span><small>{entry.currencySystem}</small></button>)}{!campaigns.length ? <p>No Campaigns yet.</p> : null}</div></aside>
      {loading ? <section className="campaign-editor campaign-empty"><p>LOADING CAMPAIGN</p></section> : draft && references && members ? <section className="campaign-editor"><header className="campaign-editor-header"><div><p>CAMPAIGN {draft.id}</p><h2>{draft.name}</h2><span>{dirty ? "Unsaved changes" : "Saved"}</span></div><button type="button" disabled={saving || !dirty} onClick={() => void persist()}>{saving ? "Saving…" : "Save Campaign"}</button></header><nav className="campaign-tabs"><button className={tab === "rules" ? "is-active" : ""} onClick={() => setTab("rules")}>Rules & Systems</button><button className={tab === "races" ? "is-active" : ""} onClick={() => setTab("races")}>Allowed Races</button><button className={tab === "inventory" ? "is-active" : ""} onClick={() => setTab("inventory")}>Inventory Access</button><button className={tab === "players" ? "is-active" : ""} onClick={() => setTab("players")}>Players & Characters</button></nav><div className="campaign-editor-content">
        {tab === "rules" ? <Rules draft={draft} onChange={change} /> : null}
        {tab === "races" ? <Races draft={draft} races={filteredRaces} search={raceSearch} onSearch={setRaceSearch} onChange={change} /> : null}
        {tab === "inventory" ? <Inventory draft={draft} references={references} items={filteredItems} search={itemSearch} onSearch={setItemSearch} onChange={change} /> : null}
        {tab === "players" ? <Players draft={draft} members={members} candidate={playerCandidate} setCandidate={setPlayerCandidate} saving={saving} onAdd={() => void addPlayer()} onRemove={(userId) => void removePlayer(userId)} onCreate={(userId) => void createForPlayer(userId)} /> : null}
      </div></section> : <section className="campaign-editor campaign-empty"><p>CAMPAIGN CONTROL</p><h2>Select a Campaign or create a new one.</h2></section>}
    </div>
  </main>;
}

function Rules({ draft, onChange }: { draft: CampaignAdminDraft; onChange: (draft: CampaignAdminDraft) => void }) {
  const set = (update: Partial<CampaignAdminDraft>) => onChange({ ...draft, ...update });
  return <div className="campaign-section"><div className="campaign-form-grid"><Field label="Campaign Name" wide><input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field><Field label="Attribute Points"><input type="number" min={0} value={draft.attributePoints} onChange={(e) => set({ attributePoints: Number(e.target.value) })} /></Field><Field label="Skill Points"><input type="number" min={0} value={draft.skillPoints} onChange={(e) => set({ skillPoints: Number(e.target.value) })} /></Field><Field label="Max Starting Points per Skill"><input type="number" min={0} value={draft.maxStartingSkill} onChange={(e) => set({ maxStartingSkill: Number(e.target.value) })} /></Field><Field label="Points to Unlock Next Tier"><input type="number" min={0} value={draft.pointsToUnlockNextTier} onChange={(e) => set({ pointsToUnlockNextTier: Number(e.target.value) })} /></Field><Field label="Max Points in Standard Skill"><input type="number" min={0} value={draft.maxPointsInSkill} onChange={(e) => set({ maxPointsInSkill: Number(e.target.value) })} /></Field><Field label="Starting Credits"><input type="number" min={0} value={draft.startingCreditAmount} onChange={(e) => set({ startingCreditAmount: Number(e.target.value) })} /></Field><Field label="Fate Method"><select value={draft.fatePointMethod} onChange={(e) => set({ fatePointMethod: e.target.value as CampaignAdminDraft["fatePointMethod"] })}><option>Assigned</option><option>Rolled</option></select></Field>{draft.fatePointMethod === "Assigned" ? <Field label="Assigned Fate Points"><input type="number" min={0} step={1} value={draft.assignedFatePoints ?? 0} onChange={(e) => set({ assignedFatePoints: Math.max(0, Math.trunc(Number(e.target.value))) })} /></Field> : null}<Field label="Currency System"><select value={draft.currencySystem} onChange={(e) => set({ currencySystem: e.target.value as CampaignAdminDraft["currencySystem"] })}><option>Credits</option><option>Derived Currency</option></select></Field></div>
    <SectionHeading eyebrow="RULE AVAILABILITY" title="Allowed Systems" /><div className="campaign-check-grid">{SYSTEMS.map((system) => <label key={system} className={draft.allowedSystems.includes(system) ? "is-selected" : ""}><input type="checkbox" checked={draft.allowedSystems.includes(system)} onChange={(e) => set({ allowedSystems: e.target.checked ? [...draft.allowedSystems, system] : draft.allowedSystems.filter((entry) => entry !== system) })} /><span>{system}</span></label>)}</div>
    {draft.currencySystem === "Derived Currency" ? <><SectionHeading eyebrow="DENOMINATIONS" title="Derived Currencies" action="Add Currency" onAction={() => set({ derivedCurrencies: [...draft.derivedCurrencies, { name: "", description: "", creditsPerUnit: 1 }] })} /><div className="campaign-currency-list">{draft.derivedCurrencies.map((currency, index) => <article key={currency.id ?? `new-${index}`}><input placeholder="Name" value={currency.name} onChange={(e) => set({ derivedCurrencies: draft.derivedCurrencies.map((entry, i) => i === index ? { ...entry, name: e.target.value } : entry) })} /><input placeholder="Description" value={currency.description} onChange={(e) => set({ derivedCurrencies: draft.derivedCurrencies.map((entry, i) => i === index ? { ...entry, description: e.target.value } : entry) })} /><input type="number" min={0.000001} step="any" value={currency.creditsPerUnit} onChange={(e) => set({ derivedCurrencies: draft.derivedCurrencies.map((entry, i) => i === index ? { ...entry, creditsPerUnit: Number(e.target.value) } : entry) })} /><button type="button" onClick={() => set({ derivedCurrencies: draft.derivedCurrencies.filter((_, i) => i !== index) })}>Remove</button></article>)}</div></> : null}
  </div>;
}

function Races({ draft, races, search, onSearch, onChange }: { draft: CampaignAdminDraft; races: CampaignReferenceData["races"]; search: string; onSearch: (value: string) => void; onChange: (draft: CampaignAdminDraft) => void }) {
  return <div className="campaign-section"><SectionHeading eyebrow="CHARACTER CREATION" title="Allowed Races" /><input className="campaign-search" type="search" value={search} placeholder="Search Races" onChange={(e) => onSearch(e.target.value)} /><div className="campaign-selection-list">{races.map((race) => <label key={race.id} className={draft.allowedRaceIds.includes(race.id) ? "is-selected" : ""}><input type="checkbox" checked={draft.allowedRaceIds.includes(race.id)} onChange={(e) => onChange({ ...draft, allowedRaceIds: e.target.checked ? [...draft.allowedRaceIds, race.id] : draft.allowedRaceIds.filter((id) => id !== race.id) })} /><div><strong>{race.name}</strong><span>{race.size}</span></div></label>)}</div></div>;
}

function Inventory({ draft, references, items, search, onSearch, onChange }: { draft: CampaignAdminDraft; references: CampaignReferenceData; items: CampaignReferenceData["items"]; search: string; onSearch: (value: string) => void; onChange: (draft: CampaignAdminDraft) => void }) {
  return <div className="campaign-section"><SectionHeading eyebrow="GENRE / BULK AUTHORIZATION" title="Inventory Tags" /><p className="campaign-help">Selecting a tag authorizes every current Item carrying that tag. Individual records can also be selected below.</p><div className="campaign-tag-grid">{references.tags.map((tag) => <label key={tag.id} className={draft.inventoryTagIds.includes(tag.id) ? "is-selected" : ""}><input type="checkbox" checked={draft.inventoryTagIds.includes(tag.id)} onChange={(e) => onChange({ ...draft, inventoryTagIds: e.target.checked ? [...draft.inventoryTagIds, tag.id] : draft.inventoryTagIds.filter((id) => id !== tag.id) })} /><div><strong>{tag.name}</strong><span>{tag.tagGroup} · {tag.description}</span></div></label>)}</div><SectionHeading eyebrow="EXPLICIT AUTHORIZATION" title="Equipment & Inventory Records" /><input className="campaign-search" type="search" value={search} placeholder="Search Items" onChange={(e) => onSearch(e.target.value)} /><div className="campaign-selection-list campaign-item-selection">{items.map((entry) => <label key={entry.id} className={draft.inventoryItemIds.includes(entry.id) ? "is-selected" : ""}><input type="checkbox" checked={draft.inventoryItemIds.includes(entry.id)} onChange={(e) => onChange({ ...draft, inventoryItemIds: e.target.checked ? [...draft.inventoryItemIds, entry.id] : draft.inventoryItemIds.filter((id) => id !== entry.id) })} /><div><strong>{entry.name}</strong><span>{entry.catalogScope}{entry.equipmentGroup ? ` / ${entry.equipmentGroup}` : ""} · {entry.category} · {entry.credits ?? "Unpriced"} cr</span></div></label>)}</div></div>;
}

function Players({ draft, members, candidate, setCandidate, saving, onAdd, onRemove, onCreate }: { draft: CampaignAdminDraft; members: CampaignMemberData; candidate: string; setCandidate: (value: string) => void; saving: boolean; onAdd: () => void; onRemove: (userId: string) => void; onCreate: (userId: string) => void }) {
  const available = members.candidates.filter((entry) => !entry.isMember);
  return <div className="campaign-section"><SectionHeading eyebrow="MEMBERSHIP" title="Players" /><div className="campaign-player-add"><select value={candidate} onChange={(e) => setCandidate(e.target.value)}><option value="">Choose Player account</option>{available.map((entry) => <option key={entry.userId} value={entry.userId}>{entry.username} · {entry.displayName}</option>)}</select><button type="button" disabled={!candidate || saving} onClick={onAdd}>Add Player</button></div><div className="campaign-player-list">{members.players.map((player) => <article key={player.userId}><div><strong>{player.username}</strong><span>{player.displayName}</span></div><button type="button" disabled={saving} onClick={() => onCreate(player.userId)}>Create Character</button><button className="is-danger" type="button" disabled={saving || members.characters.some((character) => character.playerUserId === player.userId)} onClick={() => onRemove(player.userId)}>Remove</button></article>)}</div><SectionHeading eyebrow="PLAYER CHARACTERS" title="Characters" /><div className="campaign-character-list">{members.characters.map((character) => <Link key={character.id} href={`/heavens/characters/${character.id}`}><strong>{character.name}</strong><span>{character.playerName} · {character.creationCompletedAt ? "Complete" : "Creation Incomplete"}</span></Link>)}{!members.characters.length ? <p>No Player Characters yet.</p> : null}</div><SectionHeading eyebrow="G.O.D. CHARACTERS" title="NPCs" /><div className="campaign-character-list">{members.npcs.map((npc) => <Link key={npc.id} href={`/heavens/characters/${npc.id}`}><strong>{npc.name}</strong><span>{npc.npcKind} NPC · {npc.creationCompletedAt ? "Complete" : "Draft"}</span></Link>)}<Link className="campaign-create-npc" href={`/heavens/npcs?campaign=${draft.id}`}>Open NPC Workshop →</Link></div></div>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) { return <header className="campaign-section-heading"><div><p>{eyebrow}</p><h3 className="font-portcullion">{title}</h3></div>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</header>; }
