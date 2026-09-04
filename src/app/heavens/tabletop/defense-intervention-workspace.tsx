"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ActionDeclarationWorkspaceView } from "@/features/tabletop-operations/action-declaration-service";
import type { DefenseInterventionType, DefenseSourceKind, OriginalActionDisposition } from "@/features/tabletop-operations/defense-intervention";
import type { DefenseInterventionWorkspaceView } from "@/features/tabletop-operations/defense-intervention-service";

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

export function DefenseInterventionWorkspace({
  actions,
  defense,
}: {
  actions: ActionDeclarationWorkspaceView;
  defense: DefenseInterventionWorkspaceView;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [dodgeEndpointSkillId, setDodgeEndpointSkillId] = useState(0);
  const [dodgeConditional, setDodgeConditional] = useState(false);
  const [dodgeCircumstance, setDodgeCircumstance] = useState("");
  const pending = actions.declarations.flatMap((declaration) => declaration.opportunities
    .filter(({ status }) => status === "pending")
    .map((opportunity) => ({ declaration, opportunity })));

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

  function physicalResult(label: string): number | null {
    const value = window.prompt(`Enter the physical percentile result for ${label}.`);
    if (value === null) return null;
    const result = Number(value);
    if (!Number.isInteger(result) || result < 1 || result > 100) {
      setFeedback({ kind: "error", message: "A physical percentile result must be a whole number from 1 through 100." });
      return null;
    }
    return result;
  }

  function manualAttackTarget(declaration: ActionDeclarationWorkspaceView["declarations"][number]): { manualTarget?: number; manualLabel?: string } | null {
    if (declaration.lockedSnapshot?.governing?.status === "resolved") return {};
    const label = window.prompt("This action has no resolved governing source. Enter the explicit G.O.D. governing label.")?.trim();
    if (!label) return null;
    const supplied = window.prompt("Enter the explicit G.O.D. roll-over target.");
    if (supplied === null) return null;
    const target = Number(supplied);
    if (!Number.isFinite(target)) {
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

  return <section className="defense-intervention-workspace" aria-labelledby="defense-intervention-heading">
    <header>
      <div><span>DEFENSE &amp; INTERVENTION</span><h6 id="defense-intervention-heading" className="font-sans">Declare first, then Roll</h6></div>
      <strong>{pending.length} open opportunities</strong>
    </header>
    <p className="action-declaration-boundary">Initiative determines candidates. The G.O.D. confirms positioning and interventions. Server snapshots determine targets, costs, governing lineage, Rolls, comparisons, refunds, and attacker extensions.</p>
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <details className="defense-mapping-review">
      <summary>Global canonical Dodge paths ({defense.dodgeMappings.length})</summary>
      <p>These paths govern Dodge for every Character. Exact allocation lineage or the path root Attribute is resolved only when a response is declared.</p>
      {defense.dodgeMappings.length ? <ul>{defense.dodgeMappings.map((mapping) => <li key={mapping.id}><b>{mapping.pathLabel}</b> · {mapping.reviewState}{mapping.conditional ? ` · conditional: ${mapping.circumstanceLabel}` : ""} <button disabled={busy} onClick={() => void perform(() => removeDodgeSkillPathMapping(defense.context.encounterId, mapping.id), "Global Dodge path removed.")}>Remove</button></li>)}</ul> : <p className="tabletop-feedback is-error">No Dodge Skill paths are configured. Dodge remains unavailable until an exact canonical path is authored and approved.</p>}
      <div className="defense-mapping-editor">
        <label><span>Exact endpoint Skill</span><select disabled={busy} value={dodgeEndpointSkillId || ""} onChange={(event) => setDodgeEndpointSkillId(Number(event.target.value))}><option value="">Choose canonical endpoint</option>{defense.dodgeSkillOptions.map((option) => <option key={option.id} value={option.id} disabled={!option.valid}>{option.pathLabel || option.name}{option.valid ? "" : " · invalid ancestry"}</option>)}</select></label>
        <label className="action-declaration-check"><input disabled={busy} type="checkbox" checked={dodgeConditional} onChange={(event) => setDodgeConditional(event.target.checked)} /><span>Conditional path</span></label>
        {dodgeConditional ? <label><span>Required circumstance</span><input disabled={busy} value={dodgeCircumstance} onChange={(event) => setDodgeCircumstance(event.target.value)} /></label> : null}
        <button disabled={busy || dodgeEndpointSkillId === 0} onClick={() => void perform(() => saveDodgeSkillPathMapping(defense.context.encounterId, { endpointSkillId: dodgeEndpointSkillId, conditional: dodgeConditional, circumstanceLabel: dodgeCircumstance, reviewState: "approved" }), "Global canonical Dodge path approved.")}>Add Approved Path</button>
      </div>
    </details>

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
          <header><div><span>{opportunity.source === "initiative" ? `INITIATIVE · ${opportunity.reachedAtInitiative}` : "G.O.D. EXCEPTION"}</span><strong>{opportunity.responderName}</strong></div><small>Action #{declaration.id} · {declaration.draft.label}</small></header>
          <div className="defense-declaration-grid">
            <label><span>Response</span><select disabled={busy} value={draft.reactionType} onChange={(event) => {
              const reactionType = event.target.value as DefenseInterventionType;
              setDrafts({ ...drafts, [opportunity.id]: { ...draft, reactionType, initiativeCost: reactionType === "dodge" ? "1" : reactionType === "tackle" ? "3" : draft.initiativeCost } });
            }}><option value="no-reaction">No Defense</option><option value="dodge">Dodge · 1</option><option value="parry">Parry</option><option value="block">Block</option><option value="tackle">Tackle · 3</option><option value="intervention">G.O.D. Intervention</option></select></label>
            <label><span>Protected target</span><select disabled={busy} value={draft.protectedTargetCharacterId} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, protectedTargetCharacterId: Number(event.target.value) } })}>{targets.map((id) => <option key={id} value={id}>{defense.participants.find(({ characterId }) => characterId === id)?.name ?? `Character #${id}`}</option>)}</select></label>
            {draft.reactionType === "parry" || draft.reactionType === "block" ? <label><span>Exact wielded Item</span><select required disabled={busy} value={draft.itemKey} onChange={(event) => {
              const selected = responder?.weapons.find(({ ownershipKey }) => ownershipKey === event.target.value);
              setDrafts({ ...drafts, [opportunity.id]: { ...draft, itemKey: event.target.value, initiativeCost: selected?.initiativeCost === null ? "" : String(selected?.initiativeCost ?? "") } });
            }}><option value="">Choose Item</option>{responder?.weapons.map((entry) => <option key={entry.ownershipKey} value={entry.ownershipKey}>{entry.name} · {entry.initiativeCost === null ? "G.O.D. cost required" : `cost ${entry.initiativeCost}`}</option>)}</select></label> : null}
            {draft.reactionType === "dodge" && conditional.length ? <label><span>Conditional path</span><select disabled={busy} value={draft.conditionalMappingId ?? ""} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, conditionalMappingId: event.target.value ? Number(event.target.value) : null } })}><option value="">No conditional approval</option>{conditional.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.pathLabel} · {mapping.circumstanceLabel}</option>)}</select></label> : null}
            {opposedTackles.length ? <label><span>Answering declared Tackle</span><select disabled={busy} value={draft.opposesReactionId ?? ""} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, opposesReactionId: event.target.value ? Number(event.target.value) : null } })}><option value="">Not a Tackle response</option>{opposedTackles.map((reaction) => <option key={reaction.id} value={reaction.id}>Tackle #{reaction.id} by {reaction.responderName}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" ? <label><span>Source mode</span><select disabled={busy} value={draft.sourceKind} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, sourceKind: event.target.value as DefenseSourceKind, sourceRef: "", governingKey: "", itemKey: "" } })}><option value="manual">Manual G.O.D. ruling</option><option value="skill">Exact Skill</option><option value="attribute">Straight Attribute</option><option value="weapon">Owned wielded weapon action</option><option value="item">Owned active Item</option><option value="spell">Saved Spell</option><option value="derived-ability">Explicit reaction Derived Ability</option></select></label> : null}
            {draft.reactionType === "intervention" && draft.sourceKind === "derived-ability" ? <label><span>Derived Ability</span><select disabled={busy} value={draft.derivedAbilityId ?? ""} onChange={(event) => {
              const ability = responder?.reactionAbilities.find(({ id }) => id === Number(event.target.value));
              setDrafts({ ...drafts, [opportunity.id]: { ...draft, derivedAbilityId: ability?.id ?? null, initiativeCost: ability?.initiativeCost === null ? "" : String(ability?.initiativeCost ?? "") } });
            }}><option value="">Choose explicitly reaction-capable ability</option>{responder?.reactionAbilities.map((ability) => <option key={ability.id} value={ability.id}>{ability.name} · {ability.initiativeCost === null ? "explicit cost required" : `cost ${ability.initiativeCost}`}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" && (draft.sourceKind === "skill" || draft.sourceKind === "attribute" || draft.sourceKind === "derived-ability") ? <label><span>Explicit resolution mode</span><select disabled={busy || !draft.rollRequired} value={draft.governingKey} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, governingKey: event.target.value } })}><option value="">G.O.D. manual target below</option>{responder?.governingChoices.filter(({ selection }) => selection.kind === draft.sourceKind || draft.sourceKind === "derived-ability").map((choice) => <option key={choice.key} value={choice.key}>{choice.label} · {choice.originalTarget}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" && (draft.sourceKind === "weapon" || draft.sourceKind === "item") ? <label><span>Exact active owned Item</span><select disabled={busy} value={draft.itemKey} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, itemKey: event.target.value } })}><option value="">Choose Item</option>{responder?.weapons.map((entry) => <option key={entry.ownershipKey} value={entry.ownershipKey}>{entry.name}</option>)}</select></label> : null}
            {draft.reactionType === "intervention" && draft.sourceKind === "spell" ? <label><span>Exact saved Spell</span><select disabled={busy} value={draft.sourceRef} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, sourceRef: event.target.value } })}><option value="">Choose Spell</option>{responder?.spells.map((spell) => <option key={spell.id} value={`spell:${spell.id}`}>{spell.name || `Spell #${spell.id}`} · {spell.tradition}</option>)}</select></label> : null}
            {draft.reactionType === "tackle" || draft.reactionType === "intervention" || ((draft.reactionType === "parry" || draft.reactionType === "block") && weapon?.initiativeCost === null) ? <label><span>Committed cost</span><input disabled={busy || draft.reactionType === "tackle"} type="number" min="0.000001" step="any" value={draft.initiativeCost} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, initiativeCost: event.target.value } })} /></label> : null}
            {draft.reactionType === "tackle" || draft.reactionType === "intervention" ? <>
              <label><span>Governing label</span><input disabled={busy || draft.governingKey !== ""} value={draft.governingLabel} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, governingLabel: event.target.value } })} placeholder="Exact G.O.D. governing source" /></label>
              <label><span>Roll-over target</span><input disabled={busy || !draft.rollRequired} type="number" step="any" value={draft.manualTarget} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, manualTarget: event.target.value } })} /></label>
              <label className="action-declaration-check"><input disabled={busy} type="checkbox" checked={draft.rollRequired} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, rollRequired: event.target.checked } })} /><span>Requires Roll</span></label>
              <label className="is-wide"><span>Intended mechanical purpose</span><input disabled={busy} value={draft.purpose} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, purpose: event.target.value } })} /></label>
            </> : null}
            {(draft.reactionType === "tackle" || draft.reactionType === "intervention" || draft.conditionalMappingId !== null || opportunity.responderCharacterId !== draft.protectedTargetCharacterId || ((draft.reactionType === "parry" || draft.reactionType === "block") && weapon?.initiativeCost === null)) ? <label className="is-wide"><span>G.O.D. approval / positioning reason</span><textarea disabled={busy} rows={2} value={draft.reason} onChange={(event) => setDrafts({ ...drafts, [opportunity.id]: { ...draft, reason: event.target.value } })} /></label> : null}
          </div>
          <button disabled={busy} onClick={() => void perform(() => declareDefenseIntervention(defense.context.encounterId, {
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
          }), `${opportunity.responderName}'s ${draft.reactionType} declaration was locked and its Initiative committed.`)}>Lock Response Declaration</button>
        </article>;
      })}
      {!pending.length ? <p className="tabletop-empty">No unreconciled responder opportunities.</p> : null}
    </div>

    <div className="defense-resolution-list">
      {actions.declarations.filter(({ pendingActionId, status }) => pendingActionId !== null && ["rolling-ready", "rolling", "awaiting-god-ruling"].includes(status)).map((declaration) => {
        const reactions = defense.reactions.filter(({ declarationId }) => declarationId === declaration.id);
        return <article key={declaration.id}>
          <header><div><span>{declaration.status.toLocaleUpperCase()}</span><strong>Action #{declaration.id} · {declaration.draft.label}</strong></div><small>{reactions.length} response declarations</small></header>
          <div className="defense-roll-controls"><button disabled={busy} onClick={() => { const manual = manualAttackTarget(declaration); if (manual) void perform(() => recordDeclaredAttackRoll(defense.context.encounterId, declaration.id, { method: "random", ...manual }), "Website attack Roll recorded immutably."); }}>Roll Attack</button><button disabled={busy} onClick={() => { const result = physicalResult("the attack"); const manual = result === null ? null : manualAttackTarget(declaration); if (result !== null && manual) void perform(() => recordDeclaredAttackRoll(defense.context.encounterId, declaration.id, { method: "entered", enteredTotal: result, ...manual }), "Physical attack Roll recorded immutably."); }}>Enter Physical Attack</button><button disabled={busy || reactions.some(({ rollRequired, rollId, status }) => rollRequired && rollId === null && status === "declared")} onClick={() => void perform(() => resolveDeclaredDefenses(defense.context.encounterId, declaration.id), "Objective defense comparison and Initiative reconciliation recorded. No damage was applied.")}>Resolve Opposition</button></div>
          {reactions.map((reaction) => <div className="defense-reaction-card" key={reaction.id}>
            <div><span>{reaction.reactionType.toLocaleUpperCase()} · {reaction.status}</span><strong>{reaction.responderName} protects {reaction.protectedTargetName}</strong><small>{reaction.declaration.source.label} · committed {reaction.committedInitiativeCost} · Roll {reaction.rollId ?? "not recorded"}</small>{reaction.outcome ? <small>Outcome: {reaction.outcome} · final cost {reaction.defenderFinalCost ?? "pending"} · attacker +{reaction.attackerAdditionalCost ?? 0}</small> : null}</div>
            <div>{reaction.status === "declared" && reaction.rollRequired && reaction.rollId === null ? <><button disabled={busy} onClick={() => void perform(() => recordDeclaredResponseRoll(defense.context.encounterId, reaction.id, { method: "random" }), `Website ${reaction.reactionType} Roll recorded immutably.`)}>Roll</button><button disabled={busy} onClick={() => { const result = physicalResult(reaction.reactionType); if (result !== null) void perform(() => recordDeclaredResponseRoll(defense.context.encounterId, reaction.id, { method: "entered", enteredTotal: result }), `Physical ${reaction.reactionType} Roll recorded immutably.`); }}>Enter Physical</button></> : null}{reaction.status === "declared" ? <button disabled={busy} onClick={() => { const reason = window.prompt("Cancellation reason")?.trim(); if (reason) void perform(() => cancelDeclaredResponse(defense.context.encounterId, reaction.id, reason), "Response cancelled; committed cost retained unless explicitly refunded."); }}>Cancel</button> : null}{reaction.status === "needs-ruling" ? <><button disabled={busy} onClick={() => adjudicate(reaction, "continue")}>Continue</button><button disabled={busy} onClick={() => adjudicate(reaction, "continue-modified")}>Modify</button><button disabled={busy} onClick={() => adjudicate(reaction, "retarget")}>Retarget</button><button disabled={busy} onClick={() => adjudicate(reaction, "cancel")}>Cancel Action</button></> : null}</div>
            {reaction.events.length ? <details><summary>Audit · {reaction.events.length}</summary><ol>{reaction.events.map((event) => <li key={event.id}><b>{event.eventKind}</b> · {timestamp(event.createdAt)}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol></details> : null}
          </div>)}
        </article>;
      })}
    </div>
  </section>;
}
