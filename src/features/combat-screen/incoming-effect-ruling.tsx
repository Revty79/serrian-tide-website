"use client";
import { useState } from "react";
import { ruleIncomingActionEffect } from "@/app/heavens/tabletop/action-effect-plan-actions";
import { storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";
import type { ActionEffectRowView } from "@/features/tabletop-operations/action-effect-plan-service";

export function IncomingEffectRuling({ encounterId, planId, effect, reason, disabled, run }: {
  encounterId: number; planId: number; effect: ActionEffectRowView; reason: string; disabled: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [amount, setAmount] = useState(""), [location, setLocation] = useState("");
  const resolution = storedIncomingResolution(effect.authoredValue);
  if (!resolution || ["applied", "declined", "manual-resolved"].includes(effect.status)) return null;
  const damage = resolution.input.source.mechanicalEffectKind === "health.damage";
  return <details open={effect.status === "requires-god-ruling"}><summary>Incoming effect decision</summary>
    {damage && <><label className="st-field">Final amount<input className="st-control" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="st-field">Incoming hit location<select className="st-control" value={location} onChange={(event) => setLocation(event.target.value)}>
        <option value="">Keep the recorded location</option>{resolution.input.target.applicationLocations?.map((entry) => <option key={entry.number} value={entry.number}>{entry.name}</option>)}
      </select></label></>}
    {(damage ? ["damage", "healing", "prevent"] as const : ["allow", "prevent"] as const).map((disposition) => <button className="st-button" type="button" key={disposition}
      disabled={disabled || !reason.trim() || ["damage", "healing"].includes(disposition) && amount === ""}
      onClick={() => void run(() => ruleIncomingActionEffect(encounterId, planId, effect.id, { disposition, reason,
        ...(amount === "" ? {} : { amount: Number(amount) }), ...(location === "" ? {} : { hitLocationNumber: Number(location) }) }))}>
      {disposition === "damage" ? "Rule damage" : disposition === "healing" ? "Rule Absorption healing" : disposition === "prevent" ? "Prevent effect" : "Allow effect"}
    </button>)}
    <p>The original calculation stays recorded. Use the ruling reason below, then confirm and apply the plan.</p>
  </details>;
}
