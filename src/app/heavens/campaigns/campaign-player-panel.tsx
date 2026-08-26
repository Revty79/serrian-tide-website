"use client";

import { useState } from "react";

import {
  addCampaignPlayer,
  type CampaignMemberData,
} from "./actions";
import {
  getAddedCampaignPlayerSelection,
  getCampaignPlayerPanelState,
} from "@/features/campaigns/campaign-membership";

const roleLabels = {
  admin: "Admin",
  god: "G.O.D.",
  player: "Player",
} as const;

export function CampaignPlayerPanel({
  campaignId,
  members,
  loading = false,
  loadError = "",
  onMembersChange,
  onPlayerAdded,
}: {
  campaignId: number | null;
  members: CampaignMemberData;
  loading?: boolean;
  loadError?: string;
  onMembersChange: (members: CampaignMemberData) => void;
  onPlayerAdded?: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  async function addPlayer(userId: string) {
    if (!campaignId) return;
    setAddingUserId(userId);
    setFeedback(null);
    try {
      const refreshed = await addCampaignPlayer(campaignId, userId);
      onMembersChange(refreshed);
      const selectedPlayerId = getAddedCampaignPlayerSelection(refreshed, userId);
      if (selectedPlayerId) onPlayerAdded?.(selectedPlayerId);
      const player = refreshed.candidates.find((candidate) => candidate.userId === userId);
      setFeedback({
        kind: "success",
        message: `${player?.username ?? "Player"} was added. Campaign Player and Character controls are ready.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Player could not be added.",
      });
    } finally {
      setAddingUserId(null);
    }
  }

  const panelState = getCampaignPlayerPanelState({
    loading,
    error: loadError,
    candidateCount: members.candidates.length,
  });

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={!campaignId}
        onClick={() => {
          setOpen(true);
          setFeedback(null);
        }}
        className="min-h-10 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100/90 transition hover:border-amber-300/60 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add Player
      </button>

      {open ? (
        <section className="mt-4 rounded-2xl border border-purple-300/20 bg-purple-950/10 p-4 shadow-xl sm:p-5" aria-label="Add Campaign Player">
          <header className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-purple-200">Campaign Membership</p>
              <h3 className="font-portcullion mt-1 text-2xl text-slate-100">Add Player</h3>
              <span className="mt-1 block text-sm text-slate-500">
                Registered accounts with Player permission are eligible, including multi-role G.O.D.s and Admins.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="self-start rounded-full border border-white/15 px-4 py-2 text-xs text-slate-300 hover:border-white/30"
            >
              Close
            </button>
          </header>

          {feedback ? (
            <p
              role={feedback.kind === "error" ? "alert" : "status"}
              className={`mt-4 rounded-xl border p-3 text-sm ${
                feedback.kind === "success"
                  ? "border-emerald-300/25 bg-emerald-950/20 text-emerald-200"
                  : "border-red-300/25 bg-red-950/20 text-red-200"
              }`}
            >
              {feedback.message}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            {panelState === "loading" ? (
              <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-slate-400" role="status">
                Reading eligible Player accounts…
              </p>
            ) : panelState === "error" ? (
              <p className="rounded-xl border border-red-300/25 bg-red-950/20 p-4 text-sm text-red-200" role="alert">
                {loadError}
              </p>
            ) : panelState === "empty" ? (
              <p className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">
                No eligible Player accounts exist. An administrator must grant Player permission before an account can join this Campaign.
              </p>
            ) : (
              members.candidates.map((candidate) => (
                <article
                  key={candidate.userId}
                  className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-100">{candidate.username}</strong>
                      {candidate.isCampaignCreator ? (
                        <span className="rounded-full border border-amber-300/25 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-amber-200">
                          Campaign Creator
                        </span>
                      ) : null}
                    </div>
                    <span className="mt-1 block text-xs text-slate-500">{candidate.displayName}</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {candidate.roles.map((role) => (
                        <span key={role} className="rounded-full border border-purple-300/15 bg-purple-300/5 px-2 py-1 text-[0.65rem] text-purple-100">
                          {roleLabels[role]}
                        </span>
                      ))}
                    </div>
                  </div>
                  {candidate.isMember ? (
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-300/5 px-4 py-2 text-center text-xs text-emerald-200">
                      Added
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={addingUserId !== null}
                      onClick={() => void addPlayer(candidate.userId)}
                      className="rounded-full border border-amber-300/35 bg-amber-300/10 px-4 py-2 text-xs text-amber-100 disabled:opacity-40"
                    >
                      {addingUserId === candidate.userId ? "Adding…" : "Add"}
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
