"use client";
import { useRef, useState } from "react";
import { declareGodCombatMovement } from "@/app/heavens/tabletop/action-declaration-actions";
import { declarePlayerCombatMovement, setPlayerInitiativeDisposition } from "@/app/realms/tabletop/player-combat-actions";
import { holdEncounterInitiative, passEncounterInitiative } from "@/app/heavens/tabletop/initiative-actions";
import { previewCombatMovement } from "./command-actions";
import type { CombatScreenScope } from "./screen-types";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
import { initiativeAffordabilityIssue } from "@/features/tabletop-operations/initiative-affordability";
export function MovementPanel({ scope, participantId, currentInitiative, modes, disabled, hold, holding, refresh }: { scope: CombatScreenScope; participantId: number; currentInitiative: number; modes: readonly { movementMode: string }[]; disabled: boolean; hold: boolean; holding: boolean; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(""), [distance, setDistance] = useState(""), [flee, setFlee] = useState(false);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewCombatMovement>> | null>(null);
  const request = useRef(""), running = useRef(false);
  const selectedMode = mode || modes[0]?.movementMode || "";
  const affordabilityIssue = preview ? initiativeAffordabilityIssue(preview.initiativeCost, currentInitiative) : null;
  function edited() { request.current = ""; setPreview(null); }
  async function run(operation: () => Promise<unknown>, success: string) {
    if (running.current) return; running.current = true; setBusy(true);
    try { await operation(); setMessage(success); request.current = ""; await refresh(); }
    catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The command was not confirmed.")); await refresh(); }
    finally { running.current = false; setBusy(false); }
  }
  return <div>{hold ? <><p className={styles.muted}>Hold costs zero Initiative, satisfies this choice and preserves the opportunity to intervene. Pass ends your choices for this round; unused Initiative carries into the next round.</p><div className={styles.actions}>
    {(["hold", "pass"] as const).map((disposition) => <button className="st-button" key={disposition} disabled={disabled || busy || disposition === "hold" && holding} onClick={() => void run(() => scope.role === "player" ? setPlayerInitiativeDisposition(scope.characterId, scope.encounterId, disposition) : disposition === "hold" ? holdEncounterInitiative(scope.encounterId, participantId) : passEncounterInitiative(scope.encounterId, participantId), disposition === "hold" ? "Holding Initiative. No further ordinary choice is required at this opportunity." : "Passed this round.")}>{disposition === "hold" ? "Hold Initiative" : "Pass this round"}</button>)}</div></> : <>
    <div className={styles.fields}><label className="st-field">Movement mode<select className="st-control" value={selectedMode} disabled={busy} onChange={(event) => { setMode(event.target.value); edited(); }}>{modes.map((entry) => <option key={entry.movementMode}>{entry.movementMode}</option>)}</select></label><label className="st-field">Distance in feet<input className="st-control" type="number" min="0.01" step="any" value={distance} disabled={busy} onChange={(event) => { setDistance(event.target.value); edited(); }} /></label></div>
    <label><input type="checkbox" checked={flee} disabled={busy} onChange={(event) => { setFlee(event.target.checked); edited(); }} /> Move to flee</label>{flee ? <p className={styles.muted}>You remain in combat until the G.O.D. confirms that you escaped. Normal attacks and responses still apply.</p> : null}
    <div className={styles.actions}><button className="st-button" disabled={busy || !selectedMode || !(Number(distance) > 0)} onClick={async () => { try { setPreview(await previewCombatMovement(scope, participantId, selectedMode, Number(distance))); setMessage(""); } catch (error) { setMessage(combatMessage(String(error instanceof Error ? error.message : error))); } }}>Check movement cost</button>
    {preview ? <><span>{preview.distance} feet · {preview.initiativeCost} Initiative</span>{preview.injuryTiming.explanation ? <p>{preview.injuryTiming.explanation}</p> : null}{affordabilityIssue ? <p role="status">{affordabilityIssue}</p> : null}<button className="st-button is-primary" disabled={disabled || busy || !!affordabilityIssue} onClick={() => void run(() => {
      request.current ||= crypto.randomUUID(); const command = { participantId, movementMode: selectedMode, distance: Number(distance), intent: flee ? "flee" as const : "move" as const, requestKey: request.current };
      return scope.role === "god" ? declareGodCombatMovement(scope.encounterId, command) : declarePlayerCombatMovement(scope.characterId, scope.encounterId, command);
    }, "Movement declared.")}>Declare movement</button></> : null}</div></>}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
