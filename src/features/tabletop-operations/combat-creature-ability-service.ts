import "server-only";
import { readAbilityFactsInTransaction } from "@/features/ability-use-conditions/fact-service";
import { evaluateAbilityUseCondition } from "@/features/ability-use-conditions/facts";
import { normalizeCreatureAbilityDefinition } from "@/features/creatures/creature-ability";
import type { LockedActionDeclarationSnapshot } from "./action-declaration";
import type { ActionDeclarationActor } from "./action-declaration-service";
import type { OwnedEncounterRuntimeContext, RuntimeIntegrationTransaction } from "./runtime-integration-service";

export async function assertCombatCreatureAbilityUseInTransaction(tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor, snapshot: LockedActionDeclarationSnapshot) {
  if (snapshot.source.kind !== "creature-ability") return;
  const source = snapshot.authoredSource!;
  const ability = normalizeCreatureAbilityDefinition(source.authoredData);
  const authoring = ability.authoring;
  if (authoring?.activationType === "passive") throw new Error("A Passive Creature Ability cannot be selected as an activated action. Its automatic lifecycle is not supported yet.");
  const ruling = source.authoredData.combatResolutionRuling as { useRequirementsReason?: string } | undefined;
  const reason = ruling?.useRequirementsReason?.trim();
  const eventKey = typeof snapshot.source.payload?.eventKey === "string" ? snapshot.source.payload.eventKey.trim() : null;
  if (eventKey && !(actor.authority === "god-owner" && actor.userId === context.ownerUserId && reason)) throw new Error("A client event key cannot establish a Creature Ability event.");
  const facts = await readAbilityFactsInTransaction(tx, { ...context, participantId: snapshot.actorCharacterId,
    requestedKeys: authoring?.useConditions.flatMap(({ conditionKey }) => conditionKey ?? []) ?? [],
    manualEvent: eventKey && reason ? { key: eventKey, reason, authorizedGod: true } : null });
  const results = authoring?.useConditions.map((condition) => ({ condition, result: evaluateAbilityUseCondition(condition, facts) })) ?? [];
  if (results.some(({ result }) => result === "unsatisfied")) throw new Error("The Creature Ability's Use Conditions are not satisfied.");
  if (results.some(({ result }) => result === "manual") && !reason) throw new Error("Unknown Creature Ability Use Conditions require an explicit G.O.D. use-requirements ruling.");
  if (["triggered", "reaction"].includes(authoring?.activationType ?? "") && !eventKey) throw new Error("This Creature Ability requires an authoritative response window or an explicit G.O.D. manual event ruling.");
  if (authoring?.useLimits.length && !reason) throw new Error("Creature Ability use limits have no persistent ledger yet; record an explicit G.O.D. use-requirements ruling.");
  if (authoring?.costs.some(({ costType }) => costType !== "mana" || snapshot.actorCharacterId < 0) && !reason) throw new Error("This Creature Ability resource cost requires an explicit G.O.D. resource ruling.");
}
