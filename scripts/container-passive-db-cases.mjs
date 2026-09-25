import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { itemPassiveEffect, itemPower, itemPowerEffect } from "../src/db/item-schema.ts";
import { handleInventoryInTransaction } from "../src/features/items/inventory-custody-service.ts";

export async function containerPassiveCases(t, { fixture, pool, db, view, exactMove, stackMove, equipment }) {
  const read = f => db.transaction(tx => equipment.readCharacterEquipmentStateInTransaction(tx, f.heroId));
  const equipExact = (f, instanceId = f.exact, state = "equipped") => db.transaction(tx =>
    equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId, state }));
  const equipStack = (f, quantity = 1, state = "equipped") => db.transaction(tx =>
    equipment.setStackEquipmentStateInTransaction(tx, { characterId: f.heroId, itemId: f.suppliesId, quantity, state }));
  const change = async (f, operation, extra = {}) => {
    const expectedCommerceVersion = (await view(f)).commerceVersion;
    return db.transaction(tx => handleInventoryInTransaction(tx, f.godId, {
      characterId: f.heroId, expectedCommerceVersion, requestKey: randomUUID(), operation,
      instanceId: f.exact, itemId: f.exactItemId, quantity: 1, reason: "Passive custody regression", ...extra,
    }));
  };
  const author = (itemId, source = "power", requiredEquipmentState = "equipped") => db.transaction(async tx => {
    const effects = [
      { kind: "manual", title: "Manual ward", description: "G.O.D. resolves this authored ward." },
      { kind: "condition.apply", name: "Automatic ward", description: "Authored passive Condition.", duration: { kind: "until-removed" } },
      { kind: "modifier.apply", label: "Automatic protection", channel: "damage", targetKey: "self", amount: 2, duration: { kind: "until-removed" } },
    ];
    for (const [sortOrder, effectJson] of effects.entries()) {
      if (source === "legacy") {
        await tx.insert(itemPassiveEffect).values({ itemId, requiredEquipmentState, sortOrder, schemaVersion: 2, effectJson });
      } else {
        const [power] = await tx.insert(itemPower).values({
          itemId, name: `Passive ${sortOrder}`, trigger: "passive", activationLabel: "", sortOrder,
          resolutionMode: effectJson.kind === "manual" ? "manual" : "automatic", requiredEquipmentState, resourceCostKind: "none",
        }).returning();
        await tx.insert(itemPowerEffect).values({ itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson });
      }
    }
  });
  const assertPassives = async (f, itemId, owners) => {
    const manual = (await read(f)).activeManualPassives.filter(row => row.itemId === itemId);
    assert.equal(manual.length, owners > 0 ? 1 : 0, "Equipment State reports a manual effect only with an eligible owner");
    for (const [table, ended] of [["campaign_character_active_condition", "resolved_at"], ["campaign_character_active_modifier", "ended_at"]]) {
      const { rows } = await pool.query(`select id from ${table} where character_id=$1 and source_kind='item' and source_id=$2 and ${ended} is null`, [f.heroId, String(itemId)]);
      assert.equal(rows.length, owners, `${table} agrees before any explicit reconciliation`);
    }
    const reconciled = await db.transaction(tx => equipment.reconcileItemPassiveEffectsInTransaction(tx, f.heroId, [itemId]));
    assert.equal(reconciled.activeManualPassives.length, owners, "Reconciliation and read use the same eligible owners");
    assert.deepEqual([reconciled.created, reconciled.ended, reconciled.resolved], [[], [], []], "Automatic effects remain idempotent");
  };
  const assertExactState = async (f, state) => {
    const { rows } = await pool.query("select equipment_state from campaign_character_item_instance where id=$1", [f.exact]);
    assert.equal(rows[0].equipment_state, state);
  };

  for (const source of ["power", "legacy"]) await t.test(`${source}: carried Equipped exact passive disappears on voluntary drop and returns on recovery`, async () => {
    const f = await fixture();
    await author(f.exactItemId, source);
    await equipExact(f);
    await assertPassives(f, f.exactItemId, 1);
    await change(f, "drop");
    await assertExactState(f, "equipped");
    await assertPassives(f, f.exactItemId, 0);
    await change(f, "recover");
    await assertExactState(f, "equipped");
    await assertPassives(f, f.exactItemId, 1);
    for (const [table, ended] of [["campaign_character_active_condition", "resolved_at"], ["campaign_character_active_modifier", "ended_at"]]) {
      const { rows } = await pool.query(`select count(*)::int n from ${table} where character_id=$1 and source_kind='item' and source_id=$2 and ${ended} is not null`, [f.heroId, String(f.exactItemId)]);
      assert.equal(rows[0].n, 1, "Recovery retains the former automatic effect in history");
    }
  });

  for (const operation of ["stolen", "lost"]) await t.test(`${operation} outer backpack suppresses nested Equipped child passives; recovery restores them even while closed`, async () => {
    const f = await fixture();
    await author(f.exactItemId);
    await equipExact(f);
    await exactMove(f, f.pouch, null, f.a);
    await exactMove(f, f.exact, null, f.pouch);
    await pool.query("update container_profiles set closure_mode='open-close' where item_id=$1", [f.backpackId]);
    await assertPassives(f, f.exactItemId, 1);
    await change(f, operation, { instanceId: f.a, itemId: f.backpackId });
    await assertExactState(f, "equipped");
    await assertPassives(f, f.exactItemId, 0);
    await change(f, "recover", { instanceId: f.a, itemId: f.backpackId });
    await assertExactState(f, "equipped");
    await assertPassives(f, f.exactItemId, 1);
    assert.equal((await view(f)).accessGraph.instances.find(row => row.instanceId === f.exact).containerInstanceId, f.pouch);
  });

  await t.test("G.O.D. theft forces root Inactive and recovery requires explicit re-equipping for manual and automatic passives", async () => {
    const f = await fixture();
    await author(f.exactItemId);
    await equipExact(f);
    await assertPassives(f, f.exactItemId, 1);
    await change(f, "stolen");
    await assertExactState(f, "inactive");
    await assertPassives(f, f.exactItemId, 0);
    await change(f, "recover");
    await assertExactState(f, "inactive");
    await assertPassives(f, f.exactItemId, 0);
    await equipExact(f);
    await assertPassives(f, f.exactItemId, 1);
  });

  await t.test("fully dropped stack has no passive despite saved Equipped quantity; partial recovery restores an active owner", async () => {
    const f = await fixture();
    await author(f.suppliesId);
    await equipStack(f, 20);
    await assertPassives(f, f.suppliesId, 1);
    await change(f, "drop", { instanceId: null, itemId: f.suppliesId, quantity: 20 });
    assert.equal((await read(f)).stacks.find(row => row.itemId === f.suppliesId).equippedQuantity, 20);
    await assertPassives(f, f.suppliesId, 0);
    const custodyId = (await view(f)).accessGraph.stackCustody[0].id;
    await change(f, "recover", { instanceId: null, itemId: f.suppliesId, quantity: 1, custodyId });
    await assertPassives(f, f.suppliesId, 1);
  });

  await t.test("partially dropped stack retains passives only while a carried active copy remains", async () => {
    const f = await fixture();
    await author(f.suppliesId);
    await equipStack(f);
    await change(f, "drop", { instanceId: null, itemId: f.suppliesId, quantity: 19 });
    await assertPassives(f, f.suppliesId, 1);
    await equipStack(f, 0);
    await assertPassives(f, f.suppliesId, 0);
    await equipStack(f);
    await assertPassives(f, f.suppliesId, 1);
    await change(f, "drop", { instanceId: null, itemId: f.suppliesId });
    await assertPassives(f, f.suppliesId, 0);
  });

  await t.test("carried contained stack qualifies without Loose copies; stolen ancestry removes its passive until recovery", async () => {
    const f = await fixture();
    await author(f.suppliesId);
    await stackMove(f, null, f.a, 20);
    await equipStack(f);
    await pool.query("update container_profiles set closure_mode='open-close' where item_id=$1", [f.backpackId]);
    assert.equal((await view(f)).stacks.find(row => row.itemId === f.suppliesId).looseQuantity, 0);
    await assertPassives(f, f.suppliesId, 1);
    await change(f, "stolen", { instanceId: f.a, itemId: f.backpackId });
    assert.equal((await read(f)).stacks.find(row => row.itemId === f.suppliesId).equippedQuantity, 1);
    await assertPassives(f, f.suppliesId, 0);
    await change(f, "recover", { instanceId: f.a, itemId: f.backpackId });
    await assertPassives(f, f.suppliesId, 1);
  });

  await t.test("eligibility belongs to the same exact copy; multiple active copies keep the existing single manual read row", async () => {
    const f = await fixture(), second = await f.copy(f.exactItemId);
    await author(f.exactItemId);
    await equipExact(f);
    await change(f, "drop");
    await assertPassives(f, f.exactItemId, 0);
    await equipExact(f, second);
    await assertPassives(f, f.exactItemId, 1);
    await change(f, "recover");
    await assertPassives(f, f.exactItemId, 2);
  });

  for (const [state, table, collection] of [["worn", "armor_profiles", "wornArmor"], ["wielded", "weapon_profiles", "wieldedWeapons"]]) {
    await t.test(`${state} operational filtering and passive Equipment State requirements remain distinct from carried custody`, async () => {
      const f = await fixture();
      await pool.query(`insert into ${table}(item_id) values($1)`, [f.exactItemId]);
      await author(f.exactItemId, "power", state);
      await equipExact(f);
      await assertPassives(f, f.exactItemId, 0);
      assert.equal((await read(f))[collection].length, 0);
      await equipExact(f, f.exact, state);
      await assertPassives(f, f.exactItemId, 1);
      assert.equal((await read(f))[collection].length, 1);
      await assert.rejects(exactMove(f, f.exact, null, f.a), error => /Worn|Wielded/.test(`${error.message} ${error.cause?.message}`));
      await change(f, "stolen");
      await assertPassives(f, f.exactItemId, 0);
      assert.equal((await read(f))[collection].length, 0);
      await change(f, "recover");
      assert.equal((await read(f))[collection].length, 0);
      await equipExact(f, f.exact, state);
      await assertPassives(f, f.exactItemId, 1);
      assert.equal((await read(f))[collection].length, 1);
    });
  }
}
