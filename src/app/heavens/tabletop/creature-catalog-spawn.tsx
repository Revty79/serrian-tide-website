"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { CreatureCatalogEntry } from "@/features/tabletop-operations/creature-spawn-service";

import {
  getEncounterCreatureCatalog,
  spawnEncounterCreatures,
} from "./runtime-integration-actions";

export function CreatureCatalogSpawn({
  encounterId,
  initiativeActive,
  onFeedback,
}: {
  encounterId: number;
  initiativeActive: boolean;
  onFeedback: (feedback: { kind: "success" | "error"; message: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CreatureCatalogEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [joinInitiative, setJoinInitiative] = useState(false);
  const [movementMode, setMovementMode] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = catalog?.find(({ id }) => id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (catalog ?? []).filter((entry) => !query || [entry.name, entry.size, entry.family, entry.creatureType]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [catalog, search]);

  async function showCatalog(): Promise<void> {
    setOpen((value) => !value);
    if (catalog) return;
    setBusy(true);
    try {
      const entries = await getEncounterCreatureCatalog(encounterId);
      setCatalog(entries);
      setSelectedId(entries[0]?.id ?? null);
    } catch (error) {
      onFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature Catalog could not be loaded." });
    } finally {
      setBusy(false);
    }
  }

  async function spawn(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await spawnEncounterCreatures(encounterId, {
        creatureId: selected.id,
        quantity,
        joinInitiative,
        movementMode: movementMode || undefined,
      });
      onFeedback({
        kind: "success",
        message: `${result.created.map(({ name }) => name).join(", ")} added directly to the Encounter${joinInitiative ? " and joined Initiative" : ""}. No Character, NPC, or roster record was created.`,
      });
      setQuantity(1);
      setJoinInitiative(false);
      router.refresh();
    } catch (error) {
      onFeedback({ kind: "error", message: error instanceof Error ? error.message : "Creature spawning failed." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="tabletop-creature-catalog">
    <header>
      <div><span>CREATURES</span><h6 className="font-sans">Add encounter-scoped Creatures</h6></div>
      <button type="button" disabled={busy} onClick={() => void showCatalog()}>{open ? "Close Catalog" : "Add from Creature Catalog"}</button>
    </header>
    {open ? <div className="tabletop-creature-catalog-body">
      <label><span>Search master Creatures</span><input type="search" value={search} placeholder="Name, size, family, or type" onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="tabletop-creature-catalog-grid">
        <div className="tabletop-creature-catalog-list">
          {filtered.map((entry) => <button key={entry.id} type="button" className={selectedId === entry.id ? "is-selected" : ""} onClick={() => {
            setSelectedId(entry.id);
            setMovementMode(entry.movementModes.length === 1 ? entry.movementModes[0]! : "");
          }}>
            <strong>{entry.name}</strong>
            <span>{entry.size || "Size unconfigured"} · {entry.creatureType || entry.family || "Type unconfigured"}</span>
            <small>Challenge Rating {entry.challengeRating ?? "—"}</small>
          </button>)}
          {catalog && !filtered.length ? <p className="tabletop-empty">No master Creatures match that search.</p> : null}
          {!catalog ? <p className="tabletop-empty">Loading Creature Catalog…</p> : null}
        </div>
        {selected ? <div className="tabletop-creature-spawn-form">
          <div><span>Selected Creature</span><strong>{selected.name}</strong><small>{selected.size} · {selected.family || selected.creatureType || "Unclassified"}</small></div>
          <label><span>Quantity</span><input type="number" min={1} max={50} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          {initiativeActive ? <label className="tabletop-creature-join"><input type="checkbox" checked={joinInitiative} onChange={(event) => setJoinInitiative(event.target.checked)} /><span>Join Initiative now</span></label> : <p>Initiative is not active. Spawned Creatures will be available to enroll later.</p>}
          {joinInitiative && selected.movementModes.length > 1 ? <label><span>Movement mode</span><select value={movementMode} onChange={(event) => setMovementMode(event.target.value)}><option value="">Choose a mode</option>{selected.movementModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label> : null}
          {joinInitiative && selected.movementModes.length === 1 ? <p>Initiative capacity will use {selected.movementModes[0]}.</p> : null}
          <button type="button" className="is-primary" disabled={busy || quantity < 1 || quantity > 50 || (joinInitiative && selected.movementModes.length > 1 && !movementMode)} onClick={() => void spawn()}>{busy ? "Adding…" : `Add ${quantity} to Encounter`}</button>
          <small>Each copy is an independent encounter participant referencing the same canonical Creature. It does not enter the Campaign roster.</small>
        </div> : null}
      </div>
    </div> : null}
  </section>;
}
