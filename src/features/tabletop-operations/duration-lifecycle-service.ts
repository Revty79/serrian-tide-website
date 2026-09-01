import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import {
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
} from "@/db/realm-schema";
import {
  campaignSessionEffectDurationBinding,
  campaignSessionEncounter,
  campaignSessionEncounterParticipant,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  endModifierInTransaction,
  resolveConditionInTransaction,
} from "@/features/active-state/active-effects-service";
import type { PersistedMechanicalEffectIdentity } from "@/features/active-state/mechanical-effect-service";

import {
  advanceFiniteDuration,
  getInitiativeDurationTransition,
  isTabletopBoundDurationKind,
  requireFiniteDurationValue,
  type DurationEffectKind,
  type InitiativeDurationPosition,
  type TabletopBoundDurationKind,
} from "./duration-lifecycle";

export type DurationLifecycleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TabletopDurationContext = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId?: number | null;
};

export type TabletopDurationBindingView = {
  id: number;
  characterId: number;
  effectKind: DurationEffectKind;
  effectId: number;
  durationKind: TabletopBoundDurationKind;
  remainingValue: number | null;
  status: "active" | "expired" | "closed";
  sceneId: number;
  sceneTitle: string;
  encounterId: number | null;
  encounterTitle: string | null;
  closedAt: string | null;
  closeReason: string;
};

type BindingRow = typeof campaignSessionEffectDurationBinding.$inferSelect;

type LoadedEffect = {
  kind: DurationEffectKind;
  id: number;
  characterId: number;
  durationKind: "until-removed" | "combat-steps" | "combat-rounds" | "scene";
  durationValue: number | null;
  endedAt: Date | null;
};

function positiveId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

async function requireDurationMembership(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext,
  characterId: number,
  durationKind: TabletopBoundDurationKind,
): Promise<void> {
  if (durationKind === "scene") {
    const [member] = await tx.select({ characterId: campaignSessionSceneMember.characterId })
      .from(campaignSessionSceneMember)
      .where(and(
        eq(campaignSessionSceneMember.sceneId, context.sceneId),
        eq(campaignSessionSceneMember.sessionId, context.sessionId),
        eq(campaignSessionSceneMember.campaignId, context.campaignId),
        eq(campaignSessionSceneMember.characterId, characterId),
      )).limit(1);
    if (!member) throw new Error("A Scene duration can only bind to a current member of that Scene.");
    return;
  }
  const encounterId = positiveId(context.encounterId ?? 0, "Encounter");
  const [participant] = await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, characterId),
    )).limit(1);
  if (!participant) throw new Error("A combat duration can only bind to a current Participant in that Encounter.");
}

async function insertBinding(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext,
  effect: {
    kind: DurationEffectKind;
    id: number;
    characterId: number;
    durationKind: TabletopBoundDurationKind;
    durationValue: number | null;
  },
): Promise<BindingRow> {
  await requireDurationMembership(tx, context, effect.characterId, effect.durationKind);
  const finite = effect.durationKind === "combat-steps" || effect.durationKind === "combat-rounds";
  const [created] = await tx.insert(campaignSessionEffectDurationBinding).values({
    campaignId: context.campaignId,
    sessionId: context.sessionId,
    sceneId: context.sceneId,
    encounterId: finite ? positiveId(context.encounterId ?? 0, "Encounter") : null,
    characterId: effect.characterId,
    conditionId: effect.kind === "condition" ? effect.id : null,
    modifierId: effect.kind === "modifier" ? effect.id : null,
    durationKind: effect.durationKind,
    remainingValue: finite ? requireFiniteDurationValue(effect.durationValue) : null,
  }).returning();
  if (!created) throw new Error("The Tabletop duration lifecycle binding could not be saved.");
  return created;
}

export async function bindPersistedEffectDurationInTransaction(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext,
  effect: PersistedMechanicalEffectIdentity,
): Promise<BindingRow | null> {
  if (!isTabletopBoundDurationKind(effect.duration.kind)) return null;
  return insertBinding(tx, context, {
    kind: effect.kind,
    id: effect.id,
    characterId: effect.characterId,
    durationKind: effect.duration.kind,
    durationValue: effect.duration.value,
  });
}

