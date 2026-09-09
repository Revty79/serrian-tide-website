"use client";
import { useRef, useState } from "react";
import { getEncounterCreatureCatalog, spawnEncounterCreatures } from "@/app/heavens/tabletop/runtime-integration-actions";
import type { CreatureCatalogEntry, SpawnEncounterCreaturesInput } from "@/features/tabletop-operations/creature-spawn-service";
import { getEncounterInitiativeRuntime } from "@/app/heavens/tabletop/initiative-actions";
import styles from "./combat-screen.module.css";

export function CreaturePicker({ encounterId, initialized = false, disabled = false, onAdded }: {
  encounterId: number; initialized?: boolean; disabled?: boolean; onAdded: () => void | Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CreatureCatalogEntry[] | null>(null);
  const [search, setSearch] = useState(""), [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState("1"), [movement, setMovement] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [activeInitiative, setActiveInitiative] = useState(initialized);
  const pending = useRef<SpawnEncounterCreaturesInput | null>(null), running = useRef(false);
  const creature = catalog?.find((entry) => String(entry.id) === selected);
  async function load() {
    if (catalog || running.current) return;
    running.current = true; setBusy(true);
    try { const values = await getEncounterCreatureCatalog(encounterId); const runtime = await getEncounterInitiativeRuntime(encounterId); setActiveInitiative(runtime?.runtime.status === "active"); setCatalog(values); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The Creature catalog could not be loaded."); }
    finally { running.current = false; setBusy(false); }
  }
  return <details onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
    <summary>Add Creatures</summary>
    <p className={styles.muted}>Choose a Creature and quantity for this Encounter. Each copy keeps its own HP, actions, and history.</p>
    {!catalog ? <button type="button" className="st-button" disabled={busy} onClick={() => void load()}>{busy ? "Loading Creatures…" : "Load Creature catalog"}</button> : <form onSubmit={async (event) => {
      event.preventDefault(); if (running.current || disabled || !creature) return;
      const values = { creatureId: creature.id, quantity: Number(quantity), joinInitiative: initialized || activeInitiative,
        ...(initialized || activeInitiative ? { movementMode: movement || creature.movementModes[0] } : {}) };
      // Keep the exact request after an uncertain response. Editing the form
      // deliberately starts a different request; live refresh never does.
      if (!pending.current) pending.current = { ...values, requestKey: crypto.randomUUID() };
      running.current = true; setBusy(true); setMessage("");
      try { const result = await spawnEncounterCreatures(encounterId, pending.current);
        pending.current = null; setMessage(`${result.created.length} ${result.templateName} added to this Encounter.`); await onAdded(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Arrival was not confirmed. Retry keeps the same request."); }
      finally { running.current = false; setBusy(false); }
    }}><div className={styles.fields}>
      <label className="st-field">Find a Creature<input className="st-control" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="st-field">Creature<select className="st-control" required value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setMovement(""); pending.current = null; }}>
        <option value="">Choose a Creature</option>{catalog.filter((entry) => String(entry.id) === selected || `${entry.name} ${entry.family} ${entry.creatureType}`.toLowerCase().includes(search.toLowerCase())).map((entry) => <option value={entry.id} key={entry.id}>{entry.name} · {entry.size}</option>)}
      </select></label>
      <label className="st-field">Quantity<input className="st-control" type="number" required min="1" max="50" step="1" value={quantity} disabled={busy} onChange={(event) => { setQuantity(event.target.value); pending.current = null; }} /></label>
      {(initialized || activeInitiative) && creature ? <label className="st-field">Arrival movement<select className="st-control" value={movement || creature.movementModes[0] || ""} disabled={busy} onChange={(event) => { setMovement(event.target.value); pending.current = null; }}>{creature.movementModes.map((mode) => <option key={mode}>{mode}</option>)}</select></label> : null}
    </div><button className="st-button" disabled={disabled || busy || !creature || ((initialized || activeInitiative) && !creature.movementModes.length)}>{busy ? "Adding…" : "Add Creatures to Encounter"}</button>
    {initialized || activeInitiative ? <p className={styles.muted}>Arrivals join the ongoing Initiative using the existing late-entry rules.</p> : null}
    </form>}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
