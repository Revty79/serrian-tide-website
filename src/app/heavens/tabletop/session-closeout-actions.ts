"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  finalizeSessionCloseoutInTransaction,
  lockSessionCloseoutContextInTransaction,
  readSessionCloseoutInTransaction,
  type SessionCloseoutView,
} from "@/features/tabletop-operations/session-closeout-service";
import { requireGod } from "@/lib/server-access";

function refreshSessionCloseout(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

export async function getSessionCloseout(sessionId: number): Promise<SessionCloseoutView> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockSessionCloseoutContextInTransaction(tx, sessionId, access.user.id);
    return readSessionCloseoutInTransaction(tx, context);
  });
}

export async function finalizeSessionCloseout(sessionId: number): Promise<SessionCloseoutView> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockSessionCloseoutContextInTransaction(tx, sessionId, access.user.id);
    return finalizeSessionCloseoutInTransaction(tx, context);
  });
  refreshSessionCloseout();
  return result;
}