async function loadEffectForBinding(
  tx: DurationLifecycleTransaction,
  effectKind: DurationEffectKind,
  effectId: number,
  characterId: number,
  lock: boolean,
): Promise<LoadedEffect> {
  if (effectKind === "condition") {
    const query = tx.select({
      id: campaignCharacterActiveCondition.id,
      characterId: campaignCharacterActiveCondition.characterId,
      durationKind: campaignCharacterActiveCondition.durationKind,
      durationValue: campaignCharacterActiveCondition.durationValue,
      endedAt: campaignCharacterActiveCondition.resolvedAt,
    }).from(campaignCharacterActiveCondition).where(and(
      eq(campaignCharacterActiveCondition.id, positiveId(effectId, "Condition")),
      eq(campaignCharacterActiveCondition.characterId, positiveId(characterId, "Character")),
    )).limit(1);
    const rows = lock ? await query.for("update") : await query;
    if (!rows[0]) throw new Error("That Active Condition no longer exists for this Character.");
    return { ...rows[0], kind: "condition", durationKind: rows[0].durationKind as LoadedEffect["durationKind"] };
  }
  const query = tx.select({
    id: campaignCharacterActiveModifier.id,
    characterId: campaignCharacterActiveModifier.characterId,
    durationKind: campaignCharacterActiveModifier.durationKind,
    durationValue: campaignCharacterActiveModifier.durationValue,
    endedAt: campaignCharacterActiveModifier.endedAt,
  }).from(campaignCharacterActiveModifier).where(and(
    eq(campaignCharacterActiveModifier.id, positiveId(effectId, "Modifier")),
    eq(campaignCharacterActiveModifier.characterId, positiveId(characterId, "Character")),
  )).limit(1);
  const rows = lock ? await query.for("update") : await query;
  if (!rows[0]) throw new Error("That Active Modifier no longer exists for this Character.");
  return { ...rows[0], kind: "modifier", durationKind: rows[0].durationKind as LoadedEffect["durationKind"] };
}

export async function bindExistingEffectDurationInTransaction(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext,
  input: { effectKind: DurationEffectKind; effectId: number; characterId: number },
): Promise<BindingRow> {
  const effect = await loadEffectForBinding(tx, input.effectKind, input.effectId, input.characterId, true);
  if (effect.endedAt) throw new Error("An ended Active Effect cannot receive a new duration binding.");
  if (!isTabletopBoundDurationKind(effect.durationKind)) {
    throw new Error("Until Removed effects do not receive automatic Tabletop duration bindings.");
  }
  return insertBinding(tx, context, {
    ...effect,
    durationKind: effect.durationKind,
  });
}

async function closeBinding(
  tx: DurationLifecycleTransaction,
  binding: BindingRow,
  status: "expired" | "closed",
  reason: string,
): Promise<void> {
  const closeReason = reason.trim();
  if (!closeReason) throw new Error("Duration lifecycle closure requires a reason.");
  const updated = await tx.update(campaignSessionEffectDurationBinding).set({
    remainingValue: status === "expired" && binding.remainingValue !== null ? 0 : binding.remainingValue,
    status,
    closedAt: new Date(),
    closeReason,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEffectDurationBinding.id, binding.id),
    eq(campaignSessionEffectDurationBinding.status, "active"),
  )).returning({ id: campaignSessionEffectDurationBinding.id });
  if (!updated.length) throw new Error("The duration lifecycle changed before closure completed.");
}

async function expireBoundEffect(
  tx: DurationLifecycleTransaction,
  binding: BindingRow,
  reason: string,
): Promise<void> {
  const effectKind: DurationEffectKind = binding.conditionId !== null ? "condition" : "modifier";
  const effectId = binding.conditionId ?? binding.modifierId;
  if (effectId === null) throw new Error("The duration lifecycle has no authoritative effect identity.");
  const effect = await loadEffectForBinding(tx, effectKind, effectId, binding.characterId, true);
  if (effect.endedAt) {
    await closeBinding(tx, binding, "closed", "Effect was already ended outside Tabletop Operations.");
    return;
  }
  if (effect.kind === "condition") {
    await resolveConditionInTransaction(tx, effect.characterId, effect.id, reason);
  } else {
    await endModifierInTransaction(tx, effect.characterId, effect.id, reason);
  }
  await closeBinding(tx, binding, "expired", reason);
}

