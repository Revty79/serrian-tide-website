"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ComponentProps } from "react";

import type { PlayerCombatConsoleData } from "@/features/tabletop-operations/player-tabletop-console-service";
import { parsePhysicalPercentileInput } from "@/features/tabletop-operations/roll-runtime";

import {
  commitPlayerFirearmTrigger,
  firePlayerFirearmAttack,
  rollPlayerDeclaredAttack,
  rollPlayerDeclaredResponse,
} from "./player-combat-actions";
import {
  PlayerCombatConsole as CorePlayerCombatConsole,
} from "./player-combat-console-core";
import styles from "./player-tabletop.module.css";

export { PlayerCombatIntentButton } from "./player-combat-console-core";

type PlayerCombatConsoleProps = ComponentProps<typeof CorePlayerCombatConsole>;

type PriorityRollKind = "defense" | "attack" | "firearm-trigger" | "firearm-roll" | "firearm-finish";

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PriorityRollPanel({ characterId, combat }: { characterId: number; combat: PlayerCombatConsoleData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [entered, setEntered] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const pendingDefense = combat.defenses.reactions.find((reaction) => (
    reaction.responderCharacterId === characterId
    && reaction.rollRequired
    && reaction.rollId === null
    && reaction.status === "declared"
  )) ?? null;

  const pendingAttack = combat.declarations.declarations.find((declaration) => (
    declaration.actorCharacterId === characterId
    && declaration.status === "rolling-ready"
    && declaration.rollState.attackRollId === null
    && declaration.lockedSnapshot?.authoredSource?.resolutionMode !== "automatic-no-roll"
    && !declaration.draft.actionKind.startsWith("firearm-")
  )) ?? null;

  const pendingFirearm = combat.firearmAttacks.attacks.find((attack) => {
    const declaration = combat.declarations.declarations.find(({ id }) => id === attack.triggerDeclarationId);
    if (declaration?.actorCharacterId !== characterId) return false;
    if (attack.effectiveStatus === "trigger-ready") return true;
    return attack.status === "committed"
      && attack.triggerTimingStatus === "completed"
      && attack.responderOpportunities.every(({ status }) => status !== "pending");
  }) ?? null;

  let kind: PriorityRollKind | null = null;
  if (pendingDefense) kind = "defense";
  else if (pendingAttack) kind = "attack";
  else if (pendingFirearm?.effectiveStatus === "trigger-ready") kind = "firearm-trigger";
  else if (pendingFirearm?.attackRollId === null) kind = pendingFirearm ? "firearm-roll" : null;
  else if (pendingFirearm) kind = "firearm-finish";

  if (!kind) return null;

  const run = (action: () => Promise<unknown>, success: string) => {
    setMessage(null);
    startTransition(() => {
      void action().then(() => {
        setEntered("");
        setMessage({ error: false, text: success });
        router.refresh();
      }).catch((error: unknown) => {
        setMessage({ error: true, text: error instanceof Error ? error.message : "The combat Roll could not be completed." });
      });
    });
  };

  const enteredTotal = () => {
    try {
      return parsePhysicalPercentileInput(entered);
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Enter a valid percentile Roll." });
      return null;
    }
  };

  const defenseLabel = pendingDefense ? titleCase(pendingDefense.reactionType) : "Defense";
  const attackLabel = pendingAttack?.lockedSnapshot?.label ?? pendingAttack?.draft.label ?? "Attack";
  const firearmLabel = pendingFirearm?.itemName ?? "Firearm";
  const title = kind === "defense"
    ? `Roll ${defenseLabel}`
    : kind === "attack"
      ? `Roll ${attackLabel}`
      : kind === "firearm-trigger"
        ? `Pull the trigger — ${firearmLabel}`
        : kind === "firearm-roll"
          ? `Roll ${firearmLabel}`
          : `Finish firing — ${firearmLabel}`;
  const detail = kind === "defense"
    ? "Your defense is declared. Make this Roll now so the attack can resolve."
    : kind === "attack"
      ? "Your action is ready to resolve. Make the attack Roll now."
      : kind === "firearm-trigger"
        ? "The firearm is ready and the attack is committed. Pull the trigger to continue."
        : kind === "firearm-roll"
          ? "The trigger timing and response window are complete. Make the firearm Roll now."
          : "The Roll is recorded. Finish firing so ammunition and the attack result can resolve.";

  const rollRandom = () => {
    if (kind === "defense" && pendingDefense) {
      run(() => rollPlayerDeclaredResponse(characterId, combat.context.encounterId, pendingDefense.id, { method: "random" }), "Defense Roll recorded.");
      return;
    }
    if (kind === "attack" && pendingAttack) {
      run(() => rollPlayerDeclaredAttack(characterId, combat.context.encounterId, pendingAttack.id, { method: "random" }), "Attack Roll recorded.");
      return;
    }
    if (kind === "firearm-roll" && pendingFirearm) {
      run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, pendingFirearm.id, { method: "random" }), "Firearm Roll recorded.");
    }
  };

  const rollEntered = () => {
    const total = enteredTotal();
    if (total === null) return;
    if (kind === "defense" && pendingDefense) {
      run(() => rollPlayerDeclaredResponse(characterId, combat.context.encounterId, pendingDefense.id, { method: "entered", enteredTotal: total }), "Physical defense Roll recorded.");
      return;
    }
    if (kind === "attack" && pendingAttack) {
      run(() => rollPlayerDeclaredAttack(characterId, combat.context.encounterId, pendingAttack.id, { method: "entered", enteredTotal: total }), "Physical attack Roll recorded.");
      return;
    }
    if (kind === "firearm-roll" && pendingFirearm) {
      run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, pendingFirearm.id, { method: "entered", enteredTotal: total }), "Physical firearm Roll recorded.");
    }
  };

  return <section className={styles.combatPriority} aria-labelledby="player-priority-roll-title">
    <p className={styles.eyebrow}>ROLL NOW</p>
    <h2 id="player-priority-roll-title">{title}</h2>
    <p>{detail}</p>
    {kind === "firearm-trigger" && pendingFirearm ? <div className={styles.actionRow}>
      <button className="st-button is-primary" type="button" disabled={busy} onClick={() => run(() => commitPlayerFirearmTrigger(characterId, combat.context.encounterId, pendingFirearm.id), "Trigger pull committed.")}>Pull trigger</button>
    </div> : null}
    {kind === "firearm-finish" && pendingFirearm ? <div className={styles.actionRow}>
      <button className="st-button is-primary" type="button" disabled={busy} onClick={() => run(() => firePlayerFirearmAttack(characterId, combat.context.encounterId, pendingFirearm.id, { method: "random" }), "Firing completed from the recorded Roll.")}>Finish firing</button>
    </div> : null}
    {kind === "defense" || kind === "attack" || kind === "firearm-roll" ? <div className={styles.actionRow}>
      <input
        className="st-control"
        aria-label={kind === "defense" ? "Physical defense Roll" : kind === "firearm-roll" ? "Physical firearm Roll" : "Physical attack Roll"}
        inputMode="numeric"
        pattern="[0-9]{1,3}"
        placeholder="01-99 or 00"
        value={entered}
        onChange={(event) => setEntered(event.target.value)}
      />
      <button className="st-button is-primary" type="button" disabled={busy} onClick={rollRandom}>Website Roll</button>
      <button className="st-button is-secondary" type="button" disabled={busy || !entered.trim()} onClick={rollEntered}>Enter physical Roll</button>
    </div> : null}
    {message ? <p className={message.error ? styles.error : styles.notice} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
  </section>;
}

export function PlayerCombatConsole(props: PlayerCombatConsoleProps) {
  return <>
    <PriorityRollPanel characterId={props.characterId} combat={props.combat} />
    <CorePlayerCombatConsole {...props} />
  </>;
}
