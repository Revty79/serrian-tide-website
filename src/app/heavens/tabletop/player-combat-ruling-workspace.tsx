"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { PlayerCombatRulingRequestView } from "@/features/tabletop-operations/player-combat-ruling-service";

import { ruleGodPlayerCombatRequest } from "./player-combat-ruling-actions";

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PlayerCombatRulingWorkspace({ encounterId, requests }: { encounterId: number; requests: readonly PlayerCombatRulingRequestView[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  if (!requests.length) return null;
  return <section className="tabletop-panel tabletop-player-rulings" aria-labelledby="player-combat-rulings-title">
    <header className="tabletop-panel-heading"><div><p className="tabletop-eyebrow">PLAYER COMBAT</p><h3 id="player-combat-rulings-title">Ruling requests</h3></div><span>{requests.filter(({ status }) => status === "pending" || status === "clarification-requested").length} open</span></header>
    <p>Review Player intent here. Global weapon mapping remains in Equipment; this workflow governs only the exact Character and Encounter request.</p>
    <div className="tabletop-player-ruling-list">{requests.map((request) => <article key={request.id}>
      <header><div><strong>#{request.id} · {request.characterName}</strong><span>{titleCase(request.requestType)} · {titleCase(request.status)}</span></div>{request.targetName ? <span>Target: {request.targetName}</span> : null}</header>
      <p>{request.intent}</p><small>{request.sourceKind} · {request.sourceRef || "No exact source"}{request.sourceInstanceId ? ` · instance #${request.sourceInstanceId}` : ""}</small><small>{request.blockedReason}</small>
      {request.godResponse ? <p>G.O.D. response: {request.godResponse}</p> : null}
      {request.status === "pending" || request.status === "clarification-requested" ? <form onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const status = String(form.get("status")) as "approved" | "rejected" | "clarification-requested";
        const response = String(form.get("response") ?? "");
        const penaltyText = String(form.get("penalty") ?? "");
        const rulingReason = String(form.get("rulingReason") ?? "");
        setMessage(null);
        startTransition(() => void ruleGodPlayerCombatRequest(encounterId, request.id, { status, response, calledShotPenalty: penaltyText ? Number(penaltyText) : null, rulingReason }).then(() => { setMessage({ error: false, text: `Request #${request.id} updated.` }); router.refresh(); }).catch((error: unknown) => setMessage({ error: true, text: error instanceof Error ? error.message : "The ruling could not be saved." })));
      }}>
        <label><span>Disposition</span><select name="status" defaultValue="approved"><option value="approved">Approve</option><option value="clarification-requested">Request clarification</option><option value="rejected">Reject</option></select></label>
        <label><span>Response / reason</span><textarea name="response" required maxLength={2000} /></label>
        {request.requestType === "called-shot" ? <><label><span>Called Shot penalty</span><input name="penalty" type="number" min={0} /></label><label><span>Penalty reason</span><input name="rulingReason" maxLength={2000} /></label></> : <label><span>Structured ruling note, if approved</span><input name="rulingReason" maxLength={2000} /></label>}
        <button disabled={busy}>Save ruling</button>
      </form> : null}
    </article>)}</div>
    {message ? <p className={message.error ? "tabletop-error" : "tabletop-success"} role={message.error ? "alert" : "status"}>{message.text}</p> : null}
  </section>;
}
