"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteCharacterSpell,
  duplicateCharacterSpellDocument,
  listPlayerSpellFrameworkSkills,
  saveCharacterSpell,
  setCharacterSpellbookStatus,
  type CharacterSavedSpell,
} from "@/app/characters/spell-actions";
import { SpellCastingPanel } from "@/app/characters/spell-casting-panel";
import { SpellConstructionEditor } from "@/app/heavens/skills/spell-construction-editor";
import { getAvailableSpellCastingContexts } from "@/features/characters/character-spell-casting";
import type { CharacterAggregate } from "@/features/characters/models";
import { getSpellFrameworkName } from "@/features/spell-construction/data/spellIdentity";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import type {
  SpellCastingSystem,
  SpellDocument,
  Tradition,
} from "@/features/spell-construction/models/spell";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { authClient } from "@/lib/auth-client";

type PendingCalculatorAction =
  | { kind: "new" }
  | { kind: "open"; savedSpellId: number }
  | { kind: "spellbook" }
  | { kind: "realms" }
  | { kind: "logout" }
  | { kind: "navigate"; href: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The Spell could not be saved.";
}

export function MagicWorkspace({
  aggregate,
  initialSpells,
  initialSpellId,
}: {
  aggregate: CharacterAggregate;
  initialSpells: CharacterSavedSpell[];
  initialSpellId?: number;
}) {
  const router = useRouter();
  const initialSaved = initialSpells.find(({ id }) => id === initialSpellId) ?? null;
  const [savedSpells, setSavedSpells] = useState(initialSpells);
  const [document, setDocument] = useState<SpellDocument>(() =>
    initialSaved ? structuredClone(initialSaved.document) : createEmptySpell(),
  );
  const [selectedSavedId, setSelectedSavedId] = useState<number | null>(initialSaved?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingCalculatorAction | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeClosing = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeClosing);
    return () => window.removeEventListener("beforeunload", warnBeforeClosing);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const protectInternalNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingAction({
        kind: "navigate",
        href: `${destination.pathname}${destination.search}${destination.hash}`,
      });
    };
    window.document.addEventListener("click", protectInternalNavigation, true);
    return () => window.document.removeEventListener("click", protectInternalNavigation, true);
  }, [dirty]);

  const findFrameworkSkills = useCallback(
    (tradition: Tradition) =>
      listPlayerSpellFrameworkSkills(aggregate.character.id, tradition),
    [aggregate.character.id],
  );
  const selectedSaved = savedSpells.find(({ id }) => id === selectedSavedId) ?? null;
  const filteredSpells = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return savedSpells.filter(({ document: spell, inSpellbook }) =>
      !query || [
        spell.name,
        spell.tradition,
        getSpellFrameworkName(spell),
        inSpellbook ? "spellbook" : "draft",
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [savedSpells, search]);
  const availableCastingContexts = useMemo(
    () => getAvailableSpellCastingContexts(aggregate, document),
    [aggregate, document],
  );
  const activeDocument = useMemo(() =>
    document.castingSystem || availableCastingContexts.length !== 1
      ? document
      : { ...document, castingSystem: availableCastingContexts[0]!.system },
  [availableCastingContexts, document]);
  const calculation = useMemo(
    () => calculateSpell(activeDocument),
    [activeDocument],
  );

  function startNewSpell() {
    setDocument(createEmptySpell());
    setSelectedSavedId(null);
    setDirty(false);
    setFeedback(null);
  }

  function loadSpell(saved: CharacterSavedSpell) {
    setDocument(structuredClone(saved.document));
    setSelectedSavedId(saved.id);
    setDirty(false);
    setFeedback(null);
  }

  async function performAction(action: PendingCalculatorAction) {
    if (action.kind === "new") startNewSpell();
    if (action.kind === "open") {
      const saved = savedSpells.find(({ id }) => id === action.savedSpellId);
      if (saved) loadSpell(saved);
    }
    if (action.kind === "spellbook") {
      router.push(`/realms/characters/${aggregate.character.id}/spellbook`);
    }
    if (action.kind === "realms") router.push("/realms");
    if (action.kind === "navigate") router.push(action.href);
    if (action.kind === "logout") {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    }
  }

  function requestAction(action: PendingCalculatorAction) {
    if (dirty) setPendingAction(action);
    else void performAction(action);
  }

  function discardAndContinue() {
    const action = pendingAction;
    setPendingAction(null);
    setDirty(false);
    if (action) void performAction(action);
  }

  function changeDocument(next: SpellDocument) {
    setDocument(next);
    setDirty(true);
    setFeedback(null);
  }

  function mergeSaved(saved: CharacterSavedSpell) {
    setSavedSpells((current) => [
      saved,
      ...current.filter(({ id }) => id !== saved.id),
    ]);
  }

  async function saveSpell(addToSpellbook: boolean) {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveCharacterSpell(
        aggregate.character.id,
        activeDocument,
        addToSpellbook,
      );
      mergeSaved(saved);
      setDocument(saved.document);
      setSelectedSavedId(saved.id);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: addToSpellbook
          ? `${saved.name.trim() || "Untitled Spell"} was saved and added to ${aggregate.character.name}'s Spellbook.`
          : `${saved.name.trim() || "Untitled Spell"} was saved as a personal Spell.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleSpellbook() {
    if (!selectedSaved || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = selectedSaved.inSpellbook
        ? await setCharacterSpellbookStatus(
            aggregate.character.id,
            selectedSaved.id,
            false,
          )
        : await saveCharacterSpell(aggregate.character.id, activeDocument, true);
      mergeSaved(saved);
      setDocument(saved.document);
      setSelectedSavedId(saved.id);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: saved.inSpellbook
          ? `${saved.name.trim() || "Untitled Spell"} was added to the Spellbook.`
          : `${saved.name.trim() || "Untitled Spell"} remains saved but was removed from the Spellbook.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSpell() {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await duplicateCharacterSpellDocument(
        aggregate.character.id,
        activeDocument,
      );
      mergeSaved(saved);
      setDocument(saved.document);
      setSelectedSavedId(saved.id);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: `${saved.name} was created as an independent draft.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSpell() {
    if (!selectedSaved || saving) return;
    if (!window.confirm(
      `Permanently delete ${selectedSaved.name.trim() || "this saved Spell"}?`,
    )) return;
    setSaving(true);
    setFeedback(null);
    try {
      await deleteCharacterSpell(aggregate.character.id, selectedSaved.id);
      setSavedSpells((current) =>
        current.filter(({ id }) => id !== selectedSaved.id),
      );
      setDocument(createEmptySpell());
      setSelectedSavedId(null);
      setDirty(false);
      setFeedback({ kind: "success", message: "The saved Spell was deleted." });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="spell-player-page">
      <div className="spell-player-page__texture" aria-hidden="true" />
      <header className="spell-player-header">
        <Link href="/realms" className="font-evanescent spell-player-header__brand">
          SERRIAN<br />TIDE
        </Link>
        <div className="spell-player-header__title">
          <p>THE REALMS · SPELL CONSTRUCTION</p>
          <h1>Magic Calculator</h1>
          <span>{aggregate.character.name} · {aggregate.campaign.name}</span>
        </div>
        <div className="spell-player-header__actions">
          <button type="button" onClick={() => requestAction({ kind: "spellbook" })}>Spellbook</button>
          <button type="button" onClick={() => requestAction({ kind: "realms" })}>Return to Realms</button>
          <button type="button" onClick={() => requestAction({ kind: "logout" })}>Log Out</button>
        </div>
      </header>

      <div className="spell-player-workspace spell-player-workspace--calculator">
        <aside className="spell-calculator-library">
          <div className="spell-player-section-heading">
            <div><p>PERSONAL FORMULAE</p><h3>Saved Spells</h3></div>
            <button type="button" onClick={() => requestAction({ kind: "new" })}>New Spell</button>
          </div>
          <label className="spell-player-search">
            <span>Search Saved Spells</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, type, or framework"
            />
          </label>
          <div className="spell-calculator-library__list">
            {filteredSpells.length === 0 ? (
              <p className="spell-player-empty">No personal Spells have been saved yet.</p>
            ) : filteredSpells.map((saved) => {
              const savedCalculation = calculateSpell(saved.document);
              return (
                <button
                  type="button"
                  key={saved.id}
                  className={saved.id === selectedSavedId ? "is-active" : ""}
                  onClick={() => requestAction({ kind: "open", savedSpellId: saved.id })}
                >
                  <span>{saved.inSpellbook ? "IN SPELLBOOK" : "SAVED DRAFT"}</span>
                  <strong>{saved.name.trim() || "Untitled Spell"}</strong>
                  <small>{savedCalculation.baseSpellManaCost} Mana · {savedCalculation.baseSpellMastery}</small>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="spell-calculator-editor">
          {feedback ? (
            <p
              className={`spell-player-feedback is-${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          ) : null}
          <div className="spell-calculator-toolbar">
            <div>
              <span>{selectedSaved
                ? selectedSaved.inSpellbook
                  ? "SAVED · IN SPELLBOOK"
                  : "SAVED DRAFT"
                : "UNSAVED FORMULA"}</span>
              <strong>{dirty ? "Unsaved changes" : "Current"}</strong>
            </div>
            <div>
              <button type="button" disabled={saving} onClick={() => void saveSpell(false)}>{saving ? "Saving…" : "Save Spell"}</button>
              <button type="button" disabled={saving} onClick={() => void saveSpell(true)}>Save &amp; Add to Spellbook</button>
              {selectedSaved ? (
                <button type="button" disabled={saving} onClick={() => void toggleSpellbook()}>
                  {selectedSaved.inSpellbook ? "Remove from Spellbook" : "Add to Spellbook"}
                </button>
              ) : null}
              <button type="button" disabled={saving} onClick={() => void duplicateSpell()}>Duplicate</button>
              {selectedSaved ? <button className="is-danger" type="button" disabled={saving} onClick={() => void deleteSpell()}>Delete</button> : null}
            </div>
          </div>

          <label className="spell-calculator-name">
            <span>Spell Name</span>
            <input
              value={activeDocument.name}
              placeholder="Untitled Spell"
              onChange={(event) => changeDocument({
                ...activeDocument,
                name: event.target.value,
                modifiedAt: new Date().toISOString(),
              })}
            />
          </label>

          <label className="spell-calculator-casting-system">
            <span>Casting System</span>
            {activeDocument.tradition === "Spellcraft/Talismanism/Faith" ? (
              <select
                value={activeDocument.castingSystem ?? ""}
                onChange={(event) => changeDocument({
                  ...activeDocument,
                  castingSystem: event.target.value
                    ? event.target.value as SpellCastingSystem
                    : undefined,
                  modifiedAt: new Date().toISOString(),
                })}
              >
                <option value="">Choose Spellcraft, Talismanism, or Faith</option>
                {activeDocument.castingSystem && !availableCastingContexts.some(
                  ({ system }) => system === activeDocument.castingSystem,
                ) ? (
                  <option value={activeDocument.castingSystem}>
                    {activeDocument.castingSystem} (not currently available)
                  </option>
                ) : null}
                {availableCastingContexts.map(({ system, profile }) => (
                  <option key={system} value={system}>
                    {system} · {profile.spellAccessLevel ?? "No caster level"} · {profile.manaPool} Mana
                  </option>
                ))}
              </select>
            ) : (
              <strong>{activeDocument.castingSystem ?? (
                activeDocument.tradition === "Psionics" ? "Psyonics" : "Bardic Resonance"
              )}</strong>
            )}
            <small>{activeDocument.tradition === "Spellcraft/Talismanism/Faith"
              ? "This keeps Sphere magic tied to the Character's correct Spellcraft, Talismanism, or Faith tree."
              : "This magic type determines the Character's caster level and Mana pool."}</small>
          </label>

          <SpellCastingPanel
            spell={activeDocument}
            practitionerLevel={activeDocument.practitionerLevel}
            onPractitionerLevelChange={(practitionerLevel) => changeDocument({
              ...activeDocument,
              practitionerLevel,
              modifiedAt: new Date().toISOString(),
            })}
          />

          <div className="spell-calculator-editor__builder">
            <SpellConstructionEditor
              document={activeDocument}
              onChange={changeDocument}
              findFrameworkSkills={findFrameworkSkills}
            />
          </div>

          <div className="spell-calculator-save-footer">
            <span>Current base cost: <strong>{calculation.baseSpellManaCost} Mana</strong> · {calculation.baseSpellMastery}</span>
            <button type="button" disabled={saving} onClick={() => void saveSpell(false)}>{saving ? "Saving…" : "Save Spell"}</button>
            <button type="button" disabled={saving} onClick={() => void saveSpell(true)}>Save &amp; Add to Spellbook</button>
          </div>
        </section>
      </div>

      {pendingAction ? (
        <div
          className="skills-page__discard-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="discard-spell-title"
        >
          <div>
            <p id="discard-spell-title">Unsaved changes</p>
            <span>Leave this Spell and discard the changes you have not saved?</span>
          </div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPendingAction(null)}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
