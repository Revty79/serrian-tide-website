"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { SpellCastDialog } from "@/app/characters/spell-cast-dialog";
import type { SpellCastRequest, SpellCastSourceRequest } from "@/features/characters/character-spell-runtime";
import type { RawCastingCircumstanceId } from "@/features/spell-construction/data/rawCastingRules";
import { createPlayerEncounterUiSnapshot } from "@/features/tabletop-operations/player-encounter-notifications";
import type { PlayerEncounterView } from "@/features/tabletop-operations/player-encounter-service";
import { PlayerLiveNotificationCenter } from "@/features/tabletop-operations/player-live-notification-center";
import { getHitLocationFromPercentile } from "@/features/tabletop-operations/roll-runtime";
import { TabletopLiveRefresh } from "@/features/tabletop-operations/tabletop-live-refresh";

import {
  declarePlayerReaction,
  holdPlayerInitiative,
  passPlayerInitiative,
  preparePlayerSpellAction,
  recordPlayerEncounterRoll,
  startPlayerSpellAction,
  startPlayerWeaponAction,
} from "./actions";

import "./player-encounter.css";

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The tabletop operation could not be completed.";
}

function displayStatus(value: string): string {
  return value.replaceAll("-", " ").toUpperCase();
}

export function PlayerEncounterConsole({ view }: { view: PlayerEncounterView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(
    view.participants.find(({ characterId }) => characterId !== view.character.identity.characterId)?.characterId
      ?? view.character.identity.characterId,
  );
  const [spellSource, setSpellSource] = useState<SpellCastSourceRequest | null>(null);
  const [rawCastingCircumstance, setRawCastingCircumstance] = useState<RawCastingCircumstanceId>("have-framework");
  const [rollMethod, setRollMethod] = useState<"random" | "entered">("random");
  const [rollPurpose, setRollPurpose] = useState<"free" | "attribute" | "skill" | "attack" | "defense" | "ability" | "other">("free");
  const [enteredTotal, setEnteredTotal] = useState("");
  const [rollLabel, setRollLabel] = useState("");
  const [rollTargetNumber, setRollTargetNumber] = useState("");
  const [rollLink, setRollLink] = useState("");

  const own = view.character;
  const ownInitiative = own.initiative;
  const weapons = own.equipment?.wieldedWeapons ?? [];
  const availableSpells = own.spellSources;
  const pendingAction = ownInitiative.enrolled ? ownInitiative.pendingAction : null;
  const reactionActionIds = ownInitiative.enrolled ? ownInitiative.reactionOpportunityActionIds : [];
  const reactionActions = view.participants.flatMap((participant) => (
    participant.pendingAction && reactionActionIds.includes(participant.pendingAction.id)
      ? [{ ...participant.pendingAction, actorName: participant.name }]
      : []
  ));
  const rollLinks = useMemo(() => [
    ...view.participants.flatMap((participant) => participant.pendingAction
      ? [{ value: `action:${participant.pendingAction.id}`, label: `Action - ${participant.name}: ${participant.pendingAction.label}` }]
      : []),
    ...view.reactions.map((reaction) => ({
      value: `reaction:${reaction.id}`,
      label: `Reaction - ${reaction.reactionType} #${reaction.id}`,
    })),
  ], [view.participants, view.reactions]);
  const notificationSnapshot = useMemo(() => createPlayerEncounterUiSnapshot(view), [view]);

  const run = (success: string, operation: () => Promise<unknown>) => {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void operation().then(() => {
        setNotice(success);
        router.refresh();
      }).catch((caught) => setError(messageFor(caught)));
    });
  };

  const prepareSpell = useCallback((request: SpellCastRequest) => (
    preparePlayerSpellAction(own.identity.characterId, request)
  ), [own.identity.characterId]);
  const queueSpell = useCallback(async (request: SpellCastRequest) => {
    await startPlayerSpellAction(
      own.identity.characterId,
      request,
      ownInitiative.enrolled && ownInitiative.canIntervene,
    );
    setNotice("Spell action entered the shared Initiative timeline. Mana and effects resolve only when the G.O.D. adjudicates the completed action.");
    router.refresh();
    return null;
  }, [own.identity.characterId, ownInitiative, router]);

  const health = own.health;
  const currentInitiative = ownInitiative.enrolled ? ownInitiative.currentInitiative : null;
  const mayBeginAction = ownInitiative.enrolled && (ownInitiative.canAct || ownInitiative.canIntervene);
  const activeConditions = own.effects?.conditions.filter(({ resolvedAt }) => resolvedAt === null) ?? [];
  const activeModifiers = own.effects?.modifiers.filter(({ endedAt }) => endedAt === null) ?? [];
  const unresolvedInjuries = health?.injuries.filter(({ resolved }) => !resolved) ?? [];
  const latestRoll = view.rolls[0] ?? null;
  const ownedItemCount = own.resources?.stacks.length ?? 0;

  const opportunity = reactionActions.length
    ? {
        kind: "reaction",
        title: "REACTION AVAILABLE",
        detail: `${reactionActions[0]!.actorName} is using ${reactionActions[0]!.label}.`,
      }
    : pendingAction
      ? {
          kind: "pending",
          title: "ACTION PENDING",
          detail: `${pendingAction.label} is moving through the shared Initiative timeline.`,
        }
      : mayBeginAction
        ? {
            kind: "action",
            title: "YOUR ACTION",
            detail: `You may act at Initiative ${currentInitiative ?? "the current table opportunity"}.`,
          }
        : ownInitiative.enrolled && ownInitiative.participationStatus === "holding"
          ? { kind: "holding", title: "HOLDING", detail: `You are holding Initiative ${currentInitiative}.` }
          : ownInitiative.enrolled && ownInitiative.participationStatus === "passed"
            ? { kind: "passed", title: "PASSED", detail: "You have passed for this Round." }
            : { kind: "waiting", title: "WAITING FOR TABLE", detail: "You currently have no action or Reaction opportunity." };

  return (
    <main className="player-encounter-console">
      <PlayerLiveNotificationCenter characterId={own.identity.characterId} snapshot={notificationSnapshot} />
      <div className="player-encounter-console__workspace">
        <header className="player-encounter-console__header">
          <div className="player-encounter-console__identity">
            <p>ACTIVE ENCOUNTER</p>
            <h1>{view.context.encounterTitle}</h1>
            <span>{view.context.sessionTitle} &middot; {view.context.sceneTitle} &middot; {view.context.campaignName}</span>
          </div>
          <div className="player-encounter-console__header-runtime" aria-label="Current table position">
            <span><small>ROUND</small><strong>{view.initiativeRuntime?.roundNumber ?? "—"}</strong></span>
            <span><small>STEP</small><strong>{view.initiativeRuntime?.stepNumber ?? "—"}</strong></span>
            <span><small>TIMELINE</small><strong>{view.initiativeRuntime?.timelineInitiative ?? "—"}</strong></span>
          </div>
          <div className="player-encounter-console__header-actions">
            <TabletopLiveRefresh mode="player" characterId={own.identity.characterId} />
            <Link href={`/realms/characters/${own.identity.characterId}`}>Character Sheet</Link>
          </div>
        </header>

        <section
          className={`player-encounter-console__opportunity is-${opportunity.kind}`}
          aria-live={opportunity.kind === "reaction" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          <span>{opportunity.title}</span>
          <strong>{opportunity.detail}</strong>
        </section>

        {error ? <p className="player-encounter-console__message is-error" role="alert">{error}</p> : null}
        {notice ? <p className="player-encounter-console__message" role="status">{notice}</p> : null}

        <div className="player-encounter-console__combat-grid">
          <section className="player-encounter-console__panel player-encounter-console__initiative-panel" aria-labelledby="player-initiative-heading">
            <p className="player-encounter-console__eyebrow">PRIMARY STATUS</p>
            <h2 id="player-initiative-heading">Your Initiative</h2>
            <strong className="player-encounter-console__initiative-number">{currentInitiative ?? "—"}</strong>
            <span className="player-encounter-console__initiative-status">
              {ownInitiative.enrolled ? displayStatus(ownInitiative.participationStatus) : "NOT ENROLLED"}
            </span>
            <small>{opportunity.title}</small>
            <div className="player-encounter-console__initiative-actions">
              <button
                disabled={busy || !ownInitiative.enrolled || !ownInitiative.canHold}
                onClick={() => run("Initiative held.", () => holdPlayerInitiative(own.identity.characterId))}
              >
                Hold
              </button>
              <button
                disabled={busy || !ownInitiative.enrolled || !ownInitiative.canPass}
                onClick={() => run("Initiative passed for this Round.", () => passPlayerInitiative(own.identity.characterId))}
              >
                Pass
              </button>
            </div>
          </section>

          <section className="player-encounter-console__panel player-encounter-console__critical-action" aria-labelledby="critical-action-heading">
            <p className="player-encounter-console__eyebrow">CRITICAL ACTION AREA</p>
            <h2 id="critical-action-heading">
              {reactionActions.length ? "Reaction" : pendingAction ? "Action in Progress" : mayBeginAction ? "Your Action" : "Current Opportunity"}
            </h2>
            {reactionActions.map((action) => (
              <article className="player-encounter-console__reaction-prompt" key={action.id}>
                <div><span>ATTACKER</span><strong>{action.actorName}</strong></div>
                <div><span>ACTION</span><strong>{action.label}</strong></div>
                <div className="player-encounter-console__reaction-controls">
                  <button disabled={busy} onClick={() => run("Dodge declared and Initiative committed.", () => declarePlayerReaction(own.identity.characterId, { pendingActionId: action.id, reactionType: "dodge" }))}>Dodge - 1 Initiative</button>
                  {weapons.filter(({ initiativeCost }) => initiativeCost !== null).map((weapon) => (
                    <span key={weapon.ownershipKey} className="player-encounter-console__defenses">
                      <button disabled={busy} onClick={() => run("Block declared.", () => declarePlayerReaction(own.identity.characterId, { pendingActionId: action.id, reactionType: "block", defendingItemId: weapon.itemId, defendingInstanceId: weapon.instanceId }))}>Block - {weapon.itemName}</button>
                      <button disabled={busy} onClick={() => run("Parry declared.", () => declarePlayerReaction(own.identity.characterId, { pendingActionId: action.id, reactionType: "parry", defendingItemId: weapon.itemId, defendingInstanceId: weapon.instanceId }))}>Parry - {weapon.itemName}</button>
                    </span>
                  ))}
                </div>
              </article>
            ))}
            {pendingAction && !reactionActions.length ? (
              <article className="player-encounter-console__pending-action">
                <strong>{pendingAction.label}</strong>
                <dl>
                  <div><dt>Remaining Cost</dt><dd>{pendingAction.remainingInitiativeCost}</dd></div>
                  <div><dt>Expected Completion</dt><dd>Initiative {pendingAction.expectedCompletionInitiative}</dd></div>
                  <div><dt>Status</dt><dd>{displayStatus(pendingAction.status)}</dd></div>
                </dl>
                <p>Rolls may be linked below. The G.O.D. still adjudicates the completed action.</p>
              </article>
            ) : null}
            {!pendingAction && !reactionActions.length ? (
              <div className="player-encounter-console__opportunity-detail">
                <strong>{opportunity.title}</strong>
                <span>{opportunity.detail}</span>
              </div>
            ) : null}
          </section>

          <section className="player-encounter-console__panel player-encounter-console__roll-panel" aria-labelledby="roll-panel-heading">
            <header className="player-encounter-console__panel-header">
              <div><p className="player-encounter-console__eyebrow">SHARED ROLL LEDGER</p><h2 id="roll-panel-heading">Percentile Roll</h2></div>
              <span>Hit Location is the ones digit of the same Attack Roll.</span>
            </header>
            <div className="player-encounter-console__roll-form">
              <label className="player-encounter-console__field"><span>Method</span><select value={rollMethod} onChange={(event) => setRollMethod(event.target.value as "random" | "entered")}><option value="random">System Random</option><option value="entered">Entered / Physical</option></select></label>
              <label className="player-encounter-console__field"><span>Purpose</span><select value={rollPurpose} onChange={(event) => setRollPurpose(event.target.value as typeof rollPurpose)}>{["free", "attribute", "skill", "attack", "defense", "ability", "other"].map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
              {rollMethod === "entered" ? <label className="player-encounter-console__field"><span>Physical result - 1 to 100</span><input type="number" min="1" max="100" value={enteredTotal} onChange={(event) => setEnteredTotal(event.target.value)} /></label> : null}
              <label className="player-encounter-console__field"><span>Label</span><input value={rollLabel} onChange={(event) => setRollLabel(event.target.value)} /></label>
              <label className="player-encounter-console__field"><span>Target Number - optional</span><input type="number" value={rollTargetNumber} onChange={(event) => setRollTargetNumber(event.target.value)} /></label>
              <label className="player-encounter-console__field"><span>Link - optional</span><select value={rollLink} onChange={(event) => setRollLink(event.target.value)}><option value="">No action or Reaction link</option>{rollLinks.map((link) => <option key={link.value} value={link.value}>{link.label}</option>)}</select></label>
              <button className="player-encounter-console__primary-button" disabled={busy || (rollMethod === "entered" && !enteredTotal)} onClick={() => run("Percentile Roll recorded for the table.", () => {
                const [linkKind, linkId] = rollLink.split(":");
                return recordPlayerEncounterRoll(own.identity.characterId, {
                  method: rollMethod,
                  purposeKind: rollPurpose,
                  enteredTotal: rollMethod === "entered" ? Number(enteredTotal) : null,
                  targetCharacterId: targetId,
                  pendingActionId: linkKind === "action" ? Number(linkId) : null,
                  reactionId: linkKind === "reaction" ? Number(linkId) : null,
                  label: rollLabel,
                  targetNumber: rollTargetNumber ? Number(rollTargetNumber) : null,
                });
              })}>{busy ? "Recording..." : "Roll Percentile"}</button>
            </div>
            {latestRoll ? (
              <div className="player-encounter-console__latest-roll" aria-label="Latest table Roll">
                <span>LATEST RESULT</span>
                <strong>{latestRoll.resultTotal}</strong>
                <small>{latestRoll.label || latestRoll.purposeKind}</small>
                {latestRoll.purposeKind === "attack" ? <b>Derived Hit Location {getHitLocationFromPercentile(latestRoll.resultTotal)}</b> : null}
              </div>
            ) : null}
          </section>

          <section className="player-encounter-console__panel player-encounter-console__state-panel" aria-labelledby="state-panel-heading">
            <p className="player-encounter-console__eyebrow">OWN CHARACTER ONLY</p>
            <h2 id="state-panel-heading">Your State</h2>
            <div className="player-encounter-console__state-cards">
              <article className="player-encounter-console__state-card is-health">
                <span>HEALTH</span>
                <strong>{health?.total.remainingHp ?? "—"} / {health?.total.maximumHp ?? "—"}</strong>
                <small><b>{health?.totalDamage ?? 0}</b> Total Damage</small>
              </article>
              <article className="player-encounter-console__state-card is-mana">
                <span>MANA</span>
                {own.mana?.pools.length ? own.mana.pools.map((pool) => <div key={pool.system}><small>{pool.system}</small><strong>{pool.currentMana} / {pool.maximumMana}</strong></div>) : <strong>None</strong>}
              </article>
              <article className="player-encounter-console__state-card">
                <span>ACTIVE EFFECTS</span>
                <strong>{activeConditions.length + activeModifiers.length}</strong>
                <small>Conditions: {activeConditions.length} &middot; Modifiers: {activeModifiers.length}</small>
              </article>
              <article className="player-encounter-console__state-card">
                <span>INJURIES</span>
                <strong>{unresolvedInjuries.length}</strong>
                <small>{unresolvedInjuries.map(({ name }) => name).join(", ") || "No unresolved Injuries"}</small>
              </article>
            </div>
            <details className="player-encounter-console__state-details">
              <summary>Health pools and active-effect details</summary>
              <h3>Health Pools</h3>
              <ul className="player-encounter-console__state-list">{health?.tracks.map((track) => <li key={track.key}><span>{track.name}</span><strong>{track.remainingHp ?? "—"} / {track.maximumHp ?? "—"}</strong><small>{track.damage} Damage</small></li>)}</ul>
              <h3>Conditions &amp; Modifiers</h3>
              <ul className="player-encounter-console__state-list">
                {own.effects?.conditions.map((effect) => <li key={`condition:${effect.id}`}><span>{effect.name}</span><small>{effect.resolvedAt ? "Resolved" : effect.duration.label}</small></li>)}
                {own.effects?.modifiers.map((effect) => <li key={`modifier:${effect.id}`}><span>{effect.label}</span><small>{effect.endedAt ? "Ended" : `${effect.amount >= 0 ? "+" : ""}${effect.amount} - ${effect.duration.label}`}</small></li>)}
              </ul>
            </details>
          </section>

          <section className="player-encounter-console__panel player-encounter-console__actions-panel" aria-labelledby="actions-panel-heading">
            <p className="player-encounter-console__eyebrow">AUTHORITATIVE SOURCES</p>
            <h2 id="actions-panel-heading">Actions</h2>
            {pendingAction ? (
              <div className="player-encounter-console__action-locked">
                <strong>Action picker paused</strong>
                <span>{pendingAction.label} is already in progress.</span>
              </div>
            ) : (
              <>
                <label className="player-encounter-console__field"><span>Target</span><select value={targetId} onChange={(event) => setTargetId(Number(event.target.value))}>{view.participants.map((participant) => <option key={participant.characterId} value={participant.characterId}>{participant.name} - {participant.kindLabel}</option>)}</select></label>
                <div className="player-encounter-console__action-group">
                  <h3>Weapons</h3>
                  <div className="player-encounter-console__action-list">
                    {weapons.map((weapon) => (
                      <button key={weapon.ownershipKey} disabled={busy || weapon.initiativeCost === null || !mayBeginAction} onClick={() => run(`${weapon.itemName} action entered the Initiative timeline.`, () => startPlayerWeaponAction(own.identity.characterId, {
                        targetCharacterId: targetId,
                        itemId: weapon.itemId,
                        instanceId: weapon.instanceId,
                        heldIntervention: ownInitiative.enrolled && ownInitiative.canIntervene,
                      }))}>
                        <strong>{weapon.itemName}</strong><span>{weapon.damage || "Direct damage pending"} &middot; {weapon.initiativeCost === null ? "G.O.D. timing ruling required" : `${weapon.initiativeCost} Initiative`}</span>
                      </button>
                    ))}
                    {!weapons.length ? <p>No wielded Weapon available. Equip and wield a Weapon on the Character Sheet first.</p> : null}
                  </div>
                </div>
                <div className="player-encounter-console__action-group">
                  <h3>Spells</h3>
                  {availableSpells.some(({ kind }) => kind === "raw-saved") ? <label className="player-encounter-console__field"><span>Saved Raw casting circumstance</span><select value={rawCastingCircumstance} onChange={(event) => setRawCastingCircumstance(event.target.value as RawCastingCircumstanceId)}><option value="have-spell">Have Spell</option><option value="have-framework">Have Framework</option><option value="no-framework">No Framework</option><option value="no-open-framework-slot">No Open Framework Slot</option></select></label> : null}
                  <div className="player-encounter-console__spell-list">
                    {availableSpells.map((source) => (
                      <button key={`${source.kind}:${source.kind === "catalog" ? source.allocationId : source.savedSpellId}`} disabled={busy || !mayBeginAction} onClick={() => setSpellSource(source.kind === "catalog"
                        ? { kind: "catalog", allocationId: source.allocationId }
                        : source.kind === "personal"
                          ? { kind: "personal", savedSpellId: source.savedSpellId }
                          : { kind: "raw-saved", savedSpellId: source.savedSpellId, circumstance: rawCastingCircumstance })}>
                        {source.name}{source.kind === "raw-saved" ? " - Saved Raw" : ""}
                      </button>
                    ))}
                    {!availableSpells.length ? <p>No eligible Spell source is available.</p> : null}
                  </div>
                </div>
                <div className="player-encounter-console__action-group">
                  <h3>Items</h3>
                  <p className="player-encounter-console__ruling">{ownedItemCount ? "G.O.D. TIMING RULING REQUIRED: direct Item use is blocked during active Initiative because Items do not have a universal authoritative timing cost." : "No owned Item stack is available."}</p>
                </div>
              </>
            )}
          </section>

          <section className="player-encounter-console__panel player-encounter-console__timeline-panel" aria-labelledby="timeline-panel-heading">
            <header className="player-encounter-console__panel-header"><div><p className="player-encounter-console__eyebrow">SHARED TABLE</p><h2 id="timeline-panel-heading">Participant Timeline</h2></div></header>
            <ol className="player-encounter-console__participants">
              {view.participants.map((participant) => (
                <li key={participant.characterId} className={participant.characterId === own.identity.characterId ? "is-self" : ""}>
                  <div><strong>{participant.name}</strong><small>{participant.kindLabel}</small></div>
                  <span className="player-encounter-console__participant-initiative"><small>INITIATIVE</small><b>{participant.currentInitiative ?? "—"}</b></span>
                  <span className="player-encounter-console__participant-status">{displayStatus(participant.participationStatus)}</span>
                  {participant.pendingAction ? <p>{participant.pendingAction.label}<small>{participant.pendingAction.remainingInitiativeCost} Initiative remaining</small></p> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="player-encounter-console__panel player-encounter-console__reaction-history" aria-labelledby="reaction-history-heading">
            <p className="player-encounter-console__eyebrow">YOUR CHARACTER</p>
            <h2 id="reaction-history-heading">Reaction History</h2>
            {view.reactions.length ? <ol className="player-encounter-console__state-list" aria-label="Your Reaction history">{view.reactions.map((reaction) => <li key={reaction.id}><span>{reaction.reactionType} - {reaction.status}</span><strong>{reaction.committedInitiativeCost} Initiative</strong><small>{reaction.outcome || "Awaiting G.O.D. resolution"}</small></li>)}</ol> : <p>No Reaction has been declared.</p>}
          </section>

          <section className="player-encounter-console__panel player-encounter-console__roll-history" aria-labelledby="roll-history-heading">
            <p className="player-encounter-console__eyebrow">TABLE VISIBLE ONLY</p>
            <h2 id="roll-history-heading">Roll History</h2>
            <ol className="player-encounter-console__rolls">
              {view.rolls.map((roll) => (
                <li key={roll.id}>
                  <strong>{roll.resultTotal}</strong>
                  <div><b>{roll.label || roll.purposeKind}</b><span>{roll.rollerCharacterName ?? "Table"} &middot; {roll.method} &middot; {roll.status}</span>{roll.purposeKind === "attack" ? <small>Derived Hit Location {getHitLocationFromPercentile(roll.resultTotal)}</small> : null}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      {spellSource ? <SpellCastDialog
        casterCharacterId={own.identity.characterId}
        source={spellSource}
        prepareCast={prepareSpell}
        executeCast={queueSpell}
        confirmationLabel="Confirm - Enter timed Spell action"
        onClose={() => setSpellSource(null)}
      /> : null}
    </main>
  );
}
