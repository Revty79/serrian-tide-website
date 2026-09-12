"use client";
import { useEffect, useRef, useState } from "react";
import { DEFENSE_INTERVENTION_TYPES, type DefenseInterventionType } from "@/features/tabletop-operations/defense-intervention";
import type { DefenseDeclarationInput } from "@/features/tabletop-operations/defense-intervention-service";
import { previewCombatDefense, submitCombatDefense, type readCombatCommandSources } from "./command-actions";
import type { CombatEntity, CombatScreenData, CombatScreenScope } from "./screen-types";
import { RollFields, emptyRoll, rollInput, combatMessage } from "./form-controls";
import styles from "./combat-screen.module.css";
export function DefensePanel({ scope, entity, data, sources, disabled, refresh }: { scope: CombatScreenScope; entity: CombatEntity; data: CombatScreenData; sources: Awaited<ReturnType<typeof readCombatCommandSources>> | null; disabled: boolean; refresh: () => Promise<void> }) {
  const [opportunity, setOpportunity] = useState(""), [kind, setKind] = useState<DefenseInterventionType>("dodge"), [weapon, setWeapon] = useState("");
  const [protect, setProtect] = useState(""), [governing, setGoverning] = useState(""), [cost, setCost] = useState(""), [reason, setReason] = useState("");
  const [manualTarget, setManualTarget] = useState(""), [rollRequired, setRollRequired] = useState(true);
  const [ability, setAbility] = useState("");
  const [roll, setRoll] = useState(emptyRoll), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [checked, setChecked] = useState<{ key: string; result: Awaited<ReturnType<typeof previewCombatDefense>> } | null>(null);
  const [previewError, setPreviewError] = useState<{ key: string; message: string } | null>(null);
  const running = useRef(false);
  const opportunities = data.projection?.declarations.flatMap((declaration) => declaration.opportunities.filter((entry) => entity.responseOpportunityIds.includes(entry.id)).map((entry) => ({ ...entry, declaration }))) ?? [];
  const selected = opportunities.find((entry) => String(entry.id) === opportunity) ?? (!opportunity && opportunities.length === 1 ? opportunities[0] : null);
  const source = sources?.defense?.weapons.find((entry) => entry.ownershipKey === weapon);
  const creatureSources = sources?.sources.filter((entry) => entry.kind === "creature-attack") ?? [];
  const creatureSource = creatureSources.find((entry) => entry.ref === weapon);
  const intervention = kind === "intervention" || kind === "tackle";
  const targets = selected?.declaration.lockedSnapshot?.targetCharacterIds ?? [];
  const input: DefenseDeclarationInput = { opportunityId: selected?.id ?? 0, reactionType: kind,
    protectedTargetCharacterId: Number(protect) || (targets.includes(entity.participantId) ? entity.participantId : targets.length === 1 ? targets[0] : 0),
    ...(source ? { itemId: source.itemId, instanceId: source.instanceId, sourceRef: source.ownershipKey } : {}),
    ...(creatureSource ? { sourceRef: creatureSource.ref } : {}),
    ...(scope.role === "god" ? { governingSelection: sources?.defense?.governingChoices.find((entry) => entry.key === governing)?.selection,
      initiativeCost: cost === "" ? undefined : Number(cost), godApprovalReason: reason, godOverrideReason: reason,
      ...(intervention ? { sourceKind: ability ? "derived-ability" as const : "manual" as const, derivedAbilityId: ability ? Number(ability.replace("derived-ability:", "")) : undefined,
        manualLabel: reason, manualTarget: manualTarget === "" ? sources?.defense?.governingChoices.find((entry) => entry.key === governing)?.originalTarget : Number(manualTarget), rollRequired } : {}) } : {}) };
  const fingerprint = JSON.stringify(input), preview = checked?.key === fingerprint ? checked.result : null;
  const canPreview = !!selected && entity.canControl && entity.canRespondNow;
  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    const timer = setTimeout(() => {
      void previewCombatDefense(scope, JSON.parse(fingerprint) as DefenseDeclarationInput)
        .then((result) => { if (active) { setChecked({ key: fingerprint, result }); setPreviewError(null); } })
        .catch((error: unknown) => { if (active) setPreviewError({ key: fingerprint, message: combatMessage(error instanceof Error ? error.message : "Defense is unavailable.") }); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, fingerprint, canPreview, data.projection?.stateToken]);
  return <div><p className={styles.muted}>{combatMessage(entity.responseReason ?? "Choose a response to this confirmed opportunity.")}</p>
    {entity.mustChooseNow ? <p className={styles.notice}>You can choose an ordinary action against your own legal target, Hold or Pass. A response requires G.O.D. confirmation. No reaction costs zero and keeps your ordinary choice.</p> : null}
    <div className={styles.fields}><label className="st-field">Respond to<select className="st-control" value={selected?.id ?? opportunity} onChange={(event) => setOpportunity(event.target.value)}><option value="">Choose a confirmed opportunity</option>{opportunities.map((entry) => <option key={entry.id} value={entry.id}>{entry.declaration.actorName} · {entry.declaration.lockedSnapshot?.label ?? entry.declaration.draft.label}</option>)}</select></label>
    <label className="st-field">Defense<select className="st-control" value={kind} onChange={(event) => setKind(event.target.value as DefenseInterventionType)}>{DEFENSE_INTERVENTION_TYPES.filter((entry) => scope.role === "god" || !["tackle", "intervention"].includes(entry)).map((entry) => <option key={entry}>{entry}</option>)}</select></label>
    <label className="st-field">Protect<select className="st-control" value={input.protectedTargetCharacterId || ""} onChange={(event) => setProtect(event.target.value)}><option value="">Choose the target being protected</option>{targets.map((id) => <option key={id} value={id}>{data.roster.find((entry) => entry.participantId === id)?.name}</option>)}</select></label>
    {kind === "block" || kind === "parry" ? <label className="st-field">Defending weapon<select className="st-control" value={weapon} onChange={(event) => setWeapon(event.target.value)}><option value="">Choose a defending weapon</option>{sources?.defense?.weapons.map((entry) => <option key={entry.ownershipKey} value={entry.ownershipKey}>{entry.name}</option>)}{creatureSources.map((entry) => <option key={entry.ref} value={entry.ref}>{entry.name}</option>)}</select></label> : null}</div>
    {scope.role === "god" && intervention ? <div className={styles.fields}><label className="st-field">Intervention source<select className="st-control" value={ability} onChange={(event) => setAbility(event.target.value)}><option value="">Specific G.O.D. ruling</option>{sources?.sources.filter((entry) => entry.kind === "derived-ability" && !entry.unavailable).map((entry) => <option key={entry.ref} value={entry.ref}>{entry.name}</option>)}</select></label><label className={styles.check}><input type="checkbox" checked={rollRequired} onChange={(event) => setRollRequired(event.target.checked)} /> This ruling requires a Roll</label>{rollRequired ? <label className="st-field">G.O.D. Roll target<input className="st-control" type="number" value={manualTarget} onChange={(event) => setManualTarget(event.target.value)} /></label> : null}</div> : null}
    {scope.role === "god" ? <details><summary>Specific defense ruling</summary><div className={styles.fields}><label className="st-field">Governing source<select className="st-control" value={governing} onChange={(event) => setGoverning(event.target.value)}><option value="">Use established governance</option>{sources?.defense?.governingChoices.map((entry) => <option key={entry.key} value={entry.key}>{entry.label} · {entry.originalTarget}</option>)}</select></label><label className="st-field">Missing authored cost<input className="st-control" type="number" min="0" step="any" value={cost} onChange={(event) => setCost(event.target.value)} /></label><label className="st-field">Ruling reason<input className="st-control" value={reason} onChange={(event) => setReason(event.target.value)} /></label></div></details> : null}
    {canPreview && !preview ? <p className={styles.notice}>{previewError?.key === fingerprint ? previewError.message : "Reading defense cost and Roll requirements…"}</p> : null}
    {preview ? <><p>{preview.source.label} · {preview.initiativeCost} Initiative</p>{preview.rollRequired ? <RollFields value={roll} onChange={setRoll} disabled={busy} /> : <p>No Roll required.</p>}
      <button className="st-button is-primary" disabled={disabled || busy || !entity.canControl || !entity.canRespondNow} onClick={async () => {
        if (running.current) return; running.current = true; setBusy(true);
        try { await submitCombatDefense(scope, input, preview.rollRequired ? rollInput(roll) : undefined); setMessage("Response committed."); await refresh(); }
        catch (error) { setMessage(combatMessage(error instanceof Error ? error.message : "Response was not confirmed.")); await refresh(); }
        finally { running.current = false; setBusy(false); }
      }}>Commit response{preview.rollRequired ? " & Roll" : ""}</button></> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
