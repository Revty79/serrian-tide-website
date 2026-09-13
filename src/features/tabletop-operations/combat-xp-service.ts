import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as participant, campaignSessionEncounterReward as reward, campaignSessionEncounterRewardDecision as decision } from "@/db/tabletop-operations-schema";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { assertNoOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { applyEncounterExperienceAwardsInTransaction, lockEncounterCloseoutContextInTransaction, readEncounterCloseoutInTransaction,
  type EncounterCloseoutTransaction } from "./encounter-closeout-service";
import { allocateCreatureExperience, allocateEncounterExperience, creatureExperienceEvidence, npcRewardEvidence, experienceRecipients, wholeExperience, type CreatureExperienceMode } from "./combat-xp";
import type { ActionDeclarationActor } from "./action-declaration-service";
import { applyCombatFameAwardsInTransaction, recordCreatureKillFameInTransaction, fameAmount, type FameAward } from "./combat-fame-service";
import type { ExperienceAwardInput } from "./encounter-closeout";

export type CombatExperienceDecisionInput = {
  requestKey: string;
  note?: string;
} & ({
  kind: "creature";
  defeatedParticipantId: number;
  mode: CreatureExperienceMode;
  recipientCharacterIds: readonly number[];
  killerRuling?: { characterId: number; reason: string };
  valueRuling?: { value: number; reason: string };
} | {
  kind: "npc";
  defeatedParticipantId: number;
  amountPerCharacter: number;
  famePerCharacter: number;
  recipientCharacterIds: readonly number[];
  reason: string;
} | {
  kind: "creature-kill-fame";
  defeatedParticipantId: number;
  killerCharacterId: number;
  recipientCharacterIds: readonly number[];
  reason: string;
} | {
  kind: "encounter";
  amountPerCharacter: number;
  recipientCharacterIds: readonly number[];
});

export type CombatExperienceReceipt = { decisionId: number; sourceKey: string; awards: ExperienceAwardInput[]; fameAwards: FameAward[]; awardedByUserId: string; awardedAt: string; reused: boolean };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function text(value: string, label: string, required = true) {
  if (typeof value !== "string" || value.trim().length > 1000 || required && !value.trim()) throw new Error(`${label} is required and must be at most 1,000 characters.`);
  return value.trim();
}
function receipt(row: typeof decision.$inferSelect, reused: boolean): CombatExperienceReceipt {
  return { decisionId: row.id, sourceKey: row.sourceKey, awards: object(row.frozenDecisionJson).awards as ExperienceAwardInput[], fameAwards: (object(row.frozenDecisionJson).fameAwards ?? []) as FameAward[],
    awardedByUserId: row.awardedByUserId, awardedAt: row.awardedAt.toISOString(), reused };
}

export async function awardCombatExperienceInTransaction(
  tx: EncounterCloseoutTransaction, encounterId: number, actor: ActionDeclarationActor, input: CombatExperienceDecisionInput,
): Promise<CombatExperienceReceipt> {
  return tx.transaction(async (awardTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may decide combat XP awards.");
    const context = await lockEncounterCloseoutContextInTransaction(awardTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(awardTx, encounterId);
    await assertNoOpenDeclarationCheckpoint(awardTx, encounterId);
    const requestKey = text(input.requestKey, "XP request identity");
    if (input.kind === "creature-kill-fame") {
      if (context.encounterStatus === "active" && (context.sceneStatus !== "active" || context.sessionStatus !== "active")
        || !["active", "completed"].includes(context.sceneStatus) || !["active", "completed"].includes(context.sessionStatus)) throw new Error("Kill Fame requires started parents; active combat requires active parents.");
      if (!["active", "completed"].includes(context.encounterStatus)) throw new Error("Start this Encounter before awarding kill Fame.");
      if (!Number.isSafeInteger(input.defeatedParticipantId) || input.defeatedParticipantId === 0 || !Number.isSafeInteger(input.killerCharacterId) || input.killerCharacterId <= 0) throw new Error("Choose the exact killed Creature and Player Character.");
      if (input.recipientCharacterIds.length !== 1 || input.recipientCharacterIds[0] !== input.killerCharacterId) throw new Error("Kill Fame belongs only to the credited Player Character.");
      const result = await recordCreatureKillFameInTransaction(awardTx, context, { participantId: input.defeatedParticipantId,
        killerId: input.killerCharacterId, requestKey, reason: text(input.reason, "Kill attribution reason") });
      if (result?.decisionId === undefined) throw new Error("Kill Fame is awaiting exact credit or an authored CR.");
      const [saved] = await awardTx.select().from(decision).where(eq(decision.id, result.decisionId));
      return receipt(saved, result.reused === true);
    }
    const selected = experienceRecipients(input.recipientCharacterIds);
    const note = text(input.note ?? "", "XP note", false);
    if (!["creature", "encounter", "npc"].includes(input.kind)) throw new Error("Choose Creature XP or additional encounter XP.");
    if (input.kind !== "encounter" && (!Number.isSafeInteger(input.defeatedParticipantId) || input.defeatedParticipantId === 0)) throw new Error("Choose the exact defeated Creature occurrence.");
    const sourceKey = input.kind !== "encounter" ? input.kind + ":" + input.defeatedParticipantId : "encounter";
    const alternativeKey = input.kind === "encounter" ? sourceKey : (input.kind === "npc" ? "creature:" : "npc:") + input.defeatedParticipantId;
    const originalRequest = JSON.parse(JSON.stringify({ ...input, requestKey: undefined, recipientCharacterIds: selected, note }));
    const existing = await awardTx.select().from(decision).where(and(eq(decision.encounterId, encounterId), or(eq(decision.sourceKey, sourceKey), eq(decision.sourceKey, alternativeKey), eq(decision.requestKey, requestKey))));
    if (existing.length) {
      const original = existing.find((row) => row.sourceKey === sourceKey);
      if (!original || existing.some((row) => row.id !== original.id) || !isDeepStrictEqual(object(original.frozenDecisionJson).originalRequest, originalRequest)) {
        throw new Error("This XP source or request identity already has a different immutable reward decision. It cannot award XP again.");
      }
      return receipt(original, true);
    }
    if (!["active", "completed"].includes(context.encounterStatus)) {
      throw new Error("Start this Encounter before awarding combat XP.");
    }
    if (context.encounterStatus === "active" && (context.sceneStatus !== "active" || context.sessionStatus !== "active")
      || !["active", "completed"].includes(context.sceneStatus) || !["active", "completed"].includes(context.sessionStatus)) {
      throw new Error("Combat XP requires a started Scene and Session; an active Encounter requires active parents.");
    }
    const [legacy] = await awardTx.select({ id: reward.id }).from(reward).where(and(eq(reward.encounterId, encounterId), isNull(reward.decisionId))).limit(1);
    if (legacy) throw new Error("This Encounter has historical XP without source attribution. Preserve and review that history before adding potentially duplicate combat awards.");
    const view = await readEncounterCloseoutInTransaction(awardTx, context);
    const eligible = new Set(view.recipients.map(({ characterId }) => characterId));
    if (selected.some((id) => !eligible.has(id))) throw new Error("Every XP recipient must be an exact Encounter Participant with an authoritative Character XP profile.");
    let awards: ExperienceAwardInput[];
    let sourceSnapshot: unknown = null;
    let fameAwards: FameAward[] = [];
    let npcEvidence: unknown = null;
    let defeatedLocal: Record<string, unknown> | null = null;
    if (input.kind === "encounter") {
      awards = allocateEncounterExperience(input.amountPerCharacter, selected);
    } else if (input.kind === "npc") {
      const [source] = await awardTx.select({ local: participant.localStateJson, id: campaignCharacter.id, name: campaignCharacter.name,
        isNpc: campaignCharacter.isNpc, npcKind: campaignCharacter.npcKind }).from(participant)
        .innerJoin(campaignCharacter, eq(campaignCharacter.id, participant.characterId))
        .where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, input.defeatedParticipantId)))
        .for("update", { of: participant });
      if (!source?.isNpc) throw new Error("NPC rewards require an exact NPC in this Encounter.");
      npcEvidence = npcRewardEvidence(source.local);
      if (!npcEvidence) throw new Error("Record the NPC's death, incapacitation, or surrender before awarding its XP or Fame.");
      text(input.reason, "G.O.D. NPC reward reason");
      awards = allocateEncounterExperience(input.amountPerCharacter, selected);
      fameAwards = await applyCombatFameAwardsInTransaction(awardTx, context, selected.map((characterId) => ({ characterId, amount: fameAmount(input.famePerCharacter) })));
      sourceSnapshot = { id: source.id, name: source.name, isNpc: source.isNpc, npcKind: source.npcKind };
    } else {
      const [source] = await awardTx.select({ kind: participant.participantKind, snapshot: participant.creatureSnapshotJson, local: participant.localStateJson,
        npcKind: campaignCharacter.npcKind, persistentSnapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(participant)
        .leftJoin(campaignCharacter, eq(campaignCharacter.id, participant.characterId))
        .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, participant.characterId))
        .where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, input.defeatedParticipantId))).for("update", { of: participant });
      if (!source || source.kind !== "creature" && source.npcKind !== "creature") throw new Error("The XP source must be the exact Creature occurrence in this Encounter.");
      const local = structuredClone(object(source.local));
      const defeat = creatureExperienceEvidence(local);
      if (!defeat) throw new Error("Record this exact Creature's defeat or incapacitation before awarding its XP.");
      sourceSnapshot = source.snapshot;
      if (!sourceSnapshot && source.persistentSnapshot) {
        try { sourceSnapshot = JSON.parse(source.persistentSnapshot); } catch { throw new Error("The Creature's frozen XP source is unreadable; an explicit source recovery is required."); }
      }
      const authoredValue = defeat.defeatValueXp ?? object(object(sourceSnapshot).core).killXp;
      if (authoredValue == null && !input.valueRuling) throw new Error("This defeated Creature has no recorded numeric XP value. Supply an explicit G.O.D. value ruling.");
      const value = input.valueRuling ? wholeExperience(input.valueRuling.value) : wholeExperience(authoredValue as number);
      if (input.valueRuling) text(input.valueRuling.reason, "G.O.D. XP value ruling");
      let credited = object(defeat.credit).characterId;
      if (input.killerRuling) {
        if (!eligible.has(input.killerRuling.characterId)) throw new Error("The credited killer must be an eligible Character in this Encounter.");
        defeat.credit = { characterId: input.killerRuling.characterId, reason: text(input.killerRuling.reason, "G.O.D. killer ruling"), ruledByUserId: actor.userId };
        credited = input.killerRuling.characterId;
      }
      const killerCharacterId = typeof credited === "number" && eligible.has(credited) ? credited : null;
      awards = allocateCreatureExperience({ value, mode: input.mode, recipientCharacterIds: selected, killerCharacterId });
      defeat.distribution = { mode: input.mode, value, recipientCharacterIds: selected, killerCharacterId, note, decidedByUserId: actor.userId };
      local.defeat = defeat;
      defeatedLocal = local;
    }
    const [saved] = await awardTx.insert(decision).values({ encounterId, sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId,
      sourceKey, requestKey, defeatedParticipantId: input.kind !== "encounter" ? input.defeatedParticipantId : null,
      frozenDecisionJson: { originalRequest, sourceSnapshot, awards, fameAwards, npcEvidence, defeatEvidence: defeatedLocal?.defeat ?? null }, awardedByUserId: actor.userId }).returning();
    await applyEncounterExperienceAwardsInTransaction(awardTx, context, awards, note, saved.id);
    if (defeatedLocal && input.kind === "creature") {
      const defeat = object(defeatedLocal.defeat);
      defeat.awards = [...(Array.isArray(defeat.awards) ? defeat.awards : []), { decisionId: saved.id, awards, awardedByUserId: actor.userId, awardedAt: saved.awardedAt.toISOString() }];
      await awardTx.update(participant).set({ localStateJson: defeatedLocal, updatedAt: new Date() })
        .where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, input.defeatedParticipantId)));
    }
    return receipt(saved, false);
  });
}
