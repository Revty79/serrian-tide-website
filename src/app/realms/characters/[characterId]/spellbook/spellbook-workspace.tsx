"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { CharacterSavedSpell } from "@/app/characters/spell-actions";
import { SpellCastingPanel } from "@/app/characters/spell-casting-panel";
import { SpellPreview } from "@/app/heavens/skills/spell-preview";
import {
  resolveCharacterSpellCastingContext,
  type CharacterSpellCastingContext,
} from "@/features/characters/character-spell-casting";
import type { CharacterAggregate } from "@/features/characters/models";
import { getSpellFrameworkName } from "@/features/spell-construction/data/spellIdentity";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { validateSpell } from "@/features/spell-construction/engine/validateSpell";
import {
  SPELL_CASTING_SYSTEMS,
  type SpellCastingSystem,
  type SpellDocument,
} from "@/features/spell-construction/models/spell";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import { authClient } from "@/lib/auth-client";

type SpellbookEntry = {
  key: string;
  source: "catalog" | "personal";
  sourceLabel: string;
  document: SpellDocument;
  allocationId?: number;
};

type OrganizedSpellbookEntry = SpellbookEntry & {
  castingContext: CharacterSpellCastingContext | null;
};

export function knownCatalogSpells(
  aggregate: CharacterAggregate,
): SpellbookEntry[] {
  const skillsById = new Map(
    aggregate.skillCatalog.map((skill) => [skill.id, skill]),
  );
  const entries: SpellbookEntry[] = [];
  for (const allocation of aggregate.skillAllocations) {
    if (allocation.points <= 0) continue;
    const skill = skillsById.get(allocation.skillId);
    if (!skill?.spellDocumentJson) continue;
    try {
      entries.push({
        key: `catalog:${allocation.id}`,
        source: "catalog",
        sourceLabel: "Known Catalog Spell",
        document: parseSpellDocument(skill.spellDocumentJson),
        allocationId: allocation.id,
      });
    } catch {
      // A damaged master Spell remains hidden instead of breaking the full book.
    }
  }
  return entries;
}

function personalSpellbookSpells(spells: CharacterSavedSpell[]): SpellbookEntry[] {
  return spells
    .filter(({ inSpellbook }) => inSpellbook)
    .map((saved) => ({
      key: `personal:${saved.id}`,
      source: "personal" as const,
      sourceLabel: "Personal Spell",
      document: saved.document,
    }));
}

