import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { characterDerivedAbilityUse, characterDerivedAbilityRecharge } from "@/db/derived-ability-schema";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { planDerivedAbilityUse } from "@/features/derived-abilities/derived-ability-use";
import type { DerivedAbilityDefinition } from "@/features/derived-abilities/models";
import type { LockedActionDeclarationSnapshot } from "./action-declaration";
import type { ActionDeclarationActor } from "./action-declaration-service";
import { loadInitiativeEngineInTransaction, type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction } from "./runtime-integration-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";

/** Called inside the declaration savepoint after choice authorization. The
 * existing use planner owns limits and conditions; Initiative and consequences
 * remain on the declaration path, with one retained use receipt per start. */
export async function commitCombatDerivedAbilityUseInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor,
  snapshot: LockedActionDeclarationSnapshot, declarationId: number,
): Promise<number | null> {
  if (snapshot.source.kind !== "derived-ability") return null;
  await assertCombatWritableInTransaction(tx, context.encounterId);
  const frozen = snapshot.authoredSource!;
  const state = await loadCharacterDerivedAbilitiesInTransaction(tx, snapshot.actorCharacterId, actor.userId, true);
  const ability = state.catalog.find(({ id }) => id === frozen.sourceId);
  const status = state.resolution.statuses.find(({ abilityId }) => abilityId === frozen.sourceId);
  if (!ability || !status?.possessed || !status.available) throw new Error("The exact Derived Ability is no longer possessed and available.");
  const original = frozen.authoredData.ability as DerivedAbilityDefinition;
  const storedForm = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  if (!isDeepStrictEqual(storedForm(ability.costs), original.costs) || !isDeepStrictEqual(storedForm(ability.useLimits), original.useLimits)
    || !isDeepStrictEqual(storedForm(ability.useConditions), original.useConditions)) throw new Error("The Derived Ability costs or use requirements changed after locking; revise and lock the exact source again.");
  const uses = await tx.select().from(characterDerivedAbilityUse).where(and(eq(characterDerivedAbilityUse.characterId, snapshot.actorCharacterId), eq(characterDerivedAbilityUse.derivedAbilityId, ability.id)));
  const recharges = await tx.select().from(characterDerivedAbilityRecharge).where(and(eq(characterDerivedAbilityRecharge.characterId, snapshot.actorCharacterId), eq(characterDerivedAbilityRecharge.derivedAbilityId, ability.id)));
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const manaCosts = ability.costs.some(({ costType }) => costType === "mana");
  const mana = manaCosts ? await readActiveManaInTransaction(tx, snapshot.actorCharacterId) : null;
  const ruling = frozen.authoredData.combatResolutionRuling as { useRequirementsReason?: string } | undefined;
  const eventKey = typeof snapshot.source.payload?.eventKey === "string" ? snapshot.source.payload.eventKey.trim() || null : null;
  const plan = planDerivedAbilityUse({ characterId: snapshot.actorCharacterId, resolvedStatus: status,
    // Pending Initiative already validates timing, including multi-round work.
    // Effects are planned at completion for their exact signed target identities.
    ability: { ...ability, costs: ability.costs.filter(({ costType }) => costType !== "initiative"), effects: [], mechanicalEffect: "" },
    uses: uses.map((row) => ({ ...row, usedAt: row.usedAt.toISOString() })),
    recharges: recharges.map((row) => ({ ...row, refreshScope: row.refreshScope as "manual" | "event", rechargedAt: row.rechargedAt.toISOString() })),
    ownershipAcquiredAt: state.ownerships.find(({ id }) => id === status.ownershipId)?.acquiredAt ?? null,
    eventContext: { ...context, roundNumber: engine.runtime.roundNumber, eventKey,
      manaPools: new Map(mana?.pools.map((pool) => [pool.system, { current: pool.currentMana }]) ?? []) },
    manualConfirmed: Boolean(ruling?.useRequirementsReason?.trim()),
  });
  if (plan.status !== "ready") throw new Error(`Derived Ability cannot begin (${plan.status}): ${[...plan.issues, ...plan.manualSteps,
    ...plan.limits.filter(({ status }) => status !== "available").map(({ summary }) => summary),
    ...plan.conditions.filter(({ result }) => result !== "satisfied").map(({ summary }) => summary)].join(" ")}`);
  if (plan.costs.some(({ status }) => status !== "automatic")) throw new Error("The exact Derived Ability has a manual resource cost; record its supported resource treatment before starting.");
  const [use] = await tx.insert(characterDerivedAbilityUse).values({ characterId: snapshot.actorCharacterId, derivedAbilityId: ability.id,
    ownershipId: status.ownershipId, actorUserId: actor.userId, encounterId: context.encounterId, sceneId: context.sceneId, sessionId: context.sessionId,
    roundNumber: engine.runtime.roundNumber, eventKey, effectSummary: "Effects pending on the authoritative combat declaration.",
    manualSteps: plan.manualSteps.join(" | "), useNotes: `Combat declaration ${declarationId}${ruling?.useRequirementsReason ? `: ${ruling.useRequirementsReason}` : ""}`,
  }).returning({ id: characterDerivedAbilityUse.id });
  return use.id;
}
