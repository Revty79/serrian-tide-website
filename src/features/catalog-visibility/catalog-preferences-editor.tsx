"use client";

import { useRef, useState } from "react";
import { updateCurrentCatalogPreference } from "./actions";
import { CATALOG_KEYS, type CatalogKey, type CatalogPreferences, type CatalogVisibilityMode } from "./catalog-visibility";
import { CatalogVisibilityControl } from "./catalog-visibility-control";

const labels: Record<CatalogKey, string> = {
  race: "Races", creature: "Creatures", skill: "Skills", derivedAbility: "Derived Abilities", equipment: "Equipment", inventory: "Inventory",
};

function CatalogPreferenceRow({ catalog, initialMode }: { catalog: CatalogKey; initialMode: CatalogVisibilityMode }) {
  const [mode, setMode] = useState(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const saving = useRef(false);

  async function save(nextMode: CatalogVisibilityMode) {
    if (saving.current || nextMode === mode) return;
    const previousMode = mode;
    saving.current = true;
    setPending(true);
    setError("");
    setStatus("");
    setMode(nextMode);
    try {
      const saved = await updateCurrentCatalogPreference({ catalog, mode: nextMode });
      // Other rows may have changed while this action was running. Read only this catalog.
      setMode(saved[catalog]);
      setStatus("Saved.");
    } catch {
      setMode(previousMode);
      setError(`Couldn’t save ${labels[catalog]}. Your previous choice is still selected. Please try again.`);
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return <CatalogVisibilityControl catalog={catalog} label={labels[catalog]} mode={mode} onChange={(next) => void save(next)} pending={pending} status={status} error={error} />;
}

export function CatalogPreferencesEditor({ initialPreferences }: { initialPreferences: CatalogPreferences }) {
  return <div className="grid gap-4">
    {CATALOG_KEYS.map((catalog) => <CatalogPreferenceRow key={catalog} catalog={catalog} initialMode={initialPreferences[catalog]} />)}
  </div>;
}
