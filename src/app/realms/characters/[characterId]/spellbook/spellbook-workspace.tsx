"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  duplicateCharacterSpell,
  setCharacterSpellbookStatus,
  type CharacterSavedSpell,
} from "@/app/characters/spell-actions";
import type { CharacterAggregate } from "@/features/characters/models";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { validateSpell } from "@/features/spell-construction/engine/validateSpell";

export function SpellbookWorkspace({
  aggregate,
  initialSpells,
}: {
  aggregate: CharacterAggregate;
  initialSpells: CharacterSavedSpell[];
}) {
  const [spells, setSpells] = useState(initialSpells);
  const [showDrafts, setShowDrafts] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const visible = useMemo(
    () => spells.filter((spell) => showDrafts || spell.inSpellbook),
    [showDrafts, spells],
  );

  async function toggle(spell: CharacterSavedSpell) {
    setBusyId(spell.id);
    setFeedback(null);
    try {
      const saved = await setCharacterSpellbookStatus(aggregate.character.id, spell.id, !spell.inSpellbook);
      setSpells((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Spellbook status could not be changed." });
    } finally { setBusyId(null); }
  }

  async function duplicate(spell: CharacterSavedSpell) {
    setBusyId(spell.id);
    setFeedback(null);
    try {
      const saved = await duplicateCharacterSpell(aggregate.character.id, spell.id);
      setSpells((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setFeedback({ kind: "success", message: `${saved.name} was copied into personal drafts.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Spell could not be duplicated." });
    } finally { setBusyId(null); }
  }

  return <main className="spellbook-page">
    <header className="spellbook-header">
      <Link href="/realms" className="font-evanescent spellbook-logo">SERRIAN<br />TIDE</Link>
      <div><p>THE REALMS / SPELLBOOK</p><h1 className="font-portcullion">{aggregate.character.name}</h1><span>{aggregate.campaign.name}</span></div>
      <nav><Link href={`/realms/characters/${aggregate.character.id}`}>Character Sheet</Link><Link href={`/realms/characters/${aggregate.character.id}/magic`}>Magic Calculator</Link></nav>
    </header>

    <section className="spellbook-toolbar"><div><p>PERSONAL MAGIC</p><h2 className="font-portcullion">Spellbook</h2></div><label><input type="checkbox" checked={showDrafts} onChange={(event) => setShowDrafts(event.target.checked)} /><span>Show saved drafts too</span></label></section>
    {feedback ? <p className={`spellbook-feedback is-${feedback.kind}`}>{feedback.message}</p> : null}

    <section className="spellbook-grid">{visible.map((spell) => {
      const calculation = calculateSpell(spell.document);
      const validation = validateSpell(spell.document, undefined, calculation);
      const framework = spell.document.sphere || spell.document.discipline || spell.document.resonance || "Framework not selected";
      return <article key={spell.id} className={spell.inSpellbook ? "is-in-book" : "is-draft"}><header><div><p>{spell.document.castingSystem ?? spell.tradition}</p><h3 className="font-portcullion">{spell.name}</h3><span>{framework}</span></div><strong className={`is-${validation.status.toLowerCase()}`}>{validation.status}</strong></header><div className="spellbook-facts"><div><span>Mana</span><strong>{calculation.baseSpellManaCost}</strong></div><div><span>Mastery</span><strong>{calculation.baseSpellMastery}</strong></div><div><span>Combat</span><strong>{calculation.baseCombatCastingTime} Init</strong></div><div><span>OOC</span><strong>{calculation.baseOutOfCombatCastingTimeSeconds}s</strong></div></div><p>{spell.document.description || "No description."}</p><div className="spellbook-card-actions"><Link href={`/realms/characters/${aggregate.character.id}/magic?spell=${spell.id}`}>Open in Calculator</Link><button type="button" disabled={busyId === spell.id} onClick={() => void duplicate(spell)}>Duplicate</button><button type="button" disabled={busyId === spell.id} onClick={() => void toggle(spell)}>{spell.inSpellbook ? "Remove from Spellbook" : "Add to Spellbook"}</button></div></article>;
    })}{!visible.length ? <div className="spellbook-empty"><p>NO SPELLS</p><h3>{showDrafts ? "No personal Spell documents have been saved yet." : "No Spells are currently in this Character's Spellbook."}</h3><Link href={`/realms/characters/${aggregate.character.id}/magic`}>Open Magic Calculator →</Link></div> : null}</section>
  </main>;
}
