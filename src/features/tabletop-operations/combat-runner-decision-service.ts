import "server-only";

import { and, eq } from "drizzle-orm";
import { campaignSessionEncounterResponderOpportunity } from "@/db/tabletop-operations-schema";

import type { ActionDeclarationActor } from "./action-declaration-service";
import {
  createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction,
  commitActionDeclarationInTransaction, reconcileResponderOpportunityInTransaction,
  refreshActionDeclarationRollingReadinessInTransaction, recordActionDeclarationAuditEventInTransaction,
} from "./action-declaration-service";
import type { ActionDeclarationDraft } from "./action-declaration";
import {
  declareDefenseInterventionInTransaction, recordDeclaredAttackRollInTransaction,
  recordDeclaredResponseRollInTransaction, resolveDeclaredDefensesIfReadyInTransaction,
  resolveDeclaredDefensesAfterResponseIfReadyInTransaction,
} from "./defense-intervention-service";
import {
  holdParticipantInitiativeInTransaction, passParticipantInitiativeInTransaction,
  type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction,
} from "./runtime-integration-service";
import { calculateMovementInitiativeCost } from "./initiative-runtime";
import { resolveInitiativeCapacityInTransaction } from "./initiative-capacity-service";
import { readCombatRunnerInTransaction } from "./combat-runner-service";
import type { CombatRunnerSubmission } from "./combat-runner-decision";
import { publishTabletopInvalidationInTransaction } from "./tabletop-live-events";

/** Authorize/lock the encounter before calling. A stale request never mutates a
 * different task, even when another browser completed the same roll or action. */
export async function submitCombatRunnerDecisionInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor, input: CombatRunnerSubmission,
): Promise<{ changed: boolean; stale: boolean; rollTotal: number | null }> {
  if (!input || !/^[a-f0-9]{64}$/.test(input.revision) || typeof input.taskKey !== "string"
    || !input.decision || typeof input.decision.kind !== "string") throw new Error("Refresh combat before submitting this choice.");
  if ([context.sessionStatus, context.sceneStatus, context.encounterStatus].some((status) => status !== "active")) {
    throw new Error("This encounter is not active. No combat choice was applied.");
  }
  if (actor.authority === "god-owner" && actor.userId !== context.ownerUserId) throw new Error("Only this Campaign's G.O.D. may run its combat.");
  const current = await readCombatRunnerInTransaction(tx, context);
  const task = current.snapshot.progression.tasks.find(({ key }) => key === input.taskKey);
  if (!task) return { changed: false, stale: true, rollTotal: null };
  const sameOpenRoll = input.decision.kind === "roll"
    && (task.kind === "roll-attack" || task.kind === "roll-defense")
    && typeof input.rollRevision === "string" && /^[a-f0-9]{64}$/.test(input.rollRevision)
    && input.rollRevision === current.snapshot.rollRevisions?.[task.key];
  if (input.revision !== current.snapshot.revision && !sameOpenRoll) return { changed: false, stale: true, rollTotal: null };
  const participant = current.declarations.participants.find(({ characterId }) => characterId === task.participantId);
  const decision = input.decision;
  if (decision.kind === "eligibility") {
    if (actor.authority !== "god-owner" || task.kind !== "eligibility" || task.recordId === null
      || typeof decision.allow !== "boolean") throw new Error("Only G.O.D. may decide response eligibility.");
    await reconcileResponderOpportunityInTransaction(tx, context, actor, task.recordId,
      decision.allow ? { decision: "allow" } : { decision: "ineligible", reason: decision.reason ?? "" });
  } else {
    if (!participant) throw new Error("The combatant is no longer present.");
    if (actor.authority === "player" ? actor.characterId !== participant.characterId : participant.choiceOwner !== "god") {
      throw new Error("This choice belongs to that combatant's Player.");
    }
    if (decision.kind === "hold" || decision.kind === "pass") {
      if (task.kind !== "choose-action") throw new Error("This combatant does not have an ordinary action choice now.");
      if (decision.kind === "hold") await holdParticipantInitiativeInTransaction(tx, context, participant.characterId);
      else await passParticipantInitiativeInTransaction(tx, context, participant.characterId);
    } else if (decision.kind === "attack" || decision.kind === "move") {
      if (task.kind !== "choose-action") throw new Error("Finish the current exchange before choosing another action.");
      const draft: ActionDeclarationDraft = {
        actorCharacterId: participant.characterId, targetCharacterIds: [], label: "", actionKind: "movement",
        sourceKind: "no-roll", sourceRef: null, sourceInstanceId: null, weaponItemId: null,
        firingModeId: null, attackMode: "", initiativeCost: 1, allowsMultiRound: false,
        heldIntervention: false, windowKind: "ordinary", aimDeclared: false,
        calledShot: { declared: false, label: "", assignedPenalty: null },
        explicitModifiers: [], preparesForDeclarationId: null, godNotes: "",
      };
      let authored: ActionDeclarationDraft;
      if (decision.kind === "move") {
        if (typeof decision.intent !== "string" || !decision.intent.trim() || decision.intent.length > 500) throw new Error("Describe where you are moving.");
        const capacity = await resolveInitiativeCapacityInTransaction(tx, participant.characterId, context.campaignId, decision.movementMode);
        // A change of movement mode is a capacity change, not a free speed swap.
        const active = current.engine.participants.find(({ characterId }) => characterId === participant.characterId)!;
        if (capacity.movementMode !== active.movementMode) throw new Error("Ask G.O.D. to change your movement mode before moving with it.");
        authored = { ...draft, label: `${capacity.movementMode} ${decision.distanceFeet} ft — ${decision.intent.trim()}`,
          sourceRef: `movement:${capacity.movementMode}`, attackMode: capacity.movementMode, allowsMultiRound: true,
          initiativeCost: calculateMovementInitiativeCost(capacity.baseMovement, decision.distanceFeet),
          sourcePayload: { movement: { mode: capacity.movementMode, distanceFeet: decision.distanceFeet, intent: decision.intent.trim() } },
        };
      } else {
        if (decision.targetParticipantId === participant.characterId
          || !current.declarations.participants.some(({ characterId }) => characterId === decision.targetParticipantId)) throw new Error("Choose a current encounter target.");
        const weapon = decision.source === "weapon" ? participant.weapons.find(({ ownershipKey }) => ownershipKey === decision.sourceKey) : null;
        const creatureAttack = decision.source === "creature-attack" && actor.authority === "god-owner"
          ? participant.creatureAttacks.find(({ canonicalId }) => canonicalId === decision.sourceKey) : null;
        if (!weapon && !creatureAttack) throw new Error("That exact attack source is no longer available.");
        if (weapon?.firingModes.length) throw new Error("Use the firearm controls for this weapon's ammunition and firing mode.");
        const cost = weapon?.initiativeCost ?? creatureAttack?.initiativeCost;
        if (cost === null || cost === undefined) throw new Error("This attack needs an authored Initiative cost or a G.O.D. ruling.");
        authored = { ...draft, targetCharacterIds: [decision.targetParticipantId],
          label: weapon ? `${weapon.name} attack` : creatureAttack!.attackName,
          actionKind: weapon ? "weapon-attack" : "creature-attack", sourceKind: weapon ? "weapon" : "creature-attack",
          sourceRef: weapon?.ownershipKey ?? creatureAttack!.canonicalId, sourceInstanceId: weapon?.instanceId ?? null,
          weaponItemId: weapon?.itemId ?? null, attackMode: "Melee / authored attack", windowKind: "melee-overlap", initiativeCost: cost,
        };
      }
      const id = await createActionDeclarationDraftInTransaction(tx, context, actor, authored);
      await lockActionDeclarationInTransaction(tx, context, actor, id);
      await commitActionDeclarationInTransaction(tx, context, actor, id);
    } else if (decision.kind === "defense") {
      if (task.kind !== "choose-response" || task.recordId === null || task.declarationId === null) throw new Error("This defense choice is no longer open.");
      const declaration = current.declarations.declarations.find(({ id }) => id === task.declarationId)!;
      const targets = declaration.lockedSnapshot?.targetCharacterIds ?? declaration.draft.targetCharacterIds;
      if (!targets.includes(participant.characterId) && decision.reactionType !== "no-reaction") {
        throw new Error("Protecting another combatant needs a G.O.D. positioning ruling.");
      }
      if (targets.length === 0 && decision.reactionType === "no-reaction") {
        const now = new Date();
        await tx.update(campaignSessionEncounterResponderOpportunity).set({
          status: "declined", responseLabel: "No intervention", reconciledByUserId: actor.userId,
          reconciledAt: now, updatedAt: now,
        }).where(and(eq(campaignSessionEncounterResponderOpportunity.id, task.recordId),
          eq(campaignSessionEncounterResponderOpportunity.declarationId, declaration.id),
          eq(campaignSessionEncounterResponderOpportunity.status, "pending")));
        await recordActionDeclarationAuditEventInTransaction(tx, context, declaration.id, declaration.status,
          "response-declined", actor.userId, "No intervention chosen by the responder.", { opportunityId: task.recordId });
        await refreshActionDeclarationRollingReadinessInTransaction(tx, context, declaration.id, actor.userId);
        await publishTabletopInvalidationInTransaction(tx, { ...context, characterIds: [], category: "action" });
        return { changed: true, stale: false, rollTotal: null };
      }
      const weapon = current.defenses.participants.find(({ characterId }) => characterId === participant.characterId)
        ?.weapons.find(({ ownershipKey }) => ownershipKey === decision.weaponKey);
      if (["parry", "block"].includes(decision.reactionType) && !weapon) throw new Error("Choose your defending weapon.");
      const reactionId = await declareDefenseInterventionInTransaction(tx, context, actor, {
        opportunityId: task.recordId, reactionType: decision.reactionType,
        protectedTargetCharacterId: targets.includes(participant.characterId) ? participant.characterId : targets[0],
        itemId: weapon?.itemId ?? null, instanceId: weapon?.instanceId ?? null,
      });
      await resolveDeclaredDefensesAfterResponseIfReadyInTransaction(tx, context, actor, reactionId);
    } else if (decision.kind === "roll") {
      if (task.recordId === null || task.declarationId === null || !["roll-attack", "roll-defense"].includes(task.kind)) throw new Error("This task has no open roll slot.");
      const declaration = current.declarations.declarations.find(({ id }) => id === task.declarationId)!;
      if (task.kind === "roll-attack" && declaration.draft.actionKind.startsWith("firearm-")) throw new Error("Use this shot's firearm roll, not an ordinary attack roll.");
      const roll = task.kind === "roll-attack"
        ? await recordDeclaredAttackRollInTransaction(tx, context, actor, task.recordId, decision)
        : await recordDeclaredResponseRollInTransaction(tx, context, actor, task.recordId, decision);
      await resolveDeclaredDefensesIfReadyInTransaction(tx, context, actor, task.declarationId);
      await publishTabletopInvalidationInTransaction(tx, { ...context, characterIds: [], category: "roll" });
      return { changed: true, stale: false, rollTotal: roll.resultTotal };
    } else throw new Error("This choice is not supported by the coordinated runner.");
  }
  await publishTabletopInvalidationInTransaction(tx, { ...context, characterIds: [], category: "action" });
  return { changed: true, stale: false, rollTotal: null };
}
