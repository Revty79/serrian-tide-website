"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import {
  deleteCharacterSpell,
  duplicateCharacterSpell,
  listPlayerSpellFrameworkSkills,
  saveCharacterSpell,
  type CharacterSavedSpell,
} from "@/app/characters/spell-actions";
import { SpellConstructionEditor } from "@/app/heavens/skills/spell-construction-editor";
import { getCharacterManaProfiles } from "@/features/characters/character-rules";
import type { CharacterAggregate } from "@/features/characters/models";
import type { SpellCastingSystem, SpellDocument, Tradition } from "@/features/spell-construction/models/spell";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";

export function MagicWorkspace({
  aggregate,
  initialSpells,
  initialSpellId,
}: {
  aggregate: CharacterAggregate;
  initialSpells: CharacterSavedSpell[];
  initialSpellId?: number;
}) {
  const initialSaved = initialSpells.find(({ id }) => id === initialSpellId) ?? null;
  const [spells, setSpells] = useState(initialSpells);
  const [savedSpellId, setSavedSpellId] = useState<number | null>(initialSaved?.id ?? null);
  const [document, setDocument] = useState<SpellDocument>(() => initialSaved?.document ?? createEmptySpell());
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const manaProfiles = useMemo(() => getCharacterManaProfiles(
    {
      skillAllocations: aggregate.skillAllocations.map((allocation) => ({
        draftId: allocation.id,
        skillId: allocation.skillId,
        parentDraftId: allocation.parentAllocationId,
        points: allocation.points,
      })),
    },
    aggregate.skillCatalog,
    aggregate.selectedRace,
  ), [aggregate]);

  const availableSystems = new Set<SpellCastingSystem>(manaProfiles.map(({ system }) => system));
  const compatibleSystems: SpellCastingSystem[] = document.tradition === "Psionics"
    ? ["Psyonics"]
    : document.tradition === "Bardic Resonance"
      ? ["Bardic Resonance"]
      : ["Spellcraft", "Talismanism", "Faith"];

  const findFrameworkSkills = useCallback(
    (tradition: Tradition) => listPlayerSpellFrameworkSkills(aggregate.character.id, tradition),
    [aggregate.character.id],
  );

  function newSpell() {
    setSavedSpellId(null);
    setDocument(createEmptySpell());
    setFeedback(null);
  }

  function openSpell(spell: CharacterSavedSpell) {
    setSavedSpellId(spell.id);
    setDocument(spell.document);
    setFeedback(null);
  }

  async function persist(addToSpellbook: boolean) {
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveCharacterSpell(aggregate.character.id, document, addToSpellbook);
      setDocument(saved.document);
      setSavedSpellId(saved.id);
      setSpells((current) => {
        const remaining = current.filter(({ id }) => id !== saved.id);
        return [...remaining, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setFeedback({ kind: "success", message: addToSpellbook ? `${saved.name} was saved and added to the Spellbook.` : `${saved.name} was saved.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Spell could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!savedSpellId) return;
    setSaving(true);
    try {
      const saved = await duplicateCharacterSpell(aggregate.character.id, savedSpellId);
      setSpells((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setSavedSpellId(saved.id);
      setDocument(saved.document);
      setFeedback({ kind: "success", message: `${saved.name} was created.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Spell could not be duplicated." });
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!savedSpellId) return;
    const removing = savedSpellId;
    setSaving(true);
    try {
      await deleteCharacterSpell(aggregate.character.id, removing);
      setSpells((current) => current.filter(({ id }) => id !== removing));
      newSpell();
      setFeedback({ kind: "success", message: "The saved Spell was deleted." });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Spell could not be deleted." });
    } finally { setSaving(false); }
  }

  return <main className="magic-page">
    <header className="magic-header">
      <Link href="/realms" className="font-evanescent magic-logo">SERRIAN<br />TIDE</Link>
      <div><p>THE REALMS / MAGIC CALCULATOR</p><h1 className="font-portcullion">{aggregate.character.name}</h1><span>{aggregate.campaign.name}</span></div>
      <nav><Link href={`/realms/characters/${aggregate.character.id}`}>Character Sheet</Link><Link href={`/realms/characters/${aggregate.character.id}/spellbook`}>Spellbook</Link></nav>
    </header>

    <section className="magic-mana-strip">{manaProfiles.length ? manaProfiles.map((profile) => <div key={profile.system}><span>{profile.system}</span><strong>{profile.manaPool} Mana</strong><small>{profile.spellAccessLevel ?? "Below Apprentice"}</small></div>) : <p>This Character has not unlocked a magic system yet. You may construct drafts, but Spellbook access requires a valid casting system.</p>}</section>

    {feedback ? <p className={`magic-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <div className="magic-workspace">
      <aside className="magic-library">
        <header><div><p>PERSONAL ARCHIVE</p><h2>Saved Spells</h2></div><button type="button" onClick={newSpell}>New Spell</button></header>
        <div>{spells.map((spell) => <button type="button" key={spell.id} className={savedSpellId === spell.id ? "is-selected" : ""} onClick={() => openSpell(spell)}><strong>{spell.name}</strong><span>{spell.tradition}{spell.inSpellbook ? " · In Spellbook" : " · Draft"}</span></button>)}{!spells.length ? <p>No personal Spell documents yet.</p> : null}</div>
      </aside>

      <section className="magic-editor">
        <header className="magic-editor-header"><div><p>{savedSpellId ? `SAVED SPELL ${savedSpellId}` : "NEW SPELL DRAFT"}</p><h2>{document.name || "Untitled Spell"}</h2></div><div><button type="button" disabled={saving} onClick={() => void persist(false)}>Save Draft</button><button className="is-primary" type="button" disabled={saving} onClick={() => void persist(true)}>Save + Spellbook</button>{savedSpellId ? <button type="button" disabled={saving} onClick={() => void duplicate()}>Duplicate</button> : null}{savedSpellId ? <button className="is-danger" type="button" disabled={saving} onClick={() => void remove()}>Delete</button> : null}</div></header>
        <div className="magic-document-fields"><label><span>Spell Name</span><input value={document.name} onChange={(event) => setDocument({ ...document, name: event.target.value, modifiedAt: new Date().toISOString() })} /></label><label><span>Casting System</span><select value={document.castingSystem ?? ""} onChange={(event) => setDocument({ ...document, castingSystem: event.target.value ? event.target.value as SpellCastingSystem : undefined, modifiedAt: new Date().toISOString() })}><option value="">Choose when required</option>{compatibleSystems.map((system) => <option key={system} value={system} disabled={!availableSystems.has(system)}>{system}{availableSystems.has(system) ? "" : " · Not unlocked"}</option>)}</select></label></div>
        <SpellConstructionEditor document={document} onChange={setDocument} findFrameworkSkills={findFrameworkSkills} />
      </section>
    </div>
  </main>;
}
