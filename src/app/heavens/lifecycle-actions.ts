"use server";

import { revalidatePath } from "next/cache";

import {
  archiveLifecycleEntityForActor,
  permanentlyDeleteLifecycleEntityForActor,
  previewLifecycleEntityForActor,
  restoreLifecycleEntityForActor,
} from "@/features/lifecycle/lifecycle-service";
import type {
  LifecycleActor,
  LifecycleDeletionResult,
  LifecyclePreview,
  LifecycleTargetInput,
} from "@/features/lifecycle/types";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

async function lifecycleActor(): Promise<LifecycleActor> {
  const { session, roles } = await requireGodOrAdminAccessContext();
  return { userId: session.user.id, roles };
}

function revalidateLifecyclePaths(
  target: LifecycleTargetInput,
  campaignId?: number,
): void {
  revalidatePath("/heavens");
  switch (target.entityKind) {
    case "campaign":
      revalidatePath("/heavens/campaigns");
      revalidatePath("/heavens/npcs");
      revalidatePath("/heavens/tabletop");
      revalidatePath("/realms");
      revalidatePath("/realms/tabletop");
      revalidatePath("/chat");
      break;
    case "player-character":
    case "race-npc":
    case "creature-npc":
      revalidatePath("/heavens/campaigns");
      revalidatePath("/heavens/npcs");
      revalidatePath(`/heavens/npcs/${target.entityId}`);
      revalidatePath(`/heavens/characters/${target.entityId}`);
      revalidatePath("/heavens/tabletop");
      revalidatePath("/realms");
      revalidatePath("/realms/tabletop");
      revalidatePath(`/realms/characters/${target.entityId}`);
      if (campaignId) revalidatePath(`/heavens/tabletop?campaign=${campaignId}`);
      break;
    case "race":
      revalidatePath("/heavens/races");
      revalidatePath("/heavens/campaigns");
      revalidatePath("/heavens/npcs");
      revalidatePath("/realms");
      break;
    case "creature":
      revalidatePath("/heavens/creatures");
      revalidatePath("/heavens/npcs");
      revalidatePath("/heavens/tabletop");
      break;
    case "skill":
      revalidatePath("/heavens/skills");
      revalidatePath("/heavens/races");
      revalidatePath("/heavens/creatures");
      revalidatePath("/realms");
      break;
    case "item":
      revalidatePath("/heavens/equipment");
      revalidatePath("/heavens/inventory");
      revalidatePath("/heavens/campaigns");
      revalidatePath("/heavens/tabletop");
      revalidatePath("/realms");
      break;
    case "derived-ability":
      revalidatePath("/heavens/derived-abilities");
      revalidatePath("/heavens/campaigns");
      revalidatePath("/realms");
      break;
  }
}

export async function previewLifecycleEntity(
  target: LifecycleTargetInput,
): Promise<LifecyclePreview> {
  return previewLifecycleEntityForActor(target, await lifecycleActor());
}

export async function archiveLifecycleEntity(
  target: LifecycleTargetInput,
  reason?: string,
): Promise<LifecyclePreview> {
  const result = await archiveLifecycleEntityForActor(
    target,
    await lifecycleActor(),
    reason,
  );
  revalidateLifecyclePaths(target);
  return result;
}

export async function restoreLifecycleEntity(
  target: LifecycleTargetInput,
): Promise<LifecyclePreview> {
  const result = await restoreLifecycleEntityForActor(
    target,
    await lifecycleActor(),
  );
  revalidateLifecyclePaths(target);
  return result;
}

export async function permanentlyDeleteLifecycleEntity(
  target: LifecycleTargetInput,
  confirmationName?: string,
): Promise<LifecycleDeletionResult> {
  const result = await permanentlyDeleteLifecycleEntityForActor(
    target,
    await lifecycleActor(),
    confirmationName,
  );
  revalidateLifecyclePaths(target, result.campaignId);
  return result;
}
