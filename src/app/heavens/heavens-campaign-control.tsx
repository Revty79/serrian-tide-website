"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createCharacter } from "@/app/characters/actions";
import {
  getCampaignMembers,
  type CampaignAdminSummary,
  type CampaignMemberData,
} from "@/app/heavens/campaigns/actions";

const EMPTY_MEMBERS: CampaignMemberData = {
  players: [],
  candidates: [],
  characters: [],
  npcs: [],
};

export function HeavensCampaignControl({
  campaigns,
}: {
  campaigns: CampaignAdminSummary[];
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [members, setMembers] = useState<CampaignMemberData>(EMPTY_MEMBERS);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    if (!campaignId) return () => { active = false; };
    getCampaignMembers(Number(campaignId))
      .then((data) => { if (active) setMembers(data); })
      .catch((error) => { if (active) setFeedback(error instanceof Error ? error.message : "Campaign context could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaignId]);

  function changeCampaign(nextCampaignId: string) {
    setCampaignId(nextCampaignId);
    setMembers(EMPTY_MEMBERS);
    setPlayerId("");
    setCharacterId("");
    setFeedback("");
    setLoading(Boolean(nextCampaignId));
  }

  const playerCharacters = members.characters.filter((character) => character.playerUserId === playerId);

  async function newCharacter() {
    if (!campaignId || !playerId) return;
    setCreating(true);
    setFeedback("");
    try {
      const aggregate = await createCharacter(Number(campaignId), playerId);
      router.push(`/heavens/characters/${aggregate.character.id}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Character could not be created.");
      setCreating(false);
    }
  }

  return (
    <div className="mt-3">
      <ControlRow label="Campaign">
        <select
          value={campaignId}
          onChange={(event) => changeCampaign(event.target.value)}
          className="h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-300 outline-none backdrop-blur-sm"
        >
          <option value="">{campaigns.length ? "No Campaign Selected" : "No Campaigns Yet"}</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link href="/heavens/campaigns" className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">View Campaigns</Link>
          <Link href="/heavens/campaigns/new" className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Create Campaign</Link>
        </div>
      </ControlRow>

      <ControlRow label="Player">
        <select
          value={playerId}
          disabled={!campaignId || loading}
          onChange={(event) => { setPlayerId(event.target.value); setCharacterId(""); }}
          className="h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-300 outline-none backdrop-blur-sm disabled:opacity-50"
        >
          <option value="">{!campaignId ? "Select a Campaign First" : loading ? "Reading Players…" : "No Player Selected"}</option>
          {members.players.map((player) => <option key={player.userId} value={player.userId}>{player.username}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link href="/heavens/campaigns" className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Manage Players</Link>
        </div>
      </ControlRow>

      <ControlRow label="Character" last>
        <select
          value={characterId}
          disabled={!playerId}
          onChange={(event) => setCharacterId(event.target.value)}
          className="h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-300 outline-none backdrop-blur-sm disabled:opacity-50"
        >
          <option value="">{!playerId ? "Select a Player First" : "No Character Selected"}</option>
          {playerCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}{character.creationCompletedAt ? "" : " · Creation Incomplete"}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button type="button" disabled={!campaignId || !playerId || creating} onClick={() => void newCharacter()} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 text-sm text-amber-100/80 disabled:opacity-40">{creating ? "Creating…" : "New Character"}</button>
          {characterId ? <Link href={`/heavens/characters/${characterId}`} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Edit Character</Link> : <span className="min-h-10 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-600">Edit Character</span>}
        </div>
      </ControlRow>
      {feedback ? <p className="mt-2 text-xs text-red-300">{feedback}</p> : null}
    </div>
  );
}

function ControlRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: [React.ReactNode, React.ReactNode];
  last?: boolean;
}) {
  return (
    <div className={`grid gap-3 py-4 sm:grid-cols-[110px_minmax(0,1fr)] lg:grid-cols-[110px_minmax(0,1fr)_auto] lg:items-center ${last ? "" : "border-b border-white/10"}`}>
      <span className="font-portcullion text-lg text-slate-200">{label}</span>
      {children[0]}
      <div className="sm:col-start-2 lg:col-start-auto">{children[1]}</div>
    </div>
  );
}
