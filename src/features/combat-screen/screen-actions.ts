"use server";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounter as encounter, campaignSessionEncounterParticipant as member,
  campaignSessionEncounterInitiative as initiative, campaignSessionEncounterInitiativeParticipant as enrollment } from "@/db/tabletop-operations-schema";
import { requireGod, requirePlayer } from "@/lib/server-access";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { readCombatProjectionInTransaction, readCombatEntityInformationInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { readCombatPauseStateInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { getEncounterInitiativeCapacityOptions } from "@/app/heavens/tabletop/initiative-actions";
import { getSceneEncounterWorkspace } from "@/app/heavens/tabletop/encounter-actions";
import type { CombatScreenScope } from "./screen-types";

export async function readCombatScreen(scope: CombatScreenScope, selectedId?: number | null) {
  if (scope.role !== "god" && scope.role !== "player") throw new Error("Choose a valid combat role.");
  const access = scope.role === "god" ? await requireGod() : await requirePlayer();
  const data = await db.transaction(async (tx) => {
    const context = scope.role === "god"
      ? await lockOwnedEncounterRuntimeInTransaction(tx, scope.encounterId, access.user.id)
      : await lockPlayerCombatContextInTransaction(tx, scope.encounterId, scope.characterId, access.user.id, true);
    const actor = scope.role === "god" ? { authority: "god-owner" as const, userId: access.user.id }
      : { authority: "player" as const, userId: access.user.id, characterId: scope.characterId };
    const [record] = await tx.select({ title: encounter.title, status: encounter.status }).from(encounter).where(eq(encounter.id, scope.encounterId));
    const roster = await tx.select({ participantId: member.characterId, label: member.displayLabel, name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc, kind: member.participantKind }).from(member)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, member.characterId)).where(eq(member.encounterId, scope.encounterId)).orderBy(asc(member.sortOrder));
    const [runtime] = await tx.select().from(initiative).where(eq(initiative.encounterId, scope.encounterId));
    const enrolled = await tx.select({ id: enrollment.characterId }).from(enrollment).where(eq(enrollment.encounterId, scope.encounterId));
    const canProject = !!runtime && (scope.role === "god" || enrolled.some(({ id }) => id === scope.characterId));
    const projection = canProject ? await readCombatProjectionInTransaction(tx, context, actor) : null;
    const chosen = selectedId ?? (scope.role === "player" ? scope.characterId : roster[0]?.participantId);
    const information = projection?.entities.some(({ participantId }) => participantId === chosen)
      ? await readCombatEntityInformationInTransaction(tx, context, actor, chosen!) : null;
    return { context, title: record.title, status: record.status, initialized: !!runtime, projection, information,
      pause: await readCombatPauseStateInTransaction(tx, scope.encounterId, actor),
      roster: roster.map((entry) => ({ ...entry, name: entry.kind === "creature" ? entry.label : entry.name ?? "Character",
        enrolled: enrolled.some(({ id }) => id === entry.participantId) })) };
  });
  // These retain their own owner checks and transactions. Never overlap reads on a transaction client.
  const setup = scope.role === "god" ? await getSceneEncounterWorkspace(data.context.sceneId, scope.encounterId) : null;
  const capacities = scope.role === "god" && !data.initialized ? await getEncounterInitiativeCapacityOptions(scope.encounterId) : [];
  return { ...data, setup, capacities };
}

export async function listPlayerCombatEncounters(characterId: number) {
  const access = await requirePlayer();
  const rows = await db.select({ id: encounter.id, title: encounter.title, status: encounter.status }).from(encounter)
    .innerJoin(member, and(eq(member.encounterId, encounter.id), eq(member.characterId, characterId)))
    .innerJoin(campaignCharacter, and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.playerUserId, access.user.id),
      eq(campaignCharacter.isNpc, false), isNull(campaignCharacter.archivedAt)))
    .orderBy(desc(encounter.id));
  return rows;
}
