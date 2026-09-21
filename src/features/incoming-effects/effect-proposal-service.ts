import "server-only";
import type { db } from "@/db";
import type { ActionEffectPlanProposal, FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import type { OwnedEncounterRuntimeContext } from "@/features/tabletop-operations/runtime-integration-service";
import { readIncomingEffectEncounterTargetInTransaction } from "./incoming-effect-target-service";
import { resolveIncomingEffectProposal, incomingObject } from "./effect-proposal";
import type { IncomingEffectTarget } from "./models";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function resolveIncomingEffectPlanInTransaction(tx: Transaction, context: OwnedEncounterRuntimeContext,
  source: FrozenActionSourceSnapshot, proposal: ActionEffectPlanProposal): Promise<ActionEffectPlanProposal> {
  const targets = new Map<string, IncomingEffectTarget>();
  const effects = [];
  for (const effect of proposal.effects) {
    const kind = incomingObject(incomingObject(effect.finalValue).effect).kind;
    if (effect.status === "declined" || !["health.damage", "condition.apply", "modifier.apply"].includes(String(kind))) { effects.push(effect); continue; }
    const key = `${effect.targetParticipantId}:${kind === "health.damage"}`;
    let target = targets.get(key);
    if (!target) {
      target = await readIncomingEffectEncounterTargetInTransaction(tx, context, effect.targetParticipantId, kind === "health.damage");
      targets.set(key, target);
    }
    effects.push(resolveIncomingEffectProposal(effect, source, target));
  }
  return { ...proposal, effects, status: effects.some(({ status }) => status === "requires-god-ruling") ? "requires-god-ruling" : proposal.status };
}
