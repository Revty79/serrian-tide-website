import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { item, weaponProfile } from "@/db/item-schema";
import { magazineProfile, magazineAmmunition, weaponMagazine } from "@/db/magazine-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
export type MagazineProfileDraft = { capacityRounds: number; fillInitiativeCostPerRound?: number | null; ammunition: { id: number; name: string }[] };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function saveMagazineCatalogInTransaction(tx: Tx, itemId: number, profile: MagazineProfileDraft | null,
  magazines: { id: number; name: string }[] = []) {
  await tx.select({ id: item.id }).from(item).where(eq(item.id, itemId)).for("update");
  const [old] = await tx.select().from(magazineProfile).where(eq(magazineProfile.itemId, itemId));
  if (!profile && old) {
    const owned = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.itemId, itemId)).limit(1);
    if (owned.length) throw new Error("This magazine model has individual copies. Keep its profile until those copies are removed.");
    await tx.delete(magazineProfile).where(eq(magazineProfile.itemId, itemId));
  }
  if (profile) {
    if (!Number.isSafeInteger(profile.capacityRounds) || profile.capacityRounds <= 0 || profile.capacityRounds > 2147483647) throw new Error("Magazine Capacity (Rounds) must be a positive whole number.");
    const fillInitiativeCostPerRound = profile.fillInitiativeCostPerRound ?? null;
    if (fillInitiativeCostPerRound !== null && (!Number.isSafeInteger(fillInitiativeCostPerRound) || fillInitiativeCostPerRound < 0 || fillInitiativeCostPerRound > 2147483647)) throw new Error("Magazine Fill Initiative per Round must be a nonnegative whole number, or blank until authored.");
    const ids = [...new Set(profile.ammunition.map((entry) => entry.id))];
    if (!ids.length || ids.includes(itemId) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Select at least one exact compatible ammunition item.");
    const ammo = await tx.select({ id: item.id }).from(item).leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(and(inArray(item.id, ids), isNull(item.archivedAt), sql`(lower(trim(${item.recordType})) = 'ammunition' or lower(trim(${weaponProfile.profileRecordType})) = 'ammunition')`));
    if (ammo.length !== ids.length) throw new Error("Compatible ammunition must use existing, active ammunition definitions.");
    if (!old) {
      const stacks = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.itemId, itemId)).limit(1);
      const instances = await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.itemId, itemId)).limit(1);
      if (stacks.length || instances.length) throw new Error("Create a new magazine model; existing ownership cannot be converted automatically.");
    }
    const loaded = await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.itemId, itemId));
    if (loaded.some((entry) => entry.loadedRounds > profile.capacityRounds || entry.loadedRounds > 0 && !ids.includes(entry.loadedAmmunitionItemId!))) throw new Error("Empty the affected magazine copies before reducing capacity or removing their ammunition compatibility.");
    await tx.insert(magazineProfile).values({ itemId, capacityRounds: profile.capacityRounds, fillInitiativeCostPerRound }).onConflictDoUpdate({ target: magazineProfile.itemId, set: { capacityRounds: profile.capacityRounds, fillInitiativeCostPerRound } });
    const previous = await tx.select().from(magazineAmmunition).where(eq(magazineAmmunition.magazineItemId, itemId));
    for (const row of previous) if (!ids.includes(row.ammunitionItemId)) await tx.delete(magazineAmmunition).where(and(eq(magazineAmmunition.magazineItemId, itemId), eq(magazineAmmunition.ammunitionItemId, row.ammunitionItemId)));
    for (const ammunitionItemId of ids) await tx.insert(magazineAmmunition).values({ magazineItemId: itemId, ammunitionItemId }).onConflictDoNothing();
  }
  const [weapon] = await tx.select().from(weaponProfile).where(eq(weaponProfile.itemId, itemId));
  if (weapon) {
    const ids = [...new Set(magazines.map((entry) => entry.id))];
    if (ids.length) {
      const valid = await tx.select({ id: item.id }).from(magazineProfile).innerJoin(item, eq(item.id, magazineProfile.itemId)).where(and(inArray(item.id, ids), isNull(item.archivedAt)));
      if (valid.length !== ids.length) throw new Error("Choose existing, active magazine models for weapon compatibility.");
    }
    const previous = await tx.select().from(weaponMagazine).where(eq(weaponMagazine.weaponProfileId, weapon.id));
    for (const link of previous) if (!ids.includes(link.magazineItemId)) await tx.delete(weaponMagazine).where(and(eq(weaponMagazine.weaponProfileId, weapon.id), eq(weaponMagazine.magazineItemId, link.magazineItemId)));
    for (const magazineItemId of ids) await tx.insert(weaponMagazine).values({ weaponProfileId: weapon.id, magazineItemId }).onConflictDoNothing();
  } else if (magazines.length) throw new Error("Magazine compatibility requires a weapon profile.");
}