export function SpellbookWorkspace({
  aggregate,
  initialSpells,
}: {
  aggregate: CharacterAggregate;
  initialSpells: CharacterSavedSpell[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [activeSystem, setActiveSystem] =
    useState<SpellCastingSystem>("Spellcraft");

  const entries = useMemo(
    () => [
      ...knownCatalogSpells(aggregate),
      ...personalSpellbookSpells(initialSpells),
    ].sort((left, right) =>
      left.document.name.localeCompare(right.document.name),
    ),
    [aggregate, initialSpells],
  );
  const organizedEntries = useMemo<OrganizedSpellbookEntry[]>(
    () => entries.map((entry) => ({
      ...entry,
      castingContext: resolveCharacterSpellCastingContext(
        aggregate,
        entry.document,
        entry.allocationId,
      ),
    })),
    [aggregate, entries],
  );
  const activeEntries = useMemo(
    () => organizedEntries.filter(
      ({ castingContext }) => castingContext?.system === activeSystem,
    ),
    [activeSystem, organizedEntries],
  );
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return activeEntries;
    return activeEntries.filter(({ document, sourceLabel }) => [
      document.name,
      document.tradition,
      getSpellFrameworkName(document),
      document.description,
      sourceLabel,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [activeEntries, search]);
  const selected = filteredEntries.find(({ key }) => key === selectedKey)
    ?? filteredEntries[0];
  const unassignedCount = organizedEntries.filter(
    ({ castingContext }) => !castingContext,
  ).length;

  const calculation = selected ? calculateSpell(selected.document) : null;
  const validation = selected && calculation
    ? validateSpell(selected.document, undefined, calculation)
    : null;
  const castingContext = selected?.castingContext ?? null;

  return (
    <main className="spell-player-page">
      <div className="spell-player-page__texture" aria-hidden="true" />
      <header className="spell-player-header">
        <Link href="/realms" className="font-evanescent spell-player-header__brand">
          SERRIAN<br />TIDE
        </Link>
        <div className="spell-player-header__title">
          <p>THE REALMS · CHARACTER MAGIC</p>
          <h1>Spellbook</h1>
          <span>{aggregate.character.name} · {aggregate.campaign.name}</span>
        </div>
        <div className="spell-player-header__actions">
          <Link href={`/realms/characters/${aggregate.character.id}/magic`}>Magic Calculator</Link>
          <Link href="/realms">Return to Realms</Link>
          <button
            type="button"
            onClick={() => void authClient.signOut().then(() => {
              router.replace("/login");
              router.refresh();
            })}
          >
            Log Out
          </button>
        </div>
      </header>

      <div className="spellbook-system-layout">
        <nav
          className="spellbook-system-tabs"
          aria-label="Spellbook magic systems"
          role="tablist"
        >
          {SPELL_CASTING_SYSTEMS.map((system) => {
            const count = organizedEntries.filter(
              ({ castingContext: context }) => context?.system === system,
            ).length;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={activeSystem === system}
                className={activeSystem === system ? "is-active" : ""}
                key={system}
                onClick={() => {
                  setActiveSystem(system);
                  setSelectedKey("");
                }}
              >
                <span>{system}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </nav>

        <div className="spell-player-workspace spell-player-workspace--book">
          <aside className="spellbook-library">
            <div className="spell-player-section-heading">
              <div>
                <p>KNOWN MAGIC</p>
                <h3>{entries.length} {entries.length === 1 ? "Spell" : "Spells"}</h3>
              </div>
            </div>
            <label className="spell-player-search">
              <span>Search {activeSystem}</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or framework"
              />
            </label>
            {unassignedCount > 0 ? (
              <p className="spellbook-library__warning">
                {unassignedCount} personal {unassignedCount === 1 ? "Spell needs" : "Spells need"}
                {" "}a casting system selected in the Magic Calculator.
              </p>
            ) : null}
            <div className="spellbook-library__list">
              {filteredEntries.length === 0 ? (
                <p className="spell-player-empty">
                  {entries.length === 0
                    ? "This Character does not know any Spells yet."
                    : search.trim()
                      ? `No ${activeSystem} Spells match this search.`
                      : `This Character has no ${activeSystem} Spells.`}
                </p>
              ) : filteredEntries.map((entry) => {
                const spellCalculation = calculateSpell(entry.document);
                return (
                  <button
                    type="button"
                    key={entry.key}
                    className={entry.key === selected?.key ? "is-active" : ""}
                    onClick={() => setSelectedKey(entry.key)}
                  >
                    <span>{entry.sourceLabel}</span>
                    <strong>{entry.document.name.trim() || "Untitled Spell"}</strong>
                    <small>
                      {getSpellFrameworkName(entry.document) || entry.document.tradition}
                      {" · "}{spellCalculation.baseSpellManaCost} Mana
                      {" · "}{spellCalculation.baseSpellMastery}
                    </small>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="spellbook-detail">
            {selected && calculation && validation ? (
              <>
                <div className="spellbook-detail__source">
                  <span>
                    {selected.sourceLabel}
                    {castingContext ? ` · ${castingContext.system}` : ""}
                  </span>
                  <strong>{selected.document.name.trim() || "Untitled Spell"}</strong>
                </div>
                <SpellCastingPanel
                  spell={selected.document}
                  practitionerLevel={castingContext?.profile.spellAccessLevel ?? undefined}
                  castingSystem={castingContext?.system}
                  manaPool={castingContext?.profile.manaPool}
                  automaticKnownSpell
                />
                <article className="skill-preview spellbook-detail__preview">
                  <SpellPreview
                    spell={selected.document}
                    calculation={calculation}
                    validation={validation}
                  />
                </article>
              </>
            ) : (
              <div className="spell-player-empty spell-player-empty--large">
                <h2>No {activeSystem} Spells</h2>
                <p>Choose another magic-system tab, or add a personal Spell from the Magic Calculator.</p>
                <Link href={`/realms/characters/${aggregate.character.id}/magic`}>Open Magic Calculator</Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
