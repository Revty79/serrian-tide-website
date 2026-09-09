import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { item, weaponProfile } from "@/db/item-schema";
import { magazineProfile, magazineInventoryOperation, weaponMagazine } from "@/db/magazine-schema";
import { campaignCharacterItem, campaignCharacterItemInstance, campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSessionEncounter } from "@/db/tabletop-operations-schema";
import { userRole } from "@/db/authorization-schema";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { saveMagazineCatalogInTransaction } from "@/features/items/magazine-catalog-service";
import { handleMagazineInTransaction, readMagazineInventoryInTransaction, type MagazineCommand } from "@/features/items/magazine-inventory-service";
import { getItemOwnershipStrategy, getStartingItemInstanceCharges } from "@/features/items/item-ownership";
import { DEFAULT_ITEM_RUNTIME_PROFILE } from "@/features/items/item-runtime";
if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Run through the disposable database harness with the magazine filter.");
after(() => pool.end());

test("magazine catalog, ownership, conserved transfers, retries and restrictions", async (t) => {
  const f = await db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "magazine");
    await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]).onConflictDoNothing();
    await tx.update(campaignSessionEncounter).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionEncounter.id, f.encounterId));
    const [model, ammo, alternate] = await tx.insert(item).values(["Magazine", "Ammunition", "Ammunition"].map((recordType, i) => ({ canonicalId: `MAGAZINE-${crypto.randomUUID()}`.toUpperCase(), name: `Magazine fixture ${i}`, catalogScope: "inventory", recordType, family: "Test", category: "Test", priceBasis: "unit", createdByUserId: f.godId }))).returning();
    const ammunition = [ammo, alternate].map(({ id, name }) => ({ id, name }));
    await saveMagazineCatalogInTransaction(tx, model.id, { capacityRounds: 15, ammunition });
    await tx.update(weaponProfile).set({ reloadType: "Magazine" }).where(eq(weaponProfile.itemId, f.weaponId));
    await saveMagazineCatalogInTransaction(tx, f.weaponId, null, [{ id: model.id, name: model.name }]);
    assert.equal(getItemOwnershipStrategy(DEFAULT_ITEM_RUNTIME_PROFILE, true), "instance");
    const copies = await tx.insert(campaignCharacterItemInstance).values([1, 2].map(() => ({ characterId: f.heroId, itemId: model.id, currentCharges: getStartingItemInstanceCharges(DEFAULT_ITEM_RUNTIME_PROFILE, true), unitCostCredits: 5 }))).returning();
    await tx.insert(campaignCharacterItem).values({ characterId: f.heroId, itemId: ammo.id, quantity: 25, unitCostCredits: 2 });
    return { ...f, model, ammo, alternate, ammunition, copies };
  });
  const view = () => db.transaction((tx) => readMagazineInventoryInTransaction(tx, f.heroId, f.godId));
  const command = (instanceId: number, operation: MagazineCommand["operation"], expectedRounds: number, rounds: number | null = null): MagazineCommand => ({ characterId: f.heroId, instanceId, operation, expectedRounds, expectedAmmunitionItemId: expectedRounds ? f.ammo.id : null, ammunitionItemId: f.ammo.id, rounds, requestKey: crypto.randomUUID() });
  const execute = (input: MagazineCommand, userId = f.godId) => db.transaction((tx) => handleMagazineInTransaction(tx, userId, input));
  const conserved = async () => {
    const state = await view(); const [stack] = await db.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.ammo.id)));
    assert.equal((stack?.quantity ?? 0) + state.magazines.reduce((sum, entry) => sum + entry.loadedRounds, 0), 25);
    return state;
  };
  await t.test("capacity and exact many-to-many links persist; two copies start empty", async () => {
    assert.deepEqual((await view()).magazines.map((entry) => entry.loadedRounds), [0, 0]);
    assert.equal((await db.select().from(weaponMagazine).where(eq(weaponMagazine.magazineItemId, f.model.id))).length, 1);
    for (const capacityRounds of [0, -1, 2.5]) await assert.rejects(db.transaction((tx) => saveMagazineCatalogInTransaction(tx, f.model.id, { capacityRounds, ammunition: f.ammunition })), /positive whole/);
    await assert.rejects(db.transaction((tx) => saveMagazineCatalogInTransaction(tx, f.model.id, { capacityRounds: 15, ammunition: [{ id: f.weaponId, name: "wrong" }] })), /ammunition definitions/);
  });
  await t.test("fill, retry, separate copy, top-up and reload conserve ammunition and cost", async () => {
    const fill = command(f.copies[0].id, "fill", 0);
    await execute(fill); await execute(fill);
    await execute(command(f.copies[1].id, "add", 0, 4));
    assert.deepEqual((await conserved()).magazines.map((entry) => entry.loadedRounds), [15, 4]);
    await execute(command(f.copies[1].id, "add", 4, 2));
    assert.equal((await conserved()).magazines[1].loadedRounds, 6);
    assert.equal((await db.select().from(magazineInventoryOperation).where(eq(magazineInventoryOperation.characterId, f.heroId))).length, 3);
    await assert.rejects(execute({ ...fill, operation: "empty" }), /different magazine operation/);
  });
  await t.test("capacity, inventory, ammunition and authorization failures leave contents intact", async () => {
    await assert.rejects(execute(command(f.copies[1].id, "add", 6, 10)), /exceed/);
    await assert.rejects(execute(command(f.copies[1].id, "fill", 6)), /not enough/);
    await assert.rejects(execute({ ...command(f.copies[1].id, "add", 6, 1), ammunitionItemId: f.weaponId }), /not compatible/);
    await assert.rejects(execute({ ...command(f.copies[1].id, "add", 6, 1), ammunitionItemId: f.alternate.id }), /Empty.*changing/);
    await assert.rejects(execute(command(f.copies[1].id, "add", 6, 1), "not-an-owner"), /permission/);
    await conserved();
  });
  await t.test("loaded copies protect catalog capacity, compatibility, removal and retirement", async () => {
    await assert.rejects(db.transaction((tx) => saveMagazineCatalogInTransaction(tx, f.model.id, { capacityRounds: 10, ammunition: f.ammunition })), /Empty/);
    await assert.rejects(db.transaction((tx) => saveMagazineCatalogInTransaction(tx, f.model.id, { capacityRounds: 15, ammunition: [{ id: f.alternate.id, name: "other" }] })), /Empty/);
    for (const query of [sql`delete from campaign_character_item_instance where id=${f.copies[0].id}`, sql`update campaign_character_item_instance set retired_at=now(), retirement_reason='sale' where id=${f.copies[0].id}`, sql`update items set archived_at=now() where id=${f.model.id}`]) {
      await assert.rejects(db.transaction((tx) => tx.execute(query)), (error: unknown) => error instanceof Error && String((error as Error & { cause?: Error }).cause?.message).includes("Empty"));
    }
    await conserved();
  });
  await t.test("empty returns exact ammunition and retry cannot refund twice", async () => {
    for (const [i, rounds] of [15, 6].entries()) { const empty = command(f.copies[i].id, "empty", rounds); await execute(empty); await execute(empty); }
    const state = await conserved(); assert.deepEqual(state.magazines.map((entry) => entry.loadedRounds), [0, 0]);
    const [stack] = await db.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.ammo.id)));
    assert.equal(stack.unitCostCredits, 2);
  });
  await t.test("concurrent requests cannot spend the same rounds or fill one copy twice", async () => {
    const same = command(f.copies[0].id, "add", 0, 10);
    const results = await Promise.allSettled([execute(same), execute({ ...same, requestKey: crypto.randomUUID() })]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const pair = await Promise.allSettled([execute(command(f.copies[0].id, "add", 10, 5)), execute(command(f.copies[1].id, "fill", 0))]);
    assert.equal(pair.filter((result) => result.status === "fulfilled").length, 1); await conserved();
    const [profile] = await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId));
    assert.ok(profile.commerceVersion > 0, "Stale Character editors cannot overwrite live inventory transfers.");
  });
  await t.test("active combat blocks filling and emptying on the server", async () => {
    await db.update(campaignSessionEncounter).set({ status: "active", completedAt: null }).where(eq(campaignSessionEncounter.id, f.encounterId));
    const before = await view();
    for (const operation of ["fill", "empty"] as const) await assert.rejects(execute(command(f.copies[0].id, operation, before.magazines[0].loadedRounds)), /active combat/);
    assert.deepEqual(await view(), before);
  });
  assert.equal((await db.select().from(magazineProfile).where(eq(magazineProfile.itemId, f.model.id)))[0].capacityRounds, 15);
});
