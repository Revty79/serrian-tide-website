export type CampaignInventoryCatalogFilter =
  | "all"
  | "weapon"
  | "armor"
  | "general"
  | "inventory";

export type CampaignInventoryTag = {
  id: number;
  name: string;
  tagGroup: string;
  description: string;
};

export type CampaignInventoryItemRecord = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: "equipment" | "inventory";
  equipmentGroup: "weapon" | "armor" | "general" | null;
  recordType: string;
  family: string;
  category: string;
  credits: number | null;
};

export type CampaignInventoryPoolItem = CampaignInventoryItemRecord & {
  matchesSelectedTags: boolean;
};

type OrderedId = {
  id: number;
  sortOrder: number;
};

const nameComparisonOptions: Intl.CollatorOptions = {
  sensitivity: "base",
  numeric: true,
};

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, nameComparisonOptions);
}

export function compareCampaignInventoryItems(
  left: CampaignInventoryItemRecord,
  right: CampaignInventoryItemRecord,
) {
  return (
    compareText(left.name, right.name) ||
    compareText(left.canonicalId, right.canonicalId) ||
    left.id - right.id
  );
}

export function sortCampaignInventoryTags<T extends CampaignInventoryTag>(
  tags: readonly T[],
): T[] {
  return [...tags].sort(
    (left, right) => compareText(left.name, right.name) || left.id - right.id,
  );
}

export function buildCampaignInventoryPool(
  taggedItemGroups: readonly (readonly CampaignInventoryItemRecord[])[],
  selectedItems: readonly CampaignInventoryItemRecord[],
): CampaignInventoryPoolItem[] {
  const itemsById = new Map<number, CampaignInventoryPoolItem>();

  for (const item of taggedItemGroups.flat()) {
    itemsById.set(item.id, { ...item, matchesSelectedTags: true });
  }

  for (const item of selectedItems) {
    const existing = itemsById.get(item.id);
    itemsById.set(item.id, {
      ...item,
      matchesSelectedTags: existing?.matchesSelectedTags ?? false,
    });
  }

  return [...itemsById.values()].sort(compareCampaignInventoryItems);
}

export function filterAvailableCampaignInventoryItems(
  items: readonly CampaignInventoryPoolItem[],
  selectedItemIds: readonly number[],
  catalogFilter: CampaignInventoryCatalogFilter,
  searchText: string,
): CampaignInventoryPoolItem[] {
  const selectedIds = new Set(selectedItemIds);
  const search = searchText.trim().toLocaleLowerCase();

  return items.filter((item) => {
    if (!item.matchesSelectedTags || selectedIds.has(item.id)) return false;

    const matchesCatalog =
      catalogFilter === "all" ||
      (catalogFilter === "inventory"
        ? item.catalogScope === "inventory"
        : item.catalogScope === "equipment" &&
          item.equipmentGroup === catalogFilter);
    if (!matchesCatalog) return false;

    if (!search) return true;
    return [
      item.name,
      item.canonicalId,
      item.recordType,
      item.family,
      item.category,
      item.equipmentGroup ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(search));
  });
}

export function addCampaignInventoryItemIds(
  selectedItemIds: readonly number[],
  itemIdsToAdd: readonly number[],
): number[] {
  return [...new Set([...selectedItemIds, ...itemIdsToAdd])];
}

export function removeCampaignInventoryItemIds(
  selectedItemIds: readonly number[],
  itemIdsToRemove: readonly number[],
): number[] {
  const removedIds = new Set(itemIdsToRemove);
  return selectedItemIds.filter((id) => !removedIds.has(id));
}

function uniquePositiveIds(ids: readonly number[]) {
  return [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  ];
}

export function createCampaignInventoryPersistence(
  selectedTagIds: readonly number[],
  selectedItemIds: readonly number[],
) {
  return {
    tagIds: uniquePositiveIds(selectedTagIds),
    itemIds: uniquePositiveIds(selectedItemIds),
  };
}

export function restoreCampaignInventoryPersistence(
  tagRows: readonly OrderedId[],
  itemRows: readonly OrderedId[],
) {
  const bySortOrder = (left: OrderedId, right: OrderedId) =>
    left.sortOrder - right.sortOrder || left.id - right.id;

  return {
    tagIds: [...tagRows].sort(bySortOrder).map(({ id }) => id),
    itemIds: [...itemRows].sort(bySortOrder).map(({ id }) => id),
  };
}
