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
  const [selectedRaceIds, setSelectedRaceIds] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const filteredRaces = useMemo(() => {
    const search = raceSearch.trim().toLocaleLowerCase();
    return search
      ? references.races.filter((entry) =>
          [entry.name, entry.size].some((value) =>
            value.toLocaleLowerCase().includes(search),
          ),
        )
      : references.races;
  }, [raceSearch, references.races]);

  function toggleId(
    id: number,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
  ) {
    setSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((candidate) => candidate !== id)
        : [...selectedIds, id],
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
      {selectedRaceIds.map((id) => (
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

      {/* ALLOWED RACES */}
      <section className={sectionClass}>
        <SelectionHeading
          eyebrow="Character Creation"
          title="Allowed Races"
          count={`${selectedRaceIds.length} selected`}
          onSelectAll={() => setSelectedRaceIds(references.races.map(({ id }) => id))}
          onClear={() => setSelectedRaceIds([])}
          disableSelectAll={references.races.length === 0}
          disableClear={selectedRaceIds.length === 0}
        />

        <p className="mt-3 text-sm leading-6 text-slate-400">
          Players can only choose Races authorized here when creating a Character.
        </p>

        <SearchField
          label="Search the Race catalog"
          value={raceSearch}
          placeholder="Name or size"
          onChange={setRaceSearch}
        />

        <div className="mt-5 grid max-h-[32rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRaces.map((entry) => {
            const selected = selectedRaceIds.includes(entry.id);
            return (
              <label key={entry.id} className={selectionClass(selected)}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    toggleId(entry.id, selectedRaceIds, setSelectedRaceIds)
                  }
                  className="h-4 w-4 accent-amber-300"
                />
                <span>
                  <strong className="block text-sm text-slate-100">{entry.name}</strong>
                  <small className="mt-1 block text-xs text-slate-300">
                    {entry.size || "Size not recorded"}
                  </small>
                </span>
              </label>
            );
          })}
          {filteredRaces.length === 0 ? (
            <p className="text-sm text-slate-300">No Races match that search.</p>
          ) : null}
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
            shadow-[0_0_30px_rgba(251,191,36,0.08)]
            transition
            hover:border-amber-300/80
            hover:bg-amber-300/20
            hover:shadow-[0_0_35px_rgba(251,191,36,0.18)]
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

const sectionClass = `
  rounded-3xl
  border
  border-white/10
  bg-black/35
  p-6
  shadow-2xl
  backdrop-blur-md
  sm:p-8
`;

function selectionClass(selected: boolean) {
  return `flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
    selected
      ? "border-amber-300/35 bg-amber-300/10"
      : "border-white/10 bg-black/30 hover:border-amber-300/25"
  }`;
}

function SelectionHeading({
  eyebrow,
  title,
  count,
  onSelectAll,
  onClear,
  disableSelectAll,
  disableClear,
}: {
  eyebrow: string;
  title: string;
  count: string;
  onSelectAll: () => void;
  onClear: () => void;
  disableSelectAll: boolean;
  disableClear: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-purple-200">{eyebrow}</p>
        <h2 className="font-sans mt-2 text-3xl text-slate-100">{title}</h2>
        <span className="mt-2 block text-xs text-slate-300">{count}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disableSelectAll}
          onClick={onSelectAll}
          className="rounded-full border border-amber-300/30 px-4 py-2 text-xs text-amber-100 disabled:opacity-40"
        >
          Select All
        </button>
        <button
          type="button"
          disabled={disableClear}
          onClick={onClear}
          className="rounded-full border border-white/15 px-4 py-2 text-xs text-slate-300 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function SearchField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block max-w-xl">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}
