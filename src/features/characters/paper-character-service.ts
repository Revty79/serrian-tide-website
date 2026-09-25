import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { itemEffect, itemPower, itemPowerEffect, itemPowerConstruction, itemPowerSource, weaponProfile, weaponFiringMode } from "@/db/item-schema";
import { skillExtension } from "@/db/skill-schema";
import { campaignCharacterWeaponOverride } from "@/db/realm-schema";
import { race } from "@/db/race-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readMagazineInventoryInTransaction } from "@/features/items/magazine-inventory-service";
import { readCharacterFirearmSetup } from "@/features/items/firearm-setup-service";
import { ORDINARY_TRIGGER_PULL_INITIATIVE_COST, resolveFirearmFiringMode } from "@/features/items/firearm-timing";
import { resolveItemPowerConstruction } from "@/features/items/item-powers";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { readWeaponSkillGovernanceInTransaction } from "@/features/items/weapon-skill-governance-service";
import { resolveCharacterWeaponGovernance, type PersistentCharacterWeaponOverride } from "@/features/items/character-weapon-governance";
import { readProtectionLayersInTransaction } from "@/features/protection/protection-service";
import { decodeMechanicalEffect } from "@/features/mechanical-effects";
import { normalizeInteractionRuleProfile, type InteractionCondition } from "@/features/interaction-rules/interaction-rules";
import { getCharacterWeaponDamage, getCharacterWeaponDamageAttributeKeys } from "./character-sheet-rules";
import { characterAggregateToDraft, getAttributeModifier } from "./character-rules";
import type { CharacterAggregate } from "./models";
import { paperEffect, paperNumber, paperSigned, type PaperRuntime } from "./paper-character";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
function interactionCondition(condition: InteractionCondition): string {
  switch (condition.kind) {
    case "damage-type": return `damage type ${condition.damageType}`;
    case "magical": return condition.magical ? "magical" : "nonmagical";
    case "source-kind": return `${condition.sourceKind}${condition.weaponFamily ? ` / ${condition.weaponFamily}` : ""}`;
    case "item-property": return `${condition.propertyName}${condition.value ? ` = ${condition.value}` : ""}${condition.relatedCreatureCanonicalId ? ` (${condition.relatedCreatureCanonicalId})` : ""}`;
    case "item-tag": return `item tag ${condition.tagCanonicalId}`;
    case "mechanical-effect-kind": return condition.effectKind;
    case "condition-name": return condition.conditionName;
  }
}

