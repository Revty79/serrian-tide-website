import assert from "node:assert/strict";
import test from "node:test";

import {
  addCampaignInventoryItemIds,
  buildCampaignInventoryPool,
  createCampaignInventoryPersistence,
  filterAvailableCampaignInventoryItems,
  removeCampaignInventoryItemIds,
  restoreCampaignInventoryPersistence,
  sortCampaignInventoryTags,
  type CampaignInventoryItemRecord,
} from "./campaign-inventory";

function item(
  id: number,
  name: string,
  catalogScope: "equipment" | "inventory",
  equipmentGroup: "weapon" | "armor" | "general" | null,
  overrides: Partial<CampaignInventoryItemRecord> = {},
): CampaignInventoryItemRecord {
  return {
    id,
    canonicalId: `ITEM-${id}`,
    name,
    catalogScope,
    equipmentGroup,
    recordType: equipmentGroup ?? "Inventory",
    family: "Test family",
    category: "Test category",
    credits: null,
    ...overrides,
  };
}

const rifle2 = item(2, "Rifle 2", "equipment", "weapon", {
  family: "Military Arms",
});
const rifle10 = item(10, "rifle 10", "equipment", "weapon");
const armor = item(3, "Ballistic Plate", "equipment", "armor");
const general = item(4, "Field Kit", "equipment", "general");
const inventory = item(5, "Medical Pack", "inventory", null);

test("multiple selected tags form a naturally sorted union and duplicate Items once", () => {
  const pool = buildCampaignInventoryPool(
    [[rifle10, armor], [rifle2, armor, inventory]],
    [],
  );

  assert.deepEqual(
    pool.map(({ id }) => id),
    [3, 5, 2, 10],
  );
  assert.equal(pool.filter(({ id }) => id === armor.id).length, 1);
});

test("Item names sort case-insensitively and numeric names sort naturally", () => {
  const pool = buildCampaignInventoryPool([[rifle10, rifle2]], []);
  assert.deepEqual(pool.map(({ name }) => name), ["Rifle 2", "rifle 10"]);
});

test("genre references sort case-insensitively with a stable ID fallback", () => {
  const tags = sortCampaignInventoryTags([
    { id: 3, name: "modern 10", tagGroup: "Genre", description: "" },
    { id: 2, name: "Modern 2", tagGroup: "Genre", description: "" },
    { id: 1, name: "modern 2", tagGroup: "Genre", description: "" },
  ]);

  assert.deepEqual(tags.map(({ id }) => id), [1, 2, 3]);
});

test("catalog tabs use Equipment groups and Inventory scope", () => {
  const pool = buildCampaignInventoryPool(
    [[rifle2, armor, general, inventory]],
    [],
  );

  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, [], "weapon", "").map(({ id }) => id),
    [rifle2.id],
  );
  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, [], "armor", "").map(({ id }) => id),
    [armor.id],
  );
  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, [], "general", "").map(({ id }) => id),
    [general.id],
  );
  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, [], "inventory", "").map(({ id }) => id),
    [inventory.id],
  );
});

test("search combines with the catalog tab across all supported fields", () => {
  const pool = buildCampaignInventoryPool(
    [[rifle2, armor, general, inventory]],
    [],
  );

  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, [], "weapon", "military").map(
      ({ id }) => id,
    ),
    [rifle2.id],
  );
  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, [], "armor", "military"),
    [],
  );
});

test("selected Items leave Available and return when removed", () => {
  const pool = buildCampaignInventoryPool([[rifle2, armor]], []);
  const selected = addCampaignInventoryItemIds([], [rifle2.id]);

  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, selected, "all", "").map(({ id }) => id),
    [armor.id],
  );

  const removed = removeCampaignInventoryItemIds(selected, [rifle2.id]);
  assert.deepEqual(
    filterAvailableCampaignInventoryItems(pool, removed, "all", "").map(({ id }) => id),
    [armor.id, rifle2.id],
  );
});

test("Move All keeps existing selection order and never duplicates Item IDs", () => {
  assert.deepEqual(
    addCampaignInventoryItemIds([armor.id, rifle2.id], [rifle2.id, inventory.id]),
    [armor.id, rifle2.id, inventory.id],
  );
});

test("Create persistence keeps selected tags separate from explicit Items", () => {
  assert.deepEqual(createCampaignInventoryPersistence([8, 3, 8], [10, 2, 10]), {
    tagIds: [8, 3],
    itemIds: [10, 2],
  });
});

test("Edit reload restores the same persisted tag and explicit Item order", () => {
  const persisted = createCampaignInventoryPersistence([8, 3], [10, 2]);
  const restored = restoreCampaignInventoryPersistence(
    persisted.tagIds.map((id, sortOrder) => ({ id, sortOrder })),
    persisted.itemIds.map((id, sortOrder) => ({ id, sortOrder })),
  );

  assert.deepEqual(restored, persisted);
});

test("selected Items remain in the pool even when they no longer match a tag", () => {
  const pool = buildCampaignInventoryPool([[rifle2]], [inventory]);
  const selectedInventory = pool.find(({ id }) => id === inventory.id);

  assert.equal(selectedInventory?.matchesSelectedTags, false);
  assert.equal(pool.some(({ id }) => id === inventory.id), true);
  assert.equal(
    filterAvailableCampaignInventoryItems(pool, [], "inventory", "").some(
      ({ id }) => id === inventory.id,
    ),
    false,
  );
});
