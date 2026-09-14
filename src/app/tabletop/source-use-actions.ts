"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireGod, requirePlayer } from "@/lib/server-access";
import type { ItemUseRequest } from "@/features/items/item-use";
import type { SpellCastRequest } from "@/features/characters/character-spell-runtime";
import type { TabletopSourceUse } from "@/features/tabletop-operations/source-use";
import { cancelSourceUseInTransaction, completeSourceUseInTransaction, executeUnruledSourceUseInTransaction, readSourceUseRequestsInTransaction, requestSourceUseInTransaction, ruleSourceUseInTransaction } from "@/features/tabletop-operations/source-use-service";

function refresh() {
  revalidatePath("/realms/tabletop");
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/characters", "layout");
  revalidatePath("/heavens/characters", "layout");
}

export async function requestTabletopSourceUse(input: { sessionId: number; source: TabletopSourceUse; intent: string; idempotencyKey: string }) {
  const access = await requirePlayer();
  const id = await db.transaction((tx) => requestSourceUseInTransaction(tx, { userId: access.user.id, role: "player" }, input));
  refresh();
  return id;
}

export async function ruleTabletopSourceUse(input: { requestId: number; decision: "approved" | "rejected"; ruling: string }) {
  const access = await requireGod();
  await db.transaction((tx) => ruleSourceUseInTransaction(tx, { userId: access.user.id, role: "god" }, input));
  refresh();
}

export async function confirmTabletopSourceUse(requestId: number) {
  const access = await requirePlayer();
  const result = await db.transaction((tx) => completeSourceUseInTransaction(tx, { userId: access.user.id, role: "player" }, requestId));
  refresh();
  return result;
}

export async function cancelPlayerTabletopSourceUse(requestId: number) {
  const access = await requirePlayer();
  await db.transaction((tx) => cancelSourceUseInTransaction(tx, { userId: access.user.id, role: "player" }, requestId));
  refresh();
}

export async function cancelGodTabletopSourceUse(requestId: number) {
  const access = await requireGod();
  await db.transaction((tx) => cancelSourceUseInTransaction(tx, { userId: access.user.id, role: "god" }, requestId));
  refresh();
}

export async function getGodTabletopSourceUses(sessionId: number) {
  const access = await requireGod();
  return db.transaction((tx) => readSourceUseRequestsInTransaction(tx, { userId: access.user.id, role: "god" }, { sessionId }));
}

export async function executeTabletopItemUse(request: ItemUseRequest) {
  const access = await requirePlayer();
  const result = await db.transaction((tx) => executeUnruledSourceUseInTransaction(tx, { userId: access.user.id, role: "player" }, { kind: "item", request }));
  refresh();
  if (result.kind !== "item") throw new Error("Unexpected Item result.");
  return result.result;
}

export async function executeTabletopSpellUse(request: SpellCastRequest) {
  const access = await requirePlayer();
  const result = await db.transaction((tx) => executeUnruledSourceUseInTransaction(tx, { userId: access.user.id, role: "player" }, { kind: "spell", request }));
  refresh();
  if (result.kind !== "spell") throw new Error("Unexpected Spell result.");
  return result.result;
}
