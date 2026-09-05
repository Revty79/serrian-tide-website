"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  finalizeSessionCloseoutInTransaction,
  lockSessionCloseoutContextInTransaction,
  readSessionCloseoutInTransaction,
  type SessionCloseoutView,
} from "@/features/tabletop-operations/session-closeout-service";
import {
  prepareTabletopLifecycleMutationInTransaction,
  recordTabletopLifecycleAuditInTransaction,
} from "@/features/lifecycle/tabletop-lifecycle-service";
import type { LifecycleActor } from "@/features/lifecycle/types";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

function refreshSessionCloseout(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

export async function getSessionCloseout(sessionId: number): Promise<SessionCloseoutView> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  return db.transaction(async (tx) => {
    const context = await lockSessionCloseoutContextInTransaction(tx, sessionId, actor);
    return readSessionCloseoutInTransaction(tx, context);
  });
}

export async function finalizeSessionCloseout(sessionId: number): Promise<SessionCloseoutView> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  const result = await db.transaction(async (tx) => {
    const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
      tx,
      { entityKind: "campaign-session", entityId: sessionId },
      actor,
    );
    const context = await lockSessionCloseoutContextInTransaction(tx, sessionId, actor);
    const finalized = await finalizeSessionCloseoutInTransaction(tx, context);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: null,
      encounterId: null,
      characterIds: [],
      category: "hierarchy",
    });
    await recordTabletopLifecycleAuditInTransaction(
      tx,
      actor,
      "archive",
      lifecycle.root,
      lifecycle.preview,
    );
    return finalized;
  });
  refreshSessionCloseout();
  return result;
}
