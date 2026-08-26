"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createCharacter } from "@/app/characters/actions";
import { scopeCampaignCharacters } from "@/features/campaigns/campaign-membership";
import {
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
import { CampaignInventorySelector } from "./campaign-inventory-selector";
import { CampaignPlayerPanel } from "./campaign-player-panel";

type Tab = "rules" | "races" | "inventory" | "players";
const SYSTEMS = ["Tier 1", "Tier 2", "Tier 3", "Spellcraft", "Talismanism", "Faith", "Psyonics", "Special Abilities", "Bardic Resonance"] as const;

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "campaign-field campaign-field--wide" : "campaign-field"}><span>{label}</span>{children}</label>;
}

export function CampaignWorkspace({
  initialCampaigns,
  initialCampaignId,
  initialPlayerUserId,
  initialTab,
}: {
  initialCampaigns: CampaignAdminSummary[];
  initialCampaignId: number | null;
  initialPlayerUserId: string | null;
  initialTab: Tab;
}) {
  const router = useRouter();
  const [campaigns] = useState(initialCampaigns);
  const [selectedId, setSelectedId] = useState<number | null>(initialCampaignId);
  const [draft, setDraft] = useState<CampaignAdminDraft | null>(null);
  const [references, setReferences] = useState<CampaignReferenceData | null>(null);
  const [members, setMembers] = useState<CampaignMemberData | null>(null);
  const [tab, setTab] = useState<Tab>("rules");
  const [loading, setLoading] = useState(Boolean(initialCampaignId));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [raceSearch, setRaceSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  useEffect(() => {
    if (!initialCampaignId) return;
    let active = true;
    Promise.all([
      getCampaignAdmin(initialCampaignId),
      getCampaignReferenceData(initialCampaignId),
      getCampaignMembers(initialCampaignId),
    ])
      .then(([nextDraft, nextRefs, nextMembers]) => {
        if (!active) return;
        setDraft(nextDraft);
        setReferences(nextRefs);
        setMembers(nextMembers);
        setSelectedPlayerId(
          initialPlayerUserId && nextMembers.players.some(({ userId }) => userId === initialPlayerUserId)
            ? initialPlayerUserId
            : "",
        );
        setDirty(false);
        setTab(initialTab);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Campaign could not be loaded.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCampaignId, initialPlayerUserId, initialTab]);

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
      setSelectedPlayerId("");
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

  async function removePlayer(userId: string) {
    if (!draft) return;
    setSaving(true);
    try {
      const refreshed = await removeCampaignPlayer(draft.id, userId);
      setMembers(refreshed);
      if (selectedPlayerId === userId) setSelectedPlayerId("");
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
      router.push(`/heavens/characters/${aggregate.character.id}?source=campaigns&campaign=${draft.id}&player=${encodeURIComponent(userId)}`);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Character could not be created." });
      setSaving(false);
    }
  }

  const filteredRaces = useMemo(() => references?.races.filter((race) => !raceSearch || race.name.toLowerCase().includes(raceSearch.toLowerCase())) ?? [], [references, raceSearch]);

  return <main className="campaign-page">
    <header className="campaign-header"><Link href="/heavens" className="font-evanescent campaign-logo">SERRIAN<br />TIDE</Link><div><p>THE HEAVENS / CAMPAIGN CONTROL</p><h1 className="font-portcullion">Campaigns</h1><span>Creator-owned rules, access, and authorized content.</span></div><nav><Link href="/heavens">← The Heavens</Link><Link className="is-primary" href="/heavens/campaigns/new">New Campaign</Link></nav></header>
    {feedback ? <p className={`campaign-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <div className="campaign-workspace">
      <aside className="campaign-library"><header><p>YOUR WORLDS</p><h2>Campaign Library</h2></header><div>{campaigns.map((entry) => <button key={entry.id} type="button" className={selectedId === entry.id ? "is-selected" : ""} onClick={() => void openCampaign(entry.id)}><strong>{entry.name}</strong><span>{entry.playerCount} Players · {entry.characterCount} Characters · {entry.npcCount} NPCs</span><small>{entry.currencySystem}</small></button>)}{!campaigns.length ? <p>No Campaigns yet.</p> : null}</div></aside>
      {loading ? <section className="campaign-editor campaign-empty"><p>LOADING CAMPAIGN</p></section> : draft && references && members ? <section className="campaign-editor"><header className="campaign-editor-header"><div><p>CAMPAIGN {draft.id}</p><h2>{draft.name}</h2><span>{dirty ? "Unsaved changes" : "Saved"}</span></div><button type="button" disabled={saving || !dirty} onClick={() => void persist()}>{saving ? "Saving…" : "Save Campaign"}</button></header><nav className="campaign-tabs"><button className={tab === "rules" ? "is-active" : ""} onClick={() => setTab("rules")}>Rules & Systems</button><button className={tab === "races" ? "is-active" : ""} onClick={() => setTab("races")}>Allowed Races</button><button className={tab === "inventory" ? "is-active" : ""} onClick={() => setTab("inventory")}>Inventory Access</button><button className={tab === "players" ? "is-active" : ""} onClick={() => setTab("players")}>Players & Characters</button></nav><div className="campaign-editor-content">
        {tab === "rules" ? <Rules draft={draft} onChange={change} /> : null}
        {tab === "races" ? <Races draft={draft} races={filteredRaces} search={raceSearch} onSearch={setRaceSearch} onChange={change} /> : null}
        {tab === "inventory" ? <CampaignInventorySelector key={draft.id} campaignId={draft.id} tags={references.tags} selectedTagIds={draft.inventoryTagIds} selectedItemIds={draft.inventoryItemIds} onSelectedTagIdsChange={(inventoryTagIds) => change({ ...draft, inventoryTagIds })} onSelectedItemIdsChange={(inventoryItemIds) => change({ ...draft, inventoryItemIds })} /> : null}
        {tab === "players" ? <Players draft={draft} members={members} selectedPlayerId={selectedPlayerId} onSelectedPlayerIdChange={setSelectedPlayerId} saving={saving} onMembersChange={setMembers} onRemove={(userId) => void removePlayer(userId)} onCreate={(userId) => void createForPlayer(userId)} /> : null}
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

function Players({ draft, members, selectedPlayerId, onSelectedPlayerIdChange, saving, onMembersChange, onRemove, onCreate }: { draft: CampaignAdminDraft; members: CampaignMemberData; selectedPlayerId: string; onSelectedPlayerIdChange: (value: string) => void; saving: boolean; onMembersChange: (members: CampaignMemberData) => void; onRemove: (userId: string) => void; onCreate: (userId: string) => void }) {
  const selectedPlayer = members.players.find(({ userId }) => userId === selectedPlayerId) ?? null;
  const characters = selectedPlayerId
    ? scopeCampaignCharacters(members.characters, draft.id, selectedPlayerId)
    : [];
  return <div className="campaign-section"><SectionHeading eyebrow="MEMBERSHIP" title="Campaign → Player → Character" /><p className="campaign-help">Choose one Campaign Player to keep Character creation and editing scoped to this Campaign relationship.</p><CampaignPlayerPanel key={draft.id} campaignId={draft.id} members={members} onMembersChange={onMembersChange} onPlayerAdded={onSelectedPlayerIdChange} /><div className="campaign-player-add"><select value={selectedPlayerId} onChange={(event) => onSelectedPlayerIdChange(event.target.value)}><option value="">Choose Campaign Player</option>{members.players.map((player) => <option key={player.userId} value={player.userId}>{player.username} · {player.displayName}</option>)}</select><button type="button" disabled={!selectedPlayer || saving} onClick={() => selectedPlayer && onCreate(selectedPlayer.userId)}>New Character</button></div>{selectedPlayer ? <div className="campaign-player-list"><article><div><strong>{selectedPlayer.username}</strong><span>{selectedPlayer.displayName}</span></div><button className="is-danger" type="button" disabled={saving || characters.length > 0} onClick={() => onRemove(selectedPlayer.userId)}>Remove Player</button></article></div> : <p className="campaign-help">Select a Player to see only their Characters in this Campaign.</p>}<SectionHeading eyebrow="SELECTED PLAYER" title="Characters" /><div className="campaign-character-list">{characters.map((character) => <Link key={character.id} href={`/heavens/characters/${character.id}?source=campaigns&campaign=${draft.id}&player=${encodeURIComponent(selectedPlayerId)}`}><strong>{character.name}</strong><span>{character.playerName} · {character.creationCompletedAt ? "Complete" : "Creation Incomplete"}</span></Link>)}{selectedPlayerId && !characters.length ? <p>This Player has no Characters in this Campaign yet.</p> : null}{!selectedPlayerId ? <p>Select a Campaign Player first.</p> : null}</div><SectionHeading eyebrow="G.O.D. CHARACTERS" title="NPCs" /><div className="campaign-character-list">{members.npcs.map((npc) => <Link key={npc.id} href={npc.npcKind === "creature" ? `/heavens/npcs/${npc.id}` : `/heavens/characters/${npc.id}?source=campaigns&campaign=${draft.id}`}><strong>{npc.name}</strong><span>{npc.npcKind} NPC · {npc.creationCompletedAt ? "Complete" : "Draft"}</span></Link>)}<Link className="campaign-create-npc" href={`/heavens/npcs?campaign=${draft.id}`}>Open NPC Workshop →</Link></div></div>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) { return <header className="campaign-section-heading"><div><p>{eyebrow}</p><h3 className="font-portcullion">{title}</h3></div>{action && onAction ? <button type="button" onClick={onAction}>{action}</button> : null}</header>; }