async function activeBindings(
  tx: DurationLifecycleTransaction,
  filters: { encounterId?: number; sceneId?: number; kinds: TabletopBoundDurationKind[] },
): Promise<BindingRow[]> {
  const query = tx.select().from(campaignSessionEffectDurationBinding).where(and(
    eq(campaignSessionEffectDurationBinding.status, "active"),
    inArray(campaignSessionEffectDurationBinding.durationKind, filters.kinds),
    ...(filters.encounterId === undefined ? [] : [eq(campaignSessionEffectDurationBinding.encounterId, filters.encounterId)]),
    ...(filters.sceneId === undefined ? [] : [eq(campaignSessionEffectDurationBinding.sceneId, filters.sceneId)]),
  )).orderBy(asc(campaignSessionEffectDurationBinding.id));
  return query.for("update");
}

export async function applyInitiativeDurationTransitionInTransaction(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext & { encounterId: number },
  before: InitiativeDurationPosition,
  after: InitiativeDurationPosition,
  passage: "elapsed" | "correction" = "elapsed",
): Promise<void> {
  const transition = getInitiativeDurationTransition(before, after, passage);
  if (transition.initiativeClosed) {
    const bindings = await activeBindings(tx, {
      encounterId: context.encounterId,
      kinds: ["combat-steps", "combat-rounds"],
    });
    for (const binding of bindings) {
      await expireBoundEffect(tx, binding, "Combat ended when Initiative Runtime closed.");
    }
    return;
  }
  const advances = [
    { kind: "combat-steps" as const, count: transition.combatStepBoundaries, label: `Expired after Combat Step ${after.stepNumber}.` },
    { kind: "combat-rounds" as const, count: transition.combatRoundBoundaries, label: `Expired at Initiative Round ${after.roundNumber}.` },
  ];
  for (const advance of advances) {
    if (advance.count === 0) continue;
    const bindings = await activeBindings(tx, { encounterId: context.encounterId, kinds: [advance.kind] });
    for (const binding of bindings) {
      const next = advanceFiniteDuration(requireFiniteDurationValue(binding.remainingValue), advance.count);
      if (next.expired) {
        await expireBoundEffect(tx, binding, advance.label);
      } else {
        await tx.update(campaignSessionEffectDurationBinding).set({
          remainingValue: next.remainingValue,
          updatedAt: new Date(),
        }).where(and(
          eq(campaignSessionEffectDurationBinding.id, binding.id),
          eq(campaignSessionEffectDurationBinding.status, "active"),
        ));
      }
    }
  }
}

export async function expireSceneDurationsInTransaction(
  tx: DurationLifecycleTransaction,
  sceneId: number,
  sceneSequenceNumber: number,
): Promise<void> {
  const bindings = await activeBindings(tx, { sceneId, kinds: ["scene"] });
  for (const binding of bindings) {
    await expireBoundEffect(tx, binding, `Scene ${sceneSequenceNumber} completed.`);
  }
}

export async function closeDurationBindingForEffectInTransaction(
  tx: DurationLifecycleTransaction,
  input: { effectKind: DurationEffectKind; effectId: number; characterId: number; reason?: string },
): Promise<void> {
  const condition = input.effectKind === "condition"
    ? eq(campaignSessionEffectDurationBinding.conditionId, input.effectId)
    : eq(campaignSessionEffectDurationBinding.modifierId, input.effectId);
  const [binding] = await tx.select().from(campaignSessionEffectDurationBinding).where(and(
    condition,
    eq(campaignSessionEffectDurationBinding.characterId, input.characterId),
    eq(campaignSessionEffectDurationBinding.status, "active"),
  )).limit(1).for("update");
  if (!binding) return;
  await closeBinding(tx, binding, "closed", input.reason?.trim() || "Effect ended manually.");
}

