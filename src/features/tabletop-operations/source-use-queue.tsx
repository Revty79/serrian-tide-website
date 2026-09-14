"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send, X } from "lucide-react";
import { cancelGodTabletopSourceUse, cancelPlayerTabletopSourceUse, confirmTabletopSourceUse, ruleTabletopSourceUse } from "@/app/tabletop/source-use-actions";
import type { SourceUseRequestView } from "./source-use";
import styles from "./source-use-queue.module.css";

function Request({ request, role, combatActive }: { request: SourceUseRequestView; role: "player" | "god"; combatActive: boolean }) {
  const router = useRouter();
  const [ruling, setRuling] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const submitting = useRef(false);
  const open = request.status === "pending" || request.status === "approved";
  async function run(work: () => Promise<unknown>, text: string) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ error: false, text });
      router.refresh();
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "The request could not be updated." });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return <article className={styles.request} aria-labelledby={`source-use-title-${request.id}`}>
    <header><div><h3 id={`source-use-title-${request.id}`}>{request.snapshot.name}</h3><span>{request.characterName} / Request #{request.id}</span></div><strong>{request.status === "approved" ? "Awaiting Player confirmation" : request.status}</strong></header>
    <p className={styles.intent}>{request.intent}</p>
    <dl><div><dt>Cost</dt><dd>{request.snapshot.cost}</dd></div><div><dt>Targets</dt><dd>{request.snapshot.targets.map(({ name }) => name).join(", ") || "As described in the intent"}</dd></div></dl>
    {request.snapshot.automaticEffects.length ? <div><h4>Mechanical effects</h4><ul>{request.snapshot.automaticEffects.map((effect, index) => <li key={index}>{effect}</li>)}</ul></div> : null}
    <div><h4>G.O.D. resolution</h4>{request.snapshot.manualEffects.map((effect, index) => <p key={index}><strong>{effect.title}</strong><br />{effect.description}</p>)}</div>
    {request.ruling ? <blockquote><strong>G.O.D. ruling</strong><p>{request.ruling}</p></blockquote> : null}
    {open && !request.contextActive ? <p className={styles.warning}>The original Session or Scene is no longer active.</p> : null}
    {open && combatActive ? <p className={styles.warning}>Active combat: resolve uses in the Encounter.</p> : null}
    {role === "god" && request.status === "pending" ? <form onSubmit={(event) => { event.preventDefault(); void run(() => ruleTabletopSourceUse({ requestId: request.id, decision: "approved", ruling }), "Approved; awaiting Player confirmation."); }}>
      <label className="st-field"><span>G.O.D. ruling for request #{request.id}</span><textarea className="st-control" required maxLength={4000} rows={3} disabled={busy} value={ruling} onChange={(event) => setRuling(event.target.value)} /></label>
      <div className={styles.actions}>
        <button className="st-button is-primary" type="submit" disabled={busy || !ruling.trim() || !request.contextActive || combatActive}><Check size={17} aria-hidden="true" />Approve</button>
        <button className="st-button is-danger" type="button" disabled={busy || !ruling.trim()} onClick={() => void run(() => ruleTabletopSourceUse({ requestId: request.id, decision: "rejected", ruling }), "Request rejected; no resources spent.")}><X size={17} aria-hidden="true" />Reject</button>
      </div>
    </form> : null}
    {open ? <div className={styles.actions}>
      {role === "player" && request.status === "approved" ? <button className="st-button is-primary" type="button" disabled={busy || !request.contextActive || combatActive} onClick={() => void run(() => confirmTabletopSourceUse(request.id), "Use completed.")}><Send size={17} aria-hidden="true" />Confirm use</button> : null}
      <button className="st-button" type="button" disabled={busy} onClick={() => void run(() => role === "god" ? cancelGodTabletopSourceUse(request.id) : cancelPlayerTabletopSourceUse(request.id), "Request cancelled; no resources spent.")}><X size={17} aria-hidden="true" />Cancel request</button>
    </div> : null}
    {feedback ? <p className={feedback.error ? styles.error : styles.feedback} role={feedback.error ? "alert" : "status"}>{feedback.text}</p> : null}
    <details><summary>Request history</summary><ol>{request.events.map((event, index) => <li key={index}><strong>{event.actor === "god" ? "G.O.D." : "Player"} / {event.status}</strong><p>{event.note}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol></details>
  </article>;
}

export function SourceUseQueue({ requests, role, combatActive = false }: { requests: readonly SourceUseRequestView[]; role: "player" | "god"; combatActive?: boolean }) {
  return <div className={styles.queue}>{requests.length ? requests.map((request) => <Request key={request.id} request={request} role={role} combatActive={combatActive} />) : <p>No spell or item requests.</p>}</div>;
}
