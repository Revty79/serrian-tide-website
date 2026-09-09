import "server-only";
import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaignSessionEncounterActionDeclaration as declaration } from "@/db/tabletop-operations-schema";
import { assertCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction,
  previewCombatDeclarationInTransaction, assertActionChoiceAuthority, type ActionDeclarationActor } from "@/features/tabletop-operations/action-declaration-service";
import { previewFirearmAttackInTransaction, declareFirearmAttackInTransaction } from "@/features/tabletop-operations/firearm-attack-service";
import { readPlayerCombatRulingRequestsInTransaction, linkPlayerCombatRulingOutcomeInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { parseActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import type { OwnedEncounterRuntimeContext, RuntimeIntegrationTransaction as Tx } from "@/features/tabletop-operations/runtime-integration-service";
import { choiceDraft, firearmCommand, type CombatChoice, type CombatSubmission } from "./choice-types";

async function authorizedChoice(tx: Tx, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, input: CombatChoice) {
  const choice = structuredClone(input);
  if (!["weapon", "spell", "item", "derived-ability", "creature-attack", "creature-ability"].includes(choice.source.kind)) throw new Error("Choose a supported authored combat source.");
  if (actor.authority === "player" && (choice.participantId !== actor.characterId || choice.godTiming)) throw new Error("A Player cannot supply another combatant or a G.O.D. timing ruling.");
  if ((choice.firearm || ["weapon", "creature-attack"].includes(choice.source.kind)) && choice.targetIds.includes(choice.participantId)) throw new Error("Choose another combatant as the attack target. The combat screen cannot submit an accidental attack against its own actor.");
  if (choice.calledShot && !choice.firearm) {
    if (choice.targetIds.length !== 1) throw new Error("A Called Shot requires one exact target.");
    if (actor.authority === "player") {
      const requests = await readPlayerCombatRulingRequestsInTransaction(tx, context.encounterId, actor.characterId, actor.userId);
      const request = requests.find((entry) => entry.id === choice.calledShot!.requestId);
      if (!request || request.status !== "approved" || request.requestType !== "called-shot" || request.targetParticipantId !== choice.targetIds[0]
        || request.sourceRef !== choice.source.ref || request.sourceInstanceId !== choice.source.instanceId
        || request.frozenRequest.locationNumber !== choice.calledShot.locationNumber) throw new Error("This exact Called Shot needs its approved G.O.D. ruling before declaration.");
      if (request.linkedDeclarationId) throw new Error("That Called Shot ruling was already used by an earlier action.");
      choice.calledShot.penalty = Number(request.ruling.penalty); choice.calledShot.reason = String(request.ruling.reason);
    }
    if (!Number.isFinite(choice.calledShot.penalty) || choice.calledShot.penalty! < 0 || !choice.calledShot.reason?.trim()) throw new Error("The G.O.D. must assign this Called Shot's penalty and reason.");
  }
  return choice;
}

export async function previewCombatChoiceInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, input: CombatChoice) {
  const choice = await authorizedChoice(tx, context, actor, input);
  if (choice.firearm) {
    const preview = await previewFirearmAttackInTransaction(tx, context, actor, firearmCommand(choice));
    // The action menu needs its own costs and governing target, not another
    // combatant's complete anatomy/HP snapshot from the internal preparation.
    return { kind: "firearm" as const, preview: { aim: preview.aim, delivery: preview.delivery,
      governing: { label: preview.governing.label }, finalTarget: preview.finalTarget, rulingReasons: preview.rulingReasons, readiness: preview.readiness } };
  }
  const snapshot = await previewCombatDeclarationInTransaction(tx, context, actor, choiceDraft(choice));
  return { kind: "declaration" as const, snapshot };
}

export async function submitCombatChoiceInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, input: CombatSubmission) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  await assertActionChoiceAuthority(tx, context, actor, input.choice.participantId);
  if (!input.requestKey?.trim() || input.requestKey.length > 200) throw new Error("The command needs a stable retry identity.");
  const request = JSON.parse(JSON.stringify(input));
  const rows = await tx.select({ id: declaration.id, draft: declaration.draftJson }).from(declaration).where(and(eq(declaration.encounterId, context.encounterId), eq(declaration.actorCharacterId, input.choice.participantId)));
  const prior = rows.find((row) => parseActionDeclarationDraft(row.draft).sourcePayload?.screenRequestKey === input.requestKey);
  if (prior) {
    if (!isDeepStrictEqual(parseActionDeclarationDraft(prior.draft).sourcePayload?.screenRequest, request)) throw new Error("This retry identity already describes a different command or Roll.");
    return { declarationId: prior.id, reused: true };
  }
  const choice = await authorizedChoice(tx, context, actor, input.choice);
  if (choice.firearm) return declareFirearmAttackInTransaction(tx, context, actor, { ...firearmCommand(choice), idempotencyKey: input.requestKey, roll: input.roll });
  const baseDraft = choiceDraft(choice);
  const draft = { ...baseDraft, sourcePayload: { ...baseDraft.sourcePayload, screenRequestKey: input.requestKey, screenRequest: request,
    calledShotLocation: choice.calledShot ? { number: choice.calledShot.locationNumber, reason: choice.calledShot.reason } : null } };
  const id = await createActionDeclarationDraftInTransaction(tx, context, actor, draft);
  await lockActionDeclarationInTransaction(tx, context, actor, id);
  await commitActionDeclarationInTransaction(tx, context, actor, id, input.roll);
  if (choice.calledShot?.requestId && actor.authority === "player") await linkPlayerCombatRulingOutcomeInTransaction(tx, context, context.ownerUserId, choice.calledShot.requestId, { declarationId: id });
  return { declarationId: id, reused: false };
}
