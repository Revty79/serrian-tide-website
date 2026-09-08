"use client";

import { useState } from "react";

import styles from "./battle-layout.module.css";

export type CombatRecoveryAction = Readonly<{
  id: number;
  combatantName: string;
  actionName: string;
  detail: string;
}>;

export function CombatRecoveryCard({
  actions,
  busy = false,
  player = false,
  onContinue,
  onOpenAction,
}: {
  actions: readonly CombatRecoveryAction[];
  busy?: boolean;
  player?: boolean;
  onContinue?: () => void;
  onOpenAction?: (id: number) => void;
}) {
  const [openedActionId, setOpenedActionId] = useState<number | null>(null);

  if (!actions.length) return null;

  return <aside className={styles.recoveryCard} role="status" aria-labelledby="combat-recovery-title">
    <div className={styles.recoveryCopy}>
      <span>COMBAT NEEDS ATTENTION</span>
      <h2 id="combat-recovery-title">This combat still has unfinished actions</h2>
      <p>Combat was closed before these actions finished. Continue combat to finish them.</p>
    </div>

    <div className={styles.recoveryActions}>
      {actions.map((action) => {
        const open = openedActionId === action.id;
        return <article key={action.id}>
          <div>
            <strong>{action.combatantName}</strong>
            <span>{action.actionName}</span>
          </div>
          <button
            className="st-button"
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpenedActionId(open ? null : action.id);
              onOpenAction?.(action.id);
            }}
          >Open action</button>
          {open ? <div className={styles.recoveryActionDetail}>
            <span>{action.detail}</span>
            <small>Combat record #{action.id}</small>
          </div> : null}
        </article>;
      })}
    </div>

    <footer>
      {player
        ? <strong>Waiting for G.O.D. to continue combat.</strong>
        : <button className="st-button is-primary" type="button" disabled={busy} onClick={onContinue}>Continue combat</button>}
      <span>Your Initiative, rolls, health, and resources are preserved.</span>
    </footer>
  </aside>;
}
