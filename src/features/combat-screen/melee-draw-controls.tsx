"use client";
import { useRef, useState } from "react";
import { drawCombatMeleeWeapon } from "./command-actions";
import type { readMeleeDrawOptions } from "@/features/tabletop-operations/combat-melee-draw-service";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import { initiativeAffordabilityIssue } from "@/features/tabletop-operations/initiative-affordability";

export function MeleeDrawControls({ scope, entity, options, disabled, refresh, expanded = false }: {
  scope: CombatScreenScope; entity: CombatEntity; options: Awaited<ReturnType<typeof readMeleeDrawOptions>>; disabled: boolean; refresh: () => Promise<void>; expanded?: boolean;
}) {
  const [selectedKey, setSelectedKey] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const running = useRef(false), retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const key = (entry: (typeof options)[number]) => `${entry.itemId}:${entry.instanceId ?? "stack"}`;
  const selected = options.find((entry) => key(entry) === selectedKey);
  const issue = disabled ? "Resolve the combat pause or blocking choice first."
    : !entity.canControl || !entity.canActNow ? entity.actionReason || "Wait for your action opportunity."
      : !selected ? "Choose an owned melee weapon to draw."
        : selected.cost === null ? "Set Draw Initiative in Heavens → Items → Weapon preparation."
          : initiativeAffordabilityIssue(selected.cost, entity.currentInitiative);
  async function draw() {
    if (running.current || issue || !selected) return;
    running.current = true; setBusy(true); setMessage("");
    const command = { characterId: entity.participantId, itemId: selected.itemId, instanceId: selected.instanceId }, fingerprint = JSON.stringify(command);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await drawCombatMeleeWeapon(scope, { ...command, requestKey: retry.current.key });
      setMessage(selected.cost === 0 ? "Weapon drawn and wielded." : "Drawing started. The weapon becomes wielded when the action finishes.");
      await refresh(); retry.current = null;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Drawing was not confirmed. Retry preserves your request."); }
    finally { running.current = false; setBusy(false); }
  }
  return <details open={expanded || undefined}><summary>Draw weapon</summary>
    {!options.length ? <p>All owned melee weapons are wielded, or no melee weapon is available to draw.</p> : null}
    <label className="st-field">Melee weapon<select className="st-control" disabled={busy} value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
      <option value="">Choose a weapon</option>{options.map((entry) => <option key={key(entry)} value={key(entry)}>{entry.name}</option>)}
    </select></label>
    <p role="status">{issue || `Draw ${selected?.name} — ${selected?.cost} Initiative. No Roll required.`}</p>
    <button className="st-button" disabled={busy || !!issue} onClick={() => void draw()}>Draw weapon</button>
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
