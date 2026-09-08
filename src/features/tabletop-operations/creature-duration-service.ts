import "server-only";
import { and, eq } from "drizzle-orm";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import type { RuntimeIntegrationTransaction } from "./runtime-integration-service";
import type { InitiativeDurationTransition } from "./duration-lifecycle";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { captureCombatModifierTimingInTransaction, reconcileCombatModifierTimingInTransaction } from "./combat-modifier-timing-service";
type LocalEffect = Record<string, unknown> & { duration?: { kind: string; value?: number | null }; remainingValue?: number; expiredAt?: string;
  channel?: string; targetKey?: string; amount?: number };

export async function advanceCreatureDurationsInTransaction(
  tx: RuntimeIntegrationTransaction, scope: { encounterId?: number; sceneId?: number },
  transition: InitiativeDurationTransition & { sceneClosed?: boolean },
): Promise<void> {
  if (!transition.combatStepBoundaries && !transition.combatRoundBoundaries && !transition.initiativeClosed && !transition.sceneClosed) return;
  const rows = await tx.select().from(campaignSessionEncounterParticipant).where(and(
    eq(campaignSessionEncounterParticipant.participantKind, "creature"),
    ...(scope.encounterId == null ? [] : [eq(campaignSessionEncounterParticipant.encounterId, scope.encounterId)]),
    ...(scope.sceneId == null ? [] : [eq(campaignSessionEncounterParticipant.sceneId, scope.sceneId)]),
  ));
  for (const row of rows) {
    await assertCombatWritableInTransaction(tx, row.encounterId);
    const state = row.localStateJson as { conditions?: LocalEffect[]; modifiers?: LocalEffect[] } | null;
    if (!state) continue;
    const next = structuredClone(state);
    const endedModifiers: Array<{ channel: string; targetKey: string }> = [];
    let changed = false;
    for (const field of ["conditions", "modifiers"] as const) {
      for (const effect of next[field] ?? []) {
        if (effect.expiredAt || effect.endedAt || !effect.duration) continue;
        const kind = effect.duration.kind;
        const steps = kind === "combat-steps" ? transition.combatStepBoundaries : kind === "combat-rounds" ? transition.combatRoundBoundaries : 0;
        const closed = transition.initiativeClosed && ["combat-steps", "combat-rounds"].includes(kind) || transition.sceneClosed && kind === "scene";
        if (!closed && !steps) continue;
        const remaining = effect.remainingValue ?? effect.duration.value;
        if (!closed && (!Number.isInteger(remaining) || Number(remaining) <= 0)) throw new Error("The exact Creature effect has an invalid remaining combat duration; reconcile its authored duration.");
        effect.remainingValue = closed ? 0 : Math.max(0, Number(remaining) - steps);
        if (effect.remainingValue === 0) {
          effect.expiredAt = new Date().toISOString();
          effect.expirationReason = closed ? "The bound combat or Scene ended." : "The bound combat duration elapsed.";
          if (field === "modifiers" && effect.channel && effect.targetKey) endedModifiers.push({ channel: effect.channel, targetKey: effect.targetKey });
        }
        changed = true;
      }
    }
    if (!changed) continue;
    const timing = await captureCombatModifierTimingInTransaction(tx, row.characterId, endedModifiers);
    await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: next, updatedAt: new Date() })
      .where(eq(campaignSessionEncounterParticipant.participantId, row.participantId));
    await reconcileCombatModifierTimingInTransaction(tx, timing);
  }
}
