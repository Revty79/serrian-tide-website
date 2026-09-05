"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getSuggestedCreatureXpTotal,
  splitSuggestedExperience,
} from "@/features/tabletop-operations/encounter-closeout";
import type { TabletopLifecyclePreview } from "@/features/lifecycle/tabletop-lifecycle-types";
import type { EncounterCloseoutView } from "@/features/tabletop-operations/encounter-closeout-service";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import { finalizeEncounterCloseout } from "./closeout-actions";
import { LifecycleConfirmationDialog } from "./lifecycle-confirmation-dialog";
import { previewTabletopLifecycleEntity } from "./lifecycle-actions";

type Feedback = { kind: "success" | "error"; message: string };

function timestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function bindingLabel(binding: EncounterCloseoutView["durations"]["bindings"][number]): string {
  const context = binding.durationKind === "scene"
    ? binding.sceneTitle
    : binding.encounterTitle ?? `Encounter #${binding.encounterId}`;
  const progress = binding.remainingValue === null ? binding.durationKind : `${binding.remainingValue} ${binding.durationKind} remaining`;
  return `${progress} · ${binding.status} · ${context}`;
}

export function EncounterCloseout({
  data,
  onOpenInitiative,
  onOpenCombatAid,
}: {
  data: EncounterCloseoutView;
  onOpenInitiative: () => void;
  onOpenCombatAid: () => void;
}) {
  const router = useRouter();
  const [selectedCreatures, setSelectedCreatures] = useState<Set<number>>(() => new Set());
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(
    data.recipients.map(({ characterId }) => [characterId, "0"]),
  ));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finalizeConfirmationOpen, setFinalizeConfirmationOpen] = useState(false);
  const [lifecyclePreview, setLifecyclePreview] = useState<TabletopLifecyclePreview | null>(null);
  const preserveScroll = useInPlaceScrollPreservation();
  const selectedCreatureIds = useMemo(() => [...selectedCreatures], [selectedCreatures]);
  const suggestedTotal = getSuggestedCreatureXpTotal(data.creatureRewardReferences, selectedCreatureIds);
  const historical = data.encounter.status === "completed";
  const rewardLocked = data.hasRewardHistory;

  function toggleCreature(characterId: number): void {
    setSelectedCreatures((current) => {
      const next = new Set(current);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  }

  function splitSuggestion(): void {
    const split = splitSuggestedExperience(suggestedTotal, data.recipients.length);
    if (split === null) return;
    setAmounts(Object.fromEntries(data.recipients.map(({ characterId }) => [characterId, String(split)])));
  }

  async function finalize(): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const awards = rewardLocked ? [] : data.recipients.map(({ characterId }) => ({
        characterId,
        amount: Number(amounts[characterId] ?? 0),
      }));
      await finalizeEncounterCloseout(data.encounter.id, { awards, rewardNote: note });
      setFinalizeConfirmationOpen(false);
      setLifecyclePreview(null);
      setFeedback({ kind: "success", message: "Encounter finalized. XP and Encounter completion committed together." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Encounter closeout failed." });
    } finally {
      setBusy(false);
    }
  }

  async function openFinalizeConfirmation(): Promise<void> {
    await preserveScroll(async () => {
      setBusy(true);
      setFeedback(null);
      try {
        const preview = await previewTabletopLifecycleEntity({
          entityKind: "encounter",
          entityId: data.encounter.id,
        });
        setLifecyclePreview(preview);
        setFinalizeConfirmationOpen(true);
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Encounter lifecycle preview could not be loaded." });
      } finally {
        setBusy(false);
      }
    });
  }

  return <section className="encounter-closeout">
    <header className="encounter-closeout-heading">
      <div><span>G.O.D. AUTHORITY</span><h6 className="font-sans">Encounter Closeout</h6><p>Review objective runtime state, choose any XP awards, then finalize once.</p></div>
      <em className={`tabletop-status is-${data.encounter.status}`}>{data.encounter.status}</em>
    </header>

    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
    {historical ? <p className="encounter-closeout-history"><strong>Historical closeout:</strong> completed {timestamp(data.encounter.completedAt)}. Rewards below are immutable Encounter history; Character state elsewhere remains living Campaign state.</p> : null}

    <div className="encounter-closeout-grid">
      <article>
        <header><span>RUNTIME STATUS</span><strong>{data.blockers.length ? "Closeout blocked" : "Ready for review"}</strong></header>
        <ul className="encounter-closeout-checks">
          <li className={data.initiative?.status === "active" ? "is-blocked" : "is-clear"}>{data.initiative?.status === "active" ? "Initiative Runtime is active" : "Initiative is closed or was not started"}</li>
          <li className={data.blockers.some(({ code }) => code.includes("action")) ? "is-blocked" : "is-clear"}>No unresolved pending/authored actions</li>
          <li className={data.blockers.some(({ code }) => code.includes("reaction")) ? "is-blocked" : "is-clear"}>No unresolved Reactions</li>
        </ul>
        {data.blockers.length ? <div className="encounter-closeout-blockers">{data.blockers.map((blocker, index) => <p key={`${blocker.code}:${blocker.characterId ?? "encounter"}:${index}`}>{blocker.message}</p>)}</div> : null}
        <footer><button type="button" onClick={onOpenInitiative}>Open Initiative Tracker</button><button type="button" onClick={onOpenCombatAid}>Open Combat Aid</button></footer>
      </article>

      <article>
        <header><span>DURATION REVIEW</span><strong>Authoritative lifecycle</strong></header>
        <dl className="encounter-closeout-summary">
          <div><dt>Combat remaining</dt><dd>{data.durations.combatDurationsRemaining}</dd></div>
          <div><dt>Scene continuing</dt><dd>{data.durations.sceneEffectsContinuing}</dd></div>
          <div><dt>Unbound warnings</dt><dd>{data.durations.unbound.length}</dd></div>
        </dl>
        {data.warnings.map((warning) => <p className="encounter-closeout-warning" key={warning}>{warning}</p>)}
        {data.durations.bindings.length ? <details><summary>Duration binding history ({data.durations.bindings.length})</summary><ul>{data.durations.bindings.map((binding) => <li key={binding.id}>{binding.effectKind} #{binding.effectId} · {bindingLabel(binding)}{binding.closeReason ? ` · ${binding.closeReason}` : ""}</li>)}</ul></details> : <p className="encounter-closeout-empty">No duration bindings are associated with these participants.</p>}
      </article>

      <article>
        <header><span>CREATURE REWARD REFERENCES</span><strong>Suggested only</strong></header>
        <p className="encounter-closeout-guidance">Unchecked by default. Health never decides whether a Creature counts.</p>
        <div className="encounter-closeout-creatures">{data.creatureRewardReferences.map((creature) => <label key={creature.characterId}>
          <input type="checkbox" disabled={historical || rewardLocked} checked={selectedCreatures.has(creature.characterId)} onChange={() => toggleCreature(creature.characterId)} />
          <span><b>{creature.name}</b><small>{creature.suggestedXp === null ? "No authored killXp suggestion" : `${creature.suggestedXp} XP authored suggestion`}</small></span>
        </label>)}{!data.creatureRewardReferences.length ? <p className="encounter-closeout-empty">No Creature Participant snapshots provide reward references.</p> : null}</div>
        <div className="encounter-closeout-total"><span>Selected suggested total</span><strong>{suggestedTotal} XP</strong></div>
      </article>

      <article>
        <header><span>RECIPIENTS</span><strong>{rewardLocked ? "Previously awarded" : "Manual G.O.D. award"}</strong></header>
        {data.rewards.length ? <div className="encounter-closeout-rewards">{data.rewards.map((reward) => <div key={reward.id}><span><b>{reward.characterName}</b><small>{timestamp(reward.awardedAt)}</small></span><strong>+{reward.amount} XP</strong>{reward.note ? <p>{reward.note}</p> : null}</div>)}</div> : <div className="encounter-closeout-recipients">{data.recipients.map((recipient) => <label key={recipient.characterId}>
          <span><b>{recipient.name}</b><small>{recipient.kindLabel} · {recipient.currentExperience} spendable XP · {recipient.totalExperience} lifetime spent</small></span>
          <input type="number" min="0" step="1" disabled={historical || busy} value={amounts[recipient.characterId] ?? "0"} onChange={(event) => setAmounts((current) => ({ ...current, [recipient.characterId]: event.target.value }))} aria-label={`XP award for ${recipient.name}`} />
        </label>)}</div>}
        {!rewardLocked && !historical ? <button type="button" disabled={busy || !data.recipients.length} onClick={splitSuggestion}>Split Suggested XP</button> : null}
        {!rewardLocked && !historical ? <label className="encounter-closeout-note"><span>Private Reward Note</span><textarea rows={4} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="Why this award was chosen, if useful." /></label> : null}
        {rewardLocked && !historical ? <p className="encounter-closeout-warning">This reopened Encounter already has immutable reward history. Re-completing it will grant no additional XP.</p> : null}
      </article>
    </div>

    {!historical ? <footer className="encounter-closeout-finalize">
      <div><strong>{data.canFinalize ? "Ready to finalize" : "Resolve every blocker first"}</strong><span>Zero XP is valid. Finalization does not heal, restore, delete, or reset Character state.</span></div>
      <button type="button" className="is-primary" disabled={busy || !data.canFinalize} onClick={() => void openFinalizeConfirmation()}>{busy ? "Finalizing…" : "Finalize Encounter"}</button>
    </footer> : null}
    <LifecycleConfirmationDialog
      open={finalizeConfirmationOpen}
      titleId="finalize-tabletop-encounter-title"
      eyebrow="Encounter Lifecycle"
      title={`Finalize ${data.encounter.title}?`}
      entityType="Encounter"
      preview={lifecyclePreview}
      consequence="This completes the Encounter and atomically records the entered spendable XP awards. It does not heal, restore, delete, or reset Character state."
      dependencies={(lifecyclePreview?.dependencies ?? [])
        .filter(({ count }) => count > 0)
        .map(({ label, count }) => `${label}: ${count}`)}
      notice={lifecyclePreview && !lifecyclePreview.canComplete
        ? "The current server state does not allow completion. Resolve its lifecycle prerequisites and try again."
        : "Cancel makes no changes. Award records created by finalization are immutable even if the Encounter is later reopened."}
      confirmLabel="Finalize Encounter"
      confirmDisabled={!lifecyclePreview?.canComplete}
      busy={busy}
      error={feedback?.kind === "error" ? feedback.message : undefined}
      onCancel={() => { setFinalizeConfirmationOpen(false); setLifecyclePreview(null); setFeedback(null); }}
      onConfirm={finalize}
    />
  </section>;
}
