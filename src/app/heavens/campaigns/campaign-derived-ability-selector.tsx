"use client";

import { useMemo, useState } from "react";

import type { CampaignDerivedAbilityOption } from "@/features/derived-abilities/models";

type Props = {
  abilities: readonly CampaignDerivedAbilityOption[];
  selectedIds: readonly number[];
  onSelectedIdsChange: (ids: number[]) => void;
  inputName?: string;
};

export function CampaignDerivedAbilitySelector({
  abilities,
  selectedIds,
  onSelectedIdsChange,
  inputName,
}: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return abilities;
    return abilities.filter((ability) =>
      [
        ability.name,
        ability.requirementSummary,
        ability.description,
        ability.mechanicalEffect,
      ].some((value) => value.toLocaleLowerCase().includes(needle)),
    );
  }, [abilities, search]);

  function toggle(id: number) {
    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter((candidate) => candidate !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/35 p-6 shadow-2xl backdrop-blur-md sm:p-8">
      {inputName
        ? selectedIds.map((id) => (
            <input key={id} type="hidden" name={inputName} value={id} />
          ))
        : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
            Campaign Milestones
          </p>
          <h2 className="font-sans mt-2 text-3xl text-slate-100">
            Allowed Derived Abilities
          </h2>
          <span className="mt-2 block text-xs text-slate-300">
            {selectedIds.length} selected
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!abilities.length}
            onClick={() => onSelectedIdsChange(abilities.map(({ id }) => id))}
            className="rounded-full border border-amber-300/30 px-4 py-2 text-xs text-amber-100 disabled:opacity-40"
          >
            Select All
          </button>
          <button
            type="button"
            disabled={!selectedIds.length}
            onClick={() => onSelectedIdsChange([])}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-slate-300 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Characters gain only Campaign-approved abilities whose requirements they currently meet.
      </p>
      <label className="mt-5 block max-w-2xl">
        <span className="text-sm text-slate-300">Search Derived Abilities</span>
        <input
          type="search"
          value={search}
          placeholder="Name, Attribute requirement, description, or rules"
          onChange={(event) => setSearch(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-black/50 px-4 text-sm text-slate-100 outline-none transition focus:border-amber-300/50"
        />
      </label>
      <div className="mt-5 grid max-h-[32rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ability) => {
          const selected = selectedIds.includes(ability.id);
          return (
            <label
              key={ability.id}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                selected
                  ? "border-amber-300/35 bg-amber-300/10"
                  : "border-white/10 bg-black/30 hover:border-amber-300/25"
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(ability.id)}
                className="mt-0.5 h-4 w-4 accent-amber-300"
              />
              <span className="min-w-0">
                <strong className="block text-sm text-slate-100">{ability.name}</strong>
                <small className="mt-1 block text-xs font-semibold text-amber-200">
                  {ability.requirementSummary}
                </small>
                {ability.description ? (
                  <small className="mt-2 block text-xs leading-5 text-slate-300">
                    {ability.description}
                  </small>
                ) : null}
              </span>
            </label>
          );
        })}
        {!filtered.length ? (
          <p className="text-sm text-slate-300">
            {abilities.length ? "No Derived Abilities match this search." : "No Derived Abilities are available."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
