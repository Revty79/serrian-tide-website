"use client";

import { useRef, useState } from "react";
import { updateCurrentCatalogPreference } from "./actions";
import { CATALOG_KEYS, type CatalogKey, type CatalogPreferences, type CatalogVisibilityMode } from "./catalog-visibility";
import { CatalogVisibilityControl } from "./catalog-visibility-control";

const labels: Record<CatalogKey, string> = {
  race: "Races", creature: "Creatures", skill: "Skills", derivedAbility: "Derived Abilities", equipment: "Equipment", inventory: "Inventory",
};

export function CatalogPreferenceRow({ catalog, initialMode, description, onSaved }: {
  catalog: CatalogKey; initialMode: CatalogVisibilityMode; description?: string; onSaved?: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [lastInitialMode, setLastInitialMode] = useState(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const saving = useRef(false);
  if (lastInitialMode !== initialMode) {
    setLastInitialMode(initialMode);
    setMode(initialMode);
  }

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
      return;
    } finally {
      saving.current = false;
      setPending(false);
    }
    try {
      await onSaved?.();
    } catch {
      setError("Your choice was saved, but the catalog could not refresh. Please reload the page.");
    }
  }

  return <CatalogVisibilityControl catalog={catalog} label={labels[catalog]} description={description} mode={mode} onChange={(next) => { if (next !== "all") void save(next); }} pending={pending} status={status} error={error} />;
}

export function CatalogPreferencesEditor({ initialPreferences }: { initialPreferences: CatalogPreferences }) {
  return <div className="grid gap-4">
    {CATALOG_KEYS.map((catalog) => <CatalogPreferenceRow key={catalog} catalog={catalog} initialMode={initialPreferences[catalog]} />)}
  </div>;
}
