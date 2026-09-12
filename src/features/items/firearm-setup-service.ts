import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { item, weaponProfile, weaponFiringMode } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterItemInstance as copy, campaignCharacterItem as loose } from "@/db/realm-schema";
import { campaignCharacterFirearmState as stateTable, campaignCharacterFirearmEvent } from "@/db/tabletop-operations-schema";
import { firearmMagazineAttachment } from "@/db/magazine-schema";
import { readMagazineInventoryInTransaction, assertOutsideCombatEquipmentHandling } from "./magazine-inventory-service";
import { readCompatibleMagazineCopies, readEffectiveFirearmState, swapFirearmMagazine } from "./firearm-magazine-service";
import { lockEquipmentStateCharacterInTransaction } from "./equipment-state-service";
import { FIREARM_WEAPON_TYPES } from "./firearm-classification";
import { initializeFirearmStateInTransaction } from "@/features/tabletop-operations/firearm-readiness-service";
import { planFirearmAmmunitionTransition } from "@/features/tabletop-operations/firearm-readiness";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readCharacterFirearmSetup(tx: Tx, characterId: number, userId: string) {
  const access = await readMagazineInventoryInTransaction(tx, characterId, userId);
  const owned = await tx.select({ instanceId: copy.id, itemId: copy.itemId, name: item.name, equipmentState: copy.equipmentState, profile: weaponProfile })
    .from(copy).innerJoin(item, eq(item.id, copy.itemId)).innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(and(eq(copy.characterId, characterId), isNull(copy.retiredAt), inArray(sql`lower(trim(${weaponProfile.weaponType}))`, FIREARM_WEAPON_TYPES)));
  const firearms = [];
  for (const row of owned) {
    const [stored] = await tx.select().from(stateTable).where(eq(stateTable.itemInstanceId, row.instanceId));
    const state = stored ? await readEffectiveFirearmState(tx, stored) : null;
    const modes = await tx.select({ id: weaponFiringMode.id, name: weaponFiringMode.name }).from(weaponFiringMode).where(eq(weaponFiringMode.weaponProfileId, row.profile.id));
    const magazines = row.profile.reloadType === "Magazine" ? await readCompatibleMagazineCopies(tx, characterId, row.profile.id) : [];
    firearms.push({ instanceId: row.instanceId, itemId: row.itemId, name: row.name, equipmentState: row.equipmentState, modes, magazines,
      readinessMode: row.profile.readinessMode, reloadType: row.profile.reloadType, state: state ? { version: state.version, loadedRounds: state.loadedRounds, readied: state.readied, needsRecovery: state.requiresCycling || state.requiresRecoilRecovery, selectedFiringModeId: state.selectedFiringModeId } : null,
      attachedMagazineInstanceId: magazines.find((entry) => entry.attachedWeaponInstanceId === row.instanceId)?.instanceId ?? null });
  }
  return { canManage: access.canManage, combatActive: access.combatActive, firearms };
}
export type CharacterFirearmSetup = Awaited<ReturnType<typeof readCharacterFirearmSetup>>;

