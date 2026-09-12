import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { firearmMagazineAttachment as attachment, magazineProfile, weaponMagazine, magazineInventoryOperation } from "@/db/magazine-schema";
import { campaignCharacterItemInstance as copy } from "@/db/realm-schema";
import { item, weaponProfile } from "@/db/item-schema";
import { campaignCharacterFirearmState as firearm } from "@/db/tabletop-operations-schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type State = typeof firearm.$inferSelect;

export async function readEffectiveFirearmState(tx: Tx, state: State, lock = false): Promise<State> {
  const [attached] = await tx.select().from(attachment).where(eq(attachment.weaponInstanceId, state.itemInstanceId));
  if (!attached) return state;
  const query = tx.select({ owned: copy, capacity: magazineProfile.capacityRounds, ammoProfileId: weaponProfile.id }).from(copy)
    .innerJoin(magazineProfile, eq(magazineProfile.itemId, copy.itemId))
    .leftJoin(weaponProfile, eq(weaponProfile.itemId, copy.loadedAmmunitionItemId))
    .where(and(eq(copy.id, attached.magazineInstanceId), eq(copy.characterId, state.characterId), isNull(copy.retiredAt)));
  const [loaded] = lock ? await query.for("update", { of: copy }) : await query;
  if (!loaded) throw new Error("The attached magazine copy is unavailable. Resolve its equipment state before firing.");
  if (state.loadedRounds !== 0) throw new Error("The firearm has both internal rounds and an attached magazine. Resolve its ammunition state before continuing.");
  return { ...state, capacityRounds: loaded.capacity, capacitySource: "magazine", loadedRounds: loaded.owned.loadedRounds,
    loadedAmmunitionItemId: loaded.owned.loadedAmmunitionItemId, loadedAmmunitionProfileId: loaded.ammoProfileId,
    loadedAmmunitionUnitCostCredits: loaded.owned.loadedRounds ? loaded.owned.loadedAmmunitionUnitCostCredits : null };
}

/** Attached rounds live only in the magazine copy; firearm state retains no duplicate load. */
export async function writeFirearmAmmunitionState(tx: Tx, before: State, after: State) {
  const [attached] = await tx.select().from(attachment).where(eq(attachment.weaponInstanceId, before.itemInstanceId));
  if (!attached) {
    await tx.update(firearm).set(after).where(eq(firearm.itemInstanceId, before.itemInstanceId));
    return;
  }
  const changed = await tx.update(copy).set({ loadedRounds: after.loadedRounds, loadedAmmunitionItemId: after.loadedAmmunitionItemId,
    loadedAmmunitionUnitCostCredits: after.loadedAmmunitionUnitCostCredits ?? 0, updatedAt: new Date() })
    .where(and(eq(copy.id, attached.magazineInstanceId), eq(copy.loadedRounds, before.loadedRounds))).returning({ id: copy.id });
  if (!changed.length) throw new Error("The attached magazine changed before ammunition could be consumed. Refresh the firearm.");
  const [stored] = await tx.select({ capacityRounds: firearm.capacityRounds, capacitySource: firearm.capacitySource }).from(firearm).where(eq(firearm.itemInstanceId, before.itemInstanceId));
  await tx.update(firearm).set({ ...after, ...stored, loadedRounds: 0, loadedAmmunitionItemId: null, loadedAmmunitionProfileId: null, loadedAmmunitionUnitCostCredits: null })
    .where(eq(firearm.itemInstanceId, before.itemInstanceId));
}

export async function readCompatibleMagazineCopies(tx: Tx, characterId: number, weaponProfileId: number) {
  return tx.select({ instanceId: copy.id, itemId: copy.itemId, name: item.name, capacity: magazineProfile.capacityRounds,
    loadedRounds: copy.loadedRounds, ammunitionItemId: copy.loadedAmmunitionItemId, attachedWeaponInstanceId: attachment.weaponInstanceId })
    .from(copy).innerJoin(item, eq(item.id, copy.itemId)).innerJoin(magazineProfile, eq(magazineProfile.itemId, copy.itemId))
    .innerJoin(weaponMagazine, and(eq(weaponMagazine.magazineItemId, copy.itemId), eq(weaponMagazine.weaponProfileId, weaponProfileId)))
    .leftJoin(attachment, eq(attachment.magazineInstanceId, copy.id))
    .where(and(eq(copy.characterId, characterId), isNull(copy.retiredAt), isNull(item.archivedAt)));
}

export async function validateMagazineSwap(tx: Tx, state: State, replacementId: number | null) {
  const [current] = await tx.select().from(attachment).where(eq(attachment.weaponInstanceId, state.itemInstanceId));
  if (!current && state.loadedRounds > 0) throw new Error("Unload the existing internal rounds before attaching a magazine. They cannot be moved into a magazine automatically.");
  if (replacementId === null) {
    if (!current) throw new Error("This firearm has no attached magazine to remove.");
    return null;
  }
  const replacement = (await readCompatibleMagazineCopies(tx, state.characterId, state.weaponProfileId)).find((entry) => entry.instanceId === replacementId);
  if (!replacement) throw new Error("Choose an exact owned magazine that is physically compatible with this weapon.");
  if (replacement.attachedWeaponInstanceId) throw new Error(replacement.attachedWeaponInstanceId === state.itemInstanceId ? "That magazine is already attached to this firearm." : "That magazine is attached to another firearm. Remove it there first.");
  const [filling] = await tx.select({ id: magazineInventoryOperation.id }).from(magazineInventoryOperation).where(and(eq(magazineInventoryOperation.instanceId, replacement.instanceId),
    sql`${magazineInventoryOperation.request}->>'operation' = 'combat-fill' and ${magazineInventoryOperation.result}->>'status' in ('pending','interrupted')`)).limit(1);
  if (filling) throw new Error("Finish or cancel the unfinished magazine filling action before attaching that copy.");
  const [profile] = await tx.select({ ammoId: weaponProfile.ammunitionItemId, reloadType: weaponProfile.reloadType }).from(weaponProfile).where(eq(weaponProfile.id, state.weaponProfileId));
  if (profile?.reloadType !== "Magazine") throw new Error("Set this weapon's Reload Type to Magazine before attaching a magazine.");
  if (replacement.loadedRounds && replacement.ammunitionItemId !== profile.ammoId) throw new Error("This magazine fits the weapon but contains a different ammunition type. Choose a copy loaded with this weapon's authored ammunition.");
  return replacement;
}

export async function swapFirearmMagazine(tx: Tx, state: State, replacementId: number | null) {
  const replacement = await validateMagazineSwap(tx, state, replacementId);
  if (replacement) await tx.select({ id: copy.id }).from(copy).where(eq(copy.id, replacement.instanceId)).for("update");
  await tx.delete(attachment).where(eq(attachment.weaponInstanceId, state.itemInstanceId));
  if (replacement) await tx.insert(attachment).values({ weaponInstanceId: state.itemInstanceId, magazineInstanceId: replacement.instanceId,
    characterId: state.characterId, campaignId: state.campaignId, weaponItemId: state.itemId, weaponProfileId: state.weaponProfileId, magazineItemId: replacement.itemId });
  return readEffectiveFirearmState(tx, { ...state, loadedRounds: 0, loadedAmmunitionItemId: null, loadedAmmunitionProfileId: null, loadedAmmunitionUnitCostCredits: null });
}
