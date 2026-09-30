"use client";
import { startTransition, useEffect, useRef, useState } from "react";
import { readSavedSpecialAbilityMechanics } from "./read-actions";
import type { CharacterSpecialAbilityView } from "./character-models";
import { CharacterSpecialAbilityReference } from "./character-reference";

function Inspector({ characterId }: { characterId: number }) {
  const [view, setView] = useState<CharacterSpecialAbilityView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true), request = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function load() {
    const current = ++request.current;
    setLoading(true); setError("");
    startTransition(async () => { try {
      const next = await readSavedSpecialAbilityMechanics(characterId);
      if (mounted.current && request.current === current) setView(next);
    } catch {
      if (mounted.current && request.current === current) { setView(null); setError("This Character's saved Special Ability information is unavailable to you. Refresh after access or connection is restored."); }
    } finally { if (mounted.current && request.current === current) setLoading(false); } });
  }
  return <details className="special-ability-reference" onToggle={event => { if (event.target === event.currentTarget && event.currentTarget.open && !view && !loading) void load(); }}>
    <summary>Inspect Special Ability mechanics</summary>
    <p>Read-only saved Character reference. Available during Freeze; it grants no action or mutation authority.</p>
    <button className="st-button" type="button" disabled={loading} onClick={() => void load()}>Refresh saved reference</button>
    {loading && <p role="status">Loading saved definitions…</p>}
    {error && <p role="alert">{error}</p>}
    {view && <CharacterSpecialAbilityReference view={view} />}
  </details>;
}
/** A new Character gets fresh state immediately; late responses cannot expose the
 * previous selection's information. Fetch only when inspection is opened. */
export function SavedSpecialAbilityInspector({ characterId }: { characterId: number }) {
  return <Inspector key={characterId} characterId={characterId} />;
}
