"use client";

import { useEffect, useMemo, useState } from "react";

import {
  addCampaignInventoryItemIds,
  filterAvailableCampaignInventoryItems,
  removeCampaignInventoryItemIds,
  type CampaignInventoryCatalogFilter,
  type CampaignInventoryPoolItem,
  type CampaignInventoryTag,
} from "@/features/campaigns/campaign-inventory";

import { getCampaignInventoryItems } from "./actions";

const catalogTabs: ReadonlyArray<{
  value: CampaignInventoryCatalogFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "weapon", label: "Weapons" },
  { value: "armor", label: "Armor" },
  { value: "general", label: "General Equipment" },
  { value: "inventory", label: "Inventory" },
];

type Props = {
  campaignId: number | null;
  tags: readonly CampaignInventoryTag[];
  selectedTagIds: readonly number[];
  selectedItemIds: readonly number[];
  onSelectedTagIdsChange: (ids: number[]) => void;
  onSelectedItemIdsChange: (ids: number[]) => void;
};

export function CampaignInventorySelector({
  campaignId,
  tags,
  selectedTagIds,
  selectedItemIds,
  onSelectedTagIdsChange,
  onSelectedItemIdsChange,
}: Props) {
  const [loadState, setLoadState] = useState<{
    requestKey: string;
    items: CampaignInventoryPoolItem[];
    error: string;
  }>({ requestKey: "", items: [], error: "" });
  const [search, setSearch] = useState("");
  const [catalogFilter, setCatalogFilter] =
    useState<CampaignInventoryCatalogFilter>("all");
  const [activeAvailableId, setActiveAvailableId] = useState<number | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<number | null>(null);
  const selectedTagKey = selectedTagIds.join(",");
  const selectedItemKey = selectedItemIds.join(",");
  const requestKey = `${campaignId ?? "new"}|${selectedTagKey}|${selectedItemKey}`;
  const loading = loadState.requestKey !== requestKey;
  const items = loadState.items;
  const error = loading ? "" : loadState.error;

  useEffect(() => {
    let active = true;

    getCampaignInventoryItems({
      campaignId,
      selectedTagIds: selectedTagKey
        ? selectedTagKey.split(",").map(Number)
        : [],
      selectedItemIds: selectedItemKey
        ? selectedItemKey.split(",").map(Number)
        : [],
    })
      .then((nextItems) => {
        if (active) {
          setLoadState({ requestKey, items: nextItems, error: "" });
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadState((current) => ({
          requestKey,
          items: current.items.map((item) => ({
            ...item,
            matchesSelectedTags: false,
          })),
          error:
            reason instanceof Error
              ? reason.message
              : "Campaign inventory Items could not be loaded.",
        }));
      });

    return () => {
      active = false;
    };
  }, [campaignId, requestKey, selectedItemKey, selectedTagKey]);

  const selectedIdSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds],
  );
  const availableItems = useMemo(
    () =>
      filterAvailableCampaignInventoryItems(
        items,
        selectedItemIds,
        catalogFilter,
        search,
      ),
    [catalogFilter, items, search, selectedItemIds],
  );
  const allUnselectedTaggedItems = useMemo(
    () =>
      items.filter(
        (item) => item.matchesSelectedTags && !selectedIdSet.has(item.id),
      ),
    [items, selectedIdSet],
  );
  const selectedItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return selectedItemIds
      .map((id) => byId.get(id))
      .filter((item): item is CampaignInventoryPoolItem => Boolean(item));
  }, [items, selectedItemIds]);

  function changeTags(nextIds: number[]) {
    setSearch("");
    setActiveAvailableId(null);
    onSelectedTagIdsChange(nextIds);
  }

  function toggleTag(tagId: number) {
    changeTags(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId],
    );
  }

  function addItems(itemIds: readonly number[]) {
    onSelectedItemIdsChange(
      addCampaignInventoryItemIds(selectedItemIds, itemIds),
    );
    setActiveAvailableId(null);
  }

  function removeItems(itemIds: readonly number[]) {
    onSelectedItemIdsChange(
      removeCampaignInventoryItemIds(selectedItemIds, itemIds),
    );
    setActiveCampaignId(null);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
            Campaign Catalog
          </p>
          <h2 className="font-sans mt-2 text-3xl text-slate-100">
            Inventory Genres & Items
          </h2>
          <span className="mt-2 block text-xs text-slate-300">
            {selectedTagIds.length} genres selected · {selectedItemIds.length} Campaign Items
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={tags.length === 0}
            onClick={() => changeTags(tags.map(({ id }) => id))}
            className="rounded-full border border-amber-300/30 px-4 py-2 text-xs text-amber-100 disabled:opacity-40"
          >
            Select All
          </button>
          <button
            type="button"
            disabled={selectedTagIds.length === 0}
            onClick={() => changeTags([])}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-slate-300 disabled:opacity-40"
          >
            Clear All
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-400">
        Choose genres to build the tagged Equipment and Inventory pool, then move
        the records you want into this Campaign.
      </p>

      <div className="mt-5 grid max-h-[24rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3" aria-label="Item genres">
        {tags.map((tag) => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <label
              key={tag.id}
              title={tag.description}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                selected
                  ? "border-amber-300/35 bg-amber-300/10"
                  : "border-white/10 bg-black/30 hover:border-amber-300/25"
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleTag(tag.id)}
                className="mt-0.5 h-4 w-4 accent-amber-300"
              />
              <span className="min-w-0">
                <strong className="block text-sm text-slate-100">{tag.name}</strong>
                <small className="mt-1 block text-xs text-slate-300">{tag.tagGroup}</small>
              </span>
            </label>
          );
        })}
        {tags.length === 0 ? (
          <p className="text-sm text-slate-300">No Item genres are currently available.</p>
        ) : null}
      </div>

      {selectedTagIds.length > 0 ? (
        <>
          <label className="mt-6 block max-w-2xl">
            <span className="text-sm text-slate-300">
              Search Available Equipment & Inventory
            </span>
            <input
              type="search"
              value={search}
              placeholder="Name, canonical ID, type, family, category, or group"
              onChange={(event) => setSearch(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-100 outline-none transition focus:border-amber-300/50"
            />
          </label>

          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Available item type">
            {catalogTabs.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                aria-pressed={catalogFilter === value}
                onClick={() => setCatalogFilter(value)}
                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.12em] transition ${
                  catalogFilter === value
                    ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                    : "border-white/15 bg-black/30 text-slate-400 hover:border-white/30 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <p className="mt-6 rounded-2xl border border-purple-300/15 bg-purple-950/15 p-5 text-sm text-purple-100">
          Choose one or more genres above to combine their tagged Equipment and Inventory.
        </p>
      )}

      {error ? (
        <p className="mt-5 rounded-xl border border-red-300/25 bg-red-950/20 p-4 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <InventoryList
          heading="Available Items"
          count={`${availableItems.length} shown`}
          items={selectedTagIds.length > 0 && !loading ? availableItems : []}
          activeId={activeAvailableId}
          emptyMessage={
            selectedTagIds.length === 0
              ? "Select one or more genres to build the available pool."
              : loading
                ? "Reading matching Items…"
                : allUnselectedTaggedItems.length === 0
                  ? "All matching Items have been added."
                  : "No Items match the active tab and search."
          }
          onSelect={setActiveAvailableId}
          onActivate={(id) => addItems([id])}
        />

        <div className="flex flex-wrap content-center justify-center gap-2 lg:w-44 lg:flex-col">
          <TransferButton
            disabled={activeAvailableId === null}
            onClick={() => activeAvailableId !== null && addItems([activeAvailableId])}
          >
            Add Selected →
          </TransferButton>
          <TransferButton
            disabled={allUnselectedTaggedItems.length === 0 || loading}
            onClick={() => addItems(allUnselectedTaggedItems.map(({ id }) => id))}
          >
            Move All →
          </TransferButton>
          <TransferButton
            disabled={activeCampaignId === null}
            onClick={() => activeCampaignId !== null && removeItems([activeCampaignId])}
          >
            ← Remove Selected
          </TransferButton>
          <TransferButton
            disabled={selectedItemIds.length === 0}
            onClick={() => onSelectedItemIdsChange([])}
          >
            Clear Campaign Items
          </TransferButton>
        </div>

        <InventoryList
          heading="Available in Campaign"
          count={`${selectedItemIds.length} selected`}
          items={selectedItems}
          activeId={activeCampaignId}
          emptyMessage={
            loading && selectedItemIds.length > 0
              ? "Reading selected Campaign Items…"
              : "Double-click an Item on the left or use the transfer buttons."
          }
          onSelect={setActiveCampaignId}
          onActivate={(id) => removeItems([id])}
        />
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-300">
        Double-click Items to move them between lists. Genre, tab, and search changes remain unsaved until you save the Campaign.
      </p>
    </section>
  );
}

function InventoryList({
  heading,
  count,
  items,
  activeId,
  emptyMessage,
  onSelect,
  onActivate,
}: {
  heading: string;
  count: string;
  items: readonly CampaignInventoryPoolItem[];
  activeId: number | null;
  emptyMessage: string;
  onSelect: (id: number) => void;
  onActivate: (id: number) => void;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
      <header className="flex items-end justify-between gap-3 border-b border-white/10 pb-3">
        <h3 className="font-sans text-xl text-slate-100">{heading}</h3>
        <span className="text-xs text-slate-300">{count}</span>
      </header>
      <div className="mt-3 flex max-h-[32rem] min-h-64 flex-col gap-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="p-3 text-sm leading-6 text-slate-300">{emptyMessage}</p>
        ) : (
          items.map((item) => (
            <button
              type="button"
              key={item.id}
              title={`Double-click to move ${item.name}`}
              onClick={() => onSelect(item.id)}
              onDoubleClick={() => onActivate(item.id)}
              className={`rounded-xl border p-3 text-left transition ${
                activeId === item.id
                  ? "border-amber-300/45 bg-amber-300/10"
                  : "border-white/10 bg-black/30 hover:border-white/25"
              }`}
            >
              <strong className="block text-sm text-slate-100">{item.name}</strong>
              <span className="mt-1 block text-xs leading-5 text-slate-300">
                {item.canonicalId} · {item.equipmentGroup ?? "Inventory"} · {item.category}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function TransferButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-amber-300/30 bg-amber-300/5 px-4 py-2.5 text-xs text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
