"use client";
import { useEffect, useRef, useState } from "react";
import type { MagazineCommand, MagazineInventoryView } from "@/features/items/magazine-inventory-service";
import { handleMagazine, readMagazineInventory } from "./magazine-actions";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";
import "./magazine-panel.css";

export function MagazinePanel({ characterId, disabled = false, onChange }: { characterId: number; disabled?: boolean; onChange?: () => void | Promise<void> }) {
  const preserveScroll = useInPlaceScrollPreservation();
  const [view, setView] = useState<MagazineInventoryView | null>(null), [message, setMessage] = useState("");
  const [selection, setSelection] = useState<Record<number, string>>({}), [amounts, setAmounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false), running = useRef(false), retry = useRef<MagazineCommand | null>(null);
  useEffect(() => { let active = true; void readMagazineInventory(characterId).then((state) => { if (active) setView(state); }).catch((error) => { if (active) setMessage(error.message); }); return () => { active = false; }; }, [characterId, disabled]);
  async function refresh() {
    try { setView(await readMagazineInventory(characterId)); } catch (error) { setMessage(error instanceof Error ? error.message : "Magazine inventory could not be refreshed."); }
  }
  async function run(entry: MagazineInventoryView["magazines"][number], operation: MagazineCommand["operation"]) {
    if (running.current) return; running.current = true; setBusy(true); setMessage("");
    const command = { characterId, instanceId: entry.instanceId, operation, ammunitionItemId: operation === "empty" ? entry.ammunitionItemId : Number(entry.ammunitionItemId ?? selection[entry.instanceId] ?? entry.ammunition[0]?.id) || null,
      rounds: operation === "add" ? Number(amounts[entry.instanceId] ?? "1") : null, expectedRounds: entry.loadedRounds, expectedAmmunitionItemId: entry.ammunitionItemId };
    const { requestKey: priorKey, ...prior } = retry.current ?? { requestKey: "" };
    const request = { ...command, requestKey: JSON.stringify(prior) === JSON.stringify(command) ? priorKey : crypto.randomUUID() };
    retry.current = request;
    try { setView(await handleMagazine(request)); retry.current = null; await onChange?.(); setMessage(operation === "empty" ? "Magazine emptied; its rounds are back in loose inventory." : "Ammunition transferred into the selected magazine."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The operation could not be confirmed. Retry or refresh its contents."); }
    finally { running.current = false; setBusy(false); }
  }
  return <section className="magazine-panel" aria-label="Magazine inventory">
    <h3>Magazines</h3><p>Prepare individual magazines here outside combat. In combat, use ammunition preparation to swap a magazine or Item → Fill magazine to load a detached copy with Initiative.</p>
    <button type="button" className="st-button" disabled={busy} onClick={() => void preserveScroll(refresh)}>Refresh magazines</button>
    {message ? <p role="status">{message}</p> : null}
    {view?.combatActive ? <p role="status">Magazine filling and emptying are unavailable during active combat.</p> : null}
    {view && !view.magazines.length ? <p>No magazine copies owned. Acquire a campaign-authorized magazine from the store or a Shop.</p> : null}
    {view?.magazines.map((entry) => { const blocked = disabled || busy || !view.canManage || view.combatActive || !!entry.attachedWeaponInstanceId; return <fieldset key={entry.instanceId}>
      <legend>{entry.name} · Copy #{entry.instanceId}</legend><p><strong>{entry.loadedRounds} / {entry.capacity} rounds</strong> · {entry.ammunition.find((ammo) => ammo.id === entry.ammunitionItemId)?.name ?? "Empty"}</p>
      {entry.attachedWeaponInstanceId ? <p>Attached to firearm copy #{entry.attachedWeaponInstanceId}. Remove it before filling or emptying this copy.</p> : null}
      <label className="st-field">Ammunition<select className="st-control" aria-label={`Ammunition for copy ${entry.instanceId}`} disabled={blocked || entry.loadedRounds > 0} value={entry.ammunitionItemId ?? selection[entry.instanceId] ?? entry.ammunition[0]?.id ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [entry.instanceId]: event.target.value }))}>
        {!entry.ammunition.length ? <option value="">No compatible ammunition</option> : null}{entry.ammunition.map((ammo) => <option key={ammo.id} value={ammo.id} disabled={ammo.archived}>{ammo.name} · {ammo.quantity} loose{ammo.archived ? " (archived)" : ""}</option>)}
      </select></label>
      <label className="st-field">Rounds to add<input className="st-control" aria-label={`Rounds for copy ${entry.instanceId}`} type="number" min={1} step={1} disabled={blocked} value={amounts[entry.instanceId] ?? "1"} onChange={(event) => setAmounts((current) => ({ ...current, [entry.instanceId]: event.target.value }))} /></label>
      <button type="button" className="st-button is-primary" disabled={blocked || entry.archived || entry.loadedRounds >= entry.capacity} onClick={() => void preserveScroll(() => run(entry, "add"))}>Add rounds</button>{" "}
      <button type="button" className="st-button" disabled={blocked || entry.archived || entry.loadedRounds >= entry.capacity} onClick={() => void preserveScroll(() => run(entry, "fill"))}>Fill to capacity</button>{" "}
      <button type="button" className="st-button" disabled={blocked || entry.loadedRounds === 0} onClick={() => void preserveScroll(() => run(entry, "empty"))}>Empty magazine</button>
    </fieldset>; })}
  </section>;
}
