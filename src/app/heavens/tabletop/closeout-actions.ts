"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  finalizeEncounterCloseoutInTransaction,
  lockEncounterCloseoutContextInTransaction,
  readEncounterCloseoutInTransaction,
  type EncounterCloseoutView,
  type FinalizeEncounterCloseoutInput,
} from "@/features/tabletop-operations/encounter-closeout-service";
import {
  bindExistingEffectDurationInTransaction,
  expireDurationNowInTransaction,
  setDurationRemainingInTransaction,
} from "@/features/tabletop-operations/duration-lifecycle-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import type { DurationEffectKind } from "@/features/tabletop-operations/duration-lifecycle";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

function refreshCloseout(characterIds: readonly number[] = []): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
  for (const characterId of new Set(characterIds)) {
    revalidatePath(`/realms/characters/${characterId}`);
    revalidatePath(`/heavens/characters/${characterId}`);
    revalidatePath(`/heavens/npcs/${characterId}`);
  }
}

export async function getEncounterCloseout(encounterId: number): Promise<EncounterCloseoutView> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, access.user.id);
    return readEncounterCloseoutInTransaction(tx, context);
  });
}

export async function finalizeEncounterCloseout(
  encounterId: number,
  input: FinalizeEncounterCloseoutInput,
): Promise<EncounterCloseoutView> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, access.user.id);
    const finalized = await finalizeEncounterCloseoutInTransaction(tx, context, input);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [],
      category: "hierarchy",
    });
    return finalized;
  });
  refreshCloseout(input.awards.map(({ characterId }) => characterId));
  return result;
}

async function mutateDuration(
  encounterId: number,
  operation: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>,
  ) => Promise<void>,
): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    if (context.encounterStatus !== "active" || context.sceneStatus !== "active" || context.sessionStatus !== "active") {
      throw new Error("Duration corrections require an active Encounter, Scene, and Session.");
    }
    await operation(tx, context);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [],
      category: "character-state",
    });
  });
  refreshCloseout();
}

export async function bindEncounterEffectDuration(
  encounterId: number,
  input: { effectKind: DurationEffectKind; effectId: number; characterId: number },
): Promise<void> {
  await mutateDuration(encounterId, (tx, context) => bindExistingEffectDurationInTransaction(tx, context, input).then(() => undefined));
  refreshCloseout([input.characterId]);
}

export async function correctEncounterEffectDurationRemaining(
  encounterId: number,
  bindingId: number,
  remainingValue: number,
): Promise<void> {
  await mutateDuration(encounterId, (tx, context) => setDurationRemainingInTransaction(
    tx,
    context,
    bindingId,
    remainingValue,
  ));
}

export async function expireEncounterEffectDurationNow(
  encounterId: number,
  bindingId: number,
): Promise<void> {
  await mutateDuration(encounterId, (tx, context) => expireDurationNowInTransaction(tx, context, bindingId));
}