export async function prepareCharacterFirearm(tx: Tx, userId: string, command: { characterId: number; instanceId: number; operation: "initialize" | "ready" | "magazine" | "load" | "unload";
  firingModeId?: number; magazineInstanceId?: number | null; rounds?: number; expectedVersion?: number; requestKey: string }) {
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const view = await readCharacterFirearmSetup(tx, command.characterId, userId);
  if (!view.canManage) throw new Error("Only the Character's authorized controller can prepare this firearm.");
  await assertOutsideCombatEquipmentHandling(tx, command.characterId);
  if (view.combatActive) throw new Error("This Character is in active combat. Use the combat preparation controls and their Initiative costs.");
  const selected = view.firearms.find((entry) => entry.instanceId === command.instanceId);
  if (!selected) throw new Error("Choose an exact owned firearm copy.");
  if (command.operation === "initialize") {
    const [character] = await tx.select({ campaignId: campaignCharacter.campaignId }).from(campaignCharacter).where(eq(campaignCharacter.id, command.characterId));
    await initializeFirearmStateInTransaction(tx, { campaignId: character.campaignId, encounterId: null }, userId, { characterId: command.characterId,
      itemId: selected.itemId, itemInstanceId: selected.instanceId, selectedFiringModeId: command.firingModeId ?? 0, idempotencyKey: command.requestKey,
      reason: "The owner confirmed an empty, not-readied firearm during equipment setup." });
    return;
  }
  const [state] = await tx.select().from(stateTable).where(eq(stateTable.itemInstanceId, selected.instanceId)).for("update");
  if (!state) throw new Error("Initialize this copy as empty before preparing it.");
  if (state.version !== command.expectedVersion) throw new Error("This firearm changed. Refresh its setup before continuing.");
  if (command.operation === "load" || command.operation === "unload") {
    const [attached] = await tx.select().from(firearmMagazineAttachment).where(eq(firearmMagazineAttachment.weaponInstanceId, state.itemInstanceId));
    if (attached) throw new Error("Remove the magazine to retain its contents. Loose ammunition handling does not empty an attached magazine.");
    if (command.operation === "load" && selected.reloadType !== "Single") throw new Error("Single loading requires Reload Type Single. For a Magazine weapon, choose a prepared magazine copy.");
    const [profile] = await tx.select().from(weaponProfile).where(eq(weaponProfile.id, state.weaponProfileId));
    const ammunitionItemId = command.operation === "unload" ? state.loadedAmmunitionItemId : profile.ammunitionItemId;
    if (!ammunitionItemId) throw new Error("Set the weapon's exact Ammunition Item before loading, or choose a firearm with rounds to unload.");
    const [ammo] = await tx.select({ id: weaponProfile.id }).from(weaponProfile).where(and(eq(weaponProfile.itemId, ammunitionItemId), sql`lower(trim(${weaponProfile.profileRecordType})) = 'ammunition'`));
    if (!ammo) throw new Error("This ammunition needs its supported Ammunition Profile in Heavens → Items.");
    const [stock] = await tx.select().from(loose).where(and(eq(loose.characterId, command.characterId), eq(loose.itemId, ammunitionItemId))).for("update");
    const transition = planFirearmAmmunitionTransition({ operation: command.operation === "unload" ? "unload" : state.loadedRounds ? "reload" : "load",
      loadedRounds: state.loadedRounds, inventoryRounds: stock?.quantity ?? 0, capacityRounds: profile.capacityRounds ?? state.capacityRounds, requestedRounds: command.rounds,
      disposition: command.operation === "unload" ? "retain" : "none", loadedAmmunitionItemId: state.loadedAmmunitionItemId,
      requestedAmmunitionItemId: command.operation === "unload" ? null : ammunitionItemId, canonicalAmmunitionItemId: profile.ammunitionItemId });
    const unitCost = command.operation === "unload" ? ((stock?.quantity ?? 0) * (stock?.unitCostCredits ?? 0) + state.loadedRounds * (state.loadedAmmunitionUnitCostCredits ?? 0)) / transition.inventoryRounds : stock!.unitCostCredits;
    if (!transition.inventoryRounds) await tx.delete(loose).where(and(eq(loose.characterId, command.characterId), eq(loose.itemId, ammunitionItemId)));
    else await tx.insert(loose).values({ characterId: command.characterId, itemId: ammunitionItemId, quantity: transition.inventoryRounds, unitCostCredits: unitCost })
      .onConflictDoUpdate({ target: [loose.characterId, loose.itemId], set: { quantity: transition.inventoryRounds, unitCostCredits: unitCost } });
    await tx.update(stateTable).set({ capacityRounds: profile.capacityRounds ?? state.capacityRounds, capacitySource: profile.capacityRounds === null ? state.capacitySource : "canonical",
      loadedRounds: transition.loadedRounds, loadedAmmunitionItemId: transition.loadedRounds ? ammunitionItemId : null,
      loadedAmmunitionProfileId: transition.loadedRounds ? ammo.id : null, loadedAmmunitionUnitCostCredits: transition.loadedRounds
        ? (state.loadedRounds * (state.loadedAmmunitionUnitCostCredits ?? 0) + command.rounds! * unitCost) / transition.loadedRounds : null,
      version: state.version + 1, updatedByUserId: userId, updatedAt: new Date() }).where(eq(stateTable.itemInstanceId, state.itemInstanceId));
  } else if (command.operation === "ready") {
    if (selected.equipmentState !== "wielded") throw new Error("Set this copy's Equipment State to Wielded before readying it.");
    const readinessMode = selected.readinessMode ?? state.readinessMode;
    if (readinessMode !== "draw-is-ready" && readinessMode !== "separate-ready-action") throw new Error("Set the weapon's drawing/readying relationship in Heavens → Items before readying it.");
    await tx.update(stateTable).set({ readinessMode, readinessModeSource: selected.readinessMode === null ? state.readinessModeSource : "canonical", readied: true, requiresCycling: false, requiresRecoilRecovery: false, version: state.version + 1, updatedByUserId: userId, updatedAt: new Date() }).where(eq(stateTable.itemInstanceId, state.itemInstanceId));
  } else if (command.operation === "magazine") {
    const [attached] = await tx.select().from(firearmMagazineAttachment).where(eq(firearmMagazineAttachment.weaponInstanceId, state.itemInstanceId));
    const replacement = command.magazineInstanceId ?? null;
    if ((attached?.magazineInstanceId ?? null) === replacement) return;
    await swapFirearmMagazine(tx, state, replacement);
    await tx.update(stateTable).set({ version: state.version + 1, updatedByUserId: userId, updatedAt: new Date() }).where(eq(stateTable.itemInstanceId, state.itemInstanceId));
  } else throw new Error("Choose an available equipment preparation.");
  const [after] = await tx.select().from(stateTable).where(eq(stateTable.itemInstanceId, state.itemInstanceId));
  await tx.insert(campaignCharacterFirearmEvent).values({ itemInstanceId: state.itemInstanceId, campaignId: state.campaignId, characterId: command.characterId,
    eventKind: `outside-combat-${command.operation}`, beforeStateJson: state, afterStateJson: after, metadataJson: { magazineInstanceId: command.magazineInstanceId ?? null }, actorUserId: userId,
    reason: "Owner prepared this exact firearm outside active combat." });
}
