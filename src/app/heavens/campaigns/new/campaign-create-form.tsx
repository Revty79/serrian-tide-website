"use client";

import { useMemo, useState } from "react";

import { getCampaignControlHref } from "@/features/campaigns/campaign-workflow";

import type { CampaignReferenceData } from "../actions";
import { CampaignInventorySelector } from "../campaign-inventory-selector";
import { createCampaign } from "./actions";

const CAMPAIGN_SYSTEM_OPTIONS = [
  "Tier 1",
  "Tier 2",
  "Tier 3",
  "Spellcraft",
  "Talismanism",
  "Faith",
  "Psyonics",
  "Special Abilities",
  "Bardic Resonance",
  "Derived Abilities",
] as const;

type CurrencyRow = {
  name: string;
  description: string;
  creditsPerUnit: string;
};

export function CampaignCreateForm({
  references,
}: {
  references: CampaignReferenceData;
}) {
  const [currencySystem, setCurrencySystem] =
    useState<"Credits" | "Derived Currency">(
      "Credits",
    );

  const [fateMethod, setFateMethod] =
    useState<"Assigned" | "Rolled">(
      "Assigned",
    );

  const [currencies, setCurrencies] =
    useState<CurrencyRow[]>([
      {
        name: "",
        description: "",
        creditsPerUnit: "",
      },
    ]);

  const [raceSearch, setRaceSearch] = useState("");
  const [campaignRaceIds, setCampaignRaceIds] = useState<number[]>([]);
  const [allowedRaceIds, setAllowedRaceIds] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const filteredRaces = useMemo(() => {
    const search = raceSearch.trim().toLocaleLowerCase();
    const entries = search
      ? references.races.filter((entry) =>
          [entry.name, entry.size].some((value) =>
            value.toLocaleLowerCase().includes(search),
          ),
        )
      : references.races;
    return [...entries].sort((left, right) =>
      left.name.localeCompare(right.name) ||
      left.size.localeCompare(right.size) ||
      left.id - right.id,
    );
  }, [raceSearch, references.races]);

  function addCampaignRace(raceId: number) {
    setCampaignRaceIds((current) => (current.includes(raceId) ? current : [...current, raceId]));
  }

  function removeCampaignRace(raceId: number) {
    setCampaignRaceIds((current) => current.filter((id) => id !== raceId));
    setAllowedRaceIds((current) => current.filter((id) => id !== raceId));
  }

  function togglePlayableRace(raceId: number) {
    if (!campaignRaceIds.includes(raceId)) return;
    setAllowedRaceIds((current) =>
      current.includes(raceId)
        ? current.filter((id) => id !== raceId)
        : [...current, raceId],
    );
  }

  function addCurrency() {
    setCurrencies((current) => [
      ...current,
      {
        name: "",
        description: "",
        creditsPerUnit: "",
      },
    ]);
  }

  function removeCurrency(index: number) {
    setCurrencies((current) =>
      current.filter(
        (_, currentIndex) =>
          currentIndex !== index,
      ),
    );
  }

  function updateCurrency(
    index: number,
    field: keyof CurrencyRow,
    value: string,
  ) {
    setCurrencies((current) =>
      current.map((currency, currentIndex) =>
        currentIndex === index
          ? {
              ...currency,
              [field]: value,
            }
          : currency,
      ),
    );
  }

  return (
    <form
      action={createCampaign}
      className="space-y-7"
    >
      {campaignRaceIds.map((id) => (
        <input key={`campaign-race-${id}`} type="hidden" name="campaignRaceIds" value={id} />
      ))}
      {allowedRaceIds.map((id) => (
        <input key={`race-${id}`} type="hidden" name="allowedRaceIds" value={id} />
      ))}
      {selectedTagIds.map((id) => (
        <input key={`tag-${id}`} type="hidden" name="inventoryTagIds" value={id} />
      ))}
      {selectedItemIds.map((id) => (
        <input key={`item-${id}`} type="hidden" name="inventoryItemIds" value={id} />
      ))}

      {/* CAMPAIGN BASICS */}
      <section
        className="
          rounded-3xl
          border
          border-white/10
          bg-black/35
          p-6
          shadow-2xl
          backdrop-blur-md
          sm:p-8
        "
      >
        <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
          Campaign Foundation
        </p>

        <h2 className="font-sans mt-2 text-3xl text-slate-100">
          Campaign Basics
        </h2>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <Field
            label="Campaign Name"
            name="name"
            type="text"
          />

          <label className="block md:col-span-2">
            <span className="text-sm text-slate-300">
              Campaign Overview
            </span>
            <textarea
              name="overview"
              rows={8}
              className="mt-2 min-h-40 w-full resize-y rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-amber-300/50"
            />
            <small className="mt-2 block text-xs leading-5 text-slate-400">
              Player-visible introduction to the Campaign, its setting, premise, tone, and starting context.
            </small>
          </label>

          <Field
            label="Attribute Points"
            name="attributePoints"
            type="number"
          />

          <Field
            label="Skill Points"
            name="skillPoints"
            type="number"
          />

          <Field
            label="Max Starting Points per Skill"
            name="maxStartingSkill"
            type="number"
          />

          <Field
            label="Points Needed to Unlock Next Tier"
            name="pointsToUnlockNextTier"
            type="number"
          />

          <Field
            label="Max Points in a Standard Skill"
            name="maxPointsInSkill"
            type="number"
          />

          <Field
            label="Starting Credit Amount"
            name="startingCreditAmount"
            type="number"
          />
        </div>
      </section>

      {/* RACE AVAILABILITY */}
      <section
        className="
          rounded-3xl
          border
          border-white/10
          bg-black/35
          p-6
          shadow-2xl
          backdrop-blur-md
          sm:p-8
        "
      >
        <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
          Race Availability
        </p>
        <h2 className="font-sans mt-2 text-3xl text-slate-100">
          Campaign Race Workspace
        </h2>
        <div className="mt-5 flex flex-col gap-3">
          <input
            type="search"
            value={raceSearch}
            onChange={(event) => setRaceSearch(event.target.value)}
            placeholder="Search global races"
            className="w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-amber-300/50"
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <RaceAvailabilityColumn
            title="All Races"
            subtitle="Global active catalog"
            entries={filteredRaces}
            selectedIds={campaignRaceIds}
            onToggle={(id) => {
              if (campaignRaceIds.includes(id)) {
                removeCampaignRace(id);
              } else {
                addCampaignRace(id);
              }
            }}
            isSelectable={true}
          />

          <RaceAvailabilityColumn
            title="Campaign Races"
            subtitle="Campaign-world races"
            entries={filteredRaces.filter((entry) => campaignRaceIds.includes(entry.id))}
            selectedIds={campaignRaceIds}
            onToggle={(id) => {
              if (campaignRaceIds.includes(id)) {
                removeCampaignRace(id);
              } else {
                addCampaignRace(id);
              }
            }}
            isSelectable={true}
          />

          <RaceAvailabilityColumn
            title="Playable Races"
            subtitle="Player-selectable subset"
            entries={filteredRaces.filter((entry) => campaignRaceIds.includes(entry.id))}
            selectedIds={allowedRaceIds}
            onToggle={(id) => {
              togglePlayableRace(id);
            }}
            isSelectable={true}
          />
        </div>
      </section>

      {/* CAMPAIGN RULES */}
      <section
        className="
          rounded-3xl
          border
          border-white/10
          bg-black/35
          p-6
          shadow-2xl
          backdrop-blur-md
          sm:p-8
        "
      >
        <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
          Mechanical Rules
        </p>

        <h2 className="font-sans mt-2 text-3xl text-slate-100">
          Campaign Rules
        </h2>

        <div className="mt-7 grid gap-6 md:grid-cols-2">
          <label className="block">
            <span className="text-sm text-slate-300">
              Currency System
            </span>

            <select
              name="currencySystem"
              value={currencySystem}
              onChange={(event) =>
                setCurrencySystem(
                  event.target.value as
                    | "Credits"
                    | "Derived Currency",
                )
              }
              className="
                mt-2
                h-11
                w-full
                rounded-xl
                border
                border-white/15
                bg-black/50
                px-4
                text-sm
                text-slate-100
                outline-none
                transition
                focus:border-amber-300/50
              "
            >
              <option value="Credits">
                Credits
              </option>

              <option value="Derived Currency">
                Derived Currency
              </option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-slate-300">
              Fate Points
            </span>

            <select
              name="fatePointMethod"
              value={fateMethod}
              onChange={(event) =>
                setFateMethod(
                  event.target.value as
                    | "Assigned"
                    | "Rolled",
                )
              }
              className="
                mt-2
                h-11
                w-full
                rounded-xl
                border
                border-white/15
                bg-black/50
                px-4
                text-sm
                text-slate-100
                outline-none
                transition
                focus:border-amber-300/50
              "
            >
              <option value="Assigned">
                Assigned
              </option>

              <option value="Rolled">
                Rolled
              </option>
            </select>
          </label>
        </div>

        {fateMethod === "Assigned" && (
          <div className="mt-5 max-w-md">
            <Field
              label="Assigned Fate Points"
              name="assignedFatePoints"
              type="number"
            />
          </div>
        )}
      </section>

      {/* DERIVED CURRENCY */}
      {currencySystem ===
        "Derived Currency" && (
        <section
          className="
            rounded-3xl
            border
            border-white/10
            bg-black/35
            p-6
            shadow-2xl
            backdrop-blur-md
            sm:p-8
          "
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
                Economy
              </p>

              <h2 className="font-sans mt-2 text-3xl text-slate-100">
                Derived Currencies
              </h2>
            </div>

            <button
              type="button"
              onClick={addCurrency}
              className="
                rounded-full
                border
                border-amber-300/40
                bg-amber-300/10
                px-5
                py-2.5
                text-sm
                text-amber-100
                transition
                hover:border-amber-300/70
                hover:bg-amber-300/20
              "
            >
              + Add Currency
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {currencies.map(
              (currency, index) => (
                <div
                  key={index}
                  className="
                    rounded-2xl
                    border
                    border-white/10
                    bg-black/30
                    p-5
                  "
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-sans text-xl text-slate-100">
                      Currency {index + 1}
                    </h3>

                    {currencies.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeCurrency(index)
                        }
                        className="text-sm text-red-300 transition hover:text-red-200"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm text-slate-300">
                        Currency Name
                      </span>

                      <input
                        name="derivedCurrencyName"
                        value={currency.name}
                        onChange={(event) =>
                          updateCurrency(
                            index,
                            "name",
                            event.target.value,
                          )
                        }
                        required
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm text-slate-300">
                        Credits per Unit
                      </span>

                      <input
                        name="derivedCurrencyCreditsPerUnit"
                        type="number"
                        min="0.000001"
                        step="any"
                        value={
                          currency.creditsPerUnit
                        }
                        onChange={(event) =>
                          updateCurrency(
                            index,
                            "creditsPerUnit",
                            event.target.value,
                          )
                        }
                        required
                        className={inputClass}
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="text-sm text-slate-300">
                        Description
                      </span>

                      <textarea
                        name="derivedCurrencyDescription"
                        value={
                          currency.description
                        }
                        onChange={(event) =>
                          updateCurrency(
                            index,
                            "description",
                            event.target.value,
                          )
                        }
                        required
                        rows={3}
                        className={`${inputClass} h-auto py-3`}
                      />
                    </label>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* ALLOWED SYSTEMS */}
      <section
        className="
          rounded-3xl
          border
          border-white/10
          bg-black/35
          p-6
          shadow-2xl
          backdrop-blur-md
          sm:p-8
        "
      >
        <p className="text-xs uppercase tracking-[0.14em] text-purple-200">
          System Availability
        </p>

        <h2 className="font-sans mt-2 text-3xl text-slate-100">
          Allowed Systems
        </h2>

        <p className="mt-3 text-sm text-slate-400">
          Choose which Serrian Tide systems are
          available within this campaign.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGN_SYSTEM_OPTIONS.map(
            (system) => (
              <label
                key={system}
                className="
                  flex
                  cursor-pointer
                  items-center
                  gap-3
                  rounded-2xl
                  border
                  border-white/10
                  bg-black/30
                  px-4
                  py-4
                  transition
                  hover:border-amber-300/30
                  hover:bg-black/40
                "
              >
                <input
                  type="checkbox"
                  name="allowedSystems"
                  value={system}
                  className="h-4 w-4 accent-amber-300"
                />

                <span className="text-sm text-slate-300">
                  {system}
                </span>
              </label>
            ),
          )}
        </div>
      </section>

      <CampaignInventorySelector
        campaignId={null}
        tags={references.tags}
        selectedTagIds={selectedTagIds}
        selectedItemIds={selectedItemIds}
        onSelectedTagIdsChange={setSelectedTagIds}
        onSelectedItemIdsChange={setSelectedItemIds}
      />

      <section className="rounded-3xl border border-purple-300/15 bg-purple-950/10 p-6 text-sm leading-6 text-slate-400">
        <strong className="block text-slate-200">Players and Characters</strong>
        The Campaign must have a permanent identity before accounts and Characters can be linked.
        After creation, Campaign Control will open this Campaign directly so you can add Players,
        create Characters, and open the NPC workshop.
      </section>

      {/* SAVE */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <a
          href={getCampaignControlHref()}
          className="
            inline-flex
            items-center
            justify-center
            rounded-full
            border
            border-white/15
            bg-black/30
            px-6
            py-3
            text-sm
            text-slate-300
            transition
            hover:border-white/25
            hover:text-slate-100
          "
        >
          Cancel
        </a>

        <button
          type="submit"
          className="
            rounded-full
            border
            border-amber-300/50
            bg-amber-300/10
            px-7
            py-3
            font-semibold
            text-amber-100
            shadow-2xl
            transition
            hover:border-amber-300/80
            hover:bg-amber-300/20
            hover:shadow-2xl
          "
        >
          Create Campaign
        </button>
      </div>
    </form>
  );
}

const inputClass = `
  mt-2
  h-11
  w-full
  rounded-xl
  border
  border-white/15
  bg-black/50
  px-4
  text-sm
  text-slate-100
  outline-none
  transition
  focus:border-amber-300/50
`;

function RaceAvailabilityColumn({
  title,
  subtitle,
  entries,
  selectedIds,
  onToggle,
  isSelectable,
}: {
  title: string;
  subtitle: string;
  entries: CampaignReferenceData["races"];
  selectedIds: number[];
  onToggle: (id: number) => void;
  isSelectable: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 border-b border-white/10 pb-3">
        <p className="text-[0.64rem] uppercase tracking-[0.14em] text-purple-200">{title} <span className="ml-1 inline-grid min-w-5 place-items-center rounded-full border border-amber-300/25 px-1 text-[0.58rem] tracking-normal text-amber-100">{entries.length}</span></p>
        <h3 className="mt-2 text-lg text-slate-100">{subtitle}</h3>
      </div>
      <div className="campaign-race-list max-h-[52vh] overflow-y-auto pr-1 space-y-2">
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-slate-400">
            No races match this filter.
          </p>
        ) : (
          entries.map((race) => {
            const checked = selectedIds.includes(race.id);
            return (
              <button
                key={race.id}
                type="button"
                aria-pressed={checked}
                disabled={!isSelectable}
                onClick={() => onToggle(race.id)}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  checked
                    ? "border-amber-300/35 bg-amber-300/10"
                    : "border-white/10 bg-black/30 hover:border-amber-300/25"
                }`}
              >
                <span className="min-w-0 text-left">
                  <strong className="block text-sm text-slate-100">{race.name}</strong>
                  <small className="mt-1 block text-xs text-slate-300">{race.size || "Size not recorded"}</small>
                </span>
                <small className="ml-auto shrink-0 text-xs text-slate-400">{checked ? "Selected" : "Available"}</small>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type,
}: {
  label: string;
  name: string;
  type: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-300">
        {label}
      </span>

      <input
        name={name}
        type={type}
        required
        min={
          type === "number"
            ? "0"
            : undefined
        }
        step={
          type === "number"
            ? "any"
            : undefined
        }
        className={inputClass}
      />
    </label>
  );
}

