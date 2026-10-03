"use client";
import { GuidedField } from "@/components/field-guidance";
import { useState } from "react";
import { ruleCombatSourceResolution } from "@/app/heavens/tabletop/action-declaration-actions";
import type { CombatSourceResolutionRuling } from "@/features/tabletop-operations/combat-source-resolution-service";
import type { FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import type { CombatEntity, CombatScreenScope } from "./screen-types";
import type { CombatSourceChoice } from "./choice-types";
import type { readCombatCommandSources } from "./command-actions";
import { combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
export function SourceRuling({ scope, entity, source, sources, authored, disabled, refresh, targetIds = [] }: { scope: CombatScreenScope; entity: CombatEntity; source: CombatSourceChoice; targetIds?: number[];
  sources: Awaited<ReturnType<typeof readCombatCommandSources>> | null; authored: FrozenActionSourceSnapshot | null; disabled: boolean; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(""), [governing, setGoverning] = useState(""), [reason, setReason] = useState(""), [cost, setCost] = useState("");
  const [scaling, setScaling] = useState<Record<string, "fixed" | "per-success">>({}), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const choices = sources?.defense?.governingChoices ?? [];
  const creatureAttack = source.kind === "creature-attack";
  const naturalAttack = source.kind === "race-natural-attack" || creatureAttack;
  const [missingTarget, setMissingTarget] = useState("");
  const [anatomyReason, setAnatomyReason] = useState("");
  return <details><summary>G.O.D. source ruling: {source.name}</summary><p className={styles.muted}>Supply only the missing mechanics for this exact source and combatant. Authored timing and effects remain authoritative.</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy || disabled) return; setBusy(true);
      try { await ruleCombatSourceResolution(scope.encounterId, { participantId: entity.participantId, sourceKind: source.kind as CombatSourceResolutionRuling["sourceKind"], sourceRef: source.ref,
        mode: mode as CombatSourceResolutionRuling["mode"], governing: creatureAttack ? { kind: "manual", label: source.name, originalTarget: source.attackTarget ?? Number(missingTarget) } : ["skill-roll", "attribute-roll", "opposed-roll"].includes(mode) ? choices.find((entry) => entry.key === governing)?.selection ?? null : null,
        effectScaling: naturalAttack ? {} : scaling, reason, ...(naturalAttack && anatomyReason.trim() ? { useRequirementsReason: anatomyReason } : {}), ...(naturalAttack && source.rangeMode === "aoe" ? { targetParticipantIds: targetIds } : {}), ...(cost === "" ? {} : { initiativeCost: Number(cost) }) }); setMessage("Source ruling recorded. Check the action again before committing."); await refresh(); }
      catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "The ruling was not recorded.")); }
      finally { setBusy(false); }
    }}><div className={styles.fields}><label className="st-field">Resolution method<select aria-label="Resolution method" className="st-control" required value={mode} onChange={(event) => setMode(event.target.value)}><option value="">Choose an explicit ruling</option>{!naturalAttack && <><option value="automatic-no-roll">No Roll</option><option value="skill-roll">Skill Roll</option><option value="attribute-roll">Attribute Roll</option></>}<option value="opposed-roll">Opposed Roll</option>{!naturalAttack && <option value="manual-god-ruling">Requires a specific outcome ruling</option>}</select></label>
    {creatureAttack ? <GuidedField label="Attack %" className="st-field" help="The authored percentage governs this Creature attack Roll. A G.O.D. ruling may fill a missing or invalid target; it cannot replace an existing numeric target with a Skill or Attribute calculation."><input aria-label="Attack %" className="st-control" type="number" step="any" required readOnly={source.attackTarget != null} value={source.attackTarget ?? missingTarget} onChange={event => setMissingTarget(event.target.value)} /><span className={styles.muted}>The authored percentage is authoritative. Supply a target only when this snapshot has none; explain the ruling below.</span></GuidedField> : ["skill-roll", "attribute-roll", "opposed-roll"].includes(mode) ? <label className="st-field">Exact governing source<select aria-label="Exact governing source" className="st-control" required value={governing} onChange={(event) => setGoverning(event.target.value)}><option value="">Choose an owned source</option>{choices.filter((entry) => mode === "opposed-roll" || entry.selection.kind === (mode === "skill-roll" ? "skill" : "attribute")).map((entry) => <option key={entry.key} value={entry.key}>{entry.label} · {entry.originalTarget}</option>)}</select></label> : null}
    <label className="st-field">Missing Initiative cost (if required)<input className="st-control" type="number" min="0.01" step="any" value={cost} onChange={(event) => setCost(event.target.value)} /></label><label className="st-field">Ruling reason<input className="st-control" required value={reason} onChange={(event) => setReason(event.target.value)} /></label></div>
    {naturalAttack && !creatureAttack ? <label className="st-field">Anatomy usability ruling (if required)<input aria-label="Anatomy usability ruling (if required)" className="st-control" value={anatomyReason} onChange={event => setAnatomyReason(event.target.value)} /><span className={styles.muted}>Explain why the required anatomy can perform this attack despite recorded injury. A structured unavailable body part cannot be overridden here.</span></label> : null}
    {naturalAttack && source.rangeMode === "aoe" ? <label className="st-field"><input type="checkbox" required />Confirm the {targetIds.length} selected AoE targets. Area membership comes from this ruling; damage and defenses still require individual outcome rulings.</label> : null}
    {!naturalAttack && authored?.effects.map((effect) => <label key={effect.key} className="st-field">{effect.effect?.kind ?? "Authored effect"} scaling<select className="st-control" value={scaling[effect.key] ?? ""} onChange={(event) => setScaling({ ...scaling, [effect.key]: event.target.value as "fixed" | "per-success" })}><option value="">Keep authored scaling</option><option value="fixed">Fixed authored amount</option>{mode !== "automatic-no-roll" && mode !== "manual-god-ruling" ? <option value="per-success">Per success</option> : null}</select></label>)}
    <button className="st-button" disabled={disabled || busy}>Record source ruling</button></form>{message ? <p role="status">{message}</p> : null}
  </details>;
}
