"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  duplicateCharacterSpell,
  setCharacterSpellbookStatus,
  type CharacterSavedSpell,
} from "@/app/characters/spell-actions";
import { SpellCastingPanel } from "@/app/characters/spell-casting-panel";
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

type SpellbookEntry = {
  key: string;
  source: "catalog" | "personal";
  sourceLabel: string;
  document: SpellDocument;
  allocationId?: number;
  savedSpell?: CharacterSavedSpell;
  known: boolean;
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
        known: true,
      });
    } catch {
      // One damaged catalog document must not prevent the rest of the book loading.
    }
  }
  return entries;
}

function personalSpellEntries(
  spells: CharacterSavedSpell[],
  showDrafts: boolean,
): SpellbookEntry[] {
  return spells
    .filter((spell) => showDrafts || spell.inSpellbook)
    .map((savedSpell) => ({
      key: `personal:${savedSpell.id}`,
      source: "personal" as const,
      sourceLabel: savedSpell.inSpellbook ? "Personal Spell" : "Personal Draft",
      document: savedSpell.document,
      savedSpell,
      known: savedSpell.inSpellbook,
    }));
}

export function SpellbookWorkspace({
  aggregate,
  initialSpells,
}: {
  aggregate: CharacterAggregate;
  initialSpells: CharacterSavedSpell[];
}) {
  const [spells, setSpells] = useState(initialSpells);
  const [showDrafts, setShowDrafts] = useState(false);
  const [activeSystem, setActiveSystem] =
    useState<SpellCastingSystem>("Spellcraft");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const entries = useMemo(
    () =>
      [
        ...knownCatalogSpells(aggregate),
        ...personalSpellEntries(spells, showDrafts),
      ].sort((left, right) =>
        left.document.name.localeCompare(right.document.name),
      ),
    [aggregate, showDrafts, spells],
  );
  const organizedEntries = useMemo<OrganizedSpellbookEntry[]>(
    () =>
      entries.map((entry) => ({
        ...entry,
        castingContext: resolveCharacterSpellCastingContext(
          aggregate,
          entry.document,
          entry.allocationId,
        ),
      })),
    [aggregate, entries],
  );
  const systemEntries = useMemo(
    () =>
      organizedEntries.filter(
        ({ castingContext }) => castingContext?.system === activeSystem,
      ),
    [activeSystem, organizedEntries],
  );
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return systemEntries;
    return systemEntries.filter(({ document, sourceLabel }) =>
      [
        document.name,
        document.tradition,
        getSpellFrameworkName(document),
        document.description,
        sourceLabel,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [search, systemEntries]);
  const selected =
    filteredEntries.find(({ key }) => key === selectedKey) ?? filteredEntries[0];
  const unassignedCount = organizedEntries.filter(
    ({ castingContext }) => !castingContext,
  ).length;

  async function toggle(spell: CharacterSavedSpell) {
    setBusyId(spell.id);
    setFeedback(null);
    try {
      const saved = await setCharacterSpellbookStatus(
        aggregate.character.id,
        spell.id,
        !spell.inSpellbook,
      );
      setSpells((current) =>
        current.map((entry) => (entry.id === saved.id ? saved : entry)),
      );
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Spellbook status could not be changed.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(spell: CharacterSavedSpell) {
    setBusyId(spell.id);
    setFeedback(null);
    try {
      const saved = await duplicateCharacterSpell(
        aggregate.character.id,
        spell.id,
      );
      setSpells((current) =>
        [...current, saved].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      setFeedback({
        kind: "success",
        message: `${saved.name} was copied into personal drafts.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The Spell could not be duplicated.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const selectedCalculation = selected
    ? calculateSpell(selected.document)
    : null;
  const selectedValidation = selectedCalculation
    ? validateSpell(selected.document, undefined, selectedCalculation)
    : null;

  return (
    <main className="spellbook-page">
      <header className="spellbook-header">
        <Link href="/realms" className="font-evanescent spellbook-logo">
          SERRIAN<br />TIDE
        </Link>
        <div>
          <p>THE REALMS / SPELLBOOK</p>
          <h1 className="font-portcullion">{aggregate.character.name}</h1>
          <span>{aggregate.campaign.name}</span>
        </div>
        <nav>
          <Link href={`/realms/characters/${aggregate.character.id}`}>
            Character Sheet
          </Link>
          <Link href={`/realms/characters/${aggregate.character.id}/magic`}>
            Magic Calculator
          </Link>
        </nav>
      </header>

      <section className="spellbook-toolbar">
        <div>
          <p>CHARACTER MAGIC</p>
          <h2 className="font-portcullion">Spellbook</h2>
        </div>
        <label>
          <input
            type="checkbox"
            checked={showDrafts}
            onChange={(event) => setShowDrafts(event.target.checked)}
          />
          <span>Show personal drafts too</span>
        </label>
      </section>
      {feedback ? (
        <p className={`spellbook-feedback is-${feedback.kind}`}>
          {feedback.message}
        </p>
      ) : null}

      <nav
        className="spellbook-system-tabs"
        aria-label="Spellbook magic systems"
        role="tablist"
      >
        {SPELL_CASTING_SYSTEMS.map((system) => {
          const count = organizedEntries.filter(
            ({ castingContext }) => castingContext?.system === system,
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

      <div className="spellbook-workspace">
        <aside className="spellbook-library">
          <div className="spellbook-library__heading">
            <div>
              <p>KNOWN MAGIC</p>
              <h3>{entries.length} {entries.length === 1 ? "Spell" : "Spells"}</h3>
            </div>
          </div>
          <label className="spellbook-search">
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
            {filteredEntries.length ? (
              filteredEntries.map((entry) => {
                const calculation = calculateSpell(entry.document);
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
                      {" · "}{calculation.baseSpellManaCost} Mana
                      {" · "}{calculation.baseSpellMastery}
                    </small>
                  </button>
                );
              })
            ) : (
              <p className="spellbook-empty-list">
                {entries.length === 0
                  ? "This Character does not know any Spells yet."
                  : search.trim()
                    ? `No ${activeSystem} Spells match this search.`
                    : `This Character has no ${activeSystem} Spells.`}
              </p>
            )}
          </div>
        </aside>

        <section className="spellbook-detail">
          {selected && selectedCalculation && selectedValidation ? (
            <>
              <header className="spellbook-detail__header">
                <div>
                  <p>
                    {selected.sourceLabel}
                    {selected.castingContext
                      ? ` · ${selected.castingContext.system}`
                      : ""}
                  </p>
                  <h3 className="font-portcullion">
                    {selected.document.name.trim() || "Untitled Spell"}
                  </h3>
                  <span>
                    {getSpellFrameworkName(selected.document) ||
                      selected.document.tradition}
                  </span>
                </div>
                <strong className={`is-${selectedValidation.status.toLowerCase()}`}>
                  {selectedValidation.status}
                </strong>
              </header>
              {selected.known ? (
                <SpellCastingPanel
                  spell={selected.document}
                  practitionerLevel={
                    selected.castingContext?.profile.spellAccessLevel ?? undefined
                  }
                  castingSystem={selected.castingContext?.system}
                  manaPool={selected.castingContext?.profile.manaPool}
                  automaticKnownSpell
                />
              ) : (
                <p className="spellbook-draft-note">
                  This is a saved construction draft. Add it to the Spellbook to
                  make the Character-specific known-Spell casting calculation active.
                </p>
              )}
              <div className="spellbook-facts">
                <div><span>Mana</span><strong>{selectedCalculation.baseSpellManaCost}</strong></div>
                <div><span>Mastery</span><strong>{selectedCalculation.baseSpellMastery}</strong></div>
                <div><span>Combat</span><strong>{selectedCalculation.baseCombatCastingTime} Init</strong></div>
                <div><span>OOC</span><strong>{selectedCalculation.baseOutOfCombatCastingTimeSeconds}s</strong></div>
              </div>
              <p className="spellbook-detail__description">
                {selected.document.description || "No description."}
              </p>
              <div className="spellbook-card-actions">
                <Link
                  href={
                    selected.savedSpell
                      ? `/realms/characters/${aggregate.character.id}/magic?spell=${selected.savedSpell.id}`
                      : `/realms/characters/${aggregate.character.id}/magic`
                  }
                >
                  Open in Calculator
                </Link>
                {selected.savedSpell ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === selected.savedSpell.id}
                      onClick={() => void duplicate(selected.savedSpell!)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === selected.savedSpell.id}
                      onClick={() => void toggle(selected.savedSpell!)}
                    >
                      {selected.savedSpell.inSpellbook
                        ? "Remove from Spellbook"
                        : "Add to Spellbook"}
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="spellbook-empty spellbook-empty--detail">
              <p>NO {activeSystem.toUpperCase()} SPELLS</p>
              <h3>Choose another magic-system tab or add a personal Spell.</h3>
              <Link href={`/realms/characters/${aggregate.character.id}/magic`}>
                Open Magic Calculator →
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
