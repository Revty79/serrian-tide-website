import "server-only";
import { and, eq } from "drizzle-orm";
import { campaignSessionEncounterParticipant as member } from "@/db/tabletop-operations-schema";
import { campaignCreatureNpcProfile } from "@/db/realm-schema";
import { characterDerivedAbilityUse, characterDerivedAbilityRecharge } from "@/db/derived-ability-schema";
import { readAbilityFactsInTransaction } from "@/features/ability-use-conditions/fact-service";
import { evaluateAbilityUseCondition } from "@/features/ability-use-conditions/facts";
import { normalizeCreatureAbilityDefinition } from "@/features/creatures/creature-ability";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { planDerivedAbilityUse } from "@/features/derived-abilities/derived-ability-use";
import type { DerivedAbilityDefinition } from "@/features/derived-abilities/models";
import { readActiveManaInTransaction, spendActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { isCharacterMagicSystem } from "@/features/active-state/active-mana";
import { combatObject as object } from "./combat-condition-state";
import { loadInitiativeEngineInTransaction, type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction } from "./runtime-integration-service";
import type { ActionDeclarationActor } from "./action-declaration-service";

export async function readAbilityResponseChoicesInTransaction(tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor, participantId: number, opportunityId: number) {
  if (actor.authority === "player" && actor.characterId !== participantId) throw new Error("Only your own response Abilities are available.");
  const [occurrence] = await tx.select().from(member).where(and(eq(member.encounterId, context.encounterId), eq(member.characterId, participantId), eq(member.campaignId, context.campaignId))).limit(1);
  if (!occurrence) throw new Error("Ability responder is outside this Encounter.");
  let snapshot = occurrence.creatureSnapshotJson;
  if (participantId > 0) {
    const [profile] = await tx.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, participantId)).limit(1);
    if (profile) snapshot = JSON.parse(profile.currentSnapshotJson);
  }
  const creature = (Array.isArray(object(snapshot).abilities) ? object(snapshot).abilities as unknown[] : []).map(normalizeCreatureAbilityDefinition);
  const derived = participantId > 0 ? await loadCharacterDerivedAbilitiesInTransaction(tx, participantId, actor.userId, false) : null;
  const requestedKeys = [...creature.flatMap(({ authoring }) => authoring?.useConditions ?? []), ...(derived?.catalog.flatMap(({ useConditions }) => useConditions) ?? [])].flatMap(({ conditionKey }) => conditionKey ?? []);
  const facts = await readAbilityFactsInTransaction(tx, { ...context, participantId, opportunityId, requestedKeys });
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const mana = participantId > 0 ? await readActiveManaInTransaction(tx, participantId) : null;
  const uses = participantId > 0 ? await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, participantId)) : [];
  const recharges = participantId > 0 ? await tx.select().from(characterDerivedAbilityRecharge).where(eq(characterDerivedAbilityRecharge.characterId, participantId)) : [];
  const eventKey = [...facts.values()].find((fact) => fact.category === "event" && fact.type === "boolean" && fact.value)?.key ?? null;
  const runtimeContext = { ...context, facts, eventKey, roundNumber: engine.runtime.roundNumber,
    currentInitiative: engine.participants.find(({ characterId }) => characterId === participantId)?.currentInitiative,
    manaPools: new Map<string, { current: number }>(mana?.pools.map((pool) => [pool.system, { current: pool.currentMana }]) ?? []) };
  const history = object(occurrence.localStateJson).combatSourceResolutionHistory;
  const rulingFor = (kind: string, ref: string) => Array.isArray(history) ? [...history].reverse().map(object).find((ruling) => ruling.sourceKind === kind && ruling.sourceRef === ref) ?? null : null;
  const choices: Array<{ kind: "derived-ability" | "creature-ability"; ref: string; name: string; activationType: string;
    status: "eligible" | "manual" | "unavailable"; explanation: string; initiativeCost: number | null;
    definition: DerivedAbilityDefinition | ReturnType<typeof normalizeCreatureAbilityDefinition>; ownershipId: number | null;
    ruling: Record<string, unknown> | null; facts: unknown; eventKey: string | null }> = [];
  for (const ability of derived?.catalog ?? []) {
    if (!["triggered", "reaction"].includes(ability.activationType)) continue;
    const status = derived!.resolution.statuses.find(({ abilityId }) => abilityId === ability.id);
    if (!status?.possessed || !status.available) continue;
    const plan = planDerivedAbilityUse({ characterId: participantId, ability: { ...ability, effects: [], mechanicalEffect: "" }, resolvedStatus: status,
      eventContext: runtimeContext, uses: uses.filter(({ derivedAbilityId }) => derivedAbilityId === ability.id).map((row) => ({ ...row, usedAt: row.usedAt.toISOString() })),
      recharges: recharges.filter(({ derivedAbilityId }) => derivedAbilityId === ability.id).map((row) => ({ ...row, refreshScope: row.refreshScope as "manual" | "event", rechargedAt: row.rechargedAt.toISOString() })),
      ownershipAcquiredAt: derived!.ownerships.find(({ id }) => id === status.ownershipId)?.acquiredAt ?? null });
    const initiativeCost = ability.costs.filter(({ costType }) => costType === "initiative").reduce((sum, { amount }) => sum + amount, 0) || null;
    choices.push({ kind: "derived-ability", ref: `derived-ability:${ability.id}`, name: ability.name, activationType: ability.activationType,
      status: plan.status === "ready" ? "eligible" : plan.status === "manual" ? "manual" : "unavailable", explanation: [...plan.issues, ...plan.manualSteps,
        ...plan.conditions.filter(({ result }) => result !== "satisfied").map(({ summary }) => summary), ...plan.limits.filter(({ status }) => status !== "available").map(({ summary }) => summary)].join(" "),
      initiativeCost, definition: ability, ownershipId: status.ownershipId, ruling: rulingFor("derived-ability", `derived-ability:${ability.id}`), facts: [...facts.values()], eventKey });
  }
  for (const ability of creature) {
    const authored = ability.authoring;
    if (!authored || !["triggered", "reaction"].includes(authored.activationType ?? "")) continue;
    const results = authored.useConditions.map((condition) => evaluateAbilityUseCondition(condition, facts));
    const insufficient = authored.costs.some(({ costType, resourceKey, amount }) => costType === "mana" && resourceKey && runtimeContext.manaPools.has(resourceKey) && runtimeContext.manaPools.get(resourceKey)!.current < amount);
    const manual = results.includes("manual") || authored.useLimits.length > 0 || authored.costs.some(({ costType, resourceKey }) => costType !== "mana" || !resourceKey || !runtimeContext.manaPools.has(resourceKey));
    choices.push({ kind: "creature-ability", ref: ability.canonicalId, name: ability.abilityName, activationType: authored.activationType!,
      status: results.includes("unsatisfied") || insufficient ? "unavailable" : manual ? "manual" : "eligible",
      explanation: results.includes("unsatisfied") ? "Use Conditions are not satisfied." : insufficient ? "Insufficient Mana." : manual ? "Unknown conditions, costs or use limits require a G.O.D. ruling." : "Use Conditions match this response window.",
      initiativeCost: authored.initiativeCost, definition: ability, ownershipId: null, ruling: rulingFor("creature-ability", ability.canonicalId), facts: [...facts.values()], eventKey });
  }
  return choices;
}

export async function commitAbilityResponseResourcesInTransaction(tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor, participantId: number, reactionId: number, choice: Awaited<ReturnType<typeof readAbilityResponseChoicesInTransaction>>[number]) {
  const ability = choice.definition;
  const costs = "abilityName" in ability ? ability.authoring?.costs ?? [] : ability.costs;
  for (const cost of costs) if (cost.costType === "mana" && participantId > 0) {
    if (!isCharacterMagicSystem(cost.resourceKey ?? "")) throw new Error("The response Mana cost requires an exact canonical pool.");
    await spendActiveManaInTransaction(tx, { characterId: participantId, system: cost.resourceKey as Parameters<typeof spendActiveManaInTransaction>[1]["system"], amount: cost.amount });
  }
  if (choice.kind === "derived-ability" && "id" in ability) {
    const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
    await tx.insert(characterDerivedAbilityUse).values({ characterId: participantId, derivedAbilityId: ability.id, ownershipId: choice.ownershipId,
      actorUserId: actor.userId, ...context, roundNumber: engine.runtime.roundNumber, eventKey: choice.eventKey,
      effectSummary: "Response outcome remains in the existing Intervention ruling workflow.", manualSteps: choice.explanation, useNotes: `Combat response ${reactionId}` });
  }
}