export async function setDurationRemainingInTransaction(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext,
  bindingId: number,
  remainingValue: number,
): Promise<void> {
  const remaining = requireFiniteDurationValue(remainingValue);
  const [binding] = await tx.select().from(campaignSessionEffectDurationBinding).where(and(
    eq(campaignSessionEffectDurationBinding.id, positiveId(bindingId, "Duration binding")),
    eq(campaignSessionEffectDurationBinding.status, "active"),
  )).limit(1).for("update");
  if (!binding) throw new Error("That active duration binding no longer exists.");
  if (binding.campaignId !== context.campaignId
    || binding.sessionId !== context.sessionId
    || binding.sceneId !== context.sceneId
    || (binding.encounterId !== null && binding.encounterId !== context.encounterId)) {
    throw new Error("That duration binding does not belong to the selected Scene or Encounter.");
  }
  if (binding.durationKind !== "combat-steps" && binding.durationKind !== "combat-rounds") {
    throw new Error("Only finite combat durations have a remaining-value correction.");
  }
  await tx.update(campaignSessionEffectDurationBinding).set({ remainingValue: remaining, updatedAt: new Date() })
    .where(eq(campaignSessionEffectDurationBinding.id, binding.id));
}

export async function expireDurationNowInTransaction(
  tx: DurationLifecycleTransaction,
  context: TabletopDurationContext,
  bindingId: number,
): Promise<void> {
  const [binding] = await tx.select().from(campaignSessionEffectDurationBinding).where(and(
    eq(campaignSessionEffectDurationBinding.id, positiveId(bindingId, "Duration binding")),
    eq(campaignSessionEffectDurationBinding.status, "active"),
  )).limit(1).for("update");
  if (!binding) throw new Error("That active duration binding no longer exists.");
  if (binding.campaignId !== context.campaignId
    || binding.sessionId !== context.sessionId
    || binding.sceneId !== context.sceneId
    || (binding.encounterId !== null && binding.encounterId !== context.encounterId)) {
    throw new Error("That duration binding does not belong to the selected Scene or Encounter.");
  }
  await expireBoundEffect(tx, binding, "Expired by explicit G.O.D. duration correction.");
}

export async function readCharacterDurationBindingsInTransaction(
  tx: DurationLifecycleTransaction,
  characterId: number,
  includeHistory = false,
): Promise<TabletopDurationBindingView[]> {
  const rows = await tx.select({
    id: campaignSessionEffectDurationBinding.id,
    characterId: campaignSessionEffectDurationBinding.characterId,
    conditionId: campaignSessionEffectDurationBinding.conditionId,
    modifierId: campaignSessionEffectDurationBinding.modifierId,
    durationKind: campaignSessionEffectDurationBinding.durationKind,
    remainingValue: campaignSessionEffectDurationBinding.remainingValue,
    status: campaignSessionEffectDurationBinding.status,
    sceneId: campaignSessionEffectDurationBinding.sceneId,
    sceneTitle: campaignSessionScene.title,
    encounterId: campaignSessionEffectDurationBinding.encounterId,
    encounterTitle: campaignSessionEncounter.title,
    closedAt: campaignSessionEffectDurationBinding.closedAt,
    closeReason: campaignSessionEffectDurationBinding.closeReason,
  }).from(campaignSessionEffectDurationBinding)
    .innerJoin(campaignSessionScene, eq(campaignSessionScene.id, campaignSessionEffectDurationBinding.sceneId))
    .leftJoin(campaignSessionEncounter, eq(campaignSessionEncounter.id, campaignSessionEffectDurationBinding.encounterId))
    .where(and(
      eq(campaignSessionEffectDurationBinding.characterId, positiveId(characterId, "Character")),
      ...(includeHistory ? [] : [eq(campaignSessionEffectDurationBinding.status, "active")]),
    ))
    .orderBy(asc(campaignSessionEffectDurationBinding.createdAt), asc(campaignSessionEffectDurationBinding.id));
  return rows.map((row) => ({
    id: row.id,
    characterId: row.characterId,
    effectKind: row.conditionId !== null ? "condition" : "modifier",
    effectId: row.conditionId ?? row.modifierId!,
    durationKind: row.durationKind as TabletopBoundDurationKind,
    remainingValue: row.remainingValue,
    status: row.status,
    sceneId: row.sceneId,
    sceneTitle: row.sceneTitle,
    encounterId: row.encounterId,
    encounterTitle: row.encounterTitle,
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason,
  }));
}
