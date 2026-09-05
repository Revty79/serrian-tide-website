"use client";

import { useState } from "react";

import type { CharacterMagicSystem } from "@/features/characters/character-rules";
import type { ActiveManaView } from "@/features/active-state/active-mana";

import {
  restoreAllManaAction,
  restoreManaAction,
  restoreManaPoolAction,
  spendManaAction,
} from "./active-mana-actions";

import "./active-mana-panel.css";

type Props = {
  mana: ActiveManaView;
  disabled?: boolean;
  disabledReason?: string;
  onManaChange: (mana: ActiveManaView) => void;
};

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function inputAmount(value: string): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function ActiveManaPanel({ mana, disabled = false, disabledReason, onManaChange }: Props) {
  const [managing, setManaging] = useState(false);
  const [amounts, setAmounts] = useState<Partial<Record<CharacterMagicSystem, string>>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);

  if (!mana.pools.length) return null;

  async function run(label: string, operation: () => Promise<ActiveManaView>) {
    if (busy || disabled) return;
    setBusy(true);
    setFeedback(null);
    try {
      onManaChange(await operation());
      setFeedback({ kind: "success", message: label });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Active Mana could not be updated." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="active-mana-panel character-sheet__web-only-reference" aria-labelledby="active-mana-title">
    <header>
      <div><p>ACTIVE RESOURCES</p><h3 id="active-mana-title">Current Mana</h3><span>Maximum Mana remains derived from permanent Character mechanics. Only Mana Spent is stored.</span></div>
      <button type="button" disabled={busy || disabled} onClick={() => setManaging((current) => !current)}>{managing ? "Hide Controls" : "Manage Mana"}</button>
    </header>
    {disabled ? <p className="active-mana-panel__notice">{disabledReason ?? "Save or discard pending Character edits before changing runtime Mana."}</p> : null}
    {feedback ? <p className={`active-mana-panel__feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
    <div className="active-mana-panel__grid">
      {mana.pools.map((pool) => {
        const amount = amounts[pool.system] ?? "1";
        return <article key={pool.system}>
          <div className="active-mana-panel__identity"><span>{pool.system} Mana</span><strong>{displayNumber(pool.currentMana)} / {displayNumber(pool.maximumMana)}</strong><small>{displayNumber(pool.manaSpent)} Spent · Base Magic {displayNumber(pool.baseMagic)} · {displayNumber(pool.sourceSkillPoints)} {pool.sourceSkillName}</small><em>{pool.spellAccessLevel ?? "Below Apprentice"} spell access</em></div>
          {managing ? <div className="active-mana-panel__controls"><label><span>Amount</span><input type="number" min="0.01" step="any" value={amount} disabled={busy || disabled} onChange={(event) => setAmounts((current) => ({ ...current, [pool.system]: event.target.value }))} /></label><button type="button" disabled={busy || disabled} onClick={() => void run(`${pool.system} Mana spent.`, () => spendManaAction({ characterId: mana.characterId, system: pool.system, amount: inputAmount(amount) }))}>Spend</button><button type="button" disabled={busy || disabled || pool.manaSpent <= 0} onClick={() => void run(`${pool.system} Mana restored.`, () => restoreManaAction({ characterId: mana.characterId, system: pool.system, amount: inputAmount(amount) }))}>Restore</button><button type="button" disabled={busy || disabled || pool.manaSpent <= 0} onClick={() => void run(`${pool.system} Mana restored to full.`, () => restoreManaPoolAction({ characterId: mana.characterId, system: pool.system }))}>Restore Full</button></div> : null}
        </article>;
      })}
    </div>
    {managing && mana.pools.some(({ manaSpent }) => manaSpent > 0) ? <footer>{confirmRestoreAll ? <><span>Restore every current Mana pool to full?</span><button type="button" disabled={busy || disabled} onClick={() => setConfirmRestoreAll(false)}>Cancel</button><button type="button" className="is-danger" disabled={busy || disabled} onClick={() => void run("All current Mana pools were restored.", async () => { const result = await restoreAllManaAction(mana.characterId, true); setConfirmRestoreAll(false); return result; })}>Confirm Restore All</button></> : <button type="button" disabled={busy || disabled} onClick={() => setConfirmRestoreAll(true)}>Restore All Mana</button>}</footer> : null}
  </section>;
}
