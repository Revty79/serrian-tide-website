import "server-only";
import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaignCharacter, campaignCharacterActiveCondition } from "@/db/realm-schema";
import { campaign } from "@/db/campaign-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterEffectPlan as plan, campaignSessionEncounter as encounter } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction, persistActiveHealthStateInTransaction } from "@/features/active-state/active-health-service";
import { applyConditionInTransaction, resolveConditionInTransaction } from "@/features/active-state/active-effects-service";
import { bindPersistedEffectDurationInTransaction, closeDurationBindingForEffectInTransaction } from "./duration-lifecycle-service";
import { resolveManualActionEffectInTransaction } from "./action-effect-plan-service";
import { assertFrozenActionSourceSnapshot } from "./action-effect-bridge";
import { combatRecoverySpellAuthority } from "./combat-recovery-spells";
import { combatBlockers, combatConditionState, combatObject as object } from "./combat-condition-state";
import { combatParticipationState } from "./combat-participation-service";
import { recordCombatConditionInTransaction } from "./combat-condition-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { assertNoOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, lockOwnedEncounterRuntimeInTransaction,
  type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";
import type { ActionDeclarationActor } from "./action-declaration-service";

const records = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
/** Owning duration services already authorize their writes. Reuse the same
 * encounter lock/context when an effect expires outside timeline advancement. */
export async function reconcileExpiredCombatRecoveryInTransaction(tx: Tx, encounterId: number, participantId?: number) {
  const [owner] = await tx.select({ userId: campaign.createdByUserId }).from(encounter)
    .innerJoin(campaign, eq(campaign.id, encounter.campaignId)).where(eq(encounter.id, encounterId));
  if (!owner) throw new Error("The bound recovery Encounter no longer exists.");
  const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, owner.userId);
  await reconcileCombatRecoveryInTransaction(tx, context, participantId);
}
async function targetRow(tx: Tx, encounterId: number, participantId: number) {
  const [row] = await tx.select({ id: member.participantId, local: member.localStateJson, snapshot: member.creatureSnapshotJson, npcKind: campaignCharacter.npcKind })
    .from(member).leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId))
    .where(and(eq(member.encounterId, encounterId), eq(member.characterId, participantId))).for("update", { of: member });
  if (!row) throw new Error("Recovery requires the exact retained Encounter member.");
  return row;
}
async function conditionEnded(tx: Tx, id: number, conditionId: number, local: Record<string, unknown>) {
  if (id < 0) {
    const condition = records(local.conditions).find((entry) => entry.effectPlanEffectId === conditionId);
    return !!condition && !!(condition.expiredAt || condition.endedAt);
  }
  const [condition] = await tx.select().from(campaignCharacterActiveCondition)
    .where(and(eq(campaignCharacterActiveCondition.characterId, id), eq(campaignCharacterActiveCondition.id, conditionId)));
  return !!condition?.resolvedAt;
}

/** Recalculate blockers after owning effects finish. Ordinary healing only clears
 * HP exhaustion, never death or an unrelated condition. No action is executed. */
export async function reconcileCombatRecoveryInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext, participantId?: number) {
  const members = await tx.select({ id: member.characterId }).from(member).where(and(eq(member.encounterId, context.encounterId),
    ...(participantId === undefined ? [] : [eq(member.characterId, participantId)])));
  for (const { id } of members) {
    let row = await targetRow(tx, context.encounterId, id), local = object(row.local);
    const revivals = records(local.combatRevivals);
    for (const revival of revivals.filter((entry) => entry.status === "active")) {
      if (!await conditionEnded(tx, id, Number(revival.conditionId), local)) continue;
      revival.status = "awaiting-ruling";
      revival.expiredAt = new Date().toISOString();
      revival.rulingRequired = "Cycle of Rebirth ended. G.O.D. must resolve the authored stabilization save: stabilize or fall dead again. The save's governing mechanics are not authored.";
      await tx.update(member).set({ localStateJson: { ...local, combatRevivals: revivals } }).where(eq(member.participantId, row.id));
      await recordCombatConditionInTransaction(tx, context, { participantId: id, status: "incapacitated", reason: String(revival.rulingRequired),
        requestKey: `revival-expired:${revival.effectId}`, initiativeTreatment: "preserve", evidence: { rule: "temporary-revival-expired", effectId: revival.effectId } });
      row = await targetRow(tx, context.encounterId, id); local = object(row.local);
    }
    const previous = combatConditionState(local), condition = object(local.combatCondition), blockers = combatBlockers(local);
    const health = id > 0 && blockers.some((blocker) => !blocker.resolvedAt && blocker.evidence?.rule === "total-hp-exhausted")
      ? await readActiveHealthInTransaction(tx, id, row.npcKind ?? "race") : null;
    const maximum = health?.anatomy.totalMaximumHp ?? object(object(row.snapshot).core).totalHp;
    const damage = health?.view.totalDamage ?? object(local.health).totalDamage;
    let changed = false;
    for (const blocker of blockers.filter((entry) => !entry.resolvedAt && entry.status === "incapacitated")) {
      const ended = blocker.conditionId !== undefined && await conditionEnded(tx, id, blocker.conditionId, local);
      const healed = blocker.evidence?.rule === "total-hp-exhausted" && typeof maximum === "number" && typeof damage === "number" && damage < maximum;
      if (ended || healed) { blocker.resolvedAt = new Date().toISOString(); blocker.resolution = "The owning effect/Health service resolved this blocker."; changed = true; }
    }
    const active = blockers.filter((entry) => !entry.resolvedAt);
    const status = active.some((entry) => entry.status === "dead") ? "dead" : active.some((entry) => entry.status === "defeated") ? "defeated" : active.length ? "incapacitated" : "able";
    if (changed || previous.status !== status) {
      await tx.update(member).set({ localStateJson: { ...local, combatCondition: { ...condition, blockers, status,
        reason: active.map(({ reason }) => reason).join(" ") || "Recovery effects resolved the mechanical blockers.", revision: previous.revision + 1,
        history: [...records(condition.history), { event: "effect-recovery-reconciled", previous, status, recordedAt: new Date().toISOString() }] } }, updatedAt: new Date() }).where(eq(member.participantId, row.id));
    }
    if (previous.status !== "able" && status === "able" && !combatParticipationState(local).departed && context.encounterStatus === "active") {
      const before = await loadInitiativeEngineInTransaction(tx, context.encounterId, true);
      if (before.runtime.status === "active" && before.participants.some((entry) => entry.characterId === id && entry.participationStatus === "suspended")) {
        await persistInitiativeEngineInTransaction(tx, context, before, { ...before,
          participants: before.participants.map((entry) => entry.characterId === id ? { ...entry, participationStatus: "active" as const } : entry) }, "correction");
      }
    }
  }
}

export type CombatSpellRecoveryRuling = {
  planId: number; effectId: number; operation: "revive" | "remove-conditions"; requestKey: string; reason: string;
  /** Exact poisoned/diseased conditions identified by the G.O.D.; no name parsing. */
  removeConditions?: Array<{ conditionId: number; category: "poison" | "disease" }>;
  /** Anatomy repair is a specific ruling, never implicit regeneration of every limb. */
  restoredPoolKeys?: string[];
  temporaryDuration?: { kind: "combat-rounds"; value: number; label: string };
};

export async function resolveCombatSpellRecoveryInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor, input: CombatSpellRecoveryRuling) {
  return tx.transaction(async (recoveryTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may resolve source-linked spell recovery.");
    const context = await lockOwnedEncounterRuntimeInTransaction(recoveryTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(recoveryTx, encounterId); await assertNoOpenDeclarationCheckpoint(recoveryTx, encounterId);
    if (!input.reason?.trim() || input.reason.length > 2000 || !input.requestKey?.trim() || input.requestKey.length > 200
      || !["revive", "remove-conditions"].includes(input.operation)) throw new Error("Record the exact spell recovery operation, reason and retry identity.");
    const [saved] = await recoveryTx.select().from(plan).where(and(eq(plan.id, input.planId), eq(plan.encounterId, encounterId))).for("update");
    const [outcome] = await recoveryTx.select().from(effect).where(and(eq(effect.id, input.effectId), eq(effect.planId, input.planId), eq(effect.encounterId, encounterId))).for("update");
    if (!saved || !outcome) throw new Error("Choose an exact existing cast effect plan and recovery effect.");
    const request = JSON.parse(JSON.stringify(input)), prior = object(object(outcome.appliedResultJson).combatRecovery);
    if (prior.request) {
      if (!isDeepStrictEqual(prior.request, request)) throw new Error("This recovery effect already has a different immutable ruling.");
      return { effectId: outcome.id, reused: true };
    }
    if (context.encounterStatus !== "active" || outcome.status === "declined" || outcome.status === "manual-resolved" || outcome.applicationSupported
      || !outcome.effectKey.startsWith("spell-combat-recovery:")) throw new Error("Only the unresolved source-linked recovery effect of an active Encounter can resolve revival.");
    const source = assertFrozenActionSourceSnapshot(saved.sourceSnapshotJson);
    const authority = source.kind === "spell" ? combatRecoverySpellAuthority(source.authoredData) : null;
    if (!authority || input.operation === "revive" && authority.reviveHp === null || input.operation === "remove-conditions" && !authority.conditionRemoval) throw new Error("That exact authored spell and locked mastery do not authorize the requested recovery.");
    const siblings = await recoveryTx.select().from(effect).where(eq(effect.planId, saved.id));
    if (siblings.some((entry) => entry.applicationSupported && entry.status !== "applied" && entry.status !== "declined")) throw new Error("Apply this cast's supported healing effects before resolving its recovery ruling.");
    if (input.operation === "revive" && authority.maximumRevivedTargets !== null && siblings.filter((entry) => object(object(entry.appliedResultJson).combatRecovery).revived === true).length >= authority.maximumRevivedTargets) throw new Error("This Vital Wellspring cast already revived its one fallen ally.");
    const id = outcome.targetParticipantId, row = await targetRow(recoveryTx, encounterId, id);
    const local = structuredClone(object(row.local));
    const blockers = combatBlockers(local);
    if (input.operation === "revive" && !blockers.some((entry) => !entry.resolvedAt && ["dead", "defeated"].includes(entry.status))) throw new Error("Revival requires this exact combatant's unresolved death.");
    const removals = input.removeConditions ?? [];
    if (removals.length && !authority.conditionRemoval || removals.some((entry) => !Number.isSafeInteger(entry.conditionId) || entry.conditionId <= 0 || !["poison", "disease"].includes(entry.category))) throw new Error("Only an authored cleansing spell may remove the exact G.O.D.-identified poison/disease conditions.");
    const conditions = records(local.conditions);
    for (const removal of removals) {
      if (id > 0) {
        const [condition] = await recoveryTx.select().from(campaignCharacterActiveCondition).where(and(eq(campaignCharacterActiveCondition.id, removal.conditionId), eq(campaignCharacterActiveCondition.characterId, id)));
        if (!condition) throw new Error("The selected condition belongs to a different target.");
        await resolveConditionInTransaction(recoveryTx, id, removal.conditionId, `${source.identity}: ${input.reason}`);
        await closeDurationBindingForEffectInTransaction(recoveryTx, { effectKind: "condition", effectId: removal.conditionId, characterId: id, reason: `${source.identity}: ${input.reason}` });
      } else {
        const condition = conditions.find((entry) => entry.effectPlanEffectId === removal.conditionId);
        if (!condition) throw new Error("Select the exact occurrence-local condition.");
        condition.endedAt = new Date().toISOString(); condition.endNote = `${source.identity}: ${input.reason}`;
      }
    }
    if (id < 0) local.conditions = conditions;
    let healthReceipt: unknown = null;
    if (input.operation === "revive") {
      const health = id > 0 ? await readActiveHealthInTransaction(recoveryTx, id, row.npcKind ?? "race") : null;
      const maximum = health?.anatomy.totalMaximumHp ?? object(object(row.snapshot).core).totalHp;
      if (typeof maximum !== "number" || maximum < authority.reviveHp!) throw new Error("The target needs an authored HP maximum that supports this revival.");
      const restored = new Set(input.restoredPoolKeys ?? []);
      const pools = health ? health.anatomy.pools.map(({ key }) => key) : records(object(row.snapshot).hpPools).map((entry) => String(entry.canonicalId));
      if ([...restored].some((key) => !pools.includes(key))) throw new Error("Anatomy recovery must name exact authored HP pools.");
      for (const blocker of blockers.filter((entry) => !entry.resolvedAt && entry.evidence?.rule === "fatal-head")) {
        if (!restored.has(String(blocker.evidence?.poolKey))) throw new Error("This fatal head outcome requires a specific anatomy-restoration ruling selecting its exact HP pool.");
      }
      healthReceipt = { before: health?.state ?? local.health, remainingHp: authority.reviveHp, restoredPoolKeys: [...restored] };
      if (health) await persistActiveHealthStateInTransaction(recoveryTx, health.anatomy, { ...health.state, totalDamage: maximum - authority.reviveHp!,
        pools: health.state.pools.map((pool) => restored.has(pool.poolKey) ? { ...pool, damage: 0 } : pool) });
      else local.health = { ...object(local.health), totalDamage: maximum - authority.reviveHp!,
        poolDamage: { ...object(object(local.health).poolDamage), ...Object.fromEntries([...restored].map((key) => [key, 0])) } };
      for (const blocker of blockers.filter((entry) => !entry.resolvedAt && ["dead", "defeated"].includes(entry.status))) {
        blocker.resolvedAt = new Date().toISOString(); blocker.resolution = `${source.identity}: ${input.reason}`;
      }
      if (authority.temporary) {
        const duration = input.temporaryDuration;
        if (!duration || duration.kind !== "combat-rounds" || !Number.isSafeInteger(duration.value) || duration.value <= 0 || !duration.label?.trim()) throw new Error("Cycle of Rebirth requires an explicit duration ruling in Combat Rounds including the unresolved lingering portion.");
        let conditionId = outcome.id;
        if (id > 0) {
          const condition = await applyConditionInTransaction(recoveryTx, { characterId: id,
            effect: { kind: "condition.apply", name: "Cycle of Rebirth: borrowed life", description: authority.explanation, duration },
            source: { kind: "spell", id: source.identity, name: source.displayName }, sourceEffectKey: `combat-revival:${outcome.id}` });
          conditionId = condition.id;
          await bindPersistedEffectDurationInTransaction(recoveryTx, context, { kind: "condition", id: condition.id, characterId: id, duration: condition.duration });
        } else local.conditions = [...records(local.conditions), { effectPlanEffectId: outcome.id, name: "Cycle of Rebirth: borrowed life", duration, sourceIdentity: source.identity, appliedAt: new Date().toISOString() }];
        local.combatRevivals = [...records(local.combatRevivals), { effectId: outcome.id, conditionId, sourceIdentity: source.identity, status: "active", duration,
          expirationConsequence: "G.O.D. resolves the authored stabilization save: stabilize or fall dead again." }];
      } else if (input.temporaryDuration) throw new Error("Vital Wellspring's revival is not the temporary Cycle of Rebirth effect.");
    }
    // Preserve status until reconciliation notices the cleared blockers and can
    // restore eligibility using the existing suspension balances.
    local.combatCondition = { ...object(local.combatCondition), blockers };
    await recoveryTx.update(member).set({ localStateJson: local, updatedAt: new Date() }).where(eq(member.participantId, row.id));
    await resolveManualActionEffectInTransaction(recoveryTx, context, actor, saved.id, outcome.id, `${authority.name}: ${input.operation}`, input.reason);
    await recoveryTx.update(effect).set({ appliedResultJson: { kind: "manual-ruling", combatRecovery: { request, sourceIdentity: source.identity,
      mastery: authority.level, revived: input.operation === "revive", health: healthReceipt } } }).where(eq(effect.id, outcome.id));
    await reconcileCombatRecoveryInTransaction(recoveryTx, context, id);
    return { effectId: outcome.id, reused: false };
  });
}

export async function resolveCombatRevivalExpirationInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor,
  input: { participantId: number; effectId: number; stabilized: boolean; reason: string }) {
  return tx.transaction(async (recoveryTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may resolve the spell's stabilization ruling.");
    const context = await lockOwnedEncounterRuntimeInTransaction(recoveryTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(recoveryTx, encounterId);
    if (typeof input.stabilized !== "boolean" || !input.reason?.trim() || input.reason.length > 2000) throw new Error("Record the authored stabilization outcome and its specific G.O.D. ruling.");
    const row = await targetRow(recoveryTx, encounterId, input.participantId), local = object(row.local), revivals = records(local.combatRevivals);
    const revival = revivals.find((entry) => entry.effectId === input.effectId);
    if (!revival) throw new Error("No exact source-linked temporary revival exists for this target.");
    if (revival.ruling) {
      if (!isDeepStrictEqual(revival.ruling, input)) throw new Error("This stabilization already records a different outcome.");
      return { reused: true };
    }
    if (revival.status !== "awaiting-ruling") throw new Error("The temporary revival has not expired or does not require stabilization.");
    revival.ruling = input; revival.status = input.stabilized ? "stabilized" : "dead";
    const blockers = combatBlockers(local);
    for (const blocker of blockers.filter((entry) => entry.key === `revival-expired:${input.effectId}`)) {
      blocker.resolvedAt = new Date().toISOString(); blocker.resolution = input.reason;
    }
    await recoveryTx.update(member).set({ localStateJson: { ...local, combatRevivals: revivals, combatCondition: { ...object(local.combatCondition), blockers } } }).where(eq(member.participantId, row.id));
    if (!input.stabilized) await recordCombatConditionInTransaction(recoveryTx, context, { participantId: input.participantId, status: "dead", reason: input.reason,
      requestKey: `revival-failed:${input.effectId}`, initiativeTreatment: "preserve", evidence: { rule: "temporary-revival-failed", effectId: input.effectId } });
    await reconcileCombatRecoveryInTransaction(recoveryTx, context, input.participantId);
    return { reused: false };
  });
}
