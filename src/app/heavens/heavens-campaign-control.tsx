"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createCharacterForPlayer } from "@/app/characters/actions";
import {
  getCampaignMembers,
  type CampaignAdminSummary,
  type CampaignMemberData,
} from "@/app/heavens/campaigns/actions";
import { CampaignPlayerPanel } from "@/app/heavens/campaigns/campaign-player-panel";
import { LifecycleControls } from "@/app/heavens/lifecycle-controls";
import { scopeCampaignCharacters } from "@/features/campaigns/campaign-membership";
import { getCampaignSettingsHref } from "@/features/campaigns/campaign-workflow";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

const EMPTY_MEMBERS: CampaignMemberData = {
  players: [],
  candidates: [],
  characters: [],
  npcs: [],
};

export function HeavensCampaignControl({
  campaigns,
  initialCampaignId = null,
  initialPlayerUserId = null,
}: {
  campaigns: CampaignAdminSummary[];
  initialCampaignId?: number | null;
  initialPlayerUserId?: string | null;
}) {
  const validInitialCampaignId = campaigns.some(({ id }) => id === initialCampaignId)
    ? String(initialCampaignId)
    : "";
  const [campaignId, setCampaignId] = useState(validInitialCampaignId);
  const [playerId, setPlayerId] = useState(
    validInitialCampaignId ? initialPlayerUserId ?? "" : "",
  );
  const [characterId, setCharacterId] = useState("");
  const [members, setMembers] = useState<CampaignMemberData>(EMPTY_MEMBERS);
  const [loading, setLoading] = useState(Boolean(validInitialCampaignId));
  const [creating, setCreating] = useState(false);
  const [characterView, setCharacterView] = useState<"active" | "archived">("active");
  const [feedback, setFeedback] = useState("");
  const [membersError, setMembersError] = useState("");
  const [informationOpen, setInformationOpen] = useState(false);
  const preserveScroll = useInPlaceScrollPreservation();

  useEffect(() => {
    let active = true;
    if (!campaignId) return () => { active = false; };
    getCampaignMembers(Number(campaignId), { archivedCharacters: characterView === "archived" })
      .then((data) => { if (active) setMembers(data); })
      .catch((error) => { if (active) setMembersError(error instanceof Error ? error.message : "Campaign context could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaignId, characterView]);

  function changeCampaign(nextCampaignId: string) {
    setCampaignId(nextCampaignId);
    setMembers(EMPTY_MEMBERS);
    setPlayerId("");
    setCharacterId("");
    setFeedback("");
    setMembersError("");
    setInformationOpen(false);
    setCharacterView("active");
    setLoading(Boolean(nextCampaignId));
  }

  const playerCharacters = campaignId && playerId
    ? scopeCampaignCharacters(members.characters, Number(campaignId), playerId)
    : [];
  const selectedCampaign = campaigns.find(({ id }) => String(id) === campaignId) ?? null;
  const selectedCharacter = playerCharacters.find(
    ({ id }) => String(id) === characterId,
  ) ?? null;
  async function newCharacter() {
    if (!campaignId || !playerId) return;
    await preserveScroll(async () => {
      setCreating(true);
      setFeedback("");
      try {
        const aggregate = await createCharacterForPlayer(Number(campaignId), playerId);
        const refreshedMembers = await getCampaignMembers(Number(campaignId));
        setCharacterView("active");
        setMembers(refreshedMembers);
        setCharacterId(String(aggregate.character.id));
        setFeedback(`New Character was created for ${aggregate.character.playerUsername} and selected.`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Character could not be created.");
      } finally {
        setCreating(false);
      }
    });
  }

  async function changeCharacterView(nextView: "active" | "archived"): Promise<void> {
    if (!campaignId || nextView === characterView) return;
    await preserveScroll(async () => {
      setLoading(true);
      setFeedback("");
      try {
        setMembers(await getCampaignMembers(Number(campaignId), { archivedCharacters: nextView === "archived" }));
        setCharacterView(nextView);
        setCharacterId("");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Character archive could not be loaded.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function characterLifecycleCompleted(action: "archive" | "restore" | "delete"): Promise<void> {
    if (!campaignId || !selectedCharacter) return;
    const name = selectedCharacter.name;
    setMembers(await getCampaignMembers(Number(campaignId), { archivedCharacters: characterView === "archived" }));
    setCharacterId("");
    setFeedback(action === "delete"
      ? `${name} was permanently deleted.`
      : action === "archive"
        ? `${name} was archived.`
        : `${name} was restored.`);
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
          <button type="button" disabled={!selectedCampaign} onClick={() => setInformationOpen((current) => !current)} className="min-h-10 rounded-full border border-white/15 bg-black/20 px-4 py-2.5 text-sm text-slate-300 disabled:opacity-40">Campaign Information</button>
          <Link href={getCampaignSettingsHref(selectedCampaign?.id)} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Edit Campaign</Link>
          <Link href="/heavens/campaigns/new" className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Create Campaign</Link>
        </div>
      </ControlRow>

      {informationOpen && selectedCampaign ? (
        <section className="mb-2 rounded-2xl border border-white/10 bg-black/25 p-5">
          <header className="flex items-start justify-between gap-4">
            <div><p className="text-xs uppercase tracking-[0.14em] text-purple-200">Campaign Information</p><h3 className="font-sans mt-1 text-2xl text-slate-100">{selectedCampaign.name}</h3></div>
            <button type="button" onClick={() => setInformationOpen(false)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-400">Close</button>
          </header>
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-xs uppercase tracking-[0.14em] text-purple-200">Campaign Overview</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
              {selectedCampaign.overview || "No Campaign overview has been provided yet."}
            </p>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-300">Currency</dt><dd className="mt-1 text-slate-200">{selectedCampaign.currencySystem}</dd></div>
            <div><dt className="text-slate-300">Players</dt><dd className="mt-1 text-slate-200">{members.players.length}</dd></div>
            <div><dt className="text-slate-300">Characters</dt><dd className="mt-1 text-slate-200">{selectedCampaign.characterCount}</dd></div>
            <div><dt className="text-slate-300">NPCs</dt><dd className="mt-1 text-slate-200">{selectedCampaign.npcCount}</dd></div>
          </dl>
        </section>
      ) : null}

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
        <span className="text-xs text-slate-300 lg:text-right">{members.players.length} Campaign Players</span>
      </ControlRow>

      <CampaignPlayerPanel
        key={campaignId || "no-campaign"}
        campaignId={campaignId ? Number(campaignId) : null}
        members={members}
        loading={loading}
        loadError={membersError}
        onMembersChange={setMembers}
        onPlayerAdded={(userId) => {
          setPlayerId(userId);
          setCharacterId("");
        }}
      />

      <ControlRow label="Character" last>
        <select
          value={characterId}
          disabled={!playerId}
          onChange={(event) => { setCharacterId(event.target.value); setFeedback(""); }}
          className="h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-300 outline-none backdrop-blur-sm disabled:opacity-50"
        >
          <option value="">{!playerId ? "Select a Player First" : "No Character Selected"}</option>
          {playerCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}{character.archivedAt ? " · Archived" : character.creationCompletedAt ? "" : " · Creation Incomplete"}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button type="button" className={`min-h-10 rounded-full border px-4 text-sm ${characterView === "active" ? "border-amber-300/50 bg-amber-300/10 text-amber-100" : "border-white/15 text-slate-300"}`} disabled={!campaignId || loading} onClick={() => void changeCharacterView("active")}>Active</button>
          <button type="button" className={`min-h-10 rounded-full border px-4 text-sm ${characterView === "archived" ? "border-amber-300/50 bg-amber-300/10 text-amber-100" : "border-white/15 text-slate-300"}`} disabled={!campaignId || loading} onClick={() => void changeCharacterView("archived")}>Archived</button>
          <button type="button" disabled={!campaignId || !playerId || creating || characterView === "archived"} onClick={() => void newCharacter()} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 text-sm text-amber-100/80 disabled:opacity-40">{creating ? "Creating…" : "New Character"}</button>
          {selectedCharacter ? <Link href={`/heavens/characters/${selectedCharacter.id}?source=heavens&campaign=${campaignId}&player=${encodeURIComponent(playerId)}`} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Edit Character</Link> : <span className="min-h-10 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400">Edit Character</span>}
          {selectedCharacter ? <LifecycleControls target={{ entityKind: "player-character", entityId: selectedCharacter.id }} archived={Boolean(selectedCharacter.archivedAt)} onCompleted={({ action }) => characterLifecycleCompleted(action)} /> : <span className="min-h-10 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400">Character lifecycle</span>}
        </div>
      </ControlRow>
      {feedback ? <p className="mt-2 text-xs text-amber-100/80">{feedback}</p> : null}
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
      <span className="font-sans text-lg text-slate-200">{label}</span>
      {children[0]}
      <div className="sm:col-start-2 lg:col-start-auto">{children[1]}</div>
    </div>
  );
}