/** Trusted read: caller must first authorize this aggregate with getCharacter. No mutations. */
export async function readPaperCharacterRuntime(tx: Transaction, aggregate: CharacterAggregate, userId: string): Promise<PaperRuntime> {
  const characterId = aggregate.character.id;
  const [health, mana, equipment, effects, protection, magazines, firearms] = await Promise.all([
    readActiveHealthInTransaction(tx, characterId, aggregate.character.npcKind), readActiveManaInTransaction(tx, characterId),
    readCharacterEquipmentStateInTransaction(tx, characterId), readActiveEffectsInTransaction(tx, characterId),
    readProtectionLayersInTransaction(tx, { kind: "character", characterId }),
    readMagazineInventoryInTransaction(tx, characterId, userId), readCharacterFirearmSetup(tx, characterId, userId),
  ]);
  const itemIds = [...new Set([...aggregate.items, ...aggregate.itemInstances].map(({ itemId }) => itemId))];
  const result: PaperRuntime = { health: health.view, mana, equipment, effects, protection, weapons: {}, ammunition: {}, itemRules: {}, interactions: [], gaps: [] };
  if (aggregate.profile.raceId != null) {
    const [row] = await tx.select({ interactions: race.interactionRules }).from(race).where(eq(race.id, aggregate.profile.raceId));
    const profile = normalizeInteractionRuleProfile(row?.interactions, "race");
    result.interactions = (profile?.rules ?? []).map((rule) => `${rule.name}: ${rule.ruleType}${rule.percentage == null ? "" : ` ${rule.percentage}%`}; applies to ${rule.scope}; ${rule.match} of: ${rule.conditions.map(interactionCondition).join(", ")}. ${rule.notes}`);
  }
  for (const magazine of magazines.magazines) result.ammunition[magazine.instanceId] = [
    `${magazine.loadedRounds}/${magazine.capacity} rounds${magazine.ammunitionItemId ? ` (${magazine.ammunition.find(({ id }) => id === magazine.ammunitionItemId)?.name ?? `ammunition #${magazine.ammunitionItemId}`})` : ""}`,
    ...(magazine.attachedWeaponInstanceId ? [`Attached to firearm copy #${magazine.attachedWeaponInstanceId}`] : []),
  ];
  for (const firearm of firearms.firearms) result.ammunition[firearm.instanceId] = firearm.state ? [
    `${firearm.state.loadedRounds} loaded rounds`, firearm.state.needsRecovery ? "Recovery required" : "No recovery recorded",
    ...(firearm.attachedMagazineInstanceId ? [`Magazine copy #${firearm.attachedMagazineInstanceId}`] : []),
    ...(firearm.state.selectedFiringModeId ? [`Mode: ${firearm.modes.find(({ id }) => id === firearm.state?.selectedFiringModeId)?.name ?? firearm.state.selectedFiringModeId}`] : []),
  ] : ["Ammunition state not initialized"];
  if (!itemIds.length) return result;
  const [legacyEffects, powers, profiles, overrides] = await Promise.all([
    tx.select().from(itemEffect).where(inArray(itemEffect.itemId, itemIds)).orderBy(asc(itemEffect.sortOrder), asc(itemEffect.id)),
    tx.select().from(itemPower).where(inArray(itemPower.itemId, itemIds)).orderBy(asc(itemPower.sortOrder), asc(itemPower.id)),
    tx.select().from(weaponProfile).where(inArray(weaponProfile.itemId, itemIds)),
    tx.select().from(campaignCharacterWeaponOverride).where(eq(campaignCharacterWeaponOverride.characterId, characterId)).orderBy(asc(campaignCharacterWeaponOverride.id)),
  ]);
  for (const entry of legacyEffects) (result.itemRules[entry.itemId] ??= []).push(paperEffect(decodeMechanicalEffect(entry)));
  for (const power of powers) {
    const authoredEffects = await tx.select().from(itemPowerEffect).where(eq(itemPowerEffect.itemPowerId, power.id)).orderBy(asc(itemPowerEffect.sortOrder), asc(itemPowerEffect.id));
    (result.itemRules[power.itemId] ??= []).push(`${power.name}: ${power.description} Trigger: ${power.trigger}${power.requiredEquipmentState ? ` while ${power.requiredEquipmentState}` : ""}. Initiative: ${paperNumber(power.initiativeCost)}. Cost: ${power.resourceCostKind}${power.resourceCostAmount == null ? "" : ` ${power.resourceCostAmount}`}. Resolution: ${power.resolutionMode}${power.fixedRollTarget == null ? "" : ` ${power.fixedRollTarget}%+`}${power.fixedPowerLevel ? `; level ${power.fixedPowerLevel}` : ""}.`, ...authoredEffects.map((entry) => paperEffect(decodeMechanicalEffect(entry))));
    const [magic] = await tx.select({custom: itemPowerConstruction.documentJson, source: skillExtension.dataJson, sourceSkillId: itemPowerSource.sourceSkillId}).from(itemPower)
      .leftJoin(itemPowerConstruction, eq(itemPowerConstruction.itemPowerId, itemPower.id))
      .leftJoin(itemPowerSource, eq(itemPowerSource.itemPowerId, itemPower.id))
      .leftJoin(skillExtension, and(eq(skillExtension.skillId, itemPowerSource.sourceSkillId), eq(skillExtension.extensionType, "spell-construction")))
      .where(eq(itemPower.id, power.id));
    const json = magic?.custom ?? magic?.source;
    if (json) {
      try {
        const resolved = resolveItemPowerConstruction(parseSpellDocument(json), power.fixedPowerLevel);
        result.itemRules[power.itemId].push(resolved.spell.description, resolved.spell.notes,
          ...resolved.calculation.breakdown.filter((line) => line.category !== "container").map((line) => `${line.label}: ${[line.detail, line.componentDescription].filter(Boolean).join(". ")}`));
      } catch { result.gaps.push(`${power.name}: its saved magic construction could not be read.`); }
    } else if (magic?.sourceSkillId) result.gaps.push(`${power.name}: its linked magic construction is unavailable.`);
  }
  const draft = characterAggregateToDraft(aggregate);
  for (const profile of profiles) {
    const item = aggregate.authorizedItems.find(({ id }) => id === profile.itemId);
    if (!item || !(item.equipmentGroup === "weapon" || item.weaponType)) continue;
    const governance = await readWeaponSkillGovernanceInTransaction(tx, item.id);
    const [ammunition] = profile.ammunitionItemId == null ? [] : await tx.select().from(weaponProfile).where(eq(weaponProfile.itemId, profile.ammunitionItemId));
    const modes = await tx.select().from(weaponFiringMode).where(eq(weaponFiringMode.weaponProfileId, profile.id)).orderBy(asc(weaponFiringMode.sortOrder));
    result.weapons[item.id] = [];
    for (const mode of modes.length ? modes : [null]) {
      const matching = overrides.filter((entry) => entry.itemId === item.id && entry.weaponProfileId === profile.id);
      const stored = matching.find((entry) => entry.firingModeId === (mode?.id ?? null)) ?? matching.find((entry) => entry.firingModeId === null);
      const persistentOverride: PersistentCharacterWeaponOverride | null = stored ? { ...stored,
        selection: stored.skillAllocationId !== null ? { kind: "skill", allocationId: stored.skillAllocationId } : { kind: "attribute", attributeKey: stored.attributeKey as "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHR" },
        createdAt: stored.createdAt.toISOString(), updatedAt: stored.updatedAt.toISOString() } : null;
      const resolved = governance ? resolveCharacterWeaponGovernance({ context: { campaignId: aggregate.campaign.id, characterId, isNpc: aggregate.character.isNpc, npcKind: aggregate.character.npcKind,
        itemId: item.id, weaponCanonicalId: item.canonicalId, weaponName: item.name, weaponProfileId: profile.id, firingModeId: mode?.id ?? null },
        governance, attributes: draft.attributes, allocations: aggregate.skillAllocations, skillCatalog: aggregate.skillCatalog, skillRelationships: aggregate.skillRelationships,
        race: aggregate.selectedRace, persistentOverride }) : null;
      const source = resolved && "source" in resolved ? resolved.source : null;
      const damage = getCharacterWeaponDamage(item);
      const modifier = getCharacterWeaponDamageAttributeKeys(item).map((key) => `${key} ${paperSigned(getAttributeModifier(draft.attributes[key]))}`).join(" / ");
      const timing = mode ? resolveFirearmFiringMode({ ...mode, deliveryCadence: mode.deliveryCadence as "per-trigger" | "sustained-per-initiative" | null },
        ammunition?.ammunitionCyclingInitiativeModifier ?? 0,
        ammunition?.ammunitionRecoilResetInitiativeModifier ?? 0).timing : null;
      result.weapons[item.id].push({ mode: mode?.name ?? "", target: source?.originalTarget ?? null,
        governing: source ? source.kind === "skill" ? source.allocationPath.map(({ skillName }) => skillName).join(" → ") : source.kind === "attribute" ? source.attributeKey : source.label : "G.O.D. ruling required",
        damage: `${damage.damage ?? "Not recorded"}${damage.damageType ? ` ${damage.damageType}` : ""}; ${modifier} conditional modifier${damage.sourceName ? `; ammunition: ${damage.sourceName}` : ""}`,
        initiative: paperNumber(mode ? ORDINARY_TRIGGER_PULL_INITIATIVE_COST : profile.initiativeCost), range: [profile.reachText ? `Reach ${profile.reachText}` : "", profile.rangeText ? `Range ${profile.rangeText}` : ""].filter(Boolean).join("; ") || "Range/reach not recorded",
        timing: mode ? [timing ? `${mode.name}: cycle ${timing.effectiveCyclingInitiativeCost}; recoil reset ${timing.effectiveRecoilResetInitiativeCost}; follow-up preparation ${timing.followUpPreparationInitiativeCost}; through next trigger ${timing.totalThroughNextTriggerPullInitiativeCost} Initiative.` : `${mode.name}: timing not fully authored.`,
          `Delivery: ${mode.deliveryCadence ?? "not recorded"}; rounds per cadence: ${paperNumber(mode.roundsPerCadence)}.${mode.mechanicsReviewRequired ? " Mechanics review required." : ""}`] : [],
      });
    }
  }
  return result;
}
