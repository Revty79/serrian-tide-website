"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionType, DefenseSourceKind, OriginalActionDisposition } from "@/features/tabletop-operations/defense-intervention";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";
import { parsePhysicalPercentileInput } from "@/features/tabletop-operations/roll-runtime";

import {
  cancelDeclaredResponse,
  declareDefenseIntervention,
  recordDeclaredAttackRoll,
  recordDeclaredResponseRoll,
  removeDodgeSkillPathMapping,
  resolveDeclaredDefenses,
  ruleOnDefenseIntervention,
  saveDodgeSkillPathMapping,
} from "./defense-intervention-actions";

type Draft = {
  reactionType: DefenseInterventionType;
  protectedTargetCharacterId: number;
  itemKey: string;
  sourceKind: DefenseSourceKind;
  derivedAbilityId: number | null;
  initiativeCost: string;
  manualTarget: string;
  sourceRef: string;
  governingLabel: string;
  governingKey: string;
  purpose: string;
  reason: string;
  conditionalMappingId: number | null;
  opposesReactionId: number | null;
  rollRequired: boolean;
};

function initialDraft(targetId = 0): Draft {
  return {
    reactionType: "no-reaction",
    protectedTargetCharacterId: targetId,
    itemKey: "",
    sourceKind: "manual",
    derivedAbilityId: null,
    initiativeCost: "3",
    manualTarget: "",
    sourceRef: "",
    governingLabel: "",
    governingKey: "",
    purpose: "",
    reason: "",
    conditionalMappingId: null,
    opposesReactionId: null,
    rollRequired: true,
  };
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DefenseInterventionWorkspace({
  actions,
  defense,
  compact = false,
  selectedCombatantId = null,
  selectedDeclarationId = null,
}: {
  actions: ActionDeclarationWorkspaceView;
  defense: DefenseInterventionWorkspaceView;
  compact?: boolean;
  selectedCombatantId?: number | null;
  selectedDeclarationId?: number | null;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [dodgeEndpointSkillId, setDodgeEndpointSkillId] = useState(0);
  const [dodgeConditional, setDodgeConditional] = useState(false);
  const [dodgeCircumstance, setDodgeCircumstance] = useState("");
  const [attackPhysical, setAttackPhysical] = useState<Record<number, string>>({});
  const [responsePhysical, setResponsePhysical] = useState<Record<number, string>>({});
  const [manualAttacks, setManualAttacks] = useState<Record<number, { label: string; target: string }>>({});
  const pending = actions.declarations.flatMap((declaration) => declaration.opportunities
    .filter(({ status, requiresGodConfirmation, responderCharacterId }) => status === "pending"
      && !requiresGodConfirmation
      && (selectedDeclarationId === null || declaration.id === selectedDeclarationId)
      && (selectedCombatantId === null || responderCharacterId === selectedCombatantId)
      && defense.participants.find(({ characterId }) => characterId === responderCharacterId)?.choiceOwner === "god")
    .map((opportunity) => ({ declaration, opportunity })));
  const resolutionDeclarations = actions.declarations.filter(({ id, actorCharacterId, pendingActionId, status }) => {
    if (pendingActionId === null || !["rolling-ready", "rolling", "awaiting-god-ruling"].includes(status)) return false;
    if (selectedDeclarationId !== null) return id === selectedDeclarationId;
    return selectedCombatantId === null
      || actorCharacterId === selectedCombatantId
      || defense.reactions.some(({ declarationId, responderCharacterId }) => declarationId === id && responderCharacterId === selectedCombatantId);
  });
  const headingId = compact ? "defense-intervention-battle-heading" : "defense-intervention-heading";

  async function perform(work: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      setFeedback({ kind: "success", message });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The response operation failed." });
    } finally {
      setBusy(false);
    }
  }

  function physicalResult(value: string): number | null {
    try {
      return parsePhysicalPercentileInput(value);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The physical percentile result is invalid." });
      return null;
    }
  }

  function manualAttackTarget(declaration: ActionDeclarationWorkspaceView["declarations"][number]): { manualTarget?: number; manualLabel?: string } | null {
    if (declaration.lockedSnapshot?.governing?.status === "resolved") return {};
    const supplied = manualAttacks[declaration.id] ?? { label: "", target: "" };
    const label = supplied.label.trim();
    const target = Number(supplied.target);
    if (!label) {
      setFeedback({ kind: "error", message: "Enter the explicit G.O.D. governing label for this attack." });
      return null;
    }
    if (!supplied.target.trim() || !Number.isFinite(target)) {
      setFeedback({ kind: "error", message: "The manual attack roll-over target must be finite." });
      return null;
    }
    return { manualTarget: target, manualLabel: label };
  }

  function adjudicate(reaction: DefenseInterventionWorkspaceView["reactions"][number], disposition: Extract<OriginalActionDisposition, "continue" | "continue-modified" | "retarget" | "cancel">): void {
    const reason = window.prompt("Explicit G.O.D. ruling reason")?.trim();
    if (!reason) return;
    const modifiedOutcome = disposition === "continue-modified"
      ? window.prompt("Describe the explicit modifier to the original action")?.trim()
      : disposition === "retarget"
        ? window.prompt("Describe the explicit changed outcome or target")?.trim()
        : undefined;
    if ((disposition === "continue-modified" || disposition === "retarget") && !modifiedOutcome) return;
    const defenseSucceeded = ["dodge", "parry", "block"].includes(reaction.reactionType)
      ? window.confirm("Did this defense succeed under the final ruling?")
      : undefined;
    void perform(
      () => ruleOnDefenseIntervention(defense.context.encounterId, reaction.id, { disposition, reason, modifiedOutcome, defenseSucceeded }),
      `G.O.D. ruling recorded: ${disposition}.`,
    );
  }

  return <section className={`defense-intervention-workspace${compact ? " is-battle-focus" : ""}`} aria-labelledby={headingId}>
    <header>
      <div><span>DEFENSE &amp; INTERVENTION</span><h6 id={headingId} className="font-sans">Declare first, then Roll</h6></div>
      <strong>{pending.length} open opportunities</strong>
    </header>
    {!compact ? <p className="action-declaration-boundary">Initiative determines candidates. The G.O.D. confirms positioning and interventions. Server snapshots determine targets, costs, governing lineage, Rolls, comparisons, refunds, and attacker extensions.</p> : null}
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    {!compact ? <details className="defense-mapping-review">
      <summary>Global canonical Dodge paths ({defense.dodgeMappings.length})</summary>
      <p>These paths govern Dodge for every Character. Exact allocation lineage or the path root Attribute is resolved only when a response is declared.</p>
      {defense.dodgeMappings.length ? <ul>{defense.dodgeMappings.map((mapping) => <li key={mapping.id}><b>{mapping.pathLabel}</b> · {mapping.reviewState}{mapping.conditional ? ` · conditional: ${mapping.circumstanceLabel}` : ""} <button className="st-button is-danger" disabled={busy} onClick={() => void perform(() => removeDodgeSkillPathMapping(defense.context.encounterId, mapping.id), "Global Dodge path removed.")}>Remove</button></li>)}</ul> : <p className="tabletop-feedback is-error">No Dodge Skill paths are configured. Dodge remains unavailable until an exact canonical path is authored and approved.</p>}
      <div className="defense-mapping-editor">
        <label className="st-field"><span>Endpoint Skill</span><select className="st-control" disabled={busy} value={dodgeEndpointSkillId || ""} onChange={(event) => setDodgeEndpointSkillId(Number(event.target.value))}><option value="">Choose canonical endpoint</option>{defense.dodgeSkillOptions.map((option) => <option key={option.id} value={option.id} disabled={!option.valid}>{option.pathLabel || option.name}{option.valid ? "" : " · invalid ancestry"}</option>)}</select></label>
        <label className="st-field action-declaration-check"><input disabled={busy} type="checkbox" checked={dodgeConditional} onChange={(event) => setDodgeConditional(event.target.checked)} /><span>Conditional path</span></label>
        {dodgeConditional ? <label className="st-field"><span>Required circumstance</span><input className="st-control" disabled={busy} value={dodgeCircumstance} onChange={(event) => setDodgeCircumstance(event.target.value)} /></label> : null}
        <button className="st-button is-primary" disabled={busy || dodgeEndpointSkillId === 0} onClick={() => void perform(() => saveDodgeSkillPathMapping(defense.context.encounterId, { endpointSkillId: dodgeEndpointSkillId, conditional: dodgeConditional, circumstanceLabel: dodgeCircumstance, reviewState: "approved" }), "Global canonical Dodge path approved.")}>Add path</button>
      </div>
    </details> : null}

    <div className="defense-opportunity-list">
      {pending.map(({ declaration, opportunity }) => {
        const targets = declaration.lockedSnapshot?.targetCharacterIds ?? [];
        const draft = drafts[opportunity.id] ?? initialDraft(targets[0] ?? 0);
        const responder = defense.participants.find(({ characterId }) => characterId === opportunity.responderCharacterId);
        const weapon = responder?.weapons.find(({ ownershipKey }) => ownershipKey === draft.itemKey);
        const conditional = defense.dodgeMappings.filter(({ conditional, reviewState }) => conditional && reviewState === "approved");
        const opposedTackles = defense.reactions.filter((reaction) => reaction.declarationId === declaration.id
          && reaction.reactionType === "tackle"
          && reaction.declaration.targetCharacterId === opportunity.responderCharacterId
          && reaction.declaration.opposesReactionId === null
          && reaction.status !== "cancelled");
        return <article key={opportunity.id}>
          <header><div><span>{opportunity.source === "initiative" ? `INITIATIVE · ${opportunity.reachedAtInitiative}` : "G.O.D. EXCEPTION"}</span><strong>{opportunity.responderName}</strong></div><small>{declaration.actorName}: {declaration.draft.label}</small></header>
          <div className="defense-declaration-grid">
            <label className="st-field"><span>Response</span><select className="st-control" disabled={busy} value={draft.reactionType} onChange={(event) => {
              const reactionType = event.target.value as DefenseInterventionType;
              setDrafts({ ...drafts, [opportunity.id]: { ...draft, reactionType, initiativeCost: reactionType === "dodge" ? "1" : reactionType === "tackle" ? "3" : draft.initiativeCost } });
            }}><option value="no-reaction">No Defense</option><option value="dodge">Dodge · 1</option><option value="parry">Parry</option><option value="block">Block</option><option value="tackle">Tackle · 3</option><option value="intervention">G.O.D. Intervention</option></select></label>
            <label className="st-field"><span>Protected target</span><select className="st-control" disabled={busy} value={draft.protectedTargetCharacterId} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, protectedTargetCharacterId: Number(event.target.value) } })}>{targets.map((id) => <option key={id} value={id}>{defense.participants.find(({ characterId }) => characterId === id)?.name ?? `Character #${id}`}</option>)}</select></label>
            {draft.reactionType === "parry" || draft.reactionType === "block" ? <label className="st-field"><span>Wielded Item</span><select className="st-control" required disabled={busy} value={draft.itemKey} onChange={(event) => {
              const selected = responder?.weapons.find(({ ownershipKey }) => ownershipKey === event.target.value);
              setDrafts({ ...drafts, [opportunity.id]: { ...draft, itemKey: event.target.value, initiativeCost: selected?.initiativeCost === null ? "" : String(selected?.initiativeCost ?? "") } });
            }}><option value="">Choose Item</option>{responder?.weapons.map((entry) => <option key={entry.ownershipKey} value={entry.ownershipKey}>{entry.name} · {entry.initiativeCost === null ? "G.O.D. cost required" : `cost ${entry.initiativeCost}`}</option>)}</select></label> : null}
            {draft.reactionType === "dodge" && conditional.length ? <label className="st-field"><span>Conditional path</span><select className="st-control" disabled={busy} value={draft.conditionalMappingId ?? ""} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, conditionalMappingId: event.target.value ? Number(event.target.value) : null } })}><option value="">No conditional approval</option>{conditional.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.pathLabel} · {mapping.circumstanceLabel}</option>)}</select></label> : null}
            {opposedTackles.length ? <label className="st-field"><span>Answering Tackle</span><select className="st-control" disabled={busy} value={draft.opposesReactionId ?? ""} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, opposesReactionId: event.target.value ? Number(event.target.value) : null } })}><option value="">Not a Tackle response</option>{opposedTackles.map((reaction) => <option key={reaction.id} value={reaction.id}>Tackle #{reaction.id} by {reaction.responderName}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" ? <label className="st-field"><span>Source</span><select className="st-control" disabled={busy} value={draft.sourceKind} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, sourceKind: event.target.value as DefenseSourceKind, sourceRef: "", governingKey: "", itemKey: "" } })}><option value="manual">Manual G.O.D. ruling</option><option value="skill">Skill</option><option value="attribute">Straight Attribute</option><option value="weapon">Wielded weapon action</option><option value="item">Active Item</option><option value="spell">Saved Spell</option><option value="derived-ability">Reaction Derived Ability</option></select></label> : null}
            {draft.reactionType === "intervention" && draft.sourceKind === "derived-ability" ? <label className="st-field"><span>Derived Ability</span><select className="st-control" disabled={busy} value={draft.derivedAbilityId ?? ""} onChange={(event) => {
              const ability = responder?.reactionAbilities.find(({ id }) => id === Number(event.target.value));
              setDrafts({ ...drafts, [opportunity.id]: { ...draft, derivedAbilityId: ability?.id ?? null, initiativeCost: ability?.initiativeCost === null ? "" : String(ability?.initiativeCost ?? "") } });
            }}><option value="">Choose explicitly reaction-capable ability</option>{responder?.reactionAbilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.name} · {ability.initiativeCost === null ? "explicit cost required" : `cost ${ability.initiativeCost}`}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" && (draft.sourceKind === "skill" || draft.sourceKind === "attribute" || draft.sourceKind === "derived-ability") ? <label className="st-field"><span>Resolution</span><select className="st-control" disabled={busy || !draft.rollRequired} value={draft.governingKey} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, governingKey: event.target.value } })}><option value="">G.O.D. manual target below</option>{responder?.governingChoices.filter(({ selection }) => selection.kind === draft.sourceKind || draft.sourceKind === "derived-ability").map((choice) => <option key={choice.key} value={choice.key}>{choice.label} · {choice.originalTarget}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" && (draft.sourceKind === "weapon" || draft.sourceKind === "item") ? <label className="st-field"><span>Active Item</span><select className="st-control" disabled={busy} value={draft.itemKey} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, itemKey: event.target.value } })}><option value="">Choose Item</option>{responder?.weapons.map((entry) => <option key={entry.ownershipKey} value={entry.ownershipKey}>{entry.name}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" && draft.sourceKind === "spell" ? <label className="st-field"><span>Saved Spell</span><select className="st-control" disabled={busy} value={draft.sourceRef} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, sourceRef: event.target.value } })}><option value="">Choose Spell</option>{responder?.spells.map((spell) => <option key={spell.id} value={`spell:${spell.id}`}>{spell.name || `Spell #${spell.id}`} · {spell.tradition}</option>)}</select></label> : null}
            {draft.reactionType === "tackle" || draft.reactionType === "intervention" || ((draft.reactionType === "parry" || draft.reactionType === "block") && weapon?.initiativeCost === null) ? <label className="st-field"><span>Initiative Cost</span><input className="st-control" disabled={busy || draft.reactionType === "tackle"} type="number" min="0.000001" step="any" value={draft.initiativeCost} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, initiativeCost: event.target.value } })} /></label> : null}
            {draft.reactionType === "tackle" || draft.reactionType === "intervention" ? <>
              <label className="st-field"><span>Governing label</span><input className="st-control" disabled={busy || draft.governingKey !== ""} value={draft.governingLabel} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, governingLabel: event.target.value } })} placeholder="Exact G.O.D. governing source" /></label>
              <label className="st-field"><span>Roll-over target</span><input className="st-control" disabled={busy || !draft.rollRequired} type="number" step="any" value={draft.manualTarget} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, manualTarget: event.target.value } })} /></label>
              <label className="st-field action-declaration-check"><input disabled={busy} type="checkbox" checked={draft.rollRequired} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, rollRequired: event.target.checked } })} /><span>Requires Roll</span></label>
              <label className="st-field is-wide"><span>Purpose</span><input className="st-control" disabled={busy} value={draft.purpose} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, purpose: event.target.value } })} /></label>
            </> : null}
            {(draft.reactionType === "tackle" || draft.reactionType === "intervention" || draft.conditionalMappingId !== null || opportunity.responderCharacterId !== draft.protectedTargetCharacterId || ((draft.reactionType === "parry" || draft.reactionType === "block") && weapon?.initiativeCost === null)) ? <label className="st-field is-wide"><span>G.O.D. ruling reason</span><textarea className="st-control" disabled={busy} rows={2} value={draft.reason} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, reason: event.target.value } })} /></label> : null}
          </div>
          <button className="st-button is-primary" disabled={busy} onClick={() => void perform(() => declareDefenseIntervention(defense.context.encounterId, {
            opportunityId: opportunity.id,
            opposesReactionId: draft.opposesReactionId,
            reactionType: draft.reactionType,
            protectedTargetCharacterId: draft.protectedTargetCharacterId,
            sourceKind: draft.reactionType === "tackle" ? "manual" : draft.sourceKind,
            itemId: (draft.reactionType === "parry" || draft.reactionType === "block" ? weapon : responder?.weapons.find(({ ownershipKey }) => ownershipKey === draft.itemKey))?.itemId ?? null,
            instanceId: (draft.reactionType === "parry" || draft.reactionType === "block" ? weapon : responder?.weapons.find(({ ownershipKey }) => ownershipKey === draft.itemKey))?.instanceId ?? null,
            derivedAbilityId: draft.derivedAbilityId,
            sourceRef: draft.sourceRef,
            manualLabel: draft.governingLabel,
            manualTarget: draft.manualTarget ? Number(draft.manualTarget) : null,
            governingSelection: responder?.governingChoices.find(({ key }) => key === draft.governingKey)?.selection ?? null,
            conditionalDodgeMappingIds: draft.conditionalMappingId === null ? [] : [draft.conditionalMappingId],
            initiativeCost: draft.initiativeCost ? Number(draft.initiativeCost) : null,
            rollRequired: draft.reactionType === "no-reaction" ? false : draft.rollRequired,
            intendedMechanicalPurpose: draft.purpose,
            godApprovalReason: draft.reason,
          }), `${opportunity.responderName}'s ${draft.reactionType} declaration was locked and its Initiative committed.`)}>{draft.reactionType === "no-reaction" ? "No Defense" : `Declare ${titleCase(draft.reactionType)}`}</button>
        </article>;
      })}
      {!pending.length ? <p className="tabletop-empty">No unreconciled responder opportunities.</p> : null}
    </div>

    <div className="defense-resolution-list">
      {resolutionDeclarations.map((declaration) => {
        const reactions = defense.reactions.filter(({ declarationId }) => declarationId === declaration.id);
        return <article key={declaration.id}>
          <header><div><span>{declaration.status.toLocaleUpperCase()}</span><strong>{declaration.actorName}: {declaration.draft.label}</strong></div><small>{reactions.length} response declarations</small></header>
          <p>{declaration.rollState.message}</p>
          {declaration.lockedSnapshot?.governing?.status !== "resolved" && declaration.rollState.attackRollId === null ? <div className="defense-roll-controls"><label className="st-field"><span>G.O.D. governing label</span><input className="st-control" value={manualAttacks[declaration.id]?.label ?? ""} onChange={(event) => setManualAttacks({ ...manualAttacks, [declaration.id]: { label: event.target.value, target: manualAttacks[declaration.id]?.target ?? "" } })} /></label><label className="st-field"><span>Roll-over target</span><input className="st-control" inputMode="decimal" value={manualAttacks[declaration.id]?.target ?? ""} onChange={(event) => setManualAttacks({ ...manualAttacks, [declaration.id]: { label: manualAttacks[declaration.id]?.label ?? "", target: event.target.value } })} /></label></div> : null}
          {declaration.rollState.attackRollId === null ? <label className="st-field"><span>Physical attack result</span><input className="st-control" inputMode="numeric" pattern="[0-9]{1,3}" placeholder="01-99 or 00" value={attackPhysical[declaration.id] ?? ""} onChange={(event) => setAttackPhysical({ ...attackPhysical, [declaration.id]: event.target.value })} /></label> : null}
          <div className="defense-roll-controls">{declaration.rollState.attackRollId === null ? <><button className="st-button is-primary" disabled={busy} onClick={() => { const manual = manualAttackTarget(declaration); if (manual) void perform(() => recordDeclaredAttackRoll(defense.context.encounterId, declaration.id, { method: "random", ...manual }), "Attack Roll recorded. Any completed defenses were compared automatically."); }}>Roll attack</button><button className="st-button is-secondary" disabled={busy || !(attackPhysical[declaration.id] ?? "").trim()} onClick={() => { const result = physicalResult(attackPhysical[declaration.id] ?? ""); const manual = result === null ? null : manualAttackTarget(declaration); if (result !== null && manual) void perform(() => recordDeclaredAttackRoll(defense.context.encounterId, declaration.id, { method: "entered", enteredTotal: result, ...manual }), "Physical attack Roll recorded. Any completed defenses were compared automatically."); }}>Enter physical Roll</button></> : null}{!declaration.rollState.resolved && declaration.rollState.attackRollId !== null && !reactions.some(({ rollRequired, rollId, status }) => rollRequired && rollId === null && status === "declared") ? <button className="st-button is-secondary" disabled={busy} onClick={() => void perform(() => resolveDeclaredDefenses(defense.context.encounterId, declaration.id), "Defense comparison completed. No damage was applied.")}>Retry comparison</button> : null}</div>
          {reactions.map((reaction) => <div className="defense-reaction-card" key={reaction.id}>
            <div><span>{reaction.reactionType.toLocaleUpperCase()} · {reaction.status}</span><strong>{reaction.responderName} protects {reaction.protectedTargetName}</strong><small>{reaction.declaration.source.label} · committed {reaction.committedInitiativeCost} · {reaction.rollId === null ? "Roll not recorded" : "Roll recorded"}</small>{reaction.outcome ? <small>Outcome: {reaction.outcome} · final cost {reaction.defenderFinalCost ?? "pending"} · attacker +{reaction.attackerAdditionalCost ?? 0}</small> : null}</div>
            {reaction.status === "declared" && reaction.rollRequired && reaction.rollId === null ? <label className="st-field"><span>Physical {reaction.reactionType} result</span><input className="st-control" inputMode="numeric" pattern="[0-9]{1,3}" placeholder="01-99 or 00" value={responsePhysical[reaction.id] ?? ""} onChange={(event) => setResponsePhysical({ ...responsePhysical, [reaction.id]: event.target.value })} /></label> : null}
            <div>{reaction.status === "declared" && reaction.rollRequired && reaction.rollId === null ? <><button className="st-button is-primary" disabled={busy} onClick={() => void perform(() => recordDeclaredResponseRoll(defense.context.encounterId, reaction.id, { method: "random" }), `${titleCase(reaction.reactionType)} Roll recorded and compared when all Rolls were ready.`)}>Roll</button><button className="st-button is-secondary" disabled={busy || !(responsePhysical[reaction.id] ?? "").trim()} onClick={() => { const result = physicalResult(responsePhysical[reaction.id] ?? ""); if (result !== null) void perform(() => recordDeclaredResponseRoll(defense.context.encounterId, reaction.id, { method: "entered", enteredTotal: result }), `Physical ${reaction.reactionType} Roll recorded and compared when all Rolls were ready.`); }}>Enter physical Roll</button></> : null}{reaction.status === "declared" ? <button className="st-button is-danger" disabled={busy} onClick={() => { const reason = window.prompt("Cancellation reason")?.trim(); if (reason) void perform(() => cancelDeclaredResponse(defense.context.encounterId, reaction.id, reason), "Response cancelled; committed cost retained unless explicitly refunded."); }}>Cancel</button> : null}{reaction.status === "needs-ruling" ? <><button className="st-button is-primary" disabled={busy} onClick={() => adjudicate(reaction, "continue")}>Continue</button><button className="st-button" disabled={busy} onClick={() => adjudicate(reaction, "continue-modified")}>Modify</button><button className="st-button" disabled={busy} onClick={() => adjudicate(reaction, "retarget")}>Retarget</button><button className="st-button is-danger" disabled={busy} onClick={() => adjudicate(reaction, "cancel")}>Cancel action</button></> : null}</div>
            {reaction.events.length ? <details><summary>Audit · {reaction.events.length}</summary><ol>{reaction.events.map((event) => <li key={event.id}><b>{event.eventKind}</b> · {timestamp(event.createdAt)}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol></details> : null}
          </div>)}
        </article>;
      })}
    </div>
  </section>;
}
