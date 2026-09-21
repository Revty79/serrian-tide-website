import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { item } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiative as runtime,
  campaignSessionEncounterInitiativeParticipant as initiative, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterActionDeclaration as declaration } from "@/db/tabletop-operations-schema";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { combatObject as object, combatConditionState } from "@/features/tabletop-operations/combat-condition-state";
import { parseLockedActionDeclarationSnapshot } from "@/features/tabletop-operations/action-declaration";
import { ABILITY_EVENT_FACTS, ABILITY_FACT_DEFINITIONS, type AbilityFact } from "./facts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function readAbilityFactsInTransaction(tx: Tx, input: { participantId: number; campaignId: number; encounterId?: number | null;
  requestedKeys?: readonly string[]; opportunityId?: number | null; manualEvent?: { key: string; reason: string; authorizedGod: true } | null }) {
  const facts = new Map<string, AbilityFact>();
  const put = (key: string, category: AbilityFact["category"], value: boolean | number | string, source: string) => {
    const label = ABILITY_FACT_DEFINITIONS.find((entry) => entry.key === key)?.label ?? key;
    facts.set(key, { key, label, category, source, explanation: `Read from ${source}.`,
      ...(typeof value === "boolean" ? { type: "boolean", value } as const : typeof value === "number" ? { type: "number", value } as const : { type: "text", value } as const) });
  };
  const [occurrence] = input.encounterId ? await tx.select().from(member).where(and(eq(member.encounterId, input.encounterId),
    eq(member.campaignId, input.campaignId), eq(member.characterId, input.participantId))).limit(1) : [];
  if (input.encounterId && !occurrence) throw new Error("Use Condition subject is outside the exact Encounter.");
  const keys = input.requestedKeys ?? [];
  const requestedItems = keys.flatMap((key) => /^equipment\.item:(.+):(owned|worn|wielded|equipped)$/.exec(key)?.[1] ?? []);
  const catalog = requestedItems.length ? await tx.select({ id: item.id, canonicalId: item.canonicalId }).from(item).where(inArray(item.canonicalId, requestedItems)) : [];
  const conditionNames: string[] = [];
  let maximum: number | null = null, current: number | null = null;
  if (input.participantId < 0) {
    if (!occurrence || occurrence.participantKind !== "creature") throw new Error("Direct Creature facts require the exact occurrence.");
    put("equipment.armor-worn", "equipment", false, "Direct Creature occurrence has no Character equipment");
    put("equipment.weapon-wielded", "equipment", false, "Direct Creature occurrence has no Character equipment");
    for (const row of catalog) for (const state of ["owned", "worn", "wielded", "equipped"]) {
      put(`equipment.item:${row.canonicalId}:${state}`, "equipment", false, "Direct Creature occurrence has no Character inventory or equipment");
    }
    const local = object(occurrence.localStateJson), health = object(local.health), core = object(object(occurrence.creatureSnapshotJson).core);
    maximum = typeof core.totalHp === "number" ? core.totalHp : typeof core.totalHp === "string" && /^\d+(\.\d+)?$/.test(core.totalHp) ? Number(core.totalHp) : null;
    const damage = typeof health.totalDamage === "number" ? health.totalDamage : 0;
    current = maximum === null ? null : maximum - damage;
    for (const condition of Array.isArray(local.conditions) ? local.conditions.map(object) : []) {
      if (!condition.resolvedAt && !condition.expiredAt && typeof condition.name === "string") conditionNames.push(condition.name);
    }
  } else {
    const [character] = await tx.select().from(campaignCharacter).where(and(eq(campaignCharacter.id, input.participantId), eq(campaignCharacter.campaignId, input.campaignId))).limit(1);
    if (!character) throw new Error("Use Condition subject is outside the Campaign.");
    const equipment = await readCharacterEquipmentStateInTransaction(tx, input.participantId);
    put("equipment.armor-worn", "equipment", equipment.wornArmor.length > 0, "Current Worn armor profiles");
    put("equipment.weapon-wielded", "equipment", equipment.wieldedWeapons.length > 0, "Current Wielded weapon profiles");
    const ownedItems = catalog.length ? await tx.select({ itemId: campaignCharacterItem.itemId, quantity: campaignCharacterItem.quantity }).from(campaignCharacterItem)
      .where(and(eq(campaignCharacterItem.characterId, input.participantId), inArray(campaignCharacterItem.itemId, catalog.map(({ id }) => id)))) : [];
    const ownedCopies = catalog.length ? await tx.select({ itemId: campaignCharacterItemInstance.itemId }).from(campaignCharacterItemInstance)
      .where(and(eq(campaignCharacterItemInstance.characterId, input.participantId), isNull(campaignCharacterItemInstance.retiredAt), inArray(campaignCharacterItemInstance.itemId, catalog.map(({ id }) => id)))) : [];
    for (const row of catalog) for (const state of ["owned", "worn", "wielded", "equipped"] as const) {
      const stack = equipment.stacks.find(({ itemId }) => itemId === row.id);
      const possessed = state === "owned" && (ownedItems.some(({ itemId, quantity }) => itemId === row.id && quantity > 0) || ownedCopies.some(({ itemId }) => itemId === row.id))
        || equipment.instances.some((entry) => entry.itemId === row.id && (state === "owned" || (state === "equipped" ? entry.state !== "inactive" : entry.state === state)))
        || Boolean(stack && (state === "owned" ? stack.ownedQuantity > 0 : state === "worn" ? stack.wornQuantity > 0 : state === "wielded" ? stack.wieldedQuantity > 0 : stack.equippedQuantity + stack.wornQuantity + stack.wieldedQuantity > 0));
      put(`equipment.item:${row.canonicalId}:${state}`, "equipment", possessed, `Exact owned Item ${row.canonicalId} equipment state`);
    }
    if (keys.some((key) => ["state.current-hp", "state.maximum-hp", "state.hp-percent"].includes(key))) {
      try {
        const health = await readActiveHealthInTransaction(tx, input.participantId, character.npcKind);
        maximum = health.anatomy.totalMaximumHp; current = maximum === null ? null : maximum - health.state.totalDamage;
      } catch (error) {
        if (!(error instanceof Error) || !/health anatomy is incomplete/.test(error.message)) throw error;
        // An incomplete authored anatomy leaves HP facts unknown; it does not
        // prevent evaluating unrelated equipment/event/state conditions.
      }
    }
    for (const condition of (await readActiveEffectsInTransaction(tx, input.participantId)).conditions) if (!condition.resolvedAt) conditionNames.push(condition.name);
  }
  if (maximum !== null && Number.isFinite(maximum)) put("state.maximum-hp", "state", maximum, "Active Health anatomy");
  if (current !== null && Number.isFinite(current)) put("state.current-hp", "state", current, "Active Health accumulated damage");
  if (maximum !== null && maximum > 0 && current !== null) put("state.hp-percent", "state", current / maximum * 100, "Active Health current / maximum");
  for (const key of keys.filter((key) => key.startsWith("state.condition:") && key.length > "state.condition:".length)) {
    put(key, "state", conditionNames.includes(key.slice("state.condition:".length)), "Exact active condition name");
  }
  if (occurrence) {
    const condition = combatConditionState(occurrence.localStateJson);
    // A retained undifferentiated defeat does not prove death or incapacity.
    if (condition.status !== "defeated") {
      put("state.dead", "state", condition.status === "dead", "Occurrence combat condition");
      put("state.incapacitated", "state", condition.status === "incapacitated", "Occurrence combat condition");
    }
    const [step] = await tx.select().from(runtime).where(eq(runtime.encounterId, occurrence.encounterId)).limit(1);
    const [actor] = await tx.select().from(initiative).where(and(eq(initiative.encounterId, occurrence.encounterId), eq(initiative.characterId, input.participantId))).limit(1);
    if (step) put("state.round", "state", step.roundNumber, "Encounter Initiative runtime");
    if (actor) {
      put("state.initiative", "state", actor.currentInitiative, "Encounter Initiative participant");
      if (actor.movementMode) put("state.movement-mode", "state", actor.movementMode, "Stored Encounter movement mode");
    }
    if (input.opportunityId != null) {
      const [window] = await tx.select({ opportunity: opportunity, declaration: declaration }).from(opportunity).innerJoin(declaration, eq(declaration.id, opportunity.declarationId))
        .where(and(eq(opportunity.id, input.opportunityId), eq(opportunity.encounterId, occurrence.encounterId), eq(opportunity.responderCharacterId, input.participantId), eq(opportunity.status, "pending"))).limit(1);
      if (!window || !["committed", "rolling-ready", "rolling", "awaiting-god-ruling"].includes(window.declaration.status)) throw new Error("The exact Ability response window is no longer open.");
      const locked = parseLockedActionDeclarationSnapshot(window.declaration.lockedSnapshotJson);
      const attack = ["weapon", "creature-attack"].includes(locked.source.kind);
      for (const definition of ABILITY_EVENT_FACTS) put(definition.key, "event", definition.key === "combat.action-declared" || attack && (definition.key !== "combat.attack-targeted" || locked.targetCharacterIds.includes(input.participantId)), `Responder Opportunity ${window.opportunity.id}, Declaration ${window.declaration.id}`);
    }
  }
  if (input.manualEvent) {
    if (!input.manualEvent.reason.trim() || !input.manualEvent.key.trim()) throw new Error("A manual event requires an authorized G.O.D. reason and exact key.");
    put(input.manualEvent.key.trim(), "event", true, `Explicit G.O.D. manual event: ${input.manualEvent.reason.trim()}`);
  }
  return facts;
}
