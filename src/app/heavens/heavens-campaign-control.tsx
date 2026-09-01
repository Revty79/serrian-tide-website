"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  createCharacterForPlayer,
  deleteCharacterAsGod,
} from "@/app/characters/actions";
import {
  getCampaignMembers,
  type CampaignAdminSummary,
  type CampaignMemberData,
} from "@/app/heavens/campaigns/actions";
import { CampaignPlayerPanel } from "@/app/heavens/campaigns/campaign-player-panel";
import { scopeCampaignCharacters } from "@/features/campaigns/campaign-membership";
import { getCampaignSettingsHref } from "@/features/campaigns/campaign-workflow";

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
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [membersError, setMembersError] = useState("");
  const [informationOpen, setInformationOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!campaignId) return () => { active = false; };
    getCampaignMembers(Number(campaignId))
      .then((data) => { if (active) setMembers(data); })
      .catch((error) => { if (active) setMembersError(error instanceof Error ? error.message : "Campaign context could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaignId]);

  function changeCampaign(nextCampaignId: string) {
    setCampaignId(nextCampaignId);
    setMembers(EMPTY_MEMBERS);
    setPlayerId("");
    setCharacterId("");
    setFeedback("");
    setMembersError("");
    setInformationOpen(false);
    setDeleteConfirmationOpen(false);
    setDeleteError("");
    setLoading(Boolean(nextCampaignId));
  }

  const playerCharacters = campaignId && playerId
    ? scopeCampaignCharacters(members.characters, Number(campaignId), playerId)
    : [];
  const selectedCampaign = campaigns.find(({ id }) => String(id) === campaignId) ?? null;
  const selectedCharacter = playerCharacters.find(
    ({ id }) => String(id) === characterId,
  ) ?? null;
  const selectedPlayer = members.players.find(
    ({ userId }) => userId === playerId,
  ) ?? null;

  async function newCharacter() {
    if (!campaignId || !playerId) return;
    setCreating(true);
    setFeedback("");
    try {
      const aggregate = await createCharacterForPlayer(Number(campaignId), playerId);
      const refreshedMembers = await getCampaignMembers(Number(campaignId));
      setMembers(refreshedMembers);
      setCharacterId(String(aggregate.character.id));
      setFeedback(`New Character was created for ${aggregate.character.playerUsername} and selected.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Character could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function permanentlyDeleteCharacter() {
    if (!selectedCharacter || !campaignId || deleting) return;
    setDeleting(true);
    setDeleteError("");
    setFeedback("");
    try {
      const deleted = await deleteCharacterAsGod(selectedCharacter.id);
      setMembers((current) => ({
        ...current,
        characters: current.characters.filter(
          (character) => character.id !== deleted.id,
        ),
      }));
      setCharacterId("");
      setDeleteConfirmationOpen(false);
      setFeedback(`${deleted.name} was permanently deleted.`);
      try {
        setMembers(await getCampaignMembers(Number(campaignId)));
      } catch {
        setFeedback(
          `${deleted.name} was permanently deleted. Campaign data could not be refreshed automatically.`,
        );
      }
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "The selected Character could not be deleted.",
      );
    } finally {
      setDeleting(false);
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
          onChange={(event) => { setPlayerId(event.target.value); setCharacterId(""); setDeleteConfirmationOpen(false); setDeleteError(""); }}
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
          onChange={(event) => { setCharacterId(event.target.value); setFeedback(""); setDeleteError(""); }}
          className="h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-300 outline-none backdrop-blur-sm disabled:opacity-50"
        >
          <option value="">{!playerId ? "Select a Player First" : "No Character Selected"}</option>
          {playerCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}{character.creationCompletedAt ? "" : " · Creation Incomplete"}</option>)}
        </select>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button type="button" disabled={!campaignId || !playerId || creating} onClick={() => void newCharacter()} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 text-sm text-amber-100/80 disabled:opacity-40">{creating ? "Creating…" : "New Character"}</button>
          {selectedCharacter ? <Link href={`/heavens/characters/${selectedCharacter.id}?source=heavens&campaign=${campaignId}&player=${encodeURIComponent(playerId)}`} className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/80">Edit Character</Link> : <span className="min-h-10 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400">Edit Character</span>}
          {selectedCharacter ? <button type="button" disabled={deleting} onClick={() => { setDeleteError(""); setDeleteConfirmationOpen(true); }} className="min-h-10 rounded-full border border-red-400/45 bg-red-500/10 px-4 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-40">Delete Character</button> : <span className="min-h-10 rounded-full border border-white/10 px-4 py-2.5 text-sm text-slate-400">Delete Character</span>}
        </div>
      </ControlRow>
      {deleteConfirmationOpen && selectedCharacter && selectedCampaign ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="presentation">
          <section className="w-full max-w-xl rounded-2xl border border-red-400/35 bg-[#080d13] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="delete-character-title">
            <p className="text-xs uppercase tracking-[0.16em] text-red-300">Permanent Character Deletion</p>
            <h2 id="delete-character-title" className="font-sans mt-2 text-2xl text-slate-100">Permanently delete {selectedCharacter.name}?</h2>
            <dl className="mt-5 grid gap-2 rounded-xl border border-white/10 bg-black/25 p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Character</dt><dd className="text-right text-slate-100">{selectedCharacter.name}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Player</dt><dd className="text-right text-slate-100">{selectedCharacter.playerName || selectedPlayer?.displayName || selectedPlayer?.username}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-400">Campaign</dt><dd className="text-right text-slate-100">{selectedCampaign.name}</dd></div>
            </dl>
            <p className="mt-5 text-sm leading-6 text-slate-300">This will permanently remove this Character and all Character-specific progression, Skills, possessions, spell records, and other saved Character data.</p>
            <p className="mt-3 text-sm font-semibold text-red-200">This cannot be undone.</p>
            {deleteError ? <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{deleteError}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={deleting} onClick={() => { setDeleteConfirmationOpen(false); setDeleteError(""); }} className="min-h-10 rounded-full border border-white/15 px-5 text-sm text-slate-300 disabled:opacity-40">Cancel</button>
              <button type="button" disabled={deleting} onClick={() => void permanentlyDeleteCharacter()} className="min-h-10 rounded-full border border-red-400/55 bg-red-500/20 px-5 text-sm font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-40">{deleting ? "Deleting Character…" : "Permanently Delete Character"}</button>
            </div>
          </section>
        </div>
      ) : null}
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
