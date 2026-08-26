"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createRaceNpc } from "@/app/characters/actions";
import {
  getCampaignMembers,
  type CampaignAdminSummary,
  type CampaignMemberData,
} from "@/app/heavens/campaigns/actions";
import {
  listCreatures,
  type CreatureSummary,
} from "@/app/heavens/creatures/actions";
import { createCreatureNpc } from "./actions";

const EMPTY_MEMBERS: CampaignMemberData = {
  players: [],
  candidates: [],
  characters: [],
  npcs: [],
};

export function NpcWorkspace({ campaigns }: { campaigns: CampaignAdminSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCampaign = searchParams.get("campaign") ?? "";
  const [campaignId, setCampaignId] = useState(initialCampaign);
  const [members, setMembers] = useState<CampaignMemberData>(EMPTY_MEMBERS);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(Boolean(initialCampaign));
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [creatureCreator, setCreatureCreator] = useState(false);
  const [creatureSearch, setCreatureSearch] = useState("");
  const [creatures, setCreatures] = useState<CreatureSummary[]>([]);
  const [selectedCreatureId, setSelectedCreatureId] = useState("");

  async function refresh(id: number) {
    setLoading(true);
    try { setMembers(await getCampaignMembers(id)); }
    catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "NPC archive could not be loaded." }); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!campaignId) return;
    let active = true;
    getCampaignMembers(Number(campaignId))
      .then((data) => { if (active) setMembers(data); })
      .catch((error) => {
        if (active) {
          setFeedback({ kind: "error", message: error instanceof Error ? error.message : "NPC archive could not be loaded." });
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaignId]);

  function changeCampaign(nextCampaignId: string) {
    setCampaignId(nextCampaignId);
    setMembers(EMPTY_MEMBERS);
    setCreatureCreator(false);
    setSelectedCreatureId("");
    setFeedback(null);
    setLoading(Boolean(nextCampaignId));
  }

  useEffect(() => {
    if (!creatureCreator) return;
    let active = true;
    const timer = window.setTimeout(() => {
      listCreatures({ search: creatureSearch, page: 1, pageSize: 100 })
        .then((page) => { if (active) setCreatures(page.items); })
        .catch((error) => { if (active) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature catalog could not be loaded." }); });
    }, 160);
    return () => { active = false; window.clearTimeout(timer); };
  }, [creatureCreator, creatureSearch]);

  const visibleNpcs = useMemo(() => members.npcs.filter((npc) => !search || npc.name.toLowerCase().includes(search.toLowerCase())), [members.npcs, search]);
  const selectedCampaign = campaigns.find((entry) => String(entry.id) === campaignId) ?? null;

  async function createRace() {
    if (!campaignId) return;
    setCreating(true); setFeedback(null);
    try {
      const created = await createRaceNpc(Number(campaignId));
      await refresh(Number(campaignId));
      router.push(`/heavens/characters/${created.character.id}`);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Race NPC could not be created." });
      setCreating(false);
    }
  }

  async function createCreature() {
    if (!campaignId || !selectedCreatureId) return;
    setCreating(true); setFeedback(null);
    try {
      const created = await createCreatureNpc(Number(campaignId), Number(selectedCreatureId));
      await refresh(Number(campaignId));
      router.push(`/heavens/npcs/${created.characterId}`);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature NPC could not be created." });
      setCreating(false);
    }
  }

  return <main className="npcs-page">
    <header className="npcs-header"><Link href="/heavens" className="font-evanescent npcs-logo">SERRIAN<br />TIDE</Link><div><p>THE HEAVENS / NPCS</p><h1 className="font-portcullion">NPC Master Sheet</h1><span>Create, find, and open every non-player Character from one Campaign archive.</span></div><nav><Link href="/heavens">← The Heavens</Link></nav></header>
    {feedback ? <p className={`npcs-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    <section className="npcs-control"><div><p>CAMPAIGN CONTEXT</p><h2 className="font-portcullion">Choose the NPC archive</h2></div><label><span>Campaign</span><select value={campaignId} onChange={(event) => changeCampaign(event.target.value)}><option value="">No Campaign Selected</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label><div><button type="button" disabled={!campaignId || creating} onClick={() => void createRace()}>{creating ? "Creating…" : "Create Race NPC"}</button><button type="button" disabled={!campaignId || creating} onClick={() => setCreatureCreator(true)}>Create Creature NPC</button></div></section>

    {creatureCreator ? <section className="npcs-creature-creator"><header><div><p>SECOND NPC CREATION PATH</p><h2 className="font-portcullion">Create from Master Creature</h2><span>The individual begins as a snapshot. The master Creature remains unchanged.</span></div><button type="button" onClick={() => setCreatureCreator(false)}>Close</button></header><input type="search" placeholder="Search master Creatures" value={creatureSearch} onChange={(event) => setCreatureSearch(event.target.value)} /><div className="npcs-creature-grid">{creatures.map((creature) => <button type="button" key={creature.id} className={selectedCreatureId === String(creature.id) ? "is-selected" : ""} onClick={() => setSelectedCreatureId(String(creature.id))}><strong>{creature.canonicalName}</strong><span>{creature.canonicalId} · {creature.creatureType || creature.family || "Creature"}</span><small>{creature.size} · CR {creature.challengeRating ?? "?"}</small></button>)}</div><footer><span>{selectedCreatureId ? `${creatures.find((entry) => String(entry.id) === selectedCreatureId)?.canonicalName ?? "Creature"} selected` : "Choose a master Creature."}</span><button type="button" disabled={!selectedCreatureId || creating} onClick={() => void createCreature()}>{creating ? "Creating…" : "Create Individual NPC"}</button></footer></section> : null}

    <section className="npcs-master"><header><div><p>MASTER NPC INDEX</p><h2 className="font-portcullion">{selectedCampaign?.name ?? "Select a Campaign"}</h2><span>{campaignId ? `${members.npcs.length} NPC records` : "NPCs live inside their Campaign."}</span></div><input type="search" disabled={!campaignId} placeholder="Search NPC names" value={search} onChange={(event) => setSearch(event.target.value)} /></header>{!campaignId ? <div className="npcs-empty"><strong>No Campaign Selected</strong><span>Choose a Campaign above.</span></div> : loading ? <div className="npcs-empty"><strong>Reading NPCs…</strong></div> : visibleNpcs.length ? <div className="npcs-grid">{visibleNpcs.map((npc) => <Link key={npc.id} href={npc.npcKind === "creature" ? `/heavens/npcs/${npc.id}` : `/heavens/characters/${npc.id}`}><span>NPC-{String(npc.id).padStart(4, "0")}</span><strong>{npc.name}</strong><small>{npc.npcKind === "creature" ? "Creature NPC · Individual Snapshot" : npc.creationCompletedAt ? "Completed Race NPC" : "Race NPC · G.O.D. Character Record"}</small></Link>)}</div> : <div className="npcs-empty"><strong>{search ? "No Matching NPCs" : "No NPCs Yet"}</strong><span>{search ? "Try a different name." : "Create the first NPC for this Campaign."}</span></div>}</section>
  </main>;
}
