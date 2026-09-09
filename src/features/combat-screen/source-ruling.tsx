"use client";
import { useState } from "react";
import { ruleCombatSourceResolution } from "@/app/heavens/tabletop/action-declaration-actions";
import type { CombatSourceResolutionRuling } from "@/features/tabletop-operations/combat-source-resolution-service";
import type { FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import type { CombatSourceChoice } from "./choice-types";
import type { readCombatCommandSources } from "./command-actions";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
export function SourceRuling({ scope, entity, source, sources, authored, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; source: CombatSourceChoice;
  sources: Awaited<ReturnType<typeof readCombatCommandSources>> | null; authored: FrozenActionSourceSnapshot | null; disabled: boolean; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(""), [governing, setGoverning] = useState(""), [reason, setReason] = useState(""), [cost, setCost] = useState("");
  const [scaling, setScaling] = useState<Record<string, "fixed" | "per-success">>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const choices = sources?.defense?.governingChoices ?? [];
  return <details><summary>G.O.D. source ruling: {source.name}</summary><p className={styles.muted}>Supply only the missing mechanics for this exact source and combatant. Authored timing and effects remain authoritative.</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy || disabled) return; setBusy(true);
      try { await ruleCombatSourceResolution(scope.encounterId, { participantId: entity.participantId, sourceKind: source.kind as CombatSourceResolutionRuling["sourceKind"], sourceRef: source.ref,
        mode: mode as CombatSourceResolutionRuling["mode"], governing: ["skill-roll", "attribute-roll", "opposed-roll"].includes(mode) ? choices.find((entry) => entry.key === governing)?.selection ?? null : null,
        effectScaling: scaling, reason, ...(cost === "" ? {} : { initiativeCost: Number(cost) }) }); setMessage("Source ruling recorded. Check the action again before committing."); await refresh(); }
      catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The ruling was not recorded.")); }
      finally { setBusy(false); }
    }}><div className={styles.fields}><label className="st-field">Resolution method<select className="st-control" required value={mode} onChange={(event) => setMode(event.target.value)}><option value="">Choose an explicit ruling</option><option value="automatic-no-roll">No Roll</option><option value="skill-roll">Skill Roll</option><option value="attribute-roll">Attribute Roll</option><option value="opposed-roll">Opposed Roll</option><option value="manual-god-ruling">Requires a specific outcome ruling</option></select></label>
    {["skill-roll", "attribute-roll", "opposed-roll"].includes(mode) ? <label className="st-field">Exact governing source<select className="st-control" required value={governing} onChange={(event) => setGoverning(event.target.value)}><option value="">Choose an owned source</option>{choices.filter((entry) => mode === "opposed-roll" || entry.selection.kind === (mode === "skill-roll" ? "skill" : "attribute")).map((entry) => <option key={entry.key} value={entry.key}>{entry.label} · {entry.originalTarget}</option>)}</select></label> : null}
    <label className="st-field">Missing Initiative cost (if required)<input className="st-control" type="number" min="0.01" step="any" value={cost} onChange={(event) => setCost(event.target.value)} /></label><label className="st-field">Ruling reason<input className="st-control" required value={reason} onChange={(event) => setReason(event.target.value)} /></label></div>
    {authored?.effects.map((effect) => <label key={effect.key} className="st-field">{effect.effect?.kind ?? "Authored effect"} scaling<select className="st-control" value={scaling[effect.key] ?? ""} onChange={(event) => setScaling({ ...scaling, [effect.key]: event.target.value as "fixed" | "per-success" })}><option value="">Keep authored scaling</option><option value="fixed">Fixed authored amount</option>{mode !== "automatic-no-roll" && mode !== "manual-god-ruling" ? <option value="per-success">Per success</option> : null}</select></label>)}
    <button className="st-button" disabled={disabled || busy}>Record source ruling</button></form>{message ? <p role="status">{message}</p> : null}
  </details>;
}
